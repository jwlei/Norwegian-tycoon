const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const net = require("node:net");
const { createServer, benchmarkPage, playablePage, logVisitors } = require("../perf/phone-lab.cjs");
const { softLight, dragWrites, sheenError } = require("../perf/foil-model.cjs");

const INDEX = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const LAB = fs.readFileSync(path.join(__dirname, "..", "perf", "harness", "phone-lab.html"), "utf8");

function labScript() {
    return LAB.slice(LAB.indexOf("<script>") + 8, LAB.lastIndexOf("</script>"));
}

test("benchmark and playable pages never load Firebase and resolve assets inside their build", () => {
    for (const html of [benchmarkPage(INDEX, "17+18"), playablePage(INDEX, "17+18")]) {
        assert.doesNotMatch(html, /gstatic\.com\/firebasejs/);
        assert.match(html, /<base href="\/v\/17%2B18\/" \/>/);
    }
    assert.match(benchmarkPage(INDEX, "baseline"), /\/__perf\/scene\.js/);
    assert.match(playablePage(INDEX, "baseline"), /\/__lab\/firebase-memory\.js/);
    assert.match(playablePage(INDEX, "baseline"), /\/__lab\/play\.js/);
});

test("the lab server serves builds, refuses to leave them, and writes results only to the results folder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "boms-lab-"));
    const tree = path.join(root, "tree");
    const resultsDirectory = path.join(root, "results");
    fs.mkdirSync(tree);
    fs.writeFileSync(path.join(tree, "index.html"), INDEX);
    fs.writeFileSync(path.join(tree, "style.css"), "body{}");
    fs.writeFileSync(path.join(root, "secret.txt"), "secret");
    const saved = [];
    const server = createServer({ baseline: tree }, { resultsDirectory, onSaved: file => saved.push(file) });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        assert.equal((await fetch(`${base}/`)).status, 200);
        assert.equal((await fetch(`${base}/__perf/scene.js`)).status, 200);
        assert.equal((await fetch(`${base}/__lab/firebase-memory.js`)).status, 200);
        assert.equal(await (await fetch(`${base}/v/baseline/style.css`)).text(), "body{}");
        assert.match(await (await fetch(`${base}/v/baseline/foil-look.html`)).text(), /<base href="\/v\/baseline\/" \/>/);
        assert.equal((await fetch(`${base}/v/unknown/index.html`)).status, 404);
        assert.notEqual((await fetch(`${base}/v/baseline/..%2Fsecret.txt`)).status, 200);
        assert.equal((await fetch(`${base}/__lab/results`, { method: "POST", body: "not json" })).status, 400);
        assert.equal((await fetch(`${base}/v/baseline/style.css`, { method: "POST", body: "{}" })).status, 405);
        const response = await fetch(`${base}/__lab/results`, { method: "POST", body: JSON.stringify({ runs: [1] }) });
        assert.equal(response.status, 200);
        assert.equal(saved.length, 1);
        assert.equal(path.dirname(saved[0]), resultsDirectory);
        assert.deepEqual(JSON.parse(fs.readFileSync(saved[0], "utf8")), { runs: [1] });
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("the lab reports each visitor once and explains a request it cannot read", async () => {
    const lines = [];
    const server = createServer({});
    logVisitors(server, line => lines.push(line));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
        await fetch(`http://127.0.0.1:${port}/nothing`);
        await fetch(`http://127.0.0.1:${port}/nothing`);
        assert.deepEqual(lines, ["Connection from 127.0.0.1"]);
        // The first bytes of a TLS handshake, as sent by a browser that tries https:// on this plain server.
        await new Promise(resolve => {
            const socket = net.connect(port, "127.0.0.1", () => socket.write(Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00, 0x01, 0x00])));
            socket.on("data", () => { });
            socket.on("close", resolve);
            socket.on("error", resolve);
        });
        assert.match(lines.at(-1), /Unreadable request .*http:\/\//);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test("the lab counts dropped frames against the measured refresh and balances the order of builds", () => {
    const elementStub = () => ({ addEventListener() { }, setAttribute() { }, classList: { toggle() { } }, style: {}, add() { }, replaceChildren() { }, append() { } });
    const elements = new Map();
    const context = vm.createContext({
        document: {
            getElementById: id => { if (!elements.has(id)) { elements.set(id, { ...elementStub(), value: id == "length" ? "quick" : "rainbow" }); } return elements.get(id); },
            querySelectorAll: () => [], createElement: () => ({ getContext: () => null, ...elementStub() }), querySelector: () => elementStub()
        },
        window: {}, location: { origin: "http://x" }, navigator: {}, screen: { width: 1, height: 1 }, devicePixelRatio: 1, innerWidth: 1, innerHeight: 1,
        matchMedia: () => ({ matches: false }), Option: function () { }, URLSearchParams, setTimeout, encodeURIComponent, console
    });
    vm.runInContext(`${labScript()}\nthis.api = { summarize, steadyFrameTime, plan, median, LENGTHS, SCENES, VARIANTS };`, context);
    const { summarize, steadyFrameTime, plan, median, LENGTHS, SCENES, VARIANTS } = context.api;

    // A run locked to 60 Hz has dropped nothing, even if the empty page measured 120 Hz.
    const locked = Array(100).fill(16.6);
    assert.equal(summarize(locked, steadyFrameTime(locked)).droppedPercent, 0);
    assert.equal(Math.round(summarize(locked, steadyFrameTime(locked)).refreshHz), 60);

    const clean = summarize(Array(100).fill(8.33), 8.33);
    assert.equal(clean.droppedPercent, 0);
    assert.equal(Math.round(clean.fps), 120);
    // Ten frames at 16.7 ms each hide one dropped frame.
    const janky = summarize([...Array(90).fill(8.33), ...Array(10).fill(16.66)], 8.33);
    assert.ok(Math.abs(janky.droppedPercent - 10 / 110 * 100) < .1);
    assert.equal(janky.worst, 16.66);
    assert.equal(median([3, 1, 2]), 2);

    for (const config of Object.values(LENGTHS)) {
        config.scenes.forEach(scene => assert.ok(SCENES[scene]));
        config.variants.forEach(variant => assert.ok(VARIANTS.some(candidate => candidate.id == variant)));
    }
    const order = plan(LENGTHS.quick);
    assert.equal(order.length, 2 * 3 * 4);
    const firstInRound = round => order.find(step => step.round == round).variant;
    assert.equal(firstInRound(0), "today");
    assert.equal(firstInRound(1), "17+18");
});

test("the foil model's sheen stays within its documented error, and held foil caps repaints at any refresh rate", () => {
    assert.equal(softLight(1, 1), 1, "Soft light leaves white unchanged");
    assert.ok(softLight(.5, 1) > .5);
    const levels = Array.from({ length: 256 }, (_, level) => [level / 255]);
    const { worst } = sheenError(levels, .145, 1);
    assert.ok(worst < 6.1, `worst ${worst} of 255 levels`);
    assert.ok(worst < sheenError(levels, 0, 1).worst, "Closer to today than leaving the glare out");
    assert.equal(dragWrites(120, 0).foilWritesPerSecond, 120);
    for (const hz of [60, 120, 165]) { assert.ok(dragWrites(hz, 33).foilWritesPerSecond <= 31); }
});
