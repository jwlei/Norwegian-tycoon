const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(records = {}) {
    let reads = 0;
    const ref = {
        orderByChild(field) {
            assert.equal(field, "lastActiveAt");
            let cursor = null;
            return {
                endBefore(time, id) { cursor = { time, id }; return this; },
                limitToLast(limit) {
                    assert.equal(limit, 50);
                    return {
                        async once(event) {
                            assert.equal(event, "value");
                            reads++;
                            const entries = Object.entries(records)
                                .sort(([a, first], [b, second]) =>
                                    (first.lastActiveAt || 0) - (second.lastActiveAt || 0) ||
                                    (a < b ? -1 : a > b ? 1 : 0))
                                .filter(([id, record]) => !cursor || (record.lastActiveAt || 0) < cursor.time ||
                                    record.lastActiveAt == cursor.time && id < cursor.id)
                                .slice(-limit);
                            return { forEach(callback) {
                                for (const [key, record] of entries) { callback({ key, val: () => record }); }
                            } };
                        }
                    };
                }
            };
        }
    };
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "leaderboard.js"), "utf8");
    const context = vm.createContext({
        firebase: { database: () => ({ ref(name) { assert.equal(name, "playerStats"); return ref; } }) },
        PlayerIdentity: { isDefaultName: name => ["", "player", "spiller"].includes(name.trim().toLowerCase()) }
    });
    vm.runInContext(source.slice(0, source.lastIndexOf("initializeLeaderboard();")), context);
    return { leaderboard: vm.runInContext("PlayerLeaderboard", context), context, get reads() { return reads; } };
}

test("leaderboard selects exactly the latest 50 human named profiles, not the top 50 scores", async () => {
    const records = Object.fromEntries(Array.from({ length: 75 }, (_, index) =>
        [`profile-${String(index).padStart(3, "0")}`, {
            name: `Player ${index}`, lastActiveAt: index + 1, roundsPlayed: 100 - index
        }]));
    records.PC = { name: "Bot", lastActiveAt: 200 };
    records.default = { name: " SpIlLeR ", lastActiveAt: 201 };
    records.old = { name: "Legacy", presidentWins: 50 };
    const f = fixture(records);
    const rows = await f.leaderboard.load();
    assert.equal(rows.length, 50);
    assert.equal(new Set(rows.map(row => row.id)).size, 50);
    assert.equal(Math.min(...rows.map(row => row.lastActiveAt)), 26);
    assert.equal(Math.max(...rows.map(row => row.lastActiveAt)), 75);
    assert.equal(f.reads, 2, "Excluded profiles must not consume one of the 50 places");
    const sorted = f.leaderboard.sort(rows, "roundsPlayed", "descending");
    assert.equal(sorted[0].roundsPlayed, 75);
    assert.equal(sorted[49].roundsPlayed, 26);
});

test("pagination handles timestamp ties and more than one batch of excluded profiles", async () => {
    const records = Object.fromEntries(Array.from({ length: 150 }, (_, index) =>
        [`key-${String(index).padStart(3, "0")}`, {
            name: index < 50 ? `Named ${index}` : "player", lastActiveAt: 1000
        }]));
    const f = fixture(records);
    const rows = await f.leaderboard.load();
    assert.equal(rows.length, 50);
    assert.equal(new Set(rows.map(row => row.id)).size, 50);
    assert.equal(f.reads, 3);
    assert.ok(rows.every(row => row.name.startsWith("Named ")));
});

test("empty leaderboards terminate and database failures are propagated", async () => {
    const f = fixture({ old: { name: "Legacy", presidentWins: 20 } });
    assert.equal((await f.leaderboard.load()).length, 0);
    assert.equal(f.reads, 1);
    f.context.firebase = { database() { throw new Error("Permission denied"); } };
    await assert.rejects(f.leaderboard.load(), /Permission denied/);
});

test("every numeric column sorts both ways; normalized placement prefers 1 and unknown scores remain last", () => {
    const { leaderboard } = fixture();
    const rows = [
        { id: "c", name: "C", roundsPlayed: 8, presidentWins: 1, bomsCount: 4, placementScore: 3, longestPresidentStreak: 1, longestBomsStreak: 4 },
        { id: "a", name: "A", roundsPlayed: 20, presidentWins: 12, bomsCount: 1, placementScore: 1, longestPresidentStreak: 6, longestBomsStreak: 1 },
        { id: "b", name: "B", roundsPlayed: 12, presidentWins: 6, bomsCount: 2, placementScore: 2, longestPresidentStreak: 3, longestBomsStreak: 2 }
    ];
    for (const column of ["roundsPlayed", "presidentWins", "bomsCount", "placementScore", "longestPresidentStreak", "longestBomsStreak"]) {
        for (const direction of ["ascending", "descending"]) {
            const sorted = leaderboard.sort(rows, column, direction).map(row => row[column]);
            assert.deepEqual(Array.from(sorted), rows.map(row => row[column])
                .sort((a, b) => direction == "ascending" ? a - b : b - a));
        }
    }
    const unknown = { id: "d", name: "D" };
    for (const direction of ["ascending", "descending"]) {
        assert.equal(leaderboard.sort([...rows, unknown], "placementScore", direction).at(-1).id, "d");
    }
    assert.deepEqual(Array.from(leaderboard.sort(rows, "name", "ascending"), row => row.name), ["A", "B", "C"]);
    assert.deepEqual(rows.map(row => row.id), ["c", "a", "b"], "Sorting must not mutate the stored activity list");
});

function uiFixture(records = {}) {
    const f = fixture(records);
    const node = () => ({
        children: [], dataset: {}, attributes: {}, listeners: {}, textContent: "", style: {},
        getBoundingClientRect: () => ({ left: 20, right: 80, top: 100, height: 40, width: 60 }),
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        addEventListener(type, callback) { this.listeners[type] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; }
    });
    const elements = Object.fromEntries(["leaderboardRows", "leaderboardStatus", "leaderboardOpenButton", "leaderboardPlayerId", "dialogLeaderboard"]
        .map(id => [id, node()]));
    elements.leaderboardPlayerId.offsetParent = {
        getBoundingClientRect: () => ({ left: 10, top: 10, width: 300 })
    };
    const headers = ["name", "roundsPlayed", "presidentWins", "bomsCount", "placementScore",
        "longestPresidentStreak", "longestBomsStreak"].map(column => {
        const header = node();
        const button = node();
        button.dataset.leaderboardSort = column;
        button.closest = () => header;
        button.header = header;
        return button;
    });
    const errors = [];
    const dialogs = [];
    const timers = new Map();
    let timerId = 0;
    f.context.setTimeout = (callback, delay) => {
        timers.set(++timerId, { callback, delay });
        return timerId;
    };
    f.context.clearTimeout = id => timers.delete(id);
    f.context.document = {
        getElementById: id => elements[id],
        querySelectorAll: () => headers,
        createElement: node
    };
    f.context.window = { I18n: { msg: text => text }, addEventListener() {} };
    f.context.console = { error: (...args) => errors.push(args) };
    f.context.showDialog = (...args) => dialogs.push(args);
    f.context.initializeLeaderboard();
    const open = () => elements.leaderboardOpenButton.listeners.click({ preventDefault() {} });
    const names = () => elements.leaderboardRows.children
        .filter(row => row.className != "leaderboard-player-id")
        .map(row => row.children[0].children[0].textContent);
    return { ...f, elements, headers, errors, dialogs, open, names, timers };
}

test("leaderboard dialog opens, sorts, resets on reopening and renders names as text only", async () => {
    const f = uiFixture();
    const rows = [
        { id: "a", name: "<img src=x onerror=alert(1)>", roundsPlayed: 6, placementScore: 1 },
        { id: "b", name: "B", roundsPlayed: 20, placementScore: 3 }
    ];
    f.leaderboard.load = async () => rows;
    await f.open();
    assert.deepEqual(f.dialogs, [["Leaderboard", true]]);
    assert.deepEqual(f.names(), ["B", rows[0].name]);
    assert.equal(f.elements.leaderboardStatus.textContent, "");
    assert.equal(f.errors.length, 0);
    const score = f.headers.find(button => button.dataset.leaderboardSort == "placementScore");
    score.listeners.click();
    assert.deepEqual(f.names(), [rows[0].name, "B"]);
    assert.equal(score.header.attributes["aria-sort"], "ascending");
    score.listeners.click();
    assert.deepEqual(f.names(), ["B", rows[0].name]);
    assert.equal(score.header.attributes["aria-sort"], "descending");
    await f.open();
    assert.deepEqual(f.names(), ["B", rows[0].name]);
    assert.equal(f.headers[1].header.attributes["aria-sort"], "descending");
    assert.equal(score.header.attributes["aria-sort"], "none");
});

test("clicking a name shows an ID popup for exactly five seconds without adding table rows", async () => {
    const f = uiFixture();
    f.leaderboard.load = async () => [
        { id: "AbC123", name: "Latest name", roundsPlayed: 20 },
        { id: "aBc789", name: "Latest name", roundsPlayed: 10 }
    ];
    await f.open();
    const rows = f.elements.leaderboardRows.children;
    const button = rows[0].children[0].children[0];
    assert.equal(button.textContent, "Latest name");
    const popup = f.elements.leaderboardPlayerId;
    assert.equal(rows.length, 2);
    assert.equal(button.attributes["aria-controls"], "leaderboardPlayerId");
    assert.equal(popup.hidden, true);
    button.listeners.click();
    assert.equal(popup.hidden, false);
    assert.equal(popup.textContent, "ID AbC123");
    assert.equal(popup.style.left, "76px");
    assert.equal(popup.style.top, "110px");
    assert.equal(popup.style.maxWidth, "216px");
    assert.equal(f.timers.size, 1);
    assert.equal([...f.timers.values()][0].delay, 5000);
    button.listeners.click();
    assert.equal(f.timers.size, 1, "Repeated clicks replace the old timer");
    [...f.timers.values()][0].callback();
    assert.equal(popup.hidden, true);
    assert.equal(popup.textContent, "");
    assert.equal(f.timers.size, 0);
    rows[1].children[0].children[0].listeners.click();
    assert.equal(popup.textContent, "ID aBc789");
    f.headers[1].listeners.click();
    assert.equal(popup.hidden, true);
    assert.equal(f.timers.size, 0);
    f.elements.leaderboardRows.children[0].children[0].children[0].listeners.click();
    await f.open();
    assert.equal(popup.hidden, true);
    assert.equal(f.timers.size, 0);
    f.elements.leaderboardRows.children[0].children[0].children[0].listeners.click();
    f.elements.dialogLeaderboard.listeners.scroll();
    assert.equal(popup.hidden, true);
    assert.equal(f.timers.size, 0);
});

test("loaded leaderboard IDs belong to each player, not a stored ID field or the viewer", async () => {
    const f = uiFixture({
        AZaz09: { name: "Ada", lastActiveAt: 2, roundsPlayed: 20, id: "wrong1" },
        aZAZ90: { name: "Grace", lastActiveAt: 1, roundsPlayed: 10, id: "wrong2" }
    });
    f.context.getPlayerKey = () => "Viewer";
    await f.open();
    assert.deepEqual(f.names(), ["Ada", "Grace"]);
    for (const [index, id] of ["AZaz09", "aZAZ90"].entries()) {
        const row = f.elements.leaderboardRows.children[index];
        assert.equal(row.children.length, 7);
        row.children[0].children[0].listeners.click();
        assert.equal(f.elements.leaderboardPlayerId.textContent, `ID ${id}`);
    }
});

test("legacy, missing and malformed IDs show an unavailable message without inventing an ID", async () => {
    const ids = ["x".repeat(50), undefined, null, "", "AbC12", "AbC1234", "AbC12!", " Åb123", "AbC123\n", 123456, ["AbC123"]];
    for (const id of ids) {
        const f = uiFixture();
        f.leaderboard.load = async () => [{ id, name: "Legacy", roundsPlayed: 20 }];
        await f.open();
        const row = f.elements.leaderboardRows.children[0];
        assert.equal(row.children[1].textContent, "20");
        row.children[0].children[0].listeners.click();
        assert.equal(f.elements.leaderboardPlayerId.hidden, false);
        assert.equal(f.elements.leaderboardPlayerId.textContent, "Sekstegns-ID utilgjengelig");
        assert.equal([...f.timers.values()][0].delay, 5000);
    }
});

test("leaderboard reports loading, emptiness and errors, and ignores an older request", async () => {
    const f = uiFixture();
    let finish;
    f.leaderboard.load = () => new Promise(resolve => { finish = resolve; });
    const first = f.open();
    assert.match(f.elements.leaderboardStatus.textContent, /Henter/);
    f.leaderboard.load = async () => [];
    await f.open();
    assert.match(f.elements.leaderboardStatus.textContent, /Ingen registrerte/);
    finish([{ id: "old", name: "Old", roundsPlayed: 100 }]);
    await first;
    assert.deepEqual(f.names(), []);
    f.leaderboard.load = async () => { throw new Error("Permission denied"); };
    await f.open();
    assert.match(f.elements.leaderboardStatus.textContent, /Kunne ikke hente/);
    assert.equal(f.errors.length, 1);
});
