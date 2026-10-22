const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "card-depth.js"), "utf8");

function fixture(dpr = 1) {
    const draws = [], vertices = [], shadowPoints = [], frames = new Map(), warnings = [];
    let nextFrame = 0;
    const context2d = () => ({
        clearRect() {}, drawImage() {}, save() {}, restore() {}, scale() {}, translate() {},
        beginPath() {}, closePath() {}, fill() {},
        moveTo(x, y) { shadowPoints.push([x, y]); },
        lineTo(x, y) { shadowPoints.push([x, y]); }
    });
    const gl = {
        ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, COLOR_BUFFER_BIT: 3, TEXTURE_2D: 4, TRIANGLES: 5,
        viewport() {}, clearColor() {}, clear() {}, uniform2f() {}, uniform3f() {}, uniform1f() {},
        bindTexture() {}, deleteTexture() {},
        bufferData(target, data) { vertices.push(Array.from(data)); },
        drawArrays() { draws.push(true); }
    };
    const props = new Map();
    const element = {
        isConnected: true, offsetWidth: 128, offsetHeight: 192,
        style: { width: "128px", height: "192px", setProperty: (key, value) => props.set(key, value) },
        classList: { remove() {} },
        animate() { return { playState: "running", effect: { getComputedTiming: () => ({ progress: .5 }) } }; }
    };
    const canvas = () => ({ width: 0, height: 0, style: {}, dataset: {}, remove() {} });
    const state = {
        element, canvas: canvas(), shadow: canvas(), context: context2d(), shadowContext: context2d(),
        entry: { textures: [1, 2], outline: { x: .75, y: .75, radius: 8.75 } },
        pose: { pitch: 0, yaw: 0, roll: 0, lift: 18 }, frame: null
    };
    const context = vm.createContext({
        console: { warn: (...args) => warnings.push(args) },
        window: { devicePixelRatio: dpr },
        document: { createElement: () => ({ getContext: () => null }) },
        requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame: id => frames.delete(id)
    });
    vm.runInContext(`${source}\nglobalThis.CardDepth = CardDepth;`, context);
    const Depth = context.CardDepth;
    Depth.gl = gl;
    Depth.source = canvas();
    Depth.limit = 1536;
    Depth.states.set(element, state);
    Depth.active.add(state);
    return { Depth, element, state, gl, draws, vertices, shadowPoints, frames, warnings, props };
}

test("complete-card SSAA resolves a 2x target, with a fixed 3px laminated edge", () => {
    const f = fixture();
    f.Depth.update(f.element, { pitch: 0, yaw: 0 });
    assert.equal(f.draws.length, 18);
    assert.equal(Number(f.state.canvas.dataset.renderSize), f.state.canvas.width * 2);
    assert.equal(f.state.canvas.width, f.state.shadow.width);
    assert.ok(Math.abs(f.vertices[0][2] - (1 + 3 / 900)) < 1e-6, "Back sheet is exactly 3px behind the face");
    assert.ok(Math.abs(f.vertices.at(-1)[2] - (1 - .01 / 900)) < 1e-6);
    assert.ok(f.shadowPoints.reduce((sum, point) => sum + point[0], 0) > 0);
    assert.ok(f.shadowPoints.reduce((sum, point) => sum + point[1], 0) > 0);
});

test("mobile rendering caps density and render size without reducing the 2x resolve", () => {
    const f = fixture(4);
    f.element.style.width = "500px";
    f.element.style.height = "750px";
    f.Depth.update(f.element, { pitch: 18, yaw: -18 });
    assert.equal(f.Depth.source.width, 1536);
    assert.equal(f.state.canvas.width, 768);
    assert.equal(f.state.canvas.width * 2, f.Depth.source.width);
});

test("unchanged poses do not redraw, and rotation updates the shadow geometry", () => {
    const f = fixture();
    f.Depth.update(f.element, { pitch: 0, yaw: 0 });
    const initialShadow = f.shadowPoints.splice(0);
    f.Depth.update(f.element, { pitch: 0, yaw: 0 });
    assert.equal(f.draws.length, 18);
    assert.equal(f.shadowPoints.length, 0);
    f.Depth.update(f.element, { pitch: 16, yaw: -24, roll: 12 });
    assert.equal(f.draws.length, 36);
    assert.notDeepEqual(f.shadowPoints, initialShadow);
    assert.equal(f.props.get("--depth-roll"), "12deg");
});

test("pending textures retain the latest requested pose without hiding the image", () => {
    const f = fixture();
    delete f.state.entry;
    f.Depth.update(f.element, { pitch: 12, yaw: -8 });
    assert.equal(f.state.pose.pitch, 12);
    assert.equal(f.state.pose.yaw, -8);
    assert.equal(f.draws.length, 0);
});

test("flight follow uses the actual animation progress and detaches without queued frames", () => {
    const f = fixture();
    f.Depth.follow(f.element, f.element.animate(), progress => ({ yaw: progress * 18 }));
    assert.equal(f.state.pose.yaw, 9);
    assert.equal(f.frames.size, 1);
    f.Depth.cancelFollow(f.element);
    assert.equal(f.frames.size, 0);
    f.Depth.follow(f.element, f.element.animate(), progress => ({ pitch: progress * 18 }));
    f.Depth.detach(f.element);
    assert.equal(f.frames.size, 0);
    assert.equal(f.Depth.states.has(f.element), false);
    assert.equal(f.Depth.active.size, 0);
});

test("a removed flight releases its renderer instead of retaining a disconnected preview", () => {
    const f = fixture();
    f.element.isConnected = false;
    f.Depth.follow(f.element, f.element.animate(), () => ({ yaw: 12 }));
    assert.equal(f.Depth.active.size, 0);
    assert.equal(f.frames.size, 0);
});

test("unavailable WebGL explicitly warns once and retains native rendering", () => {
    const f = fixture();
    delete f.Depth.gl;
    assert.equal(f.Depth.initialize(), false);
    assert.equal(f.Depth.initialize(), false);
    assert.equal(f.warnings.length, 1);
    assert.equal(f.Depth.disabled, true);
});

test("large simultaneous clears keep the GPU preview budget bounded", () => {
    const f = fixture();
    for (let index = 0; index < 7; index++) { f.Depth.active.add({}); }
    f.Depth.attach({});
    assert.equal(f.Depth.active.size, 8);
    assert.equal(f.warnings.length, 1);
});

test("both production and interaction sandboxes load the selected renderer", () => {
    for (const file of ["index.html", "tests/card-tilt-sandbox.html", "tests/mouse-drag-sandbox.html"]) {
        const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.match(html, /card-depth\.css/);
        assert.match(html, /card-depth\.js/);
        assert.ok(html.indexOf("card-depth.js") < html.indexOf("js/game.js"));
    }
});
