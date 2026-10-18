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

test("turns get exactly 120 seconds and expire at the precise deadline, not before", () => {
    const record = Presence.reconcile(room(), start);
    const id = Presence.playerId(record.spillere[0]);
    assert.equal(record.actionDeadlines[id].until, start + 120000);
    assert.equal(record.actionDeadlines[id].extended, false);
    assert.equal(Presence.reconcile(record, start + 119999), undefined);
    const expired = Presence.reconcile(record, start + 120000);
    assert.equal(expired.controllers[id].reason, "idle");
    assert.match(expired.connectionNotices[0].message, /brukte opp tiden/);
    assert.equal(Presence.reconcile(expired, start + 121000), undefined);
    assert.equal(expired.spillere[0].spillerKey, "owner");
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

test("exchange deadlines follow the acting stage and wait until shuffling has finished", () => {
    const record = room();
    record.status = "G";
    record.shuffleStartedAt = start;
    record.spillBunke = [{ id: "offer", modus: "Tilbud", fra: 1, til: 0 }];
    const next = Presence.reconcile(record, start);
    const guestId = Presence.playerId(record.spillere[1]);
    assert.equal(next.actionDeadlines[guestId].until, start + 3500 + 120000);
    assert.equal(Object.keys(next.actionDeadlines).length, 1);
    record.spillBunke = [{ id: "give", modus: "Gitt", fra: 1, til: 0 }];
    assert.equal(Presence.actionToken(record, record.spillere[1], 1), null);
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
