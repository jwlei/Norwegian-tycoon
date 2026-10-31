// Static server for a checkout of the game. `stub` swaps the Firebase SDK for an in-memory stub at serve time,
// so the real index.html, CSS and game code run offline without any source change.
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const HARNESS = __dirname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };

function rewriteIndex(html) {
    return html
        .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*firebase-app-compat\.js"><\/script>/,
            '<script src="/__perf/firebase-stub.js"></script>')
        .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*"><\/script>/g, "")
        .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/[^"]*seedrandom[^"]*"><\/script>/, "")
        .replace("</body>", '<script src="/__perf/scene.js"></script></body>');
}

function serve(root, { stub = true } = {}) {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://localhost");
        let pathname = decodeURIComponent(url.pathname);
        let base = root;
        if (pathname.startsWith("/__perf/")) {
            base = HARNESS;
            pathname = pathname.slice("/__perf".length);
        }
        if (pathname.endsWith("/")) { pathname += "index.html"; }
        const file = path.normalize(path.join(base, pathname));
        if (!file.startsWith(path.normalize(base))) {
            response.writeHead(403);
            response.end();
            return;
        }
        fs.readFile(file, (error, content) => {
            if (error) {
                response.writeHead(404);
                response.end();
                return;
            }
            const type = TYPES[path.extname(file)] || "application/octet-stream";
            if (stub && base == root && pathname == "/index.html") { content = rewriteIndex(content.toString("utf8")); }
            response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
            response.end(content);
        });
    });
    return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(done => { server.closeAllConnections(); server.close(done); })
    })));
}

module.exports = { serve };
