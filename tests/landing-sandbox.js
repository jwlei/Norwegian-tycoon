(() => {
    "use strict";
    const G = LandingGeometry;
    const NS = "http://www.w3.org/2000/svg";
    const scene = document.getElementById("scene");
    const definitions = document.getElementById("definitions");
    const cardsGroup = document.getElementById("cards");
    const floorShadows = document.getElementById("floor-shadows");
    const surface = document.getElementById("surface");
    const status = document.getElementById("status");
    const progress = document.getElementById("progress");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const paper = ["#dedbc7", "#bdbea9", "#e7e2cf", "#c5c5b1", "#dedbc7", "#b5bba4", "#e7e2cf"];
    let width = 900;
    let frame = null;
    let nextId = 0;
    let moving;
    let supports = [];
    let throwState = null;
    let pointer = null;
    let paused = false;
    let currentProgress = 0;
    let startTime = 0;
    let duration = 0;
    let currentPhase = "ready";

    function node(tag, attributes = {}, parent = null) {
        const element = document.createElementNS(NS, tag);
        for (const [key, value] of Object.entries(attributes)) { element.setAttribute(key, String(value)); }
        if (parent) { parent.appendChild(element); }
        return element;
    }

    function path(points) {
        return points.length ? points.map((p, index) =>
            `${index ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("") + "Z" : "";
    }

    function screenPath(pose, z = 0) {
        return path(G.silhouette(pose, z).map(G.screen));
    }

    function matrix(pose) {
        const a = G.screen(G.rotate(1, 0, 0, pose));
        const b = G.screen(G.rotate(0, 1, 0, pose));
        const center = G.screen(pose);
        return `matrix(${a.x} ${a.y} ${b.x} ${b.y} ${center.x} ${center.y})`;
    }

    function card(suit, rank, pose, interactive = false) {
        const id = `landing-card-${nextId++}`;
        const group = node("g", { "data-card-id": id }, cardsGroup);
        const layers = paper.map((color, index) => node("path", {
            fill: color, "data-edge-layer": index
        }, group));
        const face = node("image", { x: -G.WIDTH / 2, y: -G.HEIGHT / 2,
            width: G.WIDTH, height: G.HEIGHT, href: new Card(suit, rank).toImageDataUri("normal"),
            "aria-hidden": "true" }, group);
        const light = node("path", { fill: "url(#face-light)", opacity: .13 }, group);
        const clip = node("clipPath", { id: `${id}-clip`, clipPathUnits: "userSpaceOnUse" }, definitions);
        const clipPath = node("path", {}, clip);
        const shadowGroup = node("g", { "clip-path": `url(#${id}-clip)`, "aria-hidden": "true" }, group);
        const focus = node("path", { class: "focus-ring" }, group);
        const result = { id, group, layers, face, light, clip, clipPath, shadowGroup, focus, pose: { ...pose }, suit, rank };
        if (interactive) {
            group.setAttribute("class", "interactive-card");
            group.setAttribute("tabindex", "0");
            group.setAttribute("role", "button");
            group.setAttribute("aria-label", "Drag this card onto the table, or press Enter to throw");
            group.addEventListener("pointerdown", beginDrag);
            group.addEventListener("keydown", event => {
                if (moving !== result) { return; }
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); launch(); }
            });
        }
        return result;
    }

    function drawCard(card) {
        if (card.drawnPose === card.pose) { return; }
        card.drawnPose = card.pose;
        card.layers.forEach((layer, index) => {
            layer.setAttribute("d", screenPath(card.pose, -G.EDGE * (1 - index / (paper.length - 1))));
        });
        card.face.setAttribute("transform", matrix(card.pose));
        const outline = screenPath(card.pose);
        card.light.setAttribute("d", outline);
        card.clipPath.setAttribute("d", outline);
        card.focus.setAttribute("d", outline);
        card.group.dataset.pitch = card.pose.pitch.toFixed(4);
        card.group.dataset.yaw = card.pose.yaw.toFixed(4);
        card.group.dataset.height = card.pose.z.toFixed(4);
    }

    const shadows = new Map();
    function drawShadow(caster, receiver) {
        const key = `${caster.id}-${receiver ? receiver.id : "felt"}`;
        let entry = shadows.get(key);
        if (!entry) {
            const filter = node("filter", { id: `shadow-${key}`, x: "-50%", y: "-50%", width: "200%", height: "200%",
                "color-interpolation-filters": "sRGB" }, definitions);
            const blur = node("feGaussianBlur", { stdDeviation: .6 }, filter);
            const shape = node("path", { fill: "#020b05", filter: `url(#shadow-${key})`,
                "data-caster": caster.id, "data-receiver": receiver ? receiver.id : "felt" },
            receiver ? receiver.shadowGroup : floorShadows);
            entry = { filter, blur, shape };
            shadows.set(key, entry);
        }
        if (entry.casterPose === caster.pose && entry.receiverPose === (receiver ? receiver.pose : null)) { return; }
        entry.casterPose = caster.pose;
        entry.receiverPose = receiver ? receiver.pose : null;
        const shadow = G.shadow(caster.pose, receiver ? receiver.pose : null);
        entry.shape.setAttribute("d", path(shadow.points));
        entry.shape.setAttribute("opacity", shadow.opacity.toFixed(4));
        entry.shape.dataset.gap = shadow.gap.toFixed(4);
        entry.shape.dataset.blur = shadow.blur.toFixed(4);
        entry.blur.setAttribute("stdDeviation", shadow.blur.toFixed(3));
    }

    function draw() {
        const all = [...supports, moving];
        all.forEach(drawCard);
        for (let index = 0; index < all.length; index++) {
            drawShadow(all[index], null);
            for (let below = 0; below < index; below++) { drawShadow(all[index], all[below]); }
        }
        const nearestGap = Math.min(...G.samples(moving.pose, -G.EDGE).map(point =>
            point.z - G.supportHeight(supports.map(card => card.pose), point.x, point.y)));
        const floor = G.shadow(moving.pose);
        let closest = floor;
        for (const support of supports) {
            if (!G.samples(moving.pose).some(point => G.contains(support.pose, point.x, point.y))) { continue; }
            const shadow = G.shadow(moving.pose, support.pose);
            if (shadow.points.length && shadow.gap < closest.gap) { closest = shadow; }
        }
        document.getElementById("height").textContent = `${moving.pose.z.toFixed(1)} px`;
        document.getElementById("angles").textContent = `${moving.pose.pitch.toFixed(1)}\u00b0 / ${moving.pose.yaw.toFixed(1)}\u00b0`;
        document.getElementById("gap").textContent = `${Math.max(0, nearestGap).toFixed(2)} px`;
        document.getElementById("shadow-blur").textContent = `${closest.blur.toFixed(2)} px blur`;
        scene.dataset.phase = currentPhase;
        scene.dataset.supportGap = nearestGap.toFixed(4);
        scene.dataset.progress = String(currentProgress);
    }

    function stop() {
        if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
    }

    function setStatus(message) { status.textContent = message; }

    function controls() {
        const inspecting = !!throwState;
        document.getElementById("pause").disabled = !inspecting || currentProgress === 1 || reducedMotion.matches;
        document.getElementById("pause").textContent = paused ? "Resume" : "Pause";
        document.getElementById("replay").disabled = !inspecting;
        document.getElementById("next").disabled = currentProgress !== 1 || supports.length >= 7;
        progress.disabled = !inspecting;
        document.getElementById("throw").textContent = inspecting ? "Throw again" : "Throw card";
        document.getElementById("progress-value").textContent = `${Math.round(currentProgress * 100)}%`;
        progress.value = String(Math.round(currentProgress * 1000));
    }

    function seek(value) {
        if (!throwState) { return; }
        currentProgress = value;
        const result = G.motion(supports.map(card => card.pose), throwState.start, throwState.impact, throwState.momentum, value);
        moving.pose = result.pose;
        currentPhase = result.phase;
        draw();
        controls();
        if (value === 1) {
            setStatus("Settled. The 2.5px edge, resting tilt, and contact shadow remain. Add another or drag to a new position.");
        } else if (result.phase === "contact") {
            setStatus(`Contact: sliding and rocking to rest${result.bounce > .1 ? " \u00b7 small rebound" : ""}.`);
        } else { setStatus("In flight: a wider, softer shadow tracks height above each receiving surface."); }
    }

    function tick(time) {
        frame = null;
        seek(Math.min(1, (time - startTime) / duration));
        if (currentProgress < 1 && !paused) { frame = requestAnimationFrame(tick); }
    }

    function play() {
        stop();
        paused = false;
        if (reducedMotion.matches) { seek(1); return; }
        duration = document.getElementById("slow").checked ? 2800 : 1100;
        startTime = performance.now() - currentProgress * duration;
        frame = requestAnimationFrame(tick);
        controls();
    }

    function defaultImpact() {
        if (surface.value === "bare") { return { x: width * .49, y: 246, roll: -8 }; }
        if (surface.value === "edge") { return { x: width * .51 + 63, y: 244, roll: 7 }; }
        return { x: width * .5 + 22, y: 243, roll: -11 };
    }

    function startFlight(impact, start, velocity = { x: 0, y: -1 }) {
        const power = Number(document.getElementById("strength").value) / 100;
        const length = Math.max(1, Math.hypot(velocity.x, velocity.y));
        const margin = G.WIDTH / 2 + 30;
        impact.x = Math.max(margin, Math.min(width - margin, impact.x));
        impact.y = Math.max(130, Math.min(360, impact.y));
        const slide = G.slideDistance(Math.hypot(impact.x - start.x, impact.y - start.y), power);
        const momentum = { x: velocity.x / length * slide,
            y: velocity.y / length * slide, spin: (velocity.x / length * 5 + 2) * power, power };
        throwState = { impact, start: { ...start }, momentum };
        currentProgress = 0;
        document.getElementById("hand-label").setAttribute("visibility", "hidden");
        play();
    }

    function launch() {
        if (pointer) { return; }
        const start = throwState ? throwState.start : moving.pose;
        startFlight(defaultImpact(), start);
    }

    function clearShadows() {
        for (const entry of shadows.values()) { entry.filter.remove(); entry.shape.remove(); }
        shadows.clear();
    }

    function addSource() {
        moving = card((nextId % 4) + 1, [1, 7, 12, 13][nextId % 4],
            { x: width / 2, y: 474, z: 38, pitch: 10, yaw: -12, roll: -6 }, true);
        throwState = null;
        currentProgress = 0;
        currentPhase = "ready";
        document.getElementById("hand-label").setAttribute("visibility", "visible");
        controls();
        draw();
    }

    function reset() {
        stop();
        const drag = pointer;
        pointer = null;
        if (drag && drag.element.hasPointerCapture(drag.id)) { drag.element.releasePointerCapture(drag.id); }
        paused = false;
        clearShadows();
        cardsGroup.replaceChildren();
        definitions.querySelectorAll("clipPath").forEach(clip => clip.remove());
        supports = [];
        width = Math.max(440, Math.round(scene.getBoundingClientRect().width));
        scene.setAttribute("viewBox", `0 0 ${width} 580`);
        scene.querySelector(".felt").setAttribute("width", width - 16);
        document.getElementById("hand-label").setAttribute("x", width / 2);
        document.getElementById("hand-label").setAttribute("y", 555);
        if (surface.value !== "bare") {
            const placements = surface.value === "edge"
                ? [[width * .5 - 8, 245, -7], [width * .5 - 4, 244, -3]]
                : [[width * .5 - 28, 250, -18], [width * .5 + 22, 225, 24], [width * .5 - 5, 250, -4]];
            placements.forEach(([x, y, roll], index) => {
                supports.push(card(index + 1, 7 + index, G.landing(supports.map(card => card.pose), x, y, roll)));
            });
        }
        const target = defaultImpact();
        const guide = { ...target, z: 0, pitch: 0, yaw: 0 };
        document.getElementById("target-guide").setAttribute("d", screenPath(guide));
        document.getElementById("target-label").setAttribute("x", target.x);
        document.getElementById("target-label").setAttribute("y", 118);
        addSource();
        setStatus("Ready. Throw a card, or drag the lower card to choose a landing position.");
    }

    function scenePoint(event) {
        const point = new DOMPoint(event.clientX, event.clientY);
        const transform = scene.getScreenCTM();
        if (!transform) { throw new Error("The landing table has no screen transform."); }
        return point.matrixTransform(transform.inverse());
    }

    function beginDrag(event) {
        if (event.currentTarget !== moving.group || event.button !== 0 || pointer) { return; }
        event.preventDefault();
        stop();
        const point = scenePoint(event);
        const position = G.screen(moving.pose);
        pointer = { id: event.pointerId, element: moving.group, x: point.x - position.x, y: point.y - position.y,
            previous: point, time: event.timeStamp, vx: 0, vy: -1, start: { ...moving.pose },
            throwState, progress: currentProgress, phase: currentPhase, paused };
        moving.group.setPointerCapture(event.pointerId);
        throwState = null;
        currentProgress = 0;
        currentPhase = "drag";
        document.getElementById("hand-label").setAttribute("visibility", "hidden");
        controls();
        setStatus("Dragging. Release above the table to test the supporting heights at that position.");
    }

    scene.addEventListener("pointermove", event => {
        if (!pointer || pointer.id !== event.pointerId) { return; }
        event.preventDefault();
        const point = scenePoint(event);
        const elapsed = Math.max(1, event.timeStamp - pointer.time);
        pointer.vx = (point.x - pointer.previous.x) / elapsed;
        pointer.vy = (point.y - pointer.previous.y) / elapsed;
        pointer.previous = point;
        pointer.time = event.timeStamp;
        const lift = reducedMotion.matches ? 35 : 65;
        moving.pose = { x: Math.max(65, Math.min(width - 65, point.x - pointer.x)),
            y: Math.max(100, Math.min(485, point.y - pointer.y + lift * G.VIEW_SHEAR)), z: lift,
            pitch: reducedMotion.matches ? 0 : Math.max(-18, Math.min(18, pointer.vy * 9)),
            yaw: reducedMotion.matches ? 0 : Math.max(-18, Math.min(18, -pointer.vx * 9)), roll: -6 };
        moving.pose.z = Math.max(moving.pose.z, G.minimumHeight(supports.map(card => card.pose), moving.pose) + 5);
        draw();
    });

    function finishDrag(event) {
        if (!pointer || pointer.id !== event.pointerId) { return; }
        const drag = pointer;
        pointer = null;
        if (drag.element.hasPointerCapture(event.pointerId)) { drag.element.releasePointerCapture(event.pointerId); }
        if (event.type !== "pointerup" || moving.pose.y > 410) {
            moving.pose = drag.start;
            throwState = drag.throwState;
            currentProgress = drag.progress;
            currentPhase = drag.phase;
            paused = !!throwState || drag.paused;
            controls();
            draw();
            document.getElementById("hand-label").setAttribute("visibility", throwState ? "hidden" : "visible");
            setStatus("Drag cancelled; the card was returned without adding it to the pile.");
            return;
        }
        startFlight({ x: moving.pose.x, y: moving.pose.y, roll: moving.pose.roll + drag.vx * 4 },
            moving.pose, { x: drag.vx, y: drag.vy });
    }
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) { scene.addEventListener(event, finishDrag); }
    window.addEventListener("blur", () => {
        if (pointer) { finishDrag({ type: "pointercancel", pointerId: pointer.id }); }
        if (frame !== null) { stop(); paused = true; controls(); }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && frame !== null) { stop(); paused = true; controls(); }
    });
    document.getElementById("throw").addEventListener("click", launch);
    document.getElementById("replay").addEventListener("click", () => { currentProgress = 0; play(); });
    document.getElementById("next").addEventListener("click", () => {
        stop();
        moving.group.classList.remove("interactive-card");
        moving.group.removeAttribute("tabindex");
        moving.group.removeAttribute("role");
        moving.group.removeAttribute("aria-label");
        supports.push(moving);
        addSource();
        setStatus("Another card is ready. Its resting pose will account for the enlarged pile.");
    });
    document.getElementById("pause").addEventListener("click", () => {
        if (paused) { play(); }
        else { stop(); paused = true; controls(); }
    });
    progress.addEventListener("input", () => {
        stop();
        paused = true;
        seek(Number(progress.value) / 1000);
    });
    document.getElementById("reset").addEventListener("click", reset);
    surface.addEventListener("change", reset);
    reducedMotion.addEventListener("change", () => {
        if (reducedMotion.matches && throwState) { stop(); seek(1); }
    });
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (Math.abs(Math.max(440, Math.round(scene.getBoundingClientRect().width)) - width) > 1) { reset(); }
        }, 120);
    });
    const gradient = node("linearGradient", { id: "face-light", x1: "0", y1: "0", x2: "1", y2: "1" }, definitions);
    node("stop", { offset: "0", "stop-color": "#fff" }, gradient);
    node("stop", { offset: "1", "stop-color": "#0b2112", "stop-opacity": ".3" }, gradient);
    reset();
})();
