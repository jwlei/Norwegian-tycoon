const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const G = require("../js/landing-geometry.js");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "card-depth.js"), "utf8");

function fixture() {
    const frames = new Map(), warnings = [], created = [];
    let nextFrame = 0;
    class Node {
        constructor(tag) {
            this.tag = tag;
            this.attributes = {};
            this.children = [];
            this.dataset = {};
            this.isConnected = true;
            this.offsetWidth = 112;
            this.offsetHeight = 168;
            this.properties = new Map();
            this.style = { width: "", height: "", setProperty: (k, v) => this.properties.set(k, v),
                getPropertyValue: k => this.properties.get(k) || "" };
            this.classes = new Set();
            this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
        }
        setAttribute(key, value) { this.attributes[key] = String(value); }
        getAttribute(key) { return this.attributes[key]; }
        appendChild(child) { child.parent = this; this.children.push(child); }
        insertBefore(child) { child.parent = this; this.children.unshift(child); }
        replaceChildren(...children) { this.children = children; }
        remove() { this.removed = true; }
        querySelector(selector) { return selector === "img" ? this.image : null; }
        getBoundingClientRect() { return { left: this.left || 200, top: this.top || 200, width: 112, height: 168 }; }
        animate() { return { playState: "running", effect: { getComputedTiming: () => ({ progress: .5 }) } }; }
    }
    const context = vm.createContext({
        LandingGeometry: G, console: { warn: (...args) => warnings.push(args) },
        DOMParser: class { parseFromString() { return { querySelector: () => ({ getAttribute: () => "8" }) }; } },
        document: { hidden: false, querySelectorAll: () => [],
            createElementNS: (ns, tag) => { created.push(tag); return new Node(tag); } },
        requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame: id => frames.delete(id)
    });
    vm.runInContext(`${source}\nglobalThis.CardDepth = CardDepth;`, context);
    const element = new Node("div");
    element.image = { src: "data:image/svg+xml,%3Csvg%2F%3E" };
    const table = elements => {
        const parent = new Node("div");
        parent.querySelectorAll = () => elements;
        return parent;
    };
    return { Depth: context.CardDepth, element, Node, table, created, frames, warnings, context };
}

test("native SVG keeps seven silhouette sheets at exactly 3px, with no canvas or WebGL", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    f.Depth.update(f.element, { pitch: 0, yaw: 0, lift: 0 });
    const state = f.Depth.states.get(f.element);
    assert.equal(state.layers.length, 7);
    assert.equal(state.world.z, 3.06);
    assert.equal(state.svg.attributes.viewBox, "-56 -84 112 168");
    assert.equal(state.face.attributes.href, f.element.image.src);
    assert.equal(state.layers[0].attributes.d, f.Depth.path(G.silhouette(state.world, -3).map(G.screen), { x: 0, y: 0 }));
    assert.ok(f.created.every(tag => tag !== "canvas"));
    assert.doesNotMatch(source, /getContext|devicePixelRatio|drawImage|WebGL|supersampl/);
    assert.equal(f.frames.size, 0);
});

test("unchanged poses do not redraw, while rotation updates geometry and foil transforms", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    const state = f.Depth.states.get(f.element);
    const before = state.layers[0].attributes.d, key = state.key;
    let writes = 0;
    state.face.setAttribute = () => writes++;
    f.Depth.update(f.element, {});
    assert.equal(writes, 0);
    assert.equal(state.key, key);
    f.Depth.update(f.element, { pitch: 16, yaw: -24, roll: 12 });
    assert.ok(writes > 0);
    assert.notEqual(state.layers[0].attributes.d, before);
    assert.equal(f.element.properties.get("--depth-roll"), "12deg");
});

test("table cards fit actual supporting footprints and keep compact receiver shadows", () => {
    const f = fixture();
    const second = new f.Node("div");
    second.image = f.element.image;
    second.left = 260;
    const table = f.table([f.element, second]);
    f.Depth.prepareTable(table);
    const first = f.Depth.states.get(f.element), top = f.Depth.states.get(second);
    assert.equal(first.rest.z, 3.06);
    assert.ok(top.rest.yaw > .2);
    assert.equal(top.receiverStates.length, 1);
    assert.equal(top.shadowEntries.length, 2);
    assert.equal(top.shadowEntries[0].shape.parent, top.scene.floor, "Felt shadow is below all card faces");
    assert.equal(top.shadowEntries[1].shape.parent, first.receiverShadows, "Receiver face occlusion uses normal paint order");
    assert.equal(first.receiverShadows.attributes["clip-path"], `url(#${first.id}-clip)`);
    assert.ok(Number(top.shadowEntries[1].shape.dataset.blur) < 1);
    const previous = { ...top.rest };
    f.Depth.prepareTable(table);
    assert.deepEqual({ ...top.rest }, previous, "Repeated layout does not accumulate height or tilt");
});

test("production trajectory retains contact momentum and lands exactly on the persistent table pose", () => {
    const f = fixture();
    f.Depth.prepareTable(f.table([f.element]));
    const flight = new f.Node("span");
    flight.image = f.element.image;
    f.Depth.attach(flight);
    const motion = f.Depth.landingMotion(flight, f.element,
        { x: 400, y: 500, z: 0, pitch: 10, yaw: -12, roll: 16 }, .7);
    const sample = motion.poseAtProgress;
    const final = sample(1), contact = sample(.58), rebound = sample(.7);
    assert.deepEqual({ ...final }, { ...f.Depth.states.get(f.element).rest });
    assert.ok(Math.hypot(contact.x - final.x, contact.y - final.y) > 1);
    assert.ok(rebound.z > G.minimumHeight([], rebound) + .1);
    for (let i = 0; i <= 100; i++) {
        const pose = sample(i / 100);
        const position = motion.positionAtProgress(i / 100);
        for (const key of ["x", "y", "roll"]) { assert.ok(Math.abs(position[key] - pose[key]) < 1e-8); }
        assert.ok(G.samples(pose, -3).every(point => point.z >= .059));
    }
});

test("hidden destinations do not leave duplicate external shadows, and detach removes hosted shadows", () => {
    const f = fixture();
    f.Depth.prepareTable(f.table([f.element]));
    const state = f.Depth.states.get(f.element), entry = state.shadowEntries[0];
    f.Depth.setHidden(f.element, true);
    assert.equal(entry.shape.style.display, "none");
    f.Depth.setHidden(f.element, false);
    assert.equal(entry.shape.style.display, "");
    f.Depth.detach(f.element);
    assert.equal(entry.shape.removed, true);
    assert.equal(entry.filter.removed, true);
});

test("a refreshed table receives ongoing flight shadows instead of retaining detached hosts", () => {
    const f = fixture();
    f.element.dataset.cardKey = "1:7";
    f.element.closest = () => ({ dataset: { playSignature: "round:play" } });
    f.Depth.prepareTable(f.table([f.element]));
    const flight = new f.Node("span");
    flight.image = f.element.image;
    f.Depth.attach(flight);
    f.Depth.landingMotion(flight, f.element, { x: 400, y: 500, z: 0, pitch: 10, yaw: 5, roll: 0 });
    f.Depth.update(flight, { x: 300, y: 400 });
    const state = f.Depth.states.get(flight), previous = state.shadowEntries[0];
    const replacement = new f.Node("div");
    replacement.dataset.cardKey = "1:7";
    replacement.closest = f.element.closest;
    replacement.image = f.element.image;
    f.context.document.querySelectorAll = () => [flight];
    f.Depth.prepareTable(f.table([replacement]));
    assert.equal(previous.shape.removed, true);
    assert.equal(state.scene, f.Depth.states.get(replacement).scene);
    assert.equal(state.shadowEntries[0].shape.parent, state.scene.floor);
});

test("animation follow cancels queued work and releases disconnected cards", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    f.Depth.follow(f.element, f.element.animate(), progress => ({ yaw: progress * 18 }));
    assert.equal(f.Depth.states.get(f.element).pose.yaw, 9);
    assert.equal(f.frames.size, 1);
    f.Depth.cancelFollow(f.element);
    assert.equal(f.frames.size, 0);
    f.Depth.follow(f.element, f.element.animate(), progress => ({ pitch: progress * 18 }));
    const svg = f.Depth.states.get(f.element).svg;
    f.Depth.detach(f.element);
    assert.equal(f.frames.size, 0);
    assert.equal(f.Depth.states.has(f.element), false);
    assert.equal(svg.removed, true);
    f.Depth.attach(f.element);
    f.element.isConnected = false;
    f.Depth.follow(f.element, f.element.animate(), () => ({ yaw: 12 }));
    assert.equal(f.Depth.states.has(f.element), false);
});

test("invalid artwork logs an explicit warning and retains the original image", () => {
    const f = fixture();
    f.context.DOMParser = class { parseFromString() { return { querySelector: () => null }; } };
    f.Depth.attach(f.element);
    f.Depth.attach(f.element);
    assert.equal(f.warnings.length, 1);
    assert.equal(f.Depth.states.has(f.element), false);
    assert.equal(f.element.classes.has("has-card-depth"), false);
});

test("production and interaction sandboxes load shared geometry before the native renderer", () => {
    for (const file of ["index.html", "tests/card-tilt-sandbox.html", "tests/mouse-drag-sandbox.html"]) {
        const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        assert.match(html, /card-depth\.css/);
        assert.ok(html.indexOf("landing-geometry.js") < html.indexOf("card-depth.js"));
        assert.ok(html.indexOf("card-depth.js") < html.indexOf("js/game.js"));
    }
});
