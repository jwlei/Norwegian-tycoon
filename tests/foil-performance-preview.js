"use strict";

const FoilPerformancePreview = {
    versions: [
        { id: "baked", name: "1. Fully cached static card",
            description: "Least measured main-thread work: artwork, foil and glare flattened into one reusable image. No live overlays or animation. Fixed reflection, including during pointer movement." },
        { id: "static-css", name: "2. Full CSS, no idle animation",
            description: "Production gradients, filters and blend modes, held still. Pointer reflections still work. Cheaper CPU result here than the animated alternatives; live blending remains." },
        { id: "cached", name: "3. Cached card + light reflection",
            description: "Baked artwork and foil at rest, shared by repeated cards. No live filter or blend modes. A faint reflection moves over a fixed texture." },
        { id: "simple", name: "4. Simpler CSS",
            description: "Two static backgrounds, one blend mode and no filter chain. Lightweight opacity/transform motion. Less distinctive foil patterns." },
        { id: "current", name: "5. Current animated production CSS",
            description: "Most measured main-thread work: original layered gradients, filters and blending. Idle motion repaints gradient coordinates. Most faithful reference." }
    ],
    escape(value) {
        return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    },
    bakedSource(imageSource, layers) {
        const escape = this.escape;
        const overlays = layers.map(layer => {
            const style = ["position:absolute", "inset:0.625% 0.9375%", "pointer-events:none",
                ...Object.entries(layer).map(([key, value]) => `${key}:${value}`)].join(";");
            return `<div style="${escape(style)}"></div>`;
        }).join("");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 100 150">
            <foreignObject width="100" height="150"><div xmlns="http://www.w3.org/1999/xhtml"
            style="position:relative;width:100px;height:150px;isolation:isolate">
            <img src="${escape(imageSource)}" style="display:block;width:100%;height:100%"/>${overlays}
            </div></foreignObject></svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
};

if (typeof document !== "undefined") {
    const foil = document.getElementById("foil");
    const renderer = document.getElementById("renderer");
    const count = document.getElementById("count");
    const idle = document.getElementById("idle");
    const active = document.getElementById("active");
    const comparisons = document.getElementById("comparisons");
    const hand = document.getElementById("stress-hand");
    const status = document.getElementById("status");
    const metrics = document.getElementById("metrics");
    const run = document.getElementById("run");
    const runAll = document.getElementById("run-all");
    const results = document.getElementById("results");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const cache = new Map();
    const measurements = new Map();
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => entry.target.classList.toggle("is-foil-offscreen", !entry.isIntersecting));
    }, { rootMargin: "128px" });
    let running = false;
    FoilPerformancePreview.measurements = measurements;

    for (const option of Card.foilOptions().filter(option => option.id !== "none")) {
        foil.add(new Option(Card.foilConfigNames[option.id].replaceAll("-", " "), option.id));
    }
    foil.value = "rainbow";
    FoilPerformancePreview.versions.forEach(version => renderer.add(new Option(version.name, version.id)));
    renderer.value = "cached";

    function notify(message, error = false) {
        status.textContent = message;
        status.classList.toggle("is-error", error);
        if (error) { console.error(message); }
    }

    function bake(imageSource) {
        const key = JSON.stringify([foil.value, imageSource]);
        if (cache.has(key)) { return cache.get(key); }
        const probe = document.createElement("div");
        probe.id = "bake-probe";
        probe.className = "card-preview";
        probe.dataset.foil = foil.value;
        document.body.append(probe);
        try {
            const layers = ["::before", "::after"].map(pseudo => {
                const style = getComputedStyle(probe, pseudo);
                return Object.fromEntries(["background-image", "background-size", "background-position",
                    "background-blend-mode", "filter", "mix-blend-mode", "opacity", "border-radius"]
                    .map(name => [name, style.getPropertyValue(name)]));
            });
            const source = FoilPerformancePreview.bakedSource(imageSource, layers);
            if (cache.size >= 156) { cache.delete(cache.keys().next().value); }
            cache.set(key, source);
            return source;
        } finally {
            probe.remove();
        }
    }

    function card(version, style, index = 11) {
        const element = document.createElement("div");
        element.className = `card-preview card-preview--${style}`;
        element.dataset.foil = foil.value;
        element.dataset.cardStyle = style;
        element.dataset.renderer = version;
        const image = document.createElement("img");
        const value = new Card(index % 4 + 1, index % 13 + 1);
        const source = value.toImageDataUri(style, foil.value);
        image.src = ["cached", "baked"].includes(version) ? bake(source) : source;
        image.alt = `${value.getName()}, ${style}`;
        image.draggable = false;
        element.append(image);
        return element;
    }

    function renderHand() {
        observer.disconnect();
        hand.replaceChildren(...Array.from({ length: Number(count.value) }, (_, index) =>
            card(renderer.value, index % 2 ? "cosmic" : "normal", index % 26)));
        hand.querySelectorAll(".card-preview").forEach(element => observer.observe(element));
        hand.scrollLeft = 0;
        metrics.textContent = "No measurement for this configuration yet.";
    }

    function render() {
        try {
            comparisons.replaceChildren(...FoilPerformancePreview.versions.map(version => {
                const section = document.createElement("section");
                section.className = "version";
                const heading = document.createElement("h2");
                heading.textContent = version.name;
                const text = document.createElement("p");
                text.textContent = version.description;
                const samples = document.createElement("div");
                samples.className = "samples";
                for (const style of ["normal", "cosmic"]) {
                    const figure = document.createElement("figure");
                    const caption = document.createElement("figcaption");
                    caption.textContent = style === "normal" ? "Light" : "Dark";
                    figure.append(card(version.id, style), caption);
                    samples.append(figure);
                }
                section.append(heading, text, samples);
                return section;
            }));
            renderHand();
            notify("Ready. Move over a comparison to synchronize reflection positions across all versions.");
        } catch (error) {
            notify(`Could not prepare the comparison: ${error.message}`, true);
            run.disabled = true;
        }
    }

    comparisons.addEventListener("pointermove", event => {
        if (reducedMotion.matches || running) { return; }
        const target = event.target.closest(".card-preview");
        if (!target) { return; }
        const bounds = target.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        comparisons.querySelectorAll(".card-preview").forEach(element => {
            if (element.dataset.renderer === "baked") { return; }
            element.classList.add("is-tilting");
            element.style.setProperty("--pointer-x", `${x * 100}%`);
            element.style.setProperty("--pointer-y", `${y * 100}%`);
            element.style.setProperty("--reflection-x", `${(x - .5) * 30}px`);
            element.style.setProperty("--reflection-y", `${(y - .5) * 45}px`);
        });
    });
    comparisons.addEventListener("pointerleave", () =>
        comparisons.querySelectorAll(".is-tilting").forEach(element => element.classList.remove("is-tilting")));
    function resetResults() {
        measurements.clear();
        results.innerHTML = '<tr><td colspan="5">Configuration changed. Run the comparison again.</td></tr>';
    }
    idle.addEventListener("change", () => {
        document.body.dataset.idleFoilAnimation = idle.checked ? "on" : "off";
        resetResults();
    });
    active.addEventListener("change", () => {
        document.body.classList.toggle("is-active", active.checked);
        resetResults();
    });
    foil.addEventListener("change", () => { resetResults(); render(); });
    renderer.addEventListener("change", renderHand);
    count.addEventListener("change", () => { resetResults(); renderHand(); });

    function showResults() {
        results.replaceChildren(...Array.from(measurements.values()).sort((a, b) => a.p95 - b.p95).map(result => {
            const row = document.createElement("tr");
            for (const value of [FoilPerformancePreview.versions.find(version => version.id === result.renderer).name,
                `${result.mean.toFixed(1)} ms`, `${result.p95.toFixed(1)} ms`, `${result.worst.toFixed(1)} ms`,
                `${result.slow} / ${result.frames}`]) {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.append(cell);
            }
            return row;
        }));
    }

    async function measure() {
        await Promise.all(Array.from(hand.querySelectorAll("img"), image => image.decode()));
        const max = hand.scrollWidth - hand.clientWidth;
        if (max <= 0) { throw new Error("The test hand does not overflow; select more cards."); }
        const intervals = [];
        await new Promise((resolve, reject) => {
            let start, previous;
            function step(time) {
                if (document.hidden || reducedMotion.matches) {
                    reject(new Error("The page was hidden or reduced motion changed; the run was discarded."));
                    return;
                }
                if (start == null) { start = previous = time; }
                else {
                    if (time - start >= 600) { intervals.push(time - previous); }
                    previous = time;
                }
                const progress = Math.max(0, Math.min(1, (time - start - 600) / 3000));
                hand.scrollLeft = max * (1 - Math.cos(progress * Math.PI * 4)) / 2;
                if (progress < 1) { requestAnimationFrame(step); }
                else { resolve(); }
            }
            requestAnimationFrame(step);
        });
        const sorted = intervals.slice().sort((a, b) => a - b);
        const result = { renderer: renderer.value, mean: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
            p95: sorted[Math.ceil(sorted.length * .95) - 1], worst: sorted.at(-1),
            over60HzBudget: intervals.filter(value => value > 1000 / 60).length,
            slow: intervals.filter(value => value > 25).length, frames: intervals.length };
        measurements.set(renderer.value, result);
        metrics.textContent = `${count.value} cards, ${foil.options[foil.selectedIndex].text}, idle ${idle.checked ? "on" : "off"}. ` +
            `Last run: ${result.mean.toFixed(1)} ms mean, ${result.p95.toFixed(1)} ms p95.`;
        showResults();
    }

    async function benchmark(all) {
        if (running) { return; }
        if (reducedMotion.matches) {
            notify("Reduced motion is enabled. Use manual scrolling instead of the automatic sweep.");
            return;
        }
        running = true;
        [run, runAll, foil, renderer, count, idle, active].forEach(control => { control.disabled = true; });
        document.body.classList.add("is-measuring");
        hand.scrollIntoView({ block: "center" });
        try {
                const versions = all ? FoilPerformancePreview.versions.map(version => version.id) : [renderer.value];
                for (const version of versions) {
                    renderer.value = version;
                    renderHand();
                    await measure();
                }
        } catch (error) {
            notify(`Scrolling test failed: ${error.message}`, true);
        } finally {
            running = false;
            document.body.classList.remove("is-measuring");
            [run, runAll, foil, renderer, count, idle, active].forEach(control => { control.disabled = false; });
        }
    }
    run.addEventListener("click", () => benchmark(false));
    runAll.addEventListener("click", () => benchmark(true));
    render();
}
