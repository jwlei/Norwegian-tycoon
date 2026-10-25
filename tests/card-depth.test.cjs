const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const G = require("../js/landing-geometry.js");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "card-depth.js"), "utf8");

function fixture(borderColor = null) {
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
            this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name),
                contains: name => this.classes.has(name),
                toggle: (name, force) => (force ?? !this.classes.has(name)) ? this.classes.add(name) : this.classes.delete(name) };
        }
        setAttribute(key, value) { this.attributes[key] = String(value); }
        getAttribute(key) { return this.attributes[key]; }
        hasAttribute(key) { return key in this.attributes; }
        removeAttribute(key) { delete this.attributes[key]; }
        appendChild(child) { child.parent = this; this.children.push(child); }
        insertBefore(child) { child.parent = this; this.children.unshift(child); }
        replaceChildren(...children) { this.children = children; }
        remove() { this.removed = true; }
        querySelector(selector) { return selector === "img" ? this.image : null; }
        getBoundingClientRect() {
            return { left: (this.left || 200) + (parseFloat(this.properties.get("--landing-offset-x")) || 0),
                top: (this.top || 200) + (parseFloat(this.properties.get("--landing-offset-y")) || 0),
                width: this.offsetWidth, height: this.offsetHeight };
        }
        animate() { return { playState: "running", effect: { getComputedTiming: () => ({ progress: .5 }) } }; }
    }
    const context = vm.createContext({
        LandingGeometry: G, console: { warn: (...args) => warnings.push(args) }, queueMicrotask,
        DOMParser: class { parseFromString() {
            return { querySelector: () => ({ getAttribute: name => name === "stroke" ? borderColor : "8" }) };
        } },
        document: { hidden: false, querySelectorAll: () => [],
            createElementNS: (ns, tag) => { created.push(tag); return new Node(tag); } },
        requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame: id => frames.delete(id)
    });
    vm.runInContext(`${source}\nglobalThis.CardDepth = CardDepth;`, context);
    const element = new Node("div");
    element.image = { src: "data:image/svg+xml,%3Csvg%2F%3E" };
    const table = (elements, bounds = null) => {
        const parent = new Node("div");
        parent.querySelectorAll = () => elements;
        parent.closest = () => bounds ? { getBoundingClientRect: () => bounds } : null;
        return parent;
    };
    const card = (left, top = 200) => {
        const node = new Node("div");
        node.image = element.image;
        node.left = left;
        node.top = top;
        return node;
    };
    return { Depth: context.CardDepth, element, Node, table, card, created, frames, warnings, context };
}

const numbers = d => d.match(/-?\d+\.\d+/g).map(Number);

test("simple shadows bypass projection, occlusion and blur while preserving the rendered card", () => {
    const f = fixture();
    assert.equal(f.Depth.shadowStyle, "fancy");
    f.Depth.attach(f.element);
    const state = f.Depth.states.get(f.element);
    const artwork = JSON.stringify([state.layers.map(layer => layer.attributes), state.face.attributes,
        state.light.attributes, state.outline.attributes, state.pose]);
    const original = state.shadowEntries.get(f.Depth.FLOOR);
    const fancyPath = original.path;
    f.context.document.querySelectorAll = () => [f.element];
    const geometry = f.context.LandingGeometry;
    f.context.LandingGeometry = new Proxy(geometry, {
        get(target, key) {
            if (["shadow", "shadowVisible", "exposedPoints"].includes(key)) {
                return () => assert.fail(`Simple shadows must not call ${key}`);
            }
            return target[key];
        }
    });
    const before = f.created.length;
    f.Depth.setShadowStyle("simple");
    const simple = state.shadowEntries.get(f.Depth.FLOOR);
    assert.equal(original.shape.removed, true);
    assert.equal(original.filter.removed, true, "Old blur filters are removed when changing modes");
    assert.deepEqual(f.created.slice(before), ["path"], "Simple mode adds only one unfiltered silhouette");
    assert.equal(simple.path, state.faceOutline);
    assert.equal(simple.filter, null);
    assert.equal(simple.shape.hasAttribute("filter"), false);
    assert.equal(state.shadowEntries.size, 1);
    assert.equal(JSON.stringify([state.layers.map(layer => layer.attributes), state.face.attributes,
        state.light.attributes, state.outline.attributes, state.pose]), artwork);
    f.Depth.setHidden(f.element, true);
    assert.equal(simple.shape.style.display, "none");
    f.Depth.setHidden(f.element, false);
    assert.equal(simple.shape.style.display, "");
    f.Depth.update(f.element, { lift: 45, pitch: 12, yaw: -7 });
    assert.equal(simple.path, state.faceOutline, "Shadow follows the current tilt and outline");
    f.Depth.update(f.element, { lift: 18, pitch: 0, yaw: 0 });
    f.context.LandingGeometry = geometry;
    f.Depth.setShadowStyle("fancy");
    assert.equal(simple.shape.removed, true);
    assert.equal(state.shadowEntries.get(f.Depth.FLOOR).path, fancyPath, "Fancy rendering is restored exactly");
    assert.equal(f.warnings.length, 0);
});

test("simple table and flight shadows use the floor without receiver shadows or filters", () => {
    const f = fixture();
    f.Depth.setShadowStyle("simple");
    const cards = [f.card(200), f.card(230), f.card(260)];
    const table = f.table(cards);
    f.Depth.prepareTable(table);
    const scene = f.Depth.scenes.get(table);
    for (const card of cards) {
        const state = f.Depth.states.get(card);
        assert.equal(state.shadowEntries.size, 1);
        const entry = state.shadowEntries.get(f.Depth.FLOOR);
        assert.equal(entry.host, scene.floor);
        assert.equal(entry.filter, null);
        assert.equal(state.receiverShadows.children.length, 0);
        assert.ok(entry.shape.getAttribute("transform").startsWith("translate("));
    }
    const flight = f.card(200);
    f.Depth.attach(flight, false);
    const state = f.Depth.states.get(flight);
    f.Depth.bind(state, scene, cards.map(card => f.Depth.states.get(card)));
    state.isFlight = true;
    f.Depth.update(flight, { x: 250, y: 220, lift: 60 });
    assert.equal(state.shadowEntries.size, 1);
    assert.equal(state.shadowEntries.get(f.Depth.FLOOR).host, scene.floor);
    state.shadowless = true;
    f.Depth.update(flight, {});
    assert.equal(state.shadowEntries.get(f.Depth.FLOOR).shape.style.display, "none");
    assert.equal(f.warnings.length, 0);
});

test("prepared detached cards adopt the current shadow setting on their next update", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    const state = f.Depth.states.get(f.element);
    const original = state.shadowEntries.get(f.Depth.FLOOR);
    f.Depth.setShadowStyle("simple");
    assert.equal(state.shadowStyle, "fancy", "Detached previews are not queried for a live refresh");
    f.Depth.update(f.element, {});
    assert.equal(state.shadowStyle, "simple");
    assert.equal(original.shape.removed, true);
    assert.equal(state.shadowEntries.get(f.Depth.FLOOR).filter, null);
    assert.throws(() => f.Depth.setShadowStyle("invalid"), { name: "RangeError" });
});

test("shadow settings restore, persist and synchronize Fancy and Simple with accessible buttons", () => {
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const begin = connection.indexOf("        function updateCardShadowButtons(");
    const block = connection.slice(begin, connection.indexOf("        function updatePlayInputButtons()", begin));
    for (const saved of ["", "invalid", "fancy", "simple"]) {
        const buttons = ["fancy", "simple"].map(style => ({
            dataset: { cardShadow: style }, attributes: {},
            setAttribute(key, value) { this.attributes[key] = value; },
            addEventListener(type, handler) { this[type] = handler; }
        }));
        const storageListeners = [];
        const writes = [];
        const context = vm.createContext({
            CardDepth: { shadowStyle: "fancy", setShadowStyle(style) { this.shadowStyle = style; } },
            document: { querySelectorAll: () => buttons },
            window: { addEventListener(type, handler) { storageListeners.push(handler); } },
            getCookie(key) { assert.equal(key, "CardShadowStyle"); return saved; },
            setCookie(...args) { writes.push(args); }
        });
        vm.runInContext(block, context);
        assert.equal(context.CardDepth.shadowStyle, saved === "simple" ? "simple" : "fancy");
        buttons[1].click();
        assert.deepEqual(writes.pop(), ["CardShadowStyle", "simple", 1000]);
        assert.equal(buttons[1].attributes["aria-pressed"], "true");
        assert.equal(buttons[0].attributes["aria-pressed"], "false");
        buttons[0].click();
        assert.equal(context.CardDepth.shadowStyle, "fancy");
        assert.deepEqual(writes.pop(), ["CardShadowStyle", "fancy", 1000]);
        storageListeners[0]({ key: "unrelated", newValue: "simple" });
        assert.equal(context.CardDepth.shadowStyle, "fancy");
        storageListeners[0]({ key: "norwegian-tycoon-cookie-CardShadowStyle", newValue: "simple" });
        assert.equal(context.CardDepth.shadowStyle, "simple");
        assert.equal(buttons[1].attributes["aria-pressed"], "true");
        storageListeners[0]({ key: "norwegian-tycoon-cookie-CardShadowStyle", newValue: null });
        assert.equal(context.CardDepth.shadowStyle, "fancy");
        assert.equal(buttons[0].attributes["aria-pressed"], "true");
    }
});

test("recreated cards keep the document's six-second foil phase without changing other animations", () => {
    const f = fixture();
    f.context.document.timeline = { currentTime: 8123 };
    const color = { animationName: "foil-idle-color", currentTime: 0 };
    const idleGlare = { animationName: "foil-idle-glare", currentTime: 0 };
    const glare = { animationName: "required-card-pulse", currentTime: 0 };
    const other = { animationName: "required-card-pulse", currentTime: 77 };
    f.element.getAnimations = options => {
        assert.equal(options.subtree, true, "Include pseudo-element animations");
        return [color, idleGlare, glare, other];
    };
    f.Depth.attach(f.element);
    assert.equal(color.currentTime, 2123);
    assert.equal(idleGlare.currentTime, 2123, "Glare drift shares the color pulse phase");
    assert.equal(glare.currentTime, 0, "Unrelated animations keep their clocks");
    assert.equal(other.currentTime, 77);
    color.currentTime = 2300;
    f.Depth.attach(f.element);
    assert.equal(color.currentTime, 2300, "Reattaching existing cards does not seek their animation");
    const replacement = f.card(200);
    const replacementColor = { animationName: "foil-idle-color", currentTime: 0 };
    replacement.getAnimations = () => [replacementColor];
    f.context.document.timeline.currentTime = 8300;
    f.Depth.attach(replacement);
    assert.equal(replacementColor.currentTime, 2300);
    assert.equal(f.warnings.length, 0);
});

test("table foil phase synchronization batches every animation read before seeking clocks", () => {
    const f = fixture(), events = [];
    f.context.document.timeline = { currentTime: 8123 };
    const cards = [f.card(200), f.card(230), f.card(260)];
    const clocks = cards.map(() => ({ value: 0 }));
    cards.forEach((card, index) => {
        const animation = { animationName: "foil-idle-color" };
        Object.defineProperty(animation, "currentTime", {
            get: () => clocks[index].value,
            set(value) { events.push("seek"); clocks[index].value = value; }
        });
        card.getAnimations = () => { events.push("read"); return [animation]; };
    });
    f.Depth.prepareTable(f.table(cards));
    assert.deepEqual(events, ["read", "read", "read", "seek", "seek", "seek"]);
    assert.deepEqual(clocks.map(clock => clock.value), [2123, 2123, 2123]);
    assert.equal(f.warnings.length, 0);
});

test("offscreen foils alone pause and resume at the phase they would have reached while visible", () => {
    const f = fixture(), observers = [];
    let now = 100;
    f.context.performance = { now: () => now };
    f.context.IntersectionObserver = class {
        constructor(callback, options) { this.callback = callback; this.options = options; this.observed = []; observers.push(this); }
        observe(element) { this.observed.push(element); }
        disconnect() { this.disconnected = true; }
    };
    const color = { animationName: "foil-idle-color", currentTime: 1234, playState: "running" };
    const idleGlare = { animationName: "foil-idle-glare", currentTime: 1234, playState: "running" };
    const glare = { animationName: "required-card-pulse", currentTime: 2500, playState: "running" };
    const paused = { animationName: "foil-idle-color", currentTime: 77, playState: "paused" };
    const unrelated = { animationName: "required-card-pulse", currentTime: 99, playState: "running" };
    const card = f.card(200);
    const cards = [card];
    card.getAnimations = () => [color, idleGlare, glare, paused, unrelated];
    const root = { querySelectorAll(selector) {
        assert.equal(selector, '[data-foil]:not([data-foil="none"])');
        return cards;
    } };
    f.Depth.observeFoils(root);
    f.Depth.observeFoils(root);
    assert.equal(observers.length, 1);
    assert.deepEqual(observers[0].observed, [card]);
    assert.equal(observers[0].options.rootMargin, "128px", "Wake effects before they enter the viewport");
    const callback = observers[0].callback;
    callback([{ target: card, isIntersecting: true }]);
    assert.equal(color.currentTime, 1234, "Visible cards never have their phase or clocks changed");
    callback([{ target: card, isIntersecting: false }]);
    assert.equal(card.classes.has("is-foil-offscreen"), true);
    now = 3100;
    callback([{ target: card, isIntersecting: false }]);
    callback([{ target: card, isIntersecting: true }]);
    assert.equal(card.classes.has("is-foil-offscreen"), false);
    assert.equal(color.currentTime, 4234);
    assert.equal(idleGlare.currentTime, 4234, "Both idle foil layers resume together");
    assert.equal(glare.currentTime, 2500, "Only idle foil layers pause and resume");
    assert.equal(paused.currentTime, 77);
    assert.equal(unrelated.currentTime, 99);
    const appended = f.card(230);
    cards.push(appended);
    f.Depth.observeFoils(root);
    assert.deepEqual(observers[0].observed, [card, appended], "Appended plays join the existing observer exactly once");
    f.Depth.stopObservingFoils(root);
    assert.equal(observers[0].disconnected, true);
    assert.equal(root._foilObserver, undefined);
    f.Depth.observeFoils(root);
    assert.equal(observers.length, 2, "A replaced hand gets its own visibility observer");
});

test("unchanged table poses preserve exposure cache identities and distant shadows skip exposure sampling", () => {
    const f = fixture();
    const cards = [f.card(200), f.card(230), f.card(260)];
    f.Depth.prepareTable(f.table(cards));
    const state = f.Depth.states.get(cards[0]), world = state.world;
    f.Depth.update(cards[0], {});
    assert.equal(state.world, world);
    assert.equal(state.placed, world);
    const receiver = f.Depth.states.get(cards[1]);
    const exposed = f.Depth.exposed(receiver);
    f.Depth.update(cards[1], {});
    assert.equal(f.Depth.exposed(receiver), exposed);
    const originalExposed = f.Depth.exposed;
    let exposureReads = 0;
    f.Depth.exposed = function (...args) { exposureReads++; return originalExposed.apply(this, args); };
    state.receiverStates = [receiver];
    f.Depth.update(cards[0], { x: 10000 });
    assert.equal(exposureReads, 0);
    assert.equal(f.warnings.length, 0);
});

test("reused table cards preserve exact base bounds when their pile moves with an appended play", () => {
    const f = fixture();
    const cards = [f.card(200), f.card(230), f.card(260)];
    const table = f.table(cards);
    f.Depth.prepareTable(table);
    const previous = cards.map(card => ({ ...f.Depth.states.get(card).layoutBounds }));
    table.left = 220;
    table.top = 210;
    cards.forEach(card => { card.left += 20; card.top += 10; });
    const original = cards[1].getBoundingClientRect.bind(cards[1]);
    cards[1].getBoundingClientRect = () => {
        const bounds = original();
        return { ...bounds, top: bounds.top + .000015 };
    };
    f.Depth.prepareTable(table);
    cards.forEach((card, index) => {
        assert.deepEqual({ ...f.Depth.states.get(card).layoutBounds },
            { ...previous[index], left: previous[index].left + 20, top: previous[index].top + 10 });
    });
    assert.equal(f.warnings.length, 0);
});

test("seven depth sheets follow the artwork border color instead of a universal beige edge", () => {
    for (const color of ["#9d9bdf", "#8a5f0f", "#89a6cf", "#b8a15b", "#cbbd9f"]) {
        const f = fixture(color);
        f.Depth.attach(f.element);
        const state = f.Depth.states.get(f.element);
        assert.equal(state.layers.length, 7);
        assert.equal(state.layers[6].getAttribute("fill"), color);
        assert.equal(state.layers[2].getAttribute("fill"), color);
        assert.ok(new Set(state.layers.map(layer => layer.getAttribute("fill"))).size > 1,
            "Subtle lamination shading retains the depth effect");
        assert.equal(f.warnings.length, 0);
    }
});

test("artwork metadata parses once per source and retains exact radius and seven layer colors", () => {
    const f = fixture("#9d9bdf");
    let parses = 0;
    const Parser = f.context.DOMParser;
    f.context.DOMParser = class extends Parser {
        parseFromString(...args) { parses++; return super.parseFromString(...args); }
    };
    f.Depth.attach(f.element);
    const first = f.Depth.states.get(f.element);
    for (let index = 0; index < 4; index++) {
        const card = f.card(200 + index * 10);
        f.Depth.attach(card);
        const state = f.Depth.states.get(card);
        assert.equal(state.radius, first.radius);
        assert.deepEqual(state.layers.map(layer => layer.getAttribute("fill")),
            first.layers.map(layer => layer.getAttribute("fill")));
        assert.deepEqual(state.layers.map(layer => layer.getAttribute("d")),
            first.layers.map(layer => layer.getAttribute("d")));
        assert.notEqual(state.id, first.id, "Reusable metadata never shares SVG IDs or mutable state");
    }
    assert.equal(parses, 1);
    for (let index = 0; index < 130; index++) {
        const card = f.card(200);
        card.image = { src: `data:image/svg+xml,%3Csvg%2F%3E%20${index}` };
        f.Depth.attach(card, false);
    }
    assert.equal(f.Depth.artworkMetadata.size, 128, "Browsing appearances does not retain unbounded artwork");
    assert.equal(f.warnings.length, 0);
});

test("hand scrolling never measures unrelated tables and page scrolling batches flight reads before writes", () => {
    const f = fixture();
    const events = [];
    const table = new f.Node("div");
    table.getBoundingClientRect = () => {
        events.push("read");
        return { left: 190, top: 150 };
    };
    const flights = Array.from({ length: 4 }, () => {
        const element = new f.Node("div");
        let translation = "";
        Object.defineProperty(element.style, "translate", {
            get: () => translation,
            set(value) { events.push("write"); translation = value; }
        });
        const state = { element, scene: { table }, anchor: { x: 200, y: 200 } };
        f.Depth.states.set(element, state);
        f.Depth.anchored.add(state);
        return element;
    });
    f.Depth.followScroll({ contains: () => false });
    assert.deepEqual(events, [], "Sibling hand scrolls do not trigger flight layout reads or writes");
    f.Depth.followScroll(f.context.document);
    assert.deepEqual(events, ["read", "write", "write", "write", "write"]);
    assert.ok(flights.every(flight => flight.style.translate == "-10px -50px"));
    events.length = 0;
    f.Depth.followScroll({ contains: candidate => candidate === table });
    assert.deepEqual(events, ["read", "write", "write", "write", "write"],
        "A scrolling table ancestor still updates all anchored cards immediately");
});

test("translation and receiver-only changes do not repaint identical card artwork or shadow filters", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    const state = f.Depth.states.get(f.element);
    f.Depth.update(f.element, { pitch: 4, yaw: 6, roll: 8, z: 30 });
    let artworkWrites = 0;
    const shape = state.layers[0], set = shape.setAttribute.bind(shape);
    shape.setAttribute = (...args) => { artworkWrites++; set(...args); };
    f.Depth.update(f.element, { x: 10, y: 20 });
    assert.equal(artworkWrites, 0, "Translation does not change local SVG geometry");
    f.Depth.update(f.element, { roll: 9 });
    assert.ok(artworkWrites > 0, "Visible angle changes still redraw the exact geometry");
    const entry = state.shadowEntries.get("floor");
    let filterWrites = 0;
    const blurSet = entry.blur.setAttribute.bind(entry.blur);
    entry.blur.setAttribute = (...args) => { filterWrites++; blurSet(...args); };
    f.Depth.setBlur(state, entry, entry.effectiveBlur);
    assert.equal(filterWrites, 0, "An identical blur does not invalidate its GPU filter");
    f.Depth.setBlur(state, entry, entry.effectiveBlur + .1);
    assert.equal(filterWrites, 1, "Changed softness retains full precision");
    const receiver = f.card(210), caster = f.card(220);
    f.Depth.prepareTable(f.table([receiver, caster]));
    const casterState = f.Depth.states.get(caster);
    let writes = 0;
    casterState.layers.forEach(layer => {
        const original = layer.setAttribute.bind(layer);
        layer.setAttribute = (...args) => { writes++; original(...args); };
    });
    const oldKey = casterState.key;
    f.Depth.update(receiver, { roll: 5 });
    f.Depth.update(caster, {});
    assert.notEqual(casterState.key, oldKey, "Receiver movement invalidates shadow dependencies");
    assert.equal(writes, 0, "Receiver-only updates preserve the unchanged seven-sheet artwork");
});

test("board-backed splayed plays cover at least 10% without snapping or drifting on refresh and resize", () => {
    for (const board of [
        { left: 100, top: 80, width: 342, height: 320 },
        { left: 100, top: 80, width: 300, height: 180 },
        { left: 100, top: 80, width: 820, height: 500 }
    ]) {
        const f = fixture(), groups = [], cards = [];
        const small = board.height < 200;
        for (let play = 0; play < 10; play++) {
            const parent = new f.Node("div");
            const group = Array.from({ length: play % 4 + 1 }, (_, index) => {
                const card = f.card(board.left + (play % 2 ? board.width - 180 : 30) + index * 24,
                    board.top + 30 + play % 3 * 15 + index % 2 * 4);
                card.parentElement = parent;
                card.offsetWidth = small ? 64 : 100;
                card.offsetHeight = small ? 96 : 150;
                card.style.setProperty("--pile-rotation", String((play % 2 ? -15 : 15) + index * 2));
                return card;
            });
            cards.push(...group);
            groups.push(group);
        }
        const table = f.table(cards, board);
        const check = () => {
            f.Depth.prepareTable(table);
            let previous = null;
            for (const group of groups) {
                const poses = group.map(card => f.Depth.states.get(card).rest);
                if (previous) {
                    assert.ok(G.overlapCoverage(poses.at(-1), previous) >= .1,
                        `Projected coverage is ${G.overlapCoverage(poses.at(-1), previous)}`);
                }
                poses.forEach((pose, index) => {
                    if (index) {
                        const first = poses[0];
                        assert.ok(Math.abs(pose.x - first.x - (group[index].left - group[0].left)) < 1e-7);
                        const difference = Math.abs((pose.y - pose.z * G.VIEW_SHEAR) -
                            (first.y - first.z * G.VIEW_SHEAR) - (group[index].top - group[0].top));
                        assert.ok(difference < .5, `Discrete support contacts preserve subpixel fan spacing (${difference}px)`);
                    }
                    assert.ok(G.silhouette(pose).map(G.screen).every(p => p.x >= board.left &&
                        p.x <= board.left + board.width && p.y >= board.top && p.y <= board.top + board.height));
                    assert.equal(pose.roll, parseFloat(group[index].style.getPropertyValue("--pile-rotation")),
                        "Preserve each card's natural individual rotation");
                    const flight = f.card(200, 500);
                    f.Depth.attach(flight, false);
                    const motion = f.Depth.landingMotion(flight, group[index], { x: 200, y: 500, roll: 0 }, .7);
                    const near = motion.poseAtProgress(1 - 1e-6), end = motion.poseAtProgress(1);
                    for (const key of ["x", "y", "z", "roll", "pitch", "yaw"]) {
                        assert.ok(Math.abs(near[key] - end[key]) < .02, `No ${key} endpoint snap`);
                    }
                    f.Depth.detach(flight);
                });
                previous = poses.at(-1);
            }
            return JSON.stringify(cards.map(card => f.Depth.states.get(card).rest));
        };
        const first = check();
        assert.equal(check(), first, "Repeated layout does not accumulate translation");
        cards.forEach(card => f.Depth.detach(card));
        assert.equal(check(), first, "Reattaching native depth does not treat offsets as new input");
        board.width += 50;
        board.height += 30;
        check();
    }
});

test("landing friction adds only a little slide, without acceleration or an endpoint snap", () => {
    const f = fixture(), target = f.card(200);
    f.Depth.prepareTable(f.table([target]));
    const rest = f.Depth.states.get(target).rest;
    for (const distance of [5, 50, 200, 700]) {
        for (const power of [0, .5, 1]) {
            const flight = f.card(200);
            f.Depth.attach(flight, false);
            const start = { x: rest.x, y: rest.y + distance, roll: 0 };
            const motion = f.Depth.landingMotion(flight, target, start, power);
            const at = motion.positionAtProgress;
            const slide = Math.hypot(at(1).x - at(G.CONTACT).x, at(1).y - at(G.CONTACT).y);
            const baseline = G.slideDistanceToRest(distance, power, rest.height);
            if (distance >= 50) {
                assert.ok(Math.abs(slide / baseline - 1.12) < 1e-7,
                    "Normal throws slide exactly 12% longer than before");
            } else {
                assert.ok(slide <= distance * .18 + 1e-7, "Tiny throws cannot overshoot their travel");
            }
            let lastSpeed = Infinity;
            for (let t = .01; t < 1; t += .01) {
                const speed = Math.hypot(at(t + 1e-5).x - at(t - 1e-5).x,
                    at(t + 1e-5).y - at(t - 1e-5).y) / 2e-5;
                assert.ok(speed <= lastSpeed + 1e-6, "The card never speeds up to reach its destination");
                lastSpeed = speed;
            }
            assert.ok(Math.abs(at(1).x - rest.x) < 1e-7 && Math.abs(at(1).y - rest.y) < 1e-7);
            f.Depth.detach(flight);
        }
    }
});

test("touch rendering keeps seven native silhouette sheets at exactly 3px without canvas copies", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    f.Depth.update(f.element, { pitch: 0, yaw: 0, lift: 0 });
    const state = f.Depth.states.get(f.element);
    assert.equal(state.layers.length, 7);
    assert.equal(state.world.z, 3.06);
    assert.equal(state.svg.attributes.viewBox, "-56 -84 112 168");
    assert.equal(state.face.attributes.href, f.element.image.src);
    const expected = numbers(f.Depth.path(G.silhouette(state.world, -3).map(G.screen), { x: 0, y: 0 }));
    numbers(state.layers[0].attributes.d).forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= .0011));
    assert.ok(f.created.every(tag => tag !== "canvas"));
    assert.equal(state.raster, undefined);
    assert.equal(f.Depth.useSupersampling(), false);
    assert.equal(f.frames.size, 0);
});

test("2x supersampling is desktop-only and measures twice the actual display pixel density", async () => {
    const f = fixture();
    let coarse = false, fine = true, dpr = 1, draws = 0;
    f.context.window = {
        get devicePixelRatio() { return dpr; },
        matchMedia: query => ({ matches: query.includes("any-pointer") ? coarse : fine })
    };
    const context = {
        resetTransform() {}, clearRect() {}, setTransform() {}, beginPath() {}, lineTo() {}, moveTo() {},
        closePath() {}, fill() {}, save() {}, restore() {}, transform() {}, clip() {},
        translate() {}, scale() {}, fillRect() {},
        drawImage() { draws++; },
        createLinearGradient() { return { addColorStop() {} }; }
    };
    f.context.document.createElement = () => ({ style: {}, getContext: () => context });
    f.context.Image = class { decode() { return Promise.resolve(); } };
    assert.equal(f.Depth.useSupersampling(), true);
    coarse = true;
    assert.equal(f.Depth.useSupersampling(), false, "Touch-capable devices keep native SVG");
    coarse = false;
    fine = false;
    assert.equal(f.Depth.useSupersampling(), false);
    fine = true;
    f.Depth.attach(f.element);
    await new Promise(resolve => setImmediate(resolve));
    const state = f.Depth.states.get(f.element);
    assert.equal(f.warnings.length, 0);
    assert.equal(state.faceGroup.style.display, "none");
    const raster = state.raster;
    assert.equal(raster.canvas.width, Number(raster.element.attributes.width) * 2);
    assert.equal(raster.canvas.height, Number(raster.element.attributes.height) * 2);
    assert.equal(draws, 1);
    f.Depth.update(f.element, {});
    assert.equal(draws, 1, "Unchanged cards do not redraw or start a loop");
    dpr = 2;
    f.Depth.update(f.element, {});
    assert.equal(raster.canvas.width, Number(raster.element.attributes.width) * 4);
    assert.equal(raster.canvas.height, Number(raster.element.attributes.height) * 4);
    assert.equal(draws, 2);
    f.Depth.update(f.element, { pitch: 15, yaw: -20 });
    assert.equal(draws, 3);
    assert.equal(f.Depth.supersampledArtwork.size, 1, "Decoded artwork is cached, not every pose");
    assert.equal(f.frames.size, 0);
});

test("supersampling failures retain the native face, and detached cards ignore late artwork", async () => {
    const f = fixture();
    f.context.window = { matchMedia: query => ({ matches: !query.includes("any-pointer") }) };
    f.context.Image = class { decode() { return Promise.reject(new Error("decode failed")); } };
    f.Depth.attach(f.element);
    await new Promise(resolve => setImmediate(resolve));
    const state = f.Depth.states.get(f.element);
    assert.equal(state.raster, undefined);
    assert.notEqual(state.faceGroup.style.display, "none");
    assert.match(f.warnings[0][0], /retaining native SVG/);
    f.Depth.supersampledArtwork.clear();
    let decoded;
    f.context.Image = class { decode() { return new Promise(resolve => { decoded = resolve; }); } };
    const other = f.card(100);
    f.Depth.attach(other);
    f.Depth.detach(other);
    decoded();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.Depth.states.has(other), false);
    assert.equal(f.warnings.length, 1);
});

test("unchanged poses do not redraw, while rotation updates geometry and foil transforms", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    const state = f.Depth.states.get(f.element);
    const before = state.layers[0].attributes.d, key = state.key;
    const transform = f.element.properties.get("--depth-face-transform");
    let writes = 0;
    state.face.setAttribute = () => writes++;
    f.Depth.update(f.element, {});
    assert.equal(writes, 0);
    assert.equal(state.key, key);
    f.Depth.update(f.element, { pitch: 16, yaw: -24, roll: 12 });
    assert.ok(writes > 0);
    assert.notEqual(state.layers[0].attributes.d, before);
    assert.notEqual(f.element.properties.get("--depth-face-transform"), transform);
    assert.equal(f.element.properties.has("--depth-roll"), false, "Unused per-frame style writes were removed");
});

test("a lift-only update after an exact height uses the lift again", () => {
    const f = fixture();
    f.Depth.attach(f.element);
    const state = f.Depth.states.get(f.element);
    f.Depth.update(f.element, { z: 40 });
    assert.equal(state.world.z, 40);
    f.Depth.update(f.element, { lift: 0 });
    assert.ok(Math.abs(state.world.z - 3.06) < 1e-9);
    f.Depth.update(f.element, { pitch: 5 });
    assert.ok(Math.abs(state.world.z - G.minimumHeight([], state.world)) < 1e-9, "Lift persists until changed");
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
    const floor = top.shadowEntries.get("floor"), onFirst = top.shadowEntries.get(first);
    assert.equal(floor.shape.parent, top.scene.floor, "Felt shadow is below all card faces");
    assert.equal(onFirst.shape.parent, first.receiverShadows, "Receiver face occlusion uses normal paint order");
    assert.equal(first.receiverShadows.attributes["clip-path"], `url(#${first.id}-clip)`);
    assert.equal(onFirst.shape.hasAttribute("filter"), false, "Near-contact shadows skip the blur filter");
    assert.equal(onFirst.filter, null);
    const previous = { ...top.rest };
    f.Depth.prepareTable(table);
    assert.deepEqual({ ...top.rest }, previous, "Repeated layout does not accumulate height or tilt");
});

test("shadows onto fully covered cards are skipped; visible ones are kept", () => {
    const f = fixture();
    // Five identical cards stacked exactly: each card hides its own shadow, so only the felt shadow shows.
    const stack = Array.from({ length: 5 }, () => f.card(200));
    f.Depth.prepareTable(f.table(stack));
    const top = f.Depth.states.get(stack[4]);
    const visible = [...top.shadowEntries].filter(([, entry]) => entry.shape.style.display !== "none");
    assert.deepEqual(visible.map(([key]) => key === "floor" ? "floor" : key.tableIndex), ["floor"]);
    assert.equal(top.shadowEntries.size, 1, "Hidden receivers never create shadow elements");
    // A card offset to the side leaves part of the one beneath visible, so its shadow reaches it.
    const side = [f.card(200), f.card(200), f.card(290)];
    f.Depth.prepareTable(f.table(side));
    const offset = f.Depth.states.get(side[2]);
    assert.ok(offset.shadowEntries.get(f.Depth.states.get(side[1])));
    assert.equal(offset.shadowEntries.get(f.Depth.states.get(side[0])), undefined, "Card 0 is fully covered by card 1");
});

test("large tables keep full shadows on the top cards and simplify the rest", () => {
    const f = fixture();
    // A staircase of 16 cards: every card leaves part of the one beneath it visible.
    const cards = Array.from({ length: 16 }, (_, index) => f.card(100 + index * 30));
    f.Depth.prepareTable(f.table(cards));
    const states = cards.map(card => f.Depth.states.get(card));
    const visible = state => [...state.shadowEntries].filter(([, entry]) => entry.shape.style.display !== "none");
    for (const state of states.slice(0, 8)) {
        assert.equal(f.Depth.detailed(state), false);
        assert.deepEqual(visible(state).map(([key]) => key), ["floor"], "Simplified cards cast only a felt shadow");
        const floor = state.shadowEntries.get("floor");
        assert.equal(floor.host, state.scene.pileFloor, "…into the pile's shared blurred group");
        assert.equal(floor.shape.hasAttribute("filter"), false, "…without a filter of its own");
    }
    const pileFilter = states[0].scene.pileFloor.attributes.filter;
    assert.match(pileFilter, /^url\(#card-depth-pile-\d+\)$/);
    assert.ok(Number(states[0].scene.pileBlur.attributes.stdDeviation) >= .6, "The shared blur keeps bottom shadows soft");
    const top = states[15];
    assert.equal(f.Depth.detailed(top), true);
    assert.ok(cards.slice(8).every(card => card.classes.has("is-depth-detailed")));
    assert.ok(cards.slice(0, 8).every(card => !card.classes.has("is-depth-detailed")));
    assert.equal(top.shadowEntries.get("floor").host, top.scene.floor);
    assert.ok(visible(top).some(([key]) => key === states[14]), "Top cards still shadow the cards beneath them");
    const ontoSimplified = states[8].shadowEntries.get(states[7]);
    assert.ok(ontoSimplified && ontoSimplified.shape.style.display !== "none");
    assert.equal(ontoSimplified.shape.hasAttribute("filter"), ontoSimplified.blurValue >= f.Depth.SHARP_BLUR,
        "Shadows onto simplified cards keep their normal blur");
    // Small tables are not simplified.
    const small = Array.from({ length: 6 }, (_, index) => f.card(100 + index * 30));
    f.Depth.prepareTable(f.table(small));
    assert.ok(small.every(card => f.Depth.detailed(f.Depth.states.get(card))));
});

test("on large tables, landing cards only shadow the detailed top cards, and cleared bottom cards are shadowless", () => {
    const f = fixture();
    const cards = Array.from({ length: 16 }, (_, index) => f.card(100 + index * 12));
    f.Depth.prepareTable(f.table(cards));
    const states = cards.map(card => f.Depth.states.get(card));
    const flight = new f.Node("span");
    flight.image = f.element.image;
    f.Depth.attach(flight);
    const motion = f.Depth.landingMotion(flight, cards[15], { x: 600, y: 600, z: 0, pitch: 8, yaw: -6, roll: 0 });
    const state = f.Depth.states.get(flight);
    for (let i = 0; i <= 20; i++) { f.Depth.update(flight, motion.poseAtProgress(i / 20)); }
    const shadowed = [...state.shadowEntries.keys()].filter(key => key !== "floor");
    assert.ok(shadowed.length > 0);
    assert.ok(shadowed.every(receiver => f.Depth.detailed(receiver)), "No per-frame work on simplified cards");
    assert.deepEqual({ ...motion.poseAtProgress(1) }, { ...states[15].rest }, "Nearby supports still give the exact resting pose");
    const cleared = new f.Node("span");
    cleared.image = f.element.image;
    f.Depth.attach(cleared);
    const clearedState = f.Depth.states.get(cleared);
    clearedState.shadowless = true;
    f.Depth.update(cleared, { z: 20 });
    assert.equal(clearedState.shadowEntries.get("floor").shape.style.display, "none");
});

test("revealing a hidden card re-evaluates which shadows beneath it are visible", async () => {
    const f = fixture();
    const stack = [f.card(200), f.card(200), f.card(200)];
    stack[1].style.opacity = "0";
    f.Depth.prepareTable(f.table(stack));
    const top = f.Depth.states.get(stack[2]), bottom = f.Depth.states.get(stack[0]);
    assert.ok(top.shadowEntries.get(bottom), "With the middle card hidden, the top card shadows the bottom card");
    stack[1].style.opacity = "";
    f.Depth.setHidden(stack[1], false);
    await new Promise(resolve => queueMicrotask(resolve));
    assert.equal(top.shadowEntries.get(bottom).shape.style.display, "none");
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
    const final = sample(1), contact = sample(G.CONTACT), rebound = sample(.7);
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

test("hidden destinations do not leave duplicate external shadows, and detach removes hosted shadows", async () => {
    const f = fixture();
    f.Depth.prepareTable(f.table([f.element]));
    const state = f.Depth.states.get(f.element), entry = state.shadowEntries.get("floor");
    f.Depth.setHidden(f.element, true);
    assert.equal(entry.shape.style.display, "none");
    f.Depth.setHidden(f.element, false);
    await new Promise(resolve => queueMicrotask(resolve));
    assert.equal(entry.shape.style.display, "");
    f.Depth.detach(f.element);
    assert.equal(entry.shape.removed, true);
});

test("splayed group landings slide with throw inertia and settle at their individual rotations", () => {
    const f = fixture();
    const cards = [f.card(200, 200), f.card(220, 205), f.card(240, 202), f.card(260, 208)];
    cards.forEach((card, index) => card.style.setProperty("--pile-rotation", `${index * 7 - 10}deg`));
    f.Depth.prepareTable(f.table(cards));
    cards.forEach((card, index) => {
        const flight = f.card(400, 500);
        f.Depth.attach(flight);
        const start = { x: 400 + index * 20, y: 500, z: 0, pitch: 8, yaw: -6, roll: 0 };
        const motion = f.Depth.landingMotion(flight, card, start, .6);
        const final = motion.poseAtProgress(1), contact = motion.poseAtProgress(G.CONTACT);
        const travel = { x: final.x - start.x, y: final.y - start.y };
        const slide = { x: final.x - contact.x, y: final.y - contact.y };
        assert.ok(slide.x * travel.x + slide.y * travel.y > 0, "Slide continues along the incoming throw");
        assert.ok(Math.abs(slide.x * travel.y - slide.y * travel.x) < 1e-7, "No arbitrary sideways skid");
        assert.equal(final.roll, index * 7 - 10);
        assert.deepEqual({ ...final }, { ...f.Depth.states.get(card).rest });
    });
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
    const state = f.Depth.states.get(flight), previous = state.shadowEntries.get("floor");
    const replacement = new f.Node("div");
    replacement.dataset.cardKey = "1:7";
    replacement.closest = f.element.closest;
    replacement.image = f.element.image;
    f.context.document.querySelectorAll = () => [flight];
    f.Depth.prepareTable(f.table([replacement]));
    assert.equal(previous.shape.removed, true);
    assert.equal(state.scene, f.Depth.states.get(replacement).scene);
    assert.equal(state.scene.flights.length, 1);
    assert.equal(state.scene.flights[0], state);
    assert.equal(state.shadowEntries.get("floor").shape.parent, state.scene.floor);
});

test("later cards of a play cast onto earlier flights, which stand in for their hidden table cards", () => {
    const f = fixture();
    const [first, second] = [f.card(200), f.card(230)];
    for (const [index, card] of [first, second].entries()) {
        card.dataset.cardKey = `${index + 1}:7`;
        card.closest = () => ({ dataset: { playSignature: "round:pair" } });
        card.style.opacity = "0";
    }
    f.Depth.prepareTable(f.table([first, second]));
    const flights = [first, second].map(() => {
        const flight = new f.Node("span");
        flight.image = f.element.image;
        flight.style.width = "112px";
        flight.style.height = "168px";
        f.Depth.attach(flight);
        return flight;
    });
    const motions = flights.map((flight, index) => f.Depth.landingMotion(flight, [first, second][index],
        { x: 300 + index * 20, y: 600, z: 0, pitch: 8, yaw: -6, roll: 0 }));
    const lower = f.Depth.states.get(flights[0]), upper = f.Depth.states.get(flights[1]);
    assert.equal(upper.receiverStates.length, 1);
    assert.equal(upper.receiverStates[0], lower);
    // Animate both in start order through one frame loop; the upper card sees the lower card's current pose.
    const animation = progress => ({ playState: "running", effect: { getComputedTiming: () => ({ progress }) } });
    f.Depth.follow(flights[0], animation(1), motions[0].poseAtProgress);
    f.Depth.follow(flights[1], animation(.9), motions[1].poseAtProgress);
    assert.equal([...f.Depth.followers.keys()].indexOf(flights[0]), 0);
    const onLower = upper.shadowEntries.get(lower);
    assert.ok(onLower && onLower.shape.style.display !== "none");
    assert.equal(onLower.shape.parent, lower.receiverShadows);
    assert.equal(f.frames.size, 1, "All followers share one animation frame");
});

test("flights move with the table when the page scrolls, keeping their shadows aligned", () => {
    const f = fixture();
    f.Depth.prepareTable(f.table([f.element]));
    const flight = new f.Node("span");
    flight.image = f.element.image;
    f.Depth.attach(flight);
    f.Depth.landingMotion(flight, f.element, { x: 400, y: 600, z: 0, pitch: 8, yaw: -6, roll: 0 });
    const state = f.Depth.states.get(flight);
    assert.equal(state.scene.table.classes.has("is-landing"), true, "Landing caches the pile's top layers");
    state.scene.table.top = 150;
    state.scene.table.left = 190;
    f.Depth.followScroll();
    assert.equal(flight.style.translate, "-10px -50px");
    const scene = state.scene;
    f.Depth.detach(flight);
    assert.equal(flight.style.translate, "");
    assert.equal(f.Depth.anchored.size, 0);
    assert.equal(scene.table.classes.has("is-landing"), false, "Layers are released once nothing is landing");
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
