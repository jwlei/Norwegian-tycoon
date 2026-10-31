#!/usr/bin/env node
// Graphics benchmark runner. Measures the real game in headless Chromium; see perf/README.md.
//   node perf/run.cjs --profile desktop,phone --scenario hand-idle,play-1-on-12 --variant baseline --runs 3 --out perf/results/x.json
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Browser } = require("./harness/cdp.cjs");
const { serve } = require("./harness/server.cjs");
const { CATEGORIES, analyze, percentiles } = require("./harness/trace.cjs");

const ROOT = path.join(__dirname, "..");
const EXAMPLES = path.join(__dirname, "examples");
// The example patches are made against one commit; set PERF_COMMIT to measure that commit once HEAD has moved on.
const COMMIT = process.env.PERF_COMMIT || "HEAD";
const sleep =ms => new Promise(resolve => setTimeout(resolve, ms));
const median = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};

const PROFILES = {
    // A typical desktop monitor on the machine's real GPU.
    desktop: { gpu: "real", width: 1280, height: 800, dpr: 1, mobile: false, cpu: 1 },
    // A Retina-class laptop: every raster and canvas costs four times the pixels.
    hidpi: { gpu: "real", width: 1440, height: 900, dpr: 2, mobile: false, cpu: 1 },
    // Phone viewport with touch, so the app takes its mobile path (native SVG, no canvas). CPU throttled 4x on the main thread.
    phone: { gpu: "real", width: 390, height: 844, dpr: 3, mobile: true, cpu: 4 },
    // As phone, on a software GPU: a pessimistic, repeatable stand-in for a weak mobile GPU. Not a real device.
    "phone-sw": { gpu: "software", width: 390, height: 844, dpr: 3, mobile: true, cpu: 4 },
    // Desktop viewport on the software GPU, which makes GPU-heavy effects visible on any machine.
    "desktop-sw": { gpu: "software", width: 1280, height: 800, dpr: 1, mobile: false, cpu: 1 }
};

const IDLE_MS = 6000;
const idle = (setup, extra = {}) => ({ setup, measure: async ctx => { await sleep(IDLE_MS); return {}; }, ...extra });
const flight = (count, table, perPlay = 1, setup = {}) => ({
    setup: { hand: 13, table, perPlay, ...setup },
    frames: true,
    measure: async ctx => {
        const syncMs = await ctx.page.evaluate(`Perf.play(${count})`);
        await ctx.page.evaluate("Perf.waitForFlights()");
        return { syncMs };
    }
});

const SCENARIOS = {
    "splash-idle": { splash: true, measure: async () => { await sleep(IDLE_MS); return {}; } },
    "hand-idle": idle({ hand: 13 }),
    "hand-idle-nofoil": idle({ hand: 13, foil: "none" }),
    "hand-idle-waiting": idle({ hand: 13, myTurn: false }),
    "hand-idle-foil-off": idle({ hand: 13, idleFoil: false }),
    "table-idle-30": idle({ hand: 13, table: 30 }),
    "table-idle-30-nofoil": idle({ hand: 13, table: 30, foil: "none" }),
    "dialog-idle": idle({ hand: 13, table: 12 }, { before: async ctx => {
        await ctx.page.evaluate('Perf.openDialog("Settings")');
        await sleep(600);
    } }),
    "hand-scroll-26": { setup: { hand: 26 }, measure: async ctx => {
        const { intervals } = await ctx.page.evaluate("Perf.scrollHand(3000)");
        return { intervals };
    } },
    "select-card": { setup: { hand: 13 }, measure: async ctx => {
        const samples = [];
        for (let index = 0; index < 8; index++) {
            samples.push(await ctx.page.evaluate(`Perf.selectCard(${index % 13})`));
            await ctx.page.evaluate("Perf.settle(120)");
        }
        return { syncMs: median(samples), syncSamples: samples };
    } },
    "opponent-move": { setup: { hand: 13, table: 8, myTurn: false }, measure: async ctx => {
        const samples = [];
        for (let index = 0; index < 5; index++) {
            samples.push(await ctx.page.evaluate("Perf.opponentPlays()"));
            await ctx.page.evaluate("Perf.waitForFlights()");
            await ctx.page.evaluate("Perf.settle(120)");
        }
        return { syncMs: median(samples), syncSamples: samples };
    } },
    "noop-snapshot": { setup: { hand: 13, table: 8 }, measure: async ctx => {
        const samples = [];
        for (let index = 0; index < 20; index++) {
            samples.push(await ctx.page.evaluate("Perf.noOpSnapshot()"));
            await ctx.page.evaluate("Perf.settle(0)");
        }
        return { syncMs: median(samples), syncSamples: samples };
    } },
    drag: { setup: { hand: 13, table: 6 }, frames: true, measure: async ctx => dragGesture(ctx, 2500) },
    "play-1-on-0": flight(1, 0),
    "play-1-on-12": flight(1, 12),
    "play-4-on-12": flight(4, 12),
    "play-1-on-30": flight(1, 30),
    "play-4-on-30": flight(4, 30),
    "play-1-on-12-simple": flight(1, 12, 1, { shadows: "simple" }),
    "play-4-on-30-simple": flight(4, 30, 1, { shadows: "simple" }),
    "play-1-on-12-nofoil": flight(1, 12, 1, { foil: "none" }),
    "play-4-on-30-nofoil": flight(4, 30, 1, { foil: "none" }),
    "clear-30": { setup: { hand: 13, table: 30 }, frames: true, measure: async ctx => {
        await ctx.page.evaluate("Perf.clearTable()");
        return {};
    } },
    "clear-30-simple": { setup: { hand: 13, table: 30, shadows: "simple" }, frames: true, measure: async ctx => {
        await ctx.page.evaluate("Perf.clearTable()");
        return {};
    } }
};

async function dragGesture(ctx, duration) {
    const { page, profile } = ctx;
    const point = await page.evaluate("Perf.cardPoint(9)");
    const touch = profile.mobile;
    const input = (type, x, y) => touch
        ? page.send("Input.dispatchTouchEvent", { type: { down: "touchStart", move: "touchMove", up: "touchEnd" }[type],
            touchPoints: type == "up" ? [] : [{ x, y, id: 1 }] })
        : page.send("Input.dispatchMouseEvent", { type: { down: "mousePressed", move: "mouseMoved", up: "mouseReleased" }[type],
            x, y, button: type == "move" ? "none" : "left", buttons: type == "up" ? 0 : 1, clickCount: 1 });
    await input("down", point.x, point.y);
    // Lift out of the hand, then trace loops over the table, the movement that keeps tilt and foil updating.
    const started = Date.now();
    let last = { x: point.x, y: point.y };
    for (;;) {
        const elapsed = Date.now() - started;
        if (elapsed >= duration) { break; }
        const lift = Math.min(1, elapsed / 300);
        const angle = elapsed / 280;
        last = {
            x: point.x + (point.tableX - point.x) * lift + Math.sin(angle) * 90 * lift,
            y: point.y + (point.tableY - point.y) * lift + Math.cos(angle * 1.3) * 60 * lift
        };
        await input("move", last.x, last.y);
        await sleep(12);
    }
    // Release back over the hand, so it glides home rather than calling the (stubbed) network path.
    await input("move", point.x, point.y);
    await input("up", point.x, point.y);
    await sleep(500);
    return {};
}

async function layerStats(page, profile) {
    const layers = await new Promise(async resolve => {
        const stop = page.on("LayerTree.layerTreeDidChange", params => { if (params.layers) { stop(); resolve(params.layers); } });
        await page.send("LayerTree.enable");
        setTimeout(() => { stop(); resolve([]); }, 2000);
    });
    await page.send("LayerTree.disable");
    const painted = layers.filter(layer => layer.drawsContent);
    return { count: layers.length, painted: painted.length,
        megabytes: Math.round(painted.reduce((sum, layer) => sum + layer.width * layer.height * profile.dpr ** 2 * 4, 0) / 1048576 * 10) / 10 };
}

async function openPage(browser, server, profile) {
    const page = await browser.newPage();
    const errors = [];
    page.on("Runtime.exceptionThrown", params => errors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text));
    await page.send("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height,
        deviceScaleFactor: profile.dpr, mobile: profile.mobile, screenWidth: profile.width, screenHeight: profile.height });
    if (profile.mobile) { await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); }
    await page.send("Performance.enable");
    const loaded = new Promise(resolve => { const stop = page.on("Page.loadEventFired", () => { stop(); resolve(); }); });
    await page.send("Page.navigate", { url: `${server.url}/index.html` });
    await loaded;
    // Let the intro finish, so a scenario never measures the first-visit ignition by accident.
    await sleep(600);
    return { page, errors };
}

async function runScenario(browser, server, name, profile, options) {
    const scenario = SCENARIOS[name];
    const { page, errors } = await openPage(browser, server, profile);
    const ctx = { page, profile, browser };
    let setupStats = null;
    if (scenario.splash) {
        await sleep(3200);
    } else {
        setupStats = await page.evaluate(`Perf.setup(${JSON.stringify(scenario.setup)})`);
        await page.evaluate("Perf.ready()");
        await sleep(400);
    }
    if (scenario.before) { await scenario.before(ctx); }
    const stats = scenario.splash ? null : await page.evaluate("Perf.stats()");
    if (profile.cpu > 1) { await page.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); }
    const framePromise = () => scenario.frames
        ? page.evaluate(`(window.__frames = [], (function loop(previous) {
            requestAnimationFrame(time => { if (previous != null) { window.__frames.push(time - previous); } if (!window.__stopFrames) { loop(time); } });
        })(null), window.__stopFrames = false, 0)`) : Promise.resolve();
    const before = (await page.send("Performance.getMetrics")).metrics;
    const traced = await browser.trace(CATEGORIES, async () => {
        await framePromise();
        return scenario.measure(ctx);
    });
    const after = (await page.send("Performance.getMetrics")).metrics;
    if (profile.cpu > 1) { await page.send("Emulation.setCPUThrottlingRate", { rate: 1 }); }
    const metric = (list, key) => (list.find(entry => entry.name == key) || {}).value;
    const delta = key => metric(after, key) - metric(before, key);
    let intervals = traced.result && traced.result.intervals;
    if (scenario.frames) {
        intervals = await page.evaluate("(window.__stopFrames = true, window.__frames)");
    }
    const analysis = analyze(traced.events, traced.elapsedMs);
    const layers = options.layers ? await layerStats(page, profile) : null;
    const result = { ...analysis, stats, setupStats, layers, frameStats: percentiles(intervals),
        syncMs: traced.result && traced.result.syncMs, syncSamples: traced.result && traced.result.syncSamples,
        counters: { layouts: delta("LayoutCount"), styleRecalcs: delta("RecalcStyleCount"),
            styleMs: Math.round(delta("RecalcStyleDuration") * 10000) / 10, layoutMs: Math.round(delta("LayoutDuration") * 10000) / 10,
            scriptMs: Math.round(delta("ScriptDuration") * 10000) / 10, taskMs: Math.round(delta("TaskDuration") * 10000) / 10,
            heapMb: Math.round(metric(after, "JSHeapUsedSize") / 1048576 * 10) / 10, nodes: metric(after, "Nodes") },
        errors };
    await browser.closePage(page);
    return result;
}

// Exports a commit rather than the working tree, so edits saved during a long run cannot change what it measures.
function exportCommit(directory, keep = () => true) {
    const options = { cwd: ROOT, maxBuffer: 1 << 28 };
    const files = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", COMMIT], { ...options, encoding: "utf8" }).split("\0").filter(Boolean);
    for (const file of files.filter(keep)) {
        const target = path.join(directory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, execFileSync("git", ["show", `${COMMIT}:${file}`], options));
    }
}

// Serves a copy of the commit with an example patch applied, so what is measured is exactly the example.
function prepareVariant(variant) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `boms-${variant}-`));
    exportCommit(directory, file => !file.startsWith("sandbox/") && !file.startsWith("tests/"));
    if (variant == "baseline") { return { root: directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) }; }
    // Variants name patches by their number or full name; "01+06" stacks patches in that order.
    const available = fs.readdirSync(EXAMPLES).filter(file => file.endsWith(".patch"));
    for (const name of variant.split("+")) {
        const file = available.find(candidate => candidate.startsWith(name));
        if (!file) { throw new Error(`No example patch matches ${name}`); }
        execFileSync("git", ["apply", "--ignore-whitespace", "--whitespace=nowarn", path.join(EXAMPLES, file)], { cwd: directory });
    }
    return { root: directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
    const profiles = argument("profile", "desktop,phone").split(",");
    const scenarios = argument("scenario", Object.keys(SCENARIOS).join(",")).split(",");
    const variants = argument("variant", "baseline").split(",");
    const runs = Number(argument("runs", "3"));
    const out = argument("out", null);
    const layers = process.argv.includes("--layers");
    const results = { measuredAt: new Date().toISOString(), runs, cpu: os.cpus()[0].model, platform: process.platform, data: [] };
    for (const profileName of profiles) {
        const profile = PROFILES[profileName];
        if (!profile) { throw new Error(`Unknown profile ${profileName}`); }
        const prepared = variants.map(variant => ({ variant, ...prepareVariant(variant) }));
        const servers = await Promise.all(prepared.map(entry => serve(entry.root)));
        const browser = await Browser.launch({ gpu: profile.gpu });
        results.browser = await browser.version();
        for (const name of scenarios) {
            if (!SCENARIOS[name]) { throw new Error(`Unknown scenario ${name}`); }
            for (let run = 0; run < runs; run++) {
                // Alternate the order each run, so warm-up and thermal drift do not favour one variant.
                const order = prepared.map((entry, index) => ({ entry, server: servers[index] }));
                if (run % 2) { order.reverse(); }
                for (const { entry, server } of order) {
                    const started = Date.now();
                    const result = await runScenario(browser, server, name, profile, { layers });
                    results.data.push({ profile: profileName, scenario: name, variant: entry.variant, run, ...result });
                    const load = result.loadMsPerS;
                    console.log(`${profileName.padEnd(10)} ${name.padEnd(22)} ${entry.variant.padEnd(22)} #${run} ` +
                        `main ${String(load.main).padStart(6)} comp ${String(load.compositor).padStart(5)} raster ${String(load.raster).padStart(6)} gpu ${String(load.gpu).padStart(6)} ms/s` +
                        (result.syncMs != null ? ` sync ${result.syncMs.toFixed(1)}ms` : "") +
                        (result.frameStats ? ` p95 ${result.frameStats.p95}ms` : "") +
                        (result.errors.length ? ` ERRORS ${result.errors.length}: ${result.errors[0].slice(0, 120)}` : "") +
                        ` (${((Date.now() - started) / 1000).toFixed(0)}s)`);
                }
            }
        }
        await browser.close();
        await Promise.all(servers.map(server => server.close()));
        prepared.forEach(entry => entry.cleanup());
    }
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(results, null, 1));
        console.log(`Wrote ${out}`);
    }
}

if (require.main === module) {
    main().catch(error => { console.error(error); process.exit(1); });
}

module.exports = { SCENARIOS, PROFILES, openPage, exportCommit, prepareVariant, sleep, median };
