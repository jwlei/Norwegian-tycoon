const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ getCookie: () => null, performance: { now: () => 1000 } });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8"), context);
const guide = fs.readFileSync(path.join(__dirname, "touch-flick-guide.js"), "utf8");
vm.runInContext(guide.slice(0, guide.indexOf("const touchGuide")), context);
const example = context.touchFlickExample;

test("mobile examples use the game's exact minimum speed and stroke thresholds", () => {
    assert.equal(example(0, "initial", 10, 0.4).flick, true);
    assert.equal(example(0, "initial", 10, 0.4).duration, 25);
    assert.equal(example(0, "initial", 32, 0.4).duration, 80);
    assert.equal(example(0, "initial", 32, 0.39).flick, false);
    assert.equal(example(0, "initial", 9, 0.4).flick, false);
    assert.equal(example(45, "initial", 10, 0.4).axis, null, "8 px initial intent is required on one axis");
    assert.equal(example(45, "initial", 32, 0.4).flick, true);
    assert.equal(example(45, "release", 10, 0.4).flick, true);
});

test("mobile examples distinguish 145-degree pickup, undecided gaps and horizontal scrolling", () => {
    for (const sign of [-1, 1]) {
        for (const angle of [0, 45, 72.5]) {
            assert.equal(example(angle * sign, "initial", 32, 0.4).flick, true);
        }
        for (const angle of [72.6, 73.5, 74.9]) {
            assert.equal(example(angle * sign, "initial", 32, 0.4).axis, null);
        }
        for (const angle of [75, 80, 90, 105]) {
            const result = example(angle * sign, "initial", 32, 0.4);
            assert.equal(result.axis, "horizontal");
            assert.equal(result.flick, false);
        }
    }
    assert.equal(example(180, "initial", 32, 0.4).axis, "vertical");
    assert.equal(example(180, "initial", 32, 0.4).flick, false);
});

test("mobile release examples retain the wider locked cone and show the release-delay boundary", () => {
    for (const angle of [-80, -75, 0, 75, 80]) {
        assert.equal(example(angle, "release", 32, 0.4).flick, true);
    }
    for (const angle of [-81, 81, 90, 180]) {
        assert.equal(example(angle, "release", 32, 0.4).flick, false);
    }
    assert.equal(example(0, "release", 32, 0.4, 120).flick, true);
    assert.equal(example(0, "release", 32, 0.4, 121).flick, false);
});
