const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function toastClickContext(visible) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    class Element {
        closest() { return false; }
    }
    const state = { visible, clears: 0 };
    const context = vm.createContext({
        Element, currentGame: null, currentPlayerName: null,
        selectedCardKeys: new Set(["1:5"]),
        hideGameToast: () => { state.visible = false; },
        clearCardSelection: () => { state.clears++; },
        document: { getElementById: () => ({ classList: { contains: () => state.visible } }) }
    });
    const start = source.indexOf("        function dismissGameToast()");
    const end = source.indexOf('        document.getElementById("GameToast").addEventListener', start);
    vm.runInContext(source.slice(start, end), context);
    context.event = { target: new Element() };
    return { context, state };
}

test("a table click dismisses the toast before clearing selected cards", () => {
    const { context, state } = toastClickContext(true);
    vm.runInContext("clearSelectedCardsFromBackground(event)", context);
    assert.equal(state.visible, false);
    assert.equal(state.clears, 0);
    vm.runInContext("clearSelectedCardsFromBackground(event)", context);
    assert.equal(state.clears, 1);
});

test("a direct toast dismissal never clears cards or advances the game pause", () => {
    const { context, state } = toastClickContext(true);
    context.currentGame = { turnPause: { until: 123456 } };
    vm.runInContext("dismissGameToast()", context);
    assert.equal(state.visible, false);
    assert.equal(state.clears, 0);
    assert.equal(context.currentGame.turnPause.until, 123456);
});

test("toast visibility limit is independent of animation speed and keeps at most two messages", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let visible = true;
    let clones = 0;
    let animationSpeed = "normal";
    let hideToasts = false;
    let reducedMotion = false;
    let maxVisible = "1";
    const animations = [];
    const timers = [];
    const toast = {
        getAnimations: () => [],
        animate(frames, timing) { animations.push({ frames, timing, incoming: true }); return {}; },
        textContent: "Previous",
        classList: {
            contains: () => visible,
            remove: () => { visible = false; },
            add: () => { visible = true; }
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }),
        replaceChildren() { this.textContent = ""; },
        style: { setProperty() {} },
        cloneNode() {
            clones++;
            return {
                removeAttribute() {}, setAttribute() {}, classList: { add() {} },
                remove() {},
                animate(frames, timing) { animations.push({ frames, timing, incoming: false }); return {}; },
                style: { setProperty() {} }, getBoundingClientRect: () => ({ height: 30 })
            };
        }
    };
    const region = { dataset: { animationSpeed: "normal" }, appendChild() {}, querySelectorAll: () => [] };
    const context = vm.createContext({
        currentGame: null, spectatorJoinToastTimer: null,
        getCookie: key => key == "HideGameToasts" ? String(hideToasts) :
            key == "MaxVisibleMessages" ? maxVisible : animationSpeed,
        getComputedStyle: () => ({ transform: "matrix(1, 0, 0, 1, 0, 23)" }),
        window: { matchMedia: () => ({ matches: reducedMotion }) },
        Date: { now: () => 3000 }, gameToastExpiresAt: 3000,
        gameToastTimer: null, activeToastPauseId: null, archivedToasts: [],
        GAME_SPEED_MS: { fast: 3000 }, currentGameSpeed: () => "fast",
        ensureGameLog() {}, clearTimeout() {},
        setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
        document: {
            querySelectorAll: () => [],
            getElementById: id => id === "GameToast" ? toast : id === "gameToastRegion"
                ? region : { classList: { contains: () => false } },
            body: { appendChild() {} }
        },
        gameLogNeedsTrickHeader: false, gameLogTrickCount: 0, gameLogEntries: [],
        localizedMessage: message => message, appendColoredGameMessage() {},
        game: { players: [] }
    });
    const hideStart = source.indexOf("        function gameToastsHidden(");
    const hideEnd = source.indexOf("        function resetGameLog", hideStart);
    const showStart = source.indexOf("        function showGameToast(");
    const showEnd = source.indexOf("        var receivedCardTimer", showStart);
    vm.runInContext(source.slice(hideStart, hideEnd) + source.slice(showStart, showEnd), context);
    vm.runInContext('showGameToast("Next", game)', context);
    assert.equal(clones, 0);
    assert.equal(context.gameToastExpiresAt, 6000);
    assert.equal(visible, true);
    toast.textContent = "Current";
    vm.runInContext('showGameToast("Replace without stacking", game)', context);
    assert.equal(clones, 0, "Default limit replaces the previous message");
    assert.equal(region.dataset.maxVisible, "1");
    maxVisible = "2";
    toast.textContent = "Current";
    vm.runInContext('showGameToast("Early next", game)', context);
    assert.equal(clones, 1);
    assert.equal(context.archivedToasts[0].expiresAt, 6000);
    for (const message of ["Third", "Fourth"]) {
        toast.textContent = message;
        vm.runInContext('showGameToast("New message", game)', context);
    }
    assert.equal(context.archivedToasts.length, 1, "At most two messages including the current toast");
    assert.equal(animations.filter(animation => !animation.incoming).at(-1).timing.duration, 320);
    animationSpeed = "fast";
    context.positionArchivedToasts();
    assert.equal(context.archivedToasts.length, 1, "Fast animations must honor the two-message setting");
    toast.textContent = "Current";
    const cloneCountBeforeFastReplacement = clones;
    const animationCountBeforeFastReplacement = animations.length;
    vm.runInContext('showGameToast("Fast replacement", game)', context);
    assert.equal(clones, cloneCountBeforeFastReplacement + 1);
    assert.equal(context.archivedToasts.length, 1);
    assert.equal(animations.length, animationCountBeforeFastReplacement + 2);
    assert.equal(animations.at(-1).timing.duration, 180);
    assert.equal(timers.at(-1).delay, 3000);
    reducedMotion = true;
    toast.textContent = "Current";
    const animationCount = animations.length;
    vm.runInContext('showGameToast("Reduced replacement", game)', context);
    assert.equal(context.archivedToasts.length, 1, "Reduced motion disables movement, not message stacking");
    assert.equal(animations.length, animationCount);
    maxVisible = "1";
    context.positionArchivedToasts();
    assert.equal(context.archivedToasts.length, 0, "Lowering the limit immediately clears the older message");
    assert.equal(region.dataset.maxVisible, "1");
    maxVisible = "2";
    hideToasts = true;
    const cloneCount = clones;
    const timerCount = timers.length;
    const logCount = context.gameLogEntries.length;
    context.gameLogNeedsTrickHeader = true;
    vm.runInContext('showGameToast("Hidden action", game, undefined, "pause", true)', context);
    assert.equal(visible, false);
    assert.equal(clones, cloneCount, "Hidden messages must not create archived toasts");
    assert.equal(animations.length, animationCount);
    assert.equal(timers.length, timerCount, "Hidden messages must not schedule expiry timers");
    assert.equal(context.gameToastExpiresAt, 0);
    assert.equal(context.activeToastPauseId, null);
    assert.equal(context.gameLogEntries.length, logCount + 2);
    assert.equal(context.gameLogEntries.at(-1).message, "Hidden action");
    assert.equal(context.gameLogNeedsTrickHeader, true);
    hideToasts = false;
    vm.runInContext('showGameToast("Visible again", game)', context);
    assert.equal(visible, true);
    assert.equal(timers.length, timerCount + 1);
    context.gameLogNeedsTrickHeader = true;
    const reminderLogCount = context.gameLogEntries.length;
    const reminderTrickCount = context.gameLogTrickCount;
    vm.runInContext('showGameToast("You start", game, undefined, null, false, false)', context);
    assert.equal(visible, true, "A toast-only reminder is still displayed");
    assert.equal(context.gameLogEntries.length, reminderLogCount);
    assert.equal(context.gameLogTrickCount, reminderTrickCount);
    assert.equal(context.gameLogNeedsTrickHeader, true, "A reminder must not consume the next trick header");
});

test("toast expiry fades quickly at fast speed and cancels safely when a new message arrives", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let reducedMotion = false;
    let speed = "normal";
    let visible = true;
    let active = [];
    const archived = { removed: false, remove() { this.removed = true; } };
    const toast = {
        textContent: "Message",
        classList: { contains: () => visible, remove: () => { visible = false; } },
        getAnimations: () => active,
        animate(frames, timing) {
            const animation = { effect: { target: this }, frames, timing,
                cancel() { this.cancelled = true; } };
            active.push(animation);
            return animation;
        }
    };
    const context = vm.createContext({
        window: { matchMedia: () => ({ matches: reducedMotion }) },
        archivedToasts: [], gameToastTimer: 1, activeToastPauseId: "pause", gameToastExpiresAt: 5000,
        clearTimeout() {},
        document: {
            getElementById: id => id == "GameToast" ? toast : { dataset: { animationSpeed: speed } },
            querySelectorAll: () => [archived]
        }
    });
    const start = source.indexOf("        function toastExitFrames(");
    vm.runInContext(source.slice(start, source.indexOf("        function resetGameLog(", start)), context);
    for (const preference of ["normal", "fast", "slow"]) {
        speed = preference;
        visible = true;
        toast.textContent = "Message";
        active = [];
        context.hideGameToast(false, true);
        assert.equal(visible, true, "Text must remain until its exit animation completes");
        assert.equal(toast.textContent, "Message");
        const animation = active[0];
        assert.equal(animation.timing.duration, preference == "fast" ? 180 : 320);
        if (preference == "fast") {
            assert.deepEqual(Array.from(animation.frames, frame => frame.opacity), [1, 0]);
            assert.equal(animation.timing.easing, "ease-out");
        } else {
            assert.equal(animation.frames[0].maskPosition, "0% 100%");
            assert.equal(animation.frames[1].maskPosition, "0% 0%");
            assert.equal(animation.frames[0].maskSize, "100% 300%");
        }
        assert.equal(animation.timing.fill, "forwards");
        animation.onfinish();
        assert.equal(visible, false);
        assert.equal(toast.textContent, "");
    }
    visible = true;
    active = [];
    context.hideGameToast(false, true);
    const pendingExit = active[0];
    context.hideGameToast();
    assert.equal(pendingExit.cancelled, true, "Clearing before replacement must cancel the old fade");
    assert.equal(archived.removed, true);
    visible = true;
    active = [];
    reducedMotion = true;
    context.hideGameToast(false, true);
    assert.equal(active.length, 0);
    assert.equal(visible, false);
});

test("hiding toasts persists locally, clears the stack and hides only message speed settings", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const saved = new Map();
    const button = {
        setAttribute(name, value) { this[name] = value; },
        addEventListener(type, callback) { this.click = callback; }
    };
    const speed = { hidden: false };
    const region = { hidden: false };
    const spectator = { classList: { remove(name) { this.removed = name; } } };
    let clears = 0;
    const context = vm.createContext({
        getCookie: key => saved.get(key) || "",
        setCookie: (key, value, days) => { assert.equal(days, 1000); saved.set(key, value); },
        hideGameToast: () => { clears++; },
        spectatorJoinToastTimer: 10,
        clearTimeout: id => { assert.equal(id, 10); },
        document: {
            getElementById: id => id == "hideToastsToggleButton" ? button :
                id == "spectatorJoinToast" ? spectator : region,
            querySelector: selector => { assert.equal(selector, ".setting-speed"); return speed; }
        }
    });
    const start = source.indexOf("        function gameToastsHidden(");
    vm.runInContext(source.slice(start, source.indexOf("        function hideGameToast(", start)), context);
    const listener = source.indexOf('        document.getElementById("hideToastsToggleButton").addEventListener');
    vm.runInContext(source.slice(listener, source.indexOf('        document.querySelectorAll(".speed-option[data-speed]")', listener)), context);
    assert.equal(button["aria-pressed"], "false");
    assert.equal(speed.hidden, false);
    assert.equal(region.hidden, false);
    assert.equal(clears, 0);
    saved.set("gameSpeed", "slow");
    button.click();
    assert.equal(saved.get("HideGameToasts"), "true");
    assert.equal(button["aria-pressed"], "true");
    assert.equal(speed.hidden, true);
    assert.equal(region.hidden, true);
    assert.equal(clears, 1);
    assert.equal(context.spectatorJoinToastTimer, null);
    assert.equal(spectator.classList.removed, "is-visible");
    context.updateToastVisibility();
    assert.equal(speed.hidden, true, "Reopening settings restores the saved visibility");
    button.click();
    assert.equal(saved.get("HideGameToasts"), "false");
    assert.equal(button["aria-pressed"], "false");
    assert.equal(speed.hidden, false);
    assert.equal(region.hidden, false);
    assert.equal(saved.get("gameSpeed"), "slow", "Hiding must not overwrite the saved message speed");
});

function exchangeSummaryFixture(speed = "fast") {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        var receivedCardTimer");
    const end = source.indexOf("        function refreshAfterTurnPause", start);
    const { PresidentCard, GamePresence, exchangeSummaryDuration } = loadGame();
        const element = () => ({
            hidden: true, children: [], style: { setProperty() {} },
            append(...children) { this.children.push(...children); },
            appendChild(child) { this.children.push(child); },
            replaceChildren() { this.children = []; },
            addEventListener(type, callback) { this.click = callback; }
        });
        const overlay = element();
        const content = element();
        const timers = [];
        let listener;
        const player = { name: "Recipient", playerKey: "human-key", placement: 0 };
        const game = {
            id: "room", status: "G",
            players: [{ name: "Sender", displayColor: "#123456" }, player],
            getPlayer: name => name == player.name ? player : null,
            exchangeReceipts: [
                { id: "first", recipient: "Recipient", sender: "Sender",
                    cards: [new PresidentCard(1, 5), new PresidentCard(2, 13)] },
                { id: "second", recipient: "Recipient", sender: "Sender", cards: [new PresidentCard(3, 3)] },
                { id: "other", recipient: "Other", sender: "Sender", cards: [new PresidentCard(2, 9)] }
            ]
        };
        let now = 100000;
        let transactions = 0;
        let fail = false;
        const errors = [];
        game.databaseRef = {
            transaction(update, _, local) {
                transactions++;
                assert.equal(local, false);
                if (fail) { return Promise.reject(new Error("Offline")); }
                const record = {
                    ...game, spillere: [{ nick: player.name, spillerKey: player.playerKey, plassering: 0 }]
                };
                const next = update(record);
                if (next) { game.exchangeReady = next.exchangeReady; }
                return Promise.resolve({ committed: !!next });
            }
        };
        const context = vm.createContext({
            currentGame: game, currentPlayerName: "Recipient",
            PresidentCard, GamePresence: class extends GamePresence { static now() { return now; } },
            getPlayerKey: () => "human-key",
            exchangeSummaryDuration,
            currentGameSpeed: () => speed,
            localizedMessage: message => message,
            GameLayout: { updateTable() {}, cardStyle: () => "neon", styleForPlayer: () => "neon", createCardImage: card => {
                assert.ok(card.toImageDataUri("neon").startsWith("data:image/svg+xml"));
                return element();
            } },
            appendColoredGameMessage: (target, text, players) => {
                target.textContent = text;
                assert.equal(players[0].displayColor, "#123456");
            },
            document: {
                documentElement: { lang: "nb" },
                getElementById: id => id === "receivedCardsOverlay" ? overlay : content,
                createElement: element,
                addEventListener: (type, callback) => { listener = callback; }
            },
            setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
            clearTimeout: id => { timers[id - 1].cleared = true; },
            console: { error: (...args) => errors.push(args) },
            showGameToast: text => errors.push(text)
        });
        vm.runInContext(source.slice(start, end), context);
        return { game, player, overlay, content, timers, errors, context,
            fire: () => listener({ detail: { game } }),
            begin: () => {
                game.status = "S";
                game.exchangeReady = { id: "round", startedAt: 100000, until: 107000, ready: {} };
                context.syncExchangeSummary(game);
            },
            setNow: value => { now = value; }, setFail: value => { fail = value; },
            transactions: () => transactions };
}

test("received-card summaries combine receipts after exchanges and use 3/5/7-second speed settings", async () => {
    for (const [speed, duration] of [["fast", 3000], ["normal", 5000], ["slow", 7000]]) {
        const fixture = exchangeSummaryFixture(speed);
        const { overlay, content, timers, context, game } = fixture;
        fixture.fire();
        assert.equal(overlay.hidden, true);
        fixture.begin();
        assert.equal(overlay.hidden, false);
        assert.equal(content.children[0].children.length, 2);
        assert.equal(content.children[1].textContent, "Du fikk 5 og Konge fra Sender.");
        assert.equal(content.children[2].children.length, 1);
        assert.equal(content.children[3].textContent, "Du fikk Kløver 3 fra Sender.");
        assert.equal(content.children.length, 5, "Only this recipient's cards and a Continue button");
        assert.equal(timers[0].delay, duration);
        fixture.fire();
        context.syncExchangeSummary(game);
        assert.equal(timers.length, 1);
        timers[0].callback();
        assert.equal(overlay.hidden, true);
        assert.equal(fixture.transactions(), 1);
        await new Promise(resolve => setImmediate(resolve));
        context.syncExchangeSummary(game);
        assert.equal(overlay.hidden, true, "Snapshots do not replay a completed summary");
    }
});

test("each exchange stage displays only its own receipts, including before the round starts", async () => {
    const fixture = exchangeSummaryFixture("normal");
    const { game, context, content, overlay } = fixture;
    game.exchangeReady = { id: "mandatory", startedAt: 100000, until: 107000,
        ready: {}, receiptIds: ["first"] };
    context.syncExchangeSummary(game);
    assert.equal(game.status, "G");
    assert.equal(overlay.hidden, false);
    assert.equal(content.children.length, 3);
    assert.equal(content.children[1].textContent, "Du fikk 5 og Konge fra Sender.");
    content.children.at(-1).onclick();
    await new Promise(resolve => setImmediate(resolve));
    game.exchangeReady = { id: "extra", startedAt: 100000, until: 107000,
        ready: {}, receiptIds: ["second"] };
    context.syncExchangeSummary(game);
    assert.equal(overlay.hidden, false);
    assert.equal(content.children.length, 3);
    assert.equal(content.children[1].textContent, "Du fikk Kløver 3 fra Sender.");
    content.children.at(-1).onclick();
    await new Promise(resolve => setImmediate(resolve));
    game.status = "S";
    context.syncExchangeSummary(game);
    assert.equal(overlay.hidden, true, "The final transition must not replay earlier receipts");
});

test("Continue and background dismissal mark readiness early without dismissing on card clicks", () => {
    for (const method of ["button", "background"]) {
        const fixture = exchangeSummaryFixture("slow");
        const { overlay, content, timers } = fixture;
        fixture.begin();
        overlay.click({ target: content, currentTarget: overlay });
        assert.equal(overlay.hidden, false);
        if (method == "button") { content.children.at(-1).onclick(); }
        else { overlay.click({ target: overlay, currentTarget: overlay }); }
        assert.equal(timers[0].cleared, true);
        assert.equal(overlay.hidden, true);
        assert.equal(fixture.transactions(), 1);
    }
});

test("late summaries use the shared clock and disappear when the synchronized gate ends", () => {
    const fixture = exchangeSummaryFixture("slow");
    fixture.setNow(105000);
    fixture.begin();
    assert.equal(fixture.timers[0].delay, 2000);
    fixture.game.exchangeReady = null;
    fixture.context.syncExchangeSummary(fixture.game);
    assert.equal(fixture.overlay.hidden, true);
    assert.equal(fixture.timers[0].cleared, true);
    fixture.timers[0].callback();
    assert.equal(fixture.transactions(), 0, "A stale timer cannot acknowledge another round");
});

test("spectators and players without receipts do not get a received-cards overlay", () => {
    const spectator = exchangeSummaryFixture();
    spectator.context.currentPlayerName = "Spectator";
    spectator.begin();
    assert.equal(spectator.overlay.hidden, true);
    assert.equal(spectator.transactions(), 0);
    const noCards = exchangeSummaryFixture();
    noCards.game.exchangeReceipts = [];
    noCards.begin();
    assert.equal(noCards.overlay.hidden, true);
    assert.equal(noCards.transactions(), 1);
});

test("failed exchange readiness writes are surfaced and retried without replaying the summary", async () => {
    const fixture = exchangeSummaryFixture();
    fixture.setFail(true);
    fixture.begin();
    fixture.content.children.at(-1).onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.errors.length, 2, "The failure is logged and shown to the player");
    assert.equal(fixture.overlay.hidden, true);
    fixture.context.syncExchangeSummary(fixture.game);
    assert.equal(fixture.transactions(), 1);
    fixture.setNow(101000);
    fixture.setFail(false);
    fixture.context.syncExchangeSummary(fixture.game);
    assert.equal(fixture.transactions(), 2);
});

test("receiving an exchange emits mixed-rank renderable cards before play starts", () => {
    const events = [];
    const { PresidentGame } = loadGame(null, {
        document: { dispatchEvent: event => events.push(event) },
        CustomEvent: class {
            constructor(type, options) { this.type = type; this.detail = options.detail; }
        }
    });
    const cards = [];
    cards.sortCards = () => {};
    const exchange = { from: 0, to: 1, mode: "Kan se", count: 2, cards: [
        { suit: 1, rank: 5 }, { suit: 2, rank: 13 }
    ] };
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "room", status: "G", players: [{ name: "Sender" }, { name: "Recipient", cards }],
        piles: [exchange], advanceExchangeStage() { this.status = "S"; }, save() {}
    });
    game.receiveExchangeCards(exchange);
    assert.equal(game.status, "S");
    assert.equal(game.piles.length, 0);
    assert.equal(cards.length, 2);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "exchange-cards-received");
    assert.equal(events[0].detail.recipient, "Recipient");
    assert.equal(events[0].detail.sender, "Sender");
    assert.deepEqual(Array.from(events[0].detail.cards, card => card.rank), [5, 13]);
    assert.ok(events[0].detail.cards.every(card => card.toImageDataUri("normal")));
    assert.ok(events[0].detail.cards.every(card => typeof card.isClubThree == "function"));
});

test("confirmed outgoing exchanges automatically deliver cards and start the round", () => {
    const events = [];
    const { PresidentGame, PresidentPlayer, PresidentCard } = loadGame(null, {
        document: { dispatchEvent: event => events.push(event) },
        clearTimeout() {},
        CustomEvent: class {
            constructor(type, options) { this.type = type; this.detail = options.detail; }
        }
    });
    const players = ["Sender", "Recipient"].map(name => new PresidentPlayer(name, "human-key"));
    players.forEach(player => { player.cards.sortCards = () => {}; });
    players[0].cards.push(new PresidentCard(1, 7));
    players[1].cards.push(new PresidentCard(2, 8));
    const exchanges = [{
        from: 0, to: 1, mode: "Velg", count: 1, cards: [players[0].cards[0]]
    }, {
        from: 1, to: 0, mode: "Velg", count: 1, cards: [players[1].cards[0]]
    }];
    const optionalOffer = {
        id: "optional", tradeId: "optional-trade", kind: "playerTrade",
        from: 0, to: 1, mode: "Tilbud", count: 1, cards: [], sneakyVotes: []
    };
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "auto-exchange", status: "G", round: 2, roundStarterName: null,
        players, piles: exchanges.concat(optionalOffer)
    });
    game.assertSessionActive = () => {};
    game.recordHumanAction = () => {};
    game.save = () => {};

    game.giveExchangeCards(exchanges[0]);
    assert.equal(game.piles[0].mode, "Gitt");
    assert.deepEqual(Array.from(players[1].cards, card => card.rank), [8]);
    game.giveExchangeCards(exchanges[1]);

    assert.equal(game.status, "G");
    assert.deepEqual(game.piles, [optionalOffer]);
    assert.deepEqual(Array.from(players[0].cards, card => card.rank), [8]);
    assert.deepEqual(Array.from(players[1].cards, card => card.rank), [7]);
    assert.deepEqual(events.map(event => event.type), [
        "exchange-cards-received", "exchange-cards-received"
    ]);
    assert.throws(() => game.skipOptionalTrade(optionalOffer, 0), /kan ikke avslå/);
    assert.equal(game.exchangeReady.receiptIds.length, 2);
    game.exchangeReady = null;
    game.skipOptionalTrade(optionalOffer, 0);
    assert.equal(game.status, "S");
    assert.equal(game.exchangeReady, null, "Previously summarized receipts must not replay");
    assert.equal(game.piles.length, 0);
});

function loadGame(cardStyle = null, globals = {}) {
    const context = vm.createContext({
        console, getCookie: () => null, getPlayerKey: () => "human-key", setTimeout: () => 0,
        localStorage: { getItem: () => cardStyle }, ...globals
    });
    for (const file of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "engine.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(source, context);
    }
    return vm.runInContext("({ PresidentGame, PresidentPlayer, PresidentCard, CardPile, GameLayout, GamePresence, exchangeSummaryDuration, activeTradeOffer, isLobbyHost, availablePlayerName, sanitizePlayerName, BOT_NAMES, resultIconForPlacement, assignPlayerColors, isGiftPackage, isCardAllowedForExchange, chooseSuggestedPlayStrength, isSneakyTradeAvailable, hasSneakyConsent })", context);
}

test("clearing card flights cancels and removes overlays from the page", () => {
    let cancelled = 0;
    let removed = 0;
    const flight = {
        getAnimations: () => [{ cancel: () => cancelled++ }],
        remove: () => removed++
    };
    const { GameLayout } = loadGame(null, {
        document: { querySelectorAll: selector => {
            assert.equal(selector, ".card-flight, .card-discard-flight");
            return [flight];
        } }
    });
    GameLayout.clearCardFlights();
    assert.equal(cancelled, 1);
    assert.equal(removed, 1);
});

function turnTimerFixture() {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        function updateTurnTimer()");
    const end = source.indexOf("        function refreshConnectionView()", start);
    const { GamePresence, activeTradeOffer } = loadGame();
    const elements = {
        turnTimer: { hidden: true },
        turnCountdown: { hidden: true, textContent: "" },
        extendTurnButton: { hidden: true, disabled: false }
    };
    const players = ["Owner", "Guest", "Third"].map(name => ({ name, playerKey: name }));
    const id = GamePresence.playerId(players[0]);
    let now = 80000;
    const game = {
        status: "S", turn: 0, players, getPlayer: name => players.find(player => player.name == name),
        actionDeadlines: { [id]: { until: 200000, extended: false } }
    };
    const context = vm.createContext({
        currentGame: game, currentPlayerName: "Owner",
        connection: { now: () => now }, GamePresence, activeTradeOffer,
        document: { getElementById: id => elements[id] }
    });
    vm.runInContext(source.slice(start, end), context);
    return {
        game, players, elements, id, GamePresence, context,
        set now(value) { now = value; },
        render(name = "Owner") {
            context.currentPlayerName = name;
            vm.runInContext("updateTurnTimer()", context);
            return elements;
        }
    };
}

test("all players and spectators see the active human's full 2:00 to 0:00 countdown", () => {
    const fixture = turnTimerFixture();
    for (let elapsed = 0; elapsed <= 120; elapsed++) {
        fixture.now = 80000 + elapsed * 1000;
        for (const name of ["Owner", "Guest", "Third", "Spectator"]) {
            const elements = fixture.render(name);
            const remaining = 120 - elapsed;
            assert.equal(elements.turnTimer.hidden, false);
            assert.equal(elements.turnCountdown.textContent,
                `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`);
            assert.equal(elements.extendTurnButton.hidden,
                name != "Owner" || remaining == 0 || remaining > 30);
        }
    }
    fixture.now = 201000;
    assert.equal(fixture.render().turnCountdown.textContent, "0:00");
});

test("turn timers require at least two active humans, not bots or abandoned seats", () => {
    for (const update of [
        fixture => { fixture.game.players = fixture.players.slice(0, 1); },
        fixture => { fixture.players[1].playerKey = "PC"; },
        fixture => { fixture.players[1].gaveUp = true; },
        fixture => {
            fixture.game.controllers = {
                [fixture.GamePresence.playerId(fixture.players[1])]: { reason: "idle" }
            };
        }
    ]) {
        const fixture = turnTimerFixture();
        fixture.game.players = fixture.players.slice(0, 2);
        update(fixture);
        assert.equal(fixture.render().turnTimer.hidden, true);
        assert.equal(fixture.elements.turnCountdown.hidden, true);
    }
    const fixture = turnTimerFixture();
    fixture.game.players = fixture.players.slice(0, 2);
    assert.equal(fixture.render().turnTimer.hidden, false);
});

test("turn timers show a placeholder between human turns and hide outside active games", () => {
    const fixture = turnTimerFixture();
    const { game, players, GamePresence } = fixture;
    game.turnPause = { until: 90000 };
    game.actionDeadlines = {};
    assert.equal(fixture.render().turnTimer.hidden, false);
    assert.equal(fixture.elements.turnCountdown.textContent, "–:–");
    game.turnPause = null;
    for (const status of ["O", "F", "V"]) {
        game.status = status;
        assert.equal(fixture.render().turnTimer.hidden, true);
    }
    game.status = "S";
    game.turn = 1;
    assert.equal(fixture.render().turnTimer.hidden, false);
    assert.equal(fixture.elements.turnCountdown.textContent, "–:–");
    game.actionDeadlines[GamePresence.playerId(players[1])] = { until: 180000 };
    assert.equal(fixture.render().turnCountdown.textContent, "1:40");
    game.players.push({ name: "Bot", playerKey: "PC" });
    game.turn = 3;
    game.actionDeadlines = {};
    game.actionDeadlines[GamePresence.playerId(game.players[3])] = { until: 200000 };
    assert.equal(fixture.render().turnTimer.hidden, false);
    assert.equal(fixture.elements.turnCountdown.textContent, "–:–");
});

test("exchange timers show the earliest deadline but extensions use the viewer's own deadline", () => {
    const fixture = turnTimerFixture();
    fixture.game.status = "G";
    fixture.now = 180000;
    assert.equal(fixture.render("Guest").turnCountdown.textContent, "0:20");
    assert.equal(fixture.elements.extendTurnButton.hidden, true);
    const guestId = fixture.GamePresence.playerId(fixture.players[1]);
    fixture.game.actionDeadlines[guestId] = { until: 205000 };
    assert.equal(fixture.render("Guest").turnCountdown.textContent, "0:20");
    assert.equal(fixture.elements.extendTurnButton.hidden, false);
    fixture.game.actionDeadlines[guestId].until = 240000;
    assert.equal(fixture.render("Guest").extendTurnButton.hidden, true);
    fixture.game.actionDeadlines[guestId].until = 205000;
    fixture.game.actionDeadlines[guestId].extended = true;
    assert.equal(fixture.render("Guest").extendTurnButton.hidden, true);
    fixture.game.actionDeadlines[guestId].extended = false;
    fixture.game.turnExtensions = { [guestId]: fixture.GamePresence.roundToken(fixture.game) };
    assert.equal(fixture.render("Guest").extendTurnButton.hidden, true);
    fixture.game.connectionOnline = false;
    assert.equal(fixture.render("Guest").extendTurnButton.disabled, true);
    fixture.context.currentGame = null;
    assert.equal(fixture.render().turnTimer.hidden, true);
});

test("turn countdowns and extensions wait for play, discard and shuffle animations", () => {
    for (const kind of ["play", "pass", "clear", "shuffle"]) {
        const fixture = turnTimerFixture();
        fixture.now = 180000;
        fixture.game.actionDeadlines[fixture.id].until = 200000;
        if (kind == "shuffle") {
            fixture.game.status = "G";
            fixture.game.shuffleStartedAt = 180000;
        } else {
            fixture.game.turnPause = { kind, until: 183000 };
            if (kind == "clear") { fixture.game.turnPause.clearedPiles = [{}]; }
        }
        assert.equal(fixture.render().turnCountdown.textContent, "–:–");
        assert.equal(fixture.elements.extendTurnButton.hidden, true);
        fixture.now = kind == "shuffle" ? 182999 : 183499;
        if (kind == "clear" || kind == "shuffle") {
            assert.equal(fixture.render().turnCountdown.textContent, "–:–");
        }
        fixture.now = kind == "shuffle" ? 183000 : 183500;
        if (kind == "shuffle") {
            assert.equal(fixture.render().turnCountdown.textContent, "0:17");
        }
        if (kind == "clear") {
            assert.equal(fixture.render().turnCountdown.textContent, "–:–");
            fixture.game.turnPause.clearedPiles = [];
        }
        fixture.now = 183500;
        fixture.game.actionDeadlines[fixture.id] = { until: 303500 };
        assert.equal(fixture.render().turnCountdown.textContent, "2:00");
        fixture.now = 184500;
        assert.equal(fixture.render().turnCountdown.textContent, "1:59");
    }
});

test("consent stays private and forcing waits for the receiver's explicit choice", () => {
    const element = () => {
        const classes = new Set();
        return {
            dataset: {}, children: [], textContent: "", className: "", attributes: {},
            get childElementCount() { return this.children.length; },
            classList: { add: name => classes.add(name), contains: name => classes.has(name) },
            setAttribute(name, value) { this.attributes[name] = value; },
            set innerHTML(value) { this.children = []; },
            replaceChildren(...children) { this.children = children; },
            append(...children) { this.children.push(...children); },
            appendChild(child) { this.children.push(child); }
        };
    };
    const elements = new Map();
    const document = {
        createElement: element,
        getElementById(id) {
            if (!elements.has(id)) { elements.set(id, element()); }
            return elements.get(id);
        }
    };
    const { GameLayout, PresidentGame, PresidentPlayer, PresidentCard } = loadGame(null, {
        document, setClass() {}
    });
    const players = ["Sender", "Recipient", "Other"].map((name, index) => {
        const player = new PresidentPlayer(name, `key-${index}`);
        player.lastPlacement = index + 1;
        player.cards.push(new PresidentCard(1, 14));
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "trade-ui", status: "G", round: 2, players,
        piles: [{ id: "offer", tradeId: "trade", kind: "playerTrade", mode: "Tilbud",
            from: 0, to: 1, count: 1, cards: [], sneakyVotes: [0, 1] }]
    });
    game.save = () => {};
    players[2].name = "ekrem";
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    const render = player => {
        GameLayout.updateTable(game, player);
        return flatten(document.getElementById("gameTable"));
    };
    for (const player of [null, players[2]]) {
        assert.equal(render(player).some(node => /samtykke|Sneaky/.test(node.textContent)), false);
    }
    for (const player of players.slice(0, 2)) {
        const nodes = render(player);
        const consentButton = nodes.find(node => node.textContent == "Ureglementert bytte");
        assert.ok(consentButton.className.includes("exchange-sneaky-toggle"));
        assert.equal(consentButton.attributes["aria-pressed"], "true");
        assert.equal(nodes.some(node => /samtykket|Sneaky-samtykke:/.test(node.textContent)), false);
    }
    game.piles[0].sneakyVotes = [0];
    assert.equal(render(players[1]).find(node => node.textContent == "Ureglementert bytte")
        .attributes["aria-pressed"], "false");
    game.piles[0].sneakyVotes = [0, 1];
    const originalOffer = game.piles[0];
    for (const from of [0, 1]) {
        for (const bot of [false, true]) {
            players[from].playerKey = bot ? "PC" : `key-${from}`;
            game.piles = [{ ...originalOffer, from, to: from + 1, sneakyVotes: [] }];
            const initiator = render(players[from]);
            assert.ok(initiator.some(node => node.textContent == "Tving bytte"));
            assert.ok(initiator.some(node => node.textContent == "Ingen bytte"));
            const recipient = render(players[from + 1]);
            assert.equal(recipient.some(node => node.textContent == "Tving bytte" ||
                node.textContent == "Ingen bytte"), false);
            assert.ok(recipient.some(node => node.textContent == "Ureglementert bytte"));
            assert.ok(recipient.some(node => node.textContent.includes(`${players[from].name} som`) &&
                node.textContent.includes("bestemmer om det blir bytte")));
            players[from].playerKey = `key-${from}`;
        }
    }
    game.piles = [originalOffer];
    players[2].name = "Other";
    for (const player of players.slice(0, 2)) {
        assert.equal(render(player).some(node => node.className?.includes("exchange-sneaky-toggle")), false);
    }
    players[2].name = "ekrem";
    const start = render(players[0]).find(node => node.textContent === "Tving bytte");
    assert.equal(start.disabled, false);
    start.onclick();
    assert.equal(game.piles[0].mode, "Tilbud");
    assert.ok(render(players[0]).some(node => /Venter på at Recipient/.test(node.textContent)));
    assert.ok(render(players[1]).some(node => /Sender har tvunget et bytte/.test(node.textContent)));
    assert.equal(render(players[0]).some(node => node.textContent == "Vanlig bytte"), false);
    const responses = render(players[1]);
    assert.ok(responses.some(node => node.textContent == "Vanlig bytte"));
    responses.find(node => node.textContent == "Ureglementert bytte").onclick();
    assert.ok(game.piles.every(exchange => exchange.mode == "Velg" && exchange.sneakyLocked));
    for (const player of players.slice(0, 2)) {
        assert.equal(render(player).some(node => node.className?.includes("exchange-sneaky-toggle")), false);
    }
    const bestExchange = {
        id: "best", mode: "Best", from: 2, to: 0, count: 2,
        cards: [new PresidentCard(1, 14), new PresidentCard(2, 14)]
    };
    game.piles = [bestExchange];
    const nodes = render(players[2]);
    assert.ok(nodes.some(node => node.textContent == "Du må gi dine to beste kort til Sender."));
    assert.equal(document.getElementById("playerStatus").textContent,
        "Du må gi dine to beste kort til Sender");
    const giveButton = document.getElementById("exchangeActions").children[0];
    assert.equal(giveButton.textContent, "Gi kort");
    assert.equal(giveButton.disabled, false);
    let given;
    let animated;
    const origins = {};
    GameLayout.capturePlayOrigins = () => origins;
    GameLayout.animateGivenExchangeCards = (current, exchange, captured) => {
        assert.equal(given, exchange, "Only animate after the exchange action is accepted locally");
        assert.equal(current, game);
        assert.equal(captured, origins);
        animated = exchange;
    };
    game.giveExchangeCards = exchange => { given = exchange; };
    giveButton.onclick();
    assert.equal(given, bestExchange);
    assert.equal(animated, bestExchange);
    bestExchange.count = 1;
    bestExchange.cards.pop();
    render(players[2]);
    assert.equal(document.getElementById("playerStatus").textContent,
        "Du må gi ditt beste kort til Sender");
});

function exchangeStatusFixture() {
    const element = () => ({
        dataset: {}, children: [], textContent: "", attributes: {}, style: {},
        classList: { add() {}, remove() {}, contains: () => false },
        get childElementCount() { return this.children.length; },
        setAttribute(name, value) { this.attributes[name] = value; },
        set innerHTML(value) { this.children = []; },
        replaceChildren(...children) { this.children = children; },
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); }
    });
    const elements = new Map();
    const document = {
        createElement: element,
        getElementById(id) {
            assert.notEqual(id, "exchangePrompt", "The separate overlay must not be used");
            if (!elements.has(id)) { elements.set(id, element()); }
            return elements.get(id);
        }
    };
    const { GameLayout, PresidentGame, PresidentPlayer, PresidentCard } = loadGame(null, {
        document, navigator: {}, setClass() {}
    });
    const players = ["Sender", "Recipient", "Other"].map((name, index) => {
        const player = new PresidentPlayer(name, `key-${index}`);
        player.lastPlacement = index + 1;
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "status-ui", status: "G", round: 2, players, rules: {},
        piles: [{ id: "outgoing", from: 0, to: 1, mode: "Velg", count: 2, cards: [] }]
    });
    game.save = () => {};
    GameLayout.updateHand = () => {};
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    return {
        GameLayout, PresidentCard, game, players, document,
        status: () => document.getElementById("playerStatus").textContent,
        nodes: () => flatten(document.getElementById("gameTable"))
    };
}

test("exchange status replaces the generic label for 0/2, 1/2 and 2/2 in either render order", () => {
    const { GameLayout, PresidentCard, game, players, document, status } = exchangeStatusFixture();
    const cards = [new PresidentCard(1, 7), new PresidentCard(2, 8)];
    for (const order of [["updateTable", "updatePlayerButtons"], ["updatePlayerButtons", "updateTable"]]) {
        for (let count = 0; count <= 2; count++) {
            game.piles[0].cards = cards.slice(0, count);
            for (const method of order) {
                GameLayout[method](game, players[0]);
                assert.equal(status(), `Kort til Recipient (${count}/2)`);
                assert.equal(status().includes("Bytter"), false);
            }
            const actions = document.getElementById("exchangeActions");
            assert.equal(actions.hidden, count != 2);
            if (count == 2) {
                assert.equal(actions.children[0].textContent, "Gi kort");
                assert.equal(actions.children[0].disabled, false);
                actions.children[1].onclick();
                assert.equal(status(), "Kort til Recipient (0/2)");
                assert.equal(actions.hidden, true);
            }
        }
    }
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.equal(html.includes('id="exchangePrompt"'), false);
    assert.equal((html.match(/id="playerStatus"/g) || []).length, 1);
});

test("recipient selection and fresh snapshots update the same exchange status", () => {
    const { GameLayout, game, players, nodes, status } = exchangeStatusFixture();
    game.piles.push({ id: "other", from: 0, to: 2, mode: "Velg", count: 1, cards: [] });
    GameLayout.updatePlayerButtons(game, players[0]);
    assert.equal(status(), "Velg hvilket bytte du vil gjøre");
    GameLayout.updateTable(game, players[0]);
    nodes().find(node => node.textContent == "Velg bytte til Other").onclick();
    assert.equal(status(), "Kort til Other (0/1)");
    GameLayout.updatePlayerButtons(game, players[0]);
    assert.equal(status(), "Kort til Other (0/1)");
    nodes().find(node => node.textContent == "Velg bytte til Recipient").onclick();
    assert.equal(status(), "Kort til Recipient (0/2)");
    game.piles = game.piles.map(exchange => ({ ...exchange, cards: [{}] }));
    GameLayout.updatePlayerButtons(game, players[0]);
    assert.equal(status(), "Kort til Recipient (1/2)");
    GameLayout.updateTable(game, players[0]);
    assert.equal(status(), "Kort til Recipient (1/2)");
});

test("exchange status covers mandatory, optional, received, spectator and waiting states", () => {
    const { GameLayout, game, players, status } = exchangeStatusFixture();
    const render = (expected, player = players[0]) => {
        for (const method of ["updatePlayerButtons", "updateTable", "updatePlayerButtons"]) {
            GameLayout[method](game, player);
            assert.equal(status(), expected);
        }
    };
    game.piles[0].mode = "Best";
    render("Du må gi dine to beste kort til Recipient");
    game.piles[0].count = 1;
    render("Du må gi ditt beste kort til Recipient");
    game.piles[0].mode = "Gitt";
    render("Kort til Recipient (0/1)");
    game.piles[0].mode = "Kan se";
    render("Motta kortene som venter", players[1]);
    game.piles[0].mode = "Tilbud";
    render("Tving bytte eller velg Ingen bytte");
    game.piles[0].forcedAt = 123;
    render("Venter på mottakerens valg av bytte.", players[1]);
    game.piles[0].mode = "Velg";
    render("1 bytte gjenstår", null);
    render("1 bytte gjenstår", players[2]);
    game.exchangeReady = { id: "receipt" };
    render("Venter på at spillerne bekrefter mottatte kort …");
    game.exchangeReady = null;
    game.piles = [];
    render("Venter på at byttene fullføres");
});

test("exchange status clears on shuffle, normal play, round end, lobby and no game", () => {
    const { GameLayout, game, players, status } = exchangeStatusFixture();
    for (const next of ["shuffle", "S", "F", "O", null]) {
        game.status = "G";
        game.shuffleStartedAt = null;
        GameLayout.updateTable(game, players[0]);
        assert.equal(status(), "Kort til Recipient (0/2)");
        if (next == "shuffle") {
            game.shuffleStartedAt = Date.now();
            GameLayout.updateTable(game, players[0]);
            assert.equal(status(), "");
        } else if (next != null) {
            game.status = next;
        }
        GameLayout.updatePlayerButtons(next == null ? null : game, players[0]);
        assert.equal(status(), "");
    }
});

function forcedTradeUiFixture(eligible) {
    const element = () => {
        const classes = new Set();
        return {
            dataset: {}, children: [], textContent: "", className: "", attributes: {},
            get childElementCount() { return this.children.length; },
            classList: { add: name => classes.add(name), contains: name => classes.has(name) },
            setAttribute(name, value) { this.attributes[name] = value; },
            set innerHTML(value) { this.children = []; },
            replaceChildren(...children) { this.children = children; },
            append(...children) { this.children.push(...children); },
            appendChild(child) { this.children.push(child); }
        };
    };
    const elements = new Map();
    const document = {
        createElement: element,
        getElementById(id) {
            if (!elements.has(id)) { elements.set(id, element()); }
            return elements.get(id);
        }
    };
    const loaded = loadGame(null, { document, setClass() {} });
    const { GameLayout, PresidentGame, PresidentPlayer, PresidentCard } = loaded;
    const players = ["Sender", "Recipient", eligible ? "ekrem" : "Other"].map((name, index) => {
        const player = new PresidentPlayer(name, `key-${index}`);
        player.lastPlacement = index + 1;
        player.cards.push(new PresidentCard(1, 9), new PresidentCard(2, 14));
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "trade-ui", status: "G", round: 2, players,
        piles: [{ id: "offer", tradeId: "trade", kind: "playerTrade", mode: "Tilbud",
            from: 0, to: 1, count: 1, cards: [], sneakyVotes: [] }]
    });
    game.save = () => {};
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    const render = player => {
        GameLayout.updateTable(game, player);
        return flatten(document.getElementById("gameTable"));
    };
    return { ...loaded, game, players, render };
}

test("unavailable Sneaky is never mentioned or offered in any trade view", () => {
    const { game, players, render, isSneakyTradeAvailable } = forcedTradeUiFixture(false);
    assert.equal(isSneakyTradeAvailable(game), false);
    const mentionsSneaky = nodes => nodes.some(node =>
        /ureglementert|sneaky/i.test(`${node.textContent} ${node.title || ""} ${node.className || ""} ` +
            Object.values(node.attributes || {}).join(" ")));
    for (const viewer of [null, ...players]) {
        assert.equal(mentionsSneaky(render(viewer)), false, "Unforced offers stay normal-only");
    }
    const start = render(players[0]).find(node => node.textContent == "Tving bytte");
    assert.equal(start.disabled, false);
    start.onclick();
    assert.ok(game.piles[0].forcedAt != null);
    const sender = render(players[0]);
    const recipient = render(players[1]);
    const observer = render(players[2]);
    for (const nodes of [sender, recipient, observer, render(null)]) {
        assert.equal(mentionsSneaky(nodes), false, "Forced offers stay normal-only");
    }
    assert.ok(sender.some(node => node.textContent == "Venter på at Recipient bekrefter vanlig bytte."));
    assert.ok(recipient.some(node =>
        node.textContent == "Sender har tvunget et bytte. Bekreft vanlig bytte med kort 7–J."));
    assert.ok(observer.some(node => node.textContent == "Sender har tvunget et bytte med Recipient."));
    assert.equal(sender.some(node => node.textContent == "Vanlig bytte"), false);
    const responses = recipient.filter(node => node.textContent == "Vanlig bytte");
    assert.equal(responses.length, 1);
    assert.notEqual(responses[0].disabled, true);
    responses[0].onclick();
    assert.ok(game.piles.every(exchange => exchange.mode == "Velg" && exchange.receiverChoice == null));
    for (const viewer of [null, ...players]) {
        const nodes = render(viewer);
        assert.equal(mentionsSneaky(nodes), false, "The running trade stays normal-only");
    }
    assert.ok(render(players[0]).some(node => node.textContent == "Vanlig bytte: kort 7–J."));
});

test("eligible games keep the forced Sneaky choice and wording", () => {
    const { game, players, render, isSneakyTradeAvailable } = forcedTradeUiFixture(true);
    assert.equal(isSneakyTradeAvailable(game), true);
    assert.ok(render(players[0]).some(node => node.textContent.includes("Om begge velger ureglementert bytte")));
    render(players[0]).find(node => node.textContent == "Tving bytte").onclick();
    assert.ok(render(players[0]).some(node =>
        node.textContent == "Venter på at Recipient velger ureglementert eller vanlig bytte."));
    const recipient = render(players[1]);
    assert.ok(recipient.some(node => node.textContent == "Sender har tvunget et bytte. Ureglementert bytte?"));
    const sneaky = recipient.find(node => node.textContent == "Ureglementert bytte");
    assert.notEqual(sneaky.disabled, true);
    assert.ok(recipient.some(node => node.textContent == "Vanlig bytte"));
    sneaky.onclick();
    assert.ok(game.piles.every(exchange => exchange.mode == "Velg"));
    assert.deepEqual(Array.from(game.piles[0].sneakyVotes).sort(), [1]);
});

test("the President can start a normal voluntary exchange without sneaky consent", () => {
    const {
        PresidentGame, PresidentPlayer, PresidentCard, isCardAllowedForExchange
    } = loadGame();
    const players = ["President", "Neutral", "Boms"].map((name, index) => {
        const player = new PresidentPlayer(name, `key-${index}`);
        player.lastPlacement = index + 1;
        player.cards.push(new PresidentCard(index + 1, index + 7));
        return player;
    });
    const offer = {
        id: "ordinary-offer", tradeId: "ordinary-trade", kind: "playerTrade",
        from: 0, to: 1, count: 1, mode: "Tilbud", cards: [], sneakyVotes: []
    };
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        status: "G", round: 2, players, piles: [offer]
    });
    game.assertSessionActive = () => {};
    game.recordHumanAction = () => {};
    game.save = () => {};
    game.update = () => {};

    game.startOptionalTrade(offer);
    assert.equal(game.piles[0].mode, "Tilbud");
    game.respondToForcedTrade(offer, 1, false);

    assert.equal(game.piles.length, 2);
    assert.ok(game.piles.every(exchange => exchange.mode === "Velg"));
    assert.ok(game.piles.every(exchange => exchange.sneakyVotes.length === 0));
    assert.ok(game.piles.every(exchange => isCardAllowedForExchange(exchange, new PresidentCard(1, 7))));
    assert.ok(game.piles.every(exchange => !isCardAllowedForExchange(exchange, new PresidentCard(1, 14))));
    assert.throws(() => game.toggleSneakyTrade(game.piles[0], 0), /ikke tilgjengelig/);
    players[2].name = "joachim";
    assert.throws(() => game.toggleSneakyTrade(game.piles[0], 0), /kan ikke endres/);
    assert.ok(game.piles.every(exchange => !isCardAllowedForExchange(exchange, new PresidentCard(1, 14))));
});

test("sneaky requires exactly three players and a named human, including a non-participating third player", () => {
    const { isSneakyTradeAvailable, hasSneakyConsent, isCardAllowedForExchange, PresidentCard } = loadGame();
    const offer = { kind: "playerTrade", from: 0, to: 1, sneakyVotes: [0, 1] };
    const game = { players: [
        { name: "Bot", playerKey: "PC" }, { name: "Guest", playerKey: "guest" },
        { name: "Other", playerKey: "other" }
    ] };
    for (const name of ["tåkefyrsten", "h4cker", "mrhotbox", "bjørn", "ekrem", "joachim",
        " TÅKEFYRSTEN ", "Ta\u030akefyrsten", "H4CKER"]) {
        game.players[2].name = name;
        assert.equal(isSneakyTradeAvailable(game), true);
        assert.equal(hasSneakyConsent(offer, game), true);
        assert.equal(isCardAllowedForExchange(offer, new PresidentCard(1, 14), game), true);
        game.players[2].playerKey = "PC";
        assert.equal(isSneakyTradeAvailable(game), false, "Bot names cannot grant access");
        assert.equal(hasSneakyConsent(offer, game), false, "Stale votes cannot bypass eligibility");
        assert.equal(isCardAllowedForExchange(offer, new PresidentCard(1, 14), game), false);
        game.players[2].playerKey = "other";
    }
    for (const name of ["hacker", "h4cker-1", "Guest", ""]) {
        game.players[2].name = name;
        assert.equal(isSneakyTradeAvailable(game), false);
    }
    game.players[2].name = "ekrem";
    game.players.push({ name: "Fourth", playerKey: "fourth" });
    assert.equal(isSneakyTradeAvailable(game), false);
    game.players.splice(1, 2);
    game.players[1].name = "ekrem";
    assert.equal(isSneakyTradeAvailable(game), false);
});

test("a playable club three is suggested to clear a single-card trick before the final card", () => {
    const { PresidentCard, chooseSuggestedPlayStrength } = loadGame();
    const clubThree = new PresidentCard(3, 3);
    const player = { cards: [clubThree, new PresidentCard(1, 12)] };

    assert.equal(
        chooseSuggestedPlayStrength(player, [new PresidentCard(1, 8)], new Set([12, 16]), 1),
        PresidentCard.clubThreePower()
    );
});

test("club three is suggested before the only other combination on empty, single and grouped tables", () => {
    const { PresidentCard, chooseSuggestedPlayStrength } = loadGame();
    const club = new PresidentCard(3, 3);
    for (const rank of [3, 5, 2]) {
        for (const count of [1, 2, 3, 4]) {
            const suits = rank == 3 ? [1, 2, 4] : [1, 2, 3, 4];
            if (count > suits.length) { continue; }
            const rest = suits.slice(0, count).map(suit => new PresidentCard(suit, rank));
            const strength = rest[0].strengthRank;
            for (const top of [null, [new PresidentCard(1, 4)],
                [new PresidentCard(1, 4), new PresidentCard(2, 4)],
                [1, 2, 3, 4].map(suit => new PresidentCard(suit, 4))]) {
                const required = top?.length || 1;
                const player = { cards: [club, ...rest] };
                assert.equal(chooseSuggestedPlayStrength(player, top, new Set([strength, 16]), required), 16);
                assert.equal(chooseSuggestedPlayStrength(player, top, new Set([strength]), required), strength,
                    "An unavailable club three must never be suggested");
                assert.equal(chooseSuggestedPlayStrength(player, top, new Set(), required), undefined);
            }
        }
    }
    assert.equal(chooseSuggestedPlayStrength({
        cards: [club, new PresidentCard(1, 5), new PresidentCard(2, 6)]
    }, null, new Set([5, 6, 16]), 1), 5, "Multiple remaining combinations retain the normal suggestion");
    assert.equal(chooseSuggestedPlayStrength({
        cards: [new PresidentCard(1, 5), new PresidentCard(2, 5)]
    }, null, new Set([5]), 1), 5);
});

test("single threes favor ordinary singles, then the lowest legal triple over club three", () => {
    const { PresidentCard, chooseSuggestedPlayStrength } = loadGame();
    const top = [new PresidentCard(1, 3)];
    const club = new PresidentCard(3, 3);
    const triple = rank => [1, 2, 4].map(suit => new PresidentCard(suit, rank));
    const suggest = (cards, ranks) =>
        chooseSuggestedPlayStrength({ cards: [club, ...cards] }, top, new Set([16, ...ranks]), 1);

    assert.equal(suggest([new PresidentCard(1, 4), new PresidentCard(1, 8)], [4, 8]), 4);
    assert.equal(suggest([...triple(4), new PresidentCard(1, 8)], [4, 8]), 8);
    assert.equal(suggest([...triple(5), ...triple(7)], [5, 7]), 5);
    assert.equal(suggest([...triple(5), ...triple(7)], [7]), 7);
    assert.equal(suggest([new PresidentCard(1, 4), new PresidentCard(2, 4), ...triple(5)], [4, 5]), 5);
    assert.equal(suggest(triple(5), [5]), 16);
    assert.equal(suggest([], []), 16);
    assert.equal(chooseSuggestedPlayStrength(
        { cards: triple(5) }, top, new Set(), 1
    ), undefined);
});

test("skipped extra trades notify only the recipient once without being replaced by the starter notice", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        function receiveSkippedTrades(");
    const end = source.indexOf("        function notifyStartedTrades(", start);
    for (const recipient of ["Neutral", "Boms"]) {
        const messages = [];
        const context = vm.createContext({
            currentPlayerName: recipient,
            showGameToast: (message, game) => messages.push({ message, status: game.status })
        });
        vm.runInContext(source.slice(start, end), context);
        const game = { status: "G" };
        const previous = { id: "old", sender: "Previous", recipient };
        context.receiveSkippedTrades(game, [previous]);
        assert.equal(messages.length, 0, "Opening an existing game must not replay old decisions");
        const trade = { id: "new", sender: recipient == "Neutral" ? "President" : "Neutral", recipient };
        const unrelated = { id: "other", sender: "Other", recipient: "Spectator" };
        game.status = recipient == "Boms" ? "S" : "G";
        context.receiveSkippedTrades(game, [previous, trade, unrelated]);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].message, `${trade.sender} valgte å ikke gjennomføre ekstra bytte med deg.`);
        assert.equal(messages[0].status, game.status, "The final skip must notify even after exchange status ends");
        context.receiveSkippedTrades(game, [previous, trade, unrelated]);
        assert.equal(messages.length, 1);
        assert.equal(game.skippedTrades.length, 3);
    }
    const receive = source.indexOf("receiveSkippedTrades(connectingGame, snapshotRecord.skippedTrades");
    assert.ok(receive >= 0);
    const listener = source.slice(source.indexOf("currentGameListener = function (snapshot)"));
    assert.ok(listener.indexOf("flashRoundStarter();") < listener.indexOf("receiveSkippedTrades(connectingGame"),
        "The skip feedback must stay visible even with fast animations when play starts");
    assert.ok(listener.indexOf("receiveSkippedTrades(connectingGame") < listener.indexOf("scheduleBotLoop();"));
});

test("trade start toasts report either outcome once and only to participants", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        function notifyStartedTrades(");
    const end = source.indexOf("        function showGameToast(", start);
    for (const consent of [false, true]) {
        const messages = [];
        const context = vm.createContext({
            currentPlayerName: "Other", hasSneakyConsent: () => consent,
            showGameToast: message => messages.push(message)
        });
        vm.runInContext(source.slice(start, end), context);
        context.game = {
            status: "G", round: 1, shuffleStartedAt: 100,
            players: [{ name: "Sender" }, { name: "Recipient" }, { name: "Other" }],
            piles: [{ kind: "playerTrade", tradeId: "trade", from: 0, to: 1, mode: "Tilbud" }]
        };
        vm.runInContext("notifyStartedTrades(game)", context);
        context.game.piles[0].mode = "Velg";
        context.game.piles.push({ ...context.game.piles[0], from: 1, to: 0 });
        vm.runInContext("notifyStartedTrades(game)", context);
        assert.equal(messages.length, 0);
        context.currentPlayerName = "Recipient";
        vm.runInContext("notifyStartedTrades(game); notifyStartedTrades(game)", context);
        assert.equal(messages.length, 1);
        if (consent) {
            assert.equal(messages[0], "Ureglementert bytte: alle kort kan brukes.");
        } else {
            assert.match(messages[0], /Vanlig bytte.*7–J/);
        }
    }
});

test("mutual sneaky consent after trade initiation produces one additional participant toast", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        function notifyStartedTrades(");
    const end = source.indexOf("        function showGameToast(", start);
    const messages = [];
    const context = vm.createContext({
        currentPlayerName: "Sender",
        hasSneakyConsent: exchange => exchange.sneakyVotes.length === 2,
        showGameToast: message => messages.push(message),
        game: {
            status: "G", round: 1, shuffleStartedAt: 100,
            players: [{ name: "Sender" }, { name: "Recipient" }, { name: "Other" }],
            piles: [0, 1].map(from => ({
                kind: "playerTrade", tradeId: "trade", from, to: 1 - from,
                mode: "Velg", sneakyVotes: []
            }))
        }
    });
    vm.runInContext(source.slice(start, end), context);
    const notify = () => vm.runInContext("notifyStartedTrades(game)", context);
    notify();
    assert.equal(messages.length, 1);
    context.game.piles.forEach(exchange => { exchange.sneakyVotes = [0]; });
    notify();
    assert.equal(messages.length, 1);
    context.currentPlayerName = "Other";
    context.game.piles.forEach(exchange => { exchange.sneakyVotes = [0, 1]; });
    notify();
    assert.equal(messages.length, 1);
    context.currentPlayerName = "Sender";
    notify();
    notify();
    assert.equal(messages.length, 2);
    assert.equal(messages[1], "Ureglementert bytte: alle kort kan brukes.");
});

function savedPreferencesContext(cookieMode = "enabled", storage = new Map(), storageBlocked = false) {
    const cookies = new Map();
    const elements = new Map();
    const document = {
        documentElement: { dataset: {} },
        get cookie() {
            if (cookieMode === "throws") { throw new Error("Cookies unavailable"); }
            return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
        },
        set cookie(value) {
            if (cookieMode === "throws") { throw new Error("Cookies unavailable"); }
            if (cookieMode !== "enabled") { return; }
            const pair = value.split(";")[0];
            const split = pair.indexOf("=");
            cookies.set(pair.slice(0, split), pair.slice(split + 1));
        },
        getElementById(id) {
            if (!elements.has(id)) { elements.set(id, {}); }
            return elements.get(id);
        }
    };
    const { sanitizePlayerName } = loadGame();
    const context = vm.createContext({
        console, document, crypto: require("node:crypto").webcrypto,
        window: { location: { protocol: "https:" } },
        localStorage: {
            getItem(key) {
                if (storageBlocked) { throw new Error("Storage unavailable"); }
                return storage.get(key) ?? null;
            },
            setItem(key, value) {
                if (storageBlocked) { throw new Error("Storage unavailable"); }
                storage.set(key, value);
            }
        },
        currentGame: null, playerNameCookie: "norwegian_tycoon_player_name",
        GameLayout: { cardStyle: () => "normal" }, sanitizePlayerName,
        PlayerIdentity: { normalizeName: name => name.trim().normalize("NFC").toLowerCase() }
    });
    const shared = fs.readFileSync(path.join(__dirname, "..", "js", "shared.js"), "utf8");
    vm.runInContext(shared.slice(shared.indexOf("var savedCookieValues"),
        shared.indexOf("function hasClass")) +
        shared.slice(shared.indexOf("function generatePlayerKey()"),
            shared.indexOf("function initializeThemeToggle()")), context);
    const connection = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    vm.runInContext(connection.slice(connection.indexOf("        function readLastUsedPlayerName()"),
        connection.indexOf("        function promptForPlayerName(")), context);
    return context;
}

test("saved names, preferences and player keys survive reloads without cookies", () => {
    for (const cookieMode of ["enabled", "ignored", "throws"]) {
        const storage = new Map();
        const context = savedPreferencesContext(cookieMode, storage);
        const key = context.getPlayerKey();
        assert.match(key, /^[A-Za-z0-9]{6}$/);
        assert.equal(context.getPlayerKey(), key);
        context.saveLastUsedPlayerName("Bjørn / ギフテッド 😎");
        context.setCookie("AutoSuggestPlayableCards", "false", 365);
        assert.equal(context.readLastUsedPlayerName(), "Bjørn / ギフテッド 😎");
        assert.equal(context.document.getElementById("splashPlayerName").textContent, "Bjørn / ギフテッド 😎");
        const reloaded = savedPreferencesContext(cookieMode, storage);
        assert.equal(reloaded.getPlayerKey(), key);
        assert.equal(reloaded.readLastUsedPlayerName(), "Bjørn / ギフテッド 😎");
        assert.equal(reloaded.getCookie("AutoSuggestPlayableCards"), "false");
    }
});

test("player identity and preferences stay usable when all persistent storage is unavailable", () => {
    for (const cookieMode of ["ignored", "throws"]) {
        const context = savedPreferencesContext(cookieMode, new Map(), true);
        const key = context.getPlayerKey();
        context.saveLastUsedPlayerName("Ada");
        context.setCookie("AutoSuggestPlayableCards", "false", 365);
        assert.equal(context.getPlayerKey(), key);
        assert.equal(context.readLastUsedPlayerName(), "Ada");
        assert.equal(context.getCookie("AutoSuggestPlayableCards"), "false");
    }
});

test("existing cookies are preserved and malformed saved names do not stop startup", () => {
    const context = savedPreferencesContext();
    context.document.cookie = "SpillerKey=existing-key";
    context.document.cookie = `norwegian_tycoon_player_name=${encodeURIComponent("ギフテッド")}`;
    assert.equal(context.getPlayerKey(), "existing-key");
    assert.equal(context.readLastUsedPlayerName(), "ギフテッド");
    context.document.cookie = "norwegian_tycoon_player_name=%invalid";
    context.console = { warn() {} };
    assert.equal(context.readLastUsedPlayerName(), "");
});

test("splash only displays the matching player ID after a remembered PIN login", () => {
    const storage = new Map();
    const context = savedPreferencesContext("ignored", storage);
    const key = context.getPlayerKey();
    context.saveLastUsedPlayerName("Ada");
    const splash = context.document.getElementById("splashPlayerName");
    assert.equal(splash.textContent, "Ada");
    context.setCookie("playerPinProfile", encodeURIComponent(JSON.stringify(["ada", key])), 1000);
    context.updateSavedPlayerName();
    assert.equal(splash.textContent, `Ada · ID ${key}`);
    const reloaded = savedPreferencesContext("ignored", storage);
    reloaded.updateSavedPlayerName();
    assert.equal(reloaded.document.getElementById("splashPlayerName").textContent, `Ada · ID ${key}`);
    context.setCookie("SpillerKey", "Other1", 1000);
    context.updateSavedPlayerName();
    assert.equal(splash.textContent, "Ada");
    context.setCookie("SpillerKey", key, 1000);
    context.saveLastUsedPlayerName("Grace");
    assert.equal(splash.textContent, "Grace");
    context.saveLastUsedPlayerName("");
    assert.equal(splash.textContent, "");
    assert.equal(splash.hidden, true);
});

test("splash and loaded leaderboard share the exact case-sensitive ID for each identity", async () => {
    const context = savedPreferencesContext();
    const records = {
        AZaz09: { name: "Ada", lastActiveAt: 2, roundsPlayed: 20 },
        aZAZ90: { name: "Grace", lastActiveAt: 1, roundsPlayed: 10 }
    };
    context.PlayerIdentity.isDefaultName = () => false;
    context.firebase = { database: () => ({ ref(name) {
        assert.equal(name, "playerStats");
        return {
            orderByChild() { return this; },
            limitToLast() { return this; },
            async once() {
                return { forEach(callback) {
                    for (const [key, record] of Object.entries(records)) {
                        callback({ key, val: () => record });
                    }
                } };
            }
        };
    } }) };
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "leaderboard.js"), "utf8");
    vm.runInContext(source.slice(0, source.indexOf("function initializeLeaderboard()")), context);
    const rows = await vm.runInContext("PlayerLeaderboard.load()", context);
    for (const record of rows) {
        context.setCookie("SpillerKey", record.id, 1000);
        context.setCookie("playerPinProfile",
            encodeURIComponent(JSON.stringify([record.name.toLowerCase(), record.id])), 1000);
        context.saveLastUsedPlayerName(record.name);
        assert.equal(context.document.getElementById("splashPlayerName").textContent,
            `${record.name} · ID ${record.id}`);
        assert.equal(context.getPlayerKey(), record.id);
        assert.match(record.id, /^[A-Za-z0-9]{6}$/);
    }
});

test("PIN recovery displays legacy IDs without shortening them or changing their identity", () => {
    const context = savedPreferencesContext();
    const key = "x".repeat(50);
    context.setCookie("SpillerKey", key, 1000);
    context.setCookie("playerPinProfile", encodeURIComponent(JSON.stringify(["bjørn / ギフテッド 😎", key])), 1000);
    context.saveLastUsedPlayerName("Bjørn / ギフテッド 😎");
    assert.equal(context.getPlayerKey(), key);
    assert.equal(context.document.getElementById("splashPlayerName").textContent, `Bjørn / ギフテッド 😎 · ID ${key}`);
});

test("short ID generation excludes biased bytes and keeps letters and digits case-sensitive", () => {
    const context = savedPreferencesContext();
    context.crypto = {
        getRandomValues(bytes) {
            bytes.set([248, 255, 0, 25, 26, 51, 52, 61, 1, 1, 1, 1]);
            return bytes;
        }
    };
    assert.equal(context.generatePlayerKey(), "AZaz09");
});

test("theme controls still initialize and work when local storage is blocked", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "shared.js"), "utf8");
    let click;
    const button = {
        querySelector: () => null, setAttribute() {},
        addEventListener(type, handler) { click = handler; }
    };
    const root = { dataset: {} };
    const context = vm.createContext({
        document: {
            documentElement: root, querySelectorAll: () => [button], querySelector: () => null,
            addEventListener() {}
        },
        window: { addEventListener() {} },
        localStorage: {
            getItem() { throw new Error("Storage unavailable"); },
            setItem() { throw new Error("Storage unavailable"); }
        }
    });
    vm.runInContext(source.slice(source.indexOf("function initializeThemeToggle()"),
        source.indexOf('if (document.readyState === "loading")')), context);
    context.initializeThemeToggle();
    assert.equal(root.dataset.theme, "dark");
    click();
    assert.equal(root.dataset.theme, "light");
});

function colorThemeContext(storage = new Map(), storageBlocked = false) {
    const context = savedPreferencesContext("ignored", storage, storageBlocked);
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const options = Array.from(html.matchAll(/class="color-theme-option" data-color-theme="([^"]+)"[^>]*>.*?<strong>([^<]+)<\/strong>/g),
        ([, theme, name]) => ({
            dataset: { colorTheme: theme }, pressed: null,
            setAttribute(key, value) { if (key === "aria-pressed") { this.pressed = value; } },
            addEventListener(type, callback) { this[type] = callback; },
            querySelector(selector) {
                return selector === "strong" ? { textContent: name } : { cloneNode: () => ({ theme }) };
            }
        }));
    const elements = {
        colorThemeCurrent: { replaceChildren(preview) { this.preview = preview; } },
        colorThemeCurrentName: {},
        colorThemeOpenButton: { addEventListener(type, callback) { this[type] = callback; } },
        colorThemeCloseButton: { addEventListener(type, callback) { this[type] = callback; } }
    };
    const events = {};
    const dialogs = [];
    context.document.querySelectorAll = () => options;
    context.document.getElementById = id => elements[id];
    context.document.addEventListener = (type, callback) => { events[type] = callback; };
    context.document.dispatchEvent = event => { events[event.type]?.(event); };
    context.CustomEvent = class { constructor(type) { this.type = type; } };
    context.window.addEventListener = (type, callback) => { events[type] = callback; };
    context.showDialog = (name, visible) => dialogs.push([name, visible]);
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "shared.js"), "utf8");
    vm.runInContext(source.slice(source.indexOf("function initializeColorTheme()"),
        source.indexOf('if (document.readyState === "loading")')), context);
    context.initializeColorTheme();
    return { context, options, elements, events, dialogs };
}

test("all twenty color themes have previews and persist without cookies", () => {
    const storage = new Map();
    const { context, options, elements } = colorThemeContext(storage);
    assert.deepEqual(options.map(option => option.dataset.colorTheme),
        ["amoled", "gray", "burgundy", "darcula", "high-contrast-amber", "amber", "classic",
            "monokai", "forest", "teal", "material", "solarized", "nord", "dark-modern", "blue", "one-dark",
            "high-contrast-blue", "gradianto", "amethyst", "high-contrast-violet"]);
    assert.equal(context.document.documentElement.dataset.colorTheme, "teal");
    context.document.documentElement.dataset.theme = "light";
    for (const option of options) {
        option.click();
        const theme = option.dataset.colorTheme;
        assert.equal(context.document.documentElement.dataset.colorTheme, theme);
        assert.equal(context.document.documentElement.dataset.theme, "light");
        assert.equal(options.filter(candidate => candidate.pressed === "true").length, 1);
        assert.equal(option.pressed, "true");
        assert.equal(elements.colorThemeCurrent.preview.theme, theme);
        assert.equal(elements.colorThemeCurrentName.textContent, option.querySelector("strong").textContent);
        assert.equal(colorThemeContext(storage).context.document.documentElement.dataset.colorTheme, theme);
    }
});

test("color themes remain usable with blocked storage, validate saved values and update translated labels", () => {
    const { context, options, elements, events, dialogs } = colorThemeContext(new Map(), true);
    elements.colorThemeOpenButton.click();
    assert.deepEqual(dialogs.splice(0), [["Innstillinger", false], ["Fargetema", true]]);
    options.find(option => option.dataset.colorTheme === "forest").click();
    assert.equal(context.getCookie("ColorTheme"), "forest");
    assert.deepEqual(dialogs.splice(0), [["Fargetema", false], ["Innstillinger", true]]);
    context.window.I18n = { msg: name => name === "Skoggrønn" ? "Forest green" : name };
    events.languagechange();
    assert.equal(elements.colorThemeCurrentName.textContent, "Forest green");
    elements.colorThemeCloseButton.click();
    assert.deepEqual(dialogs.splice(0), [["Fargetema", false], ["Innstillinger", true]]);
    events.storage({ key: "norwegian-tycoon-cookie-ColorTheme", newValue: "gray" });
    assert.equal(context.document.documentElement.dataset.colorTheme, "gray");
    events.storage({ key: "unrelated", newValue: "amber" });
    assert.equal(context.document.documentElement.dataset.colorTheme, "gray");
    events.storage({ key: "norwegian-tycoon-cookie-ColorTheme", newValue: "invalid" });
    assert.equal(context.document.documentElement.dataset.colorTheme, "teal");
    const invalid = new Map([["norwegian-tycoon-cookie-ColorTheme", "invalid"]]);
    assert.equal(colorThemeContext(invalid).context.document.documentElement.dataset.colorTheme, "teal");
});

test("AMOLED forces dark mode and a black browser bar, then restores the preferred appearance", () => {
    const storage = new Map([["norwegian-tycoon-theme", "light"]]);
    const { context, options, events } = colorThemeContext(storage);
    const button = {
        querySelector: () => null, setAttribute() {},
        addEventListener(type, callback) { this[type] = callback; }
    };
    const meta = {};
    context.document.querySelectorAll = () => [button];
    context.document.querySelector = () => meta;
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "shared.js"), "utf8");
    vm.runInContext(source.slice(source.indexOf("function initializeThemeToggle()"),
        source.indexOf("function initializeColorTheme()")), context);
    context.initializeThemeToggle();
    const root = context.document.documentElement;
    assert.equal(root.dataset.theme, "light");
    options.find(option => option.dataset.colorTheme === "amoled").click();
    assert.equal(root.dataset.theme, "dark");
    assert.equal(meta.content, "#000000");
    assert.equal(button.disabled, true);
    assert.equal(button.title, "AMOLED Black bruker mørk modus");
    assert.equal(storage.get("norwegian-tycoon-theme"), "light");
    events.storage({ key: "norwegian-tycoon-theme", newValue: "light" });
    assert.equal(root.dataset.theme, "dark");
    options.find(option => option.dataset.colorTheme === "gray").click();
    assert.equal(root.dataset.theme, "light");
    assert.equal(meta.content, "#f3f6f8");
    assert.equal(button.disabled, false);
    button.click();
    assert.equal(root.dataset.theme, "dark");
    assert.equal(storage.get("norwegian-tycoon-theme"), "dark");
});

test("quick play requires a count, uses the saved or localized name and starts a private bot game", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        var quickPlayPlayerCount");
    const end = source.indexOf("        var publicLobbies", start);
    for (const [count, savedName, fallback] of [[2, "Ada", "Spiller"], [3, "", "Spiller"], [4, "", "Player"]]) {
        const preferences = savedPreferencesContext("ignored", new Map(), count === 4);
        const playerKey = preferences.getPlayerKey();
        const options = [2, 3, 4].map(players => ({
            dataset: { players: String(players) },
            setAttribute(key, value) { this[key] = value; },
            addEventListener(type, handler) { this.click = handler; }
        }));
        const button = { disabled: true, addEventListener(type, handler) { this.click = handler; } };
        const menu = { inert: false };
        const games = [];
        let stored = null;
        let cached = null;
        const listeners = new Set();
        const clone = value => JSON.parse(JSON.stringify(value));
        const room = {
            on(event, listener) {
                assert.equal(event, "value");
                listeners.add(listener);
                listener({ val: () => clone(cached) });
            },
            off(event, listener) {
                assert.equal(event, "value");
                assert.equal(listeners.delete(listener), true);
                if (listeners.size === 0) { cached = null; }
            },
            transaction(transform, complete, applyLocally) {
                const next = transform(clone(cached));
                if (applyLocally && next !== undefined) { cached = clone(next); }
                return Promise.resolve().then(() => {
                    if (next !== undefined) { stored = clone(next); }
                    cached = listeners.size ? clone(stored) : null;
                    const result = {
                        committed: next !== undefined,
                        snapshot: { val: () => clone(stored) }
                    };
                    complete?.(null, result.committed, result.snapshot);
                    return result;
                });
            }
        };
        const { PresidentGame, PresidentPlayer } = loadGame(null, {
            getPlayerKey: preferences.getPlayerKey,
            firebase: { database: () => ({
                ref: path => path.startsWith("boms_1/") ? room : { remove: () => Promise.resolve() }
            }) }
        });
        let connections = 0;
        const context = vm.createContext({
            currentGame: null, currentPlayerName: null, console,
            document: {
                getElementById: id => id === "mainMenu" ? menu : button,
                querySelectorAll: () => options
            },
            PresidentGame: class extends PresidentGame {
                constructor(id, isPublic) {
                    super(id, isPublic);
                    games.push(this);
                }
            },
            PresidentPlayer,
            BOT_NAMES: ["Ada", "Bot A", "Bot B", "Bot C"],
            getPlayerKey: preferences.getPlayerKey,
            readLastUsedPlayerName: () => savedName,
            localizedMessage: message => message === "Spiller" ? fallback : message,
            showPublicLobbyError: text => { assert.equal(text, ""); },
            saveLastUsedPlayerName: name => { assert.equal(name, savedName || fallback); },
            connectGame: () => {
                assert.equal(stored.status, "S");
                assert.equal(stored.spillere.length, count);
                assert.equal(listeners.size, 1);
                connections++;
            }
        });
        vm.runInContext(source.slice(start, end), context);
        await button.click();
        assert.equal(games.length, 0);
        options[count - 2].click();
        assert.equal(button.disabled, false);
        assert.deepEqual(options.map(option => option["aria-pressed"]),
            [2, 3, 4].map(players => String(players === count)));
        const pending = button.click();
        assert.equal(menu.inert, true);
        assert.equal(button.disabled, true);
        await button.click();
        await pending;
        assert.equal(games.length, 1);
        assert.equal(games[0].isPublic, false);
        assert.equal(games[0].status, "S");
        assert.equal(games[0].players.length, count);
        const humans = games[0].players.filter(player => player.playerKey !== "PC");
        assert.equal(humans.length, 1);
        assert.equal(humans[0].playerKey, playerKey);
        assert.equal(humans[0].ready, true);
        assert.equal(humans[0].name, savedName || fallback);
        assert.equal(games[0].localPlayerName, humans[0].name);
        assert.equal(new Set(games[0].players.map(player => player.name)).size, count);
        const cards = games[0].players.flatMap(player => Array.from(player.cards, card => card.code()));
        assert.equal(cards.length, count === 2 ? 40 : count === 3 ? 51 : 52);
        assert.equal(new Set(cards).size, cards.length);
        assert.equal(context.currentPlayerName, savedName || fallback);
        assert.equal(connections, 1);
        assert.equal(menu.inert, false);
        assert.equal(listeners.size, 0);
    }
});

test("quick play releases its setup listener after creation, subscription or start failure and allows retry", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        var quickPlayPlayerCount");
    const end = source.indexOf("        var publicLobbies", start);
    for (const stage of ["creation", "subscription", "start"]) {
        const button = { addEventListener(type, callback) { this.click = callback; } };
        const menu = {};
        const errors = [];
        const listeners = new Set();
        let fail = true;
        let connections = 0;
        const context = vm.createContext({
            currentGame: null, currentPlayerName: null,
            console: { error() {} },
            document: { getElementById: id => id === "mainMenu" ? menu : button, querySelectorAll: () => [] },
            PresidentGame: class {
                constructor() {
                    this.players = [];
                    this.databaseRef = {
                        on(event, listener, onError) {
                            listeners.add(listener);
                            if (fail && stage === "subscription") {
                                onError(new Error("Subscription failed"));
                            } else {
                                listener({ val: () => null });
                            }
                        },
                        off(event, listener) {
                            assert.equal(listeners.delete(listener), true);
                        }
                    };
                    this.creation = fail && stage === "creation"
                        ? Promise.reject(new Error("Creation failed")) : Promise.resolve();
                }
                async addPlayer(player) { this.players.push(player); return { player }; }
                async startGame() {
                    if (fail && stage === "start") { throw new Error("Start failed"); }
                }
            },
            PresidentPlayer: class {
                constructor(name, playerKey) { Object.assign(this, { name, playerKey }); }
            },
            BOT_NAMES: ["Bot"], getPlayerKey: () => "human-key",
            readLastUsedPlayerName: () => "Ada", localizedMessage: text => text,
            showPublicLobbyError: text => { if (text) { errors.push(text); } },
            saveLastUsedPlayerName() {}, connectGame: () => { connections++; }
        });
        vm.runInContext(source.slice(start, end) + "\nquickPlayPlayerCount = 2;", context);
        await button.click();
        assert.equal(errors.length, 1);
        assert.equal(context.currentGame, null);
        assert.equal(connections, 0);
        assert.equal(menu.inert, false);
        assert.equal(button.disabled, false);
        assert.equal(listeners.size, 0);
        fail = false;
        await button.click();
        assert.equal(errors.length, 1);
        assert.equal(connections, 1);
        assert.equal(context.currentGame.players.length, 2);
        assert.equal(listeners.size, 0);
    }
});

test("normal exchange rendering fades illegal cards while sneaky exchanges allow them", () => {
    const context = vm.createContext({
        console, getCookie: () => null, getPlayerKey: () => "human-key",
        setTimeout: () => 0, localStorage: { getItem: () => null }
    });
    for (const file of ["cards.js", "player.js", "game.js", "engine.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    const start = source.indexOf("                                var isSelectedForExchange");
    const end = source.indexOf("                                if (!elemKort.disabled)", start);
    for (const sneaky of [false, true]) {
        for (const rank of [6, 7, 11, 12, 14]) {
            const classes = new Set();
            vm.runInContext(`var k = new PresidentCard(1, ${rank});
                var player = { cards: [k] };
                var activeExchange = { id: "trade", kind: "playerTrade", from: 0, to: 1,
                    cards: [], count: 1, mode: "Velg", sneakyVotes: ${sneaky ? "[0, 1]" : "[]"} };
                var game = { players: [player,{name:"Other",playerKey:"other"},{name:"ekrem",playerKey:"eligible"}], piles: [activeExchange] };`, context);
            context.elemKort = { classList: { add: name => classes.add(name) } };
            vm.runInContext(source.slice(start, end), context);
            const illegal = !sneaky && (rank < 7 || rank > 11);
            assert.equal(context.elemKort.disabled, illegal);
            assert.equal(classes.has("is-unplayable"), illegal);
        }
    }
});

function playButtonContext(options = {}) {
    const { CardPile, PresidentCard, GamePresence, GameLayout } = loadGame();
    GameLayout.playInputMode = () => options.playInput || "button";
    const cards = [new PresidentCard(1, 5), new PresidentCard(2, 5), new PresidentCard(3, 8)];
    const selectedCardKeys = new Set(options.selection || ["1:5", "2:5"]);
    const player = { name: "Player", playerKey: "human-key", turn: 1, placement: 0, cards, ...options.player };
    const played = [];
    let warnings = 0;
    const game = {
        status: "S", isTurnPaused: () => false,
        canPlayPile: () => options.valid !== false,
        playCards: (owner, pile) => played.push({ owner, pile }),
        ...options.game
    };
    const playButton = {};
    const context = vm.createContext({
        CardPile, GamePresence, GameLayout, game, player, playButton, selectedCardKeys,
        isPlayingTurn: game.status == "S" && player.turn == 1 &&
            player.placement == 0 && !game.isTurnPaused(),
        clearCardSelection: () => selectedCardKeys.clear(),
        showInvalidCardWarning: () => { warnings++; }
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    const start = source.indexOf("        var playSelectedCards = function (");
    const end = source.indexOf("        var selectCardsForSwipe", start);
    vm.runInContext(source.slice(start, end), context);
    return { game, player, playButton, played, selectedCardKeys, warnings: () => warnings };
}

test("the play button plays exactly the selected cards and clears the selection", () => {
    const { player, playButton, played, selectedCardKeys } = playButtonContext();
    assert.equal(playButton.hidden, false);
    assert.equal(playButton.disabled, false);
    assert.equal(playButton.onclick(), true);
    assert.equal(played.length, 1);
    assert.equal(played[0].owner, player);
    assert.deepEqual(Array.from(played[0].pile, card => `${card.suit}:${card.rank}`), ["1:5", "2:5"]);
    assert.equal(selectedCardKeys.size, 0);
    assert.equal(playButton.onclick(), false);
    assert.equal(played.length, 1);
});

test("tapping a selected group keeps only the tapped card, then allows adding cards individually", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    const start = source.indexOf("                                    if (!playableStrengths.has(k.strengthRank))");
    const end = source.indexOf("                                    GameLayout.updateHand(", start);
    const { PresidentCard } = loadGame();
    const cards = [1, 2, 3, 4].map(suit => new PresidentCard(suit, 7));
    for (const count of [null, 2, 3, 4]) {
        const keys = new Set();
        const context = vm.createContext({
            PresidentCard, player: { cards }, selectedCardKeys: keys,
            selectedCardStrength: null, autoSuggestedCardKeys: new Set(),
            playableStrengths: new Set([7]), hasFourOfKindOnTop: () => count == 4,
            game: { topPile: () => count == null ? null : Array(count) },
            showInvalidCardWarning: () => assert.fail("Every test card is playable")
        });
        context.clearCardSelection = () => { keys.clear(); context.selectedCardStrength = null; };
        vm.runInContext(`function select(k) { var cardKey = k.suit + ":" + k.rank;\n${source.slice(start, end)}\n}`, context);
        context.select(cards[0]);
        assert.equal(keys.size, count || 4);
        context.select(cards[0]);
        assert.deepEqual([...keys], ["1:7"]);
        context.select(cards[1]);
        assert.deepEqual([...keys], ["1:7", "2:7"]);
        if (count == null || count > 2) {
            context.select(cards[2]);
            assert.deepEqual([...keys], ["1:7", "2:7", "3:7"]);
        }
    }
});

test("fast forward temporarily shows the fastest message speed without overwriting the saved preference", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const buttons = ["fast", "normal", "slow"].map(speed => ({
        dataset: { speed }, setAttribute(name, value) { this[name] = value; }
    }));
    const context = vm.createContext({
        updateToastVisibility() {},
        currentGame: { fastForward: false },
        localStorage: { getItem: () => "slow" },
        document: { querySelectorAll: () => buttons }
    });
    vm.runInContext(source.slice(source.indexOf("        var GAME_SPEED_MS"),
        source.indexOf("        function updateTurnSpeedButtons")), context);
    for (const enabled of [false, true, false]) {
        context.currentGame.fastForward = enabled;
        context.updateSpeedButtons();
        assert.equal(context.currentGameSpeed(), enabled ? "fast" : "slow");
        assert.equal(buttons.find(button => button["aria-pressed"] == "true").dataset.speed,
            enabled ? "fast" : "slow");
        assert.ok(buttons.every(button => button.disabled == enabled));
    }
});

test("new players use normal message duration while saved speeds remain unchanged", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    for (const saved of [null, "invalid", "fast", "normal", "slow"]) {
        const context = vm.createContext({
            currentGame: null, localStorage: { getItem: () => saved }
        });
        vm.runInContext(source.slice(source.indexOf("        var GAME_SPEED_MS"),
            source.indexOf("        function updateSpeedButtons")), context);
        assert.equal(context.currentGameSpeed(),
            ["fast", "normal", "slow"].includes(saved) ? saved : "normal");
    }
});

test("the max-visible selector persists independently and updates across tabs", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const saved = new Map();
    let storage;
    let reconciliations = 0;
    const buttons = ["1", "2"].map(value => ({
        dataset: { maxMessages: value },
        setAttribute(key, value) { this[key] = value; },
        addEventListener(type, callback) { this.click = callback; }
    }));
    const context = vm.createContext({
        getCookie: key => saved.get(key),
        setCookie: (key, value) => saved.set(key, value),
        positionArchivedToasts: () => reconciliations++,
        document: { querySelectorAll: selector => {
            assert.equal(selector, ".speed-option[data-max-messages]");
            return buttons;
        } },
        window: { addEventListener(type, callback) { storage = callback; } }
    });
    vm.runInContext(source.slice(source.indexOf("        function maxVisibleMessages()"),
        source.indexOf("        function updateToastVisibility()")) +
        source.slice(source.indexOf("        function updateMaxMessageButtons()"),
            source.indexOf("        function updatePlayInputButtons()")), context);
    assert.equal(context.maxVisibleMessages(), 1);
    assert.equal(buttons[0]["aria-pressed"], "true");
    buttons[1].click();
    assert.equal(saved.get("MaxVisibleMessages"), "2");
    assert.equal(buttons[1]["aria-pressed"], "true");
    assert.equal(saved.has("AnimationSpeed"), false);
    assert.equal(saved.has("gameSpeed"), false);
    saved.set("MaxVisibleMessages", "1");
    storage({ key: "norwegian-tycoon-cookie-MaxVisibleMessages" });
    assert.equal(buttons[0]["aria-pressed"], "true");
    saved.set("MaxVisibleMessages", "invalid");
    assert.equal(context.maxVisibleMessages(), 1);
    assert.equal(reconciliations, 3);
});

test("forced exchange offers expire at 120 seconds without surrendering a human seat", () => {
    const { game, players } = setupGame();
    Object.assign(game, {
        status: "G", localPlayerName: players[0].name, shuffleStartedAt: null,
        piles: [{ id: "offer", mode: "Tilbud", from: 0, to: 1, offerUntil: 120000 }],
        roundStarterName: players[0].name
    });
    let saves = 0;
    game.save = () => saves++;
    assert.equal(game.expireOptionalTrades(119999), false);
    assert.equal(game.piles.length, 1);
    assert.equal(game.expireOptionalTrades(120000), true);
    assert.equal(game.status, "S");
    assert.equal(game.piles.length, 0);
    assert.equal(saves, 1);
    assert.equal(game.controllers, undefined);
});

test("forced exchange offer deadlines survive serialization and reject late starts", () => {
    const { game } = setupGame();
    game.status = "G";
    game.piles = [{
        id: "offer", kind: "playerTrade", mode: "Tilbud", from: 0, to: 1,
        count: 1, cards: [], offerUntil: 1
    }];
    const records = game.serializePiles();
    const { PresidentGame } = loadGame();
    assert.equal(PresidentGame.deserializeExchanges(records)[0].offerUntil, 1);
    assert.throws(() => game.startOptionalTrade(game.piles[0]), /Tiden.*ute/);
});

test("extra exchanges wait for mandatory cards and receive separate 120-second deadlines", () => {
    const { game, players } = setupGame();
    game.status = "G";
    const mandatory = { id: "mandatory", mode: "Velg", from: 0, to: 2, count: 2, cards: [] };
    const offers = [1, 2].map((to, index) => ({
        id: `offer-${index}`, mode: "Tilbud", kind: "playerTrade",
        from: index, to, count: 1, cards: []
    }));
    game.piles = [mandatory, ...offers];
    game.save = () => {};
    game.localPlayerName = players[0].name;
    const { activeTradeOffer } = loadGame();
    assert.equal(activeTradeOffer(game), null);
    assert.equal(game.expireOptionalTrades(Date.now() + 200000), false);
    assert.throws(() => game.startOptionalTrade(offers[0]), /ikke lenger/);
    assert.throws(() => game.toggleSneakyTrade(offers[0], 0), /ikke lenger/);
    game.piles.shift();
    game.advanceExchangeStage();
    assert.equal(activeTradeOffer(game), offers[0]);
    assert.ok(Math.abs(offers[0].offerUntil - Date.now() - 120000) < 100);
    const firstDeadline = offers[0].offerUntil;
    game.advanceExchangeStage();
    assert.equal(offers[0].offerUntil, firstDeadline, "Refreshing the stage must not reset the active offer");
    assert.equal(offers[1].offerUntil, undefined);
    assert.throws(() => game.startOptionalTrade(offers[1]), /ikke lenger/);
    assert.throws(() => game.skipOptionalTrade(offers[1], 1), /ikke lenger/);
    game.skipOptionalTrade(offers[0], 0);
    assert.equal(activeTradeOffer(game), offers[1]);
    assert.ok(Math.abs(offers[1].offerUntil - Date.now() - 120000) < 100);
});

test("offer countdown uses the board timer even with one human and never permits extension", () => {
    const fixture = turnTimerFixture();
    fixture.game.status = "G";
    fixture.game.piles = [{ id: "offer", mode: "Tilbud", offerUntil: 200000 }];
    fixture.game.players = [fixture.players[0]];
    fixture.now = 80000;
    assert.equal(fixture.render().turnCountdown.textContent, "2:00");
    assert.equal(fixture.elements.turnTimer.hidden, false);
    assert.equal(fixture.elements.extendTurnButton.hidden, true);
    fixture.now = 81500;
    assert.equal(fixture.render().turnCountdown.textContent, "1:59");
    fixture.now = 200000;
    assert.equal(fixture.render().turnCountdown.textContent, "0:00");
});

test("offer expiry leaves active exchanges intact and only the online room driver may perform it", () => {
    const { game, players } = setupGame();
    const selection = { id: "selection", mode: "Velg", from: 0, to: 1, cards: [] };
    Object.assign(game, {
        status: "G", localPlayerName: players[0].name,
        piles: [selection, { id: "offer", mode: "Tilbud", from: 0, to: 1, offerUntil: 120000 }]
    });
    game.save = () => {};
    game.connectionOnline = false;
    assert.equal(game.expireOptionalTrades(120000), false);
    game.connectionOnline = true;
    game.hostKey = "another-host";
    assert.equal(game.expireOptionalTrades(120000), false);
    game.hostKey = "human-key";
    assert.equal(game.expireOptionalTrades(120000), false);
    assert.equal(game.status, "G");
    assert.equal(game.piles.length, 2, "Hidden offers cannot expire while an earlier exchange is active");
});

test("a stale room save cannot remove another client's exchange receipt within the same round", () => {
    const { game } = setupGame();
    const receipt = { id: "received", recipient: "Human", sender: "Bot 1", cards: [{ suit: 1, rank: 8 }] };
    let record = {
        status: "S", runde: game.round, shuffleStartedAt: null,
        exchangeReceipts: [receipt],
        skippedTrades: [{ id: "skip", sender: "Human", recipient: "Bot 1" }]
    };
    game.databaseRef = { transaction(transform) { record = transform(record); } };
    game.exchangeReceipts = [];
    game.save();
    assert.deepEqual(Array.from(record.exchangeReceipts), [receipt]);
    assert.equal(record.skippedTrades[0].id, "skip");
    game.shuffleStartedAt = Date.now();
    game.save();
    assert.equal(record.exchangeReceipts.length, 0);
    assert.equal(record.skippedTrades.length, 0);
});

test("stale game saves preserve shared exchange readiness and cannot revive a completed gate", () => {
    const { game } = setupGame();
    const gate = { id: "exchange-round", startedAt: 1, until: 7001, ready: { guest: true } };
    let record = { status: "S", runde: game.round, shuffleStartedAt: null, exchangeReady: gate };
    game.databaseRef = { transaction(transform) { record = transform(record); } };
    game.exchangeReady = { ...gate, ready: {} };
    game.save();
    assert.equal(record.exchangeReady.ready.guest, true);
    record.exchangeReady = null;
    game.save();
    assert.equal(record.exchangeReady, null);
    record.status = "G";
    game.save();
    assert.equal(record.exchangeReady.id, gate.id, "The final exchange creates the gate");
    game.shuffleStartedAt = 123;
    game.exchangeReady = null;
    game.save();
    assert.equal(record.exchangeReady, null, "A new round clears previous readiness");
});

test("mid-exchange summary gates persist and stale saves retain acknowledgments without replaying receipts", () => {
    const { game } = setupGame();
    game.status = "G";
    game.piles = [];
    const receipt = { id: "pair-1", sender: "A", recipient: "B", cards: [],
        summaryGateId: "stage-1" };
    const gate = { id: "stage-1", startedAt: 1, until: 7001, ready: {}, receiptIds: ["pair-1"] };
    let record = { status: "G", runde: game.round, shuffleStartedAt: null,
        spillBunke: [], exchangeReceipts: [], exchangeReady: null };
    game.databaseRef = { transaction(transform) {
        const next = transform(record);
        if (next) { record = next; }
    } };
    game.exchangeReceipts = [receipt];
    game.exchangeReady = gate;
    game.save();
    assert.equal(record.exchangeReady.id, "stage-1");
    record.exchangeReady = { ...record.exchangeReady, ready: { guest: true } };
    game.save();
    assert.equal(record.exchangeReady.ready.guest, true);
    record.exchangeReady = null;
    game.exchangeReceipts = [{ ...receipt, summaryGateId: undefined }];
    game.save();
    assert.equal(record.exchangeReady, null);
    assert.equal(record.exchangeReceipts[0].summaryGateId, "stage-1");
    game.status = "S";
    game.save();
    assert.equal(record.exchangeReady, null, "A stale transition to play cannot revive a completed stage gate");
});

test("stale offer saves cannot undo forcing or resurrect an exchange after the receiver answers", () => {
    const { game } = setupGame();
    game.status = "G";
    game.piles = [{ id: "offer", tradeId: "trade", kind: "playerTrade", mode: "Tilbud",
        from: 0, to: 1, count: 1, cards: [], sneakyVotes: [] }];
    let record = { status: "G", runde: game.round, shuffleStartedAt: null,
        spillBunke: [{ ...game.serializePiles()[0], forcedAt: 1234 }] };
    let rejected = 0;
    game.databaseRef = { transaction(transform) {
        const next = transform(record);
        if (next) { record = next; } else { rejected++; }
    } };
    game.save();
    assert.equal(rejected, 1);
    assert.equal(record.spillBunke[0].forcedAt, 1234);
    game.piles[0].forcedAt = 1234;
    record.spillBunke = [{ ...record.spillBunke[0], modus: "Velg" }];
    game.save();
    assert.equal(rejected, 2);
    assert.equal(record.spillBunke[0].modus, "Velg");
});

test("the play button rejects empty and illegal selections without playing", () => {
    for (const options of [{ selection: [] }, { valid: false }]) {
        const state = playButtonContext(options);
        assert.equal(state.playButton.disabled, true);
        assert.equal(state.playButton.onclick(), false);
        assert.equal(state.played.length, 0);
        assert.equal(state.warnings(), options.valid === false ? 1 : 0);
    }
});

test("the play button stays dimmed while waiting, hides when inapplicable and guards stale clicks", () => {
    const blockedStates = [
        { game: { status: "G" } },
        { game: { isTurnPaused: () => true } },
        { game: { connectionOnline: false } },
        { player: { turn: 0 } },
        { player: { placement: 1 } },
        { player: { playerKey: "PC" } },
        { game: { controllers: { [loadGame().GamePresence.playerId({
            name: "Player", playerKey: "human-key"
        })]: {} } } }
    ];
    for (const options of blockedStates) {
        const state = playButtonContext(options);
        assert.equal(state.playButton.hidden,
            state.game.status != "S" || state.player.placement != 0 ||
            loadGame().GamePresence.isBot(state.game, state.player));
        assert.equal(state.playButton.disabled, true);
        assert.equal(state.playButton.onclick(), false);
        assert.equal(state.played.length, 0);

        const stale = playButtonContext();
        Object.assign(stale.game, options.game);
        Object.assign(stale.player, options.player);
        assert.equal(stale.playButton.onclick(), false);
        assert.equal(stale.played.length, 0);
    }
});

test("toast notices get separate lines without splitting punctuation inside player names", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const context = vm.createContext({
        document: {
            createTextNode: text => ({ textContent: text }),
            createElement: () => ({ style: { setProperty() {} } })
        }
    });
    vm.runInContext(source.slice(source.indexOf("        function appendColoredGameMessage("),
        source.indexOf("        function localizedMessage(")), context);
    const players = [{ name: "Dr. Bot", displayColor: "#123456" }];
    for (const [message, expected] of [
        ["Alle passet. Dr. Bot starter.", "Alle passet.\nDr. Bot starter."],
        ["Dr. Bot: Fire like! Starter igjen.", "Dr. Bot: Fire like!\nStarter igjen."],
        ["Dr. Bot ble President! Someone ble Boms!", "Dr. Bot ble President!\nSomeone ble Boms!"],
        ["Spillet pågår. Du ser på til neste runde.", "Spillet pågår.\nDu ser på til neste runde."]
    ]) {
        const nodes = [];
        context.appendColoredGameMessage({ appendChild: node => nodes.push(node) }, message, players, true);
        assert.equal(nodes.map(node => node.textContent).join(""), expected);
    }
});

test("only remaining active bots allow fast forward, including temporary bot control", () => {
    const { GamePresence } = loadGame();
    const { game, players } = setupGame();
    assert.equal(GamePresence.onlyBotsRemain(game), false);
    players[0].placement = 1;
    assert.equal(GamePresence.onlyBotsRemain(game), true);
    assert.equal(GamePresence.onlyBotsRemain({
        status: game.status, spillere: players.map(player => player.toRecord())
    }), true);
    players[0].placement = 0;
    game.controllers = { [GamePresence.playerId(players[0])]: { since: Date.now() } };
    assert.equal(GamePresence.onlyBotsRemain(game), true);
    delete game.controllers[GamePresence.playerId(players[0])];
    assert.equal(GamePresence.onlyBotsRemain(game), false);
    players[0].placement = 1;
    players[1].placement = 2;
    assert.equal(GamePresence.onlyBotsRemain(game), false);
    game.status = "F";
    assert.equal(GamePresence.onlyBotsRemain(game), false);
});

test("fast-forward transactions recheck eligibility, reschedule pauses and preserve message speed", async () => {
    const { game, players } = setupGame();
    players[0].placement = 1;
    game.localPlayerName = players[0].name;
    let record = {
        status: "S", spillere: players.map(player => player.toRecord()),
        turnPause: { id: "pause", until: Date.now() + 10000 },
        fastForward: false
    };
    let transactions = 0;
    game.databaseRef = { transaction: async update => {
        transactions++;
        const next = update(record);
        if (next) { record = next; }
    } };
    await game.setFastForward(true);
    assert.equal(record.fastForward, true);
    assert.ok(record.turnPause.until - Date.now() <= 1000);
    assert.equal(record.turnPause.id, "pause");
    await game.setFastForward(false);
    assert.equal(record.fastForward, false);
    assert.ok(record.turnPause.until - Date.now() > 1900);
    assert.ok(record.turnPause.until - Date.now() <= 5000);
    record.spillere[0].plassering = 0;
    await game.setFastForward(true);
    assert.equal(record.fastForward, false);
    game.connectionOnline = false;
    await game.setFastForward(true);
    assert.equal(transactions, 3);
});

test("fast forward shortens bot actions and final pauses, then resets when the game finishes", () => {
    const { game, players, pile } = setupGame();
    players[0].placement = 1;
    players[1].cards = [...pile(players[1], 7, 2)];
    players[2].cards = [...pile(players[2], 8, 2)];
    game.fastForward = true;
    game.databaseRef = { update: () => Promise.resolve() };
    game.setTurn(1);
    assert.equal(game.actionPauseMs(), 1000);
    const { CardPile } = loadGame();
    game.playCards(players[1], new CardPile(players[1].name, players[1].cards[0]));
    assert.ok(game.turnPause.until - Date.now() <= 1000);
    game.turnPause = null;
    game.passTurn(players[2]);
    assert.equal(game.turnPause.kind, "clear");
    assert.ok(game.turnPause.until - Date.now() <= 1000);
    game.turnPause = null;
    game.playCards(players[1], new CardPile(players[1].name, ...players[1].cards));
    assert.equal(game.turnPause.pendingGameEnd, true);
    assert.ok(game.turnPause.until - Date.now() <= 1000);
    game.beginGameEndVote = () => {};
    game.finishGame();
    assert.equal(game.fastForward, false);
    assert.equal(game.actionPauseMs(), 2000);
});

test("bot scheduling follows animation speed and restores it after fast-forward", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { game, players } = setupGame();
    const { GamePresence } = loadGame();
    players[0].placement = 1;
    const timers = [];
    const cleared = [];
    let speed = "slow";
    const context = vm.createContext({
        currentGame: game, GamePresence: {
            onlyBotsRemain: record => GamePresence.onlyBotsRemain(record), canDrive: () => true,
            now: () => 10000,
            isBot: (game, player) => GamePresence.isBot(game, player) },
        connection: null,
        animationDuration: (game, normal) => normal * (game.fastForward ? 0.5 :
            { fast: 0.5, normal: 1, slow: 1.5 }[speed]),
        setTimeout: (callback, delay) => { timers.push(delay); return timers.length; },
        clearTimeout: id => cleared.push(id)
    });

    test("bot exchange pacing waits five to ten seconds for each new action, independent of speed", () => {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
        const { GamePresence } = loadGame();
        for (const roll of [0, 0.5, 0.999999]) {
            let now = 100000;
            const timers = [];
            const actions = [];
            const player = { name: "Bot", playerKey: "PC" };
            const game = { id: "paced", status: "G", round: 2, players: [player],
                piles: [{ id: "first", from: 0, to: 1, mode: "Velg" }], fastForward: true };
            const context = vm.createContext({
                Math: Object.assign(Object.create(Math), { random: () => roll }),
                currentGame: game, connection: null, shuffleEndsAt: 0, Date: { now: () => now },
                GamePresence: {
                    canDrive: () => true, onlyBotsRemain: () => true, isBot: () => true,
                    now: () => now, roundToken: record => GamePresence.roundToken(record)
                },
                activeTradeOffer: () => null, getExchangeId: exchange => exchange.id,
                animationDuration: () => { throw new Error("Exchange pacing must ignore animation speed"); },
                setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
                clearTimeout() {},
                playBotTurn: () => {
                    actions.push(now);
                    game.piles = game.piles[0].id == "first"
                        ? [{ id: "second", from: 0, to: 1, mode: "Velg" }] : [];
                }
            });
            vm.runInContext(source.slice(source.indexOf("        var botLoopTimer = null;"),
                source.indexOf("        document.getElementById('BnFHovedmeny')")), context);
            context.scheduleBotLoop();
            const firstDelay = timers[0].delay;
            assert.ok(firstDelay >= 5000 && firstDelay <= 10000);
            now += 4999;
            context.runBotLoop();
            assert.equal(actions.length, 0);
            assert.equal(timers.at(-1).delay, firstDelay - 4999, "Polling must not reset the deadline");
            now += firstDelay - 4999;
            context.runBotLoop();
            assert.equal(actions.length, 1);
            const secondDelay = timers.at(-1).delay;
            assert.ok(secondDelay >= 5000 && secondDelay <= 10000);
            context.scheduleBotLoop();
            assert.equal(actions.length, 1);
            now += secondDelay;
            context.runBotLoop();
            assert.equal(actions.length, 2);
        }
    });
    vm.runInContext(source.slice(source.indexOf("        var botLoopTimer = null;"),
        source.indexOf("        document.getElementById('BnFHovedmeny')")), context);
    context.scheduleBotLoop();
    assert.equal(timers.at(-1), 3000);
    game.fastForward = true;
    context.scheduleBotLoop();
    assert.equal(timers.at(-1), 1000);
    game.fastForward = false;
    context.scheduleBotLoop();
    assert.equal(timers.at(-1), 3000);
    assert.deepEqual(cleared, [1, 2]);
    for (const [preference, expected] of [["fast", 1000], ["normal", 2000], ["slow", 3000]]) {
        speed = preference;
        vm.runInContext("botLoopTimer = null; scheduleBotLoop();", context);
        assert.equal(timers.at(-1), expected);
    }
    game.turnPause = { id: "animation", presentationVersion: 1, botUntil: 9000, until: 9000 };
    const scheduled = timers.length;
    vm.runInContext("botLoopTimer = null; scheduleBotLoop();", context);
    assert.equal(timers.length, scheduled, "An expired delay must still wait for local animations");
    game.presentationCompletedPauseId = "animation";
    context.scheduleBotLoop();
    assert.equal(timers.at(-1), 0, "Completed animations must not add another bot delay");
    game.turnPause.botUntil = 12000;
    game.turnPause.until = 12000;
    vm.runInContext("botLoopTimer = null; scheduleBotLoop();", context);
    assert.equal(timers.at(-1), 2000, "Completed animations must preserve the remaining shared delay");
});

test("ordinary saves preserve concurrent fast-forward toggles and their pause deadlines", () => {
    const { game, players } = setupGame();
    players[0].placement = 1;
    game.fastForward = false;
    const now = Date.now();
    game.turnPause = { id: "same", kind: "play", until: now + 2000 };
    let record = {
        status: "S", shuffleStartedAt: null, fastForward: true,
        turnPause: { id: "same", kind: "play", until: now + 1000 }
    };
    game.databaseRef = { transaction: update => { record = update(record); } };
    game.save();
    assert.equal(record.fastForward, true);
    assert.equal(record.turnPause.until, now + 1000);
    game.turnPause = { id: "new", kind: "play", until: now + 2000 };
    game.save();
    assert.equal(record.fastForward, true);
    assert.equal(record.turnPause.until, now + 1000);
    game.fastForward = true;
    record.fastForward = false;
    record.turnPause = { id: "other", until: now };
    game.turnPause = { id: "third", kind: "play", until: now + 1000 };
    game.save();
    assert.equal(record.fastForward, false);
    assert.equal(record.turnPause.until, now + 2000);
    game.status = "F";
    record.fastForward = true;
    game.turnPause = null;
    game.save();
    assert.equal(record.fastForward, false);
});

test("round start refreshes the local view after the state changes", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("            connectingGame.onRoundStarted = function () {");
    const end = source.indexOf("\n            };", start) + "\n            };".length;
    const game = {};
    const events = [];
    const context = vm.createContext({
        currentGame: game,
        connectingGame: game,
        roundVoteRefreshTimer: null,
        gameEndVoteRefreshTimer: null,
        clearTimeout() {},
        refreshAfterTurnPause: refreshedGame => events.push(["refresh", refreshedGame]),
        scheduleBotLoop: () => events.push(["bots"])
    });
    vm.runInContext(source.slice(start, end), context);
    game.onRoundStarted();
    assert.deepEqual(events, [["refresh", game], ["bots"]]);
});

test("hand hover and mixable states do not lift or reorder cards", () => {
    const styles = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
    const hoverRule = styles.match(/\.game-card:hover:not\(\.is-selected\)\s*\{([^}]+)\}/);
    assert.ok(hoverRule);
    assert.doesNotMatch(hoverRule[1], /transform|z-index/);
    assert.doesNotMatch(styles, /\.game-card\.is-mixable\s*\{[^}]*?(?:transform|z-index)/);
    assert.match(styles, /\.game-card\.is-selected\s*\{[^}]*translateY\(-19\.8px\)/);
    assert.match(styles, /@keyframes hand-card-lower\s*\{[\s\S]*?to\s*\{[^}]*translateY\(0\)/);
});

test("connection and seat-control changes invalidate the hand's play-button state", () => {
    const { GameLayout, GamePresence } = loadGame();
    const player = { name: "Player", playerKey: "human-key", turn: 1, placement: 0, cards: [] };
    const game = {
        id: "room", round: 1, turn: 0, status: "S", piles: [],
        isTurnPaused: () => false
    };
    const onlineSignature = GameLayout.handSignature(game, player);
    game.connectionOnline = false;
    assert.notEqual(GameLayout.handSignature(game, player), onlineSignature);
    game.connectionOnline = true;
    assert.equal(GameLayout.handSignature(game, player), onlineSignature);
    game.controllers = { [GamePresence.playerId(player)]: {} };
    assert.notEqual(GameLayout.handSignature(game, player), onlineSignature);
    game.controllers = {};
    assert.equal(GameLayout.handSignature(game, player), onlineSignature);
});

test("a gift requires the same owner on the first and fourth consecutive singles", () => {
    const { CardPile, PresidentCard, isGiftPackage } = loadGame();
    const single = (name, suit) => new CardPile(name, new PresidentCard(suit, 5));
    const piles = [single("A", 1), single("B", 2), single("C", 3), single("A", 4)];
    assert.equal(isGiftPackage(piles), true);
    assert.equal(isGiftPackage(piles.slice(0, 3)), false);
    piles[3].name = "B";
    assert.equal(isGiftPackage(piles), false);
    piles[3].name = "A";
    piles[1] = new CardPile("B", new PresidentCard(2, 5), new PresidentCard(3, 5));
    assert.equal(isGiftPackage(piles), false);
});

test("first-round and exchange rendering wait for the exact shuffle deadline", () => {
    let now = 1000;
    const elements = new Map();
    const { GameLayout } = loadGame(null, {
        Date: { now: () => now },
        document: { getElementById(id) {
            if (!elements.has(id)) { elements.set(id, { replaceChildren() { this.cleared = true; } }); }
            return elements.get(id);
        } }
    });
    const game = { status: "G", shuffleStartedAt: 1000 };
    assert.equal(GameLayout.isShuffling(game), true);
    GameLayout.updateTable(game, null);
    assert.equal(elements.get("gameTable").cleared, true);
    now = 3999;
    assert.equal(GameLayout.isShuffling(game), true);
    now = 4000;
    assert.equal(GameLayout.isShuffling(game), false);
    game.status = "S";
    now = 1000;
    assert.equal(GameLayout.isShuffling(game), true);
    now = 4000;
    assert.equal(GameLayout.isShuffling(game), false);
});

test("the hand stays unrendered until shuffle presentation finishes, including first rounds", () => {
    let now = 1000;
    let waitingClass = false;
    const node = {
        classList: { contains: name => name == "is-dealing-wait" && waitingClass },
        hidden: false
    };
    const { GameLayout } = loadGame(null, {
        Date: { now: () => now },
        setClass() {},
        document: { getElementById: () => node }
    });
    const hands = [];
    GameLayout.updatePlayerButtons = () => {};
    GameLayout.updateHand = (game, player) => hands.push([game, player]);
    const player = { name: "Human", playerKey: "human-key" };
    for (const status of ["S", "G"]) {
        const game = { status, shuffleStartedAt: 1000, rules: {} };
        now = 1000;
        waitingClass = false;
        GameLayout.updatePlayerView(game, player);
        assert.deepEqual(hands.at(-1), [null, null]);
        now = 4000;
        waitingClass = true;
        GameLayout.updatePlayerView(game, player);
        assert.deepEqual(hands.at(-1), [null, null], "Deadline snapshots cannot reveal the hand before the deal ticker");
        waitingClass = false;
        GameLayout.updatePlayerView(game, player);
        assert.deepEqual(hands.at(-1), [game, player]);
    }
});

test("the initial splash preserves the turn hint for the first empty-table turn", () => {
    const elements = new Map();
    const document = {
        documentElement: { dataset: {} }, querySelectorAll: () => [],
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    hidden: true, dataset: {}, style: {}, children: [],
                    classList: { remove() {} }, setAttribute() {},
                    replaceChildren() { this.children = []; },
                    remove() {
                        if (this.parentElement) {
                            this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
                            this.parentElement = null;
                        }
                    },
                    appendChild(child) {
                        child.remove();
                        this.children.push(child);
                        child.parentElement = this;
                    }
                });
            }
            const element = elements.get(id);
            return id === "tableTurnHint" && element.detached ? null : element;
        }
    };
    const table = document.getElementById("gameTable");
    const hint = document.getElementById("tableTurnHint");
    const remove = hint.remove;
    hint.remove = function () { remove.call(this); this.detached = true; };
    table.children.push(hint);
    hint.parentElement = table;
    const { GameLayout } = loadGame(null, { document, setClass() {} });

    GameLayout.updateSharedView(null, null);
    assert.equal(hint.parentElement, table);
    assert.equal(GameLayout.tableTurnHint, hint);

    const game = {
        id: "first-turn", status: "S", round: 1, piles: [],
        isTurnPaused: () => false, topPile: () => null
    };
    const player = { name: "Player", placement: 0, turn: 1 };
    GameLayout.updateTable(game, player);
    assert.equal(hint.hidden, false);
    player.turn = 0;
    GameLayout.updateTable(game, player);
    assert.equal(hint.hidden, true);
    player.turn = 1;
    game.isTurnPaused = () => true;
    GameLayout.updateTable(game, player);
    assert.equal(hint.hidden, true);
    game.isTurnPaused = () => false;
    GameLayout.updateTable(game, player);
    assert.equal(hint.hidden, false);
});

test("board refreshes retain the connected toast node and timer controls", () => {
    const { GameLayout } = loadGame();
    const table = { children: [] };
    function element(name) {
        return {
            name, parentElement: table,
            remove() {
                const index = table.children.indexOf(this);
                if (index >= 0) { table.children.splice(index, 1); }
                this.parentElement = null;
            }
        };
    }
    const toast = element("toast");
    const timer = element("timer");
    const hint = element("hint");
    table.children.push(toast, timer, hint, element("old cards"));
    GameLayout.toastRegion = toast;
    GameLayout.turnTimerElement = timer;
    GameLayout.tableTurnHint = hint;

    GameLayout.clearTableContent(table);
    assert.deepEqual(table.children.map(child => child.name), ["toast", "timer", "hint"]);
    assert.equal(toast.parentElement, table);
    assert.equal(timer.parentElement, table);
    assert.equal(hint.parentElement, table);

    table.children.push(element("new cards"));
    GameLayout.clearTableContent(table);
    assert.deepEqual(table.children.map(child => child.name), ["toast", "timer", "hint"]);
    assert.equal(toast.parentElement, table, "The visible toast must never be detached during redraws");
});

test("the gift toast survives the transition from the fourth single to a cleared pile", () => {
    const { game, players } = setupGame();
    const { PresidentCard, CardPile } = loadGame();
    game.save = () => {};
    players.forEach(player => { player.cards = [new PresidentCard(1, 8), new PresidentCard(2, 9)]; });
    game.piles = [0, 1, 2].map((index) =>
        new CardPile(players[index].name, new PresidentCard(index + 1, 5)));
    const fourth = new PresidentCard(4, 5);
    players[0].cards.push(fourth);
    game.setTurn(0);
    game.playCards(players[0], new CardPile(players[0].name, fourth));
    assert.equal(game.turnPause.kind, "clear");
    assert.equal(game.turnPause.extraMessage, "Oi, oi.. gavepakke!");
    assert.equal(game.turnPause.clearedPiles.length, 4);
});

test("shuffle completion renders the exchange before announcing the starter", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const events = [];
    let tick;
    let now = 1000;
    const element = () => ({
        style: { setProperty() {} }, setAttribute() {}, append() {}, appendChild() {},
        classList: { add() {} }
    });
    const game = { status: "G", shuffleStartedAt: 1000 };
    const context = vm.createContext({
        currentGame: game, Date: { now: () => now }, GamePresence: { now: () => now }, SHUFFLE_DURATION_MS: 3500,
        shuffleEndsAt: 0, shuffleTicker: null,
        clearShuffleAnimation: () => events.push("clear"),
        refreshAfterTurnPause: () => events.push("render"),
        dealCardsIntoHand: () => events.push("deal"),
        flashRoundStarter: () => events.push("starter"),
        setInterval: callback => { tick = callback; return 1; },
        document: { createElement: element, getElementById: () => element(), body: { appendChild() {} } }
    });
    vm.runInContext(source.slice(source.indexOf("        function playShuffleAnimation("),
        source.indexOf("        function playShuffleIfNew(")), context);
    context.playShuffleAnimation(game);
    assert.deepEqual(events, ["clear"]);
    now = 4499;
    tick();
    assert.deepEqual(events, ["clear"]);
    now = 4500;
    tick();
    assert.deepEqual(events, ["clear", "clear", "render", "deal", "starter"]);
});

test("the log resets for a new deal, not for cleared tricks or repeated snapshots", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let clears = 0;
    const context = vm.createContext({
        gameLogGameId: null, gameLogEntries: [], gameLogTrickCount: 0, gameLogNeedsTrickHeader: true,
        localizedMessage: text => text,
        document: {
            getElementById: () => ({ replaceChildren() { clears++; }, appendChild() {} }),
            createElement: () => ({})
        }
    });
    vm.runInContext(source.slice(source.indexOf("        function resetGameLog("),
        source.indexOf("        function appendColoredGameMessage(")), context);
    const game = { id: "same-room", shuffleStartedAt: 100, round: 1 };
    context.ensureGameLog(game);
    context.gameLogEntries.push({ message: "Old round" });
    game.round = 2;
    context.ensureGameLog(game);
    assert.equal(context.gameLogEntries.length, 1);
    assert.equal(clears, 1);
    game.shuffleStartedAt = 200;
    context.ensureGameLog(game);
    assert.equal(context.gameLogEntries.length, 0);
    assert.equal(context.gameLogTrickCount, 0);
    assert.equal(context.gameLogNeedsTrickHeader, true);
    assert.equal(clears, 2);
    context.ensureGameLog(game);
    assert.equal(clears, 2);
});

test("the starter toast waits until exchange is complete and the starter can play", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const messages = [];
    const context = vm.createContext({
        currentGame: { status: "G", roundStarterName: "Bjørn", piles: [] }, currentPlayerName: "Bjørn",
        starterFlashTimer: null, STARTER_FLASH_DURATION_MS: 1000,
        announcedStarterRound: null, announcedBomsStarterGame: null,
        GamePresence: { now: () => 1000, isActionPaused: game => game.paused === true },
        showGameToast: (text, game, duration, pauseId, endsTrick, includeInLog) =>
            messages.push({ text, includeInLog }),
        document: { querySelectorAll: () => [] }, setTimeout: () => 1, clearTimeout() {}
    });
    vm.runInContext(source.slice(source.indexOf("        function flashRoundStarter()"),
        source.indexOf("        function dealCardsIntoHand()")), context);
    context.flashRoundStarter();
    assert.equal(messages.length, 0);
    context.currentPlayerName = "Guest";
    context.flashRoundStarter();
    assert.equal(messages.length, 0);
    context.currentGame = {
        id: "test", round: 2, status: "S", turn: 0, paused: true,
        players: [{ name: "Bjørn", lastPlacement: 3 }, { name: "Guest" }, { name: "Other" }],
        piles: []
    };
    context.flashRoundStarter();
    assert.equal(messages.length, 0);
    context.currentGame.paused = false;
    context.flashRoundStarter();
    assert.equal(messages.pop().text, "Bjørn er Boms og starter.");
    context.flashRoundStarter();
    assert.equal(messages.length, 0, "Snapshots must not repeat the starter announcement");
    context.currentGame = { id: "test", round: 3, status: "S", turn: 0, players: [{ name: "Guest" }], piles: [] };
    context.flashRoundStarter();
    const reminder = messages.pop();
    assert.equal(reminder.text, "Du begynner");
    assert.equal(reminder.includeInLog, false);
    context.currentGame = {
        id: "test", round: 4, status: "S", turn: 0,
        players: [{ name: "Bjørn", lastPlacement: 3 }, { name: "Guest" }, { name: "Other" }],
        piles: []
    };
    context.flashRoundStarter();
    const announcement = messages.pop();
    assert.equal(announcement.text, "Bjørn begynner");
    assert.equal(announcement.includeInLog, true);
    context.currentGame = {
        id: "test", round: 5, status: "S", turn: 0,
        players: [{ name: "Guest" }], piles: [{ name: "Other" }]
    };
    context.flashRoundStarter();
    assert.equal(messages.length, 0, "Starter messages are not shown while a trick is on the board");
});

test("lobby colors stay distinct and at least 60 degrees apart for humans and bots", () => {
    const { assignPlayerColors } = loadGame();
    const checkColors = game => {
        assignPlayerColors(game);
        const hues = game.players.map(player => Number(player.displayColor.match(/^hsl\((\d+) 82% 70%\)$/)[1]));
        assert.equal(new Set(hues).size, game.players.length);
        for (let i = 0; i < hues.length; i++) {
            for (let j = i + 1; j < hues.length; j++) {
                const distance = Math.abs(hues[i] - hues[j]);
                assert.ok(Math.min(distance, 360 - distance) >= 60);
            }
        }
        return Object.fromEntries(game.players.map(player => [player.name, player.displayColor]));
    };
    for (let room = 0; room < 360; room++) {
        const game = {
            id: String(room),
            players: ["Guest", "Guest-1", "Tante_Pose", "ギフテッド"].map((name, index) =>
                ({ name, playerKey: index < 2 ? "shared-human-key" : "PC" }))
        };
        for (let count = 1; count <= 4; count++) {
            checkColors({ id: game.id, players: game.players.slice(0, count) });
        }
        const initial = checkColors(game);
        game.players.reverse();
        assert.deepEqual(checkColors(game), initial);
        const snapshot = { id: game.id, players: game.players.map(({ name, playerKey }) => ({ name, playerKey })) };
        assert.deepEqual(checkColors(snapshot), initial);
        game.players[0] = { name: "New arrival", playerKey: "new-key" };
        checkColors(game);
        game.players[1].name = "Renamed";
        checkColors(game);
    }
});

test("assigned lobby colors persist across serialization and roster changes", () => {
    const { assignPlayerColors, PresidentPlayer } = loadGame();
    const game = {
        id: "stable-colors",
        players: [
            new PresidentPlayer("Alice", "alice-key"),
            new PresidentPlayer("Bob", "bob-key")
        ]
    };
    assignPlayerColors(game);
    const initialColors = Object.fromEntries(
        game.players.map(player => [player.name, player.displayColor])
    );
    game.players = PresidentPlayer.deserializePlayers(game.players.map(player => player.toRecord()));
    game.players.push(new PresidentPlayer("Casey", "casey-key"));
    assignPlayerColors(game);
    assert.deepEqual(
        Object.fromEntries(game.players.slice(0, 2).map(player => [player.name, player.displayColor])),
        initialColors
    );
    game.players.pop();
    game.players.push(new PresidentPlayer("Dana", "dana-key"));
    assignPlayerColors(game);
    assert.deepEqual(
        Object.fromEntries(game.players.slice(0, 2).map(player => [player.name, player.displayColor])),
        initialColors
    );
});

test("club three glints once per played pause, with a muted loss color and no movement", () => {
    const { GameLayout, PresidentCard } = loadGame();
    const classes = new Set();
    const target = {
        classList: {
            add: value => classes.add(value),
            toggle: (value, active) => active ? classes.add(value) : classes.delete(value)
        }
    };
    let sender = { placement: 0 };
    const game = { getPlayer: () => sender };
    const table = {
        dataset: { turnPauseId: "room:1" },
        querySelector: selector => {
            assert.equal(selector, '.table-play__card[data-card-key="3:3"]');
            return target;
        }
    };
    game.turnPause = { playedPile: { name: "Player", cards: PresidentCard.serializeDeck([new PresidentCard(2, 3)]) } };
    GameLayout.flashClubThree(game, table, "room:1");
    assert.equal(classes.size, 0);
    game.turnPause.playedPile.cards = PresidentCard.serializeDeck([new PresidentCard(3, 3)]);
    GameLayout.flashClubThree(game, table, "room:1");
    assert.deepEqual([...classes], ["club-three-glint"]);
    classes.clear();
    GameLayout.flashClubThree(game, table, "room:1");
    assert.equal(classes.size, 0);
    table.dataset.turnPauseId = "room:2";
    sender = { placement: 3 };
    GameLayout.flashClubThree(game, table, "room:1");
    assert.equal(classes.size, 0);
    GameLayout.flashClubThree(game, table, "room:2");
    assert.deepEqual([...classes], ["club-three-glint", "club-three-glint--loss"]);
});

test("settings show the localized selected style name and refresh the shared preview", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { PresidentCard } = loadGame();
    const label = {};
    let previewUpdates = 0;
    const context = vm.createContext({
        PresidentCard, style: "holo", selectedName: "Holo",
        playerRoundsPlayed: 0, playerWinsLoading: false, playerWinsError: false,
        GameLayout: { cardStyle: () => context.style, canUseBotanicalStyle: () => true },
        localizedMessage: text => "Translated " + text,
        updateCardAppearancePreview: () => previewUpdates++,
        document: {
            documentElement: { dataset: {} },
            getElementById: id => id == "cardStyleCurrentName" ? label : {},
            querySelectorAll: () => [],
            querySelector: () => ({
                textContent: context.selectedName,
                parentElement: {}
            })
        }
    });
    const start = source.indexOf("        function updateCardStyleButtons()");
    vm.runInContext(source.slice(start, source.indexOf("        updateCardStyleButtons();", start)), context);
    for (const name of ["Holo", "Gull", "Pixel Art", "Parallax", "Neon", "Vanlig", "Grønn tåke"]) {
        context.selectedName = name;
        context.updateCardStyleButtons();
        assert.equal(label.textContent, "Translated " + name);
    }
    assert.equal(previewUpdates, 7);
});

test("rank icons show streaks only for consecutive presidents and boms", () => {
    const { PresidentGame, PresidentPlayer, resultIconForPlacement } = loadGame();
    const players = ["Winner", "Middle", "Last"].map(name => new PresidentPlayer(name, name));
    const game = Object.assign(Object.create(PresidentGame.prototype), { players, status: "S" });
    const finishRound = () => {
        players.forEach(player => { player.placement = 0; });
        players.forEach(player => game.finishPlayer(player));
    };
    finishRound();
    assert.equal(resultIconForPlacement(game, 1, players[0]), "👑");
    assert.equal(resultIconForPlacement(game, 3, players[2]), "🗑️");
    for (const count of [2, 3, 4]) {
        finishRound();
        assert.equal(resultIconForPlacement(game, 1, players[0]), `👑 🔥 ×${count}`);
        assert.equal(resultIconForPlacement(game, 2, players[1]), null);
        assert.equal(resultIconForPlacement(game, 3, players[2]), `🗑️ 🌧️ ×${count}`);
        assert.equal(resultIconForPlacement(game, 1), "👑");
        assert.equal(resultIconForPlacement(game, 3), "🗑️");
        const restored = new PresidentPlayer().fromRecord(players[0].toRecord());
        assert.equal(resultIconForPlacement(game, 1, restored), `👑 🔥 ×${count}`);
    }
    players.reverse();
    finishRound();
    assert.equal(resultIconForPlacement(game, 1, players[0]), "👑");
    assert.equal(resultIconForPlacement(game, 3, players[2]), "🗑️");
    assert.equal(players[0].bomsStreak, 0);
    assert.equal(players[2].presidentStreak, 0);
});

test("result ranks are fitted while names keep readable ellipsis", () => {
    const targets = [".game-over__rank"];
    const elements = targets.map(() => ({ style: {}, clientWidth: 120,
        get scrollWidth() { return 160 * (parseFloat(this.style.fontSize) || 16) / 16; }
    }));
    const observed = [];
    const { GameLayout } = loadGame(null, {
        requestAnimationFrame: callback => callback(),
        getComputedStyle: () => ({ fontSize: "16px" }),
        ResizeObserver: class {
            constructor(callback) { this.callback = callback; }
            disconnect() { observed.length = 0; }
            observe(element) { observed.push(element); }
        },
        document: { querySelectorAll: selector => {
            assert.deepEqual(selector.split(", "), targets);
            return elements;
        } }
    });
    GameLayout.fitNames();
    for (const element of elements) {
        assert.ok(element.scrollWidth <= element.clientWidth);
        assert.equal(element.style.fontSize, "12px");
    }
    assert.deepEqual(observed, elements);
    elements[0].clientWidth = 100;
    GameLayout.nameResizeObserver.callback([{ target: elements[0] }]);
    assert.ok(elements[0].scrollWidth <= 100);
});

test("names expand by click or keyboard for exactly three seconds without triggering gameplay", () => {
    const elements = new Map();
    const timers = [];
    const makeElement = () => ({
        textContent: "", style: {}, attrs: {},
        setAttribute(key, value) { this.attrs[key] = value; },
        remove() { elements.delete(this.id); },
        getBoundingClientRect: () => ({ left: 300, bottom: 100 })
    });
    const { GameLayout } = loadGame(null, {
        window: { innerWidth: 375, innerHeight: 800 },
        document: {
            getElementById: id => elements.get(id), createElement: makeElement,
            body: { appendChild(element) { elements.set(element.id, element); } }
        },
        setTimeout(callback, duration) { timers.push({ callback, duration }); return timers.length; },
        clearTimeout(id) { timers[id - 1].cleared = true; }
    });
    const name = makeElement();
    name.textContent = "Sjefen_Over_Alle_Sjefer";
    GameLayout.enableNameExpansion(name);
    let stopped = 0;
    name.onclick({ stopPropagation() { stopped++; } });
    assert.equal(elements.get("expandedPlayerName").textContent, name.textContent);
    assert.equal(name.attrs["aria-expanded"], "true");
    assert.equal(timers[0].duration, 3000);
    name.onkeydown({ key: "Enter", preventDefault() {}, stopPropagation() { stopped++; } });
    assert.equal(timers[0].cleared, true);
    assert.equal(timers[1].duration, 3000);
    timers[1].callback();
    assert.equal(elements.size, 0);
    assert.equal(name.attrs["aria-expanded"], "false");
    assert.equal(stopped, 2);
});

function resumableGameContext() {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const storage = new Map();
    const button = {};
    const state = { now: Date.now(), listeners: new Map(), timers: [], record: null, transactions: 0 };
    class Clock extends Date {
        static now() { return state.now; }
    }
    const { GamePresence } = loadGame(null, { Date: Clock });
    const ref = {
        key: "123",
        on(type, listener) { state.listeners.set(listener, listener); },
        off(type, listener) { state.listeners.delete(listener); },
        remove() { state.listingRemoved = true; return Promise.resolve(); },
        transaction(transform) {
            state.transactions++;
            const next = transform(state.record);
            if (next) { state.record = next; }
            return Promise.resolve({ committed: !!next });
        }
    };
    const context = vm.createContext({
        console, Date: Clock, GamePresence, PUBLIC_LOBBY_PATH: "boms_public",
        currentGame: { id: "123" }, getPlayerKey: () => "owner",
        document: { getElementById: () => button },
        firebase: { database: () => ({ ref: () => ref }) },
        setTimeout(callback, delay) {
            state.timers.push({ callback, delay });
            return state.timers.length;
        },
        clearTimeout(id) { state.timers[id - 1].cleared = true; },
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        }
    });
    vm.runInContext(source.slice(source.indexOf('        var resumeStorageKey ='),
        source.indexOf("        function refreshConnectionView()")), context);
    function emit(record) {
        state.record = record;
        for (const listener of [...state.listeners.values()]) {
            listener({ val: () => record });
        }
    }
    const record = {
        status: "S", lastHumanActionAt: state.now,
        spillere: [{ nick: "Owner", spillerKey: "owner" }]
    };
    return { context, storage, button, state, emit, record };
}

test("new room creation is visible locally before its listener subscribes", () => {
    const writes = [];
    const root = {
        transaction(transform, complete, applyLocally) {
            writes.push({ record: transform(null), applyLocally });
            return Promise.resolve();
        }
    };
    const database = () => ({
        ref: path => path.startsWith("boms_1/") ? root : { remove: () => Promise.resolve() }
    });
    database.ServerValue = { TIMESTAMP: { ".sv": "timestamp" } };
    const { PresidentGame } = loadGame(null, { firebase: { database } });
    const game = new PresidentGame();
    assert.equal(writes[0].record.status, "O");
    assert.equal(writes[0].applyLocally, true);
    game.save();
    assert.equal(writes[1].applyLocally, false);
});

test("resumable games validate identity and room ID, persist the seat and clear on explicit leave", () => {
    const { context, storage, button, state, emit, record } = resumableGameContext();
    context.updateResumeButton();
    assert.equal(button.hidden, true);
    context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
    assert.equal(button.hidden, true);
    emit(record);
    assert.equal(button.hidden, false);
    assert.equal(context.readResumableGame().name, "Owner");
    storage.set("norwegian-tycoon-active-game", JSON.stringify({ id: "123", name: "Other", playerKey: "other" }));
    assert.equal(context.readResumableGame(), null);
    storage.set("norwegian-tycoon-active-game", JSON.stringify({ id: "../invalid", name: "Owner", playerKey: "owner" }));
    assert.equal(context.readResumableGame(), null);
    context.forgetActiveGame();
    assert.equal(button.hidden, true);
    assert.equal(storage.size, 0);
    assert.equal(state.listeners.size, 0);
});

test("resume hides and voids a session more than ten minutes after the last human move", async () => {
    const { context, button, state, emit, record, storage } = resumableGameContext();
    context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
    emit(record);
    state.now += 600000;
    emit(record);
    assert.equal(button.hidden, false);
    state.now++;
    state.timers.at(-1).callback();
    assert.equal(button.hidden, true);
    assert.equal(state.record.status, "V");
    assert.equal(state.transactions, 1);
    assert.equal(storage.size, 0);
    assert.equal(state.listeners.size, 0);
    await Promise.resolve();
    assert.equal(state.listingRemoved, true);
});

test("resume validation rejects deleted, voided, expired, missing and surrendered seats", () => {
    for (const invalid of [
        null, { status: "V" }, { lastHumanActionAt: 1 }, { spillere: [] },
        { spillere: [{ nick: "Owner", spillerKey: "other" }] },
        { spillere: [{ nick: "Owner", spillerKey: "owner", gaveUp: true }] }
    ]) {
        const { context, button, state, emit, record, storage } = resumableGameContext();
        context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
        emit(invalid === null ? null : { ...record, ...invalid });
        assert.equal(button.hidden, true);
        assert.equal(storage.size, 0);
        assert.equal(state.listeners.size, 0);
    }
});

test("human activity resets the resume deadline and stale timers cannot clear another saved seat", () => {
    const { context, button, state, emit, record, storage } = resumableGameContext();
    context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
    emit(record);
    const oldTimer = state.timers[0];
    state.now += 500000;
    emit({ ...record, lastHumanActionAt: state.now });
    assert.equal(oldTimer.cleared, true);
    assert.equal(state.timers.at(-1).delay, 600001);
    context.currentGame.id = "456";
    context.rememberActiveGame({ name: "Guest", playerKey: "owner" });
    oldTimer.callback();
    assert.equal(context.readResumableGame().id, "456");
    assert.equal(storage.size, 1);
    assert.equal(button.hidden, true);
});

test("an old room listener cannot clear a different seat saved by another tab", () => {
    const { context, button, state, emit, record, storage } = resumableGameContext();
    context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
    emit(record);
    storage.set("norwegian-tycoon-active-game",
        JSON.stringify({ id: "456", name: "Guest", playerKey: "owner" }));
    state.now += 600001;
    state.timers.at(-1).callback();
    assert.equal(context.readResumableGame().id, "456");
    assert.equal(button.hidden, true);
    assert.equal(state.transactions, 0);
});

test("resume deadlines follow server time even when the local clock is skewed", () => {
    for (const offset of [-120000, 120000]) {
        const { context, button, state, emit, record } = resumableGameContext();
        context.updateSessionClock({ val: () => offset });
        context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
        emit({ ...record, lastHumanActionAt: state.now + offset });
        assert.equal(button.hidden, false);
        assert.equal(state.timers.at(-1).delay, 600001);
        state.now += 600001;
        state.timers.at(-1).callback();
        assert.equal(button.hidden, true);
        assert.equal(state.record.status, "V");
    }
});

test("a server clock correction immediately revalidates the saved game", () => {
    const { context, button, state, emit, record } = resumableGameContext();
    context.rememberActiveGame({ name: "Owner", playerKey: "owner" });
    emit(record);
    state.now += 500000;
    context.updateSessionClock({ val: () => 100001 });
    assert.equal(button.hidden, true);
    assert.equal(state.record.status, "V");
});

test("joining a voided or expired room does not leave the current game", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { GamePresence } = loadGame();
    for (const record of [{ status: "V" }, { status: "S", lastHumanActionAt: Date.now() - 600001 }]) {
        let failure = "";
        let voids = 0;
        const game = { id: "456" };
        const context = vm.createContext({
            currentGame: game, GamePresence,
            showPublicLobbyError() {},
            voidExpiredSession() { voids++; },
            leaveCurrentGame() { assert.fail("The current game must not be left"); },
            firebase: { database: () => ({ ref: () => ({
                once: async () => ({ exists: () => true, val: () => record })
            }) }) }
        });
        const start = source.indexOf("        function joinGameById(");
        const end = source.indexOf("        document.getElementById('dialogKobleSpillOk')", start);
        vm.runInContext(source.slice(start, end), context);
        context.joinGameById("123", text => { failure = text; });
        await Promise.resolve();
        assert.match(failure, /Kunne ikke koble til/);
        assert.equal(context.currentGame, game);
        assert.equal(voids, 1);
    }
});

test("takeover bots run on the backup client after 120 seconds while host transfer still waits", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { GamePresence } = loadGame();
    const now = Date.now();
    const owner = { name: "Owner", playerKey: "human-key", placement: 0 };
    const host = { name: "Guest", playerKey: "guest", placement: 0 };
    const game = {
        status: "S", turn: 1, turnPause: null, hostKey: "guest", hostName: "Guest",
        players: [owner, host], localPlayerName: "Owner", presence: {}, controllers: {}
    };
    const hostId = GamePresence.playerId(host);
    game.controllers[hostId] = { since: now };
    game.presence[hostId] = { tab: { online: false, changedAt: now - 119999 } };
    game.presence[GamePresence.playerId(owner)] = { tab: { online: true, changedAt: now } };
    let plays = 0;
    let scheduled = 0;
    const context = vm.createContext({
        currentGame: game, GamePresence, connection: { now: () => now },
        shuffleEndsAt: 0, animationDuration: (_, normal) => normal,
        playBotTurn: (room, player) => { assert.equal(room, game); assert.equal(player, host); plays++; },
        setTimeout: () => { scheduled++; return scheduled; }
    });
    const start = source.indexOf("        var botLoopTimer = null;");
    const end = source.indexOf("        document.getElementById('BnFHovedmeny')", start);
    vm.runInContext(source.slice(start, end), context);
    context.runBotLoop();
    assert.equal(plays, 0);
    game.presence[hostId].tab.changedAt = now - 120000;
    context.runBotLoop();
    assert.equal(plays, 1);
    assert.equal(scheduled, 1);
    assert.equal(game.hostKey, "guest");
});

test("expired result votes keep the vote count without tie hints or stale seconds", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const countdown = {};
    let resolutions = 0;
    const player = { name: "Guest", playerKey: "guest" };
    const game = {
        status: "F", players: [player], roundStartVote: null,
        gameEndVote: { id: "vote", until: 100, votes: [{ playerId: "guest", choice: "lobby" }] },
        resolveGameEndVote(force) { assert.equal(force, true); resolutions++; }
    };
    const context = vm.createContext({
        currentGame: game, gameEndVoteRefreshTimer: null,
        GamePresence: loadGame().GamePresence,
        Date: { now: () => 200 }, isLobbyHost: () => false,
        roundVotePlayerId: player => player.playerKey,
        document: { getElementById: () => countdown },
        setTimeout: () => assert.fail("expired vote must not schedule a timer")
    });
    vm.runInContext(source.slice(source.indexOf("        function handleGameEndVote("),
        source.indexOf("        function dismissGameToast(")), context);
    context.handleGameEndVote(game);
    assert.equal(countdown.textContent, "1 av 1 har stemt.");
    assert.equal(resolutions, 1);
});

function publicLobbyContext() {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const element = (tag = "div") => {
        const node = {
            tag, className: "", dataset: {}, children: [], hidden: false, textContent: "",
            appendChild(child) { child.parent = this; this.children.push(child); },
            append(...children) { children.forEach(child => this.appendChild(child)); },
            remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
            setAttribute() {}, addEventListener(type, callback) { this[type] = callback; },
            querySelectorAll(selector) {
                return this.children.flatMap(child => [
                    ...(selector === child.tag || child.className.split(" ").includes(selector.slice(1)) ? [child] : []),
                    ...child.querySelectorAll(selector)
                ]);
            },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        };
        node.classList = { toggle(name, enabled) {
            const classes = new Set(node.className.split(" ").filter(Boolean));
            if (enabled) { classes.add(name); } else { classes.delete(name); }
            node.className = [...classes].join(" ");
        } };
        return node;
    };
    const list = element();
    const state = { fetches: 0, errors: [], joins: [], timer: null, listener: null, pending: null };
    const snapshot = records => ({ forEach: callback => records.forEach(record => callback({ val: () => record })) });
    const context = vm.createContext({
        console: { error: (...args) => state.errors.push(args) }, currentGame: null,
        PUBLIC_LOBBY_PATH: "boms_public", PUBLIC_LOBBY_MAX_AGE_MS: 7200000, MAX_PLAYERS: 4,
        localizedMessage: message => message,
        gameTurnSeconds: value => [1, 2, 3].includes(Number(value)) ? Number(value) : 2,
        document: {
            hidden: false, createElement: element, getElementById: () => list,
            addEventListener: (type, callback) => { state.listener = callback; }
        },
        firebase: { database: () => ({ ref: () => ({
            on(type, callback) { state.update = records => callback(snapshot(records)); },
            once() { state.fetches++; return state.pending || Promise.resolve(snapshot(state.records || [])); }
        }) }) },
        setInterval: (callback, delay) => { state.timer = callback; assert.equal(delay, 15000); },
        joinGameById(id) { state.joins.push(id); }
    });
    vm.runInContext(source.slice(source.indexOf("        var publicLobbies = [];"),
        source.indexOf('        document.getElementById("gameTable").addEventListener("click"', source.indexOf("        var publicLobbies = [];"))), context);
    return { context, list, state, snapshot };
}

test("public lobby rows remain clickable join buttons before and after refresh", () => {
    const { list, state } = publicLobbyContext();
    const lobby = { id: "123", host: "Host", players: 2, waiting: true, ts: Date.now() };
    state.update([lobby]);
    const button = list.querySelector(".public-lobby-entry");
    assert.equal(button.tag, "button");
    assert.equal(button.type, "button");
    button.click();
    state.update([{ ...lobby, players: 3 }]);
    assert.equal(list.querySelector(".public-lobby-entry"), button);
    button.click();
    assert.deepEqual(state.joins, ["123", "123"]);
});

test("public lobby rows describe personal animation speed instead of a shared pause", () => {
    const { list, state } = publicLobbyContext();
    const lobby = { id: "123", host: "Host", players: 2, waiting: true, ts: Date.now() };
    state.update([lobby]);
    const button = list.querySelector(".public-lobby-entry");
    assert.equal(button.children[1].textContent, "Personlig animasjonshastighet");
    assert.equal(button.children[1].className, "public-lobby-entry__speed");
    state.update([{ ...lobby, turnSeconds: 1 }]);
    assert.equal(list.querySelector(".public-lobby-entry"), button);
    assert.equal(button.children[1].textContent, "Personlig animasjonshastighet");
    state.update([{ ...lobby, turnSeconds: 3 }]);
    assert.equal(button.children[1].textContent, "Personlig animasjonshastighet");
});

test("public lobby refresh keeps existing buttons, order and scroll position", () => {
    const { list, state } = publicLobbyContext();
    const lobby = (id, players = 1) => ({ id, host: id, players, waiting: true, ts: Date.now() });
    state.update([lobby("one"), lobby("two")]);
    const buttons = list.querySelectorAll(".public-lobby-entry");
    list.scrollTop = 30;
    state.update([lobby("two"), lobby("one")]);
    assert.deepEqual(list.querySelectorAll(".public-lobby-entry"), buttons);
    assert.equal(list.scrollTop, 30);
    state.update([lobby("one", 3), lobby("two"), lobby("three")]);
    assert.deepEqual(list.querySelectorAll(".public-lobby-entry").slice(0, 2), buttons);
    assert.equal(buttons.find(button => button.dataset.lobbyId === "one").children[0].textContent, "one · 3/4");
    assert.equal(list.querySelectorAll(".public-lobby-entry").length, 3);
    state.update([]);
    assert.equal(list.querySelectorAll(".public-lobby-entry").length, 0);
    assert.equal(list.querySelector(".public-lobby-empty").hidden, false);
    assert.equal(list.querySelector(".public-lobby-random").hidden, true);
});

test("15-second lobby polling skips games, hidden pages and overlapping requests, and reports failures", async () => {
    const { context, list, state, snapshot } = publicLobbyContext();
    state.records = [{ id: "new", host: "Host", players: 2, ts: Date.now() }];
    await state.timer();
    assert.equal(state.fetches, 1);
    assert.equal(list.querySelector(".public-lobby-entry").dataset.lobbyId, "new");
    context.currentGame = {};
    await state.timer();
    context.currentGame = null;
    context.document.hidden = true;
    await state.timer();
    assert.equal(state.fetches, 1);
    context.document.hidden = false;
    let resolve;
    state.pending = new Promise(callback => { resolve = callback; });
    const refresh = state.listener();
    await state.timer();
    assert.equal(state.fetches, 2);
    resolve(snapshot(state.records));
    await refresh;
    state.pending = Promise.reject(new Error("offline"));
    await state.timer();
    assert.equal(state.errors.length, 1);
    assert.match(state.errors[0][0], /Kunne ikke oppdatere/);
    assert.ok(list.querySelector(".public-lobby-entry"));
    state.pending = null;
    await state.timer();
    assert.equal(state.fetches, 4);
});

test("invites generate gameid links and accept both new and legacy links", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        const inviteParams");
    const end = source.indexOf('        document.getElementById("resumeGameButton").addEventListener', start);
    for (const [search, expected] of [
        ["?gameid=123", "123"], ["?spillid=456", "456"],
        ["?gameid=123&spillid=456", "123"], ["?gameid=invalid", null], ["", null]
    ]) {
        let joined = null;
        let invite;
        let click;
        const context = vm.createContext({
            URL, URLSearchParams, currentGame: { id: "789" }, currentPlayerName: "Guest",
            window: { location: { search } },
            PresidentGame: class { constructor(id) { this.id = id; } },
            connectAndPromptForPlayerName() { joined = context.currentGame.id; },
            showInviteLink(id, url) { invite = { id, url }; },
            document: {
                baseURI: "https://playboms.eu/?spillid=456#old",
                getElementById: () => ({ addEventListener(type, callback) { click = callback; } })
            }
        });
        const inviteListenerStart = source.indexOf("        document.getElementById('BnFInviterSpill').addEventListener", end);
        const inviteListenerEnd = source.indexOf("        var GAME_SPEED_MS", inviteListenerStart);
        vm.runInContext(source.slice(start, end) + source.slice(inviteListenerStart, inviteListenerEnd), context);
        assert.equal(joined, expected);
        context.currentGame = { id: "789" };
        click();
        assert.deepEqual(invite, { id: "789", url: "https://playboms.eu/?gameid=789" });
    }
});

test("Messenger sharing uses the invitation URL and explains unsupported desktop sharing", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const start = html.indexOf("            async function shareInviteMessenger()");
    const end = html.indexOf("            function sendInviteSms()", start);
    const status = {};
    const inviteUrl = "https://playboms.eu/?gameid=123";
    const context = vm.createContext({
        navigator: { userAgent: "Android" }, window: { location: {} },
        document: { getElementById: id => id == "dialogVisLinkStatus" ? status : { value: inviteUrl } }
    });
    vm.runInContext(html.slice(start, end), context);
    await context.shareInviteMessenger();
    assert.equal(context.window.location.href, "fb-messenger://share/?link=" + encodeURIComponent(inviteUrl));
    context.navigator.userAgent = "Desktop";
    await context.shareInviteMessenger();
    assert.match(status.textContent, /støttes ikke/);
    let shared;
    context.navigator.share = async data => { shared = data; };
    await context.shareInviteMessenger();
    assert.equal(shared.url, inviteUrl);
    assert.equal(status.textContent, "Invitasjonen er delt.");
});

test("new bot names are available and Japanese player names survive input and cookie sanitization", () => {
    const { BOT_NAMES, sanitizePlayerName } = loadGame();
    for (const name of ["Tante_Pose", "BobRoss", "IlIllIlIIl", "ギフテッド"]) {
        assert.ok(BOT_NAMES.includes(name));
    }
    for (const name of ["ギフテッド", "カービィ", "ぎふてっど", "日本語", "ギフト", "Bjørn 123 /- 😎"]) {
        assert.equal(sanitizePlayerName(name), name);
    }
    assert.equal(sanitizePlayerName('Name_<>"&()'), "Name");
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const context = vm.createContext({
        getCookie: () => encodeURIComponent("ギフテッド"),
        playerNameCookie: "norwegian_tycoon_player_name", sanitizePlayerName, console
    });
    vm.runInContext(source.slice(source.indexOf("        function readLastUsedPlayerName()"),
        source.indexOf("        function saveLastUsedPlayerName(")), context);
    assert.equal(context.readLastUsedPlayerName(), "ギフテッド");
});

test("an empty new-game name is marked invalid without registering a profile", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const elements = new Map();
    let addedPlayer;
    const player = { name: "player" };
    const game = {
        status: "O",
        async addPlayer(candidate) {
            addedPlayer = candidate;
            return { player };
        }
    };
    const context = vm.createContext({
        currentGame: game, currentPlayerName: null, pendingNewGameName: true,
        pendingSpectatorJoinName: null, getPlayerKey: () => "owner",
        PresidentPlayer: class { constructor(name, key) { this.name = name; this.playerKey = key; } },
        GameLayout: { updateSharedView() {}, updatePlayerView() {} },
        clearWaitingSpectator() {}, saveLastUsedPlayerName() {}, showDialog() {},
        applyPlayerIdentity: async () => {},
        document: {
            getElementById(id) {
                if (!elements.has(id)) {
                    elements.set(id, {
                        value: "",
                        textContent: "",
                        attributes: {},
                        classList: { toggle(name, value) { this[name] = value; } },
                        setAttribute(name, value) { this.attributes[name] = value; },
                        addEventListener(type, callback) { this.click = callback; }
                    });
                }
                return elements.get(id);
            }
        }
    });
    const start = source.indexOf("        document.getElementById('dialogSporOmNickOk').addEventListener");
    const end = source.indexOf("        document.getElementById('BnPGiOpp')", start);
    vm.runInContext(source.slice(start, end), context);
    await context.document.getElementById("dialogSporOmNickOk").click();
    assert.equal(addedPlayer, undefined);
    assert.equal(context.currentPlayerName, null);
    assert.equal(context.pendingNewGameName, true);
    const name = context.document.getElementById("dialogSporOmNickTxt");
    assert.equal(name.classList["input-soft-error"], true);
    assert.equal(name.attributes["aria-invalid"], "true");
});

test("canceling a new-game name prompt voids the empty lobby after creation and returns to the menu", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const state = { created: false, voided: false, left: false, dialogs: [] };
    let finishCreation;
    const game = {
        status: "O", players: [],
        creation: new Promise(resolve => { finishCreation = resolve; }),
        save() {
            assert.equal(state.created, true);
            state.voided = this.status == "V";
        }
    };
    const cancelButton = { addEventListener(type, callback) { this.click = callback; } };
    const context = vm.createContext({
        currentGame: game, pendingNewGameName: true,
        showDialog: (...args) => state.dialogs.push(args),
        leaveCurrentGame() { state.left = true; context.currentGame = null; },
        document: { getElementById: () => cancelButton }
    });
    const start = source.indexOf('        document.getElementById("dialogSporOmNickCancel").addEventListener');
    const end = source.indexOf("        document.getElementById('dialogSporOmNickOk')", start);
    vm.runInContext(source.slice(start, end), context);
    const cancel = cancelButton.click();
    assert.equal(state.dialogs[0][1], false);
    assert.equal(state.left, true);
    assert.equal(context.currentGame, null);
    assert.equal(context.pendingNewGameName, false);
    state.created = true;
    finishCreation();
    await cancel;
    assert.equal(state.voided, true);
});

test("secret style remains available on the main menu through the saved name", () => {
    const elements = new Map();
    const document = {
        documentElement: { dataset: {} }, querySelectorAll: () => [],
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    hidden: false, dataset: {}, style: {}, classList: { remove() {} }, setAttribute() {}
                });
            }
            return elements.get(id);
        }
    };
    const { GameLayout } = loadGame("botanical", { document, setClass() {} });
    for (const name of ["MRHOTBOX", "Tåkefyrsten", "BJØRN", "Guest"]) {
        GameLayout.savedPlayerName = name;
        GameLayout.cardStylePlayerName = null;
        GameLayout.updateSharedView(null, null);
        assert.equal(elements.get("BnFRegler").hidden, false);
        assert.equal(GameLayout.cardStylePlayerName, name);
        assert.equal(GameLayout.cardStyle(), name == "Guest" ? "normal" : "botanical");
        assert.equal(document.documentElement.dataset.cardStyle, GameLayout.cardStyle());
    }
});

test("lobby capacity counts filled seats for every player count", () => {
    const elements = new Map();
    const { GameLayout } = loadGame(null, {
        setClass() {},
        document: {
            documentElement: { dataset: {} }, querySelectorAll: () => [],
            getElementById(id) {
                if (!elements.has(id)) {
                    elements.set(id, { dataset: {}, style: {}, classList: { remove() {} }, setAttribute() {} });
                }
                return elements.get(id);
            }
        }
    });
    for (const method of ["updateGameButtons", "updatePlayers", "updateTable", "fitNames"]) {
        GameLayout[method] = () => {};
    }
    for (let count = 1; count <= 4; count++) {
        GameLayout.updateSharedView({ id: "lobby", status: "O", players: Array(count) }, null);
        assert.equal(elements.get("lobbyCapacity").textContent, `${count}/4 plasser fylt`);
        assert.equal(elements.get("lobbyCapacity").hidden, false);
    }
    for (const seconds of [1, 3]) {
        GameLayout.updateSharedView({ id: "lobby", status: "O", players: Array(2), turnSeconds: seconds }, null);
        assert.equal(elements.get("lobbyCapacity").textContent, "2/4 plasser fylt");
    }
    GameLayout.updateSharedView({ id: "lobby", status: "S", players: [] }, null);
    assert.equal(elements.get("lobbyCapacity").hidden, true);
});

test("lobby slots follow player order for every viewer and reuse faded empty seats", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8")
        .replace(/\r\n/g, "\n");
    const start = source.indexOf("        var placeElement =");
    const end = source.indexOf("\n    }\n    static capturePlayOrigins", start);
    function element() {
        return {
            children: [], className: "", dataset: {},
            insertBefore(child, reference) {
                child.remove();
                const index = reference ? this.children.indexOf(reference) : this.children.length;
                this.children.splice(index, 0, child);
                child.parent = this;
            },
            remove() {
                if (this.parent) {
                    this.parent.children.splice(this.parent.children.indexOf(this), 1);
                    this.parent = null;
                }
            },
            querySelectorAll(selector) {
                assert.equal(selector, ".lobby-empty-seat");
                return this.children.filter(child => child.className === "lobby-empty-seat");
            }
        };
    }
    const players = Array.from({ length: 4 }, (_, index) => ({ name: `Player ${index}` }));
    const summaries = new Map(players.map(player => [player.name, element()]));
    const playerList = element();
    const context = vm.createContext({
        MAX_PLAYERS: 4, playerList, document: { createElement: element },
        game: { status: "O", players: [] }, currentPlayer: null,
        existingElements: new Map(),
        updatePlayerSummary(player, self) {
            const summary = summaries.get(player.name);
            summary.dataset.playerName = player.name;
            summary.self = self;
            return summary;
        }
    });
    const render = () => vm.runInContext(`(function () { ${source.slice(start, end)} })()`, context);
    for (const viewer of [null, ...players]) {
        context.currentPlayer = viewer;
        for (const count of [0, 1, 2, 3, 4, 3, 2, 1]) {
            context.game.players = players.slice(0, count);
            render();
            assert.equal(playerList.children.length, 4);
            assert.deepEqual(playerList.children.slice(0, count).map(child => child.dataset.playerName),
                players.slice(0, count).map(player => player.name));
            for (const child of playerList.children.slice(count)) {
                assert.equal(child.className, "lobby-empty-seat");
                assert.equal(child.textContent, "Ledig plass");
            }
            const previous = playerList.children.slice();
            render();
            assert.deepEqual(playerList.children, previous);
        }
    }
});

test("disconnected ready players cannot start a lobby before readiness is reconciled", () => {
    const { PresidentGame, GamePresence } = loadGame();
    const player = { name: "Owner", playerKey: "human-key", ready: true };
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        players: [player], presence: {}, connectionOnline: true
    });
    assert.equal(game.allHumansReady(), true);
    game.presence[GamePresence.playerId(player)] = { tab: { online: false, changedAt: 100 } };
    assert.equal(game.allHumansReady(), false);
    game.presence[GamePresence.playerId(player)].other = { online: true, changedAt: 101 };
    assert.equal(game.allHumansReady(), true);
    game.connectionOnline = false;
    assert.equal(game.allHumansReady(), false);
});

test("waiting spectators register once, arm disconnect cleanup first and remove their own entry on leave", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        var spectatorJoinPending");
    const end = source.indexOf("        async function tryJoinWaitingSpectator", start);
    const calls = [];
    const ref = {
        onDisconnect() { return { remove: async () => { calls.push("disconnect"); } }; },
        set: async record => { calls.push(["set", record.playerKey]); },
        remove: async () => { calls.push("remove"); }
    };
    const game = { databaseRef: { child: key => {
        assert.equal(key, "waitingSpectators");
        return { push: () => ref };
    } } };
    const context = vm.createContext({
        currentGame: game, getPlayerKey: () => "viewer-key", console,
        showGameToast: () => assert.fail("unexpected presence error")
    });
    vm.runInContext(source.slice(start, end), context);
    await context.registerWaitingSpectator(game);
    await context.registerWaitingSpectator(game);
    assert.deepEqual(calls, ["disconnect", ["set", "viewer-key"]]);
    await context.clearWaitingSpectator();
    await context.clearWaitingSpectator();
    assert.deepEqual(calls, ["disconnect", ["set", "viewer-key"], "remove"]);
});

test("a spectator who leaves during registration is never added after leaving", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let armDisconnect;
    let writes = 0;
    const ref = {
        onDisconnect: () => ({ remove: () => new Promise(resolve => { armDisconnect = resolve; }) }),
        set: async () => { writes++; }, remove: async () => {}
    };
    const game = { databaseRef: { child: () => ({ push: () => ref }) } };
    const context = vm.createContext({ currentGame: game, getPlayerKey: () => "viewer-key", console });
    vm.runInContext(source.slice(source.indexOf("        var spectatorJoinPending"),
        source.indexOf("        async function tryJoinWaitingSpectator")), context);
    const registering = context.registerWaitingSpectator(game);
    await context.clearWaitingSpectator();
    context.currentGame = null;
    armDisconnect();
    await registering;
    assert.equal(writes, 0);
});

test("spectator join notices use the toast area with two lines for exactly three seconds", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const toast = {
        style: {}, classList: { add() {}, remove() { toast.closed = true; } },
        replaceChildren() {}
    };
    let callback;
    let duration;
    let hidden = false;
    const context = vm.createContext({
        gameToastsHidden: () => hidden,
        spectatorJoinToastTimer: null, localizedMessage: text => text,
        appendColoredGameMessage: (element, text, players, separateNotices) => {
            element.textContent = text;
            assert.equal(separateNotices, true);
        },
        document: { getElementById: id => id == "spectatorJoinToast" ? toast :
            { offsetTop: 116, offsetParent: null } },
        setTimeout: (fn, delay) => { callback = fn; duration = delay; return 1; }
    });
    const start = source.indexOf("        function showSpectatorJoinToast()");
    const end = source.indexOf("        async function clearWaitingSpectator()", start);
    vm.runInContext(source.slice(start, end), context);
    context.showSpectatorJoinToast();
    assert.equal(toast.style.top, undefined);
    assert.equal(toast.textContent, "Spillet pågår. Du ser på til neste runde.");
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(html, /id="playerActions"[\s\S]*?id="spectatorJoinToast"[\s\S]*?id="playerHand"/);
    assert.equal(duration, 3000);
    callback();
    assert.equal(toast.closed, true);
    hidden = true;
    duration = null;
    context.showSpectatorJoinToast();
    assert.equal(duration, null, "Hidden spectator notices must not schedule a toast");
});

test("every card renders in each style with distinct artwork", () => {
    const { PresidentCard } = loadGame();
    const styles = ["normal", "holo", "gold", "pixel", "parallax", "neon", "botanical",
        "monochrome", "minimalist", "cyberpunk", "glitched", "cosmic", "origami", "gothic", "silver", "crystal"];
    for (let suit = 1; suit <= 4; suit++) {
        for (let rank = 1; rank <= 13; rank++) {
            const card = new PresidentCard(suit, rank);
            const images = styles.map(style => card.toImageDataUri(style));
            assert.equal(new Set(images).size, styles.length);
            for (const image of images) {
                const svg = decodeURIComponent(image.split(",")[1]);
                assert.ok(svg.startsWith("<svg"));
                assert.ok(svg.endsWith("</svg>"));
                assert.equal(/undefined|NaN/.test(svg), false);
            }
        }
    }
});

test("new card styles can be restored from local settings", () => {
    for (const style of ["normal", "holo", "gold", "pixel", "parallax", "neon",
        "monochrome", "minimalist", "cyberpunk", "glitched", "cosmic", "origami", "gothic", "silver", "crystal"]) {
        assert.equal(loadGame(style).GameLayout.cardStyle(), style);
    }
    assert.equal(loadGame("invalid").GameLayout.cardStyle(), "normal");
});

test("card style menu groups related styles and keeps secret styles first", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const styles = Array.from(html.matchAll(/class="card-style-option" data-card-style="([^"]+)"/g),
        match => match[1]);
    assert.deepEqual(styles, [
        "botanical", "normal", "monochrome", "minimalist", "origami", "gothic",
        "silver", "gold", "crystal", "holo", "parallax", "cosmic", "pixel", "neon", "cyberpunk", "glitched"
    ]);
    const { PresidentCard } = loadGame();
    const monochrome = decodeURIComponent(new PresidentCard(2, 12).toImageDataUri("monochrome").split(",")[1]);
    for (const hex of monochrome.match(/#[0-9a-f]{6}/gi)) {
        assert.equal(hex.slice(1, 3), hex.slice(3, 5));
        assert.equal(hex.slice(3, 5), hex.slice(5, 7));
    }
    const cyberpunk = decodeURIComponent(new PresidentCard(1, 7).toImageDataUri("cyberpunk").split(",")[1]);
    assert.ok(cyberpunk.includes("#fff34d"));
    assert.ok(cyberpunk.includes("#a3ff45"));
});

test("secret card style requires an exact case-insensitive eligible player name", () => {
    const { GameLayout } = loadGame("botanical");
    for (const name of ["mrhotbox", "MRHOTBOX", "TåKeFyRsTeN", "BJØRN"]) {
        GameLayout.cardStylePlayerName = name;
        assert.equal(GameLayout.canUseBotanicalStyle(), true);
        assert.equal(GameLayout.cardStyle(), "botanical");
    }
    for (const name of [null, "", "Guest", "mrhotbox-1", "bjørn-1"]) {
        GameLayout.cardStylePlayerName = name;
        assert.equal(GameLayout.canUseBotanicalStyle(), false);
        assert.equal(GameLayout.cardStyle(), "normal");
    }
});

function setupGame({ deferProfileTransactions = false } = {}) {
    const profileRecords = {};
    const pendingProfileTransactions = [];
    const types = loadGame(null, {
        firebase: {
            database: () => ({
                ref(path) {
                    return {
                        transaction(update) {
                            const commit = () => {
                                const next = update(profileRecords[path]);
                                if (next !== undefined) { profileRecords[path] = next; }
                                return {
                                    committed: next !== undefined,
                                    snapshot: { val: () => profileRecords[path] }
                                };
                            };
                            return deferProfileTransactions
                                ? new Promise(resolve => pendingProfileTransactions.push(() => resolve(commit())))
                                : Promise.resolve(commit());
                        }
                    };
                }
            })
        }
    });
    const game = Object.create(types.PresidentGame.prototype);
    const players = [
        new types.PresidentPlayer("Human", "human-key"),
        new types.PresidentPlayer("Bot 1", "PC"),
        new types.PresidentPlayer("Bot 2", "PC")
    ];
    Object.assign(game, {
        id: "test", players, status: "S", piles: [], turn: 1,
        turnPause: null, rules: {}, round: 1, hostKey: "human-key",
        roundStartVote: null, gameEndVote: null, roundStarterName: null,
        shuffleStartedAt: null, preservePlayerOrderOnStart: false
    });
    game.updatePublicListing = () => {};
    const pile = (owner, rank, count = 4) => new types.CardPile(
        owner.name, ...Array.from({ length: count }, (_, suit) =>
            new types.PresidentCard(suit + 1, rank))
    );
    return { game, players, pile, types, profileRecords, pendingProfileTransactions };
}

test("completed games persist human names and award each president win once, including against bots", async () => {
    const { game, players, profileRecords } = setupGame();
    game.id = "completed-game";
    players[0].name = "Ada";
    players[0].placement = 1;
    players[1].placement = 2;
    players[2].placement = 3;
    players.push(new players[0].constructor("Grace", "other-human"));
    players[3].placement = 4;

    await game.recordFinishedPlayerStats();
    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].presidentWins, 1);
    assert.deepEqual(Array.from(profileRecords["playerStats/human-key"].names), ["Ada"]);
    assert.equal(profileRecords["playerStats/human-key"].presidentWinGames["completed-game"], true);
    assert.equal(profileRecords["playerStats/other-human"].presidentWins, 0);
    assert.deepEqual(Array.from(profileRecords["playerStats/other-human"].names), ["Grace"]);
    assert.equal(profileRecords["playerStats/PC"], undefined);

    players[0].name = "Ada Lovelace";
    game.id = "second-game";
    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].presidentWins, 2);
    assert.deepEqual(Array.from(profileRecords["playerStats/human-key"].names), ["Ada", "Ada Lovelace"]);
});

test("default player names never add president wins", async () => {
    const { game, players, profileRecords } = setupGame();
    players[0].name = "Player";
    players[0].placement = 1;
    players.push(new players[0].constructor("  SpIlLeR  ", "default-player-key"));
    players[3].placement = 1;

    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].presidentWins, 0);
    assert.equal(profileRecords["playerStats/human-key"].presidentWinGames["test"], undefined);
    assert.equal(profileRecords["playerStats/default-player-key"].presidentWins, 0);
    assert.equal(profileRecords["playerStats/default-player-key"].presidentWinGames["test"], undefined);
    assert.equal(profileRecords["playerStats/human-key"].lastActiveAt, undefined);
});

test("round statistics normalize 2, 3 and 4-player placements to 1–3 and count every round exactly once", async () => {
    for (const count of [2, 3, 4]) {
        const { game, players, profileRecords } = setupGame();
        players.splice(1);
        while (players.length < count) {
            players.push(new players[0].constructor(`Human ${players.length}`, `key-${players.length}`));
        }
        players.forEach((player, index) => { player.placement = index + 1; });
        game.endTime = 10000;
        await game.recordFinishedPlayerStats();
        await game.recordFinishedPlayerStats();
        for (const player of players) {
            const stats = profileRecords[`playerStats/${player.playerKey}`];
            assert.equal(stats.roundsPlayed, 1);
            assert.equal(stats.placementScore, 1 + 2 * (player.placement - 1) / (count - 1));
            assert.equal(stats.bomsCount, Number(player.placement == count));
            assert.equal(stats.lastActiveAt, 10000);
        }
        game.round++;
        game.endTime = 20000;
        players[0].presidentStreak = 2;
        players.at(-1).bomsStreak = 2;
        await game.recordFinishedPlayerStats();
        await game.recordFinishedPlayerStats();
        const winner = profileRecords["playerStats/human-key"];
        const loser = profileRecords[`playerStats/${players.at(-1).playerKey}`];
        assert.equal(winner.roundsPlayed, 2);
        assert.equal(winner.presidentWins, 2, "Multiple wins in one room must all count");
        assert.equal(winner.longestPresidentStreak, 2);
        assert.equal(loser.longestBomsStreak, 2);
        assert.equal(loser.bomsCount, 2);
        assert.equal(winner.lastActiveAt, 20000);
    }
});

test("a delayed profile transaction keeps the finished placement even after the next round resets the player", async () => {
    const { game, players, profileRecords, pendingProfileTransactions } =
        setupGame({ deferProfileTransactions: true });
    players[0].placement = 1;
    players[0].presidentStreak = 3;
    game.endTime = 10000;
    const saving = game.recordFinishedPlayerStats();
    players[0].placement = 0;
    players[0].presidentStreak = 0;
    players[0].name = "Changed";
    game.round++;
    game.endTime = null;
    pendingProfileTransactions.forEach(commit => commit());
    await saving;
    const stats = profileRecords["playerStats/human-key"];
    assert.equal(stats.name, "Human");
    assert.equal(stats.presidentWins, 1);
    assert.equal(stats.roundsPlayed, 1);
    assert.equal(stats.longestPresidentStreak, 3);
    assert.equal(stats.placementScore, 1);
    assert.equal(stats.lastActiveAt, 10000);
});

test("late round statistics cannot overwrite a more recently registered leaderboard name", async () => {
    const { game, players, profileRecords } = setupGame();
    game.endTime = 10000;
    players[0].placement = 1;
    profileRecords["playerStats/human-key"] = {
        name: "New name", names: ["Human", "New name"], nameUpdatedAt: 20000
    };
    await game.recordFinishedPlayerStats();
    const stats = profileRecords["playerStats/human-key"];
    assert.equal(stats.name, "New name");
    assert.equal(stats.nameUpdatedAt, 20000);
    assert.equal(stats.roundsPlayed, 1);
    assert.equal(stats.presidentWins, 1);
    assert.equal(stats.lastActiveAt, 10000);
    game.round++;
    game.endTime = 30000;
    players[0].name = "Latest played name";
    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].name, "Latest played name");
    assert.equal(profileRecords["playerStats/human-key"].nameUpdatedAt, 30000);
});

test("historical wins are retained without awarding an already counted room again, and scores average across player counts", async () => {
    const { game, players, profileRecords } = setupGame();
    profileRecords["playerStats/human-key"] = {
        name: players[0].name, presidentWins: 20, presidentWinGames: { test: true }
    };
    players.forEach((player, index) => { player.placement = index + 1; });
    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].presidentWins, 20);
    game.round++;
    players[0].placement = 2;
    players[1].placement = 1;
    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].placementScore, 1.5);
    assert.equal(profileRecords["playerStats/human-key"].roundsPlayed, 2);
    game.round++;
    players.splice(2);
    await game.recordFinishedPlayerStats();
    const stats = profileRecords["playerStats/human-key"];
    assert.equal(stats.placementScore, 2);
    assert.equal(stats.normalizedPlacementTotal, 6);
    assert.equal(stats.roundsPlayed, 3);
    assert.equal(stats.bomsCount, 1);
    game.round++;
    players[0].placement = 1;
    await game.recordFinishedPlayerStats();
    assert.equal(profileRecords["playerStats/human-key"].presidentWins, 21);
});

test("playing the final card persists the president placement and completed round placement", () => {
    const { game, players, types } = setupGame();
    const winner = players[0];
    const finalPlayer = players[1];
    players.splice(2);
    winner.cards = [new types.PresidentCard(1, 5)];
    finalPlayer.cards = [new types.PresidentCard(2, 7)];
    game.localPlayerName = winner.name;
    game.setTurn(0);

    let stored = { status: "S", lastHumanActionAt: Date.now(), shuffleStartedAt: null, runde: 1 };
    game.lastHumanActionAt = Date.now();
    game.databaseRef = {
        transaction(update, complete) {
            const next = update(stored);
            const committed = next !== undefined;
            if (committed) { stored = next; }
            complete(null, committed, { val: () => stored });
            return Promise.resolve({ committed });
        }
    };

    game.playCards(winner, new types.CardPile(winner.name, ...winner.cards));

    const persistedPlayers = types.PresidentPlayer.deserializePlayers(stored.spillere);
    assert.equal(persistedPlayers[0].placement, 1);
    assert.equal(persistedPlayers[1].placement, 2);
    assert.equal(stored.sinTur, -1);
    assert.equal(stored.turnPause.pendingGameEnd, true);
});

test("passing and clearing a pile preserve every displayed card's position and render identity", () => {
    const element = () => ({
        children: [], dataset: {}, style: { setProperty(name, value) { this[name] = value; } },
        setAttribute() {},
        appendChild(child) { this.children.push(child); }
    });
    const { GameLayout, PresidentCard } = loadGame(null, {
        document: { createElement: element, getElementById: () => ({
            getBoundingClientRect: () => ({ width: 600, height: 400 })
        }) },
        window: { matchMedia: () => ({ matches: false }) }
    });
    GameLayout.createCardImage = element;
    const { game, players, pile } = setupGame();
    GameLayout.styleForPlayer = () => "pixel";
    GameLayout.foilForPlayer = () => "galaxy";
    game.shuffleStartedAt = 123456;
    players.forEach(player => {
        player.cards.push(new PresidentCard(1, 12));
    });
    game.piles = [pile(players[0], 7, 2), pile(players[0], 8, 2)];
    game.save = () => {};
    game.setTurn(1);
    const render = (piles, signatures = new Set()) =>
        GameLayout.createTablePile(game, piles, signatures);
    const positions = view => view.element.children.map(play => ({
        signature: play.dataset.playSignature,
        cards: play.children.map(card => ({
            left: card.style.left, top: card.style.top,
            rotation: card.style["--pile-rotation"]
        }))
    }));
    const before = render(game.piles);
    const firstCard = before.element.children[0].children[0];
    assert.match(firstCard.className, /table-play__card card-preview card-preview--pixel/);
    assert.equal(firstCard.dataset.foil, "galaxy");
    assert.equal(firstCard.children.length, 1);
    const signatures = new Set(before.element.children.map(play => play.dataset.playSignature));
    game.passTurn(players[1]);
    assert.equal(game.turnPause.kind, "pass");
    let after = render(game.piles, signatures);
    assert.deepEqual(positions(after), positions(before));
    assert.equal(after.newlyPlayed.length, 0);
    game.turnPause = null;
    game.passTurn(players[2]);
    assert.equal(game.turnPause.kind, "clear");
    assert.equal(game.round, 2);
    const clearedPiles = PresidentCard.deserializePiles(game.turnPause.clearedPiles);
    after = render(clearedPiles, signatures);
    assert.deepEqual(positions(after), positions(before));
    assert.equal(after.newlyPlayed.length, 0);
    for (const property of ["--pile-depth", "--pile-fan-count"]) {
        assert.equal(after.element.style[property], before.element.style[property]);
    }
});

test("lobby start stays neutral until enough players are present and every human is ready", () => {
    const elements = new Map();
    const getElement = id => {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                style: {}, setAttribute() {},
                classList: {
                    toggle(name, enabled) { if (enabled) { classes.add(name); } else { classes.delete(name); } },
                    contains: name => classes.has(name)
                }
            });
        }
        return elements.get(id);
    };
    const { GameLayout, PresidentGame, PresidentPlayer, GamePresence } = loadGame(null, {
        document: { getElementById: getElement }
    });
    const host = new PresidentPlayer("Host", "human-key");
    const guest = new PresidentPlayer("Guest", "guest-key");
    const bot = new PresidentPlayer("Bot", "PC");
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "lobby", status: "O", hostKey: host.playerKey, hostName: host.name,
        localPlayerName: host.name, players: [host]
    });
    host.ready = true;
    const start = getElement("startGameButton");
    GameLayout.updateGameButtons(game);
    assert.equal(start.textContent, "Venter på flere spillere");
    assert.equal(start.disabled, true);
    assert.equal(start.classList.contains("is-waiting"), true);

    game.players.push(guest);
    GameLayout.updateGameButtons(game);
    assert.equal(start.textContent, "Venter på spillere");
    assert.equal(start.disabled, true);
    assert.equal(start.classList.contains("is-waiting"), true);

    guest.ready = true;
    game.players.push(bot);
    GameLayout.updateGameButtons(game);
    assert.equal(start.textContent, "Start spill");
    assert.equal(start.disabled, false);
    assert.equal(start.classList.contains("is-waiting"), false);

    game.connectionOnline = false;
    GameLayout.updateGameButtons(game);
    assert.equal(start.disabled, true);
    assert.equal(getElement("readyButton").textContent, "Klar");
    assert.equal(getElement("readyButton").disabled, true);

    game.connectionOnline = true;
    game.presence = { [GamePresence.playerId(guest)]: { tab: { online: false, changedAt: 100 } } };
    GameLayout.updateGameButtons(game);
    assert.equal(start.disabled, true);
    assert.equal(getElement("readyButton").disabled, false);
    game.presence = {};

    host.ready = false;
    GameLayout.updateGameButtons(game);
    assert.equal(start.textContent, "Venter på spillere");
    assert.equal(start.disabled, true);
    assert.equal(start.classList.contains("is-waiting"), true);
});

function lobbyWithStoredPlayers(names) {
    const { game, players } = setupGame();
    const { PresidentPlayer } = loadGame();
    game.status = "O";
    game.hostName = game.localPlayerName = players[0].name;
    const stored = {
        status: "O", hostKey: game.hostKey, hostName: game.hostName,
        spillere: [
            players[0].toRecord(),
            ...names.map(([name, key]) => new PresidentPlayer(name, key).toRecord())
        ]
    };
    game.databaseRef = {
        transaction(transform, complete) {
            const next = transform(JSON.parse(JSON.stringify(stored)));
            if (next !== undefined) { Object.assign(stored, next); }
            complete(null, next !== undefined, { val: () => JSON.parse(JSON.stringify(stored)) });
        }
    };
    return { game, stored, PresidentPlayer };
}

test("adding a bot preserves humans missing from the host's stale local list", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Guest", "guest-key"]]);
    game.players = game.players.slice(0, 1);
    const result = await game.addPlayer(new PresidentPlayer("New bot", "PC"));
    assert.equal(result.player.name, "New bot");
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "New bot"]);
    assert.equal(stored.spillere[1].spillerKey, "guest-key");
});

test("the host can remove ready or unready humans and bots using current room data", async () => {
    for (const key of ["PC", "guest-key"]) {
        for (const ready of [false, true]) {
            const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
                ["Guest", key], ["Keep", "other-key"]
            ]);
            stored.spillere[1].ready = ready;
            stored.spillere[2].ready = true;
            const result = await game.removeLobbyPlayer(new PresidentPlayer("Guest", key));
            assert.equal(result.text, undefined);
            assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Keep"]);
            assert.equal(stored.spillere[1].ready, true);
            assert.equal(game.getPlayer("Guest"), null);
        }
    }
});

test("removing lobby players never bypasses host authority or active rounds and votes", async () => {
    for (const change of [
        { hostKey: "other-key" }, { hostName: "Other" }, { status: "S" },
        { status: "G" }, { gameEndVote: { id: "vote" } }, { roundStartVote: { id: "vote" } }
    ]) {
        const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Guest", "PC"]]);
        Object.assign(stored, change);
        const before = JSON.stringify(stored);
        assert.ok((await game.removeLobbyPlayer(new PresidentPlayer("Guest", "PC"))).text);
        assert.equal(JSON.stringify(stored), before);
    }
});

test("host removal preserves a concurrent arrival when the transaction retries", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Bot", "PC"]]);
    game.databaseRef.transaction = (transform, complete) => {
        transform(JSON.parse(JSON.stringify(stored)));
        stored.spillere.push(new PresidentPlayer("Arrival", "arrival-key").toRecord());
        const next = transform(JSON.parse(JSON.stringify(stored)));
        Object.assign(stored, next);
        complete(null, true, { val: () => stored });
    };
    await game.removeLobbyPlayer(new PresidentPlayer("Bot", "PC"));
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Arrival"]);
});

test("two-player rounds deal exactly 40 unique cards, without changing three- or four-player deals", () => {
    for (const [count, expected] of [[2, 40], [3, 51], [4, 52]]) {
        const { PresidentGame, PresidentPlayer } = loadGame();
        const game = Object.assign(Object.create(PresidentGame.prototype), {
            players: Array.from({ length: count }, (_, i) => new PresidentPlayer(`Player ${i}`, "PC")),
            status: "S", round: 1, piles: []
        });
        game.prepareRound();
        assert.equal(game.dealTotal, expected);
        assert.ok(game.players.every(player => player.cards.length == expected / count));
        const dealt = game.players.flatMap(player => Array.from(player.cards, card => `${card.suit}:${card.rank}`));
        assert.equal(new Set(dealt).size, expected);
        assert.equal(game.players.filter(player => player.turn == 1).length, 1);
    }
});

test("starting a later round deals cards and enters the exchange stage", () => {
    const { PresidentGame, PresidentPlayer } = loadGame();
    const players = ["Owner", "Bot 1", "Bot 2", "Bot 3"].map((name, index) => {
        const player = new PresidentPlayer(name, index == 0 ? "human-key" : "PC");
        player.placement = index + 1;
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "next-round", hostKey: "human-key", hostName: "Owner", localPlayerName: "Owner",
        status: "F", round: 1, players, piles: [], lastHumanActionAt: Date.now(),
        rules: {}, gameEndVote: null
    });
    game.save = () => {};

    game.startGame();

    assert.equal(game.status, "G");
    assert.equal(game.dealTotal, 52);
    assert.ok(players.every(player => player.cards.length == 13));
    assert.equal(game.piles.length, 4);
    assert.deepEqual(Array.from(game.piles, exchange => exchange.mode), ["Velg", "Velg", "Best", "Best"]);
    assert.deepEqual(Array.from(game.piles, exchange => exchange.count), [2, 1, 1, 2]);
});

test("a random player starts if heart three is among the twelve discarded cards", () => {
    const math = Object.create(Math);
    math.random = () => 0.9999;
    const { PresidentGame, PresidentPlayer } = loadGame(null, { Math: math });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        players: [new PresidentPlayer("First", "PC"), new PresidentPlayer("Second", "PC")],
        status: "S", round: 1, piles: []
    });
    game.prepareRound();
    assert.ok(game.players.every(player => !player.cards.some(card => card.suit == 2 && card.rank == 3)));
    assert.equal(game.dealStarterStep, null);
    assert.equal(game.players[1].turn, 1);
});

test("two-player first rounds choose randomly even when the heart three is dealt", () => {
    let differentStarter = false;
    for (const random of [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9]) {
        const math = Object.create(Math);
        math.random = () => random;
        const { PresidentGame, PresidentPlayer } = loadGame(null, { Math: math });
        const players = [new PresidentPlayer("First", "PC"), new PresidentPlayer("Second", "PC")];
        const game = Object.assign(Object.create(PresidentGame.prototype), {
            players, status: "S", round: 1, piles: []
        });
        game.prepareRound();
        const heartOwner = players.findIndex(player =>
            player.cards.some(card => card.suit == 2 && card.rank == 3));
        assert.equal(game.turn, Math.floor(random * 2));
        assert.equal(game.dealStarterStep, null);
        differentStarter ||= heartOwner >= 0 && heartOwner != game.turn;
    }
    assert.equal(differentStarter, true, "The heart-three holder does not force the starter");
});

test("mandatory exchanges use one card for two players, two for three, and vice-role pairs for four", () => {
    for (const count of [2, 3, 4]) {
        const { PresidentGame, PresidentPlayer } = loadGame(null, {
            clearTimeout() {},
            document: { dispatchEvent() {}, querySelectorAll: () => [] },
            CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
        });
        const players = Array.from({ length: count }, (_, index) => {
            const player = new PresidentPlayer(`Seat ${index}`, "PC");
            player.placement = index + 1;
            return player;
        });
        const game = Object.assign(Object.create(PresidentGame.prototype), {
            id: "exchange", players, status: "S", round: 2, piles: [], rules: {}
        });
        game.save = () => {};
        game.prepareRound();
        const mandatory = game.piles.filter(exchange => exchange.mode != "Tilbud");
        const expected = count == 4
            ? [[0, 3, 2, "Velg"], [1, 2, 1, "Velg"], [2, 1, 1, "Best"], [3, 0, 2, "Best"]]
            : [[0, count - 1, count == 2 ? 1 : 2, "Velg"],
                [count - 1, 0, count == 2 ? 1 : 2, "Best"]];
        assert.deepEqual(Array.from(mandatory, exchange =>
            [exchange.from, exchange.to, exchange.count, exchange.mode]), expected);
        const originals = players.map(player => Array.from(player.cards));
        players[0].playerKey = "human-key";
        for (const exchange of mandatory) {
            if (exchange.mode == "Best") {
                const expectedCards = Array.from(players[exchange.from].cards)
                    .filter(card => !card.isClubThree()).slice(-exchange.count).reverse();
                assert.deepEqual(Array.from(exchange.cards), expectedCards);
            } else {
                exchange.cards = players[exchange.from].cards.slice(0, exchange.count);
            }
        }
        const transfers = mandatory.map(exchange => ({
            from: exchange.from, to: exchange.to, cards: Array.from(exchange.cards)
        }));
        for (const exchange of mandatory) { game.giveExchangeCards(exchange); }
        if (count == 3) {
            assert.equal(game.status, "G");
            const gate = game.exchangeReady;
            game.exchangeReady = null;
            for (const offer of Array.from(game.piles)) { game.skipOptionalTrade(offer, offer.from); }
            assert.equal(game.exchangeReady, null, "Skipping offers must not repeat the mandatory receipt summary");
            game.exchangeReady = gate;
        }
        assert.equal(game.status, "S");
        assert.equal(game.turn, count - 1, "The Bum starts after the exchange");
        assert.ok(game.exchangeReady);
        assert.equal(game.exchangeReady.until - game.exchangeReady.startedAt, 7000);
        assert.equal(game.isTurnPaused(), true);
        assert.equal(game.canPass(players[game.turn]), false);
        assert.equal(game.canPlayRank(players[game.turn], players[game.turn].cards[0].strengthRank), false);
        for (let index = 0; index < count; index++) {
            const outgoing = transfers.filter(t => t.from == index).flatMap(t => t.cards);
            const incoming = transfers.filter(t => t.to == index).flatMap(t => t.cards);
            const keys = cards => cards.map(c => `${c.suit}:${c.rank}`).sort();
            assert.deepEqual(keys(Array.from(players[index].cards)),
                keys(originals[index].filter(c => !outgoing.includes(c)).concat(incoming)));
        }
        if (count == 4) {
            assert.equal(game.placementTitle(2).title, "Visepresident");
            assert.equal(game.placementTitle(3).title, "Viseboms");
        }
    }
});

test("passing on an empty table advances without excluding players from the next play", () => {
    const { game, players, pile, types } = setupGame();
    game.save = () => {};
    for (const player of players) { player.cards = [pile(player, 7, 1)[0], pile(player, 8, 1)[0]]; }
    game.setTurn(0);
    for (let index = 0; index < 6; index++) {
        const current = players[game.turn];
        assert.equal(game.canPass(current), true);
        game.passTurn(current);
        assert.equal(current.lastPlay, null);
        game.turnPause = null;
        assert.equal(game.turn, (index + 1) % players.length);
    }
    game.playCards(players[0], new types.CardPile(players[0].name, players[0].cards[0]));
    assert.equal(game.topPile().strengthRank, 7);
});

test("a human replaces only a bot when the lobby is full", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Bot A", "PC"], ["Bot B", "PC"]
    ]);
    stored.spillere[1].ready = true;
    const result = await game.addPlayer(new PresidentPlayer("New human", "new-key"));
    assert.equal(result.player.name, "New human");
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "New human", "Bot B"]);
    assert.equal(stored.spillere[1].ready, true);
    assert.equal(stored.spillere[2].ready, false);
});

test("bots cannot replace anyone in a full lobby", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Bot A", "PC"], ["Bot B", "PC"]
    ]);
    const before = JSON.stringify(stored);
    const result = await game.addPlayer(new PresidentPlayer("New bot", "PC"));
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("a full human lobby rejects a fifth human without overwriting players", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Third", "third-key"], ["Fourth", "fourth-key"]
    ]);
    const before = JSON.stringify(stored);
    const result = await game.addPlayer(new PresidentPlayer("Fifth", "fifth-key"));
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("a non-host cannot add a bot through the game method", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([]);
    game.localPlayerName = "Guest";
    const result = await game.addPlayer(new PresidentPlayer("Bot", "PC"));
    assert.ok(result.text);
    assert.equal(stored.spillere.length, 1);
});

test("rejoining and duplicate names never replace an existing human", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Guest", "guest-key"]]);
    const result = await game.addPlayer(new PresidentPlayer("Guest", "guest-key"));
    assert.equal(result.player.playerKey, "guest-key");
    const rejected = await game.addPlayer(new PresidentPlayer("Guest", "PC"));
    assert.ok(rejected.text);
    assert.equal(stored.spillere.length, 2);
    assert.equal(stored.spillere[1].spillerKey, "guest-key");
});

test("humans receive the next free case-insensitive name suffix", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Guest-1", "other-key"]
    ]);
    const result = await game.addPlayer(new PresidentPlayer("guest", "new-key"));
    assert.equal(result.player.name, "guest-2");
    assert.equal(stored.spillere[1].nick, "Guest");
    assert.equal(stored.spillere[3].nick, "guest-2");
});

test("simultaneous name choices are numbered again on transaction retry", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Guest", "guest-key"]]);
    game.databaseRef.transaction = (transform, complete) => {
        transform(JSON.parse(JSON.stringify(stored)));
        stored.spillere.push(new PresidentPlayer("Guest-1", "concurrent-key").toRecord());
        const next = transform(JSON.parse(JSON.stringify(stored)));
        Object.assign(stored, next);
        complete(null, true, { val: () => JSON.parse(JSON.stringify(stored)) });
    };
    const result = await game.addPlayer(new PresidentPlayer("Guest", "last-key"));
    assert.equal(result.player.name, "Guest-2");
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "Guest-1", "Guest-2"]);
});

test("a human colliding with a bot gets a suffix", async () => {
    const { game, PresidentPlayer } = lobbyWithStoredPlayers([["Knurt", "PC"]]);
    const result = await game.addPlayer(new PresidentPlayer("Knurt", "human-two"));
    assert.equal(result.player.name, "Knurt-1");
});

test("bot name collisions are rejected regardless of case or player type", async () => {
    for (const key of ["guest-key", "PC"]) {
        const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Knurt", key]]);
        const result = await game.addPlayer(new PresidentPlayer("knurt", "PC"));
        assert.ok(result.text);
        assert.equal(stored.spillere.length, 2);
    }
});

test("name suffixes remain within 24 code points and can skip used suffixes", () => {
    const { availablePlayerName } = loadGame();
    const name = "A".repeat(24);
    assert.equal(availablePlayerName(name, []), name);
    assert.equal(availablePlayerName(name, [name]), "A".repeat(22) + "-1");
    assert.equal(availablePlayerName("Guest", ["Guest", "Guest-2"]), "Guest-1");
    const emojiName = "\u{1f600}".repeat(24);
    assert.equal(Array.from(availablePlayerName(emojiName, [emojiName])).length, 24);
    const used = [name, ...Array.from({ length: 9 }, (_, i) => "A".repeat(22) + `-${i + 1}`)];
    assert.equal(availablePlayerName(name, used), "A".repeat(21) + "-10");
});

test("name input validates the 24-character boundary without truncating letters or emoji", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf('        document.getElementById("dialogSporOmNickTxt").addEventListener("input"');
    const end = source.indexOf('        document.getElementById("playerRecoveryPin")', start);
    const { sanitizePlayerName } = loadGame();
    let validate;
    const input = {
        value: "", attributes: {},
        classList: { toggle(name, value) { this[name] = value; } },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, listener) { validate = listener; }
    };
    const context = vm.createContext({
        sanitizePlayerName,
        document: { getElementById: id => id == "dialogSporOmNickTxt" ? input : { textContent: "" } }
    });
    vm.runInContext(source.slice(start, end), context);
    for (const symbol of ["A", "あ", "\u{1f600}"]) {
        for (const length of [24, 25]) {
            input.value = symbol.repeat(length);
            validate.call(input);
            assert.equal(input.classList["input-soft-error"], length > 24);
            assert.equal(input.attributes["aria-invalid"], String(length > 24));
            assert.equal(input.value, symbol.repeat(length));
        }
    }
    assert.match(source, /var invalidName = requestedName == "" \|\| Array\.from\(requestedName\)\.length > 24/);
});

test("renaming adds a suffix atomically and preserves host, pile and vote identity", async () => {
    const { game, stored } = lobbyWithStoredPlayers([["Guest", "guest-key"], ["Guest-1", "third-key"]]);
    stored.spillBunke = [{ nick: "Human", verdiBoms: 5, 0: { farge: 1, verdi: 5 } }];
    stored.spillere[0].laPaaSist = stored.spillBunke[0];
    stored.gameEndVote = {
        votes: [{ playerId: JSON.stringify(["human-key", "Human"]), choice: "lobby" }]
    };
    const result = await game.renamePlayer(game.players[0], "Guest");
    assert.equal(result.player.name, "Guest-2");
    assert.equal(stored.hostName, "Guest-2");
    assert.equal(stored.spillBunke[0].nick, "Guest-2");
    assert.equal(stored.spillere[0].laPaaSist.nick, "Guest-2");
    assert.equal(stored.gameEndVote.votes[0].playerId, JSON.stringify(["human-key", "Guest-2"]));
});

test("renaming to one's own name does not add a suffix", async () => {
    const { game } = lobbyWithStoredPlayers([]);
    const result = await game.renamePlayer(game.players[0], "Human");
    assert.equal(result.player.name, "Human");
});

test("name changes cannot be submitted after the lobby starts", async () => {
    const { game, stored } = lobbyWithStoredPlayers([]);
    stored.status = "S";
    const before = JSON.stringify(stored);
    const result = await game.renamePlayer(game.players[0], "Changed");
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("a transaction retry uses the new human's slot instead of overwriting it", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([]);
    game.databaseRef.transaction = (transform, complete) => {
        transform(JSON.parse(JSON.stringify(stored)));
        stored.spillere.push(new PresidentPlayer("Concurrent human", "guest-key").toRecord());
        const next = transform(JSON.parse(JSON.stringify(stored)));
        Object.assign(stored, next);
        complete(null, true, { val: () => JSON.parse(JSON.stringify(stored)) });
    };
    await game.addPlayer(new PresidentPlayer("Bot", "PC"));
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Concurrent human", "Bot"]);
});

test("a human cannot replace a bot in a game already in progress", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Bot A", "PC"], ["Bot B", "PC"]
    ]);
    stored.status = "S";
    const before = JSON.stringify(stored);
    const result = await game.addPlayer(new PresidentPlayer("New human", "new-key"));
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("the creator is assigned as host when joining the empty room", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([]);
    stored.spillere = [];
    stored.hostName = null;
    await game.addPlayer(new PresidentPlayer("Creator", "human-key"));
    assert.equal(stored.hostKey, "human-key");
    assert.equal(stored.hostName, "Creator");
    assert.equal(game.hostName, "Creator");
});

test("a retry at full capacity preserves the concurrent human and rejects the bot", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Third", "third-key"]
    ]);
    game.databaseRef.transaction = (transform, complete) => {
        transform(JSON.parse(JSON.stringify(stored)));
        stored.spillere.push(new PresidentPlayer("Fourth", "fourth-key").toRecord());
        const next = transform(JSON.parse(JSON.stringify(stored)));
        assert.equal(next, undefined);
        complete(null, false, { val: () => stored });
    };
    const result = await game.addPlayer(new PresidentPlayer("Bot", "PC"));
    assert.ok(result.text);
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "Third", "Fourth"]);
});

function finishedVotingGame(sharedKey = false) {
    const { game, players, profileRecords } = setupGame();
    if (sharedKey) { players[1].playerKey = players[0].playerKey; }
    players.forEach((player, i) => { player.placement = i + 1; });
    game.status = "F";
    game.gameEndVote = { id: "vote", until: Date.now() + 10000, votes: [] };
    const stored = { status: "F", gameEndVote: game.gameEndVote, roundStartVote: null };
    const snapshots = [];
    const notify = () => {
        snapshots.push({ status: stored.status, vote: stored.gameEndVote });
        game.status = stored.status;
        game.gameEndVote = stored.gameEndVote;
    };
    game.databaseRef = {
        update(record) {
            Object.assign(stored, record);
            notify();
            return Promise.resolve();
        },
        child(key) {
            return {
                transaction(transform, complete) {
                    const result = transform(stored[key]);
                    if (result !== undefined) {
                        stored[key] = result;
                        notify();
                    }
                    complete(null, result !== undefined, { val: () => stored[key] });
                },
                remove() {
                    stored[key] = null;
                    notify();
                    return Promise.resolve();
                }
            };
        }
    };
    return { game, players, stored, snapshots, profileRecords };
}

test("one human and bots can vote to return to lobby atomically", () => {
    const { game, players, stored, snapshots } = finishedVotingGame();
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "O");
    assert.equal(stored.gameEndVote, null);
    assert.equal(stored.roundStartVote, null);
    assert.equal(snapshots.some(snapshot => snapshot.status === "F" && snapshot.vote == null), false);
    assert.equal(game.players.length, 3);
    assert.ok(game.players.every(player => player.cards.length === 0 && player.turn === 0));
});

test("a tied next-round vote uses the named host when browser keys match", () => {
    const { game, players, stored } = finishedVotingGame(true);
    game.hostName = players[1].name;
    game.localPlayerName = players[1].name;
    let started = false;
    game.startGame = () => { started = true; };
    game.submitGameEndVote(players[0], "lobby");
    game.submitGameEndVote(players[1], "next_round");
    game.resolveGameEndVote();
    assert.equal(stored.gameEndVote.result, "next_round");
    assert.equal(started, true);
});

test("an expired empty tie waits for the host and accepts a late vote", () => {
    const { game, players, stored } = finishedVotingGame();
    players[1].playerKey = "second-human";
    game.gameEndVote.until = Date.now() - 1000;
    game.resolveGameEndVote(true);
    assert.equal(stored.gameEndVote.result, undefined);
    assert.equal(stored.gameEndVote.id, "vote");
    game.submitGameEndVote(players[0], "lobby");
    game.resolveGameEndVote(true);
    assert.equal(stored.status, "O");
});

test("two humans sharing a browser key each get a separate lobby vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "F");
    assert.equal(game.submitGameEndVote(players[1], "lobby"), true);
    assert.equal(stored.status, "O");
});

test("two humans need a majority before returning to the lobby", () => {
    const { game, players, stored } = finishedVotingGame();
    players[1].playerKey = "second-human";
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "F");
    assert.equal(game.submitGameEndVote(players[1], "lobby"), true);
    assert.equal(stored.status, "O");
});

test("the host's lobby vote decides a tied result vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    game.submitGameEndVote(players[0], "lobby");
    game.submitGameEndVote(players[1], "next_round");
    assert.equal(stored.status, "O");
    assert.equal(stored.gameEndVote, null);
});

test("a non-host cannot resolve or claim the result vote", () => {
    const { game, players, stored } = finishedVotingGame();
    game.hostKey = "another-host";
    game.submitGameEndVote(players[0], "lobby");
    assert.equal(stored.status, "F");
    assert.equal(stored.gameEndVote.result, undefined);
    game.hostKey = "human-key";
    game.resolveGameEndVote();
    assert.equal(stored.status, "O");
});

test("the host's neutral vote decides a tied neutral-round vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    game.roundStartVote = stored.roundStartVote = {
        id: "neutral-vote", until: Date.now() + 10000, votes: []
    };
    let started = false;
    game.startGame = () => { started = true; };
    game.submitNeutralRoundVote(players[0], true);
    game.submitNeutralRoundVote(players[1], false);
    assert.equal(stored.roundStartVote.result, "neutral");
    assert.equal(started, true);
});

test("only the host can start, even if everyone is ready", () => {
    const { game, players } = setupGame();
    game.status = "O";
    players[0].ready = true;
    game.hostKey = "someone-else";
    assert.throws(() => game.startGame(), /Bare verten/);
});

test("host must wait for all humans, but bots need not press ready", () => {
    const { game, players } = setupGame();
    game.status = "O";
    game.prepareRound = () => {};
    game.save = () => {};
    game.databaseRef = { child: () => ({ remove: () => Promise.resolve() }) };
    assert.equal(game.allHumansReady(), false);
    assert.throws(() => game.startGame(), /må være klare/);
    players[0].ready = true;
    assert.equal(game.allHumansReady(), true);
    game.startGame();
    assert.equal(game.status, "S");
});

test("host identity distinguishes two names using the same browser key", () => {
    const { game } = setupGame();
    const { isLobbyHost } = loadGame();
    game.hostName = "Human";
    game.localPlayerName = "Other";
    assert.equal(isLobbyHost(game), false);
    game.localPlayerName = "Human";
    assert.equal(isLobbyHost(game), true);
});

test("the next human inherits the lobby when its creator leaves", () => {
    const { game, players } = setupGame();
    game.status = "O";
    game.hostName = players[0].name;
    players[2].playerKey = "next-human";
    game.save = () => {};
    game.leavePlayer(players[0]);
    assert.equal(game.hostKey, "next-human");
    assert.equal(game.hostName, players[2].name);
    assert.equal(game.players.length, 2);
});

test("the next human also inherits a finished room with an active vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    game.hostName = players[0].name;
    game.leavePlayer(players[0]);
    assert.equal(game.hostName, players[1].name);
    assert.equal(stored.spillere.length, 2);
    assert.equal(stored.status, "F");
});

test("ready state persists and is reset on returning to the lobby", () => {
    const { game, players } = finishedVotingGame();
    const { PresidentPlayer } = loadGame();
    players[0].ready = true;
    const restored = new PresidentPlayer().fromRecord(
        JSON.parse(JSON.stringify(players[0].toRecord()))
    );
    assert.equal(restored.ready, true);
    game.returnToLobby();
    assert.ok(game.players.every(player => player.ready === false));
});

test("readiness writes only the current player's ready field", async () => {
    const { game, players } = setupGame();
    game.status = "O";
    const writes = [];
    game.databaseRef = {
        child(key) {
            return { set: value => { writes.push({ key, value }); return Promise.resolve(); } };
        }
    };
    await game.setReady(players[0], true);
    assert.deepEqual(writes, [{ key: "spillere/0/ready", value: true }]);
    assert.throws(() => game.setReady(players[1], true), /klar-status/);
});

test("one human with bots can still vote for the next round", () => {
    const { game, players } = finishedVotingGame();
    let started = false;
    game.needsNeutralRoundVote = () => false;
    game.startGame = () => { started = true; };
    assert.equal(game.submitGameEndVote(players[0], "next_round"), true);
    assert.equal(started, true);
});

test("the host starts a voted next round without exposing a finished game with no vote", () => {
    const { game, players, stored, snapshots } = finishedVotingGame();
    game.needsNeutralRoundVote = () => false;
    game.prepareRound = () => {};
    game.submitGameEndVote(players[0], "next_round");
    assert.equal(stored.status, "S");
    assert.equal(stored.gameEndVote, null);
    assert.equal(snapshots.some(snapshot => snapshot.status === "F" && snapshot.vote == null), false);
});

test("finished status and human president wins are saved before creating the result vote", async () => {
    const { game, stored, snapshots, profileRecords } = finishedVotingGame();
    game.status = stored.status = "S";
    game.gameEndVote = stored.gameEndVote = null;
    assert.equal(game.finishGame(), true);
    assert.equal(stored.status, "F");
    assert.ok(stored.gameEndVote);
    assert.equal(snapshots[0].status, "F");
    assert.equal(snapshots.some(snapshot => snapshot.status === "S" && snapshot.vote != null), false);
    assert.equal(profileRecords["playerStats/human-key"].presidentWins, 1);
    assert.deepEqual(Array.from(profileRecords["playerStats/human-key"].names), ["Human"]);
});

test("host start waits for a second human to be ready too", () => {
    const { game, players } = setupGame();
    game.status = "O";
    players[0].ready = true;
    players[1].playerKey = "guest-key";
    assert.equal(game.allHumansReady(), false);
    assert.throws(() => game.startGame(), /må være klare/);
});

test("higher four of a kind keeps the pile open and can be played", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 7)];
    const response = pile(players[1], 8);
    players[1].cards = Array.from(response);
    players[1].turn = 1;
    assert.equal(game.pileCleared(), false);
    assert.equal(game.canPlayPile(players[1], response), true);
    const info = {};
    assert.equal(game.canPlayRank(players[1], 8, info), true);
    assert.equal(info.pile.length, 4);
    game.piles.push(response);
    assert.equal(game.pileCleared(), true);
});

test("opening four fives stays on the table in a two-human game after serialization", () => {
    const { game, players, pile } = setupGame();
    game.players = players.slice(0, 2);
    players[1].playerKey = "second-human";
    const opening = pile(players[0], 5);
    players[0].cards = [...opening, ...pile(players[0], 4)];
    players[1].cards = [...pile(players[1], 6), ...pile(players[1], 10), ...pile(players[1], 13)];
    const { PresidentPlayer } = loadGame();
    game.players = PresidentPlayer.deserializePlayers(
        JSON.parse(JSON.stringify(game.players.map(player => player.toRecord())))
    );
    game.save = () => {};
    game.setTurn(0);
    const play = new opening.constructor(game.players[0].name, ...game.players[0].cards.slice(0, 4));
    game.playCards(game.players[0], play);
    assert.equal(game.turn, 1);
    assert.equal(game.piles.length, 1);
    assert.equal(game.turnPause.kind, "play");
    assert.equal(game.piles[0].strengthRank, 5);
});

test("four accumulated equal cards from singles or two pairs clear and cannot be beaten", () => {
    for (const count of [1, 2]) {
        const { game, players, pile } = setupGame();
        game.piles = Array.from({ length: 4 / count }, (_, index) =>
            pile(players[index % players.length], 7, count));
        const response = pile(players[1], 9);
        players[1].cards = Array.from(response);
        players[1].turn = 1;
        assert.equal(game.pileCleared(), true);
        assert.equal(game.canPlayPile(players[1], response), false);
        assert.equal(game.canPlayRank(players[1], 9, {}), false);
    }
});

test("accumulated fours clear through actual play even if an opponent holds higher fours", () => {
    for (const count of [1, 2]) {
        const { game, players, pile } = setupGame();
        game.piles = Array.from({ length: 4 / count - 1 }, () => pile(players[0], 7, count));
        const completing = pile(players[1], 7, count);
        players[1].cards = [...completing, ...pile(players[1], 5, 1)];
        players[2].cards = Array.from(pile(players[2], 9));
        game.save = () => {};
        game.setTurn(1);
        assert.equal(game.canPlayPile(players[1], completing), true);
        game.playCards(players[1], completing);
        assert.equal(game.turnPause.kind, "clear");
        assert.equal(game.piles.length, 0);
        assert.equal(game.turn, 1);
    }
});

test("normal turn pauses support 1, 2 and 3 seconds, defaulting to 2", () => {
    const { game } = setupGame();
    assert.equal(game.actionPauseMs(), 2000);
    for (const seconds of [1, 2, 3]) {
        game.turnSeconds = seconds;
        assert.equal(game.actionPauseMs(), seconds * 1000);
    }
    game.turnSeconds = 9;
    assert.equal(game.actionPauseMs(), 2000);
});

test("host-controlled speed is stored for the room without shortening an active pause", async () => {
    const { game, players } = setupGame();
    game.hostName = game.localPlayerName = players[0].name;
    let record = {
        status: "S", hostKey: game.hostKey, hostName: game.hostName, turnSeconds: 3,
        spillere: players.map(player => player.toRecord()),
        turnPause: { id: "existing", until: Date.now() + 3000 }
    };
    const until = record.turnPause.until;
    let listings = 0;
    game.updatePublicListing = () => { listings++; };
    game.databaseRef = {
        async transaction(transform) {
            const next = transform(structuredClone(record));
            if (next) { record = next; }
            return { committed: !!next, snapshot: { val: () => record } };
        }
    };
    for (const seconds of [1, 2, 3]) {
        await game.setTurnSeconds(seconds);
        assert.equal(game.turnSeconds, seconds);
        assert.equal(record.turnSeconds, seconds);
        assert.equal(record.turnPause.until, until);
    }
    assert.equal(listings, 3);
    for (const invalid of [0, 4, "2", null, NaN]) {
        await assert.rejects(game.setTurnSeconds(invalid), /1, 2 eller 3/);
    }
    const before = structuredClone(record);
    record.hostKey = "new-host";
    await assert.rejects(game.setTurnSeconds(1), /Bare verten/);
    assert.equal(record.turnSeconds, before.turnSeconds);
    game.connectionOnline = false;
    await assert.rejects(game.setTurnSeconds(1), /Bare verten/);
});

test("only the current named human host may change the shared speed", async () => {
    for (const change of [
        { hostName: "Other seat" },
        { hostKey: "guest-key" },
        { status: "V" },
        { controllers: "host-bot" },
        { spillere: [] },
        { gaveUp: true }
    ]) {
        const { game, players } = setupGame();
        const { GamePresence } = loadGame();
        game.hostName = game.localPlayerName = players[0].name;
        let record = {
            status: "O", hostKey: game.hostKey, hostName: game.hostName,
            spillere: players.map(player => player.toRecord()), turnSeconds: 2
        };
        if (change.controllers) {
            record.controllers = { [GamePresence.playerId(record.spillere[0])]: { reason: "idle" } };
        } else if (change.gaveUp) {
            record.spillere[0].gaveUp = true;
        } else {
            Object.assign(record, change);
        }
        game.databaseRef = { async transaction(transform) {
            const next = transform(structuredClone(record));
            return { committed: !!next, snapshot: { val: () => next } };
        } };
        await assert.rejects(game.setTurnSeconds(1), /Bare verten/);
    }
});

test("stale saves preserve host-selected speed and adjust new pause lengths, not existing pauses", () => {
    const { game } = setupGame();
    const now = Date.now();
    game.turnSeconds = 3;
    game.turnPause = { id: "existing", kind: "play", until: now + 3000 };
    let record = {
        status: "S", turnSeconds: 1,
        turnPause: { id: "existing", kind: "play", until: now + 1000 }
    };
    game.databaseRef = { transaction(transform) { record = transform(record); } };
    game.save();
    assert.equal(record.turnSeconds, 1);
    assert.equal(record.turnPause.until, now + 1000);
    game.turnPause = { id: "new", kind: "play", until: now + 3000 };
    game.save();
    assert.equal(record.turnSeconds, 1);
    assert.equal(record.turnPause.until, now + 1000);
});

test("desktop and mobile both honor saved Flick and Play control choices", () => {
    for (const desktop of [false, true]) {
        for (const saved of [null, "invalid", "flick", "button"]) {
            const { GameLayout } = loadGame(null, {
                getCookie: () => saved,
                window: { matchMedia: () => ({ matches: desktop }) }
            });

            assert.equal(GameLayout.playInputMode(),
                saved == "flick" || saved == "button" ? saved : desktop ? "button" : "flick");
        }
    }
    assert.equal(playButtonContext({ playInput: "flick" }).playButton.hidden, true);
    assert.equal(playButtonContext({ playInput: "button" }).playButton.hidden, false);
});

test("settings expose animation speed and enable Flick on desktop and mobile", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    for (const desktop of [false, true]) {
        const { GameLayout } = loadGame(null, {
            window: { matchMedia: () => ({ matches: desktop }) }
        });
        const buttons = ["flick", "button"].map(mode => ({
            dataset: { playInput: mode }, attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; }
        }));
        const setting = { hidden: true };
        const hints = {
            playInputFlickHint: { hidden: true },
            playInputButtonHint: { hidden: false }
        };
        const context = vm.createContext({
            currentGame: null, GameLayout,
            document: {
                querySelectorAll: () => buttons,
                querySelector: () => setting,
                getElementById: id => hints[id] || ({})
            },
            updateSavedPlayerName() {}, updateCardStyleButtons() {}, updateCardFoilButtons() {},
            refreshPlayerPresidentWins() {},
            updateAutoSuggestionButton() {}, updateSpeedButtons() {},
            updateTurnSpeedButtons() {}, showDialog() {}
        });
        GameLayout.setVisible = () => {};
        const begin = source.indexOf("        function updatePlayInputButtons()");
        vm.runInContext(source.slice(begin, source.indexOf('        document.querySelectorAll(".animation-speed-option")', begin)), context);
        const settingsStart = source.indexOf("        function openSettings()");
        vm.runInContext(source.slice(settingsStart,
            source.indexOf('        document.getElementById("BnInnstillinger")', settingsStart)), context);
        context.openSettings();
        assert.equal(setting.hidden, false);
        assert.equal(buttons[0].disabled, false);
        assert.equal(buttons[1].disabled, false);
        assert.equal(buttons[0].attributes["aria-pressed"], String(!desktop));
        assert.equal(hints.playInputFlickHint.hidden, desktop);
        assert.equal(hints.playInputButtonHint.hidden, !desktop);
        GameLayout.playInputMode = () => "button";
        context.updatePlayInputButtons();
        assert.equal(buttons[1].attributes["aria-pressed"], "true");
        assert.equal(hints.playInputFlickHint.hidden, true);
        assert.equal(hints.playInputButtonHint.hidden, false);
    }
});

test("card style display defaults to player-specific styles and preserves the own-style preference", () => {
    for (const scope of [null, "invalid", "own", "player"]) {
        const { GameLayout, GamePresence, PresidentPlayer } = loadGame("gold", {
            getCookie: key => key == "CardStyleScope" ? scope : null
        });
        const players = [new PresidentPlayer("Viewer", "human-key"), new PresidentPlayer("Guest", "guest-key")];
        GameLayout.viewerName = "Viewer";
        const guestId = GamePresence.playerId(players[1]);
        const game = { players, cardStyles: { [guestId]: "pixel" } };
        assert.equal(GameLayout.styleForPlayer(game, "Viewer"), "gold");
        assert.equal(GameLayout.styleForPlayer(game, "Guest"), scope == "own" ? "gold" : "pixel");
        for (const invalid of ["invalid", "botanical"]) {
            game.cardStyles[guestId] = invalid;
            assert.equal(GameLayout.styleForPlayer(game, "Guest"), scope == "own" ? "gold" : "normal");
        }
    }
});

test("publishing a player's style and foil updates only their seat and survives stale saves", async () => {
    const { game, players } = setupGame();
    game.localPlayerName = players[0].name;
    const { GamePresence } = loadGame();
    const id = GamePresence.playerId(players[0]);
    let record = {
        status: "O", spillere: players.map(player => player.toRecord()),
        cardStyles: { another: "neon" },
        cardFoils: { another: "gold" }
    };
    game.databaseRef = { async transaction(transform) {
        const next = transform(record);
        if (next) { record = next; }
        return { committed: !!next, snapshot: { val: () => record } };
    } };
    await game.setPlayerCardAppearance("gold");
    assert.equal(record.cardStyles[id], "gold");
    assert.equal(record.cardStyles.another, "neon");
    assert.equal(record.cardFoils[id], "none");
    assert.equal(record.cardFoils.another, "gold");
    game.save();
    assert.equal(record.cardStyles[id], "gold");
    assert.equal(record.cardFoils[id], "none");
    for (const style of ["monochrome", "minimalist", "cyberpunk", "glitched", "cosmic",
        "origami", "gothic", "silver", "crystal"]) {
        await game.setPlayerCardAppearance(style, "rainbow");
        assert.equal(record.cardStyles[id], style);
        assert.equal(record.cardFoils[id], "rainbow");
        assert.equal(record.cardStyles.another, "neon");
        assert.equal(record.cardFoils.another, "gold");
    }
    await assert.rejects(game.setPlayerCardAppearance("botanical"), /kortutseendet/);
    await assert.rejects(game.setPlayerCardAppearance("unknown"), /kortutseendet/);
    await assert.rejects(game.setPlayerCardAppearance("gold", "invalid"), /kortutseendet/);
    game.localPlayerName = players[1].name;
    await assert.rejects(game.setPlayerCardAppearance("pixel"), /kortutseendet/);
    game.localPlayerName = players[0].name;
    game.connectionOnline = false;
    await assert.rejects(game.setPlayerCardAppearance("pixel"), /kortutseendet/);
});

test("the source player ID can publish and display the secret style under any name", async () => {
    const context = loadGame(null, { getPlayerKey: () => "source" });
    const { PresidentGame, PresidentPlayer, GamePresence, GameLayout } = context;
    const player = new PresidentPlayer("Renamed player", "source");
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        localPlayerName: player.name, players: [player]
    });
    let record = { status: "O", spillere: [player.toRecord()] };
    game.databaseRef = { async transaction(transform) {
        const next = transform(record);
        if (next) { record = next; }
        return { committed: !!next, snapshot: { val: () => record } };
    } };
    await game.setPlayerCardAppearance("botanical", "gold");
    const id = GamePresence.playerId(player);
    assert.equal(record.cardStyles[id], "botanical");
    assert.equal(record.cardFoils[id], "gold");
    GameLayout.viewerName = "Different viewer";
    assert.equal(GameLayout.styleForPlayer(game, player.name), "botanical");
    assert.equal(GameLayout.foilForPlayer(game, player.name), "gold");
});
test("a stale save refreshes the local speed before republishing the lobby", () => {
    const { game } = setupGame();
    game.turnSeconds = 3;
    const listedSpeeds = [];
    game.updatePublicListing = () => listedSpeeds.push(game.turnSeconds);
    game.databaseRef = { transaction(transform, complete) {
        const record = transform({ status: "S", turnSeconds: 1 });
        complete(null, true, { val: () => record });
    } };
    game.save();
    assert.equal(game.turnSeconds, 1);
    assert.ok(listedSpeeds.length > 0);
    assert.ok(listedSpeeds.every(seconds => seconds == 1));
});

test("public lobby metadata publishes the shared turn speed, defaulting older rooms to two seconds", () => {
    const listings = [];
    const { PresidentGame, PresidentPlayer } = loadGame(null, {
        firebase: { database: () => ({
            ref: path => {
                assert.equal(path, "boms_public/test");
                return {
                    set(record) { listings.push(record); return Promise.resolve(); },
                    onDisconnect: () => ({ remove() {} })
                };
            }
        }) }
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "test", status: "O", isPublic: true, hostKey: "human-key",
        localPlayerName: "Host", players: [new PresidentPlayer("Host", "human-key")]
    });
    for (const seconds of [undefined, 1, 2, 3]) {
        game.turnSeconds = seconds;
        game.updatePublicListing();
        assert.equal(listings.at(-1).turnSeconds, seconds || 2);
    }
});

test("settings have three log-style categories with game speed directly below message duration", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
    const settings = html.slice(html.indexOf('id="dialogInnstillinger"'), html.indexOf('id="dialogFargetema"'));
    assert.equal((settings.match(/class="settings-category"/g) || []).length, 3);
    assert.match(settings, /data-speed="slow"[\s\S]*?<\/div>\s*<div class="setting-row setting-turn-speed"/);
    assert.match(css, /\.game-log__trick,\s*\.settings-category\s*\{/);
    assert.match(css, /\.game-log__trick::after,\s*\.settings-category::after\s*\{/);
    assert.match(css, /#playerActions > #playButton\s*\{\s*order: -1/);
});

test("lower four of a kind cannot beat the top pile", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 9)];
    const response = pile(players[1], 8);
    players[1].cards = Array.from(response);
    players[1].turn = 1;
    assert.equal(game.canPlayPile(players[1], response), false);
    assert.equal(game.canPlayRank(players[1], 8, {}), false);
});

test("unbeatable four clears, including when a higher holder passed or finished", () => {
    for (const state of ["no-higher", "passed", "finished"]) {
        const { game, players, pile } = setupGame();
        game.piles = [pile(players[0], 7)];
        players[1].cards = Array.from(pile(players[1], state === "no-higher" ? 6 : 8));
        if (state === "passed") { players[1].lastPlay = "Pass"; }
        if (state === "finished") { players[1].placement = 1; }
        assert.equal(game.pileCleared(), true, state);
    }
});

test("club three still clears and ordinary pairs remain open until everyone passes", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 7, 2)];
    assert.equal(game.pileCleared(), false);
    players[1].lastPlay = players[2].lastPlay = "Pass";
    assert.equal(game.pileCleared(), true);
    const { PresidentCard, CardPile } = loadGame();
    game.piles = [new CardPile(players[0].name, new PresidentCard(3, 3))];
    assert.equal(game.pileCleared(), true);
});

test("all three natural threes clear with two players but only two do not", () => {
    const { game, players } = setupGame();
    const { PresidentCard, CardPile } = loadGame();
    game.players = players.slice(0, 2);
    const threes = [1, 2, 4].map(suit => new PresidentCard(suit, 3));
    game.piles = [new CardPile(players[0].name, threes[0], threes[1])];
    assert.equal(game.pileCleared(), false);
    game.piles = [new CardPile(players[0].name, ...threes)];
    const info = {};
    assert.equal(game.pileCleared(info), true);
    assert.equal(info.text, "Treere");
    game.piles = threes.map(card => new CardPile(players[0].name, card));
    assert.equal(game.pileCleared(), true);
});

test("natural-three clear remains restricted to the correct player count", () => {
    const { game, players } = setupGame();
    const { PresidentCard, CardPile, PresidentPlayer } = loadGame();
    game.piles = [new CardPile(players[0].name, new PresidentCard(1, 3), new PresidentCard(2, 3))];
    assert.equal(game.pileCleared(), true);
    game.players.push(new PresidentPlayer("Fourth", "fourth-key"));
    assert.equal(game.pileCleared(), false);
});

test("clearing the table without a game keeps the turn timer controls in the page", () => {
    const timer = { id: "turnTimer", parentElement: null };
    const elements = new Map();
    const table = {
        dataset: {},
        set innerHTML(value) { timer.parentElement = null; },
        appendChild(child) { child.parentElement = this; }
    };
    timer.parentElement = table;
    const element = id => {
        if (id == "gameTable") { return table; }
        if (id == "turnTimer") { return timer.parentElement ? timer : null; }
        if (id == "turnCountdown" || id == "extendTurnButton") {
            return timer.parentElement ? elements.get(id) || elements.set(id, {}).get(id) : null;
        }
        if (!elements.has(id)) {
            elements.set(id, {
                id, hidden: false, dataset: {}, style: {}, textContent: "", inert: false,
                classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
                setAttribute() {}, removeAttribute() {}, querySelectorAll: () => []
            });
        }
        return elements.get(id);
    };
    const { GameLayout } = loadGame(null, {
        document: { getElementById: element, documentElement: { dataset: {} }, querySelectorAll: () => [] },
        setClass() {}
    });
    GameLayout.updateMainMenu = () => {};
    GameLayout.updateSharedView(null, null);
    assert.equal(timer.parentElement, table);
    assert.doesNotThrow(() => GameLayout.updatePlayerButtons(null, null));
});

test("the shuffle ticker refreshes the hand on the same clock that ends the rule pause", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        var lastShuffleStartedAt = null;");
    const end = source.indexOf("        function startNewGame(", start);
    for (const serverOffset of [-1500, 0, 1500]) {
        let now = 0;
        let ticker = null;
        const { GamePresence, PresidentGame } = loadGame(null, { Date: { now: () => now } });
        GamePresence.serverOffset = serverOffset;
        const game = Object.assign(Object.create(PresidentGame.prototype), {
            status: "S", shuffleStartedAt: 10000, players: [], turnPause: null, exchangeReady: null
        });
        const refreshes = [];
        const element = () => ({
            classList: { add() {}, remove() {} }, style: { setProperty() {} },
            setAttribute() {}, appendChild() {}, append() {}, remove() {}, querySelectorAll: () => []
        });
        const context = vm.createContext({
            GamePresence, SHUFFLE_DURATION_MS: 3000, currentGame: game,
            setInterval: callback => { ticker = callback; return 1; },
            clearInterval: () => { ticker = null; }, setTimeout: () => 0, clearTimeout() {},
            document: {
                createElement: element, body: element(), querySelectorAll: () => [],
                getElementById: () => null
            },
            refreshAfterTurnPause: refreshed => refreshes.push([now, refreshed.isTurnPaused()]),
            showGameToast() {}
        });
        vm.runInContext(source.slice(start, end), context);
        now = 10000 - serverOffset;
        context.playShuffleIfNew(game);
        assert.equal(typeof ticker, "function", `offset ${serverOffset}: the shuffle is presented`);
        while (ticker && now < 20000) {
            now += 40;
            ticker();
        }
        assert.deepEqual(refreshes.map(([, paused]) => paused), [false],
            `offset ${serverOffset}: the post-shuffle render must not see a paused turn`);
        assert.ok(refreshes[0][0] + serverOffset >= 13000 && refreshes[0][0] + serverOffset < 13040);
    }
});
