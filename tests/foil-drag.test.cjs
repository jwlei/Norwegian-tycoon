const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = name => fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
const bounds = { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 };

class Element {
    constructor() {
        this.dataset = {};
        this.children = [];
        this.attributes = {};
        this.properties = new Map();
        this.classes = new Set();
        this.style = {
            setProperty: (name, value) => this.properties.set(name, value),
            getPropertyValue: name => this.properties.get(name) || "",
            removeProperty: name => this.properties.delete(name)
        };
        this.classList = {
            add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: (...names) => names.forEach(name => this.classes.delete(name)),
            contains: name => this.classes.has(name),
            toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)
        };
    }
    set className(value) { this.classes = new Set(value.split(" ")); }
    get className() { return [...this.classes].join(" "); }
    get childElementCount() { return this.children.length; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node) { node.parentElement = this; this.children.push(node); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    addEventListener(type, callback) { this[`on${type}`] = callback; }
    remove() {
        if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        }
    }
    cloneNode(deep) {
        const clone = new Element();
        clone.dataset = { ...this.dataset };
        clone.className = this.className;
        if (deep) { clone.append(...this.children.map(child => child.cloneNode(true))); }
        return clone;
    }
    getBoundingClientRect() { return this.bounds || bounds; }
    closest(selector) {
        for (let node = this; node; node = node.parentElement) {
            if (node.classList.contains(selector.slice(1))) { return node; }
        }
        return null;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
        if (selector == "*") { return descendants; }
        if (selector == "strong") { return descendants.filter(child => child.tagName == "STRONG"); }
        if (selector.startsWith("[data-card-foil=")) {
            const id = selector.match(/"([^"]+)"/)[1];
            return descendants.filter(child => child.dataset.cardFoil == id);
        }
        return descendants.filter(child => selector.slice(1).split(".").every(name => child.classes.has(name)));
    }
}

function fixture() {
    const preferences = new Map();
    const nodes = new Map();
    const timers = [];
    const body = new Element();
    const frames = new Map();
    let nextFrameId = 0;
    let now = 1000;
    let reducedMotion = false;
    const context = vm.createContext({
        console, Element, getCookie: key => preferences.get(key),
        setCookie: (key, value) => preferences.set(key, value),
        getPlayerKey: () => "owner", setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
        performance: { now: () => now },
        requestAnimationFrame(callback) {
            const id = ++nextFrameId;
            frames.set(id, callback);
            return id;
        },
        cancelAnimationFrame(id) { frames.delete(id); },
        Date: class extends Date { static now() { return now; } },
        window: { matchMedia: () => ({ matches: reducedMotion }), setTimeout() {} },
        localStorage: { getItem: () => "normal" },
        document: {
            body, createElement: tag => Object.assign(new Element(), { tagName: tag.toUpperCase() }), addEventListener() {},
            getElementById(id) {
                if (!nodes.has(id)) { nodes.set(id, new Element()); }
                return nodes.get(id);
            },
            querySelectorAll: () => []
        }
    });
    for (const name of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "engine.js"]) {
        vm.runInContext(source(name), context);
    }
    const types = vm.runInContext("({ Card, PresidentCard, PresidentPlayer, PresidentGame, GameLayout })", context);
    return { context, types, preferences, nodes, body, timers,
        set now(value) { now = value; }, set reducedMotion(value) { reducedMotion = value; },
        get pendingFrames() { return frames.size; },
        runFrame(time) {
            const pending = Array.from(frames.values());
            frames.clear();
            pending.forEach(callback => callback(time));
        } };
}

test("foil lists every supplied variant except reverse holo non-rares and defaults safely", () => {
    const { types, preferences } = fixture();
    assert.deepEqual(Array.from(types.Card.foilOptions(), option => option.id),
        ["none", "holo", "galaxy", "v", "vmax", "vstar", "full-art", "trainer-full-art",
            "rainbow", "rainbow-alt", "gold", "radiant", "gallery-holo", "gallery-v", "gallery-vmax"]);
    const names = Array.from(types.Card.foilOptions(), option => option.name);
    assert.deepEqual(names, ["Ingen folie", "Stripet", "Stjernestøv", "Prisme", "Bølger", "Fasetter",
        "Ringer", "Vev", "Regnbue", "Kontrast", "Gullglans", "Rutenett", "Fargespill", "Perlemor", "Stråler"]);
    assert.deepEqual(Array.from(types.Card.foilOptionsByUnlock(), option => option.id),
        ["none", "full-art", "holo", "trainer-full-art", "vstar", "radiant", "vmax",
            "gallery-v", "v", "gallery-vmax", "galaxy", "rainbow-alt", "rainbow", "gold", "gallery-holo"]);
    assert.deepEqual([3, 5, 10, 20, 50, 100].map(wins =>
        types.Card.foilOptions().filter(option => types.Card.foilUnlockWins(option.id) == wins).length
    ), [3, 3, 2, 2, 2, 2]);
    assert.equal(types.Card.foilUnlockWins("rainbow"), 50);
    assert.equal(types.Card.foilUnlockWins("gold"), 100);
    assert.ok(names.every(name => name.length <= 11));
    for (const invalid of [undefined, null, "", "reverse-holo", "<script>"]) {
        assert.equal(types.Card.normalizeFoil(invalid), "none");
    }
    assert.equal(types.GameLayout.cardFoil(), "none");
    preferences.set("CardFoil", "radiant");
    assert.equal(types.GameLayout.cardFoil(), "radiant");
    assert.equal(types.GameLayout.cardStyle(), "normal");
});

test("all foil variants combine with all card styles for every card without invalid SVG", () => {
    const { Card, PresidentCard } = fixture().types;
    for (const style of ["normal", "holo", "gold", "pixel", "parallax", "neon", "botanical",
        "monochrome", "minimalist", "cyberpunk", "glitched", "cosmic", "origami", "gothic", "silver", "crystal"]) {
        for (let suit = 1; suit <= 4; suit++) {
            for (let rank = 1; rank <= 13; rank++) {
                const card = new PresidentCard(suit, rank);
                const variants = Card.foilOptions().map(option => card.toImageDataUri(style, option.id));
                assert.equal(new Set(variants).size, 15);
                for (const uri of variants) {
                    const svg = decodeURIComponent(uri.split(",")[1]);
                    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
                    assert.doesNotMatch(svg, /undefined|NaN|https?:\/\/(?!www\.w3\.org)/);
                }
                assert.equal(card.toImageDataUri(style), card.toImageDataUri(style, "none"));
            }
        }
    }
});

test("foil is applied to shared image helpers without changing card backs", () => {
    const { types, preferences } = fixture();
    preferences.set("CardFoil", "galaxy");
    const card = new types.PresidentCard(2, 1);
    assert.match(decodeURIComponent(types.GameLayout.createCardImage(card, null, "gold").src), /data-foil="galaxy"/);
    assert.match(decodeURIComponent(types.GameLayout.cardImageHtml(card)), /data-foil="galaxy"/);
    assert.doesNotMatch(decodeURIComponent(types.GameLayout.createCardImage(types.Card.createBack()).src), /data-foil=/);
});

test("card images disable native browser dragging in both rendering helpers", () => {
    const { types } = fixture();
    for (const card of [new types.PresidentCard(2, 1), types.Card.createBack()]) {
        assert.equal(types.GameLayout.createCardImage(card).draggable, false);
        assert.match(types.GameLayout.cardImageHtml(card), /<img draggable="false"/);
    }
});

test("opponents default to normal cards without local foil unless own style applies globally", () => {
    const { context, types, preferences } = fixture();
    const viewer = new types.PresidentPlayer("Viewer", "viewer");
    const opponent = new types.PresidentPlayer("Opponent", "opponent");
    context.testOpponent = opponent;
    const opponentId = vm.runInContext("GamePresence.playerId(testOpponent)", context);
    const game = { players: [viewer, opponent], cardStyles: { [opponentId]: "pixel" } };
    const vanillaGame = { players: [viewer, opponent] };
    types.GameLayout.viewerName = "Viewer";
    preferences.set("CardFoil", "radiant");

    assert.equal(types.GameLayout.styleForPlayer(vanillaGame, "Opponent"), "normal");
    assert.equal(types.GameLayout.foilForPlayer(vanillaGame, "Opponent"), "none");
    assert.equal(types.GameLayout.styleForPlayer(game, "Opponent"), "pixel");
    assert.equal(types.GameLayout.foilForPlayer(game, "Opponent"), "none");
    game.cardFoils = { [opponentId]: "galaxy" };
    assert.equal(types.GameLayout.foilForPlayer(game, "Opponent"), "galaxy");
    assert.equal(types.GameLayout.foilForPlayer(game, "Viewer"), "radiant");

    preferences.set("CardStyleScope", "own");
    assert.equal(types.GameLayout.styleForPlayer(game, "Opponent"), "normal");
    assert.equal(types.GameLayout.foilForPlayer(game, "Opponent"), "radiant");
});

test("required top cards retain their pulse clock across redraws and restart after guidance becomes visible", () => {
    const f = fixture();
    const { GameLayout, PresidentCard, PresidentPlayer } = f.types;
    const player = new PresidentPlayer("Owner", "owner");
    player.turn = 1;
    const top = vm.runInContext('new CardPile("Other", new PresidentCard(1,7), new PresidentCard(2,7))', f.context);
    const older = vm.runInContext('new CardPile("Other", new PresidentCard(1,6))', f.context);
    const game = { id: "pulse", round: 1, status: "S", players: [player],
        piles: [older, top], isTurnPaused: () => false, topPile: () => top };
    GameLayout.updateTable(game, player);
    const table = f.nodes.get("gameTable");
    const summary = table._pileSummary;
    const outlines = table.querySelectorAll(".table-play__beat-outline");
    assert.equal(outlines.length, 2, "Only the top pair gets an outline");
    const animation = { currentTime: 1000 };
    outlines[0].getAnimations = () => [animation];
    assert.equal(table.querySelectorAll(".table-play")[0].dataset.topPlay, "false");
    assert.equal(table.querySelectorAll(".table-play")[1].dataset.topPlay, "true");
    f.now = 2000;
    summary.onanimationstart({ animationName: "table-guidance-fade-in" });
    assert.equal(table._beatPulseStartsAt, 7000, "Wait exactly 5 seconds after guidance appears");
    assert.equal(animation.currentTime, 0, "Reanchor the delay when guidance appears, not at card creation");
    f.now = 4000;
    GameLayout.updateTable(game, player);
    assert.equal(table._pileSummary, summary, "Guidance must not be detached or recreated on snapshots");
    assert.equal(table._beatPulseStartsAt, 7000);
    assert.equal(table.querySelector(".table-play__beat-outline").style.animationDelay, "3000ms");
    f.now = 8000;
    GameLayout.updateTable(game, player);
    assert.equal(table.querySelector(".table-play__beat-outline").style.animationDelay, "-1000ms");
    summary.onanimationstart({ animationName: "table-guidance-fade-in" });
    assert.equal(table._beatPulseStartsAt, 13000, "Restart the wait when a toast gives way to guidance");
    player.turn = 0;
    GameLayout.updateTable(game, player);
    assert.equal(summary.classList.contains("table-pile-summary--required"), false);
    game.status = "O";
    GameLayout.clearTableContent(table);
    assert.equal(summary.hidden, true);
});

test("the foil selector persists independently, updates previews and never registers card-style actions", () => {
    const { context, preferences, nodes } = fixture();
    const dialogs = [];
    context.currentGame = null;
    context.currentPlayerName = null;
    context.localizedMessage = text => text;
    context.readLastUsedPlayerName = () => "Ada";
    context.playerPresidentWins = 5;
    context.playerWinsName = "Ada";
    context.playerWinsLoading = false;
    context.playerWinsError = false;
    context.refreshPlayerPresidentWins = () => {};
    context.showDialog = (...args) => dialogs.push(args);
    let styleUpdates = 0;
    context.updateCardStyleButtons = () => styleUpdates++;
    context.updateCardAppearancePreview = () => {};
    const connection = source("connection.js");
    const helperStart = connection.indexOf("        function bindCardPreviewTilt(wrapper)");
    vm.runInContext(connection.slice(helperStart,
        connection.indexOf("        function updateCardAppearancePreview()", helperStart)), context);
    const watcherStart = connection.indexOf("        function isCardFoilUnlocked(");
    const watcherEnd = connection.indexOf("        function updateCardStyleButtons()", watcherStart);
    vm.runInContext(connection.slice(watcherStart, watcherEnd), context);
    const start = connection.indexOf("        function updateCardFoilButtons()");
    const end = connection.indexOf('        document.getElementById("hideToastsToggleButton")', start);
    vm.runInContext(connection.slice(start, end), context);
    const options = nodes.get("cardFoilOptions");
    assert.equal(options.childElementCount, 15);
    assert.ok(options.children.every(button => button.querySelectorAll(".card-preview").length == 1));
    assert.deepEqual(options.children.slice(0, 5).map(button => button.dataset.cardFoil),
        ["none", "full-art", "holo", "trainer-full-art", "vstar"]);
    assert.equal(nodes.get("cardFoilWins").textContent, "Your wins: 5");
    const goldRow = options.children.find(button => button.dataset.cardFoil == "gold");
    const gold = goldRow.querySelector(".card-foil-option__select");
    assert.equal(gold.disabled, true);
    assert.equal(gold.querySelector(".card-foil-option__unlock").textContent,
        "Krever 100 seire");
    assert.equal(goldRow.disabled, undefined);
    const preview = goldRow.querySelector(".card-preview");
    assert.equal(preview.tabIndex, 0);
    preview.onpointerdown({ pointerId: 1, clientX: 100, clientY: 100 });
    assert.equal(preview.classList.contains("is-tilting"), true);
    assert.equal(preferences.get("CardFoil"), undefined);
    const radiant = options.children.find(child => child.dataset.cardFoil == "radiant")
        .querySelector(".card-foil-option__select");
    assert.equal(radiant.classList.contains("card-style-option"), false);
    radiant.onclick();
    assert.equal(preferences.get("CardFoil"), "radiant");
    assert.equal(preferences.get("CardStyle"), undefined);
    assert.equal(styleUpdates, 1);
    assert.equal(nodes.get("cardFoilCurrentName").textContent, "Rutenett");
    assert.equal(radiant.attributes["aria-pressed"], "true");
    assert.equal(options.children[0].querySelector(".card-foil-option__select").attributes["aria-pressed"], "false");
    assert.deepEqual(dialogs.slice(-2), [["Kortfolie", false], ["Innstillinger", true]]);
    gold.onclick();
    assert.equal(preferences.get("CardFoil"), "radiant");
    nodes.get("cardFoilOpenButton").onclick();
    assert.deepEqual(dialogs.slice(-2), [["Innstillinger", false], ["Kortfolie", true]]);
    nodes.get("cardFoilCloseButton").onclick();
    assert.deepEqual(dialogs.slice(-2), [["Kortfolie", false], ["Innstillinger", true]]);
});

test("foil locks show win requirements, block locked selection and exempt the named players", () => {
    const connection = source("connection.js");
    const start = connection.indexOf("        function isCardFoilUnlocked(");
    const end = connection.indexOf("        function updateCardStyleButtons()", start);
    const context = vm.createContext({
        playerPresidentWins: 0,
        playerWinsName: "Ada", currentPlayerName: "Ada",
        playerWinsLoading: false, playerWinsError: false,
        Card: fixture().types.Card
    });
    vm.runInContext(connection.slice(start, end), context);
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), false);
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), false);
    context.playerPresidentWins = 3;
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), true);
    context.playerWinsLoading = true;
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), false);
    context.playerWinsLoading = false;
    context.playerWinsName = "Grace";
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), false);
    context.playerWinsName = "Ada";
    assert.equal(context.isCardFoilUnlocked("gold", "Ada"), false);
    assert.equal(context.isCardFoilUnlocked("gold", "h4cker"), true);
    assert.equal(context.isCardFoilUnlocked("rainbow", "TÅKEFYRSTEN"), true);

    const themeCss = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
    assert.match(themeCss, /\.card-foil-option\.is-locked \.card-foil-option__select::after\s*\{[^}]*content:\s*"×";/);
    assert.doesNotMatch(themeCss, /\.card-foil-option\.is-locked \.card-style-option__cards/);
    assert.match(themeCss, /\.card-foil-option__unlock\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*text-align:\s*center;/);
    assert.match(themeCss, /\.card-foil-option__unlock\s*\{[^}]*border:\s*1px solid var\(--line\);/);
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(html, /id="cardFoilWins">Your wins: 0<\/p>/);
});

test("opening the menu refreshes wins by name and stale responses cannot unlock another name", async () => {
    const f = fixture();
    const connection = source("connection.js");
    const pending = [];
    let updates = 0;
    Object.assign(f.context, {
        currentPlayerName: "Ada", playerWinsRequest: 0, playerWinsName: null,
        playerPresidentWins: 0, playerWinsLoading: false, playerWinsError: false,
        playerRoundsPlayed: 0,
        readLastUsedPlayerName: () => "",
        PlayerIdentity: {
            statsForName(name, key) {
                assert.equal(key, "owner");
                return new Promise(resolve => pending.push({ name, resolve }));
            }
        },
        updateCardFoilButtons: () => updates++,
        updateCardStyleButtons: () => updates++
    });
    const start = connection.indexOf("        async function refreshPlayerPresidentWins()");
    const end = connection.indexOf("        function updateCardStyleButtons()", start);
    vm.runInContext(connection.slice(start, end), f.context);
    const first = f.context.refreshPlayerPresidentWins();
    f.context.currentPlayerName = "Grace";
    const second = f.context.refreshPlayerPresidentWins();
    assert.deepEqual(pending.map(request => request.name), ["Ada", "Grace"]);
    pending[0].resolve({ presidentWins: 100, roundsPlayed: 100 });
    await first;
    assert.equal(f.context.playerPresidentWins, 0);
    assert.equal(f.context.playerWinsLoading, true);
    pending[1].resolve({ presidentWins: 5, roundsPlayed: 15 });
    await second;
    assert.equal(f.context.playerPresidentWins, 5);
    assert.equal(f.context.playerRoundsPlayed, 15);
    assert.equal(f.context.playerWinsName, "Grace");
    assert.equal(f.context.isCardFoilUnlocked("gold", "Grace"), false);
    const again = f.context.refreshPlayerPresidentWins();
    pending[2].resolve({ presidentWins: 20, roundsPlayed: 30 });
    await again;
    assert.equal(f.context.playerPresidentWins, 20);
    assert.ok(updates >= 5);
});

test("card styles preserve their order and unlock five at 5 rounds, five at 15 and the remainder at 30", () => {
    const { context, types } = fixture();
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const styles = Array.from(html.matchAll(/class="card-style-option" data-card-style="([^"]+)"/g), match => match[1]);
    assert.deepEqual(styles, ["botanical", "normal", "monochrome", "minimalist", "origami", "gothic",
        "silver", "gold", "crystal", "holo", "parallax", "cosmic", "pixel", "neon", "cyberpunk", "glitched"]);
    assert.deepEqual(styles.slice(2).map(style => types.Card.styleUnlockRounds(style)),
        [5, 5, 5, 5, 5, 15, 15, 15, 15, 15, 30, 30, 30, 30]);
    Object.assign(context, {
        playerRoundsPlayed: 0, playerWinsName: "Ada", currentPlayerName: "Ada",
        playerWinsLoading: false, playerWinsError: false
    });
    const connection = source("connection.js");
    const start = connection.indexOf("        function isCardStyleUnlocked(");
    const end = connection.indexOf("        function updateCardStyleButtons()", start);
    vm.runInContext(connection.slice(start, end), context);
    for (const [rounds, count] of [[0, 1], [4, 1], [5, 6], [14, 6], [15, 11], [29, 11], [30, 15]]) {
        context.playerRoundsPlayed = rounds;
        assert.equal(styles.filter(style => context.isCardStyleUnlocked(style, "Ada")).length, count);
    }
    context.playerWinsLoading = true;
    assert.equal(context.isCardStyleUnlocked("silver", "Ada"), false);
    assert.equal(context.isCardStyleUnlocked("normal", "Ada"), true);
    for (const name of ["h4cker", " H4CKER ", "TÅKEFYRSTEN", "Ta\u030akefyrsten"]) {
        assert.ok(styles.every(style => context.isCardStyleUnlocked(style, name)));
        assert.equal(types.Card.normalizeStyle("botanical", name), "botanical");
    }
    context.playerWinsLoading = false;
    context.playerWinsName = "Grace";
    assert.equal(context.isCardStyleUnlocked("glitched", "Ada"), false);
});

test("locked card styles disable only selection while their previews stay interactive", () => {
    const f = fixture();
    const rows = ["botanical", "normal", "monochrome", "gold", "glitched"].map(style => {
        const row = new Element();
        row.className = "card-style-option";
        row.dataset.cardStyle = style;
        const holder = new Element();
        holder.className = "card-style-option__cards";
        const button = new Element();
        button.className = "card-style-option__select";
        const name = new Element();
        name.tagName = "STRONG";
        name.textContent = style;
        const unlock = new Element();
        unlock.className = "card-style-option__unlock";
        button.append(name, unlock);
        row.append(holder, button);
        return row;
    });
    f.context.document.querySelectorAll = selector => selector == ".card-style-option" ? rows : [];
    f.context.document.querySelector = () => rows[1].querySelector("strong");
    f.context.document.documentElement = { dataset: {} };
    const bound = [];
    Object.assign(f.context, {
        playerRoundsPlayed: 5, playerWinsName: "Ada", currentPlayerName: "Ada",
        playerWinsLoading: false, playerWinsError: false,
        localizedMessage: text => text, updateCardAppearancePreview() {},
        readLastUsedPlayerName: () => "Ada",
        bindCardPreviewTilt: preview => bound.push(preview)
    });
    const connection = source("connection.js");
    const start = connection.indexOf("        function isCardStyleUnlocked(");
    const end = connection.indexOf("        updateCardStyleButtons();", start);
    vm.runInContext(connection.slice(start, end), f.context);
    f.context.updateCardStyleButtons();
    assert.equal(rows[0].hidden, true);
    assert.equal(rows[1].querySelector(".card-style-option__select").disabled, false);
    assert.equal(rows[2].querySelector(".card-style-option__select").disabled, false);
    assert.equal(rows[3].querySelector(".card-style-option__select").disabled, true);
    assert.equal(rows[3].querySelector(".card-style-option__unlock").textContent, "Krever 15 runder");
    assert.equal(rows[4].querySelector(".card-style-option__select").disabled, true);
    assert.ok(rows.every(row => row.disabled === undefined));
    assert.equal(bound.length, 15);
    assert.ok(bound.every(preview => preview.tabIndex == 0));
    assert.equal(f.nodes.get("cardStyleRounds").textContent, "Dine runder: 5");
    f.context.playerRoundsPlayed = 30;
    f.context.updateCardStyleButtons();
    assert.equal(f.nodes.get("cardStyleRounds").textContent, "Dine runder: 30",
        "A fresh count must update even when existing preview images are reused");
    assert.equal(bound.length, 15);
    assert.equal(rows[4].querySelector(".card-style-option__select").disabled, false);
});

test("foil overlays cover the full card surface and settings share one card preview", () => {
    const { types } = fixture();
    const foilCss = fs.readFileSync(path.join(__dirname, "..", "css", "foil.css"), "utf8");
    assert.match(foilCss, /--foil-inset:\s*0\.625% 0\.9375%;/);
    assert.match(foilCss, /--foil-radius:\s*11\.15% \/ 7\.38%;/);
    assert.match(foilCss, /\[data-foil\]:not\(\[data-foil="none"\]\)::before\s*\{[^}]*inset:\s*var\(--foil-inset\);[^}]*border-radius:\s*var\(--foil-radius\);/);
    assert.match(foilCss, /\[data-foil\]:not\(\[data-foil="none"\]\)::after\s*\{[^}]*inset:\s*var\(--foil-inset\);[^}]*border-radius:\s*var\(--foil-radius\);/);
    assert.match(foilCss, /\[data-foil\]\s*\{[^}]*isolation:\s*isolate;/);
    assert.doesNotMatch(foilCss, /inset:\s*2px;\s*border-radius:\s*6px;/);
    const svg = decodeURIComponent(new types.PresidentCard(1, 5).toImageDataUri("normal", "holo").split(",")[1]);
    assert.match(svg, /clipPath id="card-foil-clip"[\s\S]*?<rect x="1\.5" y="1\.5" width="77" height="117" rx="8"\/>/);
    assert.match(svg, /<g data-foil="holo" opacity="\.23" clip-path="url\(#card-foil-clip\)">[\s\S]*?<rect x="1\.5" y="1\.5" width="77" height="117"/);
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const settings = html.slice(html.indexOf('class="setting-card-appearance"'),
        html.indexOf('<h3 class="settings-category">Spill og styring</h3>'));
    assert.equal((settings.match(/id="cardAppearancePreview"/g) || []).length, 1);
    assert.equal((settings.match(/class="setting-card-appearance__button"/g) || []).length, 2);
    assert.doesNotMatch(settings, /id="cardStyleCurrent"|id="cardFoilCurrent"/);
    assert.match(html, /Bruk valgt stil og folie på alle kort, eller vis andre spilleres valgte stil og folie\./);
    const themeCss = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
    assert.match(themeCss, /\.setting-card-appearance__controls\s*\{[^}]*max-width:\s*210px;/);
    assert.match(themeCss, /\.card-appearance-preview \.card-preview\s*\{[^}]*width:\s*clamp\(72px, 19vw, 92px\);[^}]*aspect-ratio:\s*2 \/ 3;[^}]*overflow:\s*visible;/);
    assert.match(themeCss, /\.card-appearance-preview \.card-preview > img\s*\{[^}]*object-fit:\s*contain;/);
    assert.match(themeCss, /\.card-foil-option \.card-preview\s*\{[^}]*touch-action:\s*none;[^}]*transform:\s*perspective\(600px\) rotateX\(var\(--tilt-x, 0deg\)\) rotateY\(var\(--tilt-y, 0deg\)\);/);
    assert.match(themeCss, /\.table-deck \.table-play__card > img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/);
});

test("foil reduces light and pattern movement by twenty percent with 400ms easing", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "css", "foil.css"), "utf8");
    for (const axis of ["x", "y"]) {
        assert.ok(css.includes(`--foil-${axis}: calc(50% + (var(--pointer-${axis}, 50%) - 50%) * .8);`));
    }
    assert.match(css, /background-position:\s*center, 0% var\(--foil-y\),\s*var\(--foil-x\) var\(--foil-y\), center;/);
    assert.match(css, /transition: opacity 400ms ease, background-position 400ms ease-out;/);
    assert.match(css, /transition: opacity 400ms ease;/);
    assert.match(css, /\.is-tilting::before,[\s\S]*?opacity: \.72;/);
});

test("touch-dragging a foil preview tracks its pointer without selecting its option", () => {
    const f = fixture();
    const connection = source("connection.js");
    const start = connection.indexOf("        function bindCardPreviewTilt(wrapper)");
    const end = connection.indexOf("        function updateCardAppearancePreview()", start);
    f.context.updateCardTilt = (wrapper, event) => { wrapper.lastTiltEvent = event; };
    f.context.resetCardTilt = wrapper => { wrapper.didReset = true; };
    vm.runInContext(connection.slice(start, end), f.context);
    const wrapper = new Element();
    f.context.bindCardPreviewTilt(wrapper);
    let movePrevented = false;
    let clickPrevented = false;
    let clickStopped = false;
    wrapper.onpointerdown({ pointerId: 1, clientX: 10, clientY: 10 });
    wrapper.onpointermove({
        pointerId: 1, clientX: 15, clientY: 20,
        preventDefault() { movePrevented = true; }
    });
    wrapper.onpointerup({ pointerId: 1 });
    wrapper.onclick({
        preventDefault() { clickPrevented = true; },
        stopPropagation() { clickStopped = true; }
    });
    assert.equal(movePrevented, true);
    assert.equal(wrapper.lastTiltEvent.clientY, 20);
    assert.equal(clickPrevented, true);
    assert.equal(clickStopped, true);
});

test("drag source cards disappear immediately instead of leaving a shadow at the hand position", () => {
    const styles = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
    assert.match(styles, /\.game-card\.is-drag-source\s*\{\s*opacity:\s*0;\s*transition:\s*none;/);
});

test("drag previews escape hand clipping, follow both axes without a distance cap and clean up", () => {
    const f = fixture();
    const hand = new Element();
    const first = new Element();
    const second = new Element();
    first.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "radiant" };
    second.dataset = { cardKey: "2:5", cardStyle: "normal", foil: "radiant" };
    first.className = second.className = "game-card";
    hand.append(first, second);
    f.context.hand = hand;
    vm.runInContext('selectedCardKeys.add("1:5"); selectedCardKeys.add("2:5")', f.context);
    f.context.startCardDragPreview(hand, { clientX: 100, clientY: 500 });
    assert.equal(f.body.children.length, 1);
    assert.equal(f.body.children[0].children.length, 2);
    f.context.moveCardDragPreview(hand, { clientX: 350, clientY: 100 }, 100, 500);
    for (const card of [first, second]) {
        assert.equal(card.classList.contains("is-drag-source"), true);
        assert.equal(card._dragPreview.dataset.foil, "radiant");
        assert.equal(card._dragPreview.properties.get("--drag-offset-x"), "250px");
        assert.equal(card._dragPreview.properties.get("--drag-offset-y"), "-400px");
        assert.equal(card._dragPreview.properties.get("--tilt-x"), "0deg");
        assert.equal(card._dragPreview.properties.get("--tilt-y"), "0deg");
        assert.equal(card._dragPreview.classList.contains("is-tilting"), false);
    }
    assert.equal(f.nodes.get("gameTable").classList.contains("is-card-drop-target"), true);
    f.reducedMotion = true;
    f.context.moveCardDragPreview(hand, { clientX: 360, clientY: 110 }, 100, 500);
    assert.equal(first._dragPreview.properties.get("--tilt-x"), "0deg");
    assert.equal(first._dragPreview.properties.get("--drag-scale"), "1");
    assert.equal(f.pendingFrames, 0);
    f.context.clearCardDragPreview(hand);
    assert.equal(f.body.children.length, 0);
    assert.equal(first._dragPreview, undefined);
    assert.equal(first.classList.contains("is-drag-source"), false);
    assert.equal(f.nodes.get("gameTable").classList.contains("is-card-drop-target"), false);
});

test("velocity tilt inverts both axes, clamps and settles all selected cards together", () => {
    const f = fixture();
    const hand = new Element();
    const card = new Element();
    card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
    card.className = "game-card";
    const second = card.cloneNode(true);
    const third = card.cloneNode(true);
    second.dataset.cardKey = "2:5";
    third.dataset.cardKey = "3:5";
    hand.append(card, second, third);
    vm.runInContext('["1:5", "2:5", "3:5"].forEach(key => selectedCardKeys.add(key))', f.context);
    f.context.startCardDragPreview(hand, { clientX: 100, clientY: 100 });
    f.context.moveCardDragPreview(hand, { clientX: 200, clientY: 20 }, 100, 100);
    f.runFrame(1016);
    const pitch = parseFloat(card._dragPreview.properties.get("--tilt-x"));
    const yaw = parseFloat(card._dragPreview.properties.get("--tilt-y"));
    assert.ok(pitch > 0 && pitch < 18);
    assert.ok(yaw < 0 && yaw > -18);
    assert.ok(Math.abs(hand._cardDragPreview.pitch + hand._cardDragPreview.yaw * 0.7) < 1e-10);
    assert.ok(parseFloat(card._dragPreview.properties.get("--pointer-x")) < 50);
    assert.ok(parseFloat(card._dragPreview.properties.get("--pointer-y")) < 50);
    assert.equal(card._dragPreview.classList.contains("is-tilting"), true);
    for (const selected of [second, third]) {
        assert.ok(parseFloat(selected._dragPreview.properties.get("--tilt-x")) > pitch);
        assert.equal(selected._dragPreview.properties.get("--tilt-y"), `${yaw.toFixed(2)}deg`);
        assert.equal(selected._dragPreview.properties.get("--pointer-x"), card._dragPreview.properties.get("--pointer-x"));
        assert.ok(parseFloat(selected._dragPreview.properties.get("--pointer-y")) <
            parseFloat(card._dragPreview.properties.get("--pointer-y")));
    }
    assert.ok(parseFloat(third._dragPreview.properties.get("--tilt-x")) >
        parseFloat(second._dragPreview.properties.get("--tilt-x")));
    f.runFrame(1032);
    assert.ok(Math.abs(hand._cardDragPreview.targetPitch) < 18);
    f.context.moveCardDragPreview(hand, { clientX: -10000, clientY: 10000 }, 100, 100);
    f.runFrame(1048);
    assert.ok(parseFloat(card._dragPreview.properties.get("--tilt-x")) > 0,
        "a brief direction reversal must ease through the existing rotation rather than snap");
    for (let time = 1064; time < 2600; time += 16) { f.runFrame(time); }
    assert.equal(card._dragPreview.properties.get("--tilt-x"), "0deg");
    assert.equal(card._dragPreview.properties.get("--tilt-y"), "0deg");
    assert.equal(card._dragPreview.properties.get("--pointer-x"), "50.00%");
    assert.equal(card._dragPreview.properties.get("--pointer-y"), "50.00%");
    assert.equal(card._dragPreview.classList.contains("is-tilting"), false);
    for (const selected of [second, third]) {
        assert.equal(selected._dragPreview.properties.get("--tilt-x"), "0deg");
        assert.equal(selected._dragPreview.properties.get("--pointer-y"), "50.00%");
    }
    assert.equal(f.pendingFrames, 0);
    f.context.clearCardDragPreview(hand);
});

test("drag tilt is driven by frame velocity rather than total drag distance", () => {
    function pitchForFrameDuration(elapsed) {
        const f = fixture();
        const hand = new Element();
        const card = new Element();
        card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
        card.className = "game-card";
        hand.appendChild(card);
        vm.runInContext('selectedCardKeys.add("1:5")', f.context);
        f.context.startCardDragPreview(hand, { clientX: 100, clientY: 100 });
        const drag = hand._cardDragPreview;
        drag.lastFrameTime = 1000;
        f.context.moveCardDragPreview(hand, { clientX: 100, clientY: 99.75 }, 100, 100);
        f.runFrame(1000 + elapsed);
        const blend = 1 - Math.exp(-elapsed / 120);
        const targetBlend = 1 - Math.exp(-elapsed / 100);
        const target = drag.pitch / blend / targetBlend;
        f.context.clearCardDragPreview(hand);
        assert.equal(f.pendingFrames, 0);
        return target;
    }
    assert.ok(Math.abs(pitchForFrameDuration(16) - 7.875) < 1e-10);
    assert.ok(Math.abs(pitchForFrameDuration(32) - 3.9375) < 1e-10);
});

test("a non-board release glides drag previews back before restoring the hand cards", () => {
    const f = fixture();
    const hand = new Element();
    const card = new Element();
    card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
    card.className = "game-card";
    hand.appendChild(card);
    vm.runInContext('selectedCardKeys.add("1:5")', f.context);
    f.context.startCardDragPreview(hand, { clientX: 100, clientY: 100 });
    f.context.moveCardDragPreview(hand, { clientX: 230, clientY: 170 }, 100, 100);
    f.context.returnCardDragPreview(hand);
    assert.equal(f.pendingFrames, 0);
    assert.equal(card._dragPreview.classList.contains("is-returning"), true);
    assert.equal(card._dragPreview.properties.get("--drag-offset-x"), "0px");
    assert.equal(card._dragPreview.properties.get("--drag-offset-y"), "0px");
    assert.equal(card._dragPreview.properties.get("--tilt-y"), "0deg");
    assert.equal(card.classList.contains("is-drag-source"), true);
    assert.equal(f.timers.at(-1).delay, 340);
    f.timers.at(-1).callback();
    assert.equal(hand._cardDragPreview, null);
    assert.equal(card.classList.contains("is-drag-source"), false);
});

test("releasing a dragged hand outside the board animates the preview back", () => {
    const f = pointerFixture({ desktop: true, mode: "button" });
    f.hand.onpointerdown(f.event(100, 500));
    f.hand.onpointermove(f.event(230, 350));
    f.hand.onpointerup(f.event(230, 350));
    assert.equal(f.state.plays, 0);
    assert.equal(f.body.children.length, 1);
    assert.equal(f.body.children[0].children[0].classList.contains("is-returning"), true);
    assert.equal(f.card.classList.contains("is-drag-source"), true);
    f.timers.at(-1).callback();
    assert.equal(f.body.children.length, 0);
    assert.equal(f.card.classList.contains("is-drag-source"), false);
});

test("slow drops play only on the board and flicks require 12 pixels at the existing velocity", () => {
    const f = fixture();
    f.context.document.getElementById("gameTable");
    const drag = { canDragToPlay: true, canSwipeToPlay: false, didPlayDrag: true,
        axis: "vertical", startX: 100, startY: 500 };
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 200 }), true);
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 401, clientY: 200 }), false);
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 400 }), false);
    drag.canSwipeToPlay = true;
    drag.lastFlickDistance = 100;
    drag.lastFlickVelocity = 0.1;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 400 }), false);
    drag.lastFlickDistance = 11;
    drag.lastFlickVelocity = 0.55;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.lastFlickDistance = 12;
    drag.lastFlickVelocity = 0.54;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.lastFlickVelocity = 0.55;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), true);
    drag.lastFlickDistance = -16;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.didPlayDrag = false;
    drag.cardElement = { getBoundingClientRect: () => ({ height: 120 }) };
    drag.lastFlickDistance = 0;
    drag.lastFlickVelocity = 0;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 453 }), false);
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 452 }), false);
    drag.axis = "horizontal";
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 200 }), false);
    drag.axis = "vertical";
    drag.canDragToPlay = false;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 200 }), false);
});

function pointerFixture({ desktop = false, valid = true, mode = "flick", blocked = false } = {}) {
    const f = fixture();
    const hand = new Element();
    const card = new Element();
    card.className = "game-card";
    card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
    hand.appendChild(card);
    const player = new f.types.PresidentPlayer("Owner", "owner");
    player.cards.push(new f.types.PresidentCard(1, 5));
    const state = { plays: 0, warnings: 0, scrolls: 0 };
    const context = f.context;
    context.element = hand;
    context.player = player;
    context.game = { status: "S", connectionOnline: true, localWritePending: blocked };
    context.isPlayingTurn = true;
    context.GameLayout = f.types.GameLayout;
    f.types.GameLayout.playInputMode = () => mode;
    context.selectCardsForSwipe = () => {
        if (valid) { vm.runInContext('selectedCardKeys.add("1:5")', context); }
        return valid;
    };
    context.playSelectedCards = () => { state.plays++; return true; };
    context.showInvalidCardWarning = () => state.warnings++;
    context.startCardHandInertia = () => state.scrolls++;
    context.clearDragStyles = () => {};
    const layout = source("layout.js");
    const start = layout.indexOf("        var handScrollDrag = null;");
    vm.runInContext(layout.slice(start, layout.indexOf("        var selectableExchanges", start)), context);
    function event(x, y, pointerId = 1) {
        return { clientX: x, clientY: y, pointerId, pointerType: desktop ? "mouse" : "touch",
            button: 0, isPrimary: true, target: card, preventDefault() {} };
    }
    return { ...f, hand, card, state, event,
        advance(value) { f.now = value; } };
}

test("the hand cancels native dragstart before it can interrupt pointer gestures", () => {
    const f = fixture();
    const hand = new Element();
    f.nodes.set("playerHand", hand);
    hand._handSignature = "unchanged";
    hand._rebindHand = () => {};
    f.types.GameLayout.handSignature = () => "unchanged";
    f.types.GameLayout.updateHand({}, {}, null, true);
    let prevented = false;
    hand.ondragstart({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
});

test("pointerdown immediately activates a legal card, while taps and cancellation restore the original selection", () => {
    for (const desktop of [false, true]) {
        const f = pointerFixture({ desktop });
        f.hand.onpointerdown(f.event(100, 500));
        assert.equal(f.body.children.length, 1, "No movement threshold before preview activation");
        assert.equal(vm.runInContext('selectedCardKeys.has("1:5")', f.context), true);
        f.hand.onpointerup(f.event(100, 500));
        assert.equal(vm.runInContext("selectedCardKeys.size", f.context), 0,
            "Restore selection before the normal click handler runs");
        assert.equal(f.body.children.length, 0);
        assert.equal(f.state.plays, 0);
        f.hand.onpointerdown(f.event(100, 500));
        f.hand.onpointercancel();
        assert.equal(vm.runInContext("selectedCardKeys.size", f.context), 0);
        assert.equal(f.body.children.length, 0);
    }
});

test("slow long drags outside the board never play, but fresh upward flicks do on desktop and touch", () => {
    for (const desktop of [false, true]) {
        const slow = pointerFixture({ desktop });
        slow.hand.onpointerdown(slow.event(100, 500));
        slow.advance(2000);
        slow.hand.onpointermove(slow.event(100, 350));
        slow.hand.onpointerup(slow.event(100, 350));
        assert.equal(slow.state.plays, 0);
        const quick = pointerFixture({ desktop });
        quick.hand.onpointerdown(quick.event(100, 500));
        quick.advance(1030);
        quick.hand.onpointermove(quick.event(100, 470));
        quick.hand.onpointerup(quick.event(100, 470));
        assert.equal(quick.state.plays, 1);
        const held = pointerFixture({ desktop });
        held.hand.onpointerdown(held.event(100, 500));
        held.advance(1030);
        held.hand.onpointermove(held.event(100, 470));
        held.advance(1200);
        held.hand.onpointerup(held.event(100, 470));
        assert.equal(held.state.plays, 0, "A held card is no longer a flick");
    }
});

test("short flicks work throughout the upward 160 degree cone on mouse and touch", () => {
    for (const desktop of [false, true]) {
        for (const angle of [-80, -75, -70, -60, -45, 0, 45, 60, 70, 75, 80]) {
            const f = pointerFixture({ desktop });
            const radians = angle * Math.PI / 180;
            const x = 100 + Math.sin(radians) * 13;
            const y = 500 - Math.cos(radians) * 13;
            f.hand.onpointerdown(f.event(100, 500));
            f.advance(1016);
            f.hand.onpointermove(f.event(x, y));
            f.hand.onpointerup(f.event(x, y));
            assert.equal(f.state.plays, 1, `${desktop ? "mouse" : "touch"} at ${angle} degrees`);
            assert.equal(f.state.scrolls, 0);
        }
    }
});

test("flicks outside the cone, too short, too slow, held or in button mode never play off-board", () => {
    for (const desktop of [false, true]) {
        for (const [angle, distance, duration, mode, hold] of [
            [-81, 40, 30, "flick", 0], [81, 40, 30, "flick", 0],
            [-90, 40, 30, "flick", 0], [90, 40, 30, "flick", 0],
            [180, 40, 30, "flick", 0], [0, 11, 16, "flick", 0],
            [60, 30, 200, "flick", 0], [60, 30, 20, "flick", 150],
            [-60, 30, 20, "button", 0], [60, 30, 20, "button", 0]
        ]) {
            const f = pointerFixture({ desktop, mode });
            const radians = angle * Math.PI / 180;
            const x = 100 + Math.sin(radians) * distance;
            const y = 500 - Math.cos(radians) * distance;
            f.hand.onpointerdown(f.event(100, 500));
            f.advance(1000 + duration);
            f.hand.onpointermove(f.event(x, y));
            f.advance(1000 + duration + hold);
            f.hand.onpointerup(f.event(x, y));
            assert.equal(f.state.plays, 0, `${desktop ? "mouse" : "touch"} ${angle}deg/${distance}px/${duration}ms/${mode}`);
        }
    }
});

test("release position and decaying momentum determine normalized shared throw metadata", () => {
    const f = fixture();
    const hand = new Element();
    hand._cardDragPreview = { pitch: 12, yaw: -8 };
    const drag = { velocityX: 1, velocityY: -2, lastMotionTime: 1000 };
    const motion = f.types.GameLayout.cardThrowMotion(drag, { clientX: 200, clientY: 250 }, hand);
    assert.equal(motion.x, 0.8);
    assert.equal(motion.y, -1);
    assert.equal(motion.spin, 5);
    assert.equal(motion.pitch, 12);
    assert.equal(motion.yaw, -8);
    assert.ok(motion.power > 0.8);
    f.now = 1500;
    const held = f.types.GameLayout.cardThrowMotion(drag, { clientX: 200, clientY: 250 }, hand);
    assert.ok(held.power < 0.01);
    const left = f.types.GameLayout.cardThrowMotion(
        { velocityX: 0, velocityY: 0, lastMotionTime: 1500 }, { clientX: 0, clientY: 150 }, hand);
    assert.equal(left.x, -1);
    assert.equal(left.y, 0);
});

test("desktop drag drops once, rejects illegal moves and leaves button mode usable", () => {
    for (const valid of [false, true]) {
        const f = pointerFixture({ desktop: true, mode: "button", valid });
        f.hand.onpointerdown(f.event(100, 500));
        f.hand.onpointermove(f.event(200, 200));
        f.advance(2000);
        f.hand.onpointerup(f.event(200, 200));
        f.hand.onpointerup(f.event(200, 200));
        assert.equal(f.state.plays, valid ? 1 : 0);
        assert.equal(f.state.warnings, valid ? 0 : 1);
        assert.equal(f.body.children.length, 0);
        assert.equal(f.card.classList.contains("is-drag-source"), false);
    }
    const blocked = pointerFixture({ desktop: true, blocked: true });
    blocked.hand.onpointerdown(blocked.event(100, 500));
    blocked.hand.onpointermove(blocked.event(200, 200));
    blocked.hand.onpointerup(blocked.event(200, 200));
    assert.equal(blocked.state.plays, 0);
});

test("touch flick plays outside the board while scrolling from empty hand space never plays", () => {
    const flick = pointerFixture();
    flick.hand.onpointerdown(flick.event(100, 500));
    flick.hand.onpointermove(flick.event(100, 470));
    flick.advance(1040);
    flick.hand.onpointerup(flick.event(100, 470));
    assert.equal(flick.state.plays, 1);
    const scroll = pointerFixture();
    scroll.hand.onpointerdown({ ...scroll.event(100, 500), target: scroll.hand });
    scroll.hand.onpointermove(scroll.event(170, 490));
    scroll.hand.onpointerup(scroll.event(170, 100));
    assert.equal(scroll.state.plays, 0);
    assert.equal(scroll.state.scrolls, 1);
});

test("grabbed cards drag instead of scrolling, whether selected or not", () => {
    const drag = pointerFixture();
    vm.runInContext('selectedCardKeys.add("1:5")', drag.context);
    drag.hand.onpointerdown(drag.event(100, 500));
    drag.hand.onpointermove(drag.event(112, 492));
    assert.equal(drag.body.children.length, 1);
    assert.equal(drag.hand.classList.contains("is-hand-dragging"), false);
    drag.hand.onpointerup(drag.event(112, 492));

    for (const selected of [false, true]) {
        const sideways = pointerFixture();
        if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', sideways.context); }
        sideways.hand.onpointerdown(sideways.event(100, 500));
        sideways.hand.onpointermove(sideways.event(150, 501));
        assert.equal(sideways.body.children.length, 1);
        assert.equal(sideways.hand.classList.contains("is-hand-dragging"), false);
        sideways.hand.onpointerup(sideways.event(150, 501));
        assert.equal(sideways.state.scrolls, 0);
        assert.equal(sideways.state.plays, 0);
    }
});

test("a circular pickup can finish with a short upward flick anywhere below the table", () => {
    for (const desktop of [false, true]) {
        for (const selected of [false, true]) {
            for (const x of [5, 200, 395]) {
                const f = pointerFixture({ desktop });
                if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
                f.hand.onpointerdown(f.event(x, 500));
                for (const [time, dx, y] of [
                    [1100, 30, 505], [1200, 40, 530], [1300, 0, 540],
                    [1400, -20, 520], [1500, 0, 510], [1510, 0, 502], [1520, 0, 494]
                ]) {
                    f.advance(time);
                    f.hand.onpointermove(f.event(x + dx, y));
                }
                f.hand.onpointerup(f.event(x, 494));
                assert.equal(f.state.plays, 1, `${desktop}/${selected}/${x}`);
                assert.equal(f.state.scrolls, 0);
            }
        }
    }
});

test("a held card uses its recent upward acceleration rather than the whole slow pickup", () => {
    for (const desktop of [false, true]) {
        const f = pointerFixture({ desktop });
        f.hand.onpointerdown(f.event(100, 500));
        for (const [time, y] of [[1200, 495], [1400, 490], [1600, 485], [1616, 469], [1632, 453]]) {
            f.advance(time);
            f.hand.onpointermove(f.event(100, y));
        }
        f.hand.onpointerup(f.event(100, 453));
        assert.equal(f.state.plays, 1);
    }
});

test("recent flick detection tolerates different pointer sampling rates without weakening the thresholds", () => {
    for (const interval of [4, 8, 16, 32]) {
        for (const speed of [0.3, 0.75]) {
            const f = pointerFixture();
            f.hand.onpointerdown(f.event(100, 500));
            f.advance(1400);
            f.hand.onpointermove(f.event(100, 490));
            let y = 490;
            for (let elapsed = interval; elapsed <= 64; elapsed += interval) {
                y = 490 - elapsed * speed;
                f.advance(1400 + elapsed);
                f.hand.onpointermove(f.event(100, y));
            }
            f.hand.onpointerup(f.event(100, y));
            assert.equal(f.state.plays, speed >= 0.55 ? 1 : 0, `${interval}ms/${speed}px/ms`);
        }
    }
});

test("releasing a tilted card interpolates back to zero and cancels the frame on cleanup", () => {
    const f = fixture();
    const hand = new Element();
    const card = new Element();
    card.className = "game-card";
    card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
    hand.appendChild(card);
    vm.runInContext('selectedCardKeys.add("1:5")', f.context);
    f.context.startCardDragPreview(hand, { clientX: 100, clientY: 100 });
    f.now = 1020;
    f.context.moveCardDragPreview(hand, { clientX: 140, clientY: 130 }, 100, 100);
    f.runFrame(1016);
    let preview = card._dragPreview;
    const pitch = Math.abs(parseFloat(preview.style.getPropertyValue("--tilt-x")));
    assert.ok(pitch > 0);
    f.context.returnCardDragPreview(hand);
    for (let time = 1032; time <= 1304; time += 16) { f.runFrame(time); }
    assert.ok(Math.abs(parseFloat(preview.style.getPropertyValue("--tilt-x"))) < pitch);
    f.timers.at(-1).callback();
    assert.equal(f.pendingFrames, 0);
    f.runFrame(1048);
    assert.equal(hand._cardDragPreview, null);
});

test("a brief diagonal drift does not lock a vertical flick into hand scrolling", () => {
    const flick = pointerFixture();
    flick.hand.onpointerdown(flick.event(100, 500));
    flick.advance(1005);
    flick.hand.onpointermove(flick.event(108, 498));
    flick.advance(1020);
    flick.hand.onpointermove(flick.event(110, 474));
    flick.hand.onpointerup(flick.event(110, 474));
    assert.equal(flick.state.plays, 1);
    assert.equal(flick.state.scrolls, 0);
});

test("flick intent follows the final vertical stroke, not earlier stronger movement", () => {
    const reversed = pointerFixture();
    reversed.hand.onpointerdown(reversed.event(100, 500));
    reversed.advance(1030);
    reversed.hand.onpointermove(reversed.event(100, 470));
    reversed.advance(1050);
    reversed.hand.onpointermove(reversed.event(100, 490));
    reversed.hand.onpointerup(reversed.event(100, 490));
    assert.equal(reversed.state.plays, 0);

    const finalFlick = pointerFixture();
    finalFlick.hand.onpointerdown(finalFlick.event(100, 500));
    finalFlick.advance(1030);
    finalFlick.hand.onpointermove(finalFlick.event(100, 470));
    finalFlick.advance(1050);
    finalFlick.hand.onpointermove(finalFlick.event(100, 490));
    finalFlick.advance(1080);
    finalFlick.hand.onpointermove(finalFlick.event(100, 464));
    finalFlick.hand.onpointerup(finalFlick.event(100, 464));
    assert.equal(finalFlick.state.plays, 1);
    assert.equal(finalFlick.state.warnings, 0);

    const weakFinal = pointerFixture();
    weakFinal.hand.onpointerdown(weakFinal.event(100, 500));
    weakFinal.advance(1030);
    weakFinal.hand.onpointermove(weakFinal.event(100, 470));
    weakFinal.advance(1050);
    weakFinal.hand.onpointermove(weakFinal.event(100, 490));
    weakFinal.advance(1120);
    weakFinal.hand.onpointermove(weakFinal.event(100, 466));
    weakFinal.hand.onpointerup(weakFinal.event(100, 466));
    assert.equal(weakFinal.state.plays, 0);
});

test("release at the last upward flick position uses that final stroke", () => {
    const flick = pointerFixture();
    flick.hand.onpointerdown(flick.event(100, 500));
    flick.advance(1030);
    flick.hand.onpointermove(flick.event(100, 470));
    flick.hand.onpointerup(flick.event(100, 470));
    assert.equal(flick.state.plays, 1);
    assert.equal(flick.state.warnings, 0);
});

test("the final flick stroke can span several pointer events", () => {
    const flick = pointerFixture();
    flick.hand.onpointerdown(flick.event(100, 500));
    for (const [time, y] of [[1008, 494], [1016, 488], [1024, 482], [1032, 476], [1040, 470]]) {
        flick.advance(time);
        flick.hand.onpointermove(flick.event(100, y));
    }
    flick.hand.onpointerup(flick.event(100, 470));
    assert.equal(flick.state.plays, 1);
});

test("hover leaves cards level, and cancellation or lost capture clears drag tilt", () => {
    const f = pointerFixture({ desktop: true });
    f.hand.onpointermove(f.event(300, 200));
    assert.equal(f.card.classList.contains("is-tilting"), false);
    f.hand.onpointerleave();
    assert.equal(f.card.classList.contains("is-tilting"), false);
    f.hand.onpointerdown(f.event(100, 500));
    f.hand.onpointermove(f.event(100, 480));
    assert.equal(f.card._dragPreview.properties.get("--tilt-x"), "0deg");
    assert.equal(f.card._dragPreview.properties.get("--tilt-y"), "0deg");
    f.hand.onpointercancel(f.event(100, 480));
    for (const cancel of ["onpointercancel", "onlostpointercapture"]) {
        f.hand.onpointerdown(f.event(100, 500));
        f.hand.onpointermove(f.event(200, 200));
        f.runFrame(1016);
        assert.notEqual(f.card._dragPreview.properties.get("--tilt-x"), "0deg");
        assert.equal(f.body.children.length, 1);
        f.hand[cancel](f.event(200, 200));
        assert.equal(f.body.children.length, 0);
        assert.equal(f.card.classList.contains("is-pressed"), false);
        assert.equal(f.state.plays, 0);
        f.runFrame(1032);
    }
});
