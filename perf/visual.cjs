#!/usr/bin/env node
// Measures how much an example patch changes the picture: screenshots both builds at a frozen animation time and diffs them.
//   node perf/visual.cjs --variant 01-... [--profile desktop,phone] [--out perf/results/visual.json] [--images <dir>]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { Browser } = require("./harness/cdp.cjs");
const { serve } = require("./harness/server.cjs");
const { PROFILES, openPage, prepareVariant, sleep } = require("./run.cjs");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

// Decodes the non-interlaced 8-bit PNGs that DevTools produces.
function decodePng(buffer) {
    let offset = 8, width = 0, height = 0, channels = 4;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("latin1", offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type == "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]];
            if (data[8] != 8 || data[12] != 0 || !channels) { throw new Error("Unsupported PNG format."); }
        } else if (type == "IDAT") { idat.push(data); }
        offset += length + 12;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const row = y * (stride + 1) + 1;
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? pixels[y * stride + x - channels] : 0;
            const up = y ? pixels[(y - 1) * stride + x] : 0;
            const corner = x >= channels && y ? pixels[(y - 1) * stride + x - channels] : 0;
            let predicted = 0;
            if (filter == 1) { predicted = left; }
            else if (filter == 2) { predicted = up; }
            else if (filter == 3) { predicted = (left + up) >> 1; }
            else if (filter == 4) {
                const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
                predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
            }
            pixels[y * stride + x] = (raw[row + x] + predicted) & 255;
        }
    }
    return { width, height, channels, pixels };
}

function compare(a, b) {
    if (a.width != b.width || a.height != b.height) { return { sizeMismatch: true }; }
    let changed = 0, visible = 0, worst = 0, total = 0;
    const count = a.width * a.height;
    for (let index = 0; index < count; index++) {
        let delta = 0;
        for (let channel = 0; channel < 3; channel++) {
            delta = Math.max(delta, Math.abs(a.pixels[index * a.channels + channel] - b.pixels[index * b.channels + channel]));
        }
        total += delta;
        if (delta > 0) { changed++; }
        // Differences of a few levels in 255 are below what people see in a moving, foil-lit card.
        if (delta > 8) { visible++; }
        worst = Math.max(worst, delta);
    }
    return { changedPercent: Math.round(changed / count * 10000) / 100, visiblePercent: Math.round(visible / count * 10000) / 100,
        worstDelta: worst, meanDelta: Math.round(total / count * 1000) / 1000 };
}

const SCENES = {
    hand: { hand: 13 },
    "hand-waiting": { hand: 13, myTurn: false },
    table: { hand: 13, table: 14, perPlay: 1 },
    // An open dialog, so patches that touch closed dialogs prove they still open correctly.
    settings: { hand: 13, table: 6, dialog: "Settings" },
    foilPicker: { hand: 13, table: 6, dialog: "CardFoil" }
};

async function shot(browser, server, profile, setup) {
    const { page, errors } = await openPage(browser, server, profile);
    await page.evaluate(`Perf.setup(${JSON.stringify(setup)})`);
    await page.evaluate("Perf.ready()");
    if (setup.dialog) { await page.evaluate(`Perf.openDialog(${JSON.stringify(setup.dialog)})`); }
    await sleep(800);
    await page.evaluate("Perf.freeze(1500)");
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    await browser.closePage(page);
    if (errors.length) { console.warn("page errors:", errors[0].slice(0, 200)); }
    return Buffer.from(data, "base64");
}

async function main() {
    const variants = argument("variant", "").split(",").filter(Boolean);
    const profiles = argument("profile", "desktop,phone").split(",");
    const images = argument("images", null);
    const results = [];
    if (images) { fs.mkdirSync(images, { recursive: true }); }
    for (const profileName of profiles) {
        const profile = PROFILES[profileName];
        const browser = await Browser.launch({ gpu: profile.gpu });
        const preparedBaseline = prepareVariant("baseline");
        const baseline = await serve(preparedBaseline.root);
        for (const [sceneName, setup] of Object.entries(SCENES)) {
            const reference = await shot(browser, baseline, profile, setup);
            const noiseShot = await shot(browser, baseline, profile, setup);
            const noise = compare(decodePng(reference), decodePng(noiseShot));
            results.push({ profile: profileName, scene: sceneName, variant: "baseline (repeat, measures noise)", ...noise });
            console.log(profileName, sceneName, "noise floor", JSON.stringify(noise));
            if (images) { fs.writeFileSync(path.join(images, `${profileName}-${sceneName}-baseline.png`), reference); }
            for (const variant of variants) {
                const prepared = prepareVariant(variant);
                const server = await serve(prepared.root);
                const image = await shot(browser, server, profile, setup);
                await server.close();
                prepared.cleanup();
                const difference = compare(decodePng(reference), decodePng(image));
                results.push({ profile: profileName, scene: sceneName, variant, ...difference });
                console.log(profileName, sceneName, variant, JSON.stringify(difference));
                if (images) { fs.writeFileSync(path.join(images, `${profileName}-${sceneName}-${variant}.png`), image); }
            }
        }
        await baseline.close();
        preparedBaseline.cleanup();
        await browser.close();
    }
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(results, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
