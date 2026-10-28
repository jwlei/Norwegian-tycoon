const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ getCookie: () => null, performance: { now: () => 1000 } });
for (const file of ["bot.js", "game.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}
const guide = fs.readFileSync(path.join(__dirname, "..", "sandbox", "touch-flick-guide.js"), "utf8");
vm.runInContext(guide.slice(0, guide.indexOf("const touchGuide")), context);
const example = context.touchFlickExample;

const HALF_CONE = vm.runInContext("CARD_TOUCH_PICKUP_CONE", context) / 2;
const MIN_DISTANCE = vm.runInContext("CARD_FLICK_MIN_DISTANCE", context);
const MIN_VELOCITY = vm.runInContext("CARD_FLICK_MIN_VELOCITY", context);
const GRACE_MS = vm.runInContext("CARD_FLICK_RELEASE_GRACE_MS", context);
// Touch intent needs 8 px on one axis; strokes within 15 degrees of horizontal scroll the hand.
const INTENT_DISTANCE = 8;
const HORIZONTAL_ANGLE = 75;
const FAST = Math.max(0.4, MIN_VELOCITY * 2);

test("mobile examples use the game's exact minimum speed and stroke thresholds", () => {
    const pickup = Math.max(INTENT_DISTANCE, MIN_DISTANCE);
    assert.equal(example(0, "initial", pickup, MIN_VELOCITY).flick, true);
    assert.equal(example(0, "initial", 32, 0.4).duration, 80);
    assert.equal(example(0, "initial", 32, MIN_VELOCITY - 0.01).flick, false);
    assert.equal(example(0, "initial", INTENT_DISTANCE - 1, FAST).axis, null);
    assert.equal(example(0, "release", MIN_DISTANCE - 0.5, FAST).flick, false);
    assert.equal(example(45, "initial", 10, FAST).axis, null, "8 px initial intent is required on one axis");
    assert.equal(example(45, "initial", 32, FAST).flick, true);
    assert.equal(example(45, "release", 10, FAST).flick, true);
});

test("mobile examples distinguish the pickup cone, undecided gaps and horizontal scrolling", () => {
    const gap = HALF_CONE + 0.1 < HORIZONTAL_ANGLE - 0.1
        ? [HALF_CONE + 0.1, (HALF_CONE + HORIZONTAL_ANGLE) / 2, HORIZONTAL_ANGLE - 0.1] : [];
    for (const sign of [-1, 1]) {
        for (const angle of [0, 45, HALF_CONE]) {
            assert.equal(example(angle * sign, "initial", 32, FAST).flick, true, `${angle * sign}`);
        }
        for (const angle of gap) {
            assert.equal(example(angle * sign, "initial", 32, FAST).axis, null, `${angle * sign}`);
        }
        for (const angle of [HORIZONTAL_ANGLE, 80, 90, 105]) {
            const result = example(angle * sign, "initial", 32, FAST);
            assert.equal(result.axis, "horizontal");
            assert.equal(result.flick, false);
        }
    }
    assert.equal(example(180, "initial", 32, FAST).axis, "vertical");
    assert.equal(example(180, "initial", 32, FAST).flick, false);
});

test("mobile release examples use the pickup cone and show the release-delay boundary", () => {
    for (const angle of [-HALF_CONE, -60, 0, 60, HALF_CONE]) {
        assert.equal(example(angle, "release", 32, FAST).flick, true, `${angle}`);
    }
    for (const angle of [-(HALF_CONE + 10), -(HALF_CONE + 0.1), HALF_CONE + 0.1, HALF_CONE + 10, 90, 180]) {
        assert.equal(example(angle, "release", 32, FAST).flick, false, `${angle}`);
    }
    assert.equal(example(0, "release", 32, FAST, GRACE_MS).flick, true);
    assert.equal(example(0, "release", 32, FAST, GRACE_MS + 1).flick, false);
});
