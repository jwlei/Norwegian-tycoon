const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function fixture() {
    const records = {};
    const cookies = new Map();
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
        getCookie: name => cookies.get(name) || "",
        setCookie: (name, value) => cookies.set(name, value),
        firebase: { database: () => ({ ref }) } });
    const shared = fs.readFileSync(path.join(__dirname, "..", "js", "shared.js"), "utf8");
    vm.runInContext(shared.slice(shared.indexOf("function generatePlayerKey()"),
        shared.indexOf("function getPlayerKey()")), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "identity.js"), "utf8"), context);
    return { identity: vm.runInContext("PlayerIdentity", context), records, ref, context, cookies };
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
    await identity.resolve("Ada", "original", "123456");
    const record = records[`playerNames/${await identity.nameKey("Ada")}`];
    assert.equal(record.pin, undefined);
    const credentials = Object.keys(record.pinProfiles);
    assert.equal(credentials.length, 1);
    assert.match(credentials[0], /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(record).sort(), ["name", "pinProfiles"]);
    assert.deepEqual({ ...record.pinProfiles[credentials[0]] }, { playerKey: "original", pinVersion: 2 });
    assert.equal((await identity.resolve("Ada", "fresh", "123456")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", "original"), 20);
    assert.equal(await identity.winsForName("Ada", "fresh"), 0);
    const separate = await identity.resolve("Ada", "original", "654321");
    assert.notEqual(separate.playerKey, "original");
    assert.match(separate.playerKey, /^[A-Za-z0-9]{6}$/);
    assert.equal((await identity.resolve("Ada", "fresh", "654321")).playerKey, separate.playerKey);
    assert.equal((await identity.resolve("Ada", "fresh", "123456")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", separate.playerKey), 0);
});

test("new six-character IDs are reserved and collisions retry without overwriting an existing profile", async () => {
    const f = fixture();
    f.cookies.set("playerKeyPending", "AbC123");
    f.records["playerIds/AbC123"] = "someone-else";
    f.records["playerStats/Taken1"] = { name: "Other", presidentWins: 10 };
    const candidates = ["Taken1", "New123"];
    f.context.generatePlayerKey = () => candidates.shift();
    const identity = await f.identity.resolve("Ada", "AbC123", "000123");
    assert.equal(identity.playerKey, "New123");
    assert.equal(f.records["playerIds/AbC123"], "someone-else");
    assert.equal(f.records["playerStats/Taken1"].presidentWins, 10);
    assert.equal(f.records["playerIds/Taken1"], undefined);
    assert.equal(f.records["playerIds/New123"], f.cookies.get("playerIdToken_New123"));
    assert.equal((await f.identity.resolve("Ada", "fresh", "000123")).playerKey, "New123");
});

test("registration keeps an available new ID and reuses its reservation on retries", async () => {
    const f = fixture();
    f.cookies.set("playerKeyPending", "AbC123");
    const first = await f.identity.resolve("Ada", "AbC123", "000123");
    assert.equal(first.playerKey, "AbC123");
    const token = f.records["playerIds/AbC123"];
    assert.equal(await f.identity.allocatePlayerKey("AbC123"), "AbC123");
    assert.equal(f.records["playerIds/AbC123"], token);
    assert.equal((await f.identity.resolve("Grace", "AbC123", "000123")).playerKey, "AbC123");
});

test("repeated ID collisions fail explicitly rather than reusing an existing identity", async () => {
    const f = fixture();
    f.context.generatePlayerKey = () => "Taken1";
    f.records["playerIds/Taken1"] = "another-device";
    await assert.rejects(f.identity.allocatePlayerKey(), /unik spiller-ID/);
    assert.equal(f.records["playerIds/Taken1"], "another-device");
});

test("default names do not share identities or wins, and PIN validation is explicit", async () => {
    const { identity, records } = fixture();
    assert.equal((await identity.resolve("player", "fresh")).playerKey, "fresh");
    assert.equal(await identity.winsForName("player", "fresh"), 0);
    assert.equal(Object.keys(records).length, 0);
    await assert.rejects(identity.resolve("spiller", "fresh", "1234"), /Velg et eget spillernavn/);
    for (const pin of ["", "12", "12345", "1234567", "12a", "abcdef", " 123456", "１２３４５６"]) {
        await assert.rejects(identity.pinHash(pin, "salt"), /6 sifre/);
    }
});

test("old three and four digit PINs recover existing name-salted profiles but cannot register new profiles", async () => {
    for (const pin of ["003", "0123"]) {
        const { identity, records } = fixture();
        await assert.rejects(identity.resolve("Ada", "original", pin), /Nye PIN må ha 6 sifre/);
        const nameKey = await identity.nameKey("Ada");
        const credential = await identity.pinHash(pin, nameKey);
        records[`playerNames/${nameKey}`] = {
            name: "Ada", pinProfiles: { [credential]: { playerKey: "original" } }
        };
        assert.equal((await identity.resolve("Ada", "fresh", pin)).playerKey, "original");
        await assert.rejects(identity.resolve("Ada", "fresh", pin == "003" ? "004" : "0124"), /Nye PIN/);
        assert.equal(Object.keys(records[`playerNames/${nameKey}`].pinProfiles).length, 2);
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
    await identity.resolve("Ada", "original", "123456");
    await identity.resolve("Grace", "original");
    assert.equal((await identity.resolve("Grace", "another-browser")).playerKey, "original");
    assert.equal(await identity.winsForName("Grace", "another-browser"), 5);
});

test("changing name in a lobby cannot change account or overwrite another profile's PIN", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "ada-key", "123456");
    const key = `playerNames/${await identity.nameKey("Ada")}`;
    const originalRecord = JSON.stringify(records[key]);
    await assert.rejects(identity.resolve("Ada", "grace-key", "123456", "grace-key"),
        /Gå til hovedmenyen/);
    await assert.rejects(identity.resolve("Ada", "ada-key", "654321", "ada-key"), /Gå til hovedmenyen/);
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
    const different = await identity.resolve("Ada", "fresh", "654321");
    assert.notEqual(different.playerKey, "legacy");
    const restored = await identity.resolve("ADA", "fresh", "1234");
    assert.equal(restored.playerKey, "legacy");
    assert.deepEqual({ ...await identity.statsForName("Ada", restored.playerKey) },
        { presidentWins: 10, roundsPlayed: 30 });
    assert.equal(records[key].pinHash, originalHash);
    assert.equal(records[key].pinSalt, salt);
    assert.equal((await identity.resolve("Ada", "fresh", "654321")).playerKey, different.playerKey);
});

test("turning PIN off uses a separate name-only profile without exposing the PIN profile's statistics", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "original", "123456");
    records["playerStats/original"] = { name: "Ada", roundsPlayed: 100, presidentWins: 50 };
    const withoutPin = await identity.resolve("Ada", "original");
    assert.notEqual(withoutPin.playerKey, "original");
    assert.equal(withoutPin.hasPin, false);
    assert.equal((await identity.resolve("Ada", "fresh")).playerKey, withoutPin.playerKey);
    assert.equal((await identity.resolve("Ada", "fresh", "123456")).playerKey, "original");
    assert.equal(await identity.winsForName("Ada", withoutPin.playerKey), 0);
});

test("enabling PIN on an existing name-only profile preserves its statistics", async () => {
    const { identity, records } = fixture();
    await identity.resolve("Ada", "original");
    records["playerStats/original"] = { name: "Ada", presidentWins: 15, roundsPlayed: 30 };
    assert.equal((await identity.resolve("Ada", "original", "000123")).playerKey, "original");
    const restored = await identity.resolve("Ada", "fresh", "000123");
    assert.equal(restored.playerKey, "original");
    assert.equal((await identity.statsForName("Ada", restored.playerKey)).roundsPlayed, 30);
});

test("the latest registered name replaces the leaderboard label without splitting player statistics", async () => {
    const f = fixture();
    f.records["playerStats/original"] = {
        name: "Old name", names: ["Older name", "Old name"],
        presidentWins: 10, roundsPlayed: 30, lastActiveAt: 12345
    };
    await f.identity.resolve("New name", "original", "000123");
    const stats = f.records["playerStats/original"];
    assert.equal(stats.name, "New name");
    assert.deepEqual(Array.from(stats.names), ["Older name", "Old name", "New name"]);
    assert.equal(stats.presidentWins, 10);
    assert.equal(stats.roundsPlayed, 30);
    assert.equal(stats.lastActiveAt, 12345);
    assert.ok(stats.nameUpdatedAt > 0);
    assert.equal(Object.keys(f.records).filter(key => key.startsWith("playerStats/")).length, 1);
    await f.identity.resolve("NEW NAME", "fresh", "000123");
    assert.equal(f.records["playerStats/original"].name, "NEW NAME");
    assert.equal(f.records["playerStats/fresh"], undefined);
});

test("new names without completed rounds do not create empty leaderboard statistics", async () => {
    const f = fixture();
    await f.identity.resolve("Ada", "original", "000123");
    assert.equal(f.records["playerStats/original"], undefined);
});

function clientFixture() {
    const f = fixture();
    const elements = new Map();
    let key = "clean-browser";
    Object.assign(f.context, {
        currentGame: null, currentPlayerName: null, pendingNewGameName: false,
        playerWinsName: "Old", playerPresidentWins: 99,
        getPlayerKey: () => key,
        setCookie(name, value) {
            f.cookies.set(name, value);
            if (name == "SpillerKey") { key = value; }
        },
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
    f.context.document.getElementById("playerRecoveryPin").value = "000123";
    await f.context.applyPlayerIdentity("Ada");
    const key = f.key;
    assert.equal((await f.identity.resolve("Ada", "fresh", "000123")).playerKey, key);
    f.context.document.getElementById("playerRecoveryPin").value = "654321";
    await f.context.applyPlayerIdentity("Ada");
    assert.notEqual(f.key, key);
    assert.equal((await f.identity.resolve("Ada", "fresh", "654321")).playerKey, f.key);
});

test("PIN login is remembered even when the player key does not change and carries across name changes", async () => {
    const f = clientFixture();
    const toggle = f.context.document.getElementById("playerUsePin");
    toggle.setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "000123";
    f.cookies.set("playerKeyPending", f.key);
    await f.context.applyPlayerIdentity("Ada");
    assert.equal(f.cookies.get("playerPinProfile"),
        encodeURIComponent(JSON.stringify(["ada", f.key])));
    assert.equal(f.cookies.get("playerKeyPending"), "");
    toggle.setAttribute("aria-pressed", "false");
    await f.context.applyPlayerIdentity("Grace");
    assert.equal(f.cookies.get("playerPinProfile"), encodeURIComponent(JSON.stringify(["grace", f.key])));
    assert.equal((await f.identity.resolve("Ada", "fresh", "000123")).playerKey, f.key);
    assert.equal((await f.identity.resolve("Grace", "another-device", "000123")).playerKey, f.key);
});

test("automatic PIN aliases survive a reload without storing or retyping the PIN", async () => {
    const f = clientFixture();
    const toggle = f.context.document.getElementById("playerUsePin");
    toggle.setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "000123";
    await f.context.applyPlayerIdentity("Ada");
    toggle.setAttribute("aria-pressed", "false");
    f.context.document.getElementById("playerRecoveryPin").value = "";
    const reloaded = clientFixture();
    Object.assign(reloaded.records, f.records);
    for (const [name, value] of f.cookies) { reloaded.context.setCookie(name, value); }
    reloaded.context.setCookie("SpillerKey", f.key);
    await reloaded.context.applyPlayerIdentity("Grace");
    await reloaded.context.applyPlayerIdentity("New name");
    for (const name of ["Ada", "Grace", "New name"]) {
        assert.equal((await reloaded.identity.resolve(name, "another-device", "000123")).playerKey, f.key);
        const record = reloaded.records[`playerNames/${await f.identity.nameKey(name)}`];
        assert.equal(record.noPinPlayerKey, undefined, "An automatic alias must not create a name-only login");
    }
    assert.match(f.cookies.get("playerPinCredential"), /^[a-f0-9]{64}$/);
    assert.ok([...f.cookies.values()].every(value => value !== "000123"));
    assert.equal(f.context.document.getElementById("playerRecoveryPin").value, "");
});

test("legacy PIN recovery supports automatic renaming with the same old PIN", async () => {
    const f = clientFixture();
    const key = `playerNames/${await f.identity.nameKey("Ada")}`;
    const credential = await f.identity.pinHash("0123", await f.identity.nameKey("Ada"));
    f.records[key] = { name: "Ada", pinProfiles: { [credential]: { playerKey: "legacy" } } };
    f.context.document.getElementById("playerUsePin").setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "0123";
    await f.context.applyPlayerIdentity("Ada");
    f.context.document.getElementById("playerUsePin").setAttribute("aria-pressed", "false");
    f.context.document.getElementById("playerRecoveryPin").value = "";
    await f.context.applyPlayerIdentity("Grace");
    assert.equal((await f.identity.resolve("Ada", "new-device", "0123")).playerKey, "legacy");
    assert.equal((await f.identity.resolve("Grace", "new-device", "0123")).playerKey, "legacy");
    await assert.rejects(f.identity.resolve("Someone else", "new-device", "0123"), /Nye PIN/);
});

test("automatic renaming cannot take over an existing name and matching PIN belonging to another ID", async () => {
    const f = clientFixture();
    await f.identity.resolve("Grace", "other-player", "000123");
    f.context.document.getElementById("playerUsePin").setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "000123";
    await f.context.applyPlayerIdentity("Ada");
    const originalKey = f.key;
    const recordKey = `playerNames/${await f.identity.nameKey("Grace")}`;
    const previous = JSON.stringify(f.records[recordKey]);
    f.context.document.getElementById("playerUsePin").setAttribute("aria-pressed", "false");
    await assert.rejects(f.context.applyPlayerIdentity("Grace"), /Velg et annet navn/);
    assert.equal(f.key, originalKey);
    assert.equal(JSON.stringify(f.records[recordKey]), previous);
    assert.equal((await f.identity.resolve("Grace", "new-device", "000123")).playerKey, "other-player");
});

test("remembered PIN credentials only apply to the matching logged-in player ID", async () => {
    const f = clientFixture();
    f.cookies.set("playerPinKey", "someone-else");
    f.cookies.set("playerPinCredential", "a".repeat(64));
    await f.context.applyPlayerIdentity("Ada");
    assert.equal(f.cookies.get("playerPinProfile"), "");
    assert.equal(f.cookies.get("playerPinCredential"), "");
    f.cookies.set("playerPinKey", f.key);
    f.cookies.set("playerPinCredential", "malformed");
    assert.equal(f.identity.rememberedPinCredential(f.key), null);
});

test("automatic aliases cannot shadow another player's older name-salted PIN mapping", async () => {
    const f = fixture();
    const login = await f.identity.resolve("Ada", "ada-id", "000123");
    const nameKey = await f.identity.nameKey("Grace");
    const oldCredential = await f.identity.pinHash("000123", nameKey);
    f.records[`playerNames/${nameKey}`] = {
        name: "Grace", pinProfiles: { [oldCredential]: { playerKey: "other-id" } }
    };
    await assert.rejects(f.identity.resolve("Grace", "ada-id", "", null, login.pinCredential), /eldre PIN-profil/);
    assert.equal((await f.identity.resolve("Grace", "fresh", "000123")).playerKey, "other-id");
});

test("new short PINs are rejected before any profile or reservation is written", async () => {
    for (const pin of ["123", "0123"]) {
        const f = clientFixture();
        f.cookies.set("playerKeyPending", f.key);
        f.context.document.getElementById("playerUsePin").setAttribute("aria-pressed", "true");
        f.context.document.getElementById("playerRecoveryPin").value = pin;
        await assert.rejects(f.context.applyPlayerIdentity("Ada"), /Nye PIN må ha 6 sifre/);
        assert.deepEqual(Object.keys(f.records), []);
        assert.equal(f.cookies.get("playerPinProfile"), undefined);
    }
});
test("an enabled PIN rejects invalid length while disabling PIN ignores the hidden value", async () => {
    const f = clientFixture();
    const toggle = f.context.document.getElementById("playerUsePin");
    toggle.setAttribute("aria-pressed", "true");
    f.context.document.getElementById("playerRecoveryPin").value = "12";
    await assert.rejects(f.context.applyPlayerIdentity("Ada"), /6 sifre/);
    toggle.setAttribute("aria-pressed", "false");
    await f.context.applyPlayerIdentity("Ada");
    assert.equal((await f.identity.resolve("Ada", "fresh")).playerKey, f.key);
});

test("name dialog has one optional PIN input and no repeat or separate registration controls", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const dialog = html.slice(html.indexOf('id="dialogSporOmNick"'), html.indexOf('id="dialogVisLink"'));
    assert.doesNotMatch(dialog, /type="password"/);
    assert.match(dialog, /type="text" id="playerRecoveryPin"[^>]*maxlength="6"/);
    assert.match(dialog, /id="playerUsePin" class="setting-row" aria-pressed="false"/);
    assert.match(dialog, /id="playerPinFields" hidden/);
    assert.match(dialog, /<label for="dialogSporOmNickTxt">Skriv inn navnet ditt, maks 24 tegn<\/label>[\s\S]*?<input[^>]*id="dialogSporOmNickTxt"/);
    assert.doesNotMatch(dialog, /playerNameHint/);
    assert.match(dialog, /placeholder="PIN \(6 sifre\)"/);
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
