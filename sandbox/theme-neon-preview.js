"use strict";

const ThemeNeonPreview = {
    // Original names; the inspiration names describe the palette source only.
    themes: [
        { id: "glod", name: "Glød", inspiration: "Monokai Pro Ristretto", mode: "dark",
            bg: "#211c1c", felt: "#2c2525", surface: "#2c2525", soft: "#403838", ink: "#fff1f3", muted: "#c3b7b8",
            line: "#5b4f50", accent: "#fd6883", focus: "#f9cc6c", neonA: "#ff6b81", neonB: "#f9cc6c" },
        { id: "rose", name: "Rosé", inspiration: "Rosé Pine", mode: "dark",
            bg: "#191724", felt: "#1f1d2e", surface: "#1f1d2e", soft: "#26233a", ink: "#e0def4", muted: "#aeaac6",
            line: "#403d52", accent: "#eb6f92", focus: "#f6c177", neonA: "#ebbcba", neonB: "#c4a7e7" },
        { id: "skumring", name: "Skumring", inspiration: "Ayu Mirage", mode: "dark",
            bg: "#1a1f29", felt: "#1f2430", surface: "#242936", soft: "#2d3343", ink: "#e6e3da", muted: "#acb2bf",
            line: "#3d4455", accent: "#ffa759", focus: "#73d0ff", neonA: "#ffad66", neonB: "#73d0ff" },
        { id: "hostlov", name: "Høstløv", inspiration: "Gruvbox", mode: "dark",
            bg: "#1d2021", felt: "#282828", surface: "#32302f", soft: "#3c3836", ink: "#ebdbb2", muted: "#c2b499",
            line: "#504945", accent: "#d79921", focus: "#fabd2f", neonA: "#fabd2f", neonB: "#fb4934" },
        { id: "darcula", name: "Darcula", inspiration: "IntelliJ Darcula", mode: "dark",
            bg: "#2b2b2b", felt: "#313335", surface: "#3c3f41", soft: "#45494a", ink: "#e2e6ea", muted: "#bcc3cb",
            line: "#555a5e", accent: "#cc7832", focus: "#ffc66d", neonA: "#ffc66d", neonB: "#6897bb" },
        { id: "kobolt", name: "Kobolt", inspiration: "Cobalt2", mode: "dark",
            bg: "#15232d", felt: "#193549", surface: "#1f4662", soft: "#234e6d", ink: "#ffffff", muted: "#c9d8e4",
            line: "#2c5a7a", accent: "#ffc600", focus: "#9effff", neonA: "#ffc600", neonB: "#9effff" },
        { id: "monokai", name: "Monokai", inspiration: "Monokai / Sublime", mode: "dark",
            bg: "#1e1f1c", felt: "#272822", surface: "#2d2e27", soft: "#3e3d32", ink: "#f8f8f2", muted: "#c4c2af",
            line: "#49483e", accent: "#a6e22e", focus: "#e6db74", neonA: "#a6e22e", neonB: "#f92672" },
        { id: "furu", name: "Furu", inspiration: "Everforest", mode: "dark",
            bg: "#272e33", felt: "#2d353b", surface: "#343f44", soft: "#3d484d", ink: "#e3dbc2", muted: "#bab39d",
            line: "#4f5b58", accent: "#a7c080", focus: "#dbbc7f", neonA: "#a7c080", neonB: "#e69875" },
        { id: "solarisert", name: "Solarisert", inspiration: "Solarized Dark", mode: "dark",
            bg: "#00212b", felt: "#002b36", surface: "#073642", soft: "#0d4250", ink: "#eee8d5", muted: "#adbbbd",
            line: "#2a5662", accent: "#2aa198", focus: "#b58900", neonA: "#2aa198", neonB: "#e0b020" },
        { id: "fjord", name: "Fjord", inspiration: "Nord", mode: "dark",
            bg: "#242933", felt: "#2e3440", surface: "#3b4252", soft: "#434c5e", ink: "#eceff4", muted: "#c6cddb",
            line: "#4c566a", accent: "#88c0d0", focus: "#8fbcbb", neonA: "#88c0d0", neonB: "#ebcb8b" },
        { id: "modern", name: "Moderne mørk", inspiration: "VS Code Dark Modern", mode: "dark",
            bg: "#181818", felt: "#1f1f1f", surface: "#252526", soft: "#2d2d30", ink: "#f3f3f3", muted: "#c4c4c4",
            line: "#3c3c3c", accent: "#0078d4", focus: "#4fc1ff", neonA: "#4fc1ff", neonB: "#c586c0" },
        { id: "atom", name: "Atom", inspiration: "One Dark Pro", mode: "dark",
            bg: "#21252b", felt: "#282c34", surface: "#2c313a", soft: "#353b45", ink: "#dcdfe4", muted: "#b0b7c3",
            line: "#3e4451", accent: "#61afef", focus: "#56b6c2", neonA: "#61afef", neonB: "#e5c07b" },
        { id: "nattugle", name: "Nattugle", inspiration: "Night Owl", mode: "dark",
            bg: "#010e1a", felt: "#011627", surface: "#0b2942", soft: "#13344f", ink: "#d6deeb", muted: "#a9b6c7",
            line: "#1d3b53", accent: "#82aaff", focus: "#7fdbca", neonA: "#7fdbca", neonB: "#c792ea" },
        { id: "mokka", name: "Mokka", inspiration: "Catppuccin Mocha", mode: "dark",
            bg: "#11111b", felt: "#1e1e2e", surface: "#252536", soft: "#313244", ink: "#cdd6f4", muted: "#a6adc8",
            line: "#45475a", accent: "#cba6f7", focus: "#f5c2e7", neonA: "#f5c2e7", neonB: "#89b4fa" },
        { id: "vampyr", name: "Vampyr", inspiration: "Dracula", mode: "dark",
            bg: "#21222c", felt: "#282a36", surface: "#2f3241", soft: "#383a4a", ink: "#f8f8f2", muted: "#bcc0d8",
            line: "#44475a", accent: "#bd93f9", focus: "#ff79c6", neonA: "#ff79c6", neonB: "#8be9fd" },
        { id: "synthwave", name: "Synthwave", inspiration: "SynthWave '84", mode: "dark",
            bg: "#1e1a2b", felt: "#262335", surface: "#2a2139", soft: "#34294a", ink: "#f4eefa", muted: "#c8bddb",
            line: "#4a3d63", accent: "#ff7edb", focus: "#36f9f6", neonA: "#ff7edb", neonB: "#36f9f6" },
        { id: "kontrast", name: "Høy kontrast", inspiration: "Visual Studio High Contrast", mode: "dark",
            bg: "#000000", felt: "#000000", surface: "#0a0a0a", soft: "#1a1a1a", ink: "#ffffff", muted: "#e0e0e0",
            line: "#6fc3df", accent: "#f38518", focus: "#f38518", neonA: "#f38518", neonB: "#6fc3df" },
        { id: "vs-bla", name: "Studio Blå", inspiration: "Visual Studio Blue", mode: "light",
            bg: "#cfd6e5", felt: "#dde3ef", surface: "#f5f7fb", soft: "#e3e8f3", ink: "#1e1e1e", muted: "#47505f",
            line: "#8e9bb5", accent: "#1e5aa8", focus: "#0e70c0", neonA: "#1f6fd1", neonB: "#d99400" },
        { id: "sol", name: "Sol", inspiration: "Solarized Light", mode: "light",
            bg: "#eee8d5", felt: "#f5efdc", surface: "#fdf6e3", soft: "#eee8d5", ink: "#073642", muted: "#4f6369",
            line: "#c9c1a8", accent: "#1f6fae", focus: "#268bd2", neonA: "#0f8a80", neonB: "#c98600" },
        { id: "papir", name: "Papir", inspiration: "GitHub Light", mode: "light",
            bg: "#f6f8fa", felt: "#eef1f4", surface: "#ffffff", soft: "#f6f8fa", ink: "#1f2328", muted: "#59636e",
            line: "#d1d9e0", accent: "#0969da", focus: "#0969da", neonA: "#1a6fd6", neonB: "#d9620f" }
    ],
    proposals: [
        ["Layered surfaces", "Panels get a 1px inner highlight, softer two-step shadows and 16px corners, so menus read as distinct raised layers instead of flat boxes."],
        ["Table felt depth", "A static radial vignette and fine fibre texture make the table feel like felt without animation cost; cards and guidance stay readable."],
        ["Clear button hierarchy", "One filled primary action per screen, tonal secondary buttons and quiet text buttons. Every target stays at least 44px high."],
        ["Player seats", "Avatar initials, card-count chips and an accent turn ring replace plain text rows; the active player is visible at a glance."],
        ["Segmented choices", "Player count, speed and shadow choices use one connected segmented control with a sliding selected state."],
        ["Grouped settings", "Settings become titled cards (Appearance, Game, Messages) with consistent switches and help text."],
        ["Type and numbers", "Tabular figures for timers, scores and codes; small uppercase section labels; a tighter heading scale."],
        ["Theme-aware focus", "Every theme defines its own focus ring colour, checked for contrast against panels and buttons."]
    ],
    hex(value) {
        const match = /^#([0-9a-f]{6})$/i.exec(value);
        if (!match) { throw new TypeError(`Expected a #rrggbb colour, received ${value}.`); }
        return match[1].match(/../g).map(part => parseInt(part, 16));
    },
    luminance(value) {
        const [r, g, b] = this.hex(value).map(channel => {
            const c = channel / 255;
            return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        });
        return .2126 * r + .7152 * g + .0722 * b;
    },
    contrast(a, b) {
        const [high, low] = [this.luminance(a), this.luminance(b)].sort((x, y) => y - x);
        return (high + .05) / (low + .05);
    },
    hue(value) {
        const [r, g, b] = this.hex(value).map(channel => channel / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        if (!delta) { return 0; }
        const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        return (hue * 60 + 360) % 360;
    },
    // Button text follows whichever of white or near-black reads better on the accent.
    accentInk(theme) {
        return this.contrast("#ffffff", theme.accent) >= this.contrast("#101114", theme.accent) ? "#ffffff" : "#101114";
    },
    checks(theme) {
        const accentInk = this.accentInk(theme);
        return [
            ["Text on background", this.contrast(theme.ink, theme.bg)],
            ["Text on panel", this.contrast(theme.ink, theme.surface)],
            ["Secondary text", this.contrast(theme.muted, theme.surface)],
            ["Button text", this.contrast(accentInk, theme.accent)],
            ["Focus ring", Math.max(this.contrast(theme.focus, theme.surface), this.contrast(theme.focus, theme.bg))]
        ];
    },
    ordered() {
        const rank = theme => theme.id === "kontrast" ? 999 : this.hue(theme.accent);
        return ["dark", "light"].flatMap(mode => this.themes.filter(theme => theme.mode === mode)
            .sort((a, b) => rank(a) - rank(b)));
    },
    neonSign(id) {
        const heart = "M0 -5C-3-13-15-11-14-1-13 7-3 12 0 18 3 12 13 7 14-1 15-11 3-13 0-5Z";
        const spade = "M0-20C4-10 16-6 15 4 14 11 6 13 2 8L5 18H-5L-2 8C-6 13-14 11-15 4-16-6-4-10 0-20Z";
        const geometry = (primary, secondary) => `
            <g ${primary}>
                <text x="300" y="112" font-size="96" letter-spacing="10" text-anchor="middle">BOMS</text>
                <path transform="translate(548 92) scale(1.45)" d="${spade}"/>
            </g>
            <g class="neon-flicker" ${secondary}>
                <text x="300" y="166" font-size="31" letter-spacing="8" text-anchor="middle">og PRESIDENT</text>
                <path transform="translate(52 92) scale(1.45)" d="${heart}"/>
            </g>`;
        const tube = width => [
            `fill="none" style="stroke:var(--neon-a)" stroke-width="${width}"`,
            `fill="none" style="stroke:var(--neon-b)" stroke-width="${width}"`
        ];
        const font = `font-family="'Segoe UI Black','Arial Black','Segoe UI',system-ui,sans-serif" font-weight="900"`;
        const screws = [[34, 34], [566, 34], [34, 196], [566, 196]].map(([x, y]) => `
            <g transform="translate(${x} ${y})"><circle r="7" fill="url(#${id}-screw)" stroke="#000" stroke-opacity=".5"/>
            <path d="M-4.2-1.6 4.2 1.6" stroke="#1a1c20" stroke-width="1.6" stroke-linecap="round"/></g>`).join("");
        const supports = [[118, 120], [214, 122], [300, 124], [388, 122], [480, 120], [176, 170], [424, 170]]
            .map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-3" y="-6" width="6" height="12" rx="2"
                fill="url(#${id}-support)"/><ellipse cy="6" rx="5" ry="2" fill="#000" opacity=".45"/></g>`).join("");
        return `<div class="neon-sign" role="img" aria-label="Boms og President">
            <svg class="neon-board" viewBox="0 0 600 236" aria-hidden="true" focusable="false">
                <defs>
                    <linearGradient id="${id}-acrylic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#1b1e25"/><stop offset=".55" stop-color="#0d0f14"/><stop offset="1" stop-color="#07080b"/>
                    </linearGradient>
                    <radialGradient id="${id}-screw" cx=".35" cy=".3" r=".8">
                        <stop offset="0" stop-color="#e7e9ee"/><stop offset=".5" stop-color="#8a8f99"/><stop offset="1" stop-color="#3a3e46"/>
                    </radialGradient>
                    <linearGradient id="${id}-support" x1="0" x2="1">
                        <stop offset="0" stop-color="#4a4f58"/><stop offset=".5" stop-color="#c9ccd2"/><stop offset="1" stop-color="#4a4f58"/>
                    </linearGradient>
                </defs>
                <path d="M150 0V14M450 0V14" stroke="#5c6069" stroke-width="2" stroke-dasharray="4 3"/>
                <rect x="12" y="14" width="576" height="202" rx="20" fill="url(#${id}-acrylic)"/>
                <rect x="12.5" y="14.5" width="575" height="201" rx="19.5" fill="none" stroke="#fff" stroke-opacity=".09"/>
                <path d="M32 16H568" stroke="#fff" stroke-opacity=".12" stroke-width="1.5"/>
                ${screws}${supports}
                <path d="M520 216C524 226 540 228 552 226" fill="none" stroke="#2c2f35" stroke-width="3"/>
                <rect x="550" y="218" width="34" height="16" rx="3" fill="#24272d" stroke="#3a3e46"/>
                <circle cx="577" cy="226" r="2.2" fill="var(--neon-a)" opacity=".9"/>
                <g ${font}>${geometry(...Array(2).fill('fill="none" stroke="#2a2d33" stroke-width="5.6"'))}</g>
            </svg>
            <svg class="neon-glow" viewBox="0 0 600 236" aria-hidden="true" focusable="false">
                <defs>
                    <filter id="${id}-wide" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>
                    <filter id="${id}-near" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
                    <radialGradient id="${id}-wall"><stop offset="0" style="stop-color:var(--neon-a)" stop-opacity=".3"/>
                        <stop offset="1" style="stop-color:var(--neon-a)" stop-opacity="0"/></radialGradient>
                </defs>
                <ellipse cx="300" cy="118" rx="300" ry="112" fill="url(#${id}-wall)"/>
                <g ${font} filter="url(#${id}-wide)" stroke-linejoin="round" opacity=".85">${geometry(...tube(9))}</g>
                <g ${font} filter="url(#${id}-near)" stroke-linejoin="round">${geometry(...tube(4.6))}</g>
            </svg>
            <svg class="neon-tubes" viewBox="0 0 600 236" aria-hidden="true" focusable="false">
                <g ${font} stroke-linejoin="round" stroke-linecap="round">
                    ${geometry(...tube(3))}
                    <g fill="none" stroke="#fff" stroke-width="1.05" opacity=".88">${geometry("", "")}</g>
                    <g fill="none" stroke="#fff" stroke-width=".55" opacity=".45" transform="translate(-.7 -.9)">${geometry("", "")}</g>
                </g>
            </svg>
        </div>`;
    }
};

if (typeof document !== "undefined") {
    const root = document.documentElement;
    const grid = document.getElementById("themeGrid");
    const mock = document.getElementById("mock");
    const title = document.getElementById("themeTitle");
    const inspiration = document.getElementById("themeInspiration");
    const checks = document.getElementById("contrastChecks");
    const swatches = document.getElementById("themeSwatches");
    const uiToggle = document.getElementById("uiStyle");
    const logoToggle = document.getElementById("logoStyle");
    const status = document.getElementById("status");
    const properties = ["bg", "felt", "surface", "soft", "ink", "muted", "line", "accent", "focus", "neonA", "neonB"];
    const cssName = key => `--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    let selected = "vampyr";

    function apply(theme) {
        properties.forEach(key => root.style.setProperty(cssName(key), theme[key]));
        root.style.setProperty("--accent-ink", ThemeNeonPreview.accentInk(theme));
        root.style.colorScheme = theme.mode;
        root.dataset.mode = theme.mode;
        title.textContent = theme.name;
        inspiration.textContent = `${theme.mode === "dark" ? "Dark" : "Light"} · inspired by ${theme.inspiration}`;
        swatches.replaceChildren(...properties.map(key => {
            const item = document.createElement("li");
            item.style.setProperty("--swatch", theme[key]);
            item.innerHTML = `<span></span><b>${key}</b><code>${theme[key]}</code>`;
            return item;
        }));
        checks.replaceChildren(...ThemeNeonPreview.checks(theme).map(([label, ratio]) => {
            const item = document.createElement("li");
            const minimum = label === "Focus ring" ? 3 : 4.5;
            item.className = ratio >= minimum ? "is-pass" : "is-fail";
            item.textContent = `${label}: ${ratio.toFixed(1)}:1 ${ratio >= minimum ? "✓" : "✗"}`;
            return item;
        }));
        grid.querySelectorAll("button").forEach(button =>
            button.setAttribute("aria-pressed", String(button.dataset.theme === theme.id)));
        try { localStorage.setItem("theme-neon-preview", theme.id); } catch (error) { }
    }

    function renderGrid() {
        grid.replaceChildren(...ThemeNeonPreview.ordered().map(theme => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.theme = theme.id;
            button.style.cssText = `--t-bg:${theme.bg};--t-surface:${theme.surface};--t-accent:${theme.accent};` +
                `--t-a:${theme.neonA};--t-b:${theme.neonB};--t-ink:${theme.ink}`;
            button.innerHTML = `<span class="tile-art" aria-hidden="true"><i></i><i></i><i></i></span>` +
                `<strong>${theme.name}</strong><small>${theme.inspiration}</small>`;
            button.addEventListener("click", () => { selected = theme.id; apply(theme); });
            return button;
        }));
    }

    function renderCards() {
        if (typeof Card === "undefined") { return; }
        const art = (suit, rank) => new Card(suit, rank).toImageDataUri("normal", "none");
        const table = document.getElementById("mockTable");
        const hand = document.getElementById("mockHand");
        table.replaceChildren(...[[2, 9], [3, 9], [4, 9]].map(([suit, rank], index) => {
            const image = document.createElement("img");
            image.src = art(suit, rank);
            image.alt = "";
            image.style.setProperty("--i", index);
            return image;
        }));
        hand.replaceChildren(...[[1, 3], [2, 5], [3, 7], [4, 10], [1, 12], [2, 1]].map(([suit, rank], index) => {
            const image = document.createElement("img");
            image.src = art(suit, rank);
            image.alt = new Card(suit, rank).getName();
            image.className = index === 3 ? "is-selected" : "";
            return image;
        }));
    }

    try {
        document.getElementById("neonSlot").innerHTML = ThemeNeonPreview.neonSign("neon-main");
        renderGrid();
        renderCards();
        let saved = null;
        try { saved = localStorage.getItem("theme-neon-preview"); } catch (error) { }
        selected = ThemeNeonPreview.themes.some(theme => theme.id === saved) ? saved : selected;
        apply(ThemeNeonPreview.themes.find(theme => theme.id === selected));
        uiToggle.addEventListener("change", () => { mock.dataset.ui = uiToggle.checked ? "proposed" : "current"; });
        logoToggle.addEventListener("change", () => { mock.dataset.logo = logoToggle.checked ? "neon" : "original"; });
        const menu = mock.querySelector(".mock-menu");
        Array.from(menu.children).filter(child => !child.classList.contains("mock-logo"))
            .forEach((child, index) => child.style.setProperty("--intro-index", index));
        document.getElementById("replayIntro").addEventListener("click", () => {
            menu.classList.remove("is-intro");
            void menu.offsetWidth;
            menu.classList.add("is-intro");
        });
        document.getElementById("proposalList").replaceChildren(...ThemeNeonPreview.proposals.map(([name, text]) => {
            const item = document.createElement("li");
            item.innerHTML = `<strong>${name}</strong><span>${text}</span>`;
            return item;
        }));
        status.textContent = `${ThemeNeonPreview.themes.length} themes ready.`;
    } catch (error) {
        status.textContent = `Could not build the preview: ${error.message}`;
        status.classList.add("is-error");
        console.error(error);
    }
}
