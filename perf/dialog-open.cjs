#!/usr/bin/env node
// Measures how long a dialog takes to appear, the first and second time. Patch 15 skips closed dialogs at startup, which may move that work here.
//   node perf/dialog-open.cjs [--variant baseline,15] [--profile desktop,phone] [--runs 5] [--out perf/results/dialog-open.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Browser } = require("./harness/cdp.cjs");
const { serve } = require("./harness/server.cjs");
const { PROFILES, openPage, prepareVariant, sleep, median } = require("./run.cjs");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

const DIALOGS = ["Settings", "CardFoil"];
const open = name => `(async () => {
    const start = performance.now();
    Perf.openDialog(${JSON.stringify(name)});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
})()`;

async function main() {
    const variants = argument("variant", "baseline,15").split(",");
    const runs = Number(argument("runs", "5"));
    const results = [];
    for (const profileName of argument("profile", "desktop,phone").split(",")) {
        const profile = PROFILES[profileName];
        const browser = await Browser.launch({ gpu: profile.gpu });
        for (const variant of variants) {
            const prepared = prepareVariant(variant);
            const server = await serve(prepared.root);
            for (const dialog of DIALOGS) {
                const first = [], second = [];
                for (let run = 0; run < runs; run++) {
                    const { page } = await openPage(browser, server, profile);
                    await page.evaluate('Perf.setup({ hand: 13, table: 6 })');
                    await page.evaluate("Perf.ready()");
                    await sleep(400);
                    if (profile.cpu > 1) { await page.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); }
                    first.push(await page.evaluate(open(dialog)));
                    await page.evaluate(`showDialog(${JSON.stringify(dialog)}, false)`);
                    await sleep(500);
                    second.push(await page.evaluate(open(dialog)));
                    await browser.closePage(page);
                }
                const row = { profile: profileName, variant, dialog, firstMs: Math.round(median(first)), secondMs: Math.round(median(second)) };
                results.push(row);
                console.log(JSON.stringify(row));
            }
            await server.close();
            prepared.cleanup();
        }
        await browser.close();
    }
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(results, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
