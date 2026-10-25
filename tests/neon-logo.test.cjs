const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function neonLogo() {
    const context = vm.createContext({});
    vm.runInContext(read("js/neon-logo.js"), context);
    return vm.runInContext("NeonLogo", context);
}

function keyframes(css, name) {
    const start = css.indexOf(`@keyframes ${name}`);
    assert.ok(start >= 0, `Missing @keyframes ${name}`);
    let depth = 0, end = css.indexOf("{", start);
    for (; end < css.length; end++) {
        if (css[end] === "{") { depth++; }
        if (css[end] === "}" && --depth === 0) { break; }
    }
    return css.slice(css.indexOf("{", start) + 1, end);
}

test("neon logo keeps the original card layout and wordmark positions in both languages", () => {
    const api = neonLogo();
    for (const [language, main, sub, label] of [["no", "BOMS", "OG PRESIDENT", "Boms og President"],
        ["en", "NORWEGIAN", "TYCOON", "Norwegian Tycoon"]]) {
        const markup = api.markup(language, "logo");
        assert.equal((markup.match(/<svg /g) || []).length, 5, "shadow, glow, halo, tube and core layers");
        assert.match(markup, new RegExp(`aria-label="${label}"`));
        assert.match(markup, /data-i18n-skip/, "Translation never rewrites the drawn wordmark");
        assert.match(markup, new RegExp(`<text x="168" y="\\d+"[^>]*>${main}</text>`));
        assert.match(markup, new RegExp(`<text x="172" y="108"[^>]*>${sub}</text>`));
        assert.match(markup, /<path d="M171\.5 120\.5H396\.5"/, "The underline sits where the original logo had it");
        assert.match(markup, /transform="rotate\(-9 66 72\)"[\s\S]*?<rect x="28" y="20" width="76" height="104" rx="12"\/>/);
        assert.match(markup, /transform="rotate\(8 99 67\)"[\s\S]*?<rect x="61" y="15" width="76" height="104" rx="12"\/>/);
        assert.match(markup, />A<\/text>[\s\S]*>K<\/text>/);
        assert.match(markup, /mask="url\(#logo-[a-z]+-behind\)"/, "The front card hides the card behind it");
        assert.match(markup, /stroke:var\(--neon-a\)/);
        assert.match(markup, /stroke:var\(--neon-b\)/);
        assert.doesNotMatch(markup, /acrylic|screw|support/, "No sign backboard");
        const ids = markup.match(/ id="[^"]+"/g);
        assert.equal(new Set(ids).size, ids.length, "Every layer uses its own SVG ids");
    }
    assert.equal(api.escape('<"&>'), "&lt;&quot;&amp;&gt;");
    assert.equal(api.markup("unknown", "x"), api.markup("no", "x"));
});

test("the neon logo renders before blocking scripts and follows the selected language", () => {
    const html = read("index.html");
    const menu = html.slice(html.indexOf('<div id="mainMenu"'), html.indexOf('<button type="button" id="newGameButton"'));
    assert.match(menu, /<div id="mainMenu" class="is-intro"/);
    assert.match(menu, /data-neon-logo="splash-logo"/);
    assert.match(menu, /<script src="js\/neon-logo\.js[^"]*"><\/script>/);
    assert.ok(html.indexOf("js/neon-logo.js") < html.indexOf("firebase-app.js"), "Logo script runs before Firebase loads");
    assert.match(read("js/i18n.js"), /if \(window\.NeonLogo\) \{ window\.NeonLogo\.render\(language\); \}/);
    const layout = read("js/layout.js");
    assert.match(layout, /setClass\(mainMenu, "is-hidden", true\);\s*\/\/[^\n]*\n\s*setClass\(mainMenu, "is-intro", false\);/,
        "The intro plays once per visit");
});

test("render centres every SVG layer on the actual artwork and refits when language changes", () => {
    const context = vm.createContext({});
    vm.runInContext(read("js/neon-logo.js"), context);
    const layers = Array.from({ length: 5 }, () => ({
        setAttribute(name, value) { this[name] = value; }
    }));
    const properties = {};
    let measurements = 0;
    const slot = {
        dataset: { neonLogo: "splash-logo" },
        style: { setProperty(name, value) { properties[name] = value; } },
        querySelector() {
            return { querySelector() { return { getBBox() {
                measurements++;
                return { x: 20, y: 10, width: slot.dataset.neonLanguage === "no" ? 390 : 460, height: 120 };
            } }; } };
        },
        querySelectorAll() { return layers; }
    };
    context.document = { querySelectorAll() { return [slot]; } };
    for (const [language, width] of [["no", 426], ["en", 496]]) {
        vm.runInContext(`NeonLogo.render("${language}")`, context);
        assert.ok(layers.every(layer => layer.viewBox === `2 -8 ${width} 156`));
        assert.equal(properties["--neon-width"], `${width}px`);
        assert.equal(properties["--neon-ratio"], `${width} / 156`);
        assert.equal(properties["--neon-scale"], width / 156);
        vm.runInContext(`NeonLogo.render("${language}")`, context);
    }
    assert.equal(measurements, 2, "Only measure when rendering a new language, never during animation");
    assert.match(read("css/ui-refresh.css"), /aspect-ratio: var\(--neon-ratio, 620 \/ 140\)/);
});

test("logo measurement works while the splash is hidden and cleans up its temporary SVG", () => {
    const context = vm.createContext({});
    vm.runInContext(read("js/neon-logo.js"), context);
    const bounds = { x: 20, y: 10, width: 460, height: 120 };
    const attributes = {};
    let appended = false, removed = false;
    const clone = {
        setAttribute(name, value) { attributes[name] = value; },
        querySelector() { return { getBBox() { assert.ok(appended); return bounds; } }; },
        remove() { removed = true; }
    };
    context.document = { body: { appendChild(node) { assert.equal(node, clone); appended = true; } } };
    context.svg = {
        querySelector() { return { getBBox() { return { width: 0 }; } }; },
        cloneNode(deep) { assert.equal(deep, true); return clone; }
    };
    assert.equal(vm.runInContext("NeonLogo.bounds(svg)", context), bounds);
    assert.ok(removed);
    assert.match(attributes.style, /visibility:hidden;pointer-events:none/);
    clone.querySelector = () => ({ getBBox() { throw new Error("measurement failed"); } });
    removed = false;
    assert.throws(() => vm.runInContext("NeonLogo.bounds(svg)", context), /measurement failed/);
    assert.ok(removed, "Cleanup also runs if measuring fails; errors are not swallowed");
});

test("AMOLED flattens UI surfaces without disabling neon, cards or focus outlines", () => {
    const css = read("css/ui-refresh.css");
    const flat = css.slice(css.indexOf("/* Flat AMOLED surfaces"));
    assert.match(flat, /:root\[data-color-theme="amoled"\] \{ --shadow: none; \}/);
    assert.match(flat, /:is\(#gameShell, #mainMenu, #gameTable\) \{\s*background: #000;/);
    assert.match(flat, /button, \.dialog-window,[\s\S]*?background-image: none !important;\s*box-shadow: none !important;/);
    assert.match(flat, /button:is\(:hover, :active\) \{\s*transform: none;/);
    assert.match(flat, /\.dialog-container \{ backdrop-filter: none; \}/);
    assert.doesNotMatch(flat, /animation:|outline:|\.card(?=[\s.{:#>])|\.neon-logo/);
});

test("neon pulse, flicker, flash and splash intro animate only opacity and transforms and respect reduced motion", () => {
    const css = read("css/ui-refresh.css");
    for (const name of ["neon-logo-pulse", "neon-logo-flicker", "neon-logo-flash", "neon-logo-ignite", "neon-logo-glow-on",
        "splash-fade-in", "splash-rise"]) {
        const frames = keyframes(css, name).replace(/(opacity|transform):[^;]+;/g, "");
        assert.doesNotMatch(frames, /[a-z-]+\s*:/, `${name} animates only opacity and transform`);
    }
    const motion = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    assert.match(motion, /\.neon-logo \{ animation: neon-logo-flash 11s steps\(1, end\) 4s infinite; \}/, "The sign keeps flashing occasionally");
    assert.match(motion, /\.neon-logo__flicker \{ animation: neon-logo-flicker 7s/);
    const ignite = Number(motion.match(/neon-logo-ignite 520ms steps\(1, end\) (\d+)ms/)[1]);
    const glow = Number(motion.match(/neon-logo-glow-on 380ms ease-out (\d+)ms/)[1]);
    const menu = Number(motion.match(/splash-rise 380ms cubic-bezier\([^)]*\) calc\((\d+)ms/)[1]);
    assert.ok(ignite < glow && menu > ignite && menu < glow + 380, "The menu rises soon after the sign starts to light");
    assert.match(css, /:root\[data-theme="light"\] \.neon-logo__tubes \* \{ stroke-width: 2\.1; \}/);
});

test("top bar buttons, segmented controls and switches use the refreshed theme styling", () => {
    const css = read("css/ui-refresh.css");
    assert.match(css, /#settingsButton,\s*#homeButton,\s*#gameLogButton,\s*#rulesButton,\s*\.game-menu-toggle \{[^}]*inset 0 1px 0/);
    assert.match(css, /\.quick-play-options,\s*\.language-options \{[^}]*border-radius: 12px;[^}]*inset 0 1px 3px/);
    assert.match(css, /#mainMenu \.quick-play-option\[aria-pressed="true"\],[\s\S]*?background: var\(--accent\);\s*color: var\(--on-accent\);/);
    assert.match(css, /\.setting-row\[aria-pressed="true"\] \.setting-row__switch \{[^}]*background: var\(--accent\);/);
    assert.match(css, /:focus-visible,\s*button:focus-visible \{\s*outline: 3px solid var\(--focus\);/);
    assert.match(css, /font-variant-numeric: tabular-nums;/);
    assert.doesNotMatch(css, /\.avatar|avatar\s*\{/, "Player seats have no avatars");
    const theme = read("css/theme.css");
    assert.doesNotMatch(theme, /background: var\(--accent\);\s*color: #fff;/, "Accent fills use the theme's readable text colour");
});
