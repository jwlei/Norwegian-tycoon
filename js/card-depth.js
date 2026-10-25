"use strict";

// Native SVG card depth: a 2.5px laminated edge, support-aware resting poses, and top-left light shadows.
class CardDepth {
    // Shadow tuning.
    // Below this blur radius a filter is indistinguishable from the anti-aliased edge.
    static SHARP_BLUR = 1.25;
    // Tables with more cards than this keep full shadows only on their top DETAILED_CARDS cards.
    static SIMPLIFY_FROM = 12;
    static DETAILED_CARDS = 8;
    static shadowStyle = "fancy";

    static states = new WeakMap();
    static scenes = new WeakMap();
    static flightByTarget = new WeakMap();
    static followers = new Map();
    static anchored = new Set();
    static frame = null;
    static tickCount = 0;
    static nextId = 0;
    static warned = false;
    static listeningForScroll = false;
    static artworkMetadata = new Map();
    static supersampledArtwork = new Map();
    static FLOOR = "floor";
    static paper = ["#dedbc7", "#bdbea9", "#e7e2cf", "#c5c5b1", "#dedbc7", "#b5bba4", "#e7e2cf"];

    static setShadowStyle(style) {
        if (style !== "fancy" && style !== "simple") { throw new RangeError("Unknown card shadow style."); }
        if (this.shadowStyle === style) { return; }
        this.shadowStyle = style;
        document.querySelectorAll(".has-card-depth").forEach(element => this.update(element, {}));
    }

    static paperColors(rect) {
        const color = rect.getAttribute("stroke");
        if (!/^#[0-9a-f]{6}$/i.test(color || "")) { return this.paper; }
        const channels = color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
        return [.92, .78, 1, .85, .92, .75, 1].map(shade => "#" + channels.map(channel =>
            Math.round(channel * shade).toString(16).padStart(2, "0")).join(""));
    }

    static warn(error) {
        if (!this.warned) {
            console.warn("3D card rendering unavailable; using the original card image.", error);
            this.warned = true;
        }
    }

    static node(tag, attributes, parent) {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [key, value] of Object.entries(attributes)) { element.setAttribute(key, String(value)); }
        if (parent) { parent.appendChild(element); }
        return element;
    }

    static path(points, origin) {
        return points.length ? points.map((point, index) =>
            `${index ? "L" : "M"}${(point.x - origin.x).toFixed(3)},${(point.y - origin.y).toFixed(3)}`
        ).join("") + "Z" : "";
    }

    static metadata(source) {
        let metadata = this.artworkMetadata.get(source);
        if (!metadata) {
            const document = new DOMParser().parseFromString(
                decodeURIComponent(source.slice(source.indexOf(",") + 1)), "image/svg+xml");
            const rect = document.querySelector("svg > rect");
            if (!rect) { throw new Error("The card SVG has no outer rectangle."); }
            const radius = Number(rect.getAttribute("rx") || 0);
            metadata = { radius: radius ? radius + .75 : 0, colors: this.paperColors(rect) };
            if (this.artworkMetadata.size >= 128) {
                this.artworkMetadata.delete(this.artworkMetadata.keys().next().value);
            }
            this.artworkMetadata.set(source, metadata);
        }
        return metadata;
    }

    static useSupersampling() {
        return typeof window !== "undefined" &&
            window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
            !window.matchMedia("(any-pointer: coarse)").matches;
    }

    static prepareSupersampling(state, source) {
        if (!this.useSupersampling()) { return; }
        let pending = this.supersampledArtwork.get(source);
        if (!pending) {
            const image = new Image();
            image.src = source;
            pending = image.decode().then(() => image);
            if (this.supersampledArtwork.size >= 64) {
                this.supersampledArtwork.delete(this.supersampledArtwork.keys().next().value);
            }
            this.supersampledArtwork.set(source, pending);
        }
        pending.then(image => {
            if (this.states.get(state.element) !== state || !state.element.isConnected) { return; }
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) { throw new Error("Canvas 2D is unavailable."); }
            const raster = this.node("foreignObject", { class: "card-depth-face", "pointer-events": "none" });
            raster.appendChild(canvas);
            state.svg.insertBefore(raster, state.receiverShadows);
            state.raster = { canvas, context, element: raster, image };
            if (state.world) {
                state.key = null;
                this.update(state.element, {});
            }
        }).catch(error => {
            console.warn("2x card supersampling unavailable; retaining native SVG rendering.", error);
            if (state.raster) {
                state.raster.element.remove();
                delete state.raster;
                state.faceGroup.style.display = "";
            }
        });
    }

    static renderSupersampledFace(state) {
        if (!state.raster) { return; }
        const G = LandingGeometry, world = state.world;
        const { canvas, context: ctx, element, image } = state.raster;
        const top = G.silhouette(world), normal = G.rotate(0, 0, 1, world);
        const outlines = state.layers.map((layer, index) => {
            const depth = G.EDGE * (1 - index / (state.layers.length - 1));
            return top.map(point => {
                const projected = G.screen({ x: point.x - normal.x * depth,
                    y: point.y - normal.y * depth, z: point.z - normal.z * depth });
                return { x: projected.x - world.x, y: projected.y - world.y };
            });
        });
        const points = outlines.flat();
        const left = Math.floor(Math.min(...points.map(p => p.x))) - 2;
        const upper = Math.floor(Math.min(...points.map(p => p.y))) - 2;
        const width = Math.ceil(Math.max(...points.map(p => p.x))) + 2 - left;
        const height = Math.ceil(Math.max(...points.map(p => p.y))) + 2 - upper;
        // Twice the display pixel density in each axis, including on Retina desktops.
        const scale = 2 * (window.devicePixelRatio || 1);
        const pixelsWide = Math.ceil(width * scale), pixelsHigh = Math.ceil(height * scale);
        if (canvas.width !== pixelsWide) { canvas.width = pixelsWide; }
        if (canvas.height !== pixelsHigh) { canvas.height = pixelsHigh; }
        Object.assign(canvas.style, { width: "100%", height: "100%", display: "block" });
        for (const [key, value] of Object.entries({ x: left, y: upper, width, height })) {
            element.setAttribute(key, value);
        }
        ctx.resetTransform();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height,
            -left * canvas.width / width, -upper * canvas.height / height);
        outlines.forEach((outline, index) => {
            ctx.beginPath();
            outline.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
            ctx.closePath();
            ctx.fillStyle = state.layers[index].getAttribute("fill");
            ctx.fill();
        });
        const a = G.screen(G.rotate(1, 0, 0, world)), b = G.screen(G.rotate(0, 1, 0, world));
        ctx.save();
        ctx.transform(a.x, a.y, b.x, b.y, 0, -G.VIEW_SHEAR * world.z);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, -world.width / 2, -world.height / 2, world.width, world.height);
        ctx.restore();
        // Match the SVG's object-bounding-box lighting gradient on the top outline.
        const outline = outlines[outlines.length - 1];
        ctx.beginPath();
        outline.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.closePath();
        const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
        ctx.save();
        ctx.clip();
        ctx.translate(Math.min(...xs), Math.min(...ys));
        ctx.scale(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        const gradient = ctx.createLinearGradient(0, 0, 1, 1);
        gradient.addColorStop(0, "rgba(255,255,255,0.13)");
        gradient.addColorStop(1, "rgba(11,33,18,0.039)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 1);
        ctx.restore();
        state.faceGroup.style.display = "none";
    }

    static attach(element, render = true, synchronizeFoil = true) {
        if (this.states.has(element)) { return; }
        const image = element.querySelector("img");
        if (!image) { return; }
        const inherited = element.querySelector(".card-depth-svg");
        if (inherited) { inherited.remove(); }
        element.classList.remove("has-card-depth");
        try {
            const metadata = this.metadata(image.src);
            const id = `card-depth-${this.nextId++}`;
            const svg = this.node("svg", { class: "card-depth-svg", "aria-hidden": "true", focusable: "false" });
            const defs = this.node("defs", {}, svg);
            const freeShadow = this.node("g", {}, svg);
            const faceGroup = this.node("g", { class: "card-depth-face" }, svg);
            const layers = metadata.colors.map(fill => this.node("path", { fill }, faceGroup));
            const face = this.node("image", { href: image.src }, faceGroup);
            const gradient = this.node("linearGradient", { id: `${id}-light`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
            this.node("stop", { offset: 0, "stop-color": "#fff" }, gradient);
            this.node("stop", { offset: 1, "stop-color": "#0b2112", "stop-opacity": .3 }, gradient);
            const light = this.node("path", { fill: `url(#${id}-light)`, opacity: .13 }, faceGroup);
            const clip = this.node("clipPath", { id: `${id}-clip`, clipPathUnits: "userSpaceOnUse" }, defs);
            const outline = this.node("path", {}, clip);
            const receiverShadows = this.node("g", { "clip-path": `url(#${id}-clip)` }, svg);
            const state = { element, svg, defs, freeShadow, faceGroup, layers, face, light, outline, receiverShadows, id,
                radius: metadata.radius, pose: { pitch: 0, yaw: 0, roll: 0, lift: 18 },
                receiverStates: [], shadowEntries: new Map(), nextShadow: 0, hidden: element.style.opacity === "0" };
            this.states.set(element, state);
            element.appendChild(svg);
            element.classList.add("has-card-depth");
            if (synchronizeFoil) { this.syncFoilPhase([element]); }
            if (render) { this.update(element, state.pose); }
            this.prepareSupersampling(state, image.src);
        } catch (error) {
            this.warn(error);
            this.detach(element);
        }
    }

    static isFoilIdleAnimation(animation) {
        return animation.animationName === "foil-idle-color" || animation.animationName === "foil-idle-glare";
    }

    static syncFoilPhase(elements) {
        if (!document.timeline) { return; }
        // Collect every animation before changing clocks, avoiding a style flush per card.
        const animations = elements.flatMap(element => typeof element.getAnimations === "function"
            ? element.getAnimations({ subtree: true }).filter(animation => CardDepth.isFoilIdleAnimation(animation)) : []);
        const phase = (document.timeline.currentTime || 0) % 6000;
        animations.forEach(animation => { animation.currentTime = phase; });
    }

    static observeFoils(root) {
        if (typeof IntersectionObserver === "undefined") { return; }
        const elements = root.querySelectorAll('[data-foil]:not([data-foil="none"])');
        if (!elements.length) { return; }
        if (!root._foilObserver) { this.createFoilObserver(root); }
        elements.forEach(element => {
            if (!root._observedFoils.has(element)) {
                root._observedFoils.add(element);
                root._foilObserver.observe(element);
            }
        });
    }

    static createFoilObserver(root) {
        const paused = new WeakMap();
        const observer = new IntersectionObserver(entries => {
            const updates = [];
            const now = document.timeline && typeof document.timeline.currentTime === "number"
                ? document.timeline.currentTime : performance.now();
            for (const entry of entries) {
                const element = entry.target;
                if (entry.isIntersecting) {
                    const saved = paused.get(element);
                    if (saved) { updates.push({ element, saved, visible: true }); }
                } else if (!paused.has(element)) {
                    const animations = typeof element.getAnimations === "function"
                        ? element.getAnimations({ subtree: true }).filter(animation =>
                            CardDepth.isFoilIdleAnimation(animation)) : [];
                    updates.push({ element, visible: false, saved: { time: now,
                        animations: animations.map(animation => ({ animation, time: animation.currentTime,
                            running: animation.playState === "running" })) } });
                }
            }
            for (const { element, saved, visible } of updates) {
                element.classList.toggle("is-foil-offscreen", !visible);
                if (visible) {
                    const elapsed = now - saved.time;
                    saved.animations.forEach(({ animation, time, running }) => {
                        if (running && typeof time === "number") { animation.currentTime = time + elapsed; }
                    });
                    paused.delete(element);
                } else {
                    paused.set(element, saved);
                }
            }
        }, { rootMargin: "128px" });
        root._foilObserver = observer;
        root._observedFoils = new WeakSet();
    }

    static stopObservingFoils(root) {
        if (!root._foilObserver) { return; }
        root._foilObserver.disconnect();
        delete root._foilObserver;
        delete root._observedFoils;
    }

    static dimensions(element) {
        return { width: parseFloat(element.style.width) || element.offsetWidth,
            height: parseFloat(element.style.height) || element.offsetHeight };
    }

    static update(element, pose) {
        const state = this.states.get(element);
        if (!state) { return; }
        state.pose = this.resolvePose(state.pose, pose);
        const world = this.worldPose(state);
        if (!world) { return; }
        const previous = state.world;
        state.world = previous && Object.keys(world).every(key => world[key] === previous[key]) ? previous : world;
        state.placed = this.placedPose(state, state.world);
        const key = this.renderKey(state);
        if (state.key === key) { return; }
        state.key = key;
        this.renderCard(state);
        this.renderShadows(state);
    }

    // A lift-only update releases any exact height set by an earlier landing pose.
    static resolvePose(current, pose) {
        const next = { ...current, ...pose };
        if (pose.z === undefined && pose.lift !== undefined) { delete next.z; }
        return next;
    }

    static worldPose(state) {
        const { width, height } = state.size || this.dimensions(state.element);
        if (!width || !height) { return null; }
        const local = { ...state.pose, width, height, radius: state.radius, x: 0, y: 0, z: 0 };
        const z = state.pose.z ?? LandingGeometry.minimumHeight([], local) + (state.pose.lift ?? 0);
        return { ...local, x: state.pose.x || 0, y: state.pose.y || 0, z };
    }

    // Table-space pose. Flights planned before a table refresh are shifted with the table they target.
    static placedPose(state, world) {
        if (!state.anchor || !state.scene) { return world; }
        const dx = state.scene.origin.x - state.anchor.x, dy = state.scene.origin.y - state.anchor.y;
        return dx || dy ? { ...world, x: world.x + dx, y: world.y + dy } : world;
    }

    static renderKey(state) {
        const pose = state.placed;
        const parts = [pose.width, pose.height, pose.x, pose.y, pose.z, pose.pitch, pose.yaw, pose.roll,
            state.raster ? window.devicePixelRatio : 0,
            state.hidden, state.shadowless, this.shadowStyle, state.scene ? state.scene.version : 0];
        const add = other => { const p = other.placed; if (p) { parts.push(p.x, p.y, p.z, p.pitch, p.yaw, p.roll); } };
        state.receiverStates.forEach(add);
        if (state.isFlight && state.scene) { state.scene.flights.forEach(add); }
        return parts.join(":");
    }

    static renderCard(state) {
        const G = LandingGeometry, world = state.world;
        const { width, height } = world;
        const geometryKey = [width, height, world.z, world.pitch, world.yaw, world.roll,
            state.raster ? window.devicePixelRatio : 0].join(":");
        if (state.geometryKey === geometryKey) { return; }
        state.geometryKey = geometryKey;
        const size = `${width}:${height}`;
        if (state.renderedSize !== size) {
            state.renderedSize = size;
            state.svg.setAttribute("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);
            state.face.setAttribute("x", -width / 2);
            state.face.setAttribute("y", -height / 2);
            state.face.setAttribute("width", width);
            state.face.setAttribute("height", height);
        }
        // Each paper sheet is the top outline stepped back along the card normal.
        const top = G.silhouette(world), normal = G.rotate(0, 0, 1, world);
        state.layers.forEach((layer, index) => {
            const depth = G.EDGE * (1 - index / (state.layers.length - 1));
            layer.setAttribute("d", this.path(top.map(point => G.screen({ x: point.x - normal.x * depth,
                y: point.y - normal.y * depth, z: point.z - normal.z * depth })), world));
        });
        const a = G.screen(G.rotate(1, 0, 0, world)), b = G.screen(G.rotate(0, 1, 0, world));
        const transform = `matrix(${a.x}, ${a.y}, ${b.x}, ${b.y}, 0, ${-G.VIEW_SHEAR * world.z})`;
        state.face.setAttribute("transform", transform);
        const outline = this.path(top.map(G.screen), world);
        state.faceOutline = outline;
        state.light.setAttribute("d", outline);
        state.outline.setAttribute("d", outline);
        state.element.style.setProperty("--depth-face-transform", transform);
        this.renderSupersampledFace(state);
    }

    static renderShadows(state) {
        if (state.shadowStyle !== this.shadowStyle) {
            this.removeShadows(state);
            state.shadowStyle = this.shadowStyle;
        }
        if (this.shadowStyle === "simple") {
            this.renderSimpleShadow(state);
            return;
        }
        const G = LandingGeometry, caster = state.placed;
        const detailed = this.detailed(state);
        for (const receiver of [null, ...state.receiverStates]) {
            const key = receiver || this.FLOOR;
            let entry = state.shadowEntries.get(key);
            const target = receiver ? receiver.placed : null;
            // Simplified cards cast only a felt shadow; card-to-card shadows are kept for the top of the pile.
            // Moving cards skip simplified receivers too, so their per-frame work stays bounded on large tables.
            const visible = !state.hidden && !(state.shadowless && !receiver) && (!receiver || (detailed && target && !receiver.hidden &&
                (!state.isFlight || this.detailed(receiver)))) && (!target || G.shadowMayReach(caster, target)) &&
                G.shadowVisible(caster, target, this.occluders(state, receiver), receiver ? this.exposed(receiver) : null);
            if (!visible) {
                if (entry && entry.shape.style.display !== "none") { entry.shape.style.display = "none"; }
                continue;
            }
            entry = entry || this.createShadow(state, receiver);
            const shadow = G.shadow(caster, target);
            const origin = target || (state.scene ? state.scene.origin : caster);
            const path = this.path(shadow.points, origin);
            if (entry.path !== path) { entry.shape.setAttribute("d", path); entry.path = path; }
            if (entry.opacity !== shadow.opacity) {
                entry.shape.setAttribute("opacity", shadow.opacity);
                entry.opacity = shadow.opacity;
            }
            if (entry.shape.style.display !== "") { entry.shape.style.display = ""; }
            entry.blurValue = shadow.blur;
            // Simplified cards' felt shadows share the pile's single blur filter instead of one each.
            const shared = !receiver && !detailed && state.scene;
            this.moveShadow(entry, receiver ? receiver.receiverShadows : shared ? state.scene.pileFloor
                : state.scene ? state.scene.floor : state.freeShadow);
            this.setBlur(state, entry, shared ? 0 : shadow.blur);
        }
    }

    static renderSimpleShadow(state) {
        let entry = state.shadowEntries.get(this.FLOOR);
        if (state.hidden || state.shadowless) {
            if (entry) { entry.shape.style.display = "none"; }
            return;
        }
        entry = entry || this.createShadow(state, null);
        const caster = state.placed, origin = state.scene ? state.scene.origin : caster;
        const offset = 2 + Math.min(10, Math.max(0, caster.z) * .15);
        const transform = `translate(${caster.x - origin.x + offset}, ${caster.y - origin.y + offset})`;
        if (entry.path !== state.faceOutline) {
            entry.shape.setAttribute("d", state.faceOutline);
            entry.path = state.faceOutline;
        }
        if (entry.transform !== transform) {
            entry.shape.setAttribute("transform", transform);
            entry.transform = transform;
        }
        if (entry.opacity !== .22) {
            entry.shape.setAttribute("opacity", .22);
            entry.opacity = .22;
        }
        entry.shape.style.display = "";
    }

    static moveShadow(entry, host) {
        if (entry.host !== host) {
            host.appendChild(entry.shape);
            entry.host = host;
        }
    }

    // The shared blur follows the average softness of the simplified cards' felt shadows.
    static updatePileBlur(scene) {
        const blurs = [];
        for (const state of scene.states) {
            const entry = state.shadowEntries.get(this.FLOOR);
            if (entry && entry.host === scene.pileFloor && entry.shape.style.display !== "none") { blurs.push(entry.blurValue); }
        }
        if (blurs.length) {
            const blur = blurs.reduce((sum, blur) => sum + blur, 0) / blurs.length;
            if (scene.pileBlurValue !== blur) {
                scene.pileBlur.setAttribute("stdDeviation", blur);
                scene.pileBlurValue = blur;
            }
        }
    }

    // On large tables only the top cards get full shadows; the rest are mostly covered.
    static detailed(state) {
        const scene = state.scene;
        if (!scene || state.tableIndex == null || state.isFlight) { return true; }
        const count = scene.states.length;
        return count <= this.SIMPLIFY_FROM || state.tableIndex >= count - this.DETAILED_CARDS;
    }

    static tableAbove(scene, index, result = []) {
        for (let i = index; i < scene.states.length; i++) {
            const other = scene.states[i];
            if (!other.hidden && other.placed) { result.push(other.placed); }
        }
        return result;
    }

    // A table card's uncovered surface points; shared by every card casting onto it until the table changes.
    static exposed(receiver) {
        const scene = receiver.scene;
        if (!scene || receiver.tableIndex == null) { return null; }
        if (receiver.exposedVersion !== scene.version || receiver.exposedPose !== receiver.placed) {
            receiver.exposed = LandingGeometry.exposedPoints(receiver.placed, this.tableAbove(scene, receiver.tableIndex + 1));
            receiver.exposedVersion = scene.version;
            receiver.exposedPose = receiver.placed;
        }
        return receiver.exposed;
    }

    // Poses painted above `receiver` (null for the felt), which can hide the caster's shadow on it.
    static occluders(state, receiver) {
        const scene = state.scene;
        if (!scene) { return []; }
        if (!state.isFlight) { return this.tableAbove(scene, receiver ? receiver.tableIndex + 1 : 0); }
        if (receiver && receiver.isFlight) {
            return scene.flights.slice(scene.flights.indexOf(receiver) + 1).map(flight => flight.placed).filter(Boolean);
        }
        const result = this.tableAbove(scene, receiver ? receiver.tableIndex + 1 : 0);
        for (const flight of scene.flights) { if (flight.placed) { result.push(flight.placed); } }
        return result;
    }

    static createShadow(state, receiver) {
        const scene = state.scene;
        const host = receiver ? receiver.receiverShadows : scene ? scene.floor : state.freeShadow;
        const defs = receiver ? receiver.defs : scene ? scene.defs : state.defs;
        const entry = { shape: this.node("path", { fill: "#020b05" }, host), host, defs, filter: null, blur: null };
        state.shadowEntries.set(receiver || this.FLOOR, entry);
        return entry;
    }

    static setBlur(state, entry, blur) {
        const effectiveBlur = blur < this.SHARP_BLUR ? 0 : blur;
        if (entry.effectiveBlur === effectiveBlur) { return; }
        entry.effectiveBlur = effectiveBlur;
        if (blur < this.SHARP_BLUR) {
            entry.shape.removeAttribute("filter");
            return;
        }
        if (!entry.filter) {
            const id = `${state.id}-shadow-${state.nextShadow++}`;
            entry.filter = this.node("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%",
                "color-interpolation-filters": "sRGB" }, entry.defs);
            entry.blur = this.node("feGaussianBlur", {}, entry.filter);
        }
        entry.shape.setAttribute("filter", `url(#${entry.filter.id})`);
        entry.blur.setAttribute("stdDeviation", blur);
    }

    static removeShadows(state) {
        state.shadowEntries.forEach(entry => {
            entry.shape.remove();
            if (entry.filter) { entry.filter.remove(); }
        });
        state.shadowEntries.clear();
    }

    static bind(state, scene, receivers) {
        if (state.scene === scene && state.receiverStates.length === receivers.length &&
            state.receiverStates.every((receiver, index) => receiver === receivers[index])) { return; }
        this.removeShadows(state);
        state.scene = scene;
        state.receiverStates = receivers;
        state.key = null;
    }

    static setHidden(element, hidden) {
        const state = this.states.get(element);
        if (!state || state.hidden === hidden) { return; }
        state.hidden = hidden;
        if (hidden) { state.shadowEntries.forEach(entry => { entry.shape.style.display = "none"; }); }
        state.key = null;
        // Covering or revealing a table card changes which shadows beneath it can be seen.
        if (state.scene && state.tableIndex != null) { this.refreshScene(state.scene); }
        else { this.update(element, {}); }
    }

    static refreshScene(scene) {
        scene.version++;
        if (scene.pending) { return; }
        scene.pending = true;
        queueMicrotask(() => {
            scene.pending = false;
            for (const state of [...scene.states, ...scene.flights]) {
                if (this.states.get(state.element) === state) { this.update(state.element, {}); }
            }
            this.updatePileBlur(scene);
        });
    }

    static prepareTable(table) {
        table = table.querySelector(".table-card-pile") || table;
        const elements = [...table.querySelectorAll(".table-play__card")];
        if (!elements.length) { return; }
        let scene = this.scenes.get(table);
        if (!scene) {
            const svg = this.node("svg", { class: "card-depth-floor", "aria-hidden": "true", focusable: "false" });
            const defs = this.node("defs", {}, svg);
            const filterId = `card-depth-pile-${this.nextId++}`;
            const filter = this.node("filter", { id: filterId, x: "-10%", y: "-10%", width: "120%", height: "120%",
                "color-interpolation-filters": "sRGB" }, defs);
            const pileBlur = this.node("feGaussianBlur", { stdDeviation: 1 }, filter);
            const pileFloor = this.node("g", { filter: `url(#${filterId})` }, svg);
            const floor = this.node("g", {}, svg);
            table.insertBefore(svg, table.firstChild);
            scene = { table, svg, defs, floor, pileFloor, pileBlur, states: [], flights: [], version: 0 };
            this.scenes.set(table, scene);
        }
        const attached = elements.filter(element => !this.states.has(element));
        attached.forEach(element => this.attach(element, false, false));
        // Measure everything before writing, so the browser lays out the table once.
        const box = table.getBoundingClientRect();
        const board = typeof table.closest === "function" ? table.closest("#gameTable") : null;
        const boardBounds = board ? board.getBoundingClientRect() : null;
        const bounds = elements.map(element => {
            const b = element.getBoundingClientRect(), state = this.states.get(element);
            const offset = state && state.landingOffset || {
                x: parseFloat(element.style.getPropertyValue("--landing-offset-x")) || 0,
                y: parseFloat(element.style.getPropertyValue("--landing-offset-y")) || 0
            };
            const original = { left: b.left - offset.x, top: b.top - offset.y,
                width: b.width, height: b.height };
            const stored = state && state.layoutBounds;
            const previous = stored && scene.origin ? { ...stored,
                left: stored.left + box.left - scene.origin.x, top: stored.top + box.top - scene.origin.y } : stored;
            return previous && Object.keys(original).every(key => Math.abs(original[key] - previous[key]) < 1e-4)
                ? previous : original;
        });
        const sizes = elements.map(element => this.dimensions(element));
        const layoutKey = [box.left, box.top, box.width, box.height,
            ...(boardBounds ? [boardBounds.left, boardBounds.top, boardBounds.width, boardBounds.height] : []),
            ...elements.flatMap((element, index) => {
            const b = bounds[index], d = sizes[index];
            return [b.left, b.top, d.width, d.height, element.style.getPropertyValue("--pile-rotation")];
        })].join(":");
        if (scene.layoutKey === layoutKey && scene.elements.length === elements.length &&
            scene.elements.every((element, index) => element === elements[index] &&
                scene.states[index] === this.states.get(element))) {
            elements.forEach(element => this.setHidden(element, element.style.opacity === "0"));
            this.refreshFlights(scene, elements);
            return;
        }
        scene.layoutKey = layoutKey;
        scene.elements = elements;
        scene.origin = { x: box.left, y: box.top };
        scene.svg.setAttribute("viewBox", `0 0 ${box.width || 1} ${box.height || 1}`);
        scene.states = [];
        const supports = [];
        const plans = elements.map((element, index) => {
            const state = this.states.get(element), b = bounds[index];
            return { element, state, base: { x: b.left + b.width / 2, y: b.top + b.height / 2,
                roll: parseFloat(element.style.getPropertyValue("--pile-rotation")) || 0,
                ...sizes[index], radius: state ? state.radius : 0 } };
        }).filter(plan => plan.state);
        const groups = [];
        for (const plan of plans) {
            const parent = plan.element.parentElement || plan.element;
            const last = groups[groups.length - 1];
            if (last && last.parent === parent) { last.cards.push(plan); }
            else { groups.push({ parent, cards: [plan] }); }
        }
        let previous = null;
        for (const group of groups) {
            const supportCount = supports.length;
            // Fit before flight planning; tilted supporting cards can reduce the flat overlap estimate.
            for (let attempt = 0; attempt < 5; attempt++) {
                supports.length = supportCount;
                const fitted = boardBounds ? LandingGeometry.fitPlay(group.cards.map(plan => plan.base),
                    previous, boardBounds, .14 + attempt * .14) : group.cards.map(plan => plan.base);
                group.cards.forEach((plan, index) => {
                    const target = fitted[index];
                    let pose = LandingGeometry.landing(supports, target.x, target.y, target.roll, plan.base);
                    if (boardBounds) {
                        for (let iteration = 0; iteration < 10; iteration++) {
                            const dy = target.y - (pose.y - pose.z * LandingGeometry.VIEW_SHEAR);
                            if (Math.abs(dy) < .005) { break; }
                            pose = LandingGeometry.landing(supports, target.x, pose.y + dy, target.roll, plan.base);
                        }
                    }
                    plan.pose = pose;
                    supports.push(pose);
                });
                if (!boardBounds || !previous ||
                    LandingGeometry.overlapCoverage(group.cards[group.cards.length - 1].pose, previous) >= .1) { break; }
                if (attempt === 4) { throw new Error("The projected play cannot meet the required 10% overlap."); }
            }
            previous = group.cards[group.cards.length - 1].pose;
        }
        elements.forEach((element, index) => {
            const state = this.states.get(element);
            if (!state) { return; }
            const plan = plans.find(plan => plan.element === element), pose = plan.pose;
            state.layoutBounds = bounds[index];
            state.landingOffset = { x: pose.x - plan.base.x, y: pose.y - plan.base.y };
            element.style.setProperty("--landing-offset-x", `${state.landingOffset.x}px`);
            element.style.setProperty("--landing-offset-y", `${state.landingOffset.y}px`);
            this.bind(state, scene, [...scene.states]);
            Object.assign(state, { tableIndex: scene.states.length, rest: pose, size: sizes[index],
                hidden: element.style.opacity === "0", key: null });
            state.pose = this.resolvePose(state.pose, pose);
            state.world = state.placed = this.worldPose(state);
            scene.states.push(state);
        });
        // Shadow visibility depends on every card above a receiver, so render once all poses are known.
        scene.version++;
        scene.states.forEach(state => this.update(state.element, {}));
        // Top cards receive the landing card's shadows; caching them as layers spares the rest of the pile repaints.
        scene.states.forEach(state => state.element.classList.toggle("is-depth-detailed", this.detailed(state)));
        this.updatePileBlur(scene);
        this.refreshFlights(scene, elements);
        this.syncFoilPhase(attached);
        this.observeFoils(table);
    }

    // Cards of the same play cast onto each other's flights, which stand in for their hidden table cards.
    static flightReceivers(receivers) {
        return receivers.map(receiver => this.states.get(this.flightByTarget.get(receiver.element)) ||
            (receiver.hidden ? null : receiver)).filter(Boolean);
    }

    static refreshFlights(scene, elements) {
        const flights = [];
        document.querySelectorAll(".card-flight").forEach(element => {
            const state = this.states.get(element);
            if (!state || !state.destination) { return; }
            const target = elements.find(card => card.dataset.cardKey === state.destination.key &&
                card.closest(".table-play").dataset.playSignature === state.destination.signature);
            if (!target || !this.states.has(target)) { return; }
            this.flightByTarget.set(target, element);
            flights.push({ state, target });
        });
        for (const { state } of flights) {
            if (state.scene && state.scene !== scene) {
                state.scene.flights = state.scene.flights.filter(flight => flight !== state);
                if (!state.scene.flights.length) { state.scene.table.classList.remove("is-landing"); }
            }
        }
        scene.flights = flights.map(({ state }) => state);
        scene.table.classList.toggle("is-landing", scene.flights.length > 0);
        for (const { state, target } of flights) {
            this.bind(state, scene, this.flightReceivers(this.states.get(target).receiverStates));
            this.update(state.element, {});
        }
    }

    static landingMotion(element, target, start, power = .55) {
        const state = this.states.get(element), destination = this.states.get(target);
        if (!state || !destination || !destination.rest) { return null; }
        const G = LandingGeometry, rest = destination.rest, scene = destination.scene;
        if (target.dataset.cardKey && typeof target.closest === "function") {
            state.destination = { key: target.dataset.cardKey, signature: target.closest(".table-play").dataset.playSignature };
        }
        state.isFlight = true;
        this.flightByTarget.set(target, element);
        this.bind(state, scene, this.flightReceivers(destination.receiverStates));
        if (scene) {
            if (!scene.flights.includes(state)) { scene.flights.push(state); }
            scene.table.classList.add("is-landing");
            this.anchor(state);
        }
        const distance = Math.max(1, Math.hypot(rest.x - start.x, rest.y - start.y));
        const slide = Math.min(distance * .18, G.slideDistanceToRest(distance, power, rest.height) * 1.12);
        const momentum = { x: (rest.x - start.x) / distance * slide,
            y: (rest.y - start.y) / distance * slide, spin: (rest.roll - start.roll) * .08, power };
        const impact = { x: rest.x - momentum.x, y: rest.y - momentum.y, roll: rest.roll - momentum.spin };
        const initial = { ...start, width: rest.width, height: rest.height, radius: rest.radius };
        // Only cards near the landing spot can support the card as it touches down and slides.
        const reach = Math.hypot(rest.width, rest.height) + slide * 2;
        const supports = destination.receiverStates.map(receiver => receiver.rest || receiver.world)
            .filter(pose => Math.hypot(pose.x - rest.x, pose.y - rest.y) <= reach);
        initial.z = G.minimumHeight(supports, initial) + 18;
        const contact = G.landing(supports, impact.x, impact.y, impact.roll, initial);
        return {
            poseAtProgress: progress => progress >= 1 ? rest : G.motion(supports, initial, impact, momentum, progress, contact).pose,
            orientationAtProgress: progress => progress >= 1 ? { pitch: rest.pitch, yaw: rest.yaw }
                : G.motionOrientation(supports, initial, impact, momentum, progress, contact),
            positionAtProgress: progress => G.position(initial, impact, momentum, progress)
        };
    }

    // Flights are fixed-position; if the page scrolls, move them with the table they are landing on.
    static anchor(state) {
        state.anchor = { ...state.scene.origin };
        this.anchored.add(state);
        if (!this.listeningForScroll && typeof document.addEventListener === "function") {
            document.addEventListener("scroll", event => this.followScroll(event.target), { capture: true, passive: true });
            this.listeningForScroll = true;
        }
    }

    static followScroll(scroller = null) {
        const positions = new Map();
        const updates = [];
        for (const state of this.anchored) {
            if (this.states.get(state.element) !== state || !state.scene || !state.scene.table.isConnected) { continue; }
            const table = state.scene.table;
            // Scrolling a sibling (such as the hand) cannot move this flight's table.
            if (scroller && scroller !== document &&
                (typeof scroller.contains !== "function" || !scroller.contains(table))) { continue; }
            if (!positions.has(table)) { positions.set(table, table.getBoundingClientRect()); }
            updates.push({ state, box: positions.get(table) });
        }
        for (const { state, box } of updates) {
            state.element.style.translate = `${box.left - state.anchor.x}px ${box.top - state.anchor.y}px`;
        }
    }

    // One frame loop updates every animated card in start order, so later cards see earlier ones' current poses.
    static follow(element, animation, poseAtProgress) {
        const state = this.states.get(element);
        if (!state) { return; }
        this.followers.delete(element);
        this.followers.set(element, { state, animation, poseAtProgress });
        this.step(element);
        this.schedule();
    }

    static schedule() {
        if (this.frame == null && this.followers.size) {
            this.frame = requestAnimationFrame(() => this.tick());
        }
    }

    static tick() {
        this.frame = null;
        this.tickCount++;
        for (const element of [...this.followers.keys()]) { this.step(element); }
        this.schedule();
    }

    static step(element) {
        const follower = this.followers.get(element);
        if (!follower) { return; }
        const { state, animation, poseAtProgress } = follower;
        if (this.states.get(element) !== state) { this.followers.delete(element); return; }
        if (!element.isConnected) { this.detach(element); return; }
        const progress = animation.effect.getComputedTiming().progress;
        if (progress != null) { this.update(element, poseAtProgress(progress)); }
        if (animation.playState === "finished" || animation.playState === "idle") { this.followers.delete(element); }
    }

    static returnToHand(element) {
        const state = this.states.get(element);
        if (!state) { return; }
        const pose = { ...state.pose };
        const animation = element.animate([{ opacity: 1 }, { opacity: 1 }], {
            duration: 320, easing: "cubic-bezier(.2,.8,.25,1)"
        });
        this.follow(element, animation, progress => ({
            pitch: pose.pitch * (1 - progress), yaw: pose.yaw * (1 - progress), lift: 18 * (1 - progress)
        }));
    }

    static cancelFollow(element) {
        this.followers.delete(element);
        if (!this.followers.size && this.frame != null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }

    static detach(element) {
        const state = this.states.get(element);
        if (!state) { return; }
        this.cancelFollow(element);
        this.removeShadows(state);
        if (state.scene && state.isFlight) {
            state.scene.flights = state.scene.flights.filter(flight => flight !== state);
            if (!state.scene.flights.length) { state.scene.table.classList.remove("is-landing"); }
        }
        if (this.anchored.delete(state)) { element.style.translate = ""; }
        state.svg.remove();
        element.classList.remove("has-card-depth");
        this.states.delete(element);
    }
}
