"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../js/landing-geometry.js");

const card = { width: 127, height: 190 };
const hand = { x: 960, y: 900, roll: 0 };
const seeded = (seed = 1) => {
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // The first values from a small seed are close to zero, so skip past them.
    for (let skip = 0; skip < 8; skip++) { next(); }
    return next;
};
const shaped = (rest, power, lean, extra = {}) => G.throwShape({ start: hand, rest: { ...card, ...rest }, power, lean, random: seeded(), ...extra });
// The straight flight, built the way CardDepth.landingMotion builds it.
function straightPath(start, rest, power = .55) {
    const distance = Math.max(1, Math.hypot(rest.x - start.x, rest.y - start.y));
    const slide = Math.min(distance * .18, G.slideDistanceToRest(distance, power, rest.height) * 1.12);
    const momentum = { x: (rest.x - start.x) / distance * slide, y: (rest.y - start.y) / distance * slide,
        spin: (rest.roll - start.roll) * .08, power };
    const impact = { x: rest.x - momentum.x, y: rest.y - momentum.y, roll: rest.roll - momentum.spin };
    return progress => G.position(start, impact, momentum, progress);
}

test("a hard sideways throw swings wide on its own side and hooks back in", () => {
    for (const [offset, lean, sign] of [[-200, -1, -1], [200, 1, 1]]) {
        const rest = { x: hand.x + offset, y: 400, roll: sign * 28 };
        const shape = shaped(rest, .95, lean);
        const path = straightPath(hand, { ...card, ...rest }, .95);
        assert.ok(shape.bulge > 30, `Swing is ${shape.bulge}`);
        assert.equal(shape.spin, sign);
        const steps = Array.from({ length: 41 }, (_, index) => G.throwOverlay(shape, path(index / 40), index / 40));
        const early = steps[5];
        const direct = hand.x + (rest.x - hand.x) * (hand.y - early.y) / (hand.y - rest.y);
        assert.ok((early.x - direct) * sign > 5, "The card goes wide of the straight line on the throw's side");
        const heading = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
        assert.ok((heading(steps[24], steps[25]) - heading(steps[1], steps[2])) * sign < 0, "Its heading turns back in");
    }
});

test("only throws that are both hard and sideways swing; the rest keep the straight path", () => {
    const rest = { x: hand.x - 80, y: 400, roll: -10 };
    assert.equal(shaped(rest, .95, 0).bulge, 0, "Hard but straight");
    assert.equal(shaped(rest, .95, .3).bulge, 0, "Hard, slightly sideways");
    assert.equal(shaped(rest, .3, -1).bulge, 0, "Sideways but gentle");
    const straight = shaped(rest, .3, -1), path = straightPath(hand, { ...card, ...rest }, .3);
    for (let step = 0; step <= 20; step++) {
        const point = path(step / 20), moved = G.throwOverlay(straight, point, step / 20);
        assert.equal(moved.x, point.x);
        assert.equal(moved.y, point.y);
    }
    const swing = power => shaped(rest, power, -1, { random: () => .5 }).bulge;
    assert.ok(swing(.6) > 0 && swing(.6) < swing(.8), "It grows with power rather than switching on");
});

test("the overlay keeps the flight's timing and ends exactly at rest", () => {
    for (const offset of [-200, -60, 0, 60, 200]) {
        for (const power of [.1, .5, .8, 1]) {
            const rest = { ...card, x: hand.x + offset, y: 400, roll: offset / 8 };
            const shape = G.throwShape({ start: hand, rest, power, lean: Math.sign(offset) * power, random: seeded(offset + 300) });
            const path = straightPath(hand, rest, power);
            const last = G.throwOverlay(shape, path(1), 1);
            assert.ok(Math.hypot(last.x - rest.x, last.y - rest.y) < 1e-6);
            assert.ok(Math.abs(last.roll - rest.roll) < 1e-6);
            const first = G.throwOverlay(shape, path(0), 0);
            assert.ok(Math.hypot(first.x - hand.x, first.y - hand.y) < 1e-6, "It leaves the hand where it was released");
            const near = G.throwOverlay(shape, path(.995), .995);
            assert.ok(Math.hypot(near.x - last.x, near.y - last.y) < .5 && Math.abs(near.roll - last.roll) < .1, "No visible step at the reveal");
            // Motion along the line is unchanged, frame for frame: only the sideways arc is added.
            const along = value => (value.x - hand.x) * shape.heading.x + (value.y - hand.y) * shape.heading.y;
            for (let step = 1; step < 20; step++) {
                const point = path(step / 20);
                assert.ok(Math.abs(along(G.throwOverlay(shape, point, step / 20)) - along(point)) < 1e-6);
            }
        }
    }
});

test("the swing stays within its limits, also on a phone", () => {
    for (let seed = 1; seed < 60; seed++) {
        const random = seeded(seed);
        const long = G.throwShape({ start: hand, rest: { ...card, x: 400, y: 200, roll: -20 }, power: 1, lean: -1, random });
        assert.ok(long.bulge <= 72 * 1.2 + 1e-9);
        const phone = G.throwShape({ start: { x: 195, y: 700, roll: 0 }, rest: { width: 99, height: 148, x: 90, y: 340, roll: -20 }, power: 1, lean: -1, random });
        assert.ok(phone.bulge <= 72 * 148 / 190 * 1.2 + 1e-9);
        assert.ok(phone.bulge <= phone.distance * .15 * 1.2 + 1e-9);
    }
});

test("rotation varies from throw to throw within tolerable margins", () => {
    const rest = { x: hand.x - 60, y: 400, roll: -15 };
    const wobbles = Array.from({ length: 300 }, (_, seed) => shaped(rest, .6, -.6, { random: seeded(seed + 1) }).wobble);
    assert.ok(wobbles.every(value => Math.abs(value) <= 12), "A throw never gains more than a slight extra turn");
    const forward = wobbles.filter(value => value < 0).length / wobbles.length;
    assert.ok(forward > .55 && forward < .85, `${forward} rotate extra with the throw`);
    assert.ok(new Set(wobbles.map(value => value.toFixed(1))).size > 30);
});

test("the player's own left throws rotate counter-clockwise and right throws clockwise", () => {
    for (const [offset, lean, sign] of [[-150, -.9, -1], [150, .9, 1]]) {
        const rest = { x: hand.x + offset, y: 400, roll: sign * 28 };
        const shape = shaped(rest, .8, lean);
        assert.equal(shape.spin, sign);
        assert.equal(shape.startRoll, hand.roll, "The card leaves the hand as it was held");
        assert.ok(G.throwOverlay(shape, straightPath(hand, { ...card, ...rest }, .8)(.3), .3).roll * sign > 5);
    }
});

test("other players' throws come gentle, normal or hard, rotating either way", () => {
    const seat = { x: 1300, y: 110, roll: 0 };
    const rest = { ...card, x: 700, y: 450, roll: 12 };
    const shapes = Array.from({ length: 600 }, (_, seed) =>
        G.throwShape({ start: seat, rest, power: .55, fromSeat: true, random: seeded(seed + 1) }));
    const share = test => shapes.filter(test).length / shapes.length;
    const gentle = share(shape => shape.power < .42), hard = share(shape => shape.power > .7);
    assert.ok(gentle > .2 && gentle < .4, `${gentle} gentle`);
    assert.ok(hard > .15 && hard < .35, `${hard} hard`);
    assert.ok(1 - gentle - hard > .35, "Most land in between");
    const clockwise = share(shape => shape.spin > 0);
    assert.ok(clockwise > .4 && clockwise < .6, `${clockwise} clockwise`);
    shapes.forEach(shape => {
        assert.ok((rest.roll - shape.startRoll) * shape.spin > 0, "The card turns its chosen way into its shared final angle");
        assert.ok(Math.abs(rest.roll - shape.startRoll) <= (10 + .95 * 20) * 1.2 + 1e-9);
    });
});

test("other players' cards swing half as much as the player's own", () => {
    const rest = { ...card, x: 700, y: 450, roll: 12 };
    const widest = (start, extra) => Math.max(...Array.from({ length: 300 }, (_, seed) =>
        G.throwShape({ start, rest, random: seeded(seed + 1), ...extra }).bulge));
    const own = widest(hand, { power: 1, lean: -1 });
    const seat = widest({ x: 1300, y: 110, roll: 0 }, { power: .55, fromSeat: true });
    assert.ok(own > 75, `Own throws swing up to ${own}px`);
    assert.ok(seat > 15 && seat <= 72 * 1.2 * .5 + 1e-9, `Other players swing up to ${seat}px`);
    const shapes = Array.from({ length: 300 }, (_, seed) => G.throwShape({ start: hand, rest, power: .55, fromSeat: true, random: seeded(seed + 1) }));
    assert.ok(shapes.some(shape => shape.bulge === 0), "Gentle ones fly straight");
});
