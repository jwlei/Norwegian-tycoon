#!/usr/bin/env node
// Pure-JavaScript micro-benchmarks of the card geometry, run in Node with no browser.
//   node perf/micro.cjs [--out perf/results/micro.json] [--root <checkout>]
// They isolate the per-frame maths from the browser, so a change in JS cost is not hidden by paint or GPU noise.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
}
const root = argument("root", path.join(__dirname, ".."));
const G = require(path.join(path.resolve(root), "js", "landing-geometry.js"));

const CARD = { width: 112, height: 168, radius: 9.5 };
// Deterministic pseudo-random table, so runs are comparable.
function table(count, seed = 7) {
    let state = seed;
    const random = () => (state = Math.imul(state ^ state >>> 15, 2654435761) >>> 0) / 4294967296;
    const supports = [];
    for (let index = 0; index < count; index++) {
        supports.push(G.landing(supports, 400 + (random() - .5) * 160, 300 + (random() - .5) * 120, (random() - .5) * 50, CARD));
    }
    return supports;
}

function bench(name, body, minimumMs = 400) {
    // Warm up so the optimizing compiler has settled, then time batches until the budget is spent.
    for (let index = 0; index < 50; index++) { body(index); }
    const samples = [];
    let spent = 0, iteration = 0;
    while (spent < minimumMs || samples.length < 30) {
        const start = process.hrtime.bigint();
        body(iteration++);
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        samples.push(elapsed);
        spent += elapsed;
    }
    samples.sort((a, b) => a - b);
    return { name, medianMs: samples[samples.length >> 1], p95Ms: samples[Math.floor(samples.length * .95)], iterations: samples.length };
}

const path2d = (points, origin) => points.map((point, index) =>
    `${index ? "L" : "M"}${(point.x - origin.x).toFixed(3)},${(point.y - origin.y).toFixed(3)}`).join("") + "Z";

// Mirrors CardDepth.renderCard today: seven sheets, each projected and serialized independently.
function sevenSheetsToday(world) {
    const top = G.silhouette(world), normal = G.rotate(0, 0, 1, world), out = [];
    for (let index = 0; index < 7; index++) {
        const depth = G.EDGE * (1 - index / 6);
        out.push(path2d(top.map(point => G.screen({ x: point.x - normal.x * depth,
            y: point.y - normal.y * depth, z: point.z - normal.z * depth })), world));
    }
    return out;
}

// Every sheet is the same outline shifted by a constant in screen space, so one path and six offsets are enough.
function sevenSheetsShared(world) {
    const top = G.silhouette(world), normal = G.rotate(0, 0, 1, world);
    const step = G.screen(normal);
    const outline = path2d(top.map(G.screen), world), out = [];
    for (let index = 0; index < 7; index++) {
        const depth = G.EDGE * (1 - index / 6);
        out.push(`translate(${(-step.x * depth).toFixed(3)} ${(-step.y * depth).toFixed(3)})`);
    }
    return { outline, out };
}

const results = [];
for (const count of [0, 8, 12, 30]) {
    const supports = table(count);
    const reach = supports.filter(pose => Math.hypot(pose.x - 400, pose.y - 300) < 260);
    const start = { x: 380, y: 760, z: 0, pitch: 9, yaw: -6, roll: 3, ...CARD };
    start.z = G.minimumHeight(reach, start) + 18;
    const impact = { x: 402, y: 330, roll: 8 };
    const momentum = { x: 3, y: -24, spin: .5, power: .7 };
    const contact = G.landing(reach, impact.x, impact.y, impact.roll, CARD);
    const label = suffix => `${suffix} [${count} cards on table]`;

    // One pose per displayed frame while a card flies: airborne frames solve clearance, sliding frames also refit the plane.
    results.push(bench(label("motion(), airborne frame"), index => G.motion(reach, start, impact, momentum, .1 + (index % 50) / 100, contact)));
    results.push(bench(label("motion(), sliding frame"), index => G.motion(reach, start, impact, momentum, .65 + (index % 34) / 100, contact)));
    // Run once for every card thrown: 81 orientation samples for the foil keyframes.
    results.push(bench(label("81 foil keyframe orientations"), () => {
        for (let frame = 0; frame <= 80; frame++) { G.motionOrientation(reach, start, impact, momentum, frame / 80, contact); }
    }));
    if (count) {
        const flying = G.motion(reach, start, impact, momentum, .5, contact).pose;
        const top = supports[supports.length - 1];
        results.push(bench(label("shadowVisible(flight -> felt)"), () => G.shadowVisible({ ...flying }, null, supports)));
        results.push(bench(label("shadowVisible(flight -> top card)"), () => G.shadowVisible({ ...flying }, top, supports.slice(-1))));
        results.push(bench(label("exposedPoints(bottom card)"), () => G.exposedPoints({ ...supports[0] }, supports.slice(1))));
        // prepareTable re-solves every resting pose whenever a play is appended.
        results.push(bench(label("re-solve all resting poses"), () => {
            const solved = [];
            supports.forEach(pose => solved.push(G.landing(solved, pose.x, pose.y, pose.roll, CARD)));
        }, 300));
    }
}

const world = { x: 0, y: 0, z: 40, pitch: 9, yaw: -6, roll: 12, ...CARD };
let drift = 0;
results.push(bench("seven paper sheets, today (per card, per frame)", () => { drift += .001; sevenSheetsToday({ ...world, roll: 12 + drift }); }));
results.push(bench("seven paper sheets, shared outline", () => { drift += .001; sevenSheetsShared({ ...world, roll: 12 + drift }); }));

const width = Math.max(...results.map(result => result.name.length));
for (const result of results) {
    console.log(`${result.name.padEnd(width)}  ${result.medianMs.toFixed(3).padStart(9)} ms   p95 ${result.p95Ms.toFixed(3).padStart(9)} ms`);
}
const out = argument("out", null);
if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, results }, null, 1));
}
