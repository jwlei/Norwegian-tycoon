#!/usr/bin/env node
// Attributes cold-start main-thread time to functions, on the phone profile. Uses the Firebase stub, so nothing reaches production.
//   node perf/profile-startup.cjs [--variant 15] [--top 25] [--out file.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Browser } = require("./harness/cdp.cjs");
const { serve } = require("./harness/server.cjs");
const { CATEGORIES, analyze } = require("./harness/trace.cjs");
const { prepareVariant, sleep } = require("./run.cjs");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
    const variant = argument("variant", "baseline");
    const top = Number(argument("top", "25"));
    const prepared = prepareVariant(variant);
    const server = await serve(prepared.root);
    const browser = await Browser.launch({ gpu: "real" });
    const merged = new Map();
    const runs = Number(argument("runs", "3"));
    const summaries = [];
    for (let run = 0; run < runs; run++) {
        const page = await browser.newPage();
        await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
        await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.send("Profiler.enable");
        await page.send("Profiler.setSamplingInterval", { interval: 500 });
        await page.send("Profiler.start");
        const traced = await browser.trace(CATEGORIES, async () => {
            const loaded = new Promise(resolve => { const stop = page.on("Page.loadEventFired", () => { stop(); resolve(); }); });
            await page.send("Page.navigate", { url: `${server.url}/index.html` });
            await loaded;
            await sleep(300);
        });
        const { profile } = await page.send("Profiler.stop");
        const timing = await page.evaluate(`JSON.stringify({ dcl: performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd,
            fcp: (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime,
            images: document.images.length, nodes: document.getElementsByTagName("*").length })`);
        const analysis = analyze(traced.events, traced.elapsedMs);
        summaries.push({ ...JSON.parse(timing), phases: analysis.mainPhasesMs, longest: analysis.longestTaskMs, blocking: analysis.blockingMs, longTasks: analysis.longTasks });
        const nodes = new Map(profile.nodes.map(node => [node.id, node]));
        profile.samples.forEach((id, index) => {
            const frame = nodes.get(id).callFrame;
            const file = frame.url ? frame.url.split("/").pop().split("?")[0] : "";
            const key = frame.url ? `${frame.functionName || "(top level)"} ${file}:${frame.lineNumber + 1}` : frame.functionName;
            merged.set(key, (merged.get(key) || 0) + (profile.timeDeltas[index] || 0) / 1000);
        });
        await browser.closePage(page);
    }
    await browser.close();
    await server.close();
    prepared.cleanup();
    console.log(JSON.stringify(summaries[summaries.length - 1]));
    const entries = [...merged.entries()].filter(([key]) => key != "(idle)").sort((a, b) => b[1] - a[1]);
    for (const [key, value] of entries.slice(0, top)) { console.log(`${(value / runs).toFixed(1).padStart(9)} ms  ${key}`); }
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify({ variant, summaries, top: entries.slice(0, top).map(([fn, ms]) => ({ fn, ms: ms / runs })) }, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
