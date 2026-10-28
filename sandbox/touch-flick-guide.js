function touchFlickExample(angle, stage, distance, speed, hold = 0) {
    const radians = angle * Math.PI / 180;
    const x = Math.sin(radians) * distance;
    const y = -Math.cos(radians) * distance;
    const axis = stage == "release" ? "vertical" : cardTouchDragAxis(x, y);
    // The example's simulated release delay is separate from the live performance clock.
    const flick = shouldPlayCardDrag({
        canDragToPlay: axis == "vertical", canSwipeToPlay: true, axis,
        lastFlickX: x, lastFlickY: -y,
        lastFlickDistance: distance, lastFlickVelocity: speed,
        lastFlickMoveTime: null
    }, {}) && hold <= CARD_FLICK_RELEASE_GRACE_MS;
    let verdict;
    if (axis == "horizontal") {
        verdict = "Horizontal scroll. This touch will not play a card.";
    } else if (axis == null) {
        verdict = "Waiting for clearer movement. No pickup or scroll yet.";
    } else if (!isUpwardFlick(x, -y)) {
        verdict = "Drag only. This direction cannot finish as an upward flick.";
    } else if (distance < CARD_FLICK_MIN_DISTANCE) {
        verdict = `Too short. A flick needs at least ${CARD_FLICK_MIN_DISTANCE} px of recent movement.`;
    } else if (speed < CARD_FLICK_MIN_VELOCITY) {
        verdict = `Too slow. Finish at ${CARD_FLICK_MIN_VELOCITY * 1000} px/s or faster to flick.`;
    } else if (hold > CARD_FLICK_RELEASE_GRACE_MS) {
        verdict = `Released too late. The recognized flick is more than ${CARD_FLICK_RELEASE_GRACE_MS} ms old.`;
    } else {
        verdict = "Valid flick. Release now to play the card.";
    }
    return { x, y, flick, axis, verdict, duration: distance / speed };
}

const touchGuide = (() => {
    const get = id => document.getElementById(id);
    const diagram = get("diagram");
    const controls = ["angle", "speed", "distance", "replay-speed", "hold"];
    let stage = "initial";
    let origin = { x: 180, y: 190 };
    let animation = null;
    let example;
    function position(element, x, y, xName = "x", yName = "y") {
        element.setAttribute(xName, x);
        element.setAttribute(yName, y);
    }
    function point(angle, radius) {
        const radians = angle * Math.PI / 180;
        return [origin.x + Math.sin(radians) * radius, origin.y - Math.cos(radians) * radius];
    }
    function sector(element, start, end) {
        const from = point(start, 150);
        const to = point(end, 150);
        element.setAttribute("d", `M ${origin.x} ${origin.y} L ${from} A 150 150 0 0 1 ${to} Z`);
    }
    function finger(progress) {
        const x = origin.x + example.x * 4 * progress;
        const y = origin.y + example.y * 4 * progress;
        position(get("finger"), x, y, "cx", "cy");
        position(get("trail"), origin.x, origin.y, "x1", "y1");
        position(get("trail"), x, y, "x2", "y2");
    }
    function stop() {
        if (animation != null) { cancelAnimationFrame(animation); animation = null; }
    }
    function render() {
        stop();
        example = touchFlickExample(Number(get("angle").value), stage,
            Number(get("distance").value), Number(get("speed").value), Number(get("hold").value));
        const halfCone = CARD_TOUCH_PICKUP_CONE / 2;
        sector(get("pickup-zone"), -halfCone, halfCone);
        sector(get("scroll-left"), -105, -75);
        sector(get("scroll-right"), 75, 105);
        const downHalf = Math.atan(1 / 1.1) * 180 / Math.PI;
        sector(get("down-zone"), 180 - downHalf, 180 + downHalf);
        for (const id of ["scroll-left", "scroll-right", "left-label", "right-label", "down-zone", "down-label"]) {
            get(id).style.display = stage == "initial" ? "" : "none";
        }
        position(get("origin"), origin.x, origin.y, "cx", "cy");
        position(get("up-label"), origin.x, origin.y - 106);
        position(get("left-label"), origin.x - 113, origin.y + 4);
        position(get("right-label"), origin.x + 113, origin.y + 4);
        position(get("down-label"), origin.x, origin.y + 105);
        position(get("touch-label"), origin.x, origin.y + 29);
        get("angle-value").textContent = `${get("angle").value} degrees`;
        get("cone-label").textContent = `${halfCone * 2}-degree ${stage == "initial" ? "pickup" : "release"} cone`;
        get("verdict").textContent = example.verdict;
        get("verdict").dataset.state = example.flick ? "valid" : example.axis == "horizontal" ? "scroll" : "invalid";
        get("numbers").textContent = `${get("distance").value} px in ${example.duration.toFixed(1)} ms = ${Number(get("speed").value) * 1000} px/s`;
        const multiplier = Number(get("replay-speed").value);
        get("timing").textContent = `4x distance magnification; ${multiplier}x time. Replay: ${(example.duration * multiplier).toFixed(0)} ms of movement, then ${Number(get("hold").value) * multiplier} ms held before release.`;
        for (const id of ["initial", "release"]) { get(id).setAttribute("aria-pressed", String(stage == id)); }
        document.querySelectorAll("[data-angle]").forEach(button =>
            button.setAttribute("aria-pressed", String(button.dataset.angle == get("angle").value)));
        finger(1);
    }
    function replay() {
        render();
        const multiplier = Number(get("replay-speed").value);
        const duration = example.duration * multiplier;
        const hold = Number(get("hold").value) * multiplier;
        get("verdict").textContent = "Finger touches down...";
        finger(0);
        let start = null;
        const frame = now => {
            if (start == null) { start = now; }
            const elapsed = now - start;
            finger(Math.min(1, elapsed / duration));
            get("verdict").textContent = elapsed < duration
                ? "Finger moving..." : "Finger stopped; waiting to release...";
            if (elapsed < duration + hold) {
                animation = requestAnimationFrame(frame);
            } else {
                animation = null;
                get("verdict").textContent = `Released: ${example.verdict}`;
            }
        };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            finger(1);
            get("verdict").textContent = `Static preview (reduced motion): ${example.verdict}`;
        } else {
            animation = requestAnimationFrame(frame);
        }
    }
    for (const id of controls) { get(id).addEventListener("input", render); }
    for (const id of ["initial", "release"]) {
        get(id).addEventListener("click", () => { stage = id; render(); });
    }
    document.querySelectorAll("[data-angle]").forEach(button =>
        button.addEventListener("click", () => { get("angle").value = button.dataset.angle; render(); }));
    diagram.addEventListener("pointerdown", event => {
        if (!event.isPrimary || event.button != 0) { return; }
        const bounds = diagram.getBoundingClientRect();
        origin = {
            x: Math.max(70, Math.min(290, (event.clientX - bounds.left) * 360 / bounds.width)),
            y: Math.max(155, Math.min(195, (event.clientY - bounds.top) * 350 / bounds.height))
        };
        render();
    });
    get("replay").addEventListener("click", replay);
    render();
    return { render };
})();
