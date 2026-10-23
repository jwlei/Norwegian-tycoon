"use strict";

// Native SVG card depth: a 3px laminated edge, support-aware resting poses, and top-left light shadows.
class CardDepth {
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
    static FLOOR = "floor";
    // Below this blur radius a filter is indistinguishable from the anti-aliased edge.
    static SHARP_BLUR = 1.25;
    // Tables with more cards than this keep full shadows only on their top DETAILED_CARDS cards.
    static SIMPLIFY_FROM = 12;
    static DETAILED_CARDS = 8;
    static paper = ["#dedbc7", "#bdbea9", "#e7e2cf", "#c5c5b1", "#dedbc7", "#b5bba4", "#e7e2cf"];

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

    static attach(element, render = true) {
        if (this.states.has(element)) { return; }
        const image = element.querySelector("img");
        if (!image) { return; }
        const inherited = element.querySelector(".card-depth-svg");
        if (inherited) { inherited.remove(); }
        element.classList.remove("has-card-depth");
        try {
            const source = new DOMParser().parseFromString(
                decodeURIComponent(image.src.slice(image.src.indexOf(",") + 1)), "image/svg+xml");
            const rect = source.querySelector("svg > rect");
            if (!rect) { throw new Error("The card SVG has no outer rectangle."); }
            const id = `card-depth-${this.nextId++}`;
            const svg = this.node("svg", { class: "card-depth-svg", "aria-hidden": "true", focusable: "false" });
            const defs = this.node("defs", {}, svg);
            const freeShadow = this.node("g", {}, svg);
            const faceGroup = this.node("g", { class: "card-depth-face" }, svg);
            const layers = this.paper.map(fill => this.node("path", { fill }, faceGroup));
            const face = this.node("image", { href: image.src }, faceGroup);
            const gradient = this.node("linearGradient", { id: `${id}-light`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
            this.node("stop", { offset: 0, "stop-color": "#fff" }, gradient);
            this.node("stop", { offset: 1, "stop-color": "#0b2112", "stop-opacity": .3 }, gradient);
            const light = this.node("path", { fill: `url(#${id}-light)`, opacity: .13 }, faceGroup);
            const clip = this.node("clipPath", { id: `${id}-clip`, clipPathUnits: "userSpaceOnUse" }, defs);
            const outline = this.node("path", {}, clip);
            const receiverShadows = this.node("g", { "clip-path": `url(#${id}-clip)` }, svg);
            const radius = Number(rect.getAttribute("rx") || 0);
            const state = { element, svg, defs, freeShadow, layers, face, light, outline, receiverShadows, id,
                radius: radius ? radius + .75 : 0, pose: { pitch: 0, yaw: 0, roll: 0, lift: 18 },
                receiverStates: [], shadowEntries: new Map(), nextShadow: 0, hidden: element.style.opacity === "0" };
            this.states.set(element, state);
            element.appendChild(svg);
            element.classList.add("has-card-depth");
            if (render) { this.update(element, state.pose); }
        } catch (error) {
            this.warn(error);
            this.detach(element);
        }
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
        state.world = world;
        state.placed = this.placedPose(state, world);
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
            state.hidden, state.shadowless, state.scene ? state.scene.version : 0];
        const add = other => { const p = other.placed; if (p) { parts.push(p.x, p.y, p.z, p.pitch, p.yaw, p.roll); } };
        state.receiverStates.forEach(add);
        if (state.isFlight && state.scene) { state.scene.flights.forEach(add); }
        return parts.join(":");
    }

    static renderCard(state) {
        const G = LandingGeometry, world = state.world;
        const { width, height } = world;
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
        state.light.setAttribute("d", outline);
        state.outline.setAttribute("d", outline);
        state.element.style.setProperty("--depth-face-transform", transform);
    }

    static renderShadows(state) {
        const G = LandingGeometry, caster = state.placed;
        const detailed = this.detailed(state);
        for (const receiver of [null, ...state.receiverStates]) {
            const key = receiver || this.FLOOR;
            let entry = state.shadowEntries.get(key);
            const target = receiver ? receiver.placed : null;
            // Simplified cards cast only a felt shadow; card-to-card shadows are kept for the top of the pile.
            // Moving cards skip simplified receivers too, so their per-frame work stays bounded on large tables.
            const visible = !state.hidden && !(state.shadowless && !receiver) && (!receiver || (detailed && target && !receiver.hidden &&
                (!state.isFlight || this.detailed(receiver)))) &&
                G.shadowVisible(caster, target, this.occluders(state, receiver), receiver ? this.exposed(receiver) : null);
            if (!visible) {
                if (entry) { entry.shape.style.display = "none"; }
                continue;
            }
            entry = entry || this.createShadow(state, receiver);
            const shadow = G.shadow(caster, target);
            const origin = target || (state.scene ? state.scene.origin : caster);
            entry.shape.setAttribute("d", this.path(shadow.points, origin));
            entry.shape.setAttribute("opacity", shadow.opacity);
            entry.shape.style.display = "";
            entry.blurValue = shadow.blur;
            // Simplified cards' felt shadows share the pile's single blur filter instead of one each.
            const shared = !receiver && !detailed && state.scene;
            this.moveShadow(entry, receiver ? receiver.receiverShadows : shared ? state.scene.pileFloor
                : state.scene ? state.scene.floor : state.freeShadow);
            this.setBlur(state, entry, shared ? 0 : shadow.blur);
        }
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
            scene.pileBlur.setAttribute("stdDeviation", blurs.reduce((sum, blur) => sum + blur, 0) / blurs.length);
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
        elements.forEach(element => this.attach(element, false));
        // Measure everything before writing, so the browser lays out the table once.
        const box = table.getBoundingClientRect();
        const board = typeof table.closest === "function" ? table.closest("#gameTable") : null;
        const boardBounds = board ? board.getBoundingClientRect() : null;
        const bounds = elements.map(element => {
            const b = element.getBoundingClientRect(), state = this.states.get(element);
            const offset = state && state.wallOffset;
            const original = { left: b.left - (offset ? offset.x : 0), top: b.top - (offset ? offset.y : 0),
                width: b.width, height: b.height };
            // Compositor translations can introduce tiny float errors without a layout change.
            const previous = state && state.layoutBounds;
            if (previous && Object.keys(original).every(key => Math.abs(original[key] - previous[key]) < 1e-4)) {
                return previous;
            }
            return original;
        });
        const sizes = elements.map(element => this.dimensions(element));
        const layoutKey = [box.left, box.top, box.width, box.height,
            ...(boardBounds ? [boardBounds.left, boardBounds.top, boardBounds.width, boardBounds.height] : []),
            ...elements.flatMap((element, index) => {
            const b = bounds[index], d = sizes[index];
            return [b.left, b.top, d.width, d.height, element.style.getPropertyValue("--pile-rotation"), element.dataset.throwMotion];
        })].join(":");
        if (scene.layoutKey === layoutKey && scene.elements.length === elements.length &&
            scene.elements.every((element, index) => element === elements[index])) {
            elements.forEach(element => this.setHidden(element, element.style.opacity === "0"));
            this.refreshFlights(scene, elements);
            return;
        }
        scene.layoutKey = layoutKey;
        scene.elements = elements;
        scene.origin = { x: box.left, y: box.top };
        scene.bounds = boardBounds;
        scene.svg.setAttribute("viewBox", `0 0 ${box.width || 1} ${box.height || 1}`);
        scene.states = [];
        const supports = [];
        const plans = elements.map((element, index) => {
            const state = this.states.get(element), b = bounds[index], size = sizes[index];
            return { element, state, index, base: { x: b.left + b.width / 2, y: b.top + b.height / 2,
                roll: parseFloat(element.style.getPropertyValue("--pile-rotation")) || 0,
                ...size, radius: state ? state.radius : 0 } };
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
            const center = { x: group.cards.reduce((sum, plan) => sum + plan.base.x, 0) / group.cards.length,
                y: group.cards.reduce((sum, plan) => sum + plan.base.y, 0) / group.cards.length };
            for (const plan of group.cards) {
                plan.path = boardBounds && plan.element.dataset.throwMotion
                    ? LandingGeometry.wallTrajectory(plan.base, boardBounds, JSON.parse(plan.element.dataset.throwMotion),
                        { x: plan.base.x - center.x, y: plan.base.y - center.y }) : null;
                plan.final = { ...plan.base, ...(plan.path ? plan.path.final : {}) };
            }
            if (boardBounds) {
                const arranged = LandingGeometry.arrangePlay(group.cards.map(plan => plan.final), previous, boardBounds);
                group.cards.forEach((plan, index) => { plan.final = arranged[index]; });
            }
            for (const plan of group.cards) {
                const final = plan.final;
                let y = final.y;
                let pose = LandingGeometry.landing(supports, final.x, y, final.roll, plan.base);
                if (boardBounds) {
                    // The fan is fitted in screen space; compensate for the pile's projected height.
                    for (let iteration = 0; iteration < 8; iteration++) {
                        const dy = final.y - (pose.y - pose.z * LandingGeometry.VIEW_SHEAR);
                        if (Math.abs(dy) < .01) { break; }
                        y += dy;
                        pose = LandingGeometry.landing(supports, final.x, y, final.roll, plan.base);
                    }
                }
                plan.pose = pose;
                supports.push(pose);
            }
            previous = group.cards[group.cards.length - 1].pose;
        }
        plans.forEach(({ element, state, index, base, path, pose }) => {
            state.layoutBounds = bounds[index];
            state.wallTrajectory = path;
            state.wallOffset = { x: pose.x - base.x, y: pose.y - base.y };
            element.style.setProperty("--wall-offset-x", `${state.wallOffset.x}px`);
            element.style.setProperty("--wall-offset-y", `${state.wallOffset.y}px`);
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
        const slide = G.slideDistanceToRest(distance, power, rest.height);
        // The remaining angular distance under constant deceleration is proportional to time squared.
        const momentum = { x: (rest.x - start.x) / distance * slide,
            y: (rest.y - start.y) / distance * slide, spin: (rest.roll - start.roll) * (1 - G.CONTACT) ** 2, power };
        const impact = { x: rest.x - momentum.x, y: rest.y - momentum.y, roll: rest.roll - momentum.spin };
        const initial = { ...start, width: rest.width, height: rest.height, radius: rest.radius };
        const path = destination.wallTrajectory;
        const rawPosition = path ? progress => {
            const position = path.positionAtProgress(progress);
            const blend = Math.max(0, 1 - progress / (path.collisions[0].progress * .8)) ** 2;
            return { x: position.x + (start.x - path.start.x) * blend,
                y: position.y + (start.y - path.start.y) * blend,
                roll: position.roll + (start.roll - path.start.roll) * blend };
        } : progress => G.position(initial, impact, momentum, progress);
        const physicalFinal = rawPosition(1);
        const positionAtProgress = scene && scene.bounds ? progress => G.settlePosition(
            rawPosition(progress), physicalFinal, rest, progress, scene.bounds) : rawPosition;
        // Include supports along the rebound path, not only beside the eventual resting spot.
        const reach = Math.hypot(rest.width, rest.height) + (path
            ? Math.max(...[path.start, ...path.collisions.map(hit => hit.pose)]
                .map(pose => Math.hypot(pose.x - rest.x, pose.y - rest.y))) : slide * 2);
        const supports = destination.receiverStates.map(receiver => receiver.rest || receiver.world)
            .filter(pose => Math.hypot(pose.x - rest.x, pose.y - rest.y) <= reach);
        initial.z = G.minimumHeight(supports, initial) + 18;
        const touchdown = positionAtProgress(G.CONTACT);
        const contact = G.landing(supports, touchdown.x, touchdown.y, touchdown.roll, initial);
        return {
            frameCount: path ? path.frameCount : 81,
            poseAtProgress: progress => progress >= 1 ? rest :
                G.motion(supports, initial, impact, momentum, progress, contact, positionAtProgress).pose,
            positionAtProgress
        };
    }

    // Flights are fixed-position; if the page scrolls, move them with the table they are landing on.
    static anchor(state) {
        state.anchor = { ...state.scene.origin };
        this.anchored.add(state);
        if (!this.listeningForScroll && typeof document.addEventListener === "function") {
            document.addEventListener("scroll", () => this.followScroll(), { capture: true, passive: true });
            this.listeningForScroll = true;
        }
    }

    static followScroll() {
        for (const state of this.anchored) {
            if (this.states.get(state.element) !== state || !state.scene || !state.scene.table.isConnected) { continue; }
            const box = state.scene.table.getBoundingClientRect();
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
