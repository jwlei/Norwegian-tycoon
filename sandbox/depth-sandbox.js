(async () => {
    "use strict";

    const studies = [
        { id: "native", name: "CSS baseline", tag: "ORIGINAL CSS COMPOSITOR",
            description: "The original SVG silhouettes and CSS 3D transforms. This is the baseline with the edge artifacts we want to remove." },
        { id: "webgl", name: "1x output", tag: "WEBGL / NO MSAA", samples: 1, antialias: false,
            description: "The complete card projected into a single flat image at screen resolution. A control for separating renderer changes from anti-aliasing." },
        { id: "msaa", name: "Hardware MSAA", tag: "1x OUTPUT / MSAA", samples: 1, antialias: true,
            description: "The same renderer with hardware multisampling. MSAA smooths mesh boundaries, but may not improve the alpha-textured card contour." },
        { id: "ssaa2", name: "2x output SSAA", tag: "4 SAMPLES / SCREEN PIXEL", samples: 2, antialias: false,
            description: "The whole rotated card, including its silhouette and paper layers, is rendered at twice the screen resolution and downsampled." },
        { id: "ssaa4", name: "4x output SSAA", tag: "16 SAMPLES / SCREEN PIXEL", samples: 4, antialias: false,
            description: "Four times the screen resolution in both dimensions, resolved before display. Targets the final jagged contour, at a higher GPU cost." }
    ];
    const defaults = { yaw: -24, pitch: 16, lift: 18, thickness: 3 };
    const controls = Object.fromEntries(Object.keys(defaults).map(key => [key, document.getElementById(key)]));
    const grid = document.getElementById("card-studies");
    const orbitButton = document.getElementById("animate");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const artwork = new Card(2, 12).toImageDataUri("normal");
    const svgSource = decodeURIComponent(artwork.slice(artwork.indexOf(",") + 1));
    const svgDocument = new DOMParser().parseFromString(svgSource, "image/svg+xml");
    const outline = svgDocument.querySelector('svg > rect');
    if (!outline) { throw new Error("Depth lab requires the card artwork's outer rectangle."); }
    const stroke = Number(outline.getAttribute("stroke-width"));
    const bounds = {
        x: Number(outline.getAttribute("x")) - stroke / 2,
        y: Number(outline.getAttribute("y")) - stroke / 2,
        width: Number(outline.getAttribute("width")) + stroke,
        height: Number(outline.getAttribute("height")) + stroke,
        radius: Number(outline.getAttribute("rx")) + stroke / 2
    };
    const silhouetteSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    silhouetteSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    silhouetteSvg.setAttribute("viewBox", "0 0 80 120");
    const silhouetteOutline = outline.cloneNode();
    silhouetteOutline.setAttribute("fill", "white");
    silhouetteOutline.setAttribute("stroke", "white");
    silhouetteSvg.appendChild(silhouetteOutline);
    const silhouetteSource = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(silhouetteSvg))}`;
    const [renderArtwork, renderSilhouette] = await Promise.all([
        DepthCardRenderer.loadTexture(artwork), DepthCardRenderer.loadTexture(silhouetteSource)
    ]);
    // Keep the native 80:120 aspect ratio. Coordinates below use rendered pixels.
    const scale = 1.6;
    const contour = [];
    for (const [cx, cy, start] of [
        [bounds.x + bounds.radius, bounds.y + bounds.radius, 180],
        [bounds.x + bounds.width - bounds.radius, bounds.y + bounds.radius, 270],
        [bounds.x + bounds.width - bounds.radius, bounds.y + bounds.height - bounds.radius, 0],
        [bounds.x + bounds.radius, bounds.y + bounds.height - bounds.radius, 90]
    ]) {
        for (let step = 0; step <= 16; step++) {
            const angle = (start + step * 90 / 16) * Math.PI / 180;
            contour.push([(cx + Math.cos(angle) * bounds.radius) * scale - 64,
                (cy + Math.sin(angle) * bounds.radius) * scale - 96]);
        }
    }
    const stages = [];
    const renderers = new Map();
    let frame = null;
    let orbitStarted = 0;
    let activePointer = null;

    function layer(className, parent) {
        const element = document.createElement("span");
        element.className = className;
        parent.appendChild(element);
        return element;
    }

    function buildCard(kind, parent) {
        const object = layer(`card-object ${kind}`, parent);
        object.setAttribute("aria-hidden", "true");
        parent.dataset.method = kind;
        object.style.setProperty("--card-mask", `url("${artwork}")`);
        // The face is at z=0; all thickness goes behind it, never outside its silhouette at rest.
        for (let index = 0; index <= 16; index++) {
            const sheet = layer("paper-layer", object);
            sheet.style.setProperty("--layer", String(-index / 16));
            sheet.style.setProperty("--paper-tone", index % 2 ? "var(--paper-dark)" : "var(--paper-light)");
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 80 120");
            const rect = outline.cloneNode();
            rect.setAttribute("fill", "var(--paper-tone)");
            rect.setAttribute("stroke", "var(--paper-tone)");
            svg.appendChild(rect);
            sheet.appendChild(svg);
        }
        const face = layer("card-face", object);
        const image = document.createElement("img");
        image.src = artwork;
        image.alt = "";
        image.draggable = false;
        face.appendChild(image);
        layer("surface-light", face);
    }

    for (const [index, study] of studies.entries()) {
        const article = document.createElement("article");
        article.className = "card-study";
        article.innerHTML = `<div class="stage" tabindex="0" role="group"
            aria-label="${study.name}: interactive Queen of Hearts" aria-describedby="card-help-${index}">
            <span class="stage-index">0${index + 1} / 05</span>
            <span class="shadow-ground" aria-hidden="true">
                <svg class="card-shadow" viewBox="-220 -220 440 440"><polygon></polygon></svg>
            </span>
            <span class="stage-hint">HOVER / DRAG / ARROW KEYS</span></div>
            <div class="study-copy"><span class="study-number">STUDY 0${index + 1}</span>
            <h3>${study.name}</h3><p id="card-help-${index}">${study.description}</p><span class="technique">${study.tag}</span></div>`;
        const stage = article.querySelector(".stage");
        stage.dataset.method = study.id;
        if (study.samples) {
            renderers.set(stage, new DepthCardRenderer(stage, renderArtwork, renderSilhouette, study.samples, study.antialias));
        } else {
            buildCard(study.id, stage);
        }
        stages.push(stage);
        grid.appendChild(article);
    }

    function pose() {
        return Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, Number(input.value)]));
    }

    function paint(stage, yaw, pitch, settings = pose()) {
        stage.dataset.yaw = String(yaw);
        stage.dataset.pitch = String(pitch);
        stage.style.setProperty("--rx", `${pitch}deg`);
        stage.style.setProperty("--ry", `${yaw}deg`);
        stage.style.setProperty("--lift", `${settings.lift}px`);
        stage.style.setProperty("--edge", `${settings.thickness}px`);
        const ry = yaw * Math.PI / 180;
        const rx = pitch * Math.PI / 180;
        const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
        // Inverse-rotate a fixed world light (-.55, -.7, 1) into the card's local frame.
        const localLightX = -.55 * cy + .7 * sx * sy - cx * sy;
        const localLightY = -.7 * cx + sx;
        const localLightZ = -.55 * sy - .7 * sx * cy + cx * cy;
        stage.style.setProperty("--light-angle", `${Math.atan2(localLightY, localLightX) * 180 / Math.PI + 270}deg`);
        stage.style.setProperty("--light-opacity", String(.08 + Math.max(0, localLightZ) * .1));
        const edgeTone = Math.round(174 + Math.max(-1, Math.min(1, localLightZ)) * 24);
        stage.style.setProperty("--paper-dark", `rgb(${edgeTone - 14} ${edgeTone - 12} ${edgeTone - 25})`);
        stage.style.setProperty("--paper-light", `rgb(${edgeTone + 22} ${edgeTone + 20} ${edgeTone + 5})`);
        const shadow = stage.querySelector(".card-shadow");
        const rotated = contour.map(([x, y]) => [x * cy, y * cx + x * sy * sx, y * sx - x * sy * cx]);
        const clearance = settings.lift + Math.max(...rotated.map(point => Math.abs(point[2]))) + settings.thickness + 4;
        // Project every contour point away from the top-left light onto the ground plane.
        const projected = rotated.map(([x, y, z]) => {
            const height = clearance + z;
            return `${x + .55 * height},${y - settings.lift + .7 * height}`;
        });
        shadow.querySelector("polygon").setAttribute("points", projected.join(" "));
        shadow.style.filter = `blur(${5 + settings.lift * .16}px)`;
        shadow.style.opacity = String(.34 - settings.lift * .0015);
        const renderer = renderers.get(stage);
        if (renderer) { renderer.render(yaw, pitch, settings); }
    }

    function render() {
        const settings = pose();
        for (const [key, value] of Object.entries(settings)) {
            document.getElementById(`${key}-value`).textContent = `${value}${key === "yaw" || key === "pitch" ? "\u00b0" : "px"}`;
        }
        for (const stage of stages) { paint(stage, settings.yaw, settings.pitch, settings); }
    }

    function stopOrbit() {
        if (frame !== null) { cancelAnimationFrame(frame); }
        frame = null;
        orbitButton.setAttribute("aria-pressed", "false");
    }

    function orbit(time) {
        const settings = pose();
        const phase = (time - orbitStarted) / 2200;
        for (const stage of stages) {
            paint(stage, Math.sin(phase) * 42, Math.cos(phase * 0.8) * 24, settings);
        }
        frame = requestAnimationFrame(orbit);
    }

    function restore() {
        stopOrbit();
        render();
    }

    for (const input of Object.values(controls)) { input.addEventListener("input", restore); }
    orbitButton.addEventListener("click", () => {
        if (frame !== null) { restore(); return; }
        if (reducedMotion.matches) { return; }
        orbitStarted = performance.now();
        orbitButton.setAttribute("aria-pressed", "true");
        frame = requestAnimationFrame(orbit);
    });
    document.getElementById("reset").addEventListener("click", () => {
        for (const [key, value] of Object.entries(defaults)) { controls[key].value = String(value); }
        restore();
    });
    function updateMotionPreference() {
        restore();
        orbitButton.disabled = reducedMotion.matches;
        orbitButton.title = reducedMotion.matches ? "Disabled by your reduced-motion preference" : "Slowly rotate all five cards";
    }
    reducedMotion.addEventListener("change", updateMotionPreference);
    window.addEventListener("resize", restore);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { restore(); } });

    function point(stage, event) {
        const bounds = stage.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
        const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
        paint(stage, x * 50, -y * 35);
    }

    function release(stage, event) {
        if (!activePointer || activePointer.stage !== stage || activePointer.id !== event.pointerId) { return; }
        activePointer = null;
        stage.classList.remove("is-dragging");
        if (stage.hasPointerCapture(event.pointerId)) { stage.releasePointerCapture(event.pointerId); }
        render();
    }

    for (const stage of stages) {
        stage.addEventListener("pointerdown", event => {
            if (event.button !== 0 || activePointer) { return; }
            stopOrbit();
            activePointer = { stage, id: event.pointerId };
            stage.classList.add("is-dragging");
            stage.setPointerCapture(event.pointerId);
            point(stage, event);
        });
        stage.addEventListener("pointermove", event => {
            if (activePointer && (activePointer.stage !== stage || activePointer.id !== event.pointerId)) { return; }
            if (event.pointerType !== "mouse" && !activePointer) { return; }
            stopOrbit();
            point(stage, event);
        });
        stage.addEventListener("pointerleave", () => {
            if (!activePointer) { render(); }
        });
        for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
            stage.addEventListener(name, event => release(stage, event));
        }
        stage.addEventListener("keydown", event => {
            const directions = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] };
            if (event.key === "Escape") { restore(); return; }
            const direction = directions[event.key];
            if (!direction) { return; }
            event.preventDefault();
            stopOrbit();
            paint(stage, Math.max(-55, Math.min(55, Number(stage.dataset.yaw) + direction[0])),
                Math.max(-40, Math.min(40, Number(stage.dataset.pitch) + direction[1])));
        });
        stage.addEventListener("blur", () => { if (!activePointer) { render(); } });
    }
    window.addEventListener("blur", () => {
        if (activePointer) { release(activePointer.stage, { pointerId: activePointer.id }); }
        restore();
    });

    document.querySelectorAll(".mini-hand img").forEach((image, index) => {
        image.src = new Card(index + 1, [1, 12, 13][index]).toImageDataUri("normal");
        image.draggable = false;
    });
    const depthToggle = document.getElementById("depth-toggle");
    depthToggle.addEventListener("click", () => {
        const enabled = depthToggle.getAttribute("aria-pressed") !== "true";
        depthToggle.setAttribute("aria-pressed", String(enabled));
        depthToggle.textContent = enabled ? "Depth on" : "Depth off";
        document.getElementById("ui-studies").classList.toggle("is-flat", !enabled);
    });
    const playerButtons = [...document.querySelectorAll("[data-players]")];
    const status = document.getElementById("demo-status");
    playerButtons.forEach(button => button.addEventListener("click", () => {
        playerButtons.forEach(option => option.setAttribute("aria-pressed", String(option === button)));
        status.textContent = `${button.dataset.players} players \u00b7 just a preview`;
    }));
    document.getElementById("demo-play").addEventListener("click", () => {
        const selected = playerButtons.find(button => button.getAttribute("aria-pressed") === "true");
        status.textContent = `Preview only \u00b7 ${selected.dataset.players}-player table selected`;
    });
    updateMotionPreference();
})().catch(error => {
    console.error("Depth lab failed to initialize:", error);
    const message = document.createElement("p");
    message.className = "error";
    message.setAttribute("role", "alert");
    message.textContent = `Could not initialize the anti-aliasing studies: ${error.message}`;
    document.getElementById("card-studies").replaceChildren(message);
});
