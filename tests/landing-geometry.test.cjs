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

test("rotation carries constant deceleration through touchdown without reversing or wobbling", () => {
    const cards = [];
    for (const rotation of [-40, 0, 40]) {
        const start = { ...flat(300, 700, 40), pitch: 8, yaw: -6, roll: 4 };
        const momentum = { x: 0, y: -12, spin: rotation * (1 - G.CONTACT) ** 2, power: .7 };
        const impact = { x: 300, y: 300, roll: start.roll + rotation - momentum.spin };
        for (let step = 0; step <= 100; step++) {
            const t = step / 100;
            const pose = G.motion(cards, start, impact, momentum, t).pose;
            assert.ok(Math.abs(pose.roll - (start.roll + rotation * (2 * t - t * t))) < 1e-9);
            assert.equal(pose.x, 300, "Landing adds no sideways oscillation");
        }
    }
});

test("wall impulses transfer off-center momentum into spin without adding energy", () => {
    const pose = { ...flat(), width: 80, height: 120 };
    const normal = { x: -1, y: 0 };
    const velocity = { x: 200, y: -60, spin: 0 };
    const centered = G.wallImpulse(pose, velocity, normal, { x: 40, y: 0 });
    assert.equal(centered.x, -70);
    assert.equal(centered.y, velocity.y);
    assert.equal(centered.spin, 0, "A central impact has no torque");
    const energy = v => v.x ** 2 + v.y ** 2 + (80 ** 2 + 120 ** 2) / 12 * (v.spin * Math.PI / 180) ** 2;
    for (const y of [-50, 50]) {
        const result = G.wallImpulse(pose, velocity, normal, { x: 40, y });
        assert.ok(result.spin * y > 0, "Torque follows the contact lever arm");
        assert.ok(energy(result) < energy(velocity));
        const faster = G.wallImpulse(pose, { ...velocity, x: 400 }, normal, { x: 40, y });
        assert.ok(Math.abs(faster.spin) > Math.abs(result.spin), "More incoming momentum creates more spin");
    }
    const departing = { x: -100, y: 0, spin: 0 };
    assert.deepEqual(G.wallImpulse(pose, departing, normal, { x: 40, y: 0 }), departing);
});

test("wall trajectories couple collision spin to momentum and admit incoming cards through the bottom", () => {
    const bounds = { left: 0, top: 0, width: 600, height: 400 };
    const plan = (x, y, roll = 15) => G.wallTrajectory(
        { ...flat(300 + x * 110, 200 + y * 90), roll, width: 80, height: 120, radius: 8.75 },
        bounds, { x, y, power: .7, spin: roll });
    const right = plan(1, 0), left = plan(-1, 0, -15), top = plan(0, -1);
    assert.equal(plan(0, 1), null, "An incoming legacy throw is not blocked by the player-facing edge");
    assert.equal(plan(0, 0), null, "Interior throws retain the existing trajectory");
    assert.equal(right.collisions[0].normal.x, -1);
    assert.equal(left.collisions[0].normal.x, 1);
    assert.equal(top.collisions[0].normal.y, 1);
    assert.ok(Math.abs(right.final.x + left.final.x - bounds.width) < 1e-8);
    assert.ok(Math.abs(right.final.roll + left.final.roll) < 1e-8, "Mirrored contact creates mirrored spin");
    assert.ok(Math.abs(top.final.roll - 15) > 10, "Top-wall torque persists in the resting rotation");
    for (const path of [left, right, top, plan(1, -1)]) {
        for (let step = 0; step <= 240; step++) {
            const position = path.positionAtProgress(step / 240);
            const pose = { ...flat(), ...position, width: 80, height: 120, radius: 8.75 };
            assert.ok(G.silhouette(pose).every(point =>
                point.x >= -1e-7 && point.x <= bounds.width + 1e-7 && point.y >= -1e-7),
            "The full rounded card outline stays inside each closed wall");
        }
        const final = path.positionAtProgress(1), before = path.positionAtProgress(1 - 1e-5);
        assert.deepEqual(final, path.final);
        assert.ok(Math.hypot(final.x - before.x, final.y - before.y) < .001, "Translation comes to rest");
        assert.ok(Math.abs(final.roll - before.roll) < .001, "Rotation comes to rest without snapping back");
    }
    assert.deepEqual(plan(1, 0).final, right.final, "Planning is deterministic");
});

test("shared release momentum determines whether and how a wall is struck", () => {
    const bounds = { left: 0, top: 0, width: 600, height: 400 };
    const rest = { ...flat(400, 200), roll: 15, width: 80, height: 120 };
    const motion = { x: 1, y: 0, power: .7, spin: 10,
        launch: { x: 0, y: .5, vx: 1.2, vy: -.2 } };
    const path = G.wallTrajectory(rest, bounds, motion);
    assert.ok(path.collisions.length > 0);
    assert.equal(path.start.x, 300);
    assert.equal(path.start.y, 300);
    assert.equal(path.start.roll, 0);
    assert.equal(path.collisions[0].normal.x, -1);
    assert.equal(G.wallTrajectory(rest, bounds,
        { ...motion, launch: { ...motion.launch, vx: -.2 } }), null,
    "Choosing the right edge does not invent a collision when the release travels away from it");
    const top = G.wallTrajectory(rest, bounds,
        { ...motion, x: 0, y: -1, spin: 0, launch: { x: 0, y: .5, vx: 0, vy: -2 } });
    assert.ok(top.collisions.length > 0);
    assert.equal(top.final.roll, 0, "A centered top-edge collision does not invent torque");
    const bottom = G.wallTrajectory(rest, bounds,
        { ...motion, x: 0, y: 1, launch: { x: 0, y: .5, vx: 0, vy: 2 } });
    assert.ok(bottom.collisions.some(hit => hit.normal.y == -1),
        "A card already inside bounces inward from the bottom");
    const nonsaturated = G.wallTrajectory(rest, bounds, { ...motion, x: .9 });
    assert.ok(nonsaturated.collisions.length > 0, "A real outline collision is not gated on clamped metadata");
});

test("after entry, hard rebounds stay inside every edge including the player-facing bottom", () => {
    const bounds = { left: 0, top: 0, width: 350, height: 320 };
    let enteredPaths = 0, bottomHits = 0;
    for (let index = 0; index < 48; index++) {
        const dimensions = { width: 100, height: 150, radius: index % 2 ? 0 : 8.75 };
        const path = G.wallTrajectory({ ...flat(200, 200), ...dimensions, roll: 15 }, bounds, {
            x: index % 2 ? -1 : 1, y: -1, power: 1, spin: index % 2 ? -20 : 20,
            launch: { x: (index % 5 - 2) / 3, y: index % 3 ? .5 : 1.8,
                vx: (index % 9 - 4) * 1.5, vy: -2 - index % 6 }
        });
        if (!path) { continue; }
        let entered = false;
        for (let step = 0; step <= 960; step++) {
            const pose = { ...flat(), ...dimensions, ...path.positionAtProgress(step / 960) };
            const points = G.silhouette(pose);
            if (points.every(point => point.y <= bounds.height + 1e-7)) { entered = true; }
            if (entered) {
                assert.ok(points.every(point => point.x >= -1e-7 && point.x <= bounds.width + 1e-7 &&
                    point.y >= -1e-7 && point.y <= bounds.height + 1e-7),
                `Throw ${index} stays contained after entry at frame ${step}`);
            }
        }
        if (entered) { enteredPaths++; }
        bottomHits += path.collisions.filter(hit => hit.normal.y == -1).length;
        for (const hit of path.collisions.filter(hit => hit.normal.y == -1)) {
            const incoming = { ...hit.incoming, spin: 0 };
            const outgoing = G.wallImpulse(hit.pose, incoming, hit.normal,
                { x: hit.pose.x, y: bounds.height });
            assert.ok(outgoing.y < 0, "A central bottom impact moves back toward the middle");
        }
    }
    assert.ok(enteredPaths > 40, "Exercise both off-table entries and releases already inside");
    assert.ok(bottomHits > 5, "Exercise actual bottom-wall rebounds");
});

test("lower wall friction lengthens travel time without boosting release speed or restarting stopped motion", () => {
    const bounds = { left: 0, top: 0, width: 600, height: 600 };
    const motion = { x: -1, y: 0, power: .7, spin: 0,
        launch: { x: 0, y: 0, vx: -2, vy: -.2 } };
    const path = G.wallTrajectory({ ...flat(300, 300), width: 180, height: 150 }, bounds, motion);
    assert.equal(path.durationScale, 1.6);
    const start = path.positionAtProgress(0), next = path.positionAtProgress(1 / 240);
    const speed = Math.hypot(next.x - start.x, next.y - start.y) / (1.6 / 240);
    const releaseSpeed = Math.hypot(motion.launch.vx * bounds.width, motion.launch.vy * bounds.height);
    assert.ok(speed <= releaseSpeed && speed >= releaseSpeed * .99,
        "Real-time release speed stays equal to the input, apart from friction");
    let previous = 0;
    for (let step = 0; step <= 960; step++) {
        const distance = path.distanceAtProgress(step / 960);
        assert.ok(distance >= previous && distance <= 1);
        previous = distance;
    }
    assert.equal(previous, 1);
    assert.equal(path.distanceAtProgress(.99), 1, "Travel-based corrections finish when friction stops motion");
});

test("overlap checks use the visible rounded or square face, including projected pile height", () => {
    for (const radius of [0, 8.75]) {
        const card = { ...flat(100, 200), width: 100, height: 150, radius };
        assert.equal(G.overlaps(card, { ...card, x: 210 }), false);
        assert.equal(G.overlaps(card, { ...card, x: 190 }, 5), true);
        assert.equal(G.overlaps(card, { ...card, x: 190 }, 12), false);
        assert.equal(G.overlaps(card, { ...card, y: 370 }), false);
        assert.equal(G.overlaps(card, { ...card, y: 370, z: 100 }, 5), true,
            "An elevated face overlaps where the player actually sees it");
    }
});

test("landing fans expose each card and the top card overlaps the preceding play on every board size", () => {
    for (const bounds of [
        { left: 0, top: 0, width: 342, height: 320 },
        { left: 20, top: 30, width: 300, height: 180 },
        { left: 50, top: 80, width: 800, height: 600 }
    ]) {
        let previous = null;
        const dimensions = bounds.height < 200 ? { width: 64, height: 96 } : { width: 100, height: 150 };
        for (let play = 0; play < 16; play++) {
            const cards = Array.from({ length: play % 4 + 1 }, (_, index) => ({
                ...flat(bounds.left + (play * 137 + index * 71) % bounds.width,
                    bounds.top + (play * 157 + index * 47) % bounds.height),
                ...dimensions, radius: play % 2 ? 0 : 8.75, roll: (play * 47 + index * 97) % 700 - 350
            }));
            const arranged = G.arrangePlay(cards, previous, bounds);
            assert.deepEqual(G.arrangePlay(cards, previous, bounds), arranged, "Layout is repeatable");
            if (previous) {
                assert.ok(G.overlapCoverage(arranged.at(-1), previous) >= .12 - 1e-8,
                    "The top card covers at least 12% before support tilt, rather than merely touching");
            }
            arranged.forEach((pose, index) => {
                assert.ok(G.silhouette(pose).every(point => point.x >= bounds.left && point.y >= bounds.top &&
                    point.x <= bounds.left + bounds.width && point.y <= bounds.top + bounds.height),
                "Every card, not just its center, fits on the felt");
                if (index > 0) { assert.ok(G.overlaps(pose, arranged[index - 1], 8), "The fan remains a connected play"); }
                let exposed = 0;
                for (let x = 0; x < 10; x++) {
                    for (let y = 0; y < 16; y++) {
                        const point = G.world((x / 10 - .45) * pose.width, (y / 16 - .46875) * pose.height, 0, pose);
                        if (!arranged.slice(index + 1).some(above => G.contains(above, point.x, point.y))) { exposed++; }
                    }
                }
                assert.ok(exposed >= 32, `At least 20% of card ${index + 1} remains individually visible (${exposed}/160)`);
            });
            previous = arranged.at(-1);
        }
    }
});

test("coverage measures face area rather than edge distance or bounding boxes", () => {
    for (const radius of [0, 8.75]) {
        const card = { ...flat(100, 200), width: 100, height: 150, radius };
        assert.ok(Math.abs(G.overlapCoverage(card, card) - 1) < 1e-9);
        assert.equal(G.overlapCoverage({ ...card, x: 210 }, card), 0);
        assert.ok(Math.abs(G.overlapCoverage({ ...card, x: 100 + (100 - 1.5 * 100 / 80) / 2 }, card) - .5) <
            (radius ? .02 : 1e-9));
        const corner = { ...card, x: 183, y: 333 };
        assert.ok(G.overlaps(corner, card, 8), "Both axes overlap by more than the old 8px threshold");
        assert.ok(G.overlapCoverage(corner, card) < .02, "A tiny corner overlap is not 10% cover");
        const rotated = { ...card, x: 170, y: 260, roll: 38, z: 40, pitch: 3, yaw: -4 };
        let covered = 0, total = 0;
        for (let x = 0; x < 100; x++) {
            for (let y = 0; y < 150; y++) {
                const point = { x: card.x - 50 + x + .5, y: card.y - 75 + y + .5 };
                if (!G.screenContains(card, point.x, point.y)) { continue; }
                total++;
                if (G.screenContains(rotated, point.x, point.y)) { covered++; }
            }
        }
        assert.ok(Math.abs(G.overlapCoverage(rotated, card) - covered / total) < .003,
            "Projected polygon intersection agrees with independent face sampling");
    }
});

test("left and right rebounds fan the upper cards forward without pulling the bottom card back or counter-rotating", () => {
    const bounds = { left: 0, top: 0, width: 600, height: 600 };
    for (const direction of [-1, 1]) {
        for (const roll of [-47, -12, 12, 47, 190, 350]) {
            for (const count of [2, 3, 4]) {
                const base = { ...flat(direction < 0 ? 200 : 400, 300), width: 100, height: 150, roll };
                const cards = Array.from({ length: count }, () => ({ ...base }));
                const rebound = { x: -direction * 150, y: -20 };
                const fan = G.arrangePlay(cards, null, bounds, rebound);
                const first = fan[0], top = fan.at(-1);
                assert.equal(first.roll, roll, "No clamping or unwinding the physical endpoint");
                assert.ok(Math.abs(first.x - base.x) < 1e-8 && Math.abs(first.y - base.y) < 1e-8,
                    "The lower card keeps its collision endpoint when the forward fan fits");
                assert.ok((top.x - first.x) * rebound.x + (top.y - first.y) * rebound.y > 0,
                    "Upper cards spread in the rebound direction");
                let lastOffset = -1;
                for (let step = 0; step <= 240; step++) {
                    const t = step / 240;
                    const raw = { x: base.x, y: base.y, roll: roll - 10 * (1 - t) ** 2 };
                    const bottom = G.settlePosition(raw, base, first, t, bounds, .2);
                    const upper = G.settlePosition(raw, base, top, t, bounds, .2);
                    assert.equal(bottom.roll, raw.roll);
                    assert.equal(upper.roll, raw.roll, "Fanning never reverses or adds angular momentum");
                    const offset = (upper.x - bottom.x) * rebound.x + (upper.y - bottom.y) * rebound.y;
                    assert.ok(offset >= lastOffset - 1e-7, "The top card keeps sliding forward into the fan");
                    lastOffset = offset;
                }
            }
        }
    }
});

test("individual landing splay reuses seeded poses without sacrificing the readable fan", () => {
    const bounds = { left: 0, top: 0, width: 600, height: 500 };
    const cards = [0, 1, 2, 3].map(index => ({ ...flat(200 + index * 35 + index % 2 * 3,
        220 + index % 2 * 8), width: 100, height: 150, roll: index * 3 - 5 }));
    const poses = G.arrangePlay(cards, null, bounds);
    assert.deepEqual(G.arrangePlay(cards, null, bounds), poses, "Refreshes keep the same natural splay");
    assert.ok(new Set(poses.map(pose => pose.roll)).size > 1);
    assert.ok(new Set(poses.map(pose => pose.y - Math.sin(poses[0].roll * Math.PI / 180) * 36 *
        poses.indexOf(pose))).size > 1, "Cards have small independent positional offsets as well as angles");
    poses.forEach(pose => assert.ok(Math.abs(pose.roll - poses[0].roll) <= 2));
});

test("settlement admits late incoming cards continuously and preserves elevated endpoints", () => {
    const bounds = { left: 0, top: 0, width: 350, height: 320 };
    const target = { ...flat(180, 260), width: 100, height: 150, z: 100 };
    const outside = { x: 180, y: 520, roll: 0 };
    const before = G.settlePosition(outside, outside, target, G.CONTACT - 1e-6, bounds);
    const after = G.settlePosition(outside, outside, target, G.CONTACT + 1e-6, bounds);
    assert.ok(Math.abs(after.y - before.y) < .001, "Closing the bottom does not teleport a late incoming card");
    assert.deepEqual(G.settlePosition(outside, outside, target, 1, bounds),
        { x: target.x, y: target.y, roll: target.roll }, "The projected resting card fits without clamping its elevated world center");
    const inside = { x: 180, y: 200, roll: 0 };
    const contained = G.settlePosition(inside, inside, target, .9, bounds);
    assert.ok(G.silhouette({ ...target, ...contained }).map(G.screen).every(point => point.y <= bounds.height));
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
