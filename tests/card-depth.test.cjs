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
            return { left: (this.left || 200) + (parseFloat(this.properties.get("--wall-offset-x")) || 0),
                top: (this.top || 200) + (parseFloat(this.properties.get("--wall-offset-y")) || 0),
                width: this.offsetWidth, height: this.offsetHeight };
        }
        animate() { return { playState: "running", effect: { getComputedTiming: () => ({ progress: .5 }) } }; }
    }
    const context = vm.createContext({
        LandingGeometry: G, console: { warn: (...args) => warnings.push(args) }, queueMicrotask,
        DOMParser: class { parseFromString() { return { querySelector: () => ({ getAttribute: () => "8" }) }; } },
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

test("native SVG keeps seven silhouette sheets at exactly 3px, with no canvas or WebGL", () => {
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
    assert.doesNotMatch(source, /getContext|devicePixelRatio|drawImage|WebGL|supersampl/);
    assert.equal(f.frames.size, 0);
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

test("unobstructed landings keep flight and rendered rotation on one continuously slowing trajectory", () => {
    for (const direction of [-1, 1]) {
        for (const rotation of [-35, 0, 35]) {
            const f = fixture();
            const card = f.card(400 + direction * 200, 200);
            card.style.setProperty("--pile-rotation", `${rotation}deg`);
            f.Depth.prepareTable(f.table([card]));
            const flight = f.card(400, 600);
            f.Depth.attach(flight);
            const start = { x: 456, y: 684, z: 0, pitch: 8, yaw: -6, roll: 0 };
            const motion = f.Depth.landingMotion(flight, card, start, .7);
            const final = f.Depth.states.get(card).rest;
            for (let step = 0; step <= 100; step++) {
                const t = step / 100;
                const pose = motion.poseAtProgress(t), position = motion.positionAtProgress(t);
                assert.ok(Math.abs(pose.roll - rotation * (2 * t - t * t)) < 1e-9,
                    "Angular speed decreases at the same rate before and after contact");
                for (const key of ["x", "y", "roll"]) {
                    assert.ok(Math.abs(position[key] - pose[key]) < 1e-8, `${key} matches the rendered pose`);
                }
                const dx = pose.x - start.x, dy = pose.y - start.y;
                assert.ok(Math.abs(dx * (final.y - start.y) - dy * (final.x - start.x)) < 1e-7,
                    "No arbitrary sideways rebound is added");
            }
            assert.deepEqual({ ...motion.poseAtProgress(1) }, { ...final });
        }
    }
});

test("edge throws settle without wall impulses and retain their pose across refreshes and fresh renderers", () => {
    const bounds = { left: 100, top: 100, width: 600, height: 400 };
    for (const [x, y, launch] of [[-1, 0], [1, 0], [0, -1], [1, -1],
        [1, 0, { x: 0, y: .5, vx: 1.2, vy: -.2 }]]) {
        const setup = () => {
            const f = fixture();
            const card = f.card(350, 250);
            card.dataset.throwMotion = JSON.stringify({ x, y, power: .7, spin: 15, ...(launch ? { launch } : {}) });
            card.style.setProperty("--pile-rotation", "15deg");
            const table = f.table([card], bounds);
            f.Depth.prepareTable(table);
            return { ...f, card, table };
        };
        const f = setup(), destination = f.Depth.states.get(f.card), final = { ...destination.rest };
        assert.equal(destination.wallTrajectory, undefined, "Wall physics is not used in production");
        const flight = new f.Node("span");
        flight.image = f.element.image;
        f.Depth.attach(flight);
        const start = { x: 400, y: 620, z: 0, pitch: 12, yaw: -10, roll: 0 };
        const motion = f.Depth.landingMotion(flight, f.card, start, .7);
        assert.equal(motion.frameCount, 81);
        assert.equal(motion.durationScale, 1.6, "The lower-friction slide takes longer");
        let previousSpeed = Infinity;
        for (let step = 0; step <= 100; step++) {
            const pose = motion.poseAtProgress(step / 100), position = motion.positionAtProgress(step / 100);
            for (const key of ["x", "y", "roll"]) {
                assert.ok(Math.abs(position[key] - pose[key]) < 1e-8, "Flight and shadows share the smooth path");
            }
            if (step > 0 && step < 100) {
                const before = motion.positionAtProgress(step / 100 - .00001);
                const after = motion.positionAtProgress(step / 100 + .00001);
                const speed = Math.hypot(after.x - before.x, after.y - before.y);
                assert.ok(speed <= previousSpeed + 1e-7, "No wall rebound or settlement speed-up");
                previousSpeed = speed;
            }
        }
        assert.deepEqual({ ...motion.poseAtProgress(1) }, final);
        for (const key of ["x", "y", "roll"]) {
            assert.ok(Math.abs(motion.poseAtProgress(1 - 1e-5)[key] - final[key]) < .01, "No final pose snap");
        }
        f.Depth.prepareTable(f.table);
        assert.deepEqual({ ...f.Depth.states.get(f.card).rest }, final, "Refresh does not accumulate offsets");
        f.table.left = 201;
        f.Depth.prepareTable(f.table);
        assert.deepEqual({ ...f.Depth.states.get(f.card).rest }, final, "Replanning retains the same endpoint");
        const fresh = setup();
        assert.deepEqual({ ...fresh.Depth.states.get(fresh.card).rest }, final, "Fresh clients reconstruct the settlement");
    }
});

test("multi-card throws let upper cards slide onward without wall torque or a final reshuffle", () => {
    for (const direction of [-1, 1]) {
        for (const count of [2, 3, 4]) {
            const f = fixture(), bounds = { left: 150, top: 100, width: 342, height: 320 };
            const parent = new f.Node("div");
            const cards = Array.from({ length: count }, (_, index) => {
                const card = f.card(240 + index * 30, 200);
                card.parentElement = parent;
                card.style.setProperty("--pile-rotation", String(index * 2 - 9));
                card.dataset.throwMotion = JSON.stringify({ x: direction, y: 0, power: .7, spin: 12,
                    launch: { x: 0, y: .4, vx: direction * 2, vy: -.6 } });
                return card;
            });
            f.Depth.prepareTable(f.table(cards, bounds));
            const states = cards.map(card => f.Depth.states.get(card));
            for (const state of states) {
                assert.equal(state.wallTrajectory, undefined, "No impact-driven spin");
                assert.equal(state.rest.roll, states[0].rest.roll, "The fan keeps its readable orientation");
            }
            const motions = cards.map((card, index) => {
                const flight = f.card(300, 400);
                f.Depth.attach(flight, false);
                return f.Depth.landingMotion(flight, card,
                    { x: 320 + index * 20, y: 500, roll: index * 2 }, .7);
            });
            motions.forEach((motion, index) => {
                let previousDistance = Infinity;
                for (let frame = 0; frame <= 240; frame++) {
                    const pose = motion.positionAtProgress(frame / 240), rest = states[index].rest;
                    const distance = Math.hypot(pose.x - rest.x, pose.y - rest.y);
                    assert.ok(distance <= previousDistance + 1e-7, "Each card approaches rest without a rebound");
                    previousDistance = distance;
                }
                const near = motion.poseAtProgress(1 - 1e-6), end = motion.poseAtProgress(1);
                for (const key of ["x", "y", "z", "roll", "pitch", "yaw"]) {
                    assert.ok(Math.abs(near[key] - end[key]) < .02, `No ${key} endpoint snap`);
                }
            });
            const bottom = states[0].rest, top = states.at(-1).rest;
            const dx = top.x - bottom.x, dy = top.y - bottom.y;
            const contactBottom = motions[0].positionAtProgress(G.CONTACT);
            const contactTop = motions.at(-1).positionAtProgress(G.CONTACT);
            assert.ok(dx * (top.x - contactTop.x - bottom.x + contactBottom.x) +
                dy * (top.y - contactTop.y - bottom.y + contactBottom.y) > 0,
            "Upper cards slide onward to expose lower cards rather than pulling lower cards backward");
            assert.equal(motions[0].durationScale, 1.6, "Reduced friction extends time instead of speeding up the throw");
        }
    }
});

test("board-backed plays stay exposed, connected and stable through flights, refreshes and resizing", () => {
    for (const initial of [
        { left: 150, top: 100, width: 342, height: 320 },
        { left: 150, top: 100, width: 300, height: 180 },
        { left: 150, top: 100, width: 800, height: 600 }
    ]) {
        const f = fixture(), bounds = { ...initial }, elements = [], groups = [];
        for (let play = 0; play < 8; play++) {
            const parent = new f.Node("div");
            const group = Array.from({ length: play % 4 + 1 }, (_, index) => {
                const card = f.card(bounds.left + (play * 137 + index * 30) % bounds.width,
                    bounds.top + (play * 157 + index * 25) % bounds.height);
                card.parentElement = parent;
                if (bounds.height < 200) { card.offsetWidth = 64; card.offsetHeight = 96; }
                card.style.setProperty("--pile-rotation", String(play * 47 + index * 97 - 180));
                if (play % 2) {
                    card.dataset.throwMotion = JSON.stringify({ x: -1, y: -1, power: 1, spin: -20,
                        launch: { x: 0, y: .5, vx: -3, vy: -3 } });
                }
                return card;
            });
            groups.push(group);
            elements.push(...group);
        }
        const table = f.table(elements, bounds);
        const check = () => {
            f.Depth.prepareTable(table);
            let previous = null;
            for (const group of groups) {
                const poses = group.map(card => f.Depth.states.get(card).rest);
                if (previous) {
                    assert.ok(G.overlapCoverage(poses.at(-1), previous) >= .1,
                        `Rendered top card covers at least 10% of the previous play (${G.overlapCoverage(poses.at(-1), previous)})`);
                }
                poses.forEach((pose, index) => {
                    assert.ok(G.silhouette(pose).map(G.screen).every(point =>
                        point.x >= bounds.left && point.x <= bounds.left + bounds.width &&
                        point.y >= bounds.top && point.y <= bounds.top + bounds.height),
                    "Depth and tilt do not clip the landed face outside the board");
                    let exposed = 0;
                    for (let x = 0; x < 10; x++) {
                        for (let y = 0; y < 16; y++) {
                            const point = G.screen(G.world((x / 10 - .45) * pose.width,
                                (y / 16 - .46875) * pose.height, 0, pose));
                            if (!poses.slice(index + 1).some(above => G.screenCovers(above, point.x, point.y))) { exposed++; }
                        }
                    }
                    assert.ok(exposed >= 32, `Rendered fan keeps at least 20% of card ${index + 1} exposed (${exposed}/160)`);
                    const flight = f.card(bounds.left, bounds.top + bounds.height);
                    f.Depth.attach(flight, false);
                    const motion = f.Depth.landingMotion(flight, group[index],
                        { x: bounds.left, y: bounds.top + bounds.height, roll: 0 }, 1);
                    const end = motion.poseAtProgress(1), near = motion.poseAtProgress(1 - 1e-6);
                    for (const key of ["x", "y", "z", "roll", "pitch", "yaw"]) {
                        assert.ok(Math.abs(end[key] - pose[key]) < 1e-6, `Flight endpoint matches resting ${key}`);
                        assert.ok(Math.abs(near[key] - end[key]) < .02, `No final ${key} snap`);
                    }
                    const path = f.Depth.states.get(group[index]).wallTrajectory;
                    if (path && path.distanceAtProgress(.9) === 1 &&
                        path.positionAtProgress(.9).roll === path.final.roll) {
                        assert.deepEqual(motion.positionAtProgress(.9), motion.positionAtProgress(1),
                            "Even a play steered for 10% overlap never restarts once the physical throw has stopped");
                    }
                    f.Depth.detach(flight);
                });
                previous = poses.at(-1);
            }
            return JSON.stringify(elements.map(card => f.Depth.states.get(card).rest));
        };
        const first = check();
        assert.equal(check(), first, "An unchanged refresh keeps the exact visible arrangement");
        const fresh = fixture(), parents = new Map();
        const recreated = elements.map(card => {
            const clone = fresh.card(card.left, card.top);
            if (!parents.has(card.parentElement)) { parents.set(card.parentElement, new fresh.Node("div")); }
            clone.parentElement = parents.get(card.parentElement);
            clone.offsetWidth = card.offsetWidth;
            clone.offsetHeight = card.offsetHeight;
            clone.style.setProperty("--pile-rotation", card.style.getPropertyValue("--pile-rotation"));
            Object.assign(clone.dataset, card.dataset);
            return clone;
        });
        fresh.Depth.prepareTable(fresh.table(recreated, bounds));
        assert.equal(JSON.stringify(recreated.map(card => fresh.Depth.states.get(card).rest)), first,
            "Reconstructing the renderer preserves the same connected fans");
        bounds.width += 70;
        bounds.height += 60;
        check();
    }
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
