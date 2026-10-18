const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function toastClickContext(visible) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
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
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
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
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
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
        assert.match(content.children[1].textContent, /Du fikk .* og .* fra Sender\./);
        assert.equal(timers[0].delay, duration);
        listener({ detail: { ...receipt, cards: receipt.cards.slice(0, 1) } });
        assert.equal(timers.length, 1);
        timers[0].callback();
        assert.equal(content.children[0].children.length, 1);
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

function loadGame(cardStyle = null, globals = {}) {
    const context = vm.createContext({
        console, getCookie: () => null, getPlayerKey: () => "human-key", setTimeout: () => 0,
        localStorage: { getItem: () => cardStyle }, ...globals
    });
    for (const file of ["cards.js", "player.js", "game.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(file === "game.js" ? source.split(/\r?\n\(\r?\n/)[0] : source, context);
    }
    return vm.runInContext("({ PresidentGame, PresidentPlayer, PresidentCard, CardPile, GameLayout, isLobbyHost, availablePlayerName, sanitizePlayerName, BOT_NAMES, resultIconForPlacement })", context);
}

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

test("expired result votes keep the vote count without tie hints or stale seconds", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
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

test("Messenger sharing uses the invitation URL and explains unsupported desktop sharing", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const start = html.indexOf("            async function shareInviteMessenger()");
    const end = html.indexOf("            function sendInviteSms()", start);
    const status = {};
    const inviteUrl = "https://playboms.eu/?spillid=123";
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
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
    const context = vm.createContext({
        document: { cookie: `other=value; norwegian_tycoon_player_name=${encodeURIComponent("ギフテッド")}` },
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

test("waiting spectators register once, arm disconnect cleanup first and remove their own entry on leave", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
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
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
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

test("spectator join notices sit above the board for exactly three seconds", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "game.js"), "utf8");
    const toast = {
        style: {}, classList: { add() {}, remove() { toast.closed = true; } }
    };
    let callback;
    let duration;
    const context = vm.createContext({
        spectatorJoinToastTimer: null, localizedMessage: text => text,
        document: { getElementById: id => id == "spectatorJoinToast" ? toast :
            { offsetTop: 116, offsetParent: null } },
        setTimeout: (fn, delay) => { callback = fn; duration = delay; return 1; }
    });
    const start = source.indexOf("        function showSpectatorJoinToast()");
    const end = source.indexOf("        async function clearWaitingSpectator()", start);
    vm.runInContext(source.slice(start, end), context);
    context.showSpectatorJoinToast();
    assert.equal(toast.style.top, "124px");
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
    const { GameLayout, PresidentGame, PresidentPlayer } = loadGame(null, {
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
    assert.equal(info.text, "Hjerter 3, Spar 3 og Ruter 3");
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
