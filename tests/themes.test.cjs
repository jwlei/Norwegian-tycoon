const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const css = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const themeCss = fs.readFileSync(path.join(__dirname, "..", "css", "color-themes.css"), "utf8");
const themes = ["classic", "darcula", "skumring", "hostlov", "kobolt", "monokai", "furu", "solarisert", "fjord", "modern", "atom",
    "nattugle", "vampyr", "mokka", "synthwave", "rose", "glod", "amoled", "sandstein", "salvie", "skifer", "lavendel", "sol", "papir", "vs-bla", "kontrast"];
const lightThemes = ["sandstein", "salvie", "skifer", "lavendel", "sol", "papir", "vs-bla"];

test("message timer bar restores, saves and synchronizes independently from message visibility", () => {
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = connection.indexOf("        function updateMessageTimerBar(");
    const block = connection.slice(start, connection.indexOf("        function updatePlayInputButtons()", start));
    for (const saved of [null, "true", "false", "invalid"]) {
        const button = {
            attributes: {},
            setAttribute(key, value) { this.attributes[key] = value; },
            getAttribute(key) { return this.attributes[key]; },
            addEventListener(type, handler) { this[type] = handler; }
        };
        const body = { dataset: {} }, writes = [], listeners = [];
        let hidden = false;
        const context = vm.createContext({
            document: { body, getElementById: () => button },
            window: { addEventListener(type, listener) { listeners.push(listener); } },
            gameToastsHidden: () => hidden,
            getCookie(key) { assert.equal(key, "MessageTimerBar"); return saved; },
            setCookie(...args) { writes.push(args); }
        });
        vm.runInContext(block, context);
        assert.equal(body.dataset.messageTimerBar, saved === "false" ? "off" : "on");
        button.click();
        assert.deepEqual(writes.pop(), ["MessageTimerBar", saved === "false", 1000]);
        hidden = true;
        button.click();
        assert.equal(writes.length, 0);
        listeners[0]({ key: "norwegian-tycoon-cookie-MessageTimerBar", newValue: "false" });
        assert.equal(body.dataset.messageTimerBar, "off");
        listeners[0]({ key: "norwegian-tycoon-cookie-MessageTimerBar", newValue: null });
        assert.equal(body.dataset.messageTimerBar, "on");
    }
});

test("table surface selection is removed while delayed card outlines retain the theme accent", () => {
    const refresh = fs.readFileSync(path.join(__dirname, "..", "css", "ui-refresh.css"), "utf8");
    assert.doesNotMatch(refresh, /data-table-surface/);
    assert.doesNotMatch(html, /data-table-surface/);
    assert.match(css, /\.table-play__beat-outline \{[^}]*box-shadow: inset 0 0 0 2px var\(--accent\);/);
});

test("message options share a box and the optional timer bar has no effect on toast timing", () => {
    const section = html.slice(html.indexOf('id="messageSettings"'), html.indexOf('</section>', html.indexOf('id="messageSettings"')));
    for (const option of ["hideToastsToggleButton", 'data-speed="normal"', 'data-max-messages="2"', "messageTimerBarToggleButton"]) {
        assert.ok(section.includes(option), option);
    }
    assert.match(css, /body\[data-message-timer-bar="off"\] \.game-toast::after \{\s*display: none;\s*animation: none;/);
    const refresh = fs.readFileSync(path.join(__dirname, "..", "css", "ui-refresh.css"), "utf8");
    assert.match(refresh, /\.message-settings\.is-enabled \{[^}]*border: 1px solid var\(--line\);/);
    assert.match(css, /\.leaderboard-table th \{[^}]*position: sticky;[^}]*top: 0;/);
    assert.match(css, /\.leaderboard-table-scroll \{[^}]*overflow: auto;/);
    assert.match(refresh, /#dialogRules \.play-guide-shortcut \{[^}]*margin: 0 auto 12px;[^}]*background: transparent;/);
});

test("settings finish with performance controls and keep the PIN input beside its switch", () => {
    const settings = html.slice(html.indexOf('id="dialogSettings"'), html.indexOf('id="dialogColorTheme"'));
    assert.ok(settings.indexOf("Ytelse") > settings.indexOf("Kortstyring"));
    assert.ok(settings.indexOf('id="idleFoilAnimationToggleButton"') > settings.indexOf("Ytelse"));
    assert.ok(settings.indexOf('aria-label="Kortskygger"') > settings.indexOf("Ytelse"));
    assert.match(settings, /id="cardAppearanceLocked" hidden/);
    assert.match(html, /class="player-pin-row">[\s\S]*?id="playerUsePin"[\s\S]*?id="playerPinFields" hidden>[\s\S]*?id="playerRecoveryPin"/);
    const refresh = fs.readFileSync(path.join(__dirname, "..", "css", "ui-refresh.css"), "utf8");
    assert.match(refresh, /\.player-pin-row \{\s*display: flex;/);
    assert.match(refresh, /#splashPlayerName \{[^}]*text-decoration: none;/);
    assert.match(refresh, /#splashPlayerName \.splash-player-id \{\s*text-decoration: underline dotted;/);
    assert.match(refresh, /:not\(\.Lobby\):not\(\.GameFinished\)[^{]+\.player-summary\.is-finished \{\s*--player-summary-opacity: \.68;\s*opacity: \.68;/);
    assert.match(css, /@keyframes settle-in[\s\S]*?to \{\s*opacity: var\(--player-summary-opacity, 1\);/);
});

test("visual play guide and splash progress hint are accessible, bilingual shortcuts", () => {
    assert.match(html, /id="splashPlayerName"[^>]*role="button" tabindex="0"[^>]*aria-controls="dialogSaveProfile"/);
    const guide = html.slice(html.indexOf('id="dialogPlayGuide"'), html.indexOf('id="dialogRules"'));
    const translations = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
    assert.equal((guide.match(/<section>/g) || []).length, 5);
    for (const [, paragraph] of guide.matchAll(/<p>([^<]+)<\/p>/g)) {
        assert.ok(translations.includes(`"${paragraph}":`), paragraph);
    }
    const rules = html.slice(html.indexOf('id="dialogRules"'), html.indexOf('id="dialogGameLog"'));
    assert.match(rules, /class="play-guide-shortcut"/);
    assert.doesNotMatch(rules, /3, 5 eller 7 sekunder|5–10 sekunder/);
    assert.match(html, /id="dialogSaveProfile"[\s\S]*?samme navn og PIN på andre enheter/);
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    assert.match(connection, /getElementById\("splashPlayerName"\)\.addEventListener\("keydown"[\s\S]*?event.key == "Enter" \|\| event.key == " "/);
});

test("rules separate player counts, keep voting on the voting screen, and translate every paragraph", () => {
    const rules = html.slice(html.indexOf('id="dialogRules"'), html.indexOf('id="dialogGameLog"'));
    assert.match(rules, /Spill alle kortene dine\./);
    assert.match(rules, /Kortstyrke:/);
    assert.match(rules, /<strong>Hvem starter:<\/strong> <span>Hjerter 3 starter første runde, eller en tilfeldig spiller med to spillere\. Deretter starter Boms\.<\/span>/);
    assert.doesNotMatch(rules, /Sneaky|h4cker|Lobby|lobby|Flertallet bestemmer/);
    const playerBox = rules.match(/<section class="rules-player-box">([\s\S]*?)<\/section>/);
    assert.ok(playerBox, "Player-count controls and rules share a bordered section");
    assert.match(playerBox[1], /class="rules-player-options speed-options"/);
    assert.doesNotMatch(playerBox[1], /starter første runde|starter Boms/);
    const boxStyles = css.match(/\.rules-player-box\s*\{([^}]+)\}/)[1];
    assert.match(boxStyles, /border: 1px solid var\(--line\)/);
    assert.match(boxStyles, /background: var\(--surface-soft\)/);
    for (const count of [2, 3, 4]) {
        assert.match(rules, new RegExp(`data-rules-players="${count}"`));
        assert.match(playerBox[1], new RegExp(`id="rulesPlayers${count}"${count == 3 ? "" : " hidden"}`));
    }
    const translations = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
    for (const [, paragraph] of rules.matchAll(/<p>([^<]+)<\/p>/g)) {
        assert.ok(translations.includes(`"${paragraph}":`), `Missing translation: ${paragraph}`);
    }
    assert.match(translations, /"Boms": "Bum"/);
    assert.match(translations, /"Viseboms": "Vice Bum"/);
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    assert.doesNotMatch(connection, /querySelectorAll\("\.speed-option"\)/);
    const layout = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    assert.match(layout, /round-start-vote__hint/);
    assert.match(layout, /Flertallet bestemmer\. Verten avgjør ved uavgjort\./);
});

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

function themePalette(theme) {
    const block = themeCss.match(new RegExp(`:root\\[data-color-theme="${theme}"\\],\\s*\\[data-color-preview="${theme}"\\]\\s*\\{([^}]*)\\}`));
    assert.ok(block, `Missing palette for ${theme}`);
    return Object.fromEntries(Array.from(block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g), match => [match[1], match[2].trim()]));
}

test("twenty-six themes are grouped by category and hue with a complete palette and fixed mode", () => {
    const options = Array.from(html.matchAll(/class="color-theme-option" data-color-theme="([^"]+)" data-theme-mode="([^"]+)"/g),
        match => [match[1], match[2]]);
    assert.deepEqual(options.map(([theme]) => theme), themes);
    assert.deepEqual(options.filter(([, mode]) => mode === "light").map(([theme]) => theme), lightThemes);
    assert.doesNotMatch(html, /class="theme-toggle/, "The theme decides dark or light mode");
    const categories = Array.from(html.matchAll(/data-theme-category="([^"]+)"[^>]*>[\s\S]*?(?=<h3 class="settings-category" data-theme-category|<\/div>\s*<div class="dialog-footer")/g));
    assert.deepEqual(categories.map(match => match[1]), ["classic", "dark", "mid", "light", "contrast"]);
    for (const category of categories) {
        const accents = Array.from(category[0].matchAll(/class="color-theme-option" data-color-theme="([^"]+)"/g), match => match[1])
            .filter(theme => theme != "amoled").map(theme => hue(rgb(themePalette(theme)["--accent"])));
        assert.deepEqual(accents, [...accents].sort((a, b) => a - b), category[1]);
    }
    for (const theme of themes) {
        const palette = themePalette(theme);
        assert.ok(html.includes(`data-color-preview="${theme}"`));
        for (const name of ["felt", "felt-deep", "surface", "surface-soft", "ink", "muted", "line", "accent", "on-accent",
            "accent-hover", "focus", "neon-a", "neon-b"]) {
            assert.ok(palette[`--${name}`], `${theme} is missing ${name}`);
        }
    }
    const head = html.slice(0, html.indexOf("</head>"));
    assert.match(head, /id="applySavedColorTheme"/, "The saved theme applies before first paint");
    for (const theme of lightThemes) { assert.match(head, new RegExp(`["\\s{]${theme.replace("-", "\\-")}"?: true`)); }
});

for (const theme of themes) {
    test(`${theme} keeps readable text, controls and distinguishable status colours in its own mode`, () => {
        const palette = themePalette(theme);
        const mode = lightThemes.includes(theme) ? "light" : "dark";
        const base = declarations(":root");
        const surface = rgb(palette["--surface"]);
        const soft = rgb(palette["--surface-soft"]);
        const ink = rgb(palette["--ink"]);
        const muted = rgb(palette["--muted"]);
        for (const [name, background] of [["panel", surface], ["raised", soft], ["page", rgb(palette["--felt-deep"])]]) {
            assert.ok(contrast(ink, background) >= 7, `${theme}: primary text on ${name}`);
            assert.ok(contrast(muted, background) >= 4.5, `${theme}: secondary text on ${name}`);
        }
        assert.ok(contrast(rgb(palette["--line"]), surface) >= 3, `${theme}: control border contrast`);
        assert.ok(contrast(rgb(palette["--line"]), soft) >= 3, `${theme}: raised control border contrast`);
        assert.ok(contrast(rgb(palette["--on-accent"]), rgb(palette["--accent"])) >= 4.5, `${theme}: button text contrast`);
        assert.ok(Math.max(contrast(rgb(palette["--focus"]), surface), contrast(rgb(palette["--focus"]), rgb(palette["--felt-deep"]))) >= 3,
            `${theme}: focus ring contrast`);
        const hues = [];
        for (const role of ["success", "warning", "danger"]) {
            const color = rgb(palette[`--${role}`] || base[`--${role}${mode === "light" ? "-light" : ""}`]);
            const tint = mix(color, surface, role === "danger" ? .12 : .18);
            assert.ok(contrast(color, tint) >= 4.5, `${theme}/${role}: status text contrast ${contrast(color, tint).toFixed(2)}`);
            assert.ok(contrast(ink, tint) >= 4.5, `${theme}/${role}: body text on status tint`);
            hues.push(hue(color));
        }
        for (let first = 0; first < hues.length; first++) {
            for (let second = first + 1; second < hues.length; second++) {
                const distance = Math.abs(hues[first] - hues[second]);
                assert.ok(Math.min(distance, 360 - distance) >= 25, `${theme}: status hues must be at least 25 degrees apart`);
            }
        }
        for (const fill of ["--success-light", "--danger-light"]) {
            assert.ok(contrast(rgb("#fff"), rgb(base[fill])) >= 4.5, `${theme}/${fill}: status button text contrast`);
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
    const refresh = fs.readFileSync(path.join(__dirname, "..", "css", "ui-refresh.css"), "utf8");
    assert.match(refresh, /\.color-theme-preview > span \+ span\s*\{[^}]*var\(--neon-a\)[^}]*var\(--neon-b\)/);
});

test("playback and suggestion controls stay visually unbuttoned on hover and press", () => {
    assert.match(css, /#fastForwardButton:hover,\s*#autoSuggestionToggleButton:hover,\s*#autoPassToggleButton:hover,\s*#fastForwardButton:active,\s*#autoSuggestionToggleButton:active,\s*#autoPassToggleButton:active\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*transform:\s*none;[^}]*filter:\s*none;/);
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
    assert.match(html, /<svg class="auto-suggestion-on"[^>]*aria-hidden="true"[^>]*>.*<circle cx="16"/);
    assert.match(html, /<svg class="auto-suggestion-off"[^>]*aria-hidden="true"[^>]*>.*<circle cx="8"/);
    assert.match(css, /#autoSuggestionToggleButton\[aria-pressed="true"\] > \.auto-suggestion-on,\s*#autoPassToggleButton\[aria-pressed="true"\] > \.auto-pass-on\s*\{\s*color:\s*var\(--success\);/);
    assert.match(css, /#suggestionControls\s*\{[^}]*top:\s*4px;[^}]*left:\s*8px;/);
    assert.match(css, /#fastForwardButton,\s*#autoSuggestionToggleButton,\s*#autoPassToggleButton\s*\{[^}]*color:\s*var\(--muted\);/);
    assert.match(css, /#autoSuggestionToggleButton > \[aria-hidden\],\s*#autoPassToggleButton > \[aria-hidden\]\s*\{[^}]*font-size:\s*20px;/);
    assert.match(css, /#autoSuggestionToggleButton\[aria-pressed="false"\] > \.auto-suggestion-on,\s*#autoSuggestionToggleButton\[aria-pressed="true"\] > \.auto-suggestion-off,\s*#autoPassToggleButton\[aria-pressed="false"\] > \.auto-pass-on,\s*#autoPassToggleButton\[aria-pressed="true"\] > \.auto-pass-off\s*\{\s*display:\s*none;/);
    const game = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
    assert.ok(game.includes('getCookie("AutoSuggestPlayableCards") != "false"'));
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    assert.ok(!connection.includes('document.getElementById("autoSuggestionToggleButton").hidden'));
});

test("Suggest move and opt-in Auto pass share a row with fast-forward", () => {
    assert.match(html, /<span>Foreslå trekk<\/span>/);
    assert.match(html, /id="autoPassToggleButton"[^>]*aria-pressed="false"/);
    assert.ok(html.indexOf('id="autoPassToggleButton"') > html.indexOf('id="autoSuggestionToggleButton"'));
    assert.match(css, /#suggestionControls\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*4px;/);
    assert.match(css, /#gameShell\.game-active:not\(\.Lobby\):not\(\.GameFinished\) > #playerActions\s*\{[^}]*padding-top:\s*calc\(80px - var\(--mobile-table-extra-space, 0px\)\);/);
    const translations = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
    assert.ok(translations.includes('"Foreslå trekk": "Suggest move"'));
    assert.ok(translations.includes('"Auto-pass": "Auto pass"'));
});

test("auto pass uses distinct switch icons with right-on and left-off positions", () => {
    const control = html.slice(html.indexOf('id="autoPassToggleButton"'), html.indexOf('id="gameToastRegion"'));
    assert.match(control, /<svg class="auto-pass-on"[^>]*aria-hidden="true"[^>]*>.*<circle cx="16"/);
    assert.match(control, /<svg class="auto-pass-off"[^>]*aria-hidden="true"[^>]*>.*<circle cx="8"/);
    assert.doesNotMatch(control, /auto-suggestion-on|auto-suggestion-off/);
    assert.match(css, /#autoPassToggleButton\[aria-pressed="true"\] > \.auto-pass-on\s*\{\s*color:\s*var\(--success\);/);
});

test("mobile tables reclaim seventy percent of a pass button from action spacing", () => {
    assert.match(css, /@media \(max-width: 760px\), \(max-height: 500px\) and \(pointer: coarse\)\s*\{\s*#gameShell\.game-active:not\(\.Lobby\):not\(\.GameFinished\)\s*\{\s*--mobile-table-extra-space:\s*calc\(var\(--mobile-pass-button-height, 44px\) \* 0\.7\);/);
    assert.match(css, /--mobile-pass-button-height:\s*36px;/);
    assert.equal(Array.from(css.matchAll(/calc\((?:124|132)px - var\(--mobile-table-extra-space, 0px\)\)/g)).length, 3);
    assert.match(css, /padding-top:\s*calc\(80px - var\(--mobile-table-extra-space, 0px\)\);/);
});

test("Norwegian passed-player badges use Pass", () => {
    const layout = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    assert.match(layout, /else if \(isPassed\) \{\s*turnText = "Pass";/);
    assert.doesNotMatch(layout, /"Passet"/);
});

test("desktop uses taller two-line toasts and the same shell and toolbar in every screen", () => {
    const start = css.indexOf("@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) and (pointer: fine)");
    const end = css.indexOf("\n@media", start + 1);
    const desktop = css.slice(start, end);
    assert.match(desktop, /#gameToastRegion\s*\{\s*--board-toast-height:\s*48px;/);
    assert.match(desktop, /--toast-stack-height:\s*102px;/);
    assert.match(desktop, /--toast-stack-height:\s*48px;/);
    assert.match(desktop, /#gameShell\s*\{[^}]*width:\s*min\(100%, 980px\);[^}]*margin:\s*0 auto;/);
    assert.match(desktop, /#gameShell > #settingsButton\s*\{/);
    assert.match(desktop, /#gameShell > \.topbar-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3, 44px\);/);
    for (const [id, column] of [["gameLogButton", 1], ["rulesButton", 2], ["homeButton", 3]]) {
        assert.match(desktop, new RegExp(`#${id} \\{\\s*grid-column: ${column};`));
    }
});

test("portrait layouts keep the player name row above the table at phone and tablet widths", () => {
    const start = css.indexOf("@media (orientation: portrait) {");
    assert.notEqual(start, -1);
    const end = css.indexOf("\n@media", start + 1);
    const portrait = css.slice(start, end);
    assert.match(portrait, /#gameShell\.game-active\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    for (const [id, row] of [["playerList", 2], ["gameTable", 3], ["playerActions", 4], ["playerHand", 5]]) {
        assert.match(portrait, new RegExp(`#gameShell\\.game-active > #${id}\\s*\\{[^}]*grid-column:\\s*1 / -1;[^}]*grid-row:\\s*${row} / ${row + 1};`));
    }
});

test("PIN toggle aligns with the full-width name field without horizontal button margins", () => {
    assert.match(css, /#playerUsePin\s*\{\s*margin:\s*8px 0;\s*\}/);
});

test("visible release and versioned local assets use version 1.1.0", () => {
    assert.ok(html.includes('aria-label="Spillversjon 1.1.0">v1.1.0</span>'));
    const versions = Array.from(html.matchAll(/(?:src|href)="(?:js|css)\/[^"]+\?v=([^"&]+)/g),
        match => match[1]);
    assert.ok(versions.length > 0);
    assert.ok(versions.every(version => version === "1.1.0"));
});

test("splash profile text wraps so long names cannot hide the logged-in player ID", () => {
    const rule = css.match(/#splashPlayerName\s*\{([^}]+)\}/)[1];
    assert.match(rule, /overflow-wrap:\s*anywhere;/);
    assert.match(rule, /white-space:\s*normal;/);
    assert.doesNotMatch(rule, /text-overflow:\s*ellipsis|overflow:\s*hidden/);
});

test("leaderboard uses a centered title and no visible hint text", () => {
    const dialog = html.slice(html.indexOf('id="dialogLeaderboard"'), html.indexOf('id="dialogResults"'));
    assert.match(dialog, /class="dialog-title">Leaderboard<\/div>/);
    assert.match(css, /#dialogLeaderboard \.dialog-title\s*\{[^}]*text-align:\s*center;/);
    assert.doesNotMatch(dialog, /leaderboard-description/);
    const headers = [...dialog.matchAll(/data-leaderboard-sort="([^"]+)"[^>]*>([^<]+)<\/button>/g)]
        .map(match => [match[1], match[2]]);
    assert.deepEqual(headers, [
        ["name", "Spiller"], ["roundsPlayed", "↻"], ["presidentWins", "👑"],
        ["bomsCount", "🗑️"], ["placementScore", "Score"],
        ["longestPresidentStreak", "🔥👑"], ["longestBomsStreak", "🔥🗑️"]
    ]);
    const translations = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
    assert.match(translations, /"Spiller": "Player"/);
    assert.match(translations, /"Antall runder spilt": "Rounds played"/);
    assert.match(dialog, /data-leaderboard-sort="roundsPlayed" title="Antall runder spilt" aria-label="Antall runder spilt">↻/);
    assert.match(translations, /"Score": "Score"/);
    assert.match(dialog, /role="status" aria-live="polite"/);
});

test("leaderboard has smaller text and compact mobile cells without shrinking sorting tap heights", () => {
    assert.match(css, /\.leaderboard-table\s*\{[^}]*font-size:\s*0\.8125rem;/);
    assert.match(css, /\.leaderboard-table th button\s*\{[^}]*min-height:\s*40px;[^}]*font:\s*inherit;/);
    const mobile = css.slice(css.indexOf("@media (max-width: 480px)", css.indexOf(".leaderboard-table {")));
    assert.match(mobile, /\.leaderboard-table\s*\{[^}]*font-size:\s*0\.75rem;/);
    assert.match(mobile, /\.leaderboard-table th button\s*\{[^}]*font-size:\s*0\.6875rem;/);
    assert.match(mobile, /max-width:\s*clamp\(64px, 22vw, 112px\);/);
});

test("required cards pulse for one second then rest for two, without competing with foil", () => {
    assert.match(css, /\.table-play__beat-outline\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--accent\);[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/);
    assert.match(css, /:has\(> \.table-pile-summary--required:not\(\[hidden\]\)\):not\(:has\(#gameToastRegion:not\(\[hidden\]\) > \.game-toast\.is-visible\)\) \.table-play__beat-outline\s*\{[^}]*animation:\s*required-pile-pulse 3s ease-in-out infinite;/);
    assert.match(css, /@keyframes required-pile-pulse\s*\{\s*0%, 33\.333%, 100% \{ opacity: 0; \}\s*16\.667% \{ opacity: 0\.55; \}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*#gameTable \.table-play__beat-outline\s*\{\s*animation:\s*none !important;/);
});

test("settings use concise hints and mode-specific card control descriptions inside the option", () => {
    const settings = html.slice(html.indexOf('id="dialogSettings"'), html.indexOf('id="dialogColorTheme"'));
    assert.match(settings, /<strong>Meldinger<\/strong><small>Varighet på meldinger om spillhendelser<\/small>/);
    assert.match(settings, /<small>Maks synlige meldinger<\/small>/);
    for (const value of [1, 2]) {
        assert.ok(settings.includes(`class="speed-option" data-max-messages="${value}"`));
    }
    assert.match(settings, /<strong>Animasjonshastighet<\/strong><\/span>/);
    assert.match(settings, /<strong>Kortstyring<\/strong><\/span>/);
    assert.match(settings, /data-play-input="flick"[^>]*>Flick\/Drag<\/button>/);
    assert.match(settings, /data-play-input="button"[^>]*>Knapp<\/button>/);
    assert.match(settings, /data-play-input="both"[^>]*>Begge<\/button>/);
    assert.match(settings, /<\/span>\s*<span class="setting-row__text" aria-live="polite">\s*<small id="playInputFlickHint">Dra kort og slipp på brettet, eller flick dem opp\.<\/small>\s*<small id="playInputButtonHint" hidden>Velg kort og bekreft med spillknappen<\/small>\s*<\/span>\s*<\/div>/);
    assert.doesNotMatch(settings, /<p class="color-theme-description">/);
    const themes = html.slice(html.indexOf('id="dialogColorTheme"'), html.indexOf('id="dialogCardFoil"'));
    assert.doesNotMatch(themes, /color-theme-description/);
    const foils = html.slice(html.indexOf('id="dialogCardFoil"'), html.indexOf('id="dialogJoinGame"'));
    assert.match(foils, /<p class="color-theme-description">Folie legges over kortstilen<\/p>/);
    const translations = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
    for (const text of ["Messages", "Max visible messages", "Duration of game event messages", "Drag cards and release on the board or flick them up.",
        "Choose cards and confirm with the play button", "Both", "Foil overlays the card style"]) {
        assert.ok(translations.includes(`"${text}"`));
    }
});

test("settings and appearance close buttons use the same centered layout as rules", () => {
    for (const id of ["dialogSettings", "dialogCardStyle", "dialogCardFoil", "dialogColorTheme", "dialogPlayGuide", "dialogResults"]) {
        assert.match(css, new RegExp(`#${id} \\.dialog-footer,[\\s\\S]*?float: none;[\\s\\S]*?justify-content: center;`));
        assert.match(css, new RegExp(`#${id} \\.dialog-footer > button,[\\s\\S]*?width: min\\(100%, 240px\\);`));
        assert.match(css, new RegExp(`#${id} \\.dialog-window,[\\s\\S]*?display: flex;[\\s\\S]*?overflow: hidden;`));
        assert.match(css, new RegExp(`#${id} \\.dialogBody,[\\s\\S]*?min-height: 0;[\\s\\S]*?overflow-y: auto;`));
    }
    assert.match(css, /#gameToastRegion\[data-max-visible="1"\]\s*\{[^}]*height: var\(--board-toast-height\);/);
    assert.doesNotMatch(css, /#gameToastRegion\[data-animation-speed="fast"\][^{]*\{[^}]*height:/);
});

test("the favicon layers a four-leaf clover emoji in front of an ace of spades", () => {
    assert.ok(html.includes('rel="icon" type="image/svg+xml" href="icons/clover-four.svg"'));
    const icon = fs.readFileSync(path.join(__dirname, "..", "icons", "clover-four.svg"), "utf8");
    assert.match(icon, /&#x1F340;/);
    assert.match(icon, /Segoe UI Emoji/);
    assert.match(icon, />A<\/text>/);
    assert.match(icon, /&#x2660;/);
    assert.ok(icon.indexOf("&#x1F340;") > icon.indexOf("&#x2660;"));
});
