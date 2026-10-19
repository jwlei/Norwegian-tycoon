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

test("a fast toast that has reached its deadline is not cloned behind the next toast", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let visible = true;
    let clones = 0;
    const toast = {
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
                style: { setProperty() {} }, getBoundingClientRect() {}
            };
        }
    };
    const context = vm.createContext({
        Date: { now: () => 3000 }, gameToastExpiresAt: 3000,
        gameToastTimer: null, activeToastPauseId: null,
        GAME_SPEED_MS: { fast: 3000 }, currentGameSpeed: () => "fast",
        ensureGameLog() {}, clearTimeout() {}, setTimeout: () => 1,
        document: {
            getElementById: id => id === "GameToast" ? toast : { classList: { contains: () => false } },
            body: { appendChild() {} }
        },
        gameLogNeedsTrickHeader: false, gameLogEntries: [],
        localizedMessage: message => message, appendColoredGameMessage() {},
        game: { players: [] }
    });
    const hideStart = source.indexOf("        function hideGameToast()");
    const hideEnd = source.indexOf("        function resetGameLog", hideStart);
    const showStart = source.indexOf("        function showGameToast(");
    const showEnd = source.indexOf("        var receivedCardQueue", showStart);
    vm.runInContext(source.slice(hideStart, hideEnd) + source.slice(showStart, showEnd), context);
    vm.runInContext('showGameToast("Next", game)', context);
    assert.equal(clones, 0);
    assert.equal(context.gameToastExpiresAt, 6000);
    assert.equal(visible, true);
    toast.textContent = "Current";
    vm.runInContext('showGameToast("Early next", game)', context);
    assert.equal(clones, 1);
});

test("received-card overlays filter recipients, queue receipts and honor every game speed", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        var receivedCardQueue");
    const end = source.indexOf("        function refreshAfterTurnPause", start);
    const { PresidentCard } = loadGame();
    for (const [speed, duration] of [["fast", 5000], ["normal", 10000], ["slow", 15000]]) {
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
        const game = { id: "room", players: [{ name: "Sender", displayColor: "#123456" }] };
        const context = vm.createContext({
            currentGame: game, currentPlayerName: "Recipient",
            GAME_SPEED_MS: { fast: 3000, normal: 5000, slow: 8000 },
            currentGameSpeed: () => speed,
            localizedMessage: message => message,
            GameLayout: { cardStyle: () => "neon", createCardImage: card => {
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
            clearTimeout: id => { timers[id - 1].cleared = true; }
        });
        vm.runInContext(source.slice(start, end), context);
        const receipt = {
            game, recipient: "Recipient", sender: "Sender",
            cards: [new PresidentCard(1, 5), new PresidentCard(2, 13)]
        };
        listener({ detail: { ...receipt, recipient: "Other" } });
        listener({ detail: { ...receipt, game: { id: "other-room" } } });
        assert.equal(overlay.hidden, true);
        listener({ detail: receipt });
        assert.equal(overlay.hidden, false);
        assert.equal(content.children[0].children.length, 2);
        assert.equal(content.children[1].textContent, "Du fikk 5 og Konge fra Sender.");
        assert.equal(timers[0].delay, duration);
        listener({ detail: { ...receipt, cards: [new PresidentCard(3, 3)] } });
        assert.equal(timers.length, 1);
        timers[0].callback();
        assert.equal(content.children[0].children.length, 1);
        assert.equal(content.children[1].textContent, "Du fikk Kløver 3 fra Sender.");
        assert.equal(timers[1].delay, duration);
        overlay.click({ target: content, currentTarget: overlay });
        assert.equal(overlay.hidden, false);
        overlay.click({ target: overlay, currentTarget: overlay });
        assert.equal(timers[1].cleared, true);
        assert.equal(overlay.hidden, true);
    }
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
    game.skipOptionalTrade(optionalOffer, 0);
    assert.equal(game.status, "S");
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
    return vm.runInContext("({ PresidentGame, PresidentPlayer, PresidentCard, CardPile, GameLayout, GamePresence, isLobbyHost, availablePlayerName, sanitizePlayerName, BOT_NAMES, resultIconForPlacement, assignPlayerColors, isGiftPackage, isCardAllowedForExchange, chooseSuggestedPlayStrength })", context);
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

test("turn timer is hidden for a solo human and shown once another human is active", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        function updateTurnTimer()");
    const end = source.indexOf("        function refreshConnectionView()", start);
    const render = (activeHumanCount, currentPlayerName = "Owner") => {
        const elements = {
            turnTimer: { hidden: true },
            turnCountdown: { hidden: true, textContent: "" },
            extendTurnButton: { hidden: true, disabled: false }
        };
        const player = { name: "Owner", playerKey: "owner" };
        const context = vm.createContext({
            currentGame: {
                status: "S", players: [player], getPlayer: name => name == "Owner" ? player : null,
                actionDeadlines: { owner: { until: 200000, extended: false } }
            },
            currentPlayerName,
            connection: { now: () => 80000 },
            GamePresence: {
                isBot: () => false, playerId: () => "owner",
                activeHumanCount: () => activeHumanCount,
                hasExtendedThisRound: () => false
            },
            document: { getElementById: id => elements[id] }
        });
        vm.runInContext(source.slice(start, end), context);
        vm.runInContext("updateTurnTimer()", context);
        return elements;
    };
    const solo = render(1);
    assert.equal(solo.turnTimer.hidden, true);
    assert.equal(solo.turnCountdown.hidden, true);
    const multiplayer = render(2);
    assert.equal(multiplayer.turnTimer.hidden, false);
    assert.equal(multiplayer.turnCountdown.hidden, false);
    assert.equal(multiplayer.turnCountdown.textContent, "2:00");
    const spectator = render(2, "Spectator");
    assert.equal(spectator.turnTimer.hidden, false);
    assert.equal(spectator.turnCountdown.hidden, false);
    assert.equal(spectator.turnCountdown.textContent, "2:00");
    assert.equal(spectator.extendTurnButton.hidden, true);
});

test("consent stays private and remains available after a trade starts until cards are given", () => {
    const element = () => {
        const classes = new Set();
        return {
            dataset: {}, children: [], textContent: "", className: "",
            get childElementCount() { return this.children.length; },
            classList: { add: name => classes.add(name), contains: name => classes.has(name) },
            setAttribute() {},
            set innerHTML(value) { this.children = []; },
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
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    const render = player => {
        GameLayout.updateTable(game, player);
        return flatten(document.getElementById("gameTable"));
    };
    for (const player of [null, players[2]]) {
        assert.equal(render(player).some(node => /samtykke|Sneaky/.test(node.textContent)), false);
    }
    for (const player of players.slice(0, 2)) {
        assert.ok(render(player).some(node => /Trekk sneaky/.test(node.textContent)));
    }
    const start = render(players[0]).find(node => node.textContent === "Start frivillig bytte");
    assert.equal(start.disabled, false);
    start.onclick();
    for (const player of players.slice(0, 2)) {
        assert.ok(render(player).some(node => /Trekk sneaky/.test(node.textContent)));
    }
    game.piles.forEach(exchange => { exchange.sneakyLocked = true; });
    for (const player of players.slice(0, 2)) {
        assert.equal(render(player).some(node => /Trekk sneaky|Sneaky bytte$/.test(node.textContent)), false);
    }
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

    assert.equal(game.piles.length, 2);
    assert.ok(game.piles.every(exchange => exchange.mode === "Velg"));
    assert.ok(game.piles.every(exchange => exchange.sneakyVotes.length === 0));
    assert.ok(game.piles.every(exchange => isCardAllowedForExchange(exchange, new PresidentCard(1, 7))));
    assert.ok(game.piles.every(exchange => !isCardAllowedForExchange(exchange, new PresidentCard(1, 14))));
    game.toggleSneakyTrade(game.piles.find(exchange => exchange.from === 0), 0);
    game.toggleSneakyTrade(game.piles.find(exchange => exchange.from === 1), 1);
    assert.ok(game.piles.every(exchange => isCardAllowedForExchange(exchange, new PresidentCard(1, 14))));
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
            assert.equal(messages[0], "Oooh.. Sneaky..");
        } else {
            assert.match(messages[0], /ikke nådd.*7–J/);
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
    assert.equal(messages[1], "Oooh.. Sneaky..");
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
        console, document, window: { location: { protocol: "https:" } },
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
        GameLayout: { cardStyle: () => "normal" }, sanitizePlayerName
    });
    const shared = fs.readFileSync(path.join(__dirname, "..", "js", "shared.js"), "utf8");
    vm.runInContext(shared.slice(shared.indexOf("var savedCookieValues"),
        shared.indexOf("function hasClass")) +
        shared.slice(shared.indexOf("function getPlayerKey()"),
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
        assert.equal(key.length, 50);
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

test("all eight color themes have previews and persist without cookies", () => {
    const storage = new Map();
    const { context, options, elements } = colorThemeContext(storage);
    assert.deepEqual(options.map(option => option.dataset.colorTheme),
        ["blue", "forest", "teal", "amethyst", "burgundy", "amber", "gray", "amoled"]);
    assert.equal(context.document.documentElement.dataset.colorTheme, "blue");
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
    assert.equal(context.document.documentElement.dataset.colorTheme, "blue");
    const invalid = new Map([["norwegian-tycoon-cookie-ColorTheme", "invalid"]]);
    assert.equal(colorThemeContext(invalid).context.document.documentElement.dataset.colorTheme, "blue");
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
                var game = { players: [player], piles: [activeExchange] };`, context);
            context.elemKort = { classList: { add: name => classes.add(name) } };
            vm.runInContext(source.slice(start, end), context);
            const illegal = !sneaky && (rank < 7 || rank > 11);
            assert.equal(context.elemKort.disabled, illegal);
            assert.equal(classes.has("is-unplayable"), illegal);
        }
    }
});

function playButtonContext(options = {}) {
    const { CardPile, PresidentCard, GamePresence } = loadGame();
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
        CardPile, GamePresence, game, player, playButton, selectedCardKeys,
        isPlayingTurn: game.status == "S" && player.turn == 1 &&
            player.placement == 0 && !game.isTurnPaused(),
        clearCardSelection: () => selectedCardKeys.clear(),
        showInvalidCardWarning: () => { warnings++; }
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
    const start = source.indexOf("        var playSelectedCards = function ()");
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
    assert.ok(record.turnPause.until - Date.now() > 2000);
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
    assert.equal(game.actionPauseMs(), 3000);
});

test("bot scheduling switches to one second and restores its original delay", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { game, players } = setupGame();
    const { GamePresence } = loadGame();
    players[0].placement = 1;
    const timers = [];
    const cleared = [];
    const context = vm.createContext({
        currentGame: game, GamePresence: { ...GamePresence,
            onlyBotsRemain: record => GamePresence.onlyBotsRemain(record), canDrive: () => true },
        connection: null, BOT_ACTION_DELAY_MS: 3000,
        setTimeout: (callback, delay) => { timers.push(delay); return timers.length; },
        clearTimeout: id => cleared.push(id)
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
});

test("ordinary saves preserve concurrent fast-forward toggles and their pause deadlines", () => {
    const { game, players } = setupGame();
    players[0].placement = 1;
    game.fastForward = false;
    const now = Date.now();
    game.turnPause = { id: "same", kind: "play", until: now + 3000 };
    let record = {
        status: "S", shuffleStartedAt: null, fastForward: true,
        turnPause: { id: "same", kind: "play", until: now + 1000 }
    };
    game.databaseRef = { transaction: update => { record = update(record); } };
    game.save();
    assert.equal(record.fastForward, true);
    assert.equal(record.turnPause.until, now + 1000);
    game.turnPause = { id: "new", kind: "play", until: now + 3000 };
    game.save();
    assert.equal(record.fastForward, true);
    assert.equal(record.turnPause.until, now + 1000);
    game.fastForward = true;
    record.fastForward = false;
    record.turnPause = { id: "other", until: now };
    game.turnPause = { id: "third", kind: "play", until: now + 1000 };
    game.save();
    assert.equal(record.fastForward, false);
    assert.equal(record.turnPause.until, now + 3000);
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

test("exchange rendering waits for the exact shuffle deadline", () => {
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
    assert.equal(GameLayout.isShufflingExchange(game), true);
    GameLayout.updateTable(game, null);
    assert.equal(elements.get("gameTable").cleared, true);
    now = 4499;
    assert.equal(GameLayout.isShufflingExchange(game), true);
    now = 4500;
    assert.equal(GameLayout.isShufflingExchange(game), false);
    game.status = "S";
    now = 1000;
    assert.equal(GameLayout.isShufflingExchange(game), false);
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
        currentGame: game, Date: { now: () => now }, SHUFFLE_DURATION_MS: 3500,
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

test("the starter toast names Boms during exchange, including the local player", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const messages = [];
    const context = vm.createContext({
        currentGame: { status: "G", roundStarterName: "Bjørn" }, currentPlayerName: "Bjørn",
        starterFlashTimer: null, STARTER_FLASH_DURATION_MS: 1000,
        showGameToast: text => messages.push(text),
        document: { querySelectorAll: () => [] }, setTimeout: () => 1, clearTimeout() {}
    });
    vm.runInContext(source.slice(source.indexOf("        function flashRoundStarter()"),
        source.indexOf("        function dealCardsIntoHand()")), context);
    context.flashRoundStarter();
    assert.equal(messages.pop(), "Bjørn er Boms og starter.");
    context.currentPlayerName = "Guest";
    context.flashRoundStarter();
    assert.equal(messages.pop(), "Bjørn er Boms og starter.");
    context.currentGame = { status: "S", turn: 0, players: [{ name: "Guest" }] };
    context.flashRoundStarter();
    assert.equal(messages.pop(), "Du begynner");
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

test("settings show the localized selected style name alongside its preview", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { PresidentCard } = loadGame();
    const label = {};
    const preview = { replaceChildren(child) { this.child = child; } };
    const cards = {};
    const context = vm.createContext({
        PresidentCard, style: "holo", selectedName: "Holo",
        GameLayout: { cardStyle: () => context.style, canUseBotanicalStyle: () => true },
        localizedMessage: text => "Translated " + text,
        document: {
            documentElement: { dataset: {} },
            getElementById: id => id == "cardStyleCurrent" ? preview :
                (id == "cardStyleCurrentName" ? label : {}),
            querySelectorAll: () => [],
            querySelector: () => ({
                textContent: context.selectedName,
                parentElement: { querySelector: () => ({ cloneNode: () => cards }) }
            })
        }
    });
    vm.runInContext(source.slice(source.indexOf("        function updateCardStyleButtons()"),
        source.indexOf("        updateCardStyleButtons();")), context);
    for (const name of ["Holo", "Gull", "Pixel Art", "Parallax", "Neon", "Vanlig", "Grønn tåke"]) {
        context.selectedName = name;
        context.updateCardStyleButtons();
        assert.equal(label.textContent, "Translated " + name);
        assert.equal(preview.child, cards);
    }
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
        shuffleEndsAt: 0, BOT_ACTION_DELAY_MS: 1000,
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
    GameLayout.updateSharedView({ id: "lobby", status: "S", players: [] }, null);
    assert.equal(elements.get("lobbyCapacity").hidden, true);
});

test("lobby slots follow player order for every viewer and reuse faded empty seats", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "layout.js"), "utf8");
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
    const context = vm.createContext({
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
});

test("every card renders in each style with distinct artwork", () => {
    const { PresidentCard } = loadGame();
    const styles = ["normal", "holo", "gold", "pixel", "parallax", "neon", "botanical"];
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
    for (const style of ["normal", "holo", "gold", "pixel", "parallax", "neon"]) {
        assert.equal(loadGame(style).GameLayout.cardStyle(), style);
    }
    assert.equal(loadGame("invalid").GameLayout.cardStyle(), "normal");
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

function setupGame() {
    const types = loadGame();
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
    return { game, players, pile };
}

test("passing and clearing a pile preserve every displayed card's position and render identity", () => {
    const element = () => ({
        children: [], dataset: {}, style: { setProperty(name, value) { this[name] = value; } },
        setAttribute() {},
        appendChild(child) { this.children.push(child); }
    });
    const { GameLayout, PresidentCard } = loadGame(null, {
        document: { createElement: element },
        window: { matchMedia: () => ({ matches: false }) }
    });
    GameLayout.createCardImage = element;
    const { game, players, pile } = setupGame();
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
    assert.equal(game.piles.length, 2);
    assert.equal(game.piles[0].mode, "Velg");
    assert.equal(game.piles[1].mode, "Best");
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

test("name suffixes remain within 28 code points and can skip used suffixes", () => {
    const { availablePlayerName } = loadGame();
    const name = "A".repeat(28);
    assert.equal(availablePlayerName(name, [name]), "A".repeat(26) + "-1");
    assert.equal(availablePlayerName("Guest", ["Guest", "Guest-2"]), "Guest-1");
    const emojiName = "\u{1f600}".repeat(28);
    assert.equal(Array.from(availablePlayerName(emojiName, [emojiName])).length, 28);
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
    const { game, players } = setupGame();
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
    return { game, players, stored, snapshots };
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

test("finished status is saved before creating the result vote", () => {
    const { game, stored, snapshots } = finishedVotingGame();
    game.status = stored.status = "S";
    game.gameEndVote = stored.gameEndVote = null;
    assert.equal(game.finishGame(), true);
    assert.equal(stored.status, "F");
    assert.ok(stored.gameEndVote);
    assert.equal(snapshots[0].status, "F");
    assert.equal(snapshots.some(snapshot => snapshot.status === "S" && snapshot.vote != null), false);
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

test("four accumulated equal cards can be beaten only by four higher cards", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 7, 2), pile(players[2], 7, 2)];
    const response = pile(players[1], 9);
    players[1].cards = Array.from(response);
    players[1].turn = 1;
    assert.equal(game.pileCleared(), false);
    const pair = new response.constructor(players[1].name, response[0], response[1]);
    assert.equal(game.canPlayPile(players[1], pair), false);
    assert.equal(game.canPlayPile(players[1], response), true);
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
