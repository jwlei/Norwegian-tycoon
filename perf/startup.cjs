#!/usr/bin/env node
// Cold-start benchmark of the real page on a simulated phone connection, with the real Firebase SDK files.
// Requests that could reach the production backend are blocked, so this never signs in or touches game data.
//   node perf/startup.cjs [--variant baseline,12-...] [--runs 5] [--out perf/results/startup.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
const { Browser } = require("./harness/cdp.cjs");
const { prepareVariant, sleep, median } = require("./run.cjs");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

const BACKEND = ["*identitytoolkit*", "*securetoken*", "*firebasedatabase.app*", "*firebaseio.com*", "*firebaseinstallations*", "*firebaseapp.com*"];
const NETWORK = { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }; // "Fast 4G".
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

// Gzip like the production host, so transfer sizes and timings are realistic. Assets cache for the repeat-view test.
function serveGzip(root) {
    const server = http.createServer((request, response) => {
        let pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
        if (pathname.endsWith("/")) { pathname += "index.html"; }
        const file = path.join(root, pathname);
        fs.readFile(file, (error, content) => {
            if (error) { response.writeHead(404); response.end(); return; }
            const gzip = zlib.gzipSync(content, { level: 6 });
            response.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream",
                "content-encoding": "gzip", "cache-control": path.extname(file) == ".html" ? "no-cache" : "max-age=600" });
            response.end(gzip);
        });
    });
    return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(done => { server.closeAllConnections(); server.close(done); })
    })));
}

async function load(browser, server, { repeatView, cpu, gpuOnly }) {
    const page = await browser.newPage();
    await page.send("Network.enable", { maxTotalBufferSize: 100000000 });
    await page.send("Network.setBlockedURLs", { urls: BACKEND });
    await page.send("Network.emulateNetworkConditions", NETWORK);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await page.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    if (!repeatView) { await page.send("Network.clearBrowserCache"); }
    const transfers = new Map();
    page.on("Network.responseReceived", params => transfers.set(params.requestId, { url: params.response.url, type: params.type }));
    page.on("Network.loadingFinished", params => {
        const entry = transfers.get(params.requestId);
        if (entry) { entry.bytes = params.encodedDataLength; }
    });
    const loaded = new Promise(resolve => { const stop = page.on("Page.loadEventFired", () => { stop(); resolve(); }); });
    await page.send("Page.navigate", { url: `${server.url}/index.html` });
    await loaded;
    await sleep(1800);
    const timing = await page.evaluate(`JSON.stringify((() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const paint = name => (performance.getEntriesByName(name)[0] || {}).startTime;
        return { fcp: paint("first-contentful-paint"), domContentLoaded: navigation.domContentLoadedEventEnd,
            load: navigation.loadEventEnd, responseEnd: navigation.responseEnd };
    })())`);
    const metrics = (await page.send("Performance.getMetrics").catch(() => ({ metrics: [] }))).metrics;
    await browser.closePage(page);
    const list = [...transfers.values()];
    const bytes = test => list.filter(test).reduce((sum, entry) => sum + (entry.bytes || 0), 0);
    return { ...JSON.parse(timing), scriptBytes: bytes(entry => entry.type == "Script"), styleBytes: bytes(entry => entry.type == "Stylesheet"),
        documentBytes: bytes(entry => entry.type == "Document"), totalBytes: bytes(() => true), requests: list.length,
        firebaseBytes: bytes(entry => /gstatic/.test(entry.url)) };
}

async function main() {
    const variants = argument("variant", "baseline").split(",");
    const runs = Number(argument("runs", "5"));
    const results = [];
    for (const variant of variants) {
        const prepared = prepareVariant(variant);
        const server = await serveGzip(prepared.root);
        for (const [label, options] of Object.entries({ "first visit": { repeatView: false, cpu: 4 }, "repeat visit": { repeatView: true, cpu: 4 } })) {
            const browser = await Browser.launch({ gpu: "real" });
            if (options.repeatView) { await load(browser, server, { repeatView: false, cpu: 1 }); }
            const samples = [];
            for (let run = 0; run < runs; run++) { samples.push(await load(browser, server, options)); }
            await browser.close();
            const summary = { variant, label, runs };
            for (const key of Object.keys(samples[0])) { summary[key] = Math.round(median(samples.map(sample => sample[key]))); }
            results.push(summary);
            console.log(JSON.stringify(summary));
        }
        await server.close();
        prepared.cleanup();
    }
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(results, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
