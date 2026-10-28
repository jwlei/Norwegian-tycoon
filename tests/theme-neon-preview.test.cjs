const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function preview() {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "sandbox", "theme-neon-preview.js"), "utf8"), context);
    return vm.runInContext("ThemeNeonPreview", context);
}

test("themes are unique, complete and span the colour spectrum in dark and light modes", () => {
    const api = preview();
    const keys = ["bg", "felt", "surface", "soft", "ink", "muted", "line", "accent", "focus", "neonA", "neonB"];
    assert.equal(api.themes.length, 20);
    assert.equal(new Set(api.themes.map(theme => theme.id)).size, api.themes.length);
    for (const theme of api.themes) {
        assert.ok(theme.name && theme.inspiration, theme.id);
        assert.ok(["dark", "light"].includes(theme.mode), theme.id);
        keys.forEach(key => assert.match(theme[key], /^#[0-9a-f]{6}$/i, `${theme.id}.${key}`));
    }
    const sectors = new Set(api.themes.flatMap(theme => [theme.accent, theme.neonA])
        .map(color => Math.floor(api.hue(color) / 60)));
    assert.equal(sectors.size, 6, "Accents and neon colours cover all six hue sectors");
    assert.ok(api.themes.filter(theme => theme.mode === "light").length >= 3);
    const order = Array.from(api.ordered(), theme => theme.mode);
    assert.equal(order.indexOf("light"), api.themes.filter(theme => theme.mode === "dark").length);
});

test("every theme meets WCAG AA text contrast and non-text focus contrast", () => {
    const api = preview();
    assert.ok(Math.abs(api.contrast("#ffffff", "#000000") - 21) < 1e-9);
    for (const theme of api.themes) {
        for (const [label, ratio] of api.checks(theme)) {
            assert.ok(ratio >= (label === "Focus ring" ? 3 : 4.5), `${theme.id}: ${label} ${ratio.toFixed(2)}`);
        }
    }
    assert.throws(() => api.contrast("red", "#000000"), /#rrggbb/);
});

test("neon sign is layered, theme-coloured and animates only opacity", () => {
    const api = preview();
    const markup = api.neonSign("sign");
    assert.equal((markup.match(/<svg /g) || []).length, 3);
    assert.match(markup, /class="neon-board"[\s\S]*class="neon-glow"[\s\S]*class="neon-tubes"/);
    assert.match(markup, /stroke:var\(--neon-a\)/);
    assert.match(markup, /stroke:var\(--neon-b\)/);
    assert.match(markup, /BOMS[\s\S]*og PRESIDENT/);
    assert.equal(new Set(markup.match(/id="[^"]+"/g)).size, (markup.match(/id="[^"]+"/g) || []).length);
    assert.doesNotMatch(markup, /(?:src|href)="https?:/);
    const css = fs.readFileSync(path.join(__dirname, "..", "sandbox", "theme-neon-preview.css"), "utf8");
    for (const name of ["neon-pulse", "neon-flicker"]) {
        const start = css.indexOf(`@keyframes ${name}`);
        const frames = css.slice(start, css.indexOf("\n}", start));
        assert.doesNotMatch(frames.replace(/opacity:[^;]+;/g, ""), /:\s*[^;{]+;/, `${name} animates only opacity`);
    }
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.neon-glow \{ animation: neon-pulse/);
    for (const name of ["intro-panel", "intro-fade", "intro-rise", "neon-ignite", "neon-glow-on"]) {
        const start = css.indexOf(`@keyframes ${name}`);
        assert.ok(start > 0, name);
        let depth = 0, end = css.indexOf("{", start);
        for (; end < css.length; end++) {
            if (css[end] === "{") { depth++; }
            if (css[end] === "}" && --depth === 0) { break; }
        }
        const frames = css.slice(css.indexOf("{", start) + 1, end);
        assert.doesNotMatch(frames.replace(/(opacity|transform):[^;]+;/g, ""), /[a-z-]+\s*:/, `${name} animates only opacity and transform`);
    }
    const motion = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("@keyframes intro-panel"));
    assert.match(motion, /\.mock-menu\.is-intro \{ animation: intro-panel/, "The intro is skipped with reduced motion");
    assert.match(motion, /neon-glow-on 520ms ease-out 560ms both, neon-pulse 3\.2s ease-in-out 1080ms infinite/);
    const html = fs.readFileSync(path.join(__dirname, "..", "sandbox", "theme-neon-preview.html"), "utf8");
    assert.match(html, /class="mock-menu is-intro"/);
    assert.match(html, /id="replayIntro"/);
});
