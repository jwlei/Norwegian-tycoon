"use strict";

class CardDepth {
    static states = new WeakMap();
    static scenes = new WeakMap();
    static nextId = 0;
    static warned = false;
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

    static attach(element) {
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
                receiverStates: [], shadowEntries: [], frame: null, hidden: element.style.opacity === "0" };
            this.states.set(element, state);
            element.appendChild(svg);
            element.classList.add("has-card-depth");
            this.update(element, state.pose);
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
        state.pose = { ...state.pose, ...pose };
        const { width, height } = this.dimensions(element);
        if (!width || !height) { return; }
        const G = LandingGeometry;
        const local = { ...state.pose, width, height, radius: state.radius, x: 0, y: 0, z: 0 };
        const z = state.pose.z ?? G.minimumHeight([], local) + state.pose.lift;
        const world = { ...local, x: state.pose.x || 0, y: state.pose.y || 0, z };
        state.world = world;
        const origin = { x: world.x, y: world.y };
        const key = [width, height, world.x, world.y, z, world.pitch, world.yaw, world.roll,
            ...state.receiverStates.flatMap(receiver => {
                const p = receiver.world;
                return [p.x, p.y, p.z, p.pitch, p.yaw, p.roll];
            })].join(":");
        if (state.key === key) { return; }
        state.key = key;
        state.svg.setAttribute("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);
        state.layers.forEach((layer, index) => layer.setAttribute("d", this.path(
            G.silhouette(world, -3 * (1 - index / (state.layers.length - 1))).map(G.screen), origin)));
        const a = G.screen(G.rotate(1, 0, 0, world)), b = G.screen(G.rotate(0, 1, 0, world));
        const transform = `matrix(${a.x}, ${a.y}, ${b.x}, ${b.y}, 0, ${-G.VIEW_SHEAR * z})`;
        state.face.setAttribute("x", -width / 2);
        state.face.setAttribute("y", -height / 2);
        state.face.setAttribute("width", width);
        state.face.setAttribute("height", height);
        state.face.setAttribute("transform", transform);
        const outline = this.path(G.silhouette(world).map(G.screen), origin);
        state.light.setAttribute("d", outline);
        state.outline.setAttribute("d", outline);
        state.svg.dataset.pitch = String(world.pitch);
        state.svg.dataset.yaw = String(world.yaw);
        state.svg.dataset.height = String(z);
        element.style.setProperty("--depth-pitch", `${world.pitch}deg`);
        element.style.setProperty("--depth-yaw", `${world.yaw}deg`);
        element.style.setProperty("--depth-roll", `${world.roll}deg`);
        element.style.setProperty("--depth-face-transform", transform);
        // Shadows live on their receivers, so intervening cards occlude them without per-card masks.
        [null, ...state.receiverStates].forEach((receiver, index) => {
            let entry = state.shadowEntries[index];
            const host = receiver || state.scene || state;
            if (!entry) {
                const id = `${state.id}-shadow-${index}`;
                const filter = this.node("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%",
                    "color-interpolation-filters": "sRGB" }, host.defs);
                const blur = this.node("feGaussianBlur", { stdDeviation: .6 }, filter);
                const shape = this.node("path", { fill: "#020b05", filter: `url(#${id})` },
                    receiver ? host.receiverShadows : state.scene ? host.floor : state.freeShadow);
                entry = { filter, shape, blur };
                state.shadowEntries.push(entry);
            }
            const shadow = G.shadow(world, receiver ? receiver.world : null);
            entry.shape.setAttribute("d", this.path(shadow.points, receiver ? receiver.world :
                state.scene ? state.scene.origin : origin));
            entry.shape.setAttribute("opacity", shadow.opacity);
            entry.shape.style.display = state.hidden ? "none" : "";
            entry.shape.dataset.blur = String(shadow.blur);
            entry.blur.setAttribute("stdDeviation", shadow.blur);
        });
    }

    static bind(state, scene, receivers) {
        if (state.scene === scene && state.receiverStates.length === receivers.length &&
            state.receiverStates.every((receiver, index) => receiver === receivers[index])) { return; }
        state.shadowEntries.forEach(entry => { entry.shape.remove(); entry.filter.remove(); });
        state.shadowEntries = [];
        state.scene = scene;
        state.receiverStates = receivers;
        state.key = null;
    }

    static setHidden(element, hidden) {
        const state = this.states.get(element);
        if (!state) { return; }
        state.hidden = hidden;
        state.shadowEntries.forEach(entry => { entry.shape.style.display = hidden ? "none" : ""; });
    }

    static prepareTable(table) {
        table = table.querySelector(".table-card-pile") || table;
        const elements = [...table.querySelectorAll(".table-play__card")];
        if (!elements.length) { return; }
        let scene = this.scenes.get(table);
        if (!scene) {
            const svg = this.node("svg", { class: "card-depth-floor", "aria-hidden": "true", focusable: "false" });
            const defs = this.node("defs", {}, svg);
            const floor = this.node("g", {}, svg);
            table.insertBefore(svg, table.firstChild);
            scene = { svg, defs, floor };
            this.scenes.set(table, scene);
        }
        const box = table.getBoundingClientRect();
        scene.origin = { x: box.left, y: box.top };
        scene.svg.setAttribute("viewBox", `0 0 ${box.width || 1} ${box.height || 1}`);
        elements.forEach(element => this.attach(element));
        const bounds = elements.map(element => element.getBoundingClientRect());
        const layoutKey = [box.left, box.top, box.width, box.height, ...elements.flatMap((element, index) => {
            const b = bounds[index], d = this.dimensions(element);
            return [b.left, b.top, d.width, d.height, element.style.getPropertyValue("--pile-rotation")];
        })].join(":");
        if (scene.layoutKey === layoutKey && scene.elements.length === elements.length &&
            scene.elements.every((element, index) => element === elements[index])) {
            elements.forEach(element => this.setHidden(element, element.style.opacity === "0"));
            this.refreshFlights(scene, elements);
            return;
        }
        scene.layoutKey = layoutKey;
        scene.elements = elements;
        const supports = [], receiverStates = [];
        elements.forEach((element, index) => {
            const state = this.states.get(element);
            if (!state) { return; }
            const { width, height } = this.dimensions(element), box = bounds[index];
            const pose = LandingGeometry.landing(supports, box.left + box.width / 2, box.top + box.height / 2,
                parseFloat(element.style.getPropertyValue("--pile-rotation")) || 0, { width, height, radius: state.radius });
            this.bind(state, scene, [...receiverStates]);
            state.rest = pose;
            state.key = null;
            this.setHidden(element, element.style.opacity === "0");
            this.update(element, pose);
            supports.push(pose);
            receiverStates.push(state);
        });
        this.refreshFlights(scene, elements);
    }

    static refreshFlights(scene, elements) {
        document.querySelectorAll(".card-flight").forEach(element => {
            const state = this.states.get(element);
            if (!state || !state.destination) { return; }
            const target = elements.find(card => card.dataset.cardKey === state.destination.key &&
                card.closest(".table-play").dataset.playSignature === state.destination.signature);
            const destination = target && this.states.get(target);
            if (!destination) { return; }
            this.bind(state, scene, destination.receiverStates);
            this.update(element, state.pose);
        });
    }

    static landingMotion(element, target, start, power = .55) {
        const state = this.states.get(element), destination = this.states.get(target);
        if (!state || !destination || !destination.rest) { return null; }
        const G = LandingGeometry, rest = destination.rest;
        if (target.dataset.cardKey && typeof target.closest === "function") {
            state.destination = { key: target.dataset.cardKey, signature: target.closest(".table-play").dataset.playSignature };
        }
        this.bind(state, destination.scene, destination.receiverStates);
        const distance = Math.max(1, Math.hypot(rest.x - start.x, rest.y - start.y));
        const momentum = { x: (rest.x - start.x) / distance * (5 + power * 18),
            y: (rest.y - start.y) / distance * (5 + power * 18), spin: (rest.roll - start.roll) * .08, power };
        const impact = { x: rest.x - momentum.x, y: rest.y - momentum.y, roll: rest.roll - momentum.spin };
        const initial = { ...start, width: rest.width, height: rest.height, radius: rest.radius };
        const supports = destination.receiverStates.map(receiver => receiver.world);
        initial.z = G.minimumHeight(supports, initial) + 18;
        const contact = G.landing(supports, impact.x, impact.y, impact.roll, initial);
        return {
            poseAtProgress: progress => progress >= 1 ? rest : G.motion(supports, initial, impact, momentum, progress, contact).pose,
            positionAtProgress: progress => G.position(initial, impact, momentum, progress)
        };
    }

    static follow(element, animation, poseAtProgress) {
        const state = this.states.get(element);
        if (!state) { return; }
        this.cancelFollow(element);
        const tick = () => {
            state.frame = null;
            if (this.states.get(element) !== state) { return; }
            if (!element.isConnected) { this.detach(element); return; }
            const progress = animation.effect.getComputedTiming().progress;
            if (progress != null) { this.update(element, poseAtProgress(progress)); }
            if (animation.playState !== "finished" && animation.playState !== "idle") {
                state.frame = requestAnimationFrame(tick);
            }
        };
        tick();
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
        const state = this.states.get(element);
        if (state && state.frame != null) { cancelAnimationFrame(state.frame); state.frame = null; }
    }

    static detach(element) {
        const state = this.states.get(element);
        if (!state) { return; }
        this.cancelFollow(element);
        state.shadowEntries.forEach(entry => { entry.shape.remove(); entry.filter.remove(); });
        state.svg.remove();
        element.classList.remove("has-card-depth");
        this.states.delete(element);
    }
}
