// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket. No dependencies, like the project.
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BROWSER_CANDIDATES = [
    process.env.PERF_BROWSER,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
].filter(Boolean);

// real: the machine's GPU. software: SwiftShader, a repeatable stand-in that exaggerates GPU-heavy effects.
const GPU_FLAGS = {
    real: ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
    software: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-rasterization"]
};

class Session {
    constructor(browser, id) {
        this.browser = browser;
        this.id = id;
    }
    send(method, params = {}) {
        return this.browser.send(method, params, this.id);
    }
    on(method, listener) {
        return this.browser.on(method, listener, this.id);
    }
    // Evaluates in the page; awaits promises and rethrows page errors with their message.
    async evaluate(expression) {
        const { result, exceptionDetails } = await this.send("Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (exceptionDetails) {
            const detail = exceptionDetails.exception && exceptionDetails.exception.description || exceptionDetails.text;
            throw new Error(`Page error in ${expression.slice(0, 80)}: ${detail}`);
        }
        return result.value;
    }
}

class Browser {
    static async launch({ gpu = "real", uncapped = false, windowSize = "1280,800" } = {}) {
        const executable = BROWSER_CANDIDATES.find(candidate => fs.existsSync(candidate));
        if (!executable) { throw new Error("No Chromium browser found. Set PERF_BROWSER to its path."); }
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "boms-perf-"));
        const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
            `--window-size=${windowSize}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions",
            "--disable-background-networking", "--disable-sync", "--disable-features=Translate,msEdgeSidebarV2",
            "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling", "--metrics-recording-only",
            ...GPU_FLAGS[gpu], ...(uncapped ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []), "about:blank"];
        const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
        const endpoint = await new Promise((resolve, reject) => {
            let log = "";
            const timer = setTimeout(() => reject(new Error(`Browser did not start:\n${log}`)), 20000);
            child.stderr.on("data", chunk => {
                log += chunk;
                const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
            child.on("exit", code => reject(new Error(`Browser exited with ${code}:\n${log}`)));
        });
        const browser = new Browser(child, profile, executable);
        await browser.connect(endpoint);
        return browser;
    }
    constructor(child, profile, executable) {
        this.child = child;
        this.profile = profile;
        this.executable = executable;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }
    connect(endpoint) {
        this.socket = new WebSocket(endpoint);
        this.socket.onmessage = event => this.receive(JSON.parse(event.data));
        return new Promise((resolve, reject) => {
            this.socket.onopen = resolve;
            this.socket.onerror = () => reject(new Error("Could not connect to the browser."));
        });
    }
    receive(message) {
        if (message.id != null) {
            const request = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) { request.reject(new Error(`${request.method}: ${message.error.message}`)); }
            else { request.resolve(message.result); }
            return;
        }
        for (const key of [`${message.sessionId || ""}:${message.method}`]) {
            (this.listeners.get(key) || []).forEach(listener => listener(message.params));
        }
    }
    send(method, params = {}, sessionId = undefined) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, method });
            this.socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
    on(method, listener, sessionId = "") {
        const key = `${sessionId || ""}:${method}`;
        if (!this.listeners.has(key)) { this.listeners.set(key, []); }
        this.listeners.get(key).push(listener);
        return () => this.listeners.set(key, this.listeners.get(key).filter(other => other != listener));
    }
    async newPage(url = "about:blank") {
        const { targetId } = await this.send("Target.createTarget", { url });
        const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
        const page = new Session(this, sessionId);
        page.targetId = targetId;
        await page.send("Page.enable");
        await page.send("Runtime.enable");
        return page;
    }
    closePage(page) {
        return this.send("Target.closeTarget", { targetId: page.targetId });
    }
    gpuInfo() {
        return this.send("SystemInfo.getInfo");
    }
    async version() {
        return (await this.send("Browser.getVersion")).product;
    }
    // Runs `action` while tracing the whole browser, so the GPU and compositor threads are included.
    async trace(categories, action) {
        const events = [];
        const stopData = this.on("Tracing.dataCollected", params => events.push(...params.value));
        const complete = new Promise(resolve => {
            const stop = this.on("Tracing.tracingComplete", params => { stop(); resolve(params); });
        });
        await this.send("Tracing.start", { transferMode: "ReturnAsStream",
            traceConfig: { includedCategories: categories, recordMode: "recordAsMuchAsPossible" } });
        const started = Date.now();
        let result;
        try {
            result = await action();
        } finally {
            result = { result, elapsedMs: Date.now() - started };
            await this.send("Tracing.end");
        }
        const { stream } = await complete;
        stopData();
        let text = "";
        for (;;) {
            const chunk = await this.send("IO.read", { handle: stream, size: 8 * 1024 * 1024 });
            text += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString("utf8") : chunk.data;
            if (chunk.eof) { break; }
        }
        await this.send("IO.close", { handle: stream });
        const parsed = JSON.parse(text);
        return { ...result, events: Array.isArray(parsed) ? parsed : parsed.traceEvents };
    }
    async close() {
        try { await this.send("Browser.close"); } catch (error) { this.child.kill(); }
        await new Promise(resolve => {
            if (this.child.exitCode != null) { resolve(); return; }
            this.child.once("exit", resolve);
            setTimeout(() => { this.child.kill(); resolve(); }, 3000);
        });
        try { this.socket.close(); } catch (error) { }
        try { fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (error) { }
    }
}

module.exports = { Browser, Session };
