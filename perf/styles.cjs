#!/usr/bin/env node
// Compares what each foil and each card style costs, so an expensive look can be simplified on its own.
// Foils: compositor and GPU load of an idle hand. Styles: artwork size and its canvas draw time.
//   node perf/styles.cjs [--profile desktop,phone] [--variant 01] [--runs 2] [--skip-foils] [--out perf/results/styles.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Browser } = require("./harness/cdp.cjs");
const { serve } = require("./harness/server.cjs");
const { CATEGORIES, analyze } = require("./harness/trace.cjs");
const { PROFILES, openPage, prepareVariant, sleep, median } = require("./run.cjs");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

async function foilCost(browser, server, profile, foil, runs) {
    const samples = [];
    for (let run = 0; run < runs; run++) {
        const { page } = await openPage(browser, server, profile);
        await page.evaluate(`Perf.setup(${JSON.stringify({ hand: 13, foil })})`);
        await page.evaluate("Perf.ready()");
        await sleep(400);
        if (profile.cpu > 1) { await page.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); }
        const traced = await browser.trace(CATEGORIES, () => sleep(3000));
        const analysis = analyze(traced.events, traced.elapsedMs);
        samples.push({ gpu: analysis.loadMsPerS.gpu, compositor: analysis.loadMsPerS.compositor, passes: analysis.frames.passesPerDraw });
        await browser.closePage(page);
    }
    const pick = key => median(samples.map(sample => sample[key]));
    return { gpu: pick("gpu"), compositor: pick("compositor"), passes: pick("passes") };
}

async function main() {
    const profiles = argument("profile", "desktop,phone").split(",");
    const runs = Number(argument("runs", "2"));
    // Patch 01 by default, so the running animations in closed dialogs do not mask each foil's own cost.
    const prepared = prepareVariant(argument("variant", "01"));
    const server = await serve(prepared.root);
    const results = { variant: argument("variant", "01"), foils: [], styles: [] };
    for (const profileName of process.argv.includes("--skip-foils") ? [] : profiles) {
        const profile = PROFILES[profileName];
        const browser = await Browser.launch({ gpu: profile.gpu });
        const { page } = await openPage(browser, server, profile);
        const foils = JSON.parse(await page.evaluate("JSON.stringify(Perf.foils())"));
        await browser.closePage(page);
        for (const foil of foils) {
            const cost = await foilCost(browser, server, profile, foil, runs);
            results.foils.push({ profile: profileName, foil, ...cost });
            console.log(profileName.padEnd(8), foil.padEnd(18), JSON.stringify(cost));
        }
        await browser.close();
    }
    const browser = await Browser.launch({ gpu: "real" });
    const { page } = await openPage(browser, server, PROFILES.desktop);
    const styles = JSON.parse(await page.evaluate("JSON.stringify(Perf.styles())"));
    // Warm up first: the first draws of a page pay for shader and JIT setup, which would be charged to whichever style came first.
    await page.evaluate(`(async () => { for (let round = 0; round < 5; round++) { await Perf.drawCost(Perf.cardSource("normal", "none"), 252, 378); } })()`);
    for (const style of styles) {
        const cost = JSON.parse(await page.evaluate(`(async () => {
            const source = Perf.cardSource(${JSON.stringify(style)}, "none");
            const svg = decodeURIComponent(source.slice(source.indexOf(",") + 1));
            const draws = [];
            for (let round = 0; round < 7; round++) { draws.push((await Perf.drawCost(source, 252, 378)).perDrawMs); }
            draws.sort((a, b) => a - b);
            return JSON.stringify({ bytes: source.length, elements: (svg.match(/<[a-zA-Z]/g) || []).length,
                filters: (svg.match(/<filter/g) || []).length, perDrawMs: Math.round(draws[3] * 100) / 100 });
        })()`));
        results.styles.push({ style, ...cost });
        console.log("style".padEnd(8), style.padEnd(18), JSON.stringify(cost));
    }
    await browser.close();
    await server.close();
    prepared.cleanup();
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(results, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
