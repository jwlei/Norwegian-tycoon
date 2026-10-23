const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../js/landing-geometry.js");

const flat = (x = 0, y = 0, z = 3.06) => ({ x, y, z, pitch: 0, yaw: 0, roll: 0 });
const nearestGap = (cards, pose) => Math.min(...G.samples(pose, -G.EDGE)
    .map(point => point.z - G.supportHeight(cards, point.x, point.y)));

test("bare felt produces a level card with a 3px edge and a tight contact shadow", () => {
    const pose = G.landing([], 200, 220, 17);
    assert.equal(pose.pitch, 0);
    assert.equal(pose.yaw, 0);
    assert.ok(Math.abs(pose.z - 3.06) < 1e-9);
    assert.ok(Math.abs(nearestGap([], pose) - .06) < 1e-9);
    const shadow = G.shadow(pose);
    assert.ok(shadow.blur < .65);
    assert.ok(shadow.opacity > .35);
});

test("a card fully on another card stays level at the actual support height", () => {
    const below = flat(200, 220);
    const pose = G.landing([below], 200, 220, 0);
    assert.ok(Math.abs(pose.pitch) < 1e-9);
    assert.ok(Math.abs(pose.yaw) < 1e-9);
    assert.ok(Math.abs(pose.z - 6.12) < 1e-9);
    assert.ok(Math.abs(nearestGap([below], pose) - .06) < 1e-9);
});

test("partial overlap creates yaw or pitch according to which edge is supported", () => {
    const below = flat(200, 220);
    const right = G.landing([below], 260, 220, 0);
    const left = G.landing([below], 140, 220, 0);
    const bottom = G.landing([below], 200, 310, 0);
    const top = G.landing([below], 200, 130, 0);
    assert.ok(right.yaw > .2, "Left edge on pile, right edge lower");
    assert.ok(left.yaw < -.2, "Right edge on pile, left edge lower");
    assert.ok(bottom.pitch < -.2, "Top edge supported");
    assert.ok(top.pitch > .2, "Bottom edge supported");
    for (const pose of [right, left, bottom, top]) {
        assert.ok(Math.abs(nearestGap([below], pose) - .06) < 1e-8);
    }
});

test("greater support heights create a greater resting slope without penetrating supports", () => {
    const low = flat(200, 220, 3.06), high = flat(200, 220, 9.18);
    const lowPose = G.landing([low], 260, 220, 0);
    const highPose = G.landing([high], 260, 220, 0);
    assert.ok(highPose.yaw > lowPose.yaw);
    assert.ok(Math.abs(highPose.yaw) < 7);
    assert.ok(nearestGap([high], highPose) > .059);
});

test("crossed piles retain a moderate lean and compact shadow without losing support contact", () => {
    const cards = [];
    for (const [x, y, roll] of [[422, 250, -18], [472, 225, 24], [445, 250, -4]]) {
        cards.push(G.landing(cards, x, y, roll));
    }
    const result = G.motion(cards, { ...flat(450, 474, 38), pitch: 10, yaw: -12, roll: -6 },
        { x: 472, y: 243, roll: -11 }, { x: 0, y: -14.9, spin: 1.1, power: .55 }, 1);
    assert.ok(Math.abs(result.pose.pitch) < 1.8);
    assert.ok(Math.abs(result.pose.yaw) < 2.8);
    assert.ok(result.pose.z < 18);
    assert.ok(G.shadow(result.pose).blur < 2.2);
    assert.ok(Math.abs(nearestGap(cards, result.pose) - .06) < 1e-8);
});

test("native rounded outline has a constant 3px thickness in local coordinates", () => {
    const pose = { ...flat(200, 220, 20), pitch: 6, yaw: -5, roll: 24 };
    const top = G.silhouette(pose), bottom = G.silhouette(pose, -G.EDGE);
    assert.equal(top.length, bottom.length);
    top.forEach((point, index) => {
        assert.ok(Math.abs(Math.hypot(point.x - bottom[index].x, point.y - bottom[index].y,
            point.z - bottom[index].z) - 3) < 1e-9);
    });
});

test("production card dimensions and square pixel outlines use the same support solver", () => {
    const card = { ...flat(200, 220), width: 80, height: 120, radius: 0 };
    assert.ok(G.contains(card, 239.24, 279.24));
    assert.ok(!G.contains(card, 239.26, 279.24));
    const pose = G.landing([card], 200, 220, 0, { width: 80, height: 120, radius: 0 });
    assert.ok(Math.abs(pose.z - 6.12) < 1e-9);
    assert.equal(pose.pitch, 0);
    assert.equal(pose.yaw, 0);
    card.pitch = 5;
    card.z = 12;
    const surface = G.plane(card);
    assert.ok(Math.abs(surface.normal.y + Math.sin(5 * Math.PI / 180)) < 1e-9);
    assert.equal(surface.point.z, 12);
});

test("the same light projects onto tilted card planes, with sharper shadows on nearer receivers", () => {
    const receiver = { ...flat(200, 220, 12), pitch: 3, yaw: -2, roll: 8 };
    const caster = { ...receiver, z: 20 };
    const floor = G.shadow(caster);
    const support = G.shadow(caster, receiver);
    assert.ok(support.blur < floor.blur);
    assert.ok(support.opacity > floor.opacity);
    assert.equal(support.points.length, G.silhouette(caster).length);
    const surface = G.plane(receiver), n = surface.normal;
    const denominator = n.x * G.LIGHT.x + n.y * G.LIGHT.y + n.z;
    G.silhouette(caster, -G.EDGE).forEach((point, index) => {
        const t = G.signedDistance(point, surface) / denominator;
        const projected = { x: point.x - G.LIGHT.x * t, y: point.y - G.LIGHT.y * t, z: point.z - t };
        assert.ok(Math.abs(G.signedDistance(projected, surface)) < 1e-9);
        assert.deepEqual(support.points[index], G.screen(projected));
    });
});

test("airborne shadows soften and move down-right; contact keeps the same projection model", () => {
    const contact = flat(200, 220);
    const airborne = { ...contact, z: 70 };
    const near = G.shadow(contact), far = G.shadow(airborne);
    assert.ok(far.blur > near.blur + 6);
    assert.ok(far.opacity < near.opacity);
    const center = points => points.reduce((sum, point) =>
        ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    assert.ok(center(far.points).x > center(near.points).x);
    assert.ok(center(far.points).y > center(near.points).y);
});

test("flight joins first contact continuously, then slides, bounces, rocks and settles", () => {
    const cards = [flat(200, 220), flat(200, 220, 6.12)];
    const start = { ...flat(260, 470, 60), pitch: -16, yaw: 13, roll: -8 };
    const impact = { x: 260, y: 220, roll: 6 };
    const momentum = { x: 12, y: -8, spin: 3, power: .7 };
    const before = G.motion(cards, start, impact, momentum, G.CONTACT - 1e-7);
    const contact = G.motion(cards, start, impact, momentum, G.CONTACT);
    for (const key of ["x", "y", "z", "pitch", "yaw", "roll"]) {
        assert.ok(Math.abs(before.pose[key] - contact.pose[key]) < .0001, `${key} continuous at impact`);
    }
    const after = G.motion(cards, start, impact, momentum, G.CONTACT + 1e-7);
    for (const key of ["x", "y", "roll"]) {
        const incoming = (contact.pose[key] - before.pose[key]) / 1e-7;
        const outgoing = (after.pose[key] - contact.pose[key]) / 1e-7;
        assert.ok(Math.abs(incoming - outgoing) < .001, `${key} retains momentum at impact`);
    }
    let maxBounce = 0, rock = 0;
    for (let step = 0; step <= 100; step++) {
        const motion = G.motion(cards, start, impact, momentum, step / 100);
        assert.ok(nearestGap(cards, motion.pose) >= .059, "Card stays above all sampled support points");
        maxBounce = Math.max(maxBounce, motion.bounce);
        if (step > G.CONTACT * 100) {
            const rest = G.landing(cards, motion.pose.x, motion.pose.y, motion.pose.roll);
            rock = Math.max(rock, Math.abs(motion.pose.pitch - rest.pitch));
        }
    }
    assert.ok(maxBounce > 1);
    assert.ok(rock > .1);
    const settled = G.motion(cards, start, impact, momentum, 1);
    assert.equal(settled.phase, "settled");
    assert.equal(settled.bounce, 0);
    assert.equal(settled.pose.x, 272);
    assert.equal(settled.pose.y, 212);
    const expected = G.landing(cards, 272, 212, 9);
    assert.deepEqual(settled.pose, expected);
    assert.ok(Math.abs(nearestGap(cards, settled.pose) - .06) < 1e-8);
});

test("horizontal edge throws rebound and rotate inward symmetrically before settling", () => {
    const cards = [];
    const start = { ...flat(300, 700, 40), pitch: 8, yaw: -6, roll: 4 };
    const impact = { x: 300, y: 300, roll: 2 };
    const momentum = { x: 0, y: -12, spin: .5, power: .7 };
    const at = (direction, progress) => G.motion(cards, start, impact, momentum, progress, null, direction).pose;
    for (const direction of [-1, 1]) {
        const contact = at(direction, G.CONTACT);
        const rebound = at(direction, G.CONTACT + .12);
        const settled = at(direction, 1);
        assert.ok((rebound.x - contact.x) * direction < 0, "The rebound moves away from its edge");
        assert.ok((rebound.roll - contact.roll) * direction < 0, "The card rotates inward");
        assert.equal(settled.x, impact.x + momentum.x);
        assert.equal(settled.roll, impact.roll + momentum.spin);
    }
});

test("cards do not cast a shadow upward onto a higher receiver", () => {
    assert.equal(G.shadow(flat(), flat(0, 0, 25)).points.length, 0);
});

test("shadow visibility counts the blur halo but ignores areas hidden under cards and their edges", () => {
    const resting = flat(200, 220);
    assert.ok(G.shadowVisible(resting, null, [resting]), "A resting card's soft contact halo still shows on the felt");
    const above = flat(200, 220, 6.12);
    assert.equal(G.shadowVisible(above, resting, [above]), false, "A card exactly on another hides its own shadow");
    const lifted = { ...above, z: 40 };
    assert.ok(G.shadowVisible(lifted, resting, [lifted]), "Raised cards cast a visible shadow beside themselves");
    const cover = { ...flat(200, 220, 9.18), width: 200, height: 260 };
    assert.equal(G.shadowVisible(above, resting, [above, cover]), false, "A larger card on top hides everything beneath");
    const faceBottom = 220 - .28 * 6.12 + (84 - .75 * 168 / 120);
    assert.equal(G.screenContains(above, 200, faceBottom + .6), false);
    assert.ok(G.screenCovers(above, 200, faceBottom + .6), "The 3px edge below the face counts as cover");
});

test("a thrown card decelerates smoothly into its slide instead of braking in the air", () => {
    const start = { ...flat(300, 700, 40), pitch: 10, yaw: -12, roll: 0 };
    const rest = { x: 300, y: 300, roll: 8 };
    const distance = 400, slide = G.slideDistanceToRest(distance, .55);
    const momentum = { x: 0, y: -slide, spin: .64, power: .55 };
    const impact = { x: rest.x, y: rest.y + slide, roll: rest.roll - momentum.spin };
    assert.ok(Math.abs(slide - distance * .13) < 3, "Default throws slide about 13% of the travel");
    const at = t => G.position(start, impact, momentum, t);
    const speed = t => {
        const a = at(t - 1e-5), b = at(t + 1e-5);
        return Math.hypot(b.x - a.x, b.y - a.y) / 2e-5;
    };
    const samples = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
    const speeds = samples.map(speed);
    speeds.slice(1).forEach((value, index) =>
        assert.ok(value <= speeds[index] + 1e-6, `Speed never increases (${samples[index + 1]})`));
    // Constant deceleration: the speed change per step is the same in the air and while sliding.
    const deceleration = samples.slice(1).map((t, index) => speeds[index] - speeds[index + 1]);
    const range = Math.max(...deceleration) / Math.min(...deceleration);
    assert.ok(range < 1.15, `Deceleration varies by ${range.toFixed(3)}x`);
    assert.ok(speed(G.CONTACT) / speed(.01) > .3, "The card still carries real speed when it touches down");
    assert.ok(Math.abs(at(1).y - rest.y) < 1e-9);
    assert.ok(Math.abs(at(1).roll - rest.roll) < 1e-9);
    assert.equal(G.slideDistanceToRest(4000, 1, 190), 190 * .45, "Long throws cap the slide");
});

test("sandbox loads only native card assets, never the production WebGL renderer", () => {
    const html = fs.readFileSync(path.join(__dirname, "landing-sandbox.html"), "utf8");
    const js = fs.readFileSync(path.join(__dirname, "landing-sandbox.js"), "utf8");
    assert.doesNotMatch(html, /card-depth|depth-renderer|firebase|src=".*game\.js/);
    assert.doesNotMatch(js, /getContext|createElement\("canvas"\)|setInterval/);
    assert.match(html, /landing-geometry\.js/);
    assert.match(js, /if \(currentProgress < 1 && !paused\)/);
});
