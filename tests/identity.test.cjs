const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function fixture() {
    const records = {};
    const ref = name => ({
        child(key) { return ref(`${name}/${key}`); },
        async once() {
            if (name === "playerStats") {
                const values = Object.fromEntries(Object.entries(records)
                    .filter(([key]) => key.startsWith("playerStats/"))
                    .map(([key, value]) => [key.slice(12), value]));
                return { val: () => values };
            }
            return { val: () => records[name] || null };
        },
        orderByChild(field) {
            assert.equal(field, "name");
            return {
                equalTo(value) {
                    return {
                        limitToFirst(limit) {
                            return {
                                async once() {
                                    const values = Object.entries(records)
                                        .filter(([key, record]) => key.startsWith("playerStats/") && record.name === value)
                                        .slice(0, limit).map(([key, record]) => [key.slice(12), record]);
                                    return { val: () => Object.fromEntries(values) };
                                }
                            };
                        }
                    };
                }
            };
        },
        async transaction(update) {
            const value = update(records[name] || null);
            if (value !== undefined) { records[name] = value; }
            return { committed: value !== undefined, snapshot: { val: () => records[name] || null } };
        }
    });
    const context = vm.createContext({ crypto: webcrypto, TextEncoder,
        firebase: { database: () => ({ ref }) } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "identity.js"), "utf8"), context);
    return { identity: vm.runInContext("PlayerIdentity", context), records, ref, context };
}

test("names are case-insensitive and Unicode-normalized, with Firebase-safe keys", async () => {
    const { identity } = fixture();
    assert.equal(await identity.nameKey(" TÅKEFYRSTEN "), await identity.nameKey("Ta\u030akefyrsten"));
    assert.match(await identity.nameKey("Bjørn / 😀"), /^[a-f0-9]{64}$/);
    for (const name of ["", " SpIlLeR ", "PLAYER"]) { assert.equal(identity.isDefaultName(name), true); }
});

test("a name restores its existing player ID and statistics on a clean browser", async () => {
    const { identity, records } = fixture();
    records["playerStats/original"] = { name: "Ada", names: ["Ada"], presidentWins: 50 };
    const initial = await identity.resolve("Ada", "original");
    assert.equal(initial.playerKey, "original");
    const recovered = await identity.resolve(" ada ", "clean-browser");
    assert.equal(recovered.playerKey, "original");
    assert.equal(await identity.winsForName("ADA", "clean-browser"), 50);
    assert.equal(await identity.winsForName("Someone Else", "original"), 0);
});

test("legacy recovery supports old aliases, changed casing and refuses ambiguous IDs", async () => {
    const { identity, records } = fixture();
    records["playerStats/old"] = { name: "Ada Lovelace", names: ["Ada", "Ada Lovelace"], presidentWins: 10 };
    assert.equal((await identity.resolve("ADA", "fresh")).playerKey, "old");
    records["playerStats/other"] = { name: "Ada Lovelace", presidentWins: 20 };
    await assert.rejects(identity.resolve("Ada Lovelace", "fresh"), /Flere gamle profiler/);
});

test("PIN recovery verifies salted hashes without storing plaintext and retains statistics", async () => {
    const { identity, records } = fixture();
    records["playerStats/original"] = { name: "Ada", presidentWins: 20 };
    await identity.resolve("Ada", "original", "", "1234");
    const record = records[`playerNames/${await identity.nameKey("Ada")}`];
    assert.equal(record.pin, undefined);
    assert.notEqual(record.pinHash, "1234");
    assert.match(record.pinSalt, /^[a-f0-9]{32}$/);
    assert.match(record.pinHash, /^[a-f0-9]{64}$/);
    await assert.rejects(identity.resolve("Ada", "fresh"), /Oppgi riktig PIN/);
    await assert.rejects(identity.resolve("Ada", "fresh", "4321"), /Oppgi riktig PIN/);
    assert.equal((await identity.resolve("Ada", "fresh", "1234")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", "fresh"), 20);
    await identity.resolve("Ada", "original", "", "321");
    await assert.rejects(identity.resolve("Ada", "fresh", "1234"), /Oppgi riktig PIN/);
    assert.equal((await identity.resolve("Ada", "fresh", "321")).playerKey, "original");
});

test("default names do not share identities or wins, and PIN validation is explicit", async () => {
    const { identity, records } = fixture();
    assert.equal((await identity.resolve("player", "fresh")).playerKey, "fresh");
    assert.equal(await identity.winsForName("player", "fresh"), 0);
    assert.equal(Object.keys(records).length, 0);
    await assert.rejects(identity.resolve("spiller", "fresh", "", "1234"), /Velg et eget spillernavn/);
    for (const pin of ["", "12", "12345", "12a", "abcdef"]) {
        await assert.rejects(identity.pinHash(pin, "salt"), /3–4 sifre/);
    }
});

test("both three and four digits, including leading zeroes, work for profile recovery", async () => {
    for (const pin of ["003", "0123"]) {
        const { identity } = fixture();
        await identity.resolve("Ada", "original", "", pin);
        assert.equal((await identity.resolve("Ada", "fresh", pin)).playerKey, "original");
    }
});

test("appearance statistics follow the recovered ID and aliases without losing rounds or historical wins", async () => {
    const { identity, records } = fixture();
    records["playerStats/original"] = { name: "Ada", presidentWins: 50, roundsPlayed: 15 };
    await identity.resolve("Ada", "original");
    await identity.resolve("Grace", "original");
    for (const name of ["Ada", "Grace"]) {
        assert.deepEqual({ ...await identity.statsForName(name, "fresh") }, { presidentWins: 50, roundsPlayed: 15 });
    }
    assert.deepEqual({ ...await identity.statsForName("player", "original") }, { presidentWins: 0, roundsPlayed: 0 });
    assert.deepEqual({ ...await identity.statsForName("Unknown", "fresh") }, { presidentWins: 0, roundsPlayed: 0 });
});

test("switching to a new name keeps the same player ID and its total wins", async () => {
    const { identity, records } = fixture();
    records["playerStats/original"] = { name: "Ada", presidentWins: 5 };
    await identity.resolve("Ada", "original", "", "1234");
    await identity.resolve("Grace", "original");
    assert.equal((await identity.resolve("Grace", "another-browser")).playerKey, "original");
    assert.equal(await identity.winsForName("Grace", "another-browser"), 5);
});

test("changing name in a lobby cannot change account or overwrite another profile's PIN", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "ada-key", "", "1234");
    const key = `playerNames/${await identity.nameKey("Ada")}`;
    const originalHash = records[key].pinHash;
    await assert.rejects(identity.resolve("Ada", "grace-key", "1234", "4321", "grace-key"),
        /Gå til hovedmenyen/);
    assert.equal(records[key].pinHash, originalHash);
});

function clientFixture() {
    const f = fixture();
    const elements = new Map();
    let key = "clean-browser";
    Object.assign(f.context, {
        currentGame: null, currentPlayerName: null, pendingNewGameName: false,
        playerWinsName: "Old", playerPresidentWins: 99,
        getPlayerKey: () => key,
        setCookie(name, value) { assert.equal(name, "SpillerKey"); key = value; },
        document: {
            getElementById(id) {
                if (!elements.has(id)) { elements.set(id, { value: "", checked: false }); }
                return elements.get(id);
            }
        }
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const start = source.indexOf("        async function applyPlayerIdentity(");
    const end = source.indexOf('        document.getElementById("dialogSporOmNickCancel")', start);
    vm.runInContext(source.slice(start, end), f.context);
    return { ...f, elements, get key() { return key; } };
}

test("restoring an ID from the name dialog updates cookies and clears the previous wins", async () => {
    const f = clientFixture();
    f.records["playerStats/original"] = { name: "Ada", presidentWins: 10 };
    await f.context.applyPlayerIdentity("Ada");
    assert.equal(f.key, "original");
    assert.equal(f.context.playerPresidentWins, 0);
    assert.equal(f.context.playerWinsName, null);
});

test("restoring an ID while creating an empty lobby transfers its host atomically", async () => {
    const f = clientFixture();
    f.records["playerStats/original"] = { name: "Ada", presidentWins: 10 };
    f.records["rooms/test"] = { status: "O", hostKey: "clean-browser", spillere: [] };
    f.context.pendingNewGameName = true;
    f.context.currentGame = { status: "O", players: [], creation: Promise.resolve(), databaseRef: f.ref("rooms/test") };
    await f.context.applyPlayerIdentity("Ada");
    assert.equal(f.key, "original");
    assert.equal(f.records["rooms/test"].hostKey, "original");
    assert.equal(f.context.currentGame.hostKey, "original");
});

test("a lobby changed during recovery is not overwritten and leaves the old cookie intact", async () => {
    const f = clientFixture();
    f.records["playerStats/original"] = { name: "Ada", presidentWins: 10 };
    f.records["rooms/test"] = { status: "S", hostKey: "clean-browser", spillere: [] };
    f.context.pendingNewGameName = true;
    f.context.currentGame = { status: "O", players: [], creation: Promise.resolve(), databaseRef: f.ref("rooms/test") };
    await assert.rejects(f.context.applyPlayerIdentity("Ada"), /Lobbyen ble endret/);
    assert.equal(f.key, "clean-browser");
    assert.equal(f.records["rooms/test"].status, "S");
});
