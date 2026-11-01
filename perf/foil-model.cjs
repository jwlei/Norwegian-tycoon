#!/usr/bin/env node
// What can be worked out about foil cost without a browser. Plain Node: it opens no browser and leaves nothing running.
//   node perf/foil-model.cjs [--out perf/results/foil-model.json]
// 1. Pixels: how much off-screen drawing foil asks of the GPU on a OnePlus 15, recorded today and predicted with the patches.
// 2. Sheen: which plain white gradient best replaces the soft-light glare, and how far apart they are on real card colours.
// 3. Writes: how many foil repaints a drag and a flight ask for, at every frame or held to 30 per second.
// 4. Keyframes: what it costs to build a flight's foil keyframes.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
};

// ---- 1. Pixels -------------------------------------------------------------------------------------------------------
// OnePlus 15: 1272 x 2772 physical pixels. Android reports a 3.5 scale at the default display size, an assumption the lab checks.
const PHONE = { physicalWidth: 1272, physicalHeight: 2772, dpr: 3.5 };
PHONE.cssWidth = Math.round(PHONE.physicalWidth / PHONE.dpr);
PHONE.cssHeight = Math.round(PHONE.physicalHeight / PHONE.dpr);
// css/mobile.css sizes a hand card by clamp(88px, 21dvh, 156px); the artwork is 80 x 120 units.
const cardHeight = Math.max(88, Math.min(156, PHONE.cssHeight * .21));
const cardWidth = cardHeight * 80 / 120;
const cardPixels = Math.round(cardWidth * cardHeight * PHONE.dpr ** 2);
// Render passes per frame as recorded on the emulated phone, from the run closest to main. Only drag has no later run than
// the baseline, and later patches left its 31 passes unchanged in every recorded variant (perf/results/patch-drag.json).
const RECORDED = [
    { name: "Scroll the hand", today: 30.8, moving: 0, source: "stack-idle-with-05.json" },
    { name: "Drag one card", today: 31.1, moving: 1, source: "patch-drag.json" },
    { name: "Play 1 card onto 12", today: 26.6, moving: 1, source: "attribution.json" },
    { name: "Resting table of 30", today: 23.9, moving: 0, source: "stack-idle-with-05.json" }
];
// A page without foil draws 3.9 passes. Prediction: resting foil adds none, as the recorded idle-off hand shows, and a moving
// card keeps the isolated group and its filtered colour layer, while the plain glare no longer needs a pass.
const NO_FOIL_PASSES = 3.9, MOVING_CARD_PASSES = 2;
const frameBudget = hz => Math.round(10000 / hz) / 10;
function pixelModel() {
    return {
        phone: PHONE, cardCssPixels: [Math.round(cardWidth), Math.round(cardHeight)], cardPixels,
        budgetMs: { "60 Hz": frameBudget(60), "120 Hz": frameBudget(120), "165 Hz": frameBudget(165) },
        scenes: RECORDED.map(scene => {
            const proposed = Math.round((NO_FOIL_PASSES + scene.moving * MOVING_CARD_PASSES) * 10) / 10;
            return { name: scene.name, source: scene.source, today: scene.today, proposed,
                offscreenPixelsToday: Math.round((scene.today - NO_FOIL_PASSES) * cardPixels),
                offscreenPixelsProposed: Math.round((proposed - NO_FOIL_PASSES) * cardPixels) };
        })
    };
}

// ---- 2. Sheen --------------------------------------------------------------------------------------------------------
// The W3C compositing formula for soft-light, per channel.
function softLight(base, source) {
    if (source <= .5) { return base - (1 - 2 * source) * base * (1 - base); }
    const d = base <= .25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base);
    return base + (2 * source - 1) * (d - base);
}
const hexToChannels = hex => hex.match(/../g).map(part => parseInt(part, 16) / 255);

function loadCard() {
    const context = vm.createContext({ console, getCookie: () => "", setTimeout, encodeURIComponent, decodeURIComponent });
    vm.runInContext(`${fs.readFileSync(path.join(ROOT, "js", "cards.js"), "utf8")}\nthis.Card = Card;`, context);
    return context.Card;
}
// Every solid colour in every card style's artwork, so the fit is judged on what cards really show.
function artworkColours() {
    const Card = loadCard();
    const css = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const styles = [...new Set([...css.matchAll(/data-card-style="([^"]+)"/g)].map(match => match[1]))];
    const colours = new Map();
    for (const style of styles.length ? styles : ["normal"]) {
        for (const [suit, rank] of [[1, 13], [2, 7], [3, 2], [4, 1]]) {
            const svg = decodeURIComponent(new Card(suit, rank).toImageDataUri(style, "none").split(",")[1]);
            for (const match of svg.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
                const hex = match[1].length == 3 ? match[1].replace(/./g, "$&$&") : match[1];
                colours.set(hex.toLowerCase(), hexToChannels(hex));
            }
        }
    }
    return { styles: styles.length, colours: [...colours.values()] };
}
// Foil changes what is under the glare, so a pixel can hold any value, not only the artwork's own colours.
const EVERY_LEVEL = Array.from({ length: 256 }, (_, level) => [level / 255]);
// The glare at its centre: #fff8 (alpha .533) under opacity .3. The other stop scales with it, so one factor fits the gradient.
const GLARE_PEAK = (0x88 / 255) * .3;
// Glare seen over a colour: what the card shows today, per channel.
const today = (channel, alpha) => channel + alpha * (softLight(channel, 1) - channel);
const plain = (channel, alpha) => channel + alpha * (1 - channel);
function sheenError(colours, factor, strength) {
    let worst = 0, sum = 0, count = 0;
    for (const colour of colours) {
        for (const channel of colour) {
            for (const position of [1, .5, .25]) {
                const alpha = GLARE_PEAK * strength * position;
                const error = Math.abs(today(channel, alpha) - plain(channel, alpha * factor)) * 255;
                worst = Math.max(worst, error);
                sum += error;
                count++;
            }
        }
    }
    return { worst, mean: sum / count };
}
function sheenModel() {
    const { styles, colours } = artworkColours();
    let best = null;
    for (let factor = .05; factor <= 1; factor += .005) {
        const score = sheenError(EVERY_LEVEL, factor, 1);
        if (!best || score.worst < best.worst) { best = { factor: Math.round(factor * 1000) / 1000, ...score }; }
    }
    const artwork = sheenError(colours, best.factor, 1);
    return {
        styles, colours: colours.length, factor: best.factor,
        worstLevels: Math.round(best.worst * 10) / 10, meanLevels: Math.round(best.mean * 100) / 100,
        artworkWorstLevels: Math.round(artwork.worst * 10) / 10, artworkMeanLevels: Math.round(artwork.mean * 100) / 100,
        // How much the glare changes a card at all: the error from simply leaving it out.
        withoutGlareWorstLevels: Math.round(sheenError(EVERY_LEVEL, 0, 1).worst * 10) / 10,
        stops: { centre: Math.round(0x88 / 255 * best.factor * 1000) / 1000, middle: Math.round(0x22 / 255 * best.factor * 1000) / 1000 },
        unchangedGlareOnPlainWhite: Math.round(Math.abs(today(1, GLARE_PEAK) - 1) * 255 * 10) / 10
    };
}

// ---- 3. Writes -------------------------------------------------------------------------------------------------------
// Replays the easing in animateCardDragTilt (js/game.js) over a looping drag, counting the frames whose foil values change.
function dragWrites(hz, holdMs, seconds = 3) {
    const frame = 1000 / hz;
    let pitch = 0, yaw = 0, targetPitch = 0, targetYaw = 0, sampledX = 0, sampledY = 0, patternX = 50, patternY = 50;
    let frames = 0, tiltWrites = 0, foilWrites = 0, lastFoil = -Infinity, written = "";
    for (let time = 0; time < seconds * 1000; time += frame) {
        // The same loop over the table that perf/run.cjs traces.
        const x = Math.sin(time / 280) * 90, y = Math.cos(time / 280 * 1.3) * 60;
        const velocityX = (x - sampledX) / Math.max(16, frame), velocityY = (y - sampledY) / Math.max(16, frame);
        sampledX = x;
        sampledY = y;
        const targetBlend = 1 - Math.exp(-frame / 100), blend = 1 - Math.exp(-frame / 120);
        targetPitch += (Math.max(-18, Math.min(18, velocityY * 720)) * .7 - targetPitch) * targetBlend;
        targetYaw += (Math.max(-18, Math.min(18, -velocityX * 720)) - targetYaw) * targetBlend;
        pitch += (targetPitch - pitch) * blend;
        yaw += (targetYaw - yaw) * blend;
        const patternBlend = 1 - Math.exp(-frame / 230);
        patternX += (50 + yaw / 18 * 45 * .8 - patternX) * patternBlend;
        patternY += (50 + pitch / 18 * 45 * .8 - patternY) * patternBlend;
        frames++;
        tiltWrites++;
        const value = `${patternX.toFixed(2)}:${patternY.toFixed(2)}`;
        if (value !== written && time - lastFoil >= holdMs) {
            foilWrites++;
            written = value;
            lastFoil = time;
        }
    }
    return { frames, tiltWrites, foilWrites, foilWritesPerSecond: Math.round(foilWrites / seconds) };
}
function writeModel() {
    const flight = (hz, samples) => {
        const flightMs = 520;
        return { framesInFlight: Math.round(flightMs / (1000 / hz)), foilPaints: Math.min(samples, Math.round(flightMs / (1000 / hz))) };
    };
    return {
        drag: [60, 120, 165].map(hz => ({ hz, today: dragWrites(hz, 0), held: dragWrites(hz, 33) })),
        // Today a flight's 81 keyframes interpolate, so it paints every frame. Held, it steps through 17 samples.
        flight: [60, 120, 165].map(hz => ({ hz, today: flight(hz, Infinity), held: flight(hz, 17) }))
    };
}

// ---- 4. Keyframes ----------------------------------------------------------------------------------------------------
function keyframeBench() {
    const build = stride => {
        const frames = [];
        for (let index = 0; index <= 80; index += stride) {
            const progress = index / 80, blend = progress * progress * (3 - 2 * progress);
            frames.push({ offset: progress, "--pointer-x": `${40 + 20 * blend}%`, "--pointer-y": `${40 + 20 * blend}%`,
                "--foil-pattern-x": `${42 + 16 * blend}%`, "--foil-pattern-y": `${42 + 16 * blend}%`,
                "--foil-color-opacity": .48 + .1 * blend, "--foil-glare-opacity": .3 + .1 * blend,
                "--foil-glare-x": `${blend}%`, "--foil-glare-y": `${blend}%` });
        }
        return frames;
    };
    const time = stride => {
        for (let index = 0; index < 2000; index++) { build(stride); }
        const samples = [];
        for (let index = 0; index < 2000; index++) {
            const start = process.hrtime.bigint();
            build(stride);
            samples.push(Number(process.hrtime.bigint() - start) / 1e6);
        }
        samples.sort((a, b) => a - b);
        return Math.round(samples[samples.length >> 1] * 10000) / 10000;
    };
    return { perFlightMs81Frames: time(1), perFlightMs17Frames: time(5) };
}

function main() {
    const results = { measuredAt: new Date().toISOString(), node: process.version,
        pixels: pixelModel(), sheen: sheenModel(), writes: writeModel(), keyframes: keyframeBench() };
    console.log(`Card on a OnePlus 15: ${results.pixels.cardCssPixels.join(" x ")} CSS px, ${results.pixels.cardPixels.toLocaleString("en")} device px`);
    console.log(`Frame budget: ${Object.entries(results.pixels.budgetMs).map(([hz, ms]) => `${hz} ${ms} ms`).join(", ")}`);
    for (const scene of results.pixels.scenes) {
        console.log(`${scene.name.padEnd(21)} passes ${scene.today} -> ${scene.proposed}, off-screen pixels per frame ${(scene.offscreenPixelsToday / 1e6).toFixed(1)} M -> ${(scene.offscreenPixelsProposed / 1e6).toFixed(1)} M`);
    }
    const sheen = results.sheen;
    console.log(`Sheen: factor ${sheen.factor} (stops ${sheen.stops.centre}, ${sheen.stops.middle}). Every level: worst ${sheen.worstLevels}, mean ${sheen.meanLevels} of 255. ` +
        `${sheen.colours} artwork colours in ${sheen.styles} styles: worst ${sheen.artworkWorstLevels}, mean ${sheen.artworkMeanLevels}. No glare at all: worst ${sheen.withoutGlareWorstLevels}`);
    for (const row of results.writes.drag) { console.log(`Drag at ${row.hz} Hz: foil paints/s ${row.today.foilWritesPerSecond} -> ${row.held.foilWritesPerSecond}`); }
    for (const row of results.writes.flight) { console.log(`Flight at ${row.hz} Hz: foil paints ${row.today.foilPaints} -> ${row.held.foilPaints}`); }
    console.log(`Foil keyframes per flight: ${results.keyframes.perFlightMs81Frames} ms (81) -> ${results.keyframes.perFlightMs17Frames} ms (17)`);
    const out = argument("out", null);
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(results, null, 1));
    }
}

if (require.main === module) { main(); }
module.exports = { softLight, dragWrites, sheenError };
