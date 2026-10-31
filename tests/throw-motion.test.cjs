"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../js/landing-geometry.js");

const card = { width: 127, height: 190 };
const hand = { x: 960, y: 900, roll: 0 };
const seat = { x: 1300, y: 110, roll: 0 };
const seeded = (seed = 1) => {
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // The first values from a small seed are close to zero, so skip past them.
    for (let skip = 0; skip < 8; skip++) { next(); }
    return next;
};
const shaped = (rest, power, lean, swing = 0, extra = {}) =>
    G.throwShape({ start: hand, rest: { ...card, ...rest }, power, lean, swing, random: seeded(), ...extra });
// The straight flight, built the way CardDepth.landingMotion builds it.
function straightPath(start, rest, power = .55) {
    const distance = Math.max(1, Math.hypot(rest.x - start.x, rest.y - start.y));
    const slide = Math.min(distance * .18, G.slideDistanceToRest(distance, power, rest.height) * 1.12);
    const momentum = { x: (rest.x - start.x) / distance * slide, y: (rest.y - start.y) / distance * slide,
        spin: (rest.roll - start.roll) * .08, power };
    const impact = { x: rest.x - momentum.x, y: rest.y - momentum.y, roll: rest.roll - momentum.spin };
    return progress => G.position(start, impact, momentum, progress);
}

test("a throw sent past the limit swings wide on its own side and hooks back in", () => {
    for (const [offset, lean, sign] of [[-220, -1, -1], [220, 1, 1]]) {
        const rest = { x: hand.x + offset, y: 400, roll: sign * 28 };
        const shape = shaped(rest, .95, lean, 1);
        const path = straightPath(hand, { ...card, ...rest }, .95);
        assert.ok(shape.bulge > 30, `Swing is ${shape.bulge}`);
        assert.equal(shape.spin, sign);
        const steps = Array.from({ length: 41 }, (_, index) => G.throwOverlay(shape, path(index / 40)));
        const early = steps[5];
        const direct = hand.x + (rest.x - hand.x) * (hand.y - early.y) / (hand.y - rest.y);
        assert.ok((early.x - direct) * sign > 5, "The card goes wide of the straight line on the throw's side");
        const heading = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
        assert.ok((heading(steps[24], steps[25]) - heading(steps[1], steps[2])) * sign < 0, "Its heading turns back in");
    }
});

test("a throw inside the landing area keeps the plain flight, in both path and rotation", () => {
    const rest = { ...card, x: hand.x - 120, y: 400, roll: -18 };
    for (const [power, lean] of [[.3, -.3], [.6, -.8], [.8, -.6], [1, -1], [1, 0], [.5, .05]]) {
        const shape = G.throwShape({ start: hand, rest, power, lean, swing: 0, random: seeded() });
        assert.equal(shape.bulge, 0);
        const path = straightPath(hand, rest, power);
        for (let step = 0; step <= 40; step++) {
            const point = path(step / 40), moved = G.throwOverlay(shape, point);
            assert.equal(moved.x, point.x);
            assert.equal(moved.y, point.y);
            assert.equal(moved.roll, point.roll);
        }
    }
});

test("the swing grows with how far past the limit and how hard the throw was", () => {
    const rest = { x: hand.x - 220, y: 400, roll: -28 };
    const size = (power, swing) => shaped(rest, power, -1, swing, { random: () => .5 }).bulge;
    assert.ok(size(1, .3) > 0 && size(1, .3) < size(1, .7) && size(1, .7) < size(1, 1));
    assert.ok(size(.6, 1) > 0 && size(.6, 1) < size(.8, 1));
    assert.equal(size(.4, 1), 0, "A gentle throw has no swing even at the limit");
});

test("the overlay keeps the flight's timing and ends exactly at rest", () => {
    for (const offset of [-220, -60, 0, 60, 220]) {
        for (const power of [.1, .5, .8, 1]) {
            const rest = { ...card, x: hand.x + offset, y: 400, roll: offset / 8 };
            const shape = G.throwShape({ start: hand, rest, power, lean: Math.sign(offset) * power, swing: 1, random: seeded(offset + 300) });
            const path = straightPath(hand, rest, power);
            const last = G.throwOverlay(shape, path(1));
            assert.ok(Math.hypot(last.x - rest.x, last.y - rest.y) < 1e-6);
            assert.ok(Math.abs(last.roll - rest.roll) < 1e-6);
            const first = G.throwOverlay(shape, path(0));
            assert.ok(Math.hypot(first.x - hand.x, first.y - hand.y) < 1e-6, "It leaves the hand where it was released");
            const near = G.throwOverlay(shape, path(.995));
            assert.ok(Math.hypot(near.x - last.x, near.y - last.y) < .5 && Math.abs(near.roll - last.roll) < .1, "No visible step at the reveal");
            // Motion along the line is unchanged, frame for frame: only the sideways arc is added.
            const along = value => (value.x - hand.x) * shape.heading.x + (value.y - hand.y) * shape.heading.y;
            for (let step = 1; step < 20; step++) {
                const point = path(step / 20);
                assert.ok(Math.abs(along(G.throwOverlay(shape, point)) - along(point)) < 1e-6);
            }
        }
    }
});

test("the swing stays within its limits, also on a phone", () => {
    for (let seed = 1; seed < 60; seed++) {
        const random = seeded(seed);
        const long = G.throwShape({ start: hand, rest: { ...card, x: 400, y: 200, roll: -20 }, power: 1, lean: -1, swing: 1, random });
        assert.ok(long.bulge <= 72 * 1.2 + 1e-9);
        const phone = G.throwShape({ start: { x: 195, y: 700, roll: 0 }, rest: { width: 99, height: 148, x: 90, y: 340, roll: -20 }, power: 1, lean: -1, swing: 1, random });
        assert.ok(phone.bulge <= 72 * 148 / 190 * 1.2 + 1e-9);
        assert.ok(phone.bulge <= phone.distance * .15 * 1.2 + 1e-9);
    }
});

test("a card never reverses its rotation on the way to landing", () => {
    const flights = [
        { start: hand, rest: { x: hand.x - 220, y: 400, roll: -38 }, power: 1, lean: -1, swing: 1 },
        { start: hand, rest: { x: hand.x + 220, y: 400, roll: 42 }, power: .9, lean: 1, swing: .6 },
        { start: { ...hand, roll: 6 }, rest: { x: hand.x - 80, y: 400, roll: -14 }, power: .5, lean: -.5 },
        { start: seat, rest: { x: 700, y: 450, roll: 12 }, power: .55, fromSeat: true }
    ];
    for (const { rest, ...flight } of flights) {
        for (let seed = 1; seed < 40; seed++) {
            const target = { ...card, ...rest };
            const shape = G.throwShape({ ...flight, rest: target, random: seeded(seed) });
            const path = straightPath({ ...flight.start, roll: shape.startRoll }, target, shape.power);
            const way = Math.sign(target.roll - shape.startRoll);
            let previous = shape.startRoll;
            for (let step = 1; step <= 200; step++) {
                const { roll } = G.throwOverlay(shape, path(step / 200));
                assert.ok((roll - previous) * way >= -1e-9, `The card turned back at step ${step}`);
                previous = roll;
            }
            assert.ok(Math.abs(previous - target.roll) < 1e-6, "It stops exactly at its final angle");
        }
    }
});

test("the player's own left throws rotate counter-clockwise and right throws clockwise", () => {
    for (const [offset, lean, sign] of [[-150, -.9, -1], [150, .9, 1]]) {
        const rest = { x: hand.x + offset, y: 400, roll: sign * 28 };
        const shape = shaped(rest, .8, lean);
        assert.equal(shape.spin, sign);
        assert.equal(shape.startRoll, hand.roll, "The card leaves the hand as it was held");
        assert.ok(G.throwOverlay(shape, straightPath(hand, { ...card, ...rest }, .8)(.3)).roll * sign > 5);
    }
});

test("other players' throws come gentle, normal or hard, rotating either way", () => {
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

test("only other players' hard throws swing, half as much as the player's own", () => {
    const rest = { ...card, x: 700, y: 450, roll: 12 };
    const shapes = Array.from({ length: 600 }, (_, seed) =>
        G.throwShape({ start: seat, rest, power: .55, fromSeat: true, random: seeded(seed + 1) }));
    shapes.filter(shape => shape.power <= .7).forEach(shape => {
        assert.equal(shape.bulge, 0, "Gentle and normal throws keep the plain flight");
    });
    const widest = Math.max(...shapes.map(shape => shape.bulge));
    assert.ok(widest > 15 && widest <= 72 * 1.2 * .5 + 1e-9, `Other players swing up to ${widest}px`);
    const own = Math.max(...Array.from({ length: 300 }, (_, seed) =>
        G.throwShape({ start: hand, rest, power: 1, lean: -1, swing: 1, random: seeded(seed + 1) }).bulge));
    assert.ok(own > 75, `Own throws swing up to ${own}px`);
});
