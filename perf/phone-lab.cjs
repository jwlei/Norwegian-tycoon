#!/usr/bin/env node
// Serves the foil benchmark to a real phone on the local network, because an emulated phone says nothing about a phone's GPU.
//   node perf/phone-lab.cjs [--port 8123]
// Runs in the foreground: Ctrl+C stops it and removes its temporary copies. It serves only exported copies of the last
// commit, with Firebase stubbed, and accepts nothing but benchmark results, which it writes to perf/results.
"use strict";
// Patches 17 and 18 were made against this commit, so "baseline" here is the game before them. Set PERF_COMMIT to compare others.
process.env.PERF_COMMIT = process.env.PERF_COMMIT || "0424bf9";
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepareVariant } = require("./run.cjs");
const { rewriteIndex, TYPES } = require("./harness/server.cjs");

const ROOT = path.join(__dirname, "..");
const HARNESS = path.join(__dirname, "harness");
const RESULTS = path.join(__dirname, "results");
const TREES = ["baseline", "17", "17+18"];
const MAX_RESULT_BYTES = 8 * 1024 * 1024;

const FIREBASE_SCRIPTS = /<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*"><\/script>/g;
const SEEDRANDOM = /<script src="https:\/\/cdnjs\.cloudflare\.com\/[^"]*seedrandom[^"]*"><\/script>/;

function withBase(html, tree) {
    return html.replace('<base href="/" />', `<base href="/v/${encodeURIComponent(tree)}/" />`);
}

// The real index.html with the perf scene, for scripted runs.
function benchmarkPage(html, tree) {
    return withBase(rewriteIndex(html), tree);
}

// The real game against real bots on an in-memory database, with a frame meter, to feel with a finger.
function playablePage(html, tree) {
    return withBase(html, tree)
        .replace(FIREBASE_SCRIPTS, match => match.includes("firebase-app-compat") ? '<script src="/__lab/firebase-memory.js"></script>' : "")
        .replace(SEEDRANDOM, "")
        .replace("</body>", '<script src="/__lab/play.js"></script></body>');
}

function lookPage(tree) {
    return withBase(fs.readFileSync(path.join(HARNESS, "foil-look.html"), "utf8"), tree);
}

function send(response, status, type, content) {
    response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    response.end(content);
}

function readFileWithin(base, relative, response) {
    const file = path.normalize(path.join(base, relative));
    if (file !== path.normalize(base) && !file.startsWith(path.normalize(base) + path.sep)) {
        send(response, 403, "text/plain", "Forbidden");
        return;
    }
    fs.readFile(file, (error, content) => {
        if (error) { send(response, 404, "text/plain", "Not found"); return; }
        send(response, 200, TYPES[path.extname(file)] || "application/octet-stream", content);
    });
}

function saveResults(request, response, resultsDirectory, onSaved) {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_RESULT_BYTES) {
            send(response, 413, "text/plain", "Too large");
            request.destroy();
            return;
        }
        chunks.push(chunk);
    });
    request.on("end", () => {
        if (response.writableEnded) { return; }
        let parsed;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch (error) { send(response, 400, "text/plain", "Not JSON"); return; }
        fs.mkdirSync(resultsDirectory, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = path.join(resultsDirectory, `phone-foil-${stamp}.json`);
        fs.writeFileSync(file, JSON.stringify(parsed, null, 1));
        onSaved(file);
        send(response, 200, TYPES[".json"], JSON.stringify({ file: path.relative(ROOT, file).replaceAll("\\", "/") }));
    });
}

function createServer(trees, { resultsDirectory = RESULTS, onSaved = () => { } } = {}) {
    return http.createServer((request, response) => {
        const url = new URL(request.url, "http://localhost");
        let pathname;
        try { pathname = decodeURIComponent(url.pathname); }
        catch (error) { send(response, 400, "text/plain", "Bad path"); return; }
        if (request.method == "POST" && pathname == "/__lab/results") {
            saveResults(request, response, resultsDirectory, onSaved);
            return;
        }
        if (request.method != "GET") { send(response, 405, "text/plain", "Method not allowed"); return; }
        if (pathname == "/") { readFileWithin(HARNESS, "phone-lab.html", response); return; }
        if (pathname == "/__lab/firebase-memory.js") { readFileWithin(path.join(ROOT, "sandbox"), "firebase-memory.js", response); return; }
        if (pathname == "/__lab/play.js") { readFileWithin(HARNESS, "phone-lab-play.js", response); return; }
        if (pathname.startsWith("/__perf/")) { readFileWithin(HARNESS, pathname.slice("/__perf/".length), response); return; }
        const match = pathname.match(/^\/v\/([^/]+)\/(.*)$/);
        if (!match || !trees[match[1]]) { send(response, 404, "text/plain", "Not found"); return; }
        const [, tree, relative] = match;
        const page = relative === "" ? "index.html" : relative;
        if (page == "foil-look.html") { send(response, 200, TYPES[".html"], lookPage(tree)); return; }
        if (page == "index.html" || page == "play.html") {
            const html = fs.readFileSync(path.join(trees[tree], "index.html"), "utf8");
            send(response, 200, TYPES[".html"], page == "index.html" ? benchmarkPage(html, tree) : playablePage(html, tree));
            return;
        }
        readFileWithin(trees[tree], page, response);
    });
}

function networkAddresses() {
    return Object.values(os.networkInterfaces()).flat()
        .filter(address => address.family == "IPv4" && !address.internal)
        .map(address => address.address)
        // Home networks first; virtual adapters tend to use other ranges.
        .sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));
}

// Prints each device that reaches the server, so a phone that cannot load the page can be told apart from one that never arrives.
function logVisitors(server, log = console.log) {
    const seen = new Set();
    server.on("connection", socket => {
        const address = String(socket.remoteAddress).replace(/^::ffff:/, "");
        if (!seen.has(address)) {
            seen.add(address);
            log(`Connection from ${address}`);
        }
    });
    server.on("clientError", (error, socket) => {
        log(`Unreadable request (${error.code}). If the phone shows a security error, type the address with http:// in front.`);
        if (socket.writable) { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); }
    });
}

function main() {
    const index = process.argv.indexOf("--port");
    const port = index >= 0 ? Number(process.argv[index + 1]) : 8123;
    console.log("Exporting the last commit with each patch applied...");
    const prepared = TREES.map(tree => ({ tree, ...prepareVariant(tree) }));
    const trees = Object.fromEntries(prepared.map(entry => [entry.tree, entry.root]));
    const server = createServer(trees, { onSaved: file => console.log(`\nSaved ${path.relative(ROOT, file)}. Tell Claude it is there.`) });
    logVisitors(server);
    const stop = () => {
        server.closeAllConnections();
        server.close();
        prepared.forEach(entry => entry.cleanup());
        process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    server.listen(port, "0.0.0.0", () => {
        console.log("\nOpen this on the phone, on the same Wi-Fi as this computer:\n");
        networkAddresses().forEach(address => console.log(`    http://${address}:${port}/`));
        console.log(`\nIn VS Code Simple Browser: http://localhost:${port}/`);
        console.log("If Windows asks about the firewall, allow private networks. If the phone cannot connect, that is usually why.");
        console.log("Press Ctrl+C to stop.");
    });
}

if (require.main === module) { main(); }
module.exports = { createServer, benchmarkPage, playablePage, networkAddresses, logVisitors };
