#!/usr/bin/env node
// Attributes a scenario's main-thread JavaScript to functions, using the V8 sampling profiler.
//   node perf/profile.cjs --profile phone --scenario play-4-on-30 [--variant 01-...] [--top 25] [--out file.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Browser } = require("./harness/cdp.cjs");
const { serve } = require("./harness/server.cjs");
const { SCENARIOS, PROFILES, openPage, prepareVariant, sleep } = require("./run.cjs");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

function selfTimes(profile) {
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const totals = new Map();
    profile.samples.forEach((id, index) => {
        const node = nodes.get(id);
        const frame = node.callFrame;
        const file = frame.url ? frame.url.split("/").pop().split("?")[0] : "";
        const key = frame.url ? `${frame.functionName || "(anonymous)"} ${file}:${frame.lineNumber + 1}` : `${frame.functionName}`;
        totals.set(key, (totals.get(key) || 0) + (profile.timeDeltas[index] || 0) / 1000);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
    const profile = PROFILES[argument("profile", "desktop")];
    const name = argument("scenario", "play-4-on-30");
    const variant = argument("variant", "baseline");
    const top = Number(argument("top", "25"));
    const repeat = Number(argument("repeat", "3"));
    const prepared = prepareVariant(variant);
    const server = await serve(prepared.root);
    const browser = await Browser.launch({ gpu: profile.gpu });
    const scenario = SCENARIOS[name];
    const merged = new Map();
    let total = 0;
    for (let run = 0; run < repeat; run++) {
        const { page } = await openPage(browser, server, profile);
        if (scenario.splash) { await sleep(3200); }
        else {
            await page.evaluate(`Perf.setup(${JSON.stringify(scenario.setup)})`);
            await page.evaluate("Perf.ready()");
            await sleep(400);
        }
        const ctx = { page, profile, browser };
        if (scenario.before) { await scenario.before(ctx); }
        if (profile.cpu > 1) { await page.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); }
        await page.send("Profiler.enable");
        await page.send("Profiler.setSamplingInterval", { interval: 200 });
        await page.send("Profiler.start");
        await scenario.measure(ctx);
        const result = (await page.send("Profiler.stop")).profile;
        await browser.closePage(page);
        for (const [key, value] of selfTimes(result)) {
            merged.set(key, (merged.get(key) || 0) + value);
            if (!/^\((idle|program)\)/.test(key)) { total += value; }
        }
    }
    await browser.close();
    await server.close();
    prepared.cleanup();
    const entries = [...merged.entries()].filter(([key]) => !/^\(idle\)/.test(key)).sort((a, b) => b[1] - a[1]);
    console.log(`${name} on ${argument("profile", "desktop")} (${variant}), mean of ${repeat} runs. JS+native self time: ${(total / repeat).toFixed(0)} ms`);
    for (const [key, value] of entries.slice(0, top)) {
        console.log(`${(value / repeat).toFixed(1).padStart(9)} ms  ${(value / total * 100).toFixed(1).padStart(5)}%  ${key}`);
    }
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify({ scenario: name, profile: argument("profile", "desktop"), variant, totalMs: total / repeat,
            top: entries.slice(0, top).map(([fn, ms]) => ({ fn, ms: ms / repeat })) }, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
