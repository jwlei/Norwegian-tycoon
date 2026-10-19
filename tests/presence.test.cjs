const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPresence(globals = {}) {
    const context = vm.createContext({
        console, getPlayerKey: () => "owner", SHUFFLE_DURATION_MS: 3500,
        isLobbyHost: game => game.hostKey == "owner" && game.hostName == game.localPlayerName,
        ...globals
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "presence.js"), "utf8"), context);
    return vm.runInContext("GamePresence", context);
}
const Presence = loadPresence();
const start = 1000000;
const human = (name, key) => ({ nick: name, spillerKey: key, plassering: 0 });
function room() {
    return {
        status: "S", shuffleStartedAt: start - 10000, runde: 1, sinTur: 0, spillBunke: [],
        spillere: [human("Owner", "owner"), human("Guest", "guest")],
        hostKey: "owner", hostName: "Owner", turnPause: null, presence: {}
    };
}
function session(record, index, online, changedAt = start) {
    record.presence[Presence.playerId(record.spillere[index])] = { tab: { online, changedAt } };
}

test("presence IDs support Firebase keys, Unicode and shared-browser named seats", () => {
    const first = Presence.playerId({ name: "ギフテッド.#[]/$", playerKey: "owner" });
    assert.doesNotMatch(first, /[.#\[\]\/$]/);
    assert.equal(first, Presence.playerId({ nick: "ギフテッド.#[]/$", spillerKey: "owner" }));
    assert.notEqual(first, Presence.playerId({ name: "Other", playerKey: "owner" }));
});

test("one connected tab keeps the player online and final disconnect starts the grace period", () => {
    const record = room();
    session(record, 0, false, start);
    const sessions = record.presence[Presence.playerId(record.spillere[0])];
    sessions.other = { online: true, changedAt: start + 1000 };
    assert.equal(Presence.disconnectedAt(record.presence, record.spillere[0]), null);
    sessions.other = { online: false, changedAt: start + 2000 };
    assert.equal(Presence.disconnectedAt(record.presence, record.spillere[0]), start + 2000);
    assert.equal(Presence.disconnectedAt({}, record.spillere[0]), null);
});

test("a lobby disconnect clears readiness immediately without mutating the received record", () => {
    const record = room();
    record.status = "O";
    record.spillere.forEach(player => { player.ready = true; });
    session(record, 0, true);
    session(record, 1, false);
    const next = Presence.reconcile(record, start);
    assert.equal(next.spillere[0].ready, true);
    assert.equal(next.spillere[1].ready, false);
    assert.equal(record.spillere[1].ready, true);
    assert.equal(Presence.reconcile(next, start + 1), undefined);
    session(next, 1, true, start + 2);
    assert.equal(Presence.reconcile(next, start + 2), undefined);
    assert.equal(next.spillere[1].ready, false);
});

test("lobby readiness remains set for online tabs, bots and players without presence data", () => {
    const record = room();
    record.status = "O";
    record.spillere.push(human("Bot", "PC"));
    record.spillere.forEach(player => { player.ready = true; });
    session(record, 0, false);
    record.presence[Presence.playerId(record.spillere[0])].other = { online: true, changedAt: start };
    session(record, 2, false);
    assert.equal(Presence.reconcile(record, start), undefined);
    assert.ok(record.spillere.every(player => player.ready));
});

test("disconnects do not reset readiness outside the lobby", () => {
    for (const status of ["S", "G", "F"]) {
        const record = room();
        record.status = status;
        record.spillere[1].ready = true;
        session(record, 1, false);
        const next = Presence.reconcile(record, start) || record;
        assert.equal(next.spillere[1].ready, true);
    }
});

test("turns get exactly 120 seconds and expire at the precise deadline, not before", () => {
    const record = Presence.reconcile(room(), start);
    const id = Presence.playerId(record.spillere[0]);
    assert.equal(record.actionDeadlines[id].until, start + 120000);
    assert.equal(record.actionDeadlines[id].extended, false);
    assert.equal(Presence.reconcile(record, start + 119999), undefined);
    const expired = Presence.reconcile(record, start + 120000);
    assert.equal(expired.controllers[id].reason, "idle");
    assert.match(expired.connectionNotices[0].message, /brukte opp tiden/);
    const clearedDeadline = Presence.reconcile(expired, start + 121000);
    assert.equal(Object.keys(clearedDeadline.actionDeadlines).length, 0);
    assert.equal(Presence.reconcile(clearedDeadline, start + 122000), undefined);
    assert.equal(expired.spillere[0].spillerKey, "owner");
});

test("action deadlines require two active human players and stop when only one remains", () => {
    const owner = human("Owner", "owner");
    const bots = [human("Bot 1", "PC"), human("Bot 2", "PC"), human("Bot 3", "PC")];
    const solo = { ...room(), spillere: [owner, ...bots] };
    assert.equal(Presence.activeHumanCount(solo), 1);
    assert.equal(Presence.reconcile(solo, start), undefined);
    assert.equal(Object.keys(solo.actionDeadlines || {}).length, 0);

    const multiplayer = { ...solo, spillere: [...solo.spillere, human("Guest", "guest")] };
    assert.equal(Presence.activeHumanCount(multiplayer), 2);
    const timed = Presence.reconcile(multiplayer, start);
    const ownerId = Presence.playerId(owner);
    assert.equal(timed.actionDeadlines[ownerId].until, start + 120000);

    const guestLeft = {
        ...timed,
        spillere: timed.spillere.map(player =>
            player.spillerKey == "guest" ? { ...player, gaveUp: true } : player
        )
    };
    const untimed = Presence.reconcile(guestLeft, start + 1000);
    assert.equal(Presence.activeHumanCount(guestLeft), 1);
    assert.equal(untimed.actionDeadlines[ownerId], undefined);
});

test("turn changes reset the deadline and gameplay pauses do not consume thinking time", () => {
    let record = Presence.reconcile(room(), start);
    const ownerId = Presence.playerId(record.spillere[0]);
    record = Presence.reconcile({ ...record, sinTur: 1, turnPause: { until: start + 10000 } }, start + 1000);
    assert.equal(record.actionDeadlines[ownerId], undefined);
    assert.equal(Object.keys(record.actionDeadlines).length, 0);
    record = Presence.reconcile({ ...record, turnPause: null }, start + 10000);
    const guestId = Presence.playerId(record.spillere[1]);
    assert.equal(record.actionDeadlines[guestId].until, start + 130000);
});

test("exchange deadlines start with 120 seconds only after shuffling has finished", () => {
    const record = room();
    record.status = "G";
    record.shuffleStartedAt = start;
    record.spillBunke = [{ id: "offer", modus: "Tilbud", fra: 1, til: 0 }];
    assert.equal(Presence.reconcile(record, start), undefined);
    assert.equal(Presence.reconcile(record, start + 3499), undefined);
    const next = Presence.reconcile(record, start + 3500);
    const guestId = Presence.playerId(record.spillere[1]);
    assert.equal(next.actionDeadlines[guestId].until, start + 3500 + 120000);
    assert.equal(Object.keys(next.actionDeadlines).length, 1);
    record.spillBunke = [{ id: "give", modus: "Gitt", fra: 1, til: 0 }];
    assert.equal(Presence.actionToken(record, record.spillere[1], 1), null);
});

test("the three-second play pause is excluded even when the completed pause remains stored", () => {
    const record = room();
    record.turnPause = { kind: "play", until: start + 3000 };
    assert.equal(Presence.reconcile(record, start), undefined);
    assert.equal(Presence.reconcile(record, start + 2999), undefined);
    const next = Presence.reconcile(record, start + 3000);
    const id = Presence.playerId(record.spillere[0]);
    assert.equal(next.actionDeadlines[id].until, start + 123000);
    assert.equal(Presence.reconcile(next, start + 122999), undefined);
    assert.equal(Presence.reconcile(next, start + 123000).controllers[id].reason, "idle");
});

test("clearing piles blocks the countdown until the discard animation is complete", () => {
    const record = room();
    record.turnPause = { kind: "clear", until: start, clearedPiles: [{ cards: [] }] };
    assert.equal(Presence.reconcile(record, start + 3000), undefined);
    record.turnPause = { ...record.turnPause, clearedPiles: [] };
    const next = Presence.reconcile(record, start + 4000);
    assert.equal(next.actionDeadlines[Presence.playerId(record.spillere[0])].until, start + 124000);
    const pendingEnd = { ...record, turnPause: { kind: "finish", until: start, pendingGameEnd: true } };
    assert.equal(Presence.reconcile(pendingEnd, start + 4000), undefined);
});

test("offline players get bot takeover after 120 seconds even when it is not their turn", () => {
    const record = room();
    session(record, 1, false);
    const initialized = Presence.reconcile(record, start);
    const id = Presence.playerId(record.spillere[1]);
    assert.equal(Presence.reconcile(initialized, start + 119999), undefined);
    const expired = Presence.reconcile(initialized, start + 120000);
    assert.equal(expired.controllers[id].reason, "offline");
    assert.match(expired.connectionNotices.find(notice => notice.message.includes("Guest")).message, /ble frakoblet/);
});

test("reconnecting before the grace deadline cancels offline takeover", () => {
    const record = room();
    record.sinTur = -1;
    session(record, 1, false);
    session(record, 1, true, start + 119000);
    assert.equal(Presence.reconcile(record, start + 120000), undefined);
});

test("disconnect grace is a full 120 seconds even near the end of the player's turn", () => {
    const record = Presence.reconcile(room(), start);
    session(record, 0, false, start + 119000);
    assert.equal(Presence.reconcile(record, start + 120000), undefined);
    assert.equal(Presence.reconcile(record, start + 238999), undefined);
    const expired = Presence.reconcile(record, start + 239000);
    assert.equal(expired.controllers[Presence.playerId(record.spillere[0])].reason, "offline");
});

test("a disconnected host is replaced at 240 seconds, not the 120-second bot deadline", () => {
    const record = room();
    record.sinTur = -1;
    session(record, 0, false);
    session(record, 1, true);
    const afterBot = Presence.reconcile(record, start + 120000);
    assert.equal(afterBot.hostKey, "owner");
    assert.equal(Presence.reconcile(afterBot, start + 239999), undefined);
    const afterHost = Presence.reconcile(afterBot, start + 240000);
    assert.equal(afterHost.hostKey, "guest");
    assert.equal(afterHost.hostName, "Guest");
    assert.equal(Presence.reconcile(afterHost, start + 241000), undefined);
});

test("one connected client runs takeover bots at 120 seconds without transferring the host role early", () => {
    const game = {
        hostKey: "guest", hostName: "Guest", localPlayerName: "Owner", presence: {},
        players: [{ name: "Guest", playerKey: "guest" }, { name: "Owner", playerKey: "owner" },
            { name: "Third", playerKey: "third" }]
    };
    game.presence[Presence.playerId(game.players[0])] = { tab: { online: false, changedAt: start } };
    game.presence[Presence.playerId(game.players[1])] = { tab: { online: true, changedAt: start } };
    game.presence[Presence.playerId(game.players[2])] = { tab: { online: true, changedAt: start } };
    assert.equal(Presence.canDrive(game, start + 119999), false);
    assert.equal(Presence.canDrive(game, start + 120000), true);
    assert.equal(game.hostKey, "guest");
    const otherClient = loadPresence({ getPlayerKey: () => "third" });
    assert.equal(otherClient.canDrive({ ...game, localPlayerName: "Third" }, start + 120000), false);
    game.connectionOnline = false;
    assert.equal(Presence.canDrive(game, start + 120000), false);
});

test("host election uses live named seats and never elects a normal bot", () => {
    const record = room();
    record.status = "O";
    record.spillere = [human("Owner", "owner"), human("Bot", "PC"), human("Same device", "owner")];
    session(record, 0, false);
    session(record, 2, true);
    const elected = Presence.reconcile(record, start + 240000);
    assert.equal(elected.hostKey, "owner");
    assert.equal(elected.hostName, "Same device");
});

test("offline finished players and lobby seats are not replaced by bots", () => {
    const record = room();
    record.status = "O";
    session(record, 1, false);
    assert.equal(Presence.reconcile(record, start + 120000), undefined);
    record.status = "S";
    record.sinTur = -1;
    record.spillere[1].plassering = 2;
    assert.equal(Presence.reconcile(record, start + 120000), undefined);
});

function controlClient() {
    let now = start;
    const P = loadPresence({ getPlayerKey: () => "owner" });
    let stored = P.reconcile(room(), now);
    const messages = [];
    const client = Object.assign(Object.create(P.prototype), {
        game: {
            getPlayer: () => ({ name: "Owner", playerKey: "owner" }),
            databaseRef: { async transaction(transform) {
                const next = transform(structuredClone(stored));
                if (next) { stored = next; }
                return { committed: !!next };
            } }
        },
        playerName: () => "Owner", online: true, pending: false,
        now: () => now, notify: text => messages.push(text)
    });
    return {
        P, client, messages, get stored() { return stored; },
        set stored(value) { stored = value; }, set now(value) { now = value; }
    };
}

test("deadline can be extended once by exactly 120 seconds, but not after expiry", async () => {
    const fixture = controlClient();
    const id = Presence.playerId(fixture.stored.spillere[0]);
    await fixture.client.changeControl();
    assert.equal(fixture.stored.actionDeadlines[id].until, start + 240000);
    assert.equal(fixture.stored.actionDeadlines[id].extended, true);
    await fixture.client.changeControl();
    assert.equal(fixture.stored.actionDeadlines[id].until, start + 240000);
    assert.equal(fixture.messages.length, 1);
    assert.equal(Presence.reconcile(fixture.stored, start + 239999), undefined);
    assert.ok(Presence.reconcile(fixture.stored, start + 240000).controllers[id]);
    const late = controlClient();
    late.now = start + 120000;
    await late.client.changeControl();
    assert.equal(late.messages.length, 1);
    assert.equal(late.stored.actionDeadlines[id].until, start + 120000);
});

test("taking back a bot seat preserves cards, placement and identity and starts a new deadline", async () => {
    const fixture = controlClient();
    fixture.stored.spillere[0].kort = [{ suit: 1, rank: 5 }];
    fixture.stored = Presence.reconcile(fixture.stored, start + 120000);
    const id = Presence.playerId(fixture.stored.spillere[0]);
    assert.ok(fixture.stored.controllers[id]);
    fixture.now = start + 121000;
    await fixture.client.changeControl(true);
    assert.equal(fixture.stored.controllers[id], undefined);
    assert.equal(fixture.stored.actionDeadlines[id].until, start + 241000);
    assert.equal(fixture.stored.spillere[0].spillerKey, "owner");
    assert.equal(fixture.stored.spillere[0].plassering, 0);
    assert.equal(fixture.stored.spillere[0].kort.length, 1);
    assert.equal(fixture.stored.connectionNotices.length, 1);
});

test("one extension per round survives turns, pauses, exchange stages, reconnects and reclaiming", async () => {
    const fixture = controlClient();
    const id = Presence.playerId(fixture.stored.spillere[0]);
    await fixture.client.changeControl();
    assert.ok(Presence.hasExtendedThisRound(fixture.stored, fixture.stored.spillere[0]));
    fixture.stored = Presence.reconcile({ ...fixture.stored, turnPause: { until: start + 1000 } }, start);
    assert.equal(fixture.stored.actionDeadlines[id], undefined);
    fixture.stored = Presence.reconcile({ ...fixture.stored, turnPause: null }, start + 1000);
    assert.equal(fixture.stored.actionDeadlines[id].extended, true);
    const until = fixture.stored.actionDeadlines[id].until;
    await fixture.client.changeControl();
    assert.equal(fixture.stored.actionDeadlines[id].until, until);
    fixture.stored = Presence.reconcile({ ...fixture.stored, sinTur: 1 }, start + 2000);
    fixture.stored = Presence.reconcile({ ...fixture.stored, sinTur: 0 }, start + 3000);
    assert.equal(fixture.stored.actionDeadlines[id].extended, true);
    fixture.stored = Presence.reconcile({ ...fixture.stored, status: "G",
        spillBunke: [{ id: "trade", modus: "Velg", fra: 0, til: 1 }] }, start + 4000);
    assert.equal(fixture.stored.actionDeadlines[id].extended, true);
    fixture.stored = structuredClone(fixture.stored);
    fixture.stored.controllers = { [id]: { since: start, reason: "idle" } };
    await fixture.client.changeControl(true);
    assert.equal(fixture.stored.actionDeadlines[id].extended, true);
    await fixture.client.changeControl();
    assert.equal(fixture.messages.length, 2);
    fixture.stored = Presence.reconcile({ ...fixture.stored, status: "S", spillBunke: [],
        runde: 2, shuffleStartedAt: start + 5000 }, start + 5000);
    assert.equal(fixture.stored.actionDeadlines[id].extended, false);
    await fixture.client.changeControl();
    assert.equal(fixture.stored.actionDeadlines[id].extended, true);
});

test("a stale deadline cannot consume the extension for a new round or another player's turn", async () => {
    for (const update of [{ runde: 2 }, { sinTur: 1 }, { status: "F" }]) {
        const fixture = controlClient();
        Object.assign(fixture.stored, update);
        await fixture.client.changeControl();
        assert.equal(fixture.stored.turnExtensions, undefined);
        assert.equal(fixture.messages.length, 1);
    }
});

test("bot control is independent of the retained human identity", () => {
    const player = { name: "Owner", playerKey: "owner" };
    assert.equal(Presence.isBot({}, player), false);
    assert.equal(Presence.isBot({ controllers: { [Presence.playerId(player)]: { since: start } } }, player), true);
    assert.equal(Presence.isBot({}, { name: "Bot", playerKey: "PC" }), true);
});

test("connection registration arms onDisconnect before marking online, reconnects and cleans up", async () => {
    const handlers = new Map();
    const sessions = [];
    const calls = [];
    const ref = path => ({
        on(type, callback) { handlers.set(path, callback); },
        off(type, callback) { assert.equal(handlers.get(path), callback); handlers.delete(path); }
    });
    const firebase = { database: () => ({ ref }) };
    firebase.database.ServerValue = { TIMESTAMP: { ".sv": "timestamp" } };
    const P = loadPresence({
        firebase, setInterval: () => 1, clearInterval: id => assert.equal(id, 1)
    });
    const game = {
        getPlayer: () => ({ name: "Owner", playerKey: "owner" }),
        databaseRef: { child: () => ({ push() {
            const index = sessions.length;
            const session = {
                onDisconnect: () => ({
                    async set(value) { calls.push(`arm${index}`); session.offline = value; },
                    async cancel() { calls.push(`cancel${index}`); }
                }),
                async set(value) { calls.push(`online${index}`); session.value = value; },
                async remove() { calls.push(`remove${index}`); }
            };
            sessions.push(session);
            return session;
        } }) }
    };
    let remembered = 0;
    const client = new P({
        game, playerName: () => "Owner", refresh() {}, notify: text => assert.fail(text),
        remember() { remembered++; }
    });
    const flush = async () => { for (let step = 0; step < 8; step++) { await Promise.resolve(); } };
    handlers.get(".info/connected")({ val: () => true });
    await flush();
    assert.equal(sessions.length, 0);
    game.players = [];
    await client.register();
    await flush();
    assert.deepEqual(calls.slice(0, 2), ["arm0", "online0"]);
    assert.equal(sessions[0].offline.online, false);
    assert.deepEqual(JSON.parse(JSON.stringify(sessions[0].offline.changedAt)), { ".sv": "timestamp" });
    assert.equal(remembered, 1);
    handlers.get(".info/connected")({ val: () => false });
    assert.equal(game.connectionOnline, false);
    handlers.get(".info/connected")({ val: () => true });
    await flush();
    assert.equal(game.connectionOnline, true);
    assert.deepEqual(calls.slice(2), ["arm1", "online1", "cancel0", "remove0"]);
    client.stop();
    await flush();
    assert.equal(handlers.size, 0);
    assert.ok(calls.includes("remove1"));
});

test("session expiry is strictly after ten minutes and uses only human activity or legacy timestamps", () => {
    assert.equal(Presence.sessionMs, 600000);
    for (const status of ["O", "G", "S", "F"]) {
        const record = { status, lastHumanActionAt: start, ts: new Date(start + 599999).toISOString() };
        assert.equal(Presence.isExpired(record, start + 600000), false);
        assert.equal(Presence.isExpired(record, start + 600001), true);
        assert.equal(Presence.reconcile(record, start + 600001).status, "V");
        assert.equal(record.status, status);
    }
    assert.equal(Presence.isExpired({ ts: new Date(start).toISOString() }, start + 600001), true);
    assert.equal(Presence.isExpired({ ts: new Date(start) }, start + 600001), true);
    assert.equal(Presence.isExpired({ lastHumanActionAt: 0 }, 600001), true);
    for (const record of [null, {}, { ts: "invalid" }]) {
        assert.equal(Presence.isExpired(record, start + 600001), false);
    }
    assert.equal(Presence.lastActivityAt({}), null);
    assert.equal(Presence.isExpired({ status: "V", lastHumanActionAt: start }, start), true);
    assert.equal(Presence.reconcile({ ...room(), status: "V" }, start), undefined);
});

test("legacy reconciliation freezes the session baseline before later bot saves change ts", () => {
    const original = { ...room(), status: "O", ts: new Date(start).toISOString() };
    const initialized = Presence.reconcile(original, start + 1000);
    assert.equal(initialized.lastHumanActionAt, start);
    assert.equal(original.lastHumanActionAt, undefined);
    initialized.ts = new Date(start + 590000).toISOString();
    assert.equal(Presence.reconcile(initialized, start + 600000), undefined);
    const expired = Presence.reconcile(initialized, start + 600001);
    assert.equal(expired.status, "V");
    assert.equal(expired.lastHumanActionAt, start);
});

function lifecycleGame({ serverTimestamp = null } = {}) {
    let now = start;
    let stored = null;
    const localWriteOptions = [];
    const rawWrites = [];
    const listing = { removed: 0, value: null };
    const root = {
        transaction(transform, complete, applyLocally) {
            localWriteOptions.push(applyLocally);
            const next = transform(stored == null ? null : structuredClone(stored));
            if (next !== undefined) {
                rawWrites.push(structuredClone(next));
                stored = structuredClone(next);
                if (stored.lastHumanActionAt && stored.lastHumanActionAt[".sv"] == "timestamp") {
                    stored.lastHumanActionAt = serverTimestamp;
                }
            }
            if (complete) { complete(null, next !== undefined, { val: () => stored }); }
            return Promise.resolve({ committed: next !== undefined, snapshot: { val: () => stored } });
        },
        child() {
            return { remove: () => Promise.resolve(), set: () => Promise.resolve() };
        }
    };
    const firebase = { database: () => ({ ref: path => path.startsWith("boms_1/") ? root : {
        set(value) { listing.value = value; return Promise.resolve(); },
        remove() { listing.value = null; listing.removed++; return Promise.resolve(); },
        onDisconnect: () => ({ remove() {} })
    } }) };
    if (serverTimestamp != null) {
        firebase.database.ServerValue = { TIMESTAMP: { ".sv": "timestamp" } };
    }
    const context = vm.createContext({
        console, firebase, getCookie: () => null, getPlayerKey: () => "owner",
        setTimeout: () => 0, clearTimeout() {},
        document: { dispatchEvent() {} }, CustomEvent: class {},
        Date: class extends Date {
            constructor(...args) { super(...(args.length ? args : [now])); }
            static now() { return now; }
        }
    });
    for (const file of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "engine.js", "bot-turn.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    const types = vm.runInContext("({ PresidentGame, PresidentPlayer, PresidentCard, CardPile, CardDeck, GamePresence, playBotTurn })", context);
    const game = new types.PresidentGame();
    game.localPlayerName = game.hostName = "Owner";
    game.players = [
        new types.PresidentPlayer("Owner", "owner"),
        new types.PresidentPlayer("Bot", "PC"),
        new types.PresidentPlayer("Other bot", "PC")
    ];
    game.players.forEach(player => {
        player.cards = new types.CardDeck();
        player.cards.push(new types.PresidentCard(1, 5), new types.PresidentCard(2, 8));
    });
    game.status = "S";
    game.setTurn(0);
    game.save();
    return {
        game, types, listing, localWriteOptions, rawWrites,
        get stored() { return stored; }, set stored(value) { stored = value; },
        get now() { return now; }, set now(value) { now = value; }
    };
}

test("fresh lobbies establish a persisted human-session baseline", () => {
    const fixture = lifecycleGame();
    assert.equal(fixture.game.lastHumanActionAt, start);
    assert.equal(fixture.stored.lastHumanActionAt, start);
});

test("creation publishes its local transaction before subscribers attach but later saves do not", () => {
    const fixture = lifecycleGame();
    assert.deepEqual(fixture.localWriteOptions, [true, false]);
    fixture.game.save();
    assert.deepEqual(fixture.localWriteOptions, [true, false, false]);
});

test("creation uses Firebase server time even before the clock offset is initialized", () => {
    const fixture = lifecycleGame({ serverTimestamp: start + 120000 });
    assert.deepEqual(fixture.rawWrites[0].lastHumanActionAt, { ".sv": "timestamp" });
    assert.equal(fixture.stored.lastHumanActionAt, start + 120000);
    assert.equal(fixture.game.lastHumanActionAt, start + 120000);
});

test("human activity and default expiry checks share the server-adjusted clock", () => {
    const fixture = lifecycleGame();
    const { game, types } = fixture;
    types.GamePresence.serverOffset = 300000;
    assert.equal(types.GamePresence.now(), start + 300000);
    game.advanceTurn = () => game.save();
    fixture.now += 1000;
    const player = game.players[0];
    game.playCards(player, new types.CardPile(player.name, player.cards[0]));
    assert.equal(fixture.stored.lastHumanActionAt, start + 301000);
    fixture.now += 600000;
    assert.equal(types.GamePresence.isExpired(fixture.stored), false);
    fixture.now++;
    assert.equal(types.GamePresence.isExpired(fixture.stored), true);
});

test("positive and negative server offsets preserve the exact ten-minute human activity boundary", () => {
    for (const offset of [120000, -120000]) {
        const fixture = lifecycleGame({ serverTimestamp: start + offset });
        const { game, types } = fixture;
        types.GamePresence.serverOffset = offset;
        game.advanceTurn = () => game.save();
        fixture.now += 1000;
        const player = game.players[0];
        game.playCards(player, new types.CardPile(player.name, player.cards[0]));
        const baseline = start + 1000 + offset;
        assert.equal(game.lastHumanActionAt, baseline);
        assert.equal(fixture.stored.lastHumanActionAt, baseline);
        fixture.now += 600000;
        assert.equal(types.GamePresence.isExpired(fixture.stored), false);
        fixture.now++;
        assert.equal(types.GamePresence.isExpired(fixture.stored), true);
        assert.equal(types.GamePresence.reconcile(fixture.stored).status, "V");
    }
});

test("the final human leaving voids every game phase without adding results", () => {
    for (const status of ["O", "G", "S", "F"]) {
        const fixture = lifecycleGame();
        const { game } = fixture;
        game.status = status;
        if (status == "G") { game.piles = [{ mode: "Velg", from: 0, to: 1, cards: [] }]; }
        game.results = [["previous result"]];
        game.leavePlayer(game.players[0]);
        assert.equal(game.status, "V");
        assert.equal(game.turn, -1);
        assert.equal(game.results.length, 1);
        assert.equal(fixture.stored.status, "V");
        assert.equal(fixture.stored.lastHumanActionAt, start);
    }
});

test("gave-up players and takeover bots do not keep an explicitly abandoned session alive", () => {
    for (const takeover of [false, true]) {
        const fixture = lifecycleGame();
        const { game, types } = fixture;
        const other = game.players[1];
        other.playerKey = "guest";
        if (takeover) {
            game.controllers = { [types.GamePresence.playerId(other)]: { since: start } };
        } else {
            other.gaveUp = true;
        }
        game.leavePlayer(game.players[0]);
        assert.equal(fixture.stored.status, "V");
        assert.equal(fixture.stored.lastHumanActionAt, start);
        assert.equal(game.results, undefined);
    }
});

test("leaving with another eligible human retains the game and transfers host ownership", () => {
    for (const status of ["O", "G", "S", "F"]) {
        const fixture = lifecycleGame();
        const { game } = fixture;
        game.status = status;
        game.players[1].playerKey = "guest";
        game.setTurn(1);
        game.leavePlayer(game.players[0]);
        assert.equal(fixture.stored.status, status);
        assert.equal(game.hostKey, "guest");
        assert.equal(game.results, undefined);
    }
});

test("a human who already finished and explicitly left cannot keep a bot-only room alive", () => {
    const fixture = lifecycleGame();
    const { game } = fixture;
    game.players[1].playerKey = "guest";
    game.players[1].placement = 1;
    game.leavePlayer(game.players[1]);
    assert.equal(game.players[1].gaveUp, true);
    assert.equal(game.status, "S");
    game.leavePlayer(game.players[0]);
    assert.equal(fixture.stored.status, "V");
    assert.equal(game.results, undefined);
});

test("successful human card plays and passes refresh activity but invalid moves do not", () => {
    const fixture = lifecycleGame();
    const { game, types } = fixture;
    game.advanceTurn = () => game.save();
    const player = game.players[0];
    assert.throws(() => game.passTurn(player));
    assert.equal(game.lastHumanActionAt, start);
    fixture.now += 1000;
    game.playCards(player, new types.CardPile(player.name, player.cards[0]));
    assert.equal(fixture.stored.lastHumanActionAt, start + 1000);
    fixture.now += 4000;
    game.passTurn(player);
    assert.equal(fixture.stored.lastHumanActionAt, start + 5000);
});

test("normal and takeover bot turns and background saves cannot extend the session", () => {
    for (const takeover of [false, true]) {
        const fixture = lifecycleGame();
        const { game, types } = fixture;
        const player = game.players[1];
        if (takeover) {
            player.playerKey = "guest";
            game.controllers = { [types.GamePresence.playerId(player)]: { since: start } };
        }
        game.advanceTurn = () => game.save();
        game.setTurn(1);
        fixture.now += 1000;
        types.playBotTurn(game, player, () => 0);
        assert.equal(fixture.stored.lastHumanActionAt, start);
        fixture.now += 4000;
        game.passTurn(player);
        game.save();
        assert.equal(fixture.stored.lastHumanActionAt, start);
        fixture.now = start + 600001;
        game.save();
        assert.equal(fixture.stored.status, "V");
        assert.equal(game.results, undefined);
    }
});

test("giving and receiving exchange cards count only when the actor is human", () => {
    for (const key of ["owner", "PC", "takeover"]) {
        const fixture = lifecycleGame();
        const { game, types } = fixture;
        const actor = game.players[0];
        actor.playerKey = key;
        if (key == "takeover") {
            game.controllers = { [types.GamePresence.playerId(actor)]: { since: start } };
        }
        game.status = "G";
        const exchange = { from: 0, to: 1, count: 1, mode: "Velg", cards: [actor.cards[0]] };
        game.piles = [exchange, { from: 1, to: 0, count: 1, mode: "Velg", cards: [] }];
        fixture.now += 1000;
        game.giveExchangeCards(exchange);
        assert.equal(fixture.stored.lastHumanActionAt, key == "owner" ? start + 1000 : start);
        const incoming = { from: 1, to: 0, count: 1, mode: "Kan se", cards: [new types.PresidentCard(3, 9)] };
        game.piles = [incoming];
        fixture.now += 1000;
        game.receiveExchangeCards(incoming);
        assert.equal(fixture.stored.lastHumanActionAt, key == "owner" ? start + 2000 : start);
    }
});

test("legacy saves freeze their original timestamp and stale saves cannot revive void or deleted rooms", () => {
    const fixture = lifecycleGame();
    const { game } = fixture;
    delete fixture.stored.lastHumanActionAt;
    fixture.stored.ts = new Date(start).toISOString();
    delete game.lastHumanActionAt;
    fixture.now += 1000;
    game.save();
    assert.equal(fixture.stored.lastHumanActionAt, start);
    fixture.stored.status = "V";
    game.status = "S";
    game.lastHumanActionAt = fixture.now;
    game.save();
    assert.equal(fixture.stored.status, "V");
    assert.equal(game.status, "V");
    fixture.stored = null;
    game.status = "S";
    game.save();
    assert.equal(fixture.stored, null);
    assert.equal(game.status, "V");
});

test("a stale client's expired clock cannot void a session with newer human activity", () => {
    const fixture = lifecycleGame();
    fixture.stored.lastHumanActionAt = start + 500000;
    fixture.now = start + 600001;
    fixture.game.save();
    assert.equal(fixture.stored.status, "S");
    assert.equal(fixture.stored.lastHumanActionAt, start + 500000);
    assert.equal(fixture.game.status, "S");
    assert.equal(fixture.game.lastHumanActionAt, start + 500000);
});

test("optional exchanges refresh activity only for human offers, skips and sneaky consent", () => {
    for (const action of ["offer", "skip", "sneaky"]) {
        for (const bot of [false, true]) {
            const fixture = lifecycleGame();
            const { game } = fixture;
            if (bot) { game.players[0].playerKey = "PC"; }
            game.players.forEach((player, index) => { player.lastPlacement = index + 1; });
            const offer = {
                id: "offer", tradeId: "trade", kind: "playerTrade",
                from: 0, to: 1, count: 1, mode: "Tilbud", cards: []
            };
            game.status = "G";
            game.piles = [offer];
            fixture.now += 1000;
            if (action == "offer") { game.startOptionalTrade(offer); }
            else if (action == "skip") { game.skipOptionalTrade(offer, 0); }
            else { game.toggleSneakyTrade(offer, 0); }
            assert.equal(fixture.stored.lastHumanActionAt, bot ? start : start + 1000);
        }
    }
});

test("presence reconciliation and control extensions never refresh human activity", async () => {
    const fixture = controlClient();
    fixture.stored.lastHumanActionAt = start;
    const id = Presence.playerId(fixture.stored.spillere[0]);
    await fixture.client.changeControl();
    assert.equal(fixture.stored.lastHumanActionAt, start);
    fixture.stored = Presence.reconcile(fixture.stored, start + 240000);
    assert.equal(fixture.stored.lastHumanActionAt, start);
    fixture.now = start + 241000;
    await fixture.client.changeControl(true);
    assert.equal(fixture.stored.controllers[id], undefined);
    assert.equal(fixture.stored.lastHumanActionAt, start);
    fixture.now = start + 600001;
    await fixture.client.changeControl();
    assert.equal(fixture.stored.lastHumanActionAt, start);
    assert.equal(Presence.reconcile(fixture.stored, start + 600001).status, "V");
});

test("presence expiry removes the public listing when its transaction commits V", async () => {
    const fixture = lifecycleGame();
    const { game, types } = fixture;
    game.isPublic = true;
    game.save();
    assert.ok(fixture.listing.value);
    const client = Object.assign(Object.create(types.GamePresence.prototype), {
        game, record: fixture.stored, online: true, pending: false, stopped: false,
        retryAt: 0, now: () => start + 600001, refresh() {}, register() {},
        notify: message => assert.fail(message)
    });
    await client.tick();
    assert.equal(fixture.stored.status, "V");
    assert.equal(game.status, "V");
    assert.equal(fixture.listing.value, null);
});

test("expired and void games cannot start, rejoin or appear in public listings", async () => {
    for (const voided of [false, true]) {
        const fixture = lifecycleGame();
        const { game, types } = fixture;
        game.status = "O";
        game.isPublic = true;
        game.players[0].ready = true;
        game.save();
        assert.ok(fixture.listing.value);
        if (voided) { fixture.stored.status = game.status = "V"; }
        else { fixture.now = start + 600001; }
        assert.throws(() => game.startGame(), /avsluttet/);
        assert.equal(game.status, "V");
        assert.equal(fixture.stored.status, "V");
        const joined = await game.addPlayer(new types.PresidentPlayer("Owner", "owner"));
        assert.match(joined.text, /avsluttet/);
        game.updatePublicListing();
        assert.equal(fixture.listing.value, null);
    }
});
