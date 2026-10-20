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
    await identity.resolve("Ada", "original", "1234");
    const record = records[`playerNames/${await identity.nameKey("Ada")}`];
    assert.equal(record.pin, undefined);
    const credentials = Object.keys(record.pinProfiles);
    assert.equal(credentials.length, 1);
    assert.match(credentials[0], /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(record).sort(), ["name", "pinProfiles"]);
    assert.deepEqual({ ...record.pinProfiles[credentials[0]] }, { playerKey: "original" });
    assert.equal((await identity.resolve("Ada", "fresh", "1234")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", "original"), 20);
    assert.equal(await identity.winsForName("Ada", "fresh"), 0);
    const separate = await identity.resolve("Ada", "original", "321");
    assert.notEqual(separate.playerKey, "original");
    assert.equal((await identity.resolve("Ada", "fresh", "321")).playerKey, separate.playerKey);
    assert.equal((await identity.resolve("Ada", "fresh", "1234")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", separate.playerKey), 0);
});

test("default names do not share identities or wins, and PIN validation is explicit", async () => {
    const { identity, records } = fixture();
    assert.equal((await identity.resolve("player", "fresh")).playerKey, "fresh");
    assert.equal(await identity.winsForName("player", "fresh"), 0);
    assert.equal(Object.keys(records).length, 0);
    await assert.rejects(identity.resolve("spiller", "fresh", "1234"), /Velg et eget spillernavn/);
    for (const pin of ["", "12", "12345", "12a", "abcdef"]) {
        await assert.rejects(identity.pinHash(pin, "salt"), /3–4 sifre/);
    }
});

test("both three and four digits, including leading zeroes, work for profile recovery", async () => {
    for (const pin of ["003", "0123"]) {
        const { identity } = fixture();
        await identity.resolve("Ada", "original", pin);
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
    await identity.resolve("Ada", "original", "1234");
    await identity.resolve("Grace", "original");
    assert.equal((await identity.resolve("Grace", "another-browser")).playerKey, "original");
    assert.equal(await identity.winsForName("Grace", "another-browser"), 5);
});

test("changing name in a lobby cannot change account or overwrite another profile's PIN", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "ada-key", "1234");
    const key = `playerNames/${await identity.nameKey("Ada")}`;
    const originalRecord = JSON.stringify(records[key]);
    await assert.rejects(identity.resolve("Ada", "grace-key", "1234", "grace-key"),
        /Gå til hovedmenyen/);
    await assert.rejects(identity.resolve("Ada", "ada-key", "4321", "ada-key"), /Gå til hovedmenyen/);
    assert.equal(JSON.stringify(records[key]), originalRecord);
});

test("existing salted PIN records migrate on matching login without changing their ID", async () => {
    const { identity, records } = fixture();
    const key = `playerNames/${await identity.nameKey("Ada")}`;
    const salt = "0123456789abcdef0123456789abcdef";
    records[key] = { name: "Ada", playerKey: "legacy", pinSalt: salt,
        pinHash: await identity.pinHash("1234", salt) };
    records["playerStats/legacy"] = { name: "Ada", roundsPlayed: 30, presidentWins: 10 };
    const originalHash = records[key].pinHash;
    const different = await identity.resolve("Ada", "fresh", "4321");
    assert.notEqual(different.playerKey, "legacy");
    const restored = await identity.resolve("ADA", "fresh", "1234");
    assert.equal(restored.playerKey, "legacy");
    assert.deepEqual({ ...await identity.statsForName("Ada", restored.playerKey) },
        { presidentWins: 10, roundsPlayed: 30 });
    assert.equal(records[key].pinHash, originalHash);
    assert.equal(records[key].pinSalt, salt);
    assert.equal((await identity.resolve("Ada", "fresh", "4321")).playerKey, different.playerKey);
});

test("turning PIN off uses a separate name-only profile without exposing the PIN profile's statistics", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "original", "1234");
    records["playerStats/original"] = { name: "Ada", roundsPlayed: 100, presidentWins: 50 };
    const withoutPin = await identity.resolve("Ada", "original");
    assert.notEqual(withoutPin.playerKey, "original");
    assert.equal(withoutPin.hasPin, false);
    assert.equal((await identity.resolve("Ada", "fresh")).playerKey, withoutPin.playerKey);
    assert.equal((await identity.resolve("Ada", "fresh", "1234")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", withoutPin.playerKey), 0);
});

test("enabling PIN on an existing name-only profile preserves its statistics", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "original");
    records["playerStats/original"] = { name: "Ada", presidentWins: 15, roundsPlayed: 30 };
    assert.equal((await identity.resolve("Ada", "original", "123")).playerKey, "original");
    const restored = await identity.resolve("Ada", "fresh", "123");
    assert.equal(restored.playerKey, "original");
    assert.equal((await identity.statsForName("Ada", restored.playerKey)).roundsPlayed, 30);
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
                if (!elements.has(id)) {
                    elements.set(id, { value: "", attributes: {},
                        getAttribute(name) { return this.attributes[name]; },
                        setAttribute(name, value) { this.attributes[name] = value; }
                    });
                }
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

test("the single enabled PIN field registers and restores through the same dialog path", async () => {
    const f = clientFixture();
    f.context.document.getElementById("playerUsePin").setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "0123";
    await f.context.applyPlayerIdentity("Ada");
    const key = f.key;
    assert.equal((await f.identity.resolve("Ada", "fresh", "0123")).playerKey, key);
    f.context.document.getElementById("playerRecoveryPin").value = "123";
    await f.context.applyPlayerIdentity("Ada");
    assert.notEqual(f.key, key);
    assert.equal((await f.identity.resolve("Ada", "fresh", "123")).playerKey, f.key);
});

test("an enabled PIN rejects invalid length while disabling PIN ignores the hidden value", async () => {
    const f = clientFixture();
    const toggle = f.context.document.getElementById("playerUsePin");
    toggle.setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "12";
    await assert.rejects(f.context.applyPlayerIdentity("Ada"), /3–4 sifre/);
    toggle.setAttribute("aria-pressed", "false");
    await f.context.applyPlayerIdentity("Ada");
    assert.equal((await f.identity.resolve("Ada", "fresh")).playerKey, f.key);
});

test("name dialog has one optional PIN input and no repeat or separate registration controls", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const dialog = html.slice(html.indexOf('id="dialogSporOmNick"'), html.indexOf('id="dialogVisLink"'));
    assert.equal((dialog.match(/type="password"/g) || []).length, 1);
    assert.match(dialog, /id="playerUsePin" class="setting-row" aria-pressed="false"/);
    assert.match(dialog, /id="playerPinFields" hidden/);
    assert.match(dialog, /<label for="dialogSporOmNickTxt">Skriv inn navnet ditt, maks 28 tegn<\/label>[\s\S]*?<input[^>]*id="dialogSporOmNickTxt"/);
    assert.doesNotMatch(dialog, /playerNameHint/);
    assert.match(dialog, /placeholder="PIN \(3–4 sifre\)"/);
    assert.doesNotMatch(dialog, /playerNewPin|playerConfirmPin|playerSetPin|oninput=/);
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
