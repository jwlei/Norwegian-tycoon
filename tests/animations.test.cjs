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

test("play animation lasts 500ms and covers 90 percent of its distance without anticipation", () => {
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
        assert.equal(timing.duration, 500);
        assert.equal(timing.delay, index * 12);
        assert.equal(timing.fill, "both");
        assert.match(frames[0].transform, /translate\(0, 0\) rotate\(0deg\)/);
        assert.match(frames[1].transform, /translate\(180px, 180px\)/);
        assert.equal(frames[1].offset * timing.duration, 175);
        assert.match(frames[2].transform, /translate\(200px, 200px\)/);
    }
});

test("clear animation scheduling includes every serialized card and caps the stagger", () => {
    const context = load();
    assert.equal(vm.runInContext("discardAnimationMs(1)", context), 500);
    assert.equal(vm.runInContext("discardAnimationMs(52)", context), 620);
    assert.equal(vm.runInContext(`clearAnimationStartsAt({
        until: 2000, clearedPiles: [{ nick: "Owner", 0: {}, 1: {}, 2: {}, 3: {} }]
    })`, context), 1482);
});

test("animation speeds are personal, default to 500ms and fast-forward temporarily uses 300ms", () => {
    let speed = null;
    const context = load({ getCookie: () => speed });
    for (const [preference, duration] of [[null, 500], ["fast", 300], ["normal", 500], ["slow", 800]]) {
        speed = preference;
        assert.equal(vm.runInContext("animationDuration({})", context), duration);
    }
    assert.equal(vm.runInContext("animationDuration({ fastForward: true })", context), 300);
    assert.equal(vm.runInContext("animationDuration({ fastForward: false })", context), 800);
});

test("human actions unlock on local animation completion with no grace or shared observation pause", () => {
    const context = load({ window: {} });
    vm.runInContext(`
        var game = Object.assign(Object.create(PresidentGame.prototype), {
            status: "S", players: [new PresidentPlayer("Human", "owner-key")],
            turn: 0, turnPause: { id: "action", presentationVersion: 1, until: Date.now() + 10000 }
        });
    `, context);
    assert.equal(vm.runInContext("game.isTurnPaused()", context), true);
    vm.runInContext('game.presentationCompletedPauseId = "action"', context);
    assert.equal(vm.runInContext("game.isTurnPaused()", context), false);
    vm.runInContext('game.turnPause.id = "next-action"', context);
    assert.equal(vm.runInContext("game.isTurnPaused()", context), true);
});

test("bot deadlines are sampled once from 2–5 seconds and fast-forward uses exactly one second", () => {
    const context = load();
    for (const [roll, expected] of [[0, 2000], [0.5, 3500], [0.999999, 5000]]) {
        context.roll = roll;
        vm.runInContext(`
            Math.random = () => roll;
            var game = { players: [new PresidentPlayer("Bot", "PC")], turn: 0,
                turnPause: { presentationVersion: 1 } };
            preparePresentationPause(game);
        `, context);
        assert.equal(vm.runInContext("game.turnPause.botUntil - game.turnPause.startedAt", context), expected);
        const deadline = vm.runInContext("game.turnPause.botUntil", context);
        vm.runInContext("preparePresentationPause(game)", context);
        assert.equal(vm.runInContext("game.turnPause.botUntil", context), deadline);
    }
    vm.runInContext(`
        game.fastForward = true;
        game.turnPause = { presentationVersion: 1 };
        preparePresentationPause(game);
    `, context);
    assert.equal(vm.runInContext("game.turnPause.botUntil - game.turnPause.startedAt", context), 1000);
});

test("local clear completion does not mutate shared piles or wait for the reserve deadline", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let discardComplete;
    let refreshed = 0;
    const pause = {
        id: "clear", presentationVersion: 1, kind: "clear",
        until: Date.now() + 10000, clearedPiles: [{ 0: {} }]
    };
    const game = {
        turnPause: pause, getPlayer: () => null, players: [], turn: 0, connectionOnline: true
    };
    const context = vm.createContext({
        currentGame: game, currentPlayerName: "Spectator",
        document: { getElementById: () => ({ dataset: {} }) },
        GameLayout: { animateDiscardedCards: (_, done) => { discardComplete = done; } },
        refreshAfterTurnPause: () => { refreshed++; }, scheduleBotLoop() {},
        GamePresence: {}, Date
    });
    vm.runInContext(source.slice(source.indexOf("        var presentationSnapshots = [];"),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.completeLocalPresentation(game, pause);
    assert.equal(game.presentationCompletedPauseId, undefined);
    context.completeLocalPresentation(game, pause);
    discardComplete();
    assert.equal(game.presentationCompletedPauseId, "clear");
    assert.equal(refreshed, 1);
    assert.equal(pause.clearedPiles.length, 1, "Another viewer still needs the original animation data");
});

test("new snapshots queue in order while a local animation is running, without dropping actions", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const begin = source.indexOf("                var snapshotRecord = snapshot.val();",
        source.indexOf("            currentGameListener = function"));
    const end = source.indexOf("                if (snapshotRecord != null && GamePresence.isExpired", begin);
    const game = {
        status: "S", shuffleStartedAt: 123,
        turnPause: { id: "first", presentationVersion: 1 }
    };
    const context = vm.createContext({
        connectingGame: game, presentationSnapshots: [], completingPresentationId: "first", accepted: []
    });
    vm.runInContext(`function receive(snapshot) {
        ${source.slice(begin, end)}
        accepted.push(snapshotRecord.turnPause.id);
    }`, context);
    const snapshot = id => ({ val: () => ({ status: "S", shuffleStartedAt: 123, turnPause: { id } }) });
    context.receive(snapshot("second"));
    context.receive(snapshot("third"));
    assert.deepEqual(Array.from(context.presentationSnapshots, item => item.val().turnPause.id), ["second", "third"]);
    assert.equal(context.accepted.length, 0);
    game.presentationCompletedPauseId = "first";
    context.receive(context.presentationSnapshots.shift());
    context.receive(context.presentationSnapshots.shift());
    assert.deepEqual(Array.from(context.accepted), ["second", "third"]);
});

test("readiness is published only after completion and rechecks the current named seat transactionally", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { GamePresence } = vm.runInContext("({ GamePresence })", load());
    const player = { name: "Owner", playerKey: "owner-key" };
    const pause = { id: "action", presentationVersion: 1 };
    const record = {
        status: "S", turnPause: pause, sinTur: 0,
        spillere: [{ nick: "Owner", spillerKey: "owner-key" }]
    };
    let saved;
    let writes = 0;
    const game = {
        turnPause: pause, turn: 0, players: [player], getPlayer: () => player,
        databaseRef: { transaction(transform) {
            writes++;
            saved = transform(record);
            return Promise.resolve();
        } }
    };
    const context = vm.createContext({
        console, currentGame: game, currentPlayerName: player.name,
        getPlayerKey: () => player.playerKey,
        GamePresence: {
            isBot: (game, player) => GamePresence.isBot(game, player),
            playerId: player => GamePresence.playerId(player), now: () => 12345
        }
    });
    vm.runInContext(source.slice(source.indexOf("        var presentationSnapshots = [];"),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.publishPresentationReady(game, pause);
    assert.equal(writes, 0);
    game.presentationCompletedPauseId = pause.id;
    context.publishPresentationReady(game, pause);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.turnPause.until, 12345);
    assert.equal(saved.turnPause.readyAt, 12345);
    record.turnPause = { id: "new-action" };
    context.publishPresentationReady(game, pause);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved, undefined, "A delayed readiness acknowledgment cannot unlock a newer action");
});

test("automatically selected exchange cards scroll into view without playing-turn selection", () => {
    const scrolls = [];
    const context = load({
        window: { requestAnimationFrame: callback => callback() }
    });
    context.hand = {
        scrollWidth: 900, clientWidth: 300, scrollLeft: 0,
        getBoundingClientRect: () => ({ left: 0, right: 300, width: 300 }),
        querySelectorAll: selector => {
            assert.equal(selector, ".game-card.is-selected, .game-card.is-exchange-selected");
            return ["1:14", "2:14"].map((key, index) => ({
                dataset: { cardKey: key },
                getBoundingClientRect: () => ({
                    left: 700 + index * 30, right: 780 + index * 30, width: 80
                })
            }));
        }
    };
    context.recordScroll = value => scrolls.push(value);
    vm.runInContext(`
        selectedCardOwner = "game:Boms";
        selectedCardKeys.clear();
        animateHandScroll = (element, target) => recordScroll(target);
        GameLayout.centerHandSelection(hand, "game:Boms", ["1:14", "2:14"]);
    `, context);
    assert.deepEqual(scrolls, [558]);
    vm.runInContext('GameLayout.centerHandSelection(hand, "game:Boms", ["1:7"])', context);
    assert.equal(scrolls.length, 1, "A stale selection must not scroll the hand");
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
    const context = load({     document: {},
    window: { matchMedia: () => ({ matches: true }) } });
    assert.equal(vm.runInContext(`
        var completions = 0;
        GameLayout.animatePlayedCards({}, [], null, () => completions++);
        completions;
    `, context), 1);
});
