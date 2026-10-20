const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const themes = ["teal", "classic", "blue", "forest", "amethyst", "burgundy", "amber", "gray", "amoled",
    "solarized", "dark-modern", "material", "darcula", "one-dark", "nord", "monokai", "gradianto"];

function declarations(selector) {
    const block = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
        .find(match => match[1].split(",").some(candidate => candidate.trim() === selector));
    assert.ok(block, `Missing selector ${selector}`);
    return Object.fromEntries(Array.from(block[2].matchAll(/(--[\w-]+):\s*([^;]+);/g),
        match => [match[1], match[2].trim()]));
}

function rgb(hex) {
    assert.match(hex, /^#[\da-f]{3}(?:[\da-f]{3})?$/i);
    const digits = hex.slice(1);
    const full = digits.length === 3 ? Array.from(digits, digit => digit + digit).join("") : digits;
    return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
}

function mix(first, second, weight) {
    return first.map((channel, index) => channel * weight + second[index] * (1 - weight));
}

function luminance(color) {
    const linear = color.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

function hue(color) {
    const [red, green, blue] = color;
    const max = Math.max(...color);
    const delta = max - Math.min(...color);
    assert.ok(delta > 0, "Status colors must not be neutral");
    const sector = max === red ? (green - blue) / delta :
        max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
    return (sector * 60 + 360) % 360;
}

test("all seventeen themes expose matching previews and complete semantic palettes", () => {
    const options = Array.from(html.matchAll(/class="color-theme-option" data-color-theme="([^"]+)"/g),
        match => match[1]);
    assert.deepEqual(options, themes);
    for (const theme of themes) {
        const palette = declarations(`[data-color-preview="${theme}"]`);
        assert.ok(html.includes(`data-color-preview="${theme}"`));
        for (const name of ["accent", "accent-hover", "success", "warning", "danger",
            "success-light", "warning-light", "danger-light"]) {
            assert.ok(palette[`--${name}`], `${theme} is missing ${name}`);
        }
    }
});

for (const theme of themes) {
    test(`${theme} preserves readable text and distinguishable status colors in both modes`, () => {
        const palette = { ...declarations(":root"), ...declarations(`[data-color-preview="${theme}"]`) };
        for (const mode of theme === "amoled" ? ["dark"] : ["dark", "light"]) {
            const surface = mode === "light" ? rgb(palette["--theme-light-surface"] || "#fff") :
                theme === "amoled" ? rgb("#000") :
                    palette["--theme-surface"] ? rgb(palette["--theme-surface"]) :
                        mix(rgb(palette["--accent"]), rgb("#252526"), 0.06);
            const ink = rgb(mode === "light" ? "#17212b" : "#f3f3f3");
            const muted = rgb(mode === "light" ? "#465564" : "#c4c4c4");
            const softSurface = mode === "light" ? mix(rgb(palette["--accent"]), rgb("#edf2f6"), 0.07) :
                theme === "amoled" ? rgb("#111") : palette["--theme-soft"] ? rgb(palette["--theme-soft"]) :
                    mix(rgb(palette["--accent"]), rgb("#2d2d30"), 0.08);
            const hover = mix(ink, softSurface, 0.06);
            assert.ok(contrast(ink, hover) >= 4.5, `${theme}/${mode}: hovered control text contrast`);
            assert.ok(contrast(muted, hover) >= 4.5, `${theme}/${mode}: hovered icon contrast`);
            const border = rgb(mode === "light" ? declarations(':root[data-theme="light"]')["--line"] :
                theme === "amoled" ? palette["--line"] : declarations(":root")["--line"]);
            assert.ok(contrast(border, surface) >= 3, `${theme}/${mode}: panel border contrast`);
            const hues = [];
            for (const role of ["success", "warning", "danger"]) {
                const color = rgb(palette[`--${role}${mode === "light" ? "-light" : ""}`]);
                const soft = mix(color, surface, role === "danger" ? 0.12 : 0.18);
                assert.ok(contrast(color, soft) >= 4.5,
                    `${theme}/${mode}/${role}: status text contrast ${contrast(color, soft).toFixed(2)}`);
                assert.ok(contrast(ink, soft) >= 4.5, `${theme}/${mode}/${role}: body text contrast`);
                assert.ok(contrast(muted, soft) >= 4.5, `${theme}/${mode}/${role}: detail text contrast`);
                hues.push(hue(color));
            }
            for (let first = 0; first < hues.length; first++) {
                for (let second = first + 1; second < hues.length; second++) {
                    const distance = Math.abs(hues[first] - hues[second]);
                    assert.ok(Math.min(distance, 360 - distance) >= 25,
                        `${theme}/${mode}: status hues must be at least 25 degrees apart`);
                }
            }
        }
        for (const fill of ["--accent", "--accent-hover", "--success-light", "--danger-light"]) {
            assert.ok(contrast(rgb("#fff"), rgb(palette[fill])) >= 4.5,
                `${theme}/${fill}: button text contrast`);
        }
    });
}

test("status surfaces use theme tokens instead of legacy fixed green, gold and red", () => {
    for (const fixed of ["#35c46a", "#17803d", "#39a95f", "#c5ad61", "#d8c783", "#a86060", "#b87878"]) {
        assert.ok(!css.includes(fixed), `Legacy status color ${fixed} remains`);
    }
    assert.match(css, /--success-soft:\s*color-mix/);
    assert.match(css, /--warning-soft:\s*color-mix/);
    assert.match(css, /--danger-soft:\s*color-mix/);
    assert.match(css, /\.color-theme-preview > span \+ span\s*\{[^}]*var\(--success\)[^}]*var\(--warning\)[^}]*var\(--danger\)/);
});

test("playback and suggestion controls stay visually unbuttoned on hover and press", () => {
    assert.match(css, /#fastForwardButton:hover,\s*#autoSuggestionToggleButton:hover,\s*#fastForwardButton:active,\s*#autoSuggestionToggleButton:active\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*transform:\s*none;[^}]*filter:\s*none;/);
});

test("card style names stay compact and on one line with responsive previews", () => {
    assert.match(css, /\.card-style-option > strong\s*\{[^}]*font-size:\s*0\.8rem;[^}]*white-space:\s*nowrap;/);
    assert.match(css, /\.card-style-option \.card-preview\s*\{[^}]*width:\s*clamp\(30px, 10vw, 52px\);/);
});

test("board toasts anchor four pixels above the bottom and keep turn controls clear", () => {
    assert.match(css, /#gameToastRegion\s*\{[^}]*bottom:\s*4px;/);
    assert.match(css, /#gameTable:has\(#gameToastRegion:not\(\[hidden\]\) > \.game-toast\.is-visible\) > :is\(#turnTimer, #tableTurnHint\)\s*\{[^}]*bottom:\s*calc\(var\(--toast-stack-height\) \+ 10px\);/);
    assert.ok(!css.includes("--toast-reserve"), "Toast overlays must not reserve card space");
    assert.doesNotMatch(css, /#gameTable[^{}]*:has\(#gameToastRegion[^{}]*\)[^{}]*\{[^}]*--table-card-height:/);
});

test("board toast uses one opacity animation owner and survives table redraws", () => {
    const rule = css.match(/#gameToastRegion > \.game-toast\s*\{([^}]*)\}/);
    assert.ok(rule);
    assert.match(rule[1], /transition:\s*visibility 120ms ease;/);
    assert.doesNotMatch(rule[1], /transition:[^;]*opacity/);
    const layout = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    assert.match(layout, /static clearTableContent\(table\)[\s\S]*?var persistent = new Set\(\[this\.toastRegion/);
    assert.match(layout, /static setTableContent\(table, html\)[\s\S]*?table\.insertAdjacentHTML\("afterbegin", html\)/);
});

test("table guidance is text-only and fades in after one second", () => {
    assert.match(css, /\.table-pile-summary\s*\{[^}]*z-index:\s*60;[^}]*bottom:\s*4px;[^}]*width:\s*min\(440px, calc\(100% - 20px\)\);[^}]*height:\s*40px;[^}]*white-space:\s*nowrap;/);
    assert.match(css, /\.table-pile-summary\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
    assert.match(css, /#gameTable:not\(:has\(#gameToastRegion:not\(\[hidden\]\) > \.game-toast\.is-visible\)\) > :is\(\.table-pile-summary, #tableTurnHint\)\s*\{[^}]*table-guidance-fade-in 240ms ease 1s both;/);
    assert.match(css, /#gameTable:has\(#gameToastRegion:not\(\[hidden\]\) > \.game-toast\.is-visible\) > :is\(\.table-pile-summary, #tableTurnHint\)\s*\{[^}]*opacity:\s*0;[^}]*animation:\s*none;/);
    assert.match(css, /#gameToastRegion\s*\{[^}]*z-index:\s*65;/);
    const layout = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    assert.ok(layout.includes('`På bordet ligger: ${describeRequiredPlay(game)}`'));
    assert.ok(layout.includes('`Du må slå: ${describeRequiredPlay(game)}`'));
    assert.match(layout, /tableSummary\.title = tableSummary\.textContent;/);
});

test("shuffle overlay uses a slower card animation, readable label and three-second duration", () => {
    assert.match(css, /\.shuffle-card\s*\{[^}]*animation:\s*shuffle-card-riffle 0\.775s ease-in-out infinite;/);
    assert.match(css, /\.shuffle-overlay\s*\{[^}]*background:\s*rgb\(0 0 0 \/ 45%\);/);
    assert.match(css, /\.shuffle-label\s*\{[^}]*padding:\s*10px 16px;[^}]*border:\s*1px solid var\(--line\);[^}]*background:\s*var\(--surface\);/);
    const game = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
    assert.match(game, /const SHUFFLE_DURATION_MS = 3000;/);
});

test("fast-forward controls live outside the board at the top-right of the actions area", () => {
    assert.match(html, /id="playerActions"[^>]*>\s*<div id="playbackControls">\s*<button[^>]*id="fastForwardButton"/);
    assert.match(css, /#playbackControls\s*\{[^}]*position:\s*absolute;[^}]*top:\s*4px;[^}]*right:\s*8px;/);
    const layout = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    assert.ok(!layout.includes("fastForwardElement"), "Table redraws must not reparent playback controls");
});

test("auto-suggestion is enabled by default and lives below the board on the left", () => {
    assert.equal(Array.from(html.matchAll(/id="autoSuggestionToggleButton"/g)).length, 1);
    const control = html.indexOf('id="suggestionControls"');
    assert.ok(control > html.indexOf('id="playerActions"'));
    assert.ok(control < html.indexOf('id="playerHand"'));
    assert.match(html, /id="autoSuggestionToggleButton"[^>]*aria-pressed="true"/);
    assert.match(html, /class="auto-suggestion-on" aria-hidden="true">✦/);
    assert.match(html, /class="auto-suggestion-off" aria-hidden="true">✧/);
    assert.match(css, /#suggestionControls\s*\{[^}]*top:\s*4px;[^}]*left:\s*8px;/);
    assert.match(css, /#fastForwardButton,\s*#autoSuggestionToggleButton\s*\{[^}]*color:\s*var\(--muted\);/);
    assert.match(css, /#autoSuggestionToggleButton > \[aria-hidden\]\s*\{[^}]*font-size:\s*20px;/);
    assert.match(css, /#autoSuggestionToggleButton\[aria-pressed="false"\] > \.auto-suggestion-on,\s*#autoSuggestionToggleButton\[aria-pressed="true"\] > \.auto-suggestion-off\s*\{\s*display:\s*none;/);
    const game = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
    assert.ok(game.includes('getCookie("AutoSuggestPlayableCards") != "false"'));
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    assert.ok(!connection.includes('document.getElementById("autoSuggestionToggleButton").hidden'));
});

test("desktop uses taller two-line toasts and the same shell and toolbar in every screen", () => {
    const start = css.indexOf("@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) and (pointer: fine)");
    const end = css.indexOf("\n@media", start + 1);
    const desktop = css.slice(start, end);
    assert.match(desktop, /#gameToastRegion\s*\{\s*--board-toast-height:\s*48px;/);
    assert.match(desktop, /--toast-stack-height:\s*102px;/);
    assert.match(desktop, /--toast-stack-height:\s*48px;/);
    assert.match(desktop, /#gameShell\s*\{[^}]*width:\s*min\(100%, 980px\);[^}]*margin:\s*0 auto;/);
    assert.match(desktop, /#gameShell > #BnInnstillinger\s*\{/);
    assert.match(desktop, /#gameShell > \.topbar-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3, 44px\);/);
    for (const [id, column] of [["BnFSpillogg", 1], ["BnFRegler", 2], ["homeButton", 3]]) {
        assert.match(desktop, new RegExp(`#${id} \\{\\s*grid-column: ${column};`));
    }
});

test("visible release and versioned local assets use version 0.9.1", () => {
    assert.ok(html.includes('aria-label="Spillversjon 0.9.1">v0.9.1</span>'));
    const versions = Array.from(html.matchAll(/(?:src|href)="(?:js|css)\/[^"]+\?v=([^"]+)"/g),
        match => match[1]);
    assert.ok(versions.length > 0);
    assert.ok(versions.every(version => version === "0.9.1"));
});

test("leaderboard uses a centered title and no visible hint text", () => {
    const dialog = html.slice(html.indexOf('id="dialogLeaderboard"'), html.indexOf('id="dialogResultater"'));
    assert.match(dialog, /class="dialog-title">Leaderboard<\/div>/);
    assert.match(css, /#dialogLeaderboard \.dialog-title\s*\{[^}]*text-align:\s*center;/);
    assert.doesNotMatch(dialog, /leaderboard-description/);
    assert.match(dialog, /data-leaderboard-sort="roundsPlayed"[^>]*>#<\/button>/);
    assert.match(dialog, /role="status" aria-live="polite"/);
});
