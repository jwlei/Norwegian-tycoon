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

test("visible release and versioned local assets use version 0.8.4", () => {
    assert.ok(html.includes('aria-label="Spillversjon 0.8.4">v0.8.4</span>'));
    const versions = Array.from(html.matchAll(/(?:src|href)="(?:js|css)\/[^"]+\?v=([^"]+)"/g),
        match => match[1]);
    assert.ok(versions.length > 0);
    assert.ok(versions.every(version => version === "0.8.4"));
});
