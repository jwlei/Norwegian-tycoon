"use strict";

// Theme-coloured neon wordmark with the two cards from the original logo, drawn as stacked SVG layers.
const NeonLogo = {
    words: {
        no: { label: "Boms og President", main: "BOMS", sub: "OG PRESIDENT", mainSize: 48, mainSpacing: 4, mainY: 72, subSize: 21, subSpacing: 5 },
        en: { label: "Norwegian Tycoon", main: "NORWEGIAN", sub: "TYCOON", mainSize: 44, mainSpacing: 3, mainY: 70, subSize: 30, subSpacing: 9 }
    },
    heart: "M0-4C-2.4-10-12-8.8-11.2-.8-10.4 5.6-2.4 9.6 0 14.4 2.4 9.6 10.4 5.6 11.2-.8 12-8.8 2.4-10 0-4Z",
    spade: "M0-16C3.2-8 12.8-4.8 12 3.2 11.2 8.8 4.8 10.4 1.6 6.4L4 14.4H-4L-1.6 6.4C-4.8 10.4-11.2 8.8-12 3.2-12.8-4.8-3.2-8 0-16Z",
    escape(value) {
        return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
    },
    geometry(id, words, a, b) {
        const text = `font-family="'Segoe UI','Arial Black',Arial,sans-serif"`;
        return `
            <g mask="url(#${id}-behind)">
                <g transform="rotate(-9 66 72)" ${b}>
                    <rect x="28" y="20" width="76" height="104" rx="12"/>
                    <text x="48" y="50" font-size="18" font-weight="700" text-anchor="middle" ${text} ${a}>A</text>
                    <path transform="translate(47 76) scale(1.15)" d="${this.heart}" ${a}/>
                </g>
            </g>
            <g transform="rotate(8 99 67)" ${b}>
                <rect x="61" y="15" width="76" height="104" rx="12"/>
                <text x="116" y="46" font-size="18" font-weight="700" text-anchor="middle" ${text}>K</text>
                <path transform="translate(115 73) scale(1.05)" d="${this.spade}"/>
            </g>
            <text x="168" y="${words.mainY}" font-size="${words.mainSize}" font-weight="800"
                letter-spacing="${words.mainSpacing}" ${text} ${a}>${this.escape(words.main)}</text>
            <g class="neon-logo__flicker" ${b}>
                <text x="172" y="108" font-size="${words.subSize}" font-weight="700"
                    letter-spacing="${words.subSpacing}" ${text}>${this.escape(words.sub)}</text>
                <path d="M171.5 120.5H396.5" stroke="url(#${id}-line)"/>
            </g>`;
    },
    // The front card hides the outline of the card behind it, as in the printed logo.
    defs(id) {
        return `<defs>
            <mask id="${id}-behind" maskUnits="userSpaceOnUse" x="0" y="0" width="620" height="140">
                <rect width="620" height="140" fill="#fff"/>
                <rect x="58" y="12" width="82" height="110" rx="14" fill="#000" transform="rotate(8 99 67)"/>
            </mask>
            <linearGradient id="${id}-line" gradientUnits="userSpaceOnUse" x1="171" y1="0" x2="397" y2="0">
                <stop offset="0" style="stop-color:var(--neon-a)"/><stop offset="1" style="stop-color:var(--neon-b)"/>
            </linearGradient>
        </defs>`;
    },
    layer(name, id, words, a, b, groupAttributes = "", blur = 0) {
        const filter = blur ? `<filter id="${id}-blur" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="${blur}"/></filter>` : "";
        const filtered = blur ? ` filter="url(#${id}-blur)"` : "";
        return `<svg class="neon-logo__${name}" viewBox="0 0 620 140" aria-hidden="true" focusable="false">
            ${this.defs(id).replace("<defs>", `<defs>${filter}`)}
            <g fill="none" stroke-linejoin="round" stroke-linecap="round"${filtered} ${groupAttributes}>${this.geometry(id, words, a, b)}</g></svg>`;
    },
    markup(language = "no", prefix = "neon-logo") {
        const words = this.words[language] || this.words.no;
        const tube = width => [`style="stroke:var(--neon-a)" stroke-width="${width}"`, `style="stroke:var(--neon-b)" stroke-width="${width}"`];
        const plain = attributes => [attributes, attributes];
        const layer = (name, [a, b], attributes = "", blur = 0) =>
            this.layer(name, `${prefix}-${name}`, words, a, b, attributes, blur);
        return `<div class="neon-logo" role="img" aria-label="${this.escape(words.label)}" data-i18n-skip>
            ${layer("shadow", plain('stroke="#000" stroke-width="3"'), 'transform="translate(0 4)" opacity=".55"', 2.2)}
            ${layer("glow", tube(5), 'opacity=".75"', 5.5)}
            ${layer("halo", tube(2.6), "", 1.6)}
            ${layer("tubes", tube(1.5))}
            ${layer("core", plain('stroke="#fff" stroke-width=".55"'), 'opacity=".85"')}
        </div>`;
    },
    render(language) {
        document.querySelectorAll("[data-neon-logo]").forEach(slot => {
            if (slot.dataset.neonLanguage === language) { return; }
            slot.dataset.neonLanguage = language;
            slot.innerHTML = this.markup(language, slot.dataset.neonLogo || "neon-logo");
        });
    }
};

if (typeof document !== "undefined") {
    window.NeonLogo = NeonLogo;
    let savedLanguage = null;
    try { savedLanguage = localStorage.getItem("norwegian-tycoon-language"); } catch (error) { }
    if (savedLanguage !== "en" && savedLanguage !== "no") {
        savedLanguage = /^(nb|nn|no)(-|$)/.test(String(navigator.language || "").toLowerCase()) ? "no" : "en";
    }
    NeonLogo.render(savedLanguage);
}
