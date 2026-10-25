const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function preview() {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, "foil-performance-preview.js"), "utf8"), context);
    return vm.runInContext("FoilPerformancePreview", context);
}

test("foil comparison has five distinct renderers ordered by recorded main-thread cost", () => {
    const api = preview();
    const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "foil-performance-results.json"), "utf8"));
    assert.deepEqual(Array.from(api.versions, version => version.id), ["baked", "static-css", "cached", "simple", "current"]);
    const averages = api.versions.map(version => {
        const runs = recorded.runs.filter(run => run.renderer === version.id);
        assert.equal(runs.length, 2);
        return runs.reduce((sum, run) => sum + run.taskMs, 0) / runs.length;
    });
    assert.deepEqual(Array.from(averages), Array.from(averages).sort((a, b) => a - b));
    assert.equal(recorded.workload.cards, 26);
});

test("baked foil image contains self-contained artwork and resolved static layer properties", () => {
    const api = preview();
    const artwork = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const source = api.bakedSource(artwork, [
        { "background-image": "linear-gradient(red, blue)", filter: "contrast(2)", "mix-blend-mode": "soft-light", opacity: ".4" },
        { "background-image": "radial-gradient(white, transparent)", opacity: ".3" }
    ]);
    assert.match(source, /^data:image\/svg\+xml;charset=utf-8,/);
    const svg = decodeURIComponent(source.slice(source.indexOf(",") + 1));
    assert.ok(svg.includes(artwork));
    assert.match(svg, /width="200" height="300" viewBox="0 0 100 150"/);
    assert.match(svg, /background-image:linear-gradient\(red, blue\);filter:contrast\(2\);mix-blend-mode:soft-light;opacity:\.4/);
    assert.doesNotMatch(svg, /var\(|animation:|(?:src|href)="https?:\/\//);
    assert.equal(api.escape('<div title="a&b">'), "&lt;div title=&quot;a&amp;b&quot;&gt;");
});

test("mobile profile records two runs per renderer and discloses hardware limitations", () => {
    const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "foil-performance-mobile-results.json"), "utf8"));
    assert.deepEqual(recorded.environment.viewport, [390, 844]);
    assert.equal(recorded.environment.devicePixelRatio, 3);
    assert.equal(recorded.environment.cpuSlowdown, 4);
    assert.match(recorded.limitations.join(" "), /not calibrated to A15/);
    assert.match(recorded.limitations.join(" "), /does not emulate iPhone Safari/);
    for (const version of preview().versions) {
        const runs = recorded.runs.filter(run => run.renderer === version.id);
        assert.equal(runs.length, 2);
        assert.deepEqual(runs.map(run => run.trial), [1, 2]);
        for (const run of runs) {
            assert.ok(run.taskMs >= run.styleMs && run.styleMs > 0);
            assert.ok(run.over60HzBudget >= run.slow && run.over60HzBudget <= run.frames);
        }
    }
    const html = fs.readFileSync(path.join(__dirname, "foil-performance-preview.html"), "utf8");
    assert.match(html, /href="foil-performance-mobile-results.json"/);
    assert.match(html, /not real iPhone hardware/);
});

test("preview keeps production CSS as reference and discloses benchmark limitations", () => {
    const html = fs.readFileSync(path.join(__dirname, "foil-performance-preview.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "foil-performance-preview.css"), "utf8");
    const script = fs.readFileSync(path.join(__dirname, "foil-performance-preview.js"), "utf8");
    assert.match(html, /href="\.\.\/css\/foil.css"/);
    assert.match(html, /id="run-all"/);
    assert.match(html, /not GPU render time/);
    assert.match(css, /data-renderer="baked"[\s\S]*?content: none !important/);
    assert.match(css, /data-renderer="static-css"[\s\S]*?animation: none !important/);
    assert.match(css, /data-renderer="simple"[\s\S]*?filter: none;/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /clip-path: inset\(0\.625% 0\.9375% round 11\.15% \/ 7\.38%\)/);
    assert.match(script, /if \(element\.dataset\.renderer === "baked"\) \{ return; \}/);
});
