// The phone lab's playable page: starts a real game against bots with the chosen foil, and shows a frame meter.
"use strict";
(function () {
    const query = new URLSearchParams(location.search);
    const foil = query.get("foil") || "rainbow";
    GameLayout.cardFoil = () => foil;
    GameLayout.foilForPlayer = () => foil;

    window.addEventListener("load", () => setTimeout(() => {
        if (query.get("idle") == "off") { document.body.dataset.idleFoilAnimation = "off"; }
        document.querySelector('.quick-play-option[data-players="4"]')?.click();
        document.getElementById("quickPlayButton")?.click();
    }, 200));

    const meter = document.createElement("div");
    meter.setAttribute("aria-hidden", "true");
    meter.style.cssText = "position:fixed;top:4px;left:4px;z-index:2147483647;padding:3px 7px;border-radius:6px;" +
        "background:#000c;color:#fff;font:600 12px/1.3 system-ui,sans-serif;pointer-events:none;contain:content;" +
        "font-variant-numeric:tabular-nums";
    meter.innerHTML = `<a href="/" style="pointer-events:auto;color:#9cf;margin-right:8px">&#8249; Lab</a><span></span>`;
    document.body.append(meter);
    const text = meter.querySelector("span");
    const label = query.get("label") || "";

    let intervals = [], previous = null, nextUpdate = 0;
    const tick = time => {
        if (previous != null) { intervals.push(time - previous); }
        previous = time;
        if (time >= nextUpdate && intervals.length) {
            const sorted = intervals.slice().sort((a, b) => a - b);
            const fastest = sorted[Math.floor(sorted.length / 10)];
            const slow = intervals.filter(value => value > fastest * 1.5).length;
            const total = intervals.reduce((sum, value) => sum + value, 0);
            text.textContent = `${label} ${Math.round(intervals.length / total * 1000)} fps, ${Math.round(slow / intervals.length * 100)}% slow`;
            intervals = [];
            nextUpdate = time + 500;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})();
