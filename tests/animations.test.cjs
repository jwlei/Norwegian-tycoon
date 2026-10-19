const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(globals = {}) {
    const context = vm.createContext({
        console, getCookie: () => null, getPlayerKey: () => "owner-key",
        localStorage: { getItem: () => null }, setTimeout: () => 0, ...globals
    });
    for (const file of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "engine.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    return context;
}

test("play animation covers 90 percent of its distance in the first 147ms without anticipation", () => {
    const animations = [];
    const image = () => ({
        style: { getPropertyValue: () => "0" },
        setAttribute() {}, remove() {},
        animate(frames, timing) {
            animations.push({ frames, timing });
            return {};
        },
        getBoundingClientRect: () => ({ left: 200, top: 200, width: 80, height: 120 })
    });
    const context = load({
        window: { innerWidth: 1000, innerHeight: 800, matchMedia: () => ({ matches: false }) },
        document: { createElement: image, body: { appendChild() {} } }
    });
    context.target = image();
    vm.runInContext(`
        var pile = new CardPile("Owner", ...[1,2,3,4].map(suit => new PresidentCard(suit, 7)));
        GameLayout.animatePlayedCards({ querySelector: () => target }, pile, {
            playerOrigins: new Map(),
            cardOrigins: new Map(pile.map(card => [card.suit + ":7",
                { left: 0, top: 0, width: 80, height: 120, rotation: 0 }]))
        });
    `, context);
    assert.equal(animations.length, 4);
    for (const [index, { frames, timing }] of animations.entries()) {
        assert.equal(timing.duration, 420);
        assert.equal(timing.delay, index * 12);
        assert.equal(timing.fill, "both");
        assert.match(frames[0].transform, /translate\(0, 0\) rotate\(0deg\)/);
        assert.match(frames[1].transform, /translate\(180px, 180px\)/);
        assert.equal(frames[1].offset * timing.duration, 147);
        assert.match(frames[2].transform, /translate\(200px, 200px\)/);
    }
});

test("clear animation scheduling includes every serialized card and caps the stagger", () => {
    const context = load();
    assert.equal(vm.runInContext("discardAnimationMs(1)", context), 300);
    assert.equal(vm.runInContext("discardAnimationMs(52)", context), 420);
    assert.equal(vm.runInContext(`clearAnimationStartsAt({
        until: 2000, clearedPiles: [{ nick: "Owner", 0: {}, 1: {}, 2: {}, 3: {} }]
    })`, context), 1682);
});

test("local actions render before the network write and remain guarded until acknowledgment", () => {
    const events = [];
    let complete;
    const context = load({
        document: { dispatchEvent: event => events.push(event.detail.phase) },
        CustomEvent: class { constructor(type, options) { this.detail = options.detail; } }
    });
    context.databaseRef = {
        transaction(transform, callback) {
            assert.deepEqual(events, ["started"]);
            complete = () => callback(null, true, { val: () => ({ status: "S", turnSeconds: 2 }) });
        }
    };
    vm.runInContext(`
        var owner = new PresidentPlayer("Owner", "owner-key");
        var game = Object.assign(Object.create(PresidentGame.prototype), {
            id: "test", status: "S", rules: {}, players: [owner], piles: [],
            round: 1, turn: 0, localPlayerName: owner.name, databaseRef,
            updatePublicListing() {}
        });
        game.recordHumanAction(owner);
        game.save();
    `, context);
    assert.equal(vm.runInContext("game.localWritePending", context), true);
    assert.throws(() => vm.runInContext("game.assertSessionActive()", context), /Venter/);
    complete();
    assert.equal(vm.runInContext("game.localWritePending", context), false);
    assert.deepEqual(events, ["started", "saved"]);
});

test("clear starts before the deadline but does not unlock the next turn early", () => {
    let now = 1000;
    const timers = [];
    const context = vm.createContext({
        currentGame: null, turnPauseRefreshTimer: null, lastShownTurnPauseId: null,
        activeToastPauseId: null, gameToastExpiresAt: 0,
        Date: { now: () => now }, clearTimeout() {},
        setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
        currentGameSpeed: () => "fast", GAME_SPEED_MS: { fast: 3000 },
        showGameToast() {},
        clearAnimationStartsAt: pause => pause.until - 300,
        completeTurnPause: () => { context.completions++; }, completions: 0
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    vm.runInContext(source.slice(source.indexOf("        function handleTurnPause("),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.currentGame = { id: "test", turnPause: {
        id: "clear", kind: "clear", until: 2000, clearedPiles: [{}]
    } };
    context.handleTurnPause(context.currentGame);
    assert.equal(timers.at(-1).delay, 700);
    now = 1500;
    context.handleTurnPause(context.currentGame);
    assert.equal(timers.at(-1).delay, 200, "A repeated snapshot must retain the clear start time");
    now = 1700;
    timers.at(-1).callback();
    assert.equal(context.completions, 1);
});

test("failed local writes notify once, release the pending guard and do not emit success", async () => {
    const events = [];
    const context = load({
        console: { error() {} },
        document: { dispatchEvent: event => events.push(event.detail.phase) },
        CustomEvent: class { constructor(type, options) { this.detail = options.detail; } }
    });
    const error = new Error("Write rejected");
    context.databaseRef = { transaction(transform, complete) {
        complete(error, false, null);
        return Promise.reject(error);
    } };
    const write = vm.runInContext(`
        var owner = new PresidentPlayer("Owner", "owner-key");
        var game = Object.assign(Object.create(PresidentGame.prototype), {
            status: "S", rules: {}, players: [owner], piles: [], localPlayerName: owner.name,
            databaseRef, updatePublicListing() {}
        });
        game.recordHumanAction(owner);
        game.save();
    `, context);
    await assert.rejects(write, /Write rejected/);
    assert.deepEqual(events, ["started", "failed"]);
    assert.equal(vm.runInContext("game.localWritePending", context), false);
});

test("reduced motion skips flights but still completes the animation lifecycle", () => {
    const context = load({ window: { matchMedia: () => ({ matches: true }) } });
    assert.equal(vm.runInContext(`
        var completions = 0;
        GameLayout.animatePlayedCards({}, [], null, () => completions++);
        completions;
    `, context), 1);
});
