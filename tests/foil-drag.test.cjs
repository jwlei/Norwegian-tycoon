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

test("approved English-named foil treatments match the selected printed appearance", () => {
    const { Card } = fixture().types;
    const css = fs.readFileSync(path.join(__dirname, "..", "css", "foil.css"), "utf8");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const expected = [
        ["holo", "stripes", 30, 75, true, "soft-light"],
        ["galaxy", "stardust", 30, 50, true, "original"],
        ["v", "prism", 20, 75, false, "original"],
        ["vmax", "waves", 0, 100, false, "original"],
        ["vstar", "facets", 30, 75, true, "original"],
        ["full-art", "rings", 20, 75, true, "original"],
        ["trainer-full-art", "weave", 20, 75, true, "original"],
        ["rainbow", "rainbow", 10, 100, true, "original"],
        ["rainbow-alt", "contrast", 30, 100, false, "original"],
        ["gold", "gold-sheen", 30, 100, true, "original"],
        ["radiant", "grid", 20, 100, false, "original"],
        ["gallery-holo", "iridescent", 30, 100, true, "original"],
        ["gallery-v", "pearlescent", 30, 75, true, "original"],
        ["gallery-vmax", "rays", 30, 75, false, "original"]
    ];
    for (const [id, name, reduction, saturation, printed, blend] of expected) {
        assert.equal(Card.foilConfigNames[id], name);
        const treatment = Card.foilTreatment(id);
        assert.equal(treatment.opacityReduction, reduction);
        assert.equal(treatment.saturation, saturation);
        assert.equal(treatment.printedFoil, printed);
        assert.equal(treatment.blend, blend);
        assert.equal(treatment.fullReflection, false);
        const properties = { "--foil-strength": "1", "--foil-saturation": "1" };
        for (const [, selectors, declarations] of rules) {
            if (!selectors.includes(`[data-foil="${id}"]`)) { continue; }
            for (const [, name, value] of declarations.matchAll(/(--foil-[\w-]+):\s*([^;]+);/g)) {
                properties[name] = value.trim();
            }
        }
        assert.ok(Math.abs(Number(properties["--foil-strength"]) - (1 - reduction / 100)) < 1e-10,
            `${name} CSS intensity agrees with the printed configuration`);
        assert.equal(Number(properties["--foil-saturation"]), saturation / 100);
        if (blend !== "original") { assert.equal(properties["--foil-mix"], blend); }
        for (const style of ["normal", "cosmic"]) {
            const card = new Card(2, 12);
            const production = decodeURIComponent(card.toImageDataUri(style, id).split(",")[1]);
            const preview = decodeURIComponent(card.toImageDataUri(style, id, false).split(",")[1]);
            const opacity = Number(production.match(/<g data-foil="[^"]+" opacity="([^"]+)"/)[1]);
            assert.ok(Math.abs(opacity - .23 * (1 - reduction / 100) * Number(printed)) < 1e-10);
            assert.ok(production.includes(`filter:saturate(${saturation / 100})`));
            assert.equal(production.includes("mix-blend-mode:soft-light"), blend === "soft-light");
            assert.match(preview, /<g data-foil="[^"]+" opacity="0.23"/);
            assert.equal(card.toImageDataUri(style, id), Card.imageSource(production),
                "Preview cache entries do not replace production artwork");
        }
    }
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

test("card SVG caching reuses identical artwork and stays bounded across styles and foils", () => {
    const { Card, PresidentCard } = fixture().types;
    const imageSource = Card.imageSource;
    let generated = 0;
    Card.imageSource = svg => { generated++; return imageSource(svg); };
    const first = new PresidentCard(1, 7).toImageDataUri("normal", "galaxy");
    assert.equal(new PresidentCard(1, 7).toImageDataUri("normal", "galaxy"), first);
    assert.equal(generated, 1);
    assert.notEqual(new PresidentCard(1, 7).toImageDataUri("pixel", "galaxy"), first);
    assert.notEqual(new PresidentCard(1, 7).toImageDataUri("normal", "gold"), first);
    assert.notEqual(new PresidentCard(2, 7).toImageDataUri("normal", "galaxy"), first);
    assert.notEqual(new PresidentCard(1, 8).toImageDataUri("normal", "galaxy"), first);
    for (const foil of Card.foilOptions()) {
        for (let suit = 1; suit <= 4; suit++) {
            for (let rank = 1; rank <= 13; rank++) {
                new PresidentCard(suit, rank).toImageDataUri("normal", foil.id);
            }
        }
    }
    assert.ok(Card.imageCache.size <= 256);
    const before = generated;
    assert.equal(new PresidentCard(1, 7).toImageDataUri("normal", "galaxy"), first);
    assert.equal(generated, before + 1, "Evicted artwork is regenerated identically");
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
    let appearanceSaves = 0;
    context.rememberCardAppearanceChoice = () => appearanceSaves++;
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
    assert.equal(appearanceSaves, 1, "foil choices are saved to the player ID");
    assert.equal(preferences.get("CardStyle"), undefined);
    assert.equal(styleUpdates, 1);
    assert.equal(nodes.get("cardFoilCurrentName").textContent, "Rutenett");
    assert.equal(radiant.attributes["aria-pressed"], "true");
    assert.equal(options.children[0].querySelector(".card-foil-option__select").attributes["aria-pressed"], "false");
    assert.deepEqual(dialogs.slice(-2), [["CardFoil", false], ["Settings", true]]);
    gold.onclick();
    assert.equal(preferences.get("CardFoil"), "radiant");
    nodes.get("cardFoilOpenButton").onclick();
    assert.deepEqual(dialogs.slice(-2), [["Settings", false], ["CardFoil", true]]);
    nodes.get("cardFoilCloseButton").onclick();
    assert.deepEqual(dialogs.slice(-2), [["CardFoil", false], ["Settings", true]]);
});

test("foil locks show win requirements, block locked selection and exempt the named players", () => {
    const connection = source("connection.js");
    const start = connection.indexOf("        function isCardFoilUnlocked(");
    const end = connection.indexOf("        function updateCardStyleButtons()", start);
    const context = vm.createContext({
        playerPresidentWins: 0,
        playerWinsName: "Ada", currentPlayerName: "Ada",
        playerWinsLoading: false, playerWinsError: false,
        Card: fixture().types.Card, getPlayerKey: () => "owner"
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

test("the source player ID always unlocks all appearances without depending on name or loaded stats", () => {
    const { context, types } = fixture();
    context.getPlayerKey = () => "source";
    Object.assign(context, {
        playerPresidentWins: 0, playerRoundsPlayed: 0,
        playerWinsName: null, currentPlayerName: "New name",
        playerWinsLoading: true, playerWinsError: true
    });
    const connection = source("connection.js");
    vm.runInContext(connection.slice(connection.indexOf("        function isCardFoilUnlocked("),
        connection.indexOf("        function updateCardStyleButtons()")), context);
    for (const name of ["Ada", "Changed name", ""]) {
        assert.equal(types.Card.hasAllAppearanceUnlocks(name, "source"), true);
        assert.equal(types.Card.hasAllAppearanceUnlocks("source", "owner"), false,
            "The exception is tied to player ID, not display name");
        for (const foil of types.Card.foilOptions()) {
            assert.equal(context.isCardFoilUnlocked(foil.id, name), true, foil.id);
        }
        for (const style of ["botanical", "normal", "gold", "glitched", "cosmic"]) {
            assert.equal(context.isCardStyleUnlocked(style, name), true, style);
            assert.equal(types.Card.normalizeStyle(style, name, "source"), style);
        }
    }
    context.getPlayerKey = () => "owner";
    assert.equal(context.isCardFoilUnlocked("gold", "Ada"), false);
    assert.equal(context.isCardStyleUnlocked("glitched", "Ada"), false);
    context.getPlayerKey = () => "source";
    assert.equal(types.GameLayout.canUseBotanicalStyle(), true);
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
    assert.match(svg, /<g data-foil="holo" opacity="[^"]+" style="[^"]+" clip-path="url\(#card-foil-clip\)">[\s\S]*?<rect x="1\.5" y="1\.5" width="77" height="117"/);
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
    assert.match(css, /\.is-tilting::before,[\s\S]*?opacity: calc\(\.72 \* var\(--foil-strength\)\);/);
});

test("six-second idle foil animates only reflective layers and yields to gestures and reduced motion", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "css", "foil.css"), "utf8");
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(css, /animation: foil-idle-color 6s ease-in-out infinite;/);
    assert.match(css, /animation: foil-idle-reflection 6s ease-in-out infinite;/);
    assert.match(css, /:not\(\.is-tilting,\s*\.card-flight, \.card-discard-flight, \.is-drag-source, \.card-drag-layer \*/);
    for (const name of ["color", "reflection"]) {
        const start = css.indexOf(`@keyframes foil-idle-${name}`);
        const end = css.indexOf("\n}", start);
        const frames = css.slice(start, end);
        assert.match(frames, /0%, 100%/);
        assert.match(frames, /--pointer-x: 46%; --pointer-y: 48%/);
        assert.match(frames, /--pointer-x: 54%; --pointer-y: 52%/);
        assert.doesNotMatch(frames, /transform|filter/);
    }
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

test("four-card pickup and return batch layout reads and avoid repeated scale writes", () => {
    const f = fixture();
    const hand = new Element();
    const events = [];
    let renders = 0;
    f.context.CardDepth = {
        attach(element, render) { assert.equal(render, false); },
        update() { renders++; }, returnToHand() {}
    };
    for (let suit = 1; suit <= 4; suit++) {
        const card = new Element();
        card.className = "game-card";
        card.dataset = { cardKey: `${suit}:5`, cardStyle: "normal", foil: "rainbow" };
        card.getBoundingClientRect = () => { events.push("read"); return bounds; };
        const clone = card.cloneNode.bind(card);
        card.cloneNode = deep => { events.push("clone"); return clone(deep); };
        hand.appendChild(card);
    }
    vm.runInContext('[1,2,3,4].forEach(suit => selectedCardKeys.add(`${suit}:5`))', f.context);
    f.context.startCardDragPreview(hand, { clientX: 100, clientY: 100 });
    assert.deepEqual(events, [...Array(4).fill("read"), ...Array(4).fill("clone")]);
    assert.equal(renders, 4, "Only one initial native render per card");
    const drag = hand._cardDragPreview;
    let scaleWrites = 0;
    drag.previews.forEach(preview => {
        const set = preview.style.setProperty;
        preview.style.setProperty = (name, value) => {
            if (name === "--drag-scale") { scaleWrites++; }
            set(name, value);
        };
    });
    for (let index = 0; index < 20; index++) {
        f.context.moveCardDragPreview(hand, { clientX: 100 + index, clientY: 80 }, 100, 100);
    }
    assert.equal(scaleWrites, 4, "A constant scale is not rewritten on every pointer event");
    assert.equal(f.pendingFrames, 1, "Four cards still share a single tilt frame");
    events.length = 0;
    drag.previews.forEach(preview => {
        preview.getBoundingClientRect = () => { events.push("read"); return bounds; };
        const add = preview.classList.add;
        preview.classList.add = name => { events.push("write"); add(name); };
    });
    f.context.returnCardDragPreview(hand);
    assert.deepEqual(events, [...Array(4).fill("read"), ...Array(4).fill("write")]);
    assert.equal(f.pendingFrames, 0);
    const css = fs.readFileSync(path.join(__dirname, "..", "css", "card-depth.css"), "utf8");
    const dragRule = css.match(/\.card-drag-layer > \.game-card\.has-card-depth\s*\{([^}]+)\}/)[1];
    assert.match(dragRule, /box-shadow:\s*none/);
    assert.match(dragRule, /will-change:\s*transform/);
});

test("velocity tilt lifts the leading edges, clamps and settles all selected cards together", () => {
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
    assert.ok(pitch < 0 && pitch > -18, "dragging up lifts the top edge");
    assert.ok(yaw < 0 && yaw > -18, "dragging right lifts the right edge");
    assert.ok(Math.abs(hand._cardDragPreview.pitch - hand._cardDragPreview.yaw * 0.7) < 1e-10);
    assert.ok(parseFloat(card._dragPreview.properties.get("--pointer-x")) < 50);
    assert.ok(parseFloat(card._dragPreview.properties.get("--pointer-y")) < 50);
    assert.equal(card._dragPreview.classList.contains("is-tilting"), true);
    for (const selected of [second, third]) {
        assert.ok(parseFloat(selected._dragPreview.properties.get("--tilt-x")) < pitch);
        assert.equal(selected._dragPreview.properties.get("--tilt-y"), `${yaw.toFixed(2)}deg`);
        assert.equal(selected._dragPreview.properties.get("--pointer-x"), card._dragPreview.properties.get("--pointer-x"));
        assert.ok(parseFloat(selected._dragPreview.properties.get("--pointer-y")) <
            parseFloat(card._dragPreview.properties.get("--pointer-y")));
    }
    assert.ok(parseFloat(third._dragPreview.properties.get("--tilt-x")) <
        parseFloat(second._dragPreview.properties.get("--tilt-x")));
    f.runFrame(1032);
    assert.ok(Math.abs(hand._cardDragPreview.targetPitch) < 18);
    f.context.moveCardDragPreview(hand, { clientX: -10000, clientY: 10000 }, 100, 100);
    f.runFrame(1048);
    assert.ok(parseFloat(card._dragPreview.properties.get("--tilt-x")) < 0,
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
    assert.ok(Math.abs(pitchForFrameDuration(16) + 7.875) < 1e-10);
    assert.ok(Math.abs(pitchForFrameDuration(32) + 3.9375) < 1e-10);
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
    assert.equal(hand._cardDragPreview, null);
    f.timers.at(-1).callback();
    assert.equal(card._dragPreview, undefined);
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

test("slow drops play only on the board and flicks require 10 pixels at 0.35 pixels per millisecond", () => {
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
    drag.lastFlickDistance = 9;
    drag.lastFlickVelocity = 0.4;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.lastFlickDistance = 10;
    drag.lastFlickVelocity = 0.34;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.lastFlickVelocity = 0.35;
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

function pointerFixture({ desktop = false, valid = true, mode = "flick", blocked = false, catchable = true } = {}) {
    const f = fixture();
    const hand = new Element();
    hand.scrollLeft = 200;
    hand.scrollWidth = 1200;
    hand.clientWidth = 400;
    const card = new Element();
    card.className = "game-card";
    card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
    hand.appendChild(card);
    const player = new f.types.PresidentPlayer("Owner", "owner");
    player.cards.push(new f.types.PresidentCard(1, 5));
    const state = { plays: 0, warnings: 0, scrolls: 0, releaseVelocity: 0 };
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
    context.canPlayCaughtCards = () => catchable;
    context.showInvalidCardWarning = () => state.warnings++;
    context.startCardHandInertia = (element, velocity) => {
        state.scrolls++;
        state.releaseVelocity = velocity;
    };
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

test("mobile Button mode disables drag and flick without changing the selection", () => {
    for (const selected of [false, true]) {
        for (const releaseY of [200, 470]) {
            const f = pointerFixture({ mode: "button" });
            if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
            f.hand.onpointerdown(f.event(100, 500));
            assert.equal(vm.runInContext("selectedCardKeys.size", f.context), selected ? 1 : 0);
            f.advance(1030);
            f.hand.onpointermove(f.event(100, releaseY));
            assert.equal(f.body.children.length, 0, "No card drag preview");
            assert.equal(f.card.classList.contains("is-drag-source"), false);
            f.hand.onpointerup(f.event(100, releaseY));
            assert.equal(f.state.plays, 0);
            assert.equal(f.state.warnings, 0);
            assert.equal(vm.runInContext("selectedCardKeys.size", f.context), selected ? 1 : 0);
        }
    }
});

test("mobile Button mode still allows horizontal hand scrolling", () => {
    const f = pointerFixture({ mode: "button" });
    vm.runInContext('selectedCardKeys.add("1:5")', f.context);
    f.hand.onpointerdown(f.event(100, 500));
    f.advance(1030);
    f.hand.onpointermove(f.event(50, 500));
    f.hand.onpointerup(f.event(50, 500));
    assert.equal(f.hand.scrollLeft, 250);
    assert.equal(f.state.scrolls, 1);
    assert.equal(f.state.plays, 0);
    assert.equal(f.body.children.length, 0);
    assert.equal(vm.runInContext('selectedCardKeys.has("1:5")', f.context), true);
});

test("Both mode allows board drops and upward flicks on mobile and desktop", () => {
    for (const desktop of [false, true]) {
        for (const releaseY of [200, 470]) {
            const f = pointerFixture({ desktop, mode: "both" });
            f.hand.onpointerdown(f.event(100, 500));
            f.advance(releaseY == 200 ? 2000 : 1030);
            f.hand.onpointermove(f.event(100, releaseY));
            assert.equal(f.body.children.length, 1);
            f.hand.onpointerup(f.event(100, releaseY));
            assert.equal(f.state.plays, 1);
            assert.equal(f.state.warnings, 0);
        }
    }
});

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

test("unchanged snapshots preserve the initial deal but a real hand rebuild never restarts it", () => {
    const f = fixture();
    const hand = new Element();
    f.nodes.set("playerHand", hand);
    hand.classList.add("is-dealing-in");
    hand._handSignature = "same";
    hand._rebindHand = () => {};
    f.types.GameLayout.handSignature = () => "same";
    f.types.GameLayout.updateHand({}, {}, null, true);
    assert.equal(hand.classList.contains("is-dealing-in"), true);
    f.types.GameLayout.updateHand(null, null);
    assert.equal(hand.classList.contains("is-dealing-in"), false);
});

test("mouse pickup is immediate, touch waits for direction, and taps or cancellation restore selection", () => {
    for (const desktop of [false, true]) {
        const f = pointerFixture({ desktop });
        f.hand.onpointerdown(f.event(100, 500));
        assert.equal(f.body.children.length, desktop ? 1 : 0);
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

test("short flicks work throughout the upward 130 degree cone on mouse and touch", () => {
    for (const desktop of [false, true]) {
        for (const angle of [-65, -64, -60, -45, 0, 45, 60, 64, 65]) {
            const f = pointerFixture({ desktop });
            const radians = angle * Math.PI / 180;
            const x = 100 + Math.sin(radians) * 13;
            const y = 500 - Math.cos(radians) * 13;
            f.hand.onpointerdown(f.event(100, 500));
            if (!desktop) {
                f.advance(1100);
                f.hand.onpointermove(f.event(100, 480));
                f.advance(1200);
                f.hand.onpointermove(f.event(100, 500));
                f.advance(1300);
                f.hand.onpointermove(f.event(100, 500));
            }
            f.advance(desktop ? 1016 : 1316);
            f.hand.onpointermove(f.event(x, y));
            f.hand.onpointerup(f.event(x, y));
            assert.equal(f.state.plays, 1, `${desktop ? "mouse" : "touch"} at ${angle} degrees`);
            assert.equal(f.state.scrolls, 0);
        }
    }
});

test("mouse and touch accept a gentler flick but reject release strokes outside 130 degrees", () => {
    for (const desktop of [false, true]) {
        const gentle = pointerFixture({ desktop });
        gentle.hand.onpointerdown(gentle.event(100, 500));
        gentle.advance(1050);
        gentle.hand.onpointermove(gentle.event(100, 482));
        gentle.hand.onpointerup(gentle.event(100, 482));
        assert.equal(gentle.state.plays, 1, "360 px/s is above the reduced speed threshold");
        for (const angle of [-80, -70, -65.1, 65.1, 70, 80]) {
            const f = pointerFixture({ desktop });
            f.hand.onpointerdown(f.event(100, 500));
            f.advance(1100);
            f.hand.onpointermove(f.event(100, 480));
            f.advance(1300);
            f.hand.onpointermove(f.event(100, 480));
            const radians = angle * Math.PI / 180;
            const x = 100 + Math.sin(radians) * 30;
            const y = 480 - Math.cos(radians) * 30;
            f.advance(1330);
            f.hand.onpointermove(f.event(x, y));
            f.hand.onpointerup(f.event(x, y));
            assert.equal(f.state.plays, 0, `Reject ${angle} degrees after pickup`);
        }
    }
});

test("touch pickup accepts the full initial 130-degree cone from the contact point", () => {
    for (const selected of [false, true]) {
        for (const angle of [-65, -64, -60, -45, 0, 45, 60, 64, 65]) {
            const f = pointerFixture();
            if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
            const radians = angle * Math.PI / 180;
            const x = 200 + Math.sin(radians) * 20;
            const y = 500 - Math.cos(radians) * 20;
            f.hand.onpointerdown(f.event(200, 500));
            f.advance(1030);
            f.hand.onpointermove(f.event(x, y));
            assert.equal(f.body.children.length, 1, `Pickup ${angle}/${selected}`);
            assert.equal(f.hand.classList.contains("is-hand-dragging"), false);
            f.hand.onpointerup(f.event(x, y));
            assert.equal(f.state.plays, 1, `Flick ${angle}/${selected}`);
            assert.equal(f.state.scrolls, 0);
        }
    }
});

test("touch strokes in the gap between pickup and horizontal scrolling remain undecided", () => {
    for (const angle of [-74.5, -70, -65.1, 65.1, 70, 74.5]) {
        const f = pointerFixture();
        const radians = angle * Math.PI / 180;
        f.hand.onpointerdown(f.event(200, 500));
        f.advance(1030);
        f.hand.onpointermove(f.event(200 + Math.sin(radians) * 30, 500 - Math.cos(radians) * 30));
        assert.equal(f.body.children.length, 0);
        assert.equal(f.hand.classList.contains("is-hand-dragging"), false);
        f.hand.onpointerup(f.event(200 + Math.sin(radians) * 30, 500 - Math.cos(radians) * 30));
        assert.equal(f.state.plays, 0);
        assert.equal(f.state.scrolls, 0);
    }
});
test("touch strokes outside the pickup cone scroll near horizontal in either direction", () => {
    for (const selected of [false, true]) {
        for (const angle of [-105, -104, -90, -80, -75, 75, 80, 90, 104, 105]) {
            const f = pointerFixture();
            if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
            const radians = angle * Math.PI / 180;
            const x = 200 + Math.sin(radians) * 30;
            const y = 500 - Math.cos(radians) * 30;
            f.hand.onpointerdown(f.event(200, 500));
            f.advance(1030);
            f.hand.onpointermove(f.event(x, y));
            assert.equal(f.body.children.length, 0);
            assert.equal(f.hand.classList.contains("is-hand-dragging"), true, `${angle}/${selected}`);
            f.hand.onpointerup(f.event(x, y));
            assert.equal(f.state.plays, 0);
            assert.equal(f.state.scrolls, 1);
        }
    }
});

test("initial touch jitter stays undecided and slow diagonal pickup does not auto-play", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(f.event(200, 500));
    f.advance(1010);
    f.hand.onpointermove(f.event(206, 498));
    assert.equal(f.body.children.length, 0);
    assert.equal(f.hand.classList.contains("is-hand-dragging"), false);
    f.advance(1500);
    f.hand.onpointermove(f.event(225, 488));
    assert.equal(f.body.children.length, 1);
    f.hand.onpointerup(f.event(225, 488));
    assert.equal(f.state.plays, 0);
    assert.equal(f.state.scrolls, 0);
});

test("flicks outside the cone, too short, too slow, held or in button mode never play off-board", () => {
    for (const desktop of [false, true]) {
        for (const [angle, distance, duration, mode, hold] of [
            [-81, 40, 30, "flick", 0], [81, 40, 30, "flick", 0],
            [-90, 40, 30, "flick", 0], [90, 40, 30, "flick", 0],
            [180, 40, 30, "flick", 0], [0, 9, 16, "flick", 0],
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

test("horizontal touch strokes over selected and unselected cards scroll and preserve selection", () => {
    const drag = pointerFixture();
    vm.runInContext('selectedCardKeys.add("1:5")', drag.context);
    drag.hand.onpointerdown(drag.event(100, 500));
    drag.hand.onpointermove(drag.event(104, 488));
    assert.equal(drag.body.children.length, 1);
    assert.equal(drag.hand.classList.contains("is-hand-dragging"), false);
    drag.hand.onpointerup(drag.event(112, 492));

    for (const selected of [false, true]) {
        const sideways = pointerFixture();
        if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', sideways.context); }
        sideways.hand.onpointerdown(sideways.event(100, 500));
        assert.equal(sideways.body.children.length, 0, "Touch must not grab before direction is known");
        sideways.hand.onpointermove(sideways.event(150, 501));
        assert.equal(sideways.body.children.length, 0);
        assert.equal(sideways.hand.classList.contains("is-hand-dragging"), true);
        assert.equal(vm.runInContext('selectedCardKeys.has("1:5")', sideways.context), selected);
        sideways.hand.onpointerup(sideways.event(150, 501));
        assert.equal(sideways.state.scrolls, 1);
        assert.equal(sideways.state.plays, 0);
    }
});

test("a scrolling stroke cannot turn into an accidental play when the finger moves up on release", () => {
    for (const selected of [false, true]) {
        const f = pointerFixture();
        if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
        f.hand.onpointerdown(f.event(200, 500));
        f.advance(1020);
        f.hand.onpointermove(f.event(160, 498));
        f.advance(1040);
        f.hand.onpointerup(f.event(150, 200));
        assert.equal(f.state.plays, 0);
        assert.equal(f.state.scrolls, 1);
        assert.equal(vm.runInContext('selectedCardKeys.has("1:5")', f.context), selected);
    }
});

test("fast scrolling momentum keeps its direction despite a tiny release recoil", () => {
    for (const direction of [-1, 1]) {
        const f = pointerFixture();
        f.hand.onpointerdown(f.event(200, 500));
        for (const [time, distance] of [[1016, 30], [1032, 70], [1048, 120], [1049, 119]]) {
            f.advance(time);
            f.hand.onpointermove(f.event(200 + distance * direction, 500));
        }
        f.hand.onpointerup(f.event(200 + 119 * direction, 500));
        assert.equal(Math.sign(f.state.releaseVelocity), -direction);
        assert.ok(Math.abs(f.state.releaseVelocity) > 1);
        assert.equal(f.state.plays, 0);
    }
});

test("intentional scroll reversals follow the recent stroke instead of the original direction", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(f.event(200, 500));
    for (const [time, x] of [[1020, 160], [1040, 120], [1080, 150], [1120, 190], [1140, 220]]) {
        f.advance(time);
        f.hand.onpointermove(f.event(x, 500));
    }
    f.hand.onpointerup(f.event(220, 500));
    assert.ok(f.state.releaseVelocity < 0);
    assert.equal(f.state.plays, 0);
});

test("dragging back from a scroll boundary responds immediately without an overscroll dead zone", () => {
    const f = pointerFixture();
    f.hand.scrollLeft = 10;
    f.hand.onpointerdown(f.event(200, 500));
    f.advance(1020);
    f.hand.onpointermove(f.event(250, 500));
    assert.equal(f.hand.scrollLeft, 0);
    f.advance(1040);
    f.hand.onpointermove(f.event(270, 500));
    assert.equal(f.hand.scrollLeft, 0);
    f.advance(1060);
    f.hand.onpointermove(f.event(260, 500));
    assert.equal(f.hand.scrollLeft, 10);
    f.hand.onpointerup(f.event(260, 500));
    assert.ok(f.state.releaseVelocity > 0);
});

test("holding after scrolling decays momentum instead of keeping the fast swipe speed", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(f.event(200, 500));
    f.advance(1020);
    f.hand.onpointermove(f.event(150, 500));
    f.advance(1700);
    f.hand.onpointermove(f.event(150, 500));
    f.hand.onpointerup(f.event(150, 500));
    assert.ok(Math.abs(f.state.releaseVelocity) < 0.04);
});

test("touching the hand cancels queued auto-centering before it can fight a manual swipe", () => {
    for (const method of ["centerHandSelection", "scrollHandCardsIntoView"]) {
        for (const cancel of [false, true]) {
            const f = fixture();
            const hand = new Element();
            hand.scrollLeft = 100;
            hand.scrollWidth = 1200;
            hand.clientWidth = 400;
            const card = new Element();
            card.dataset.cardKey = "1:5";
            card.bounds = { left: -40, right: 40, top: 0, bottom: 120, width: 80, height: 120 };
            hand.querySelectorAll = () => [card];
            let animations = 0;
            f.context.window.requestAnimationFrame = f.context.requestAnimationFrame;
            f.context.animateHandScroll = () => animations++;
            vm.runInContext(`selectedCardOwner = "room:owner";
                autoSelectedTurnKey = "turn"; autoScrollEmptyTurnKey = "turn";`, f.context);
            f.types.GameLayout[method](hand, "room:owner", ["1:5"], "turn");
            f.runFrame(1000);
            if (cancel) { f.context.stopCardHandInertia(); }
            f.runFrame(1016);
            assert.equal(animations, cancel ? 0 : 1, `${method}/${cancel}`);
        }
    }
});

test("auto-scroll scales duration with distance without throttling animation frames", () => {
    for (const [distance, duration] of [[24, 180], [60, Math.sqrt(42000)], [700, 700], [1000, 700]]) {
        for (const direction of [-1, 1]) {
            const f = fixture();
            const hand = new Element();
            hand.scrollLeft = 1200;
            const target = 1200 + distance * direction;
            f.context.animateHandScroll(hand, target);
            f.runFrame(1000);
            f.runFrame(1000 + duration / 2);
            assert.ok(Math.abs(hand.scrollLeft - (1200 + distance * direction / 2)) < 1e-6);
            assert.equal(f.pendingFrames, 1);
            f.runFrame(1000 + duration + 0.001);
            assert.equal(hand.scrollLeft, target);
            assert.equal(f.pendingFrames, 0);
        }
    }
});

test("auto-scroll still honors explicit durations, reduced motion and manual cancellation", () => {
    const f = fixture();
    const hand = new Element();
    hand.scrollLeft = 0;
    f.context.animateHandScroll(hand, 60, 700);
    f.runFrame(1000);
    f.runFrame(1350);
    assert.equal(hand.scrollLeft, 30);
    f.context.stopCardHandInertia();
    assert.equal(f.pendingFrames, 0);
    f.runFrame(1700);
    assert.equal(hand.scrollLeft, 30);
    f.reducedMotion = true;
    f.context.animateHandScroll(hand, 60);
    assert.equal(hand.scrollLeft, 60);
    assert.equal(f.pendingFrames, 0);
});

test("scroll inertia advances monotonically and stops at the hand boundary without bouncing", () => {
    for (const direction of [-1, 1]) {
        const f = fixture();
        const hand = new Element();
        hand.scrollLeft = 200;
        hand.scrollWidth = 800;
        hand.clientWidth = 400;
        f.context.startCardHandInertia(hand, direction * 2);
        let previous = hand.scrollLeft;
        for (let time = 1000; time < 2500; time += 16) {
            f.runFrame(time);
            assert.ok((hand.scrollLeft - previous) * direction >= 0);
            assert.ok(hand.scrollLeft >= 0 && hand.scrollLeft <= 400);
            previous = hand.scrollLeft;
        }
        assert.equal(hand.scrollLeft, direction > 0 ? 400 : 0);
        assert.equal(f.pendingFrames, 0);
    }
});

test("mouse sideways pickup still drags cards instead of scrolling the hand", () => {
    const f = pointerFixture({ desktop: true });
    f.hand.onpointerdown(f.event(100, 500));
    f.advance(1030);
    f.hand.onpointermove(f.event(160, 502));
    assert.equal(f.hand.classList.contains("is-hand-dragging"), false);
    assert.equal(f.body.children.length, 1);
    f.hand.onpointerup(f.event(160, 502));
    assert.equal(f.state.scrolls, 0);
    assert.equal(f.state.plays, 0);
});

test("shorter gentler upward flicks play, including movement first reported at pointerup", () => {
    for (const desktop of [false, true]) {
        for (const releaseOnly of [false, true]) {
            const f = pointerFixture({ desktop });
            f.hand.onpointerdown(f.event(100, 500));
            f.advance(1025);
            if (!releaseOnly) { f.hand.onpointermove(f.event(100, 489)); }
            f.hand.onpointerup(f.event(100, 489));
            assert.equal(f.state.plays, 1, `${desktop}/${releaseOnly}`);
            assert.equal(f.state.scrolls, 0);
        }
    }
});

test("a qualifying flick survives a tiny recoil or brief slowdown as the finger lifts", () => {
    for (const desktop of [false, true]) {
        for (const finish of ["recoil", "slowdown"]) {
            const f = pointerFixture({ desktop });
            f.hand.onpointerdown(f.event(200, 500));
            f.advance(1020);
            f.hand.onpointermove(f.event(200, 484));
            f.advance(1040);
            f.hand.onpointermove(f.event(200, 468));
            f.advance(finish == "recoil" ? 1056 : 1072);
            const y = finish == "recoil" ? 469 : 467;
            f.hand.onpointermove(f.event(200, y));
            f.hand.onpointerup(f.event(200, y));
            assert.equal(f.state.plays, 1, `${desktop}/${finish}`);
        }
    }
});

test("direct touch flicks tolerate jitter before the minimum stroke has been recognized", () => {
    for (const angle of [-64, -60, 0, 60, 64]) {
        for (const selected of [false, true]) {
            const f = pointerFixture();
            if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
            const radians = angle * Math.PI / 180;
            f.hand.onpointerdown(f.event(200, 500));
            for (const [time, distance, jitter] of [
                [1008, 6, 0], [1012, 6, 1], [1020, 14, 0]
            ]) {
                f.advance(time);
                f.hand.onpointermove(f.event(200 + Math.sin(radians) * distance,
                    500 - Math.cos(radians) * distance + jitter));
            }
            f.hand.onpointerup(f.event(200 + Math.sin(radians) * 14,
                500 - Math.cos(radians) * 14));
            assert.equal(f.state.plays, 1, `${angle}/${selected}`);
            assert.equal(f.state.scrolls, 0);
        }
    }
});

test("direct flick recognition keeps the same minimum speed despite early jitter", () => {
    for (const speed of [0.2, 0.3, 0.45, 0.8]) {
        const f = pointerFixture();
        f.hand.onpointerdown(f.event(200, 500));
        for (const [distance, jitter] of [[6, 0], [6, 1], [14, 0]]) {
            f.advance(1000 + distance / speed + jitter * 4);
            f.hand.onpointermove(f.event(200, 500 - distance + jitter));
        }
        f.hand.onpointerup(f.event(200, 486));
        assert.equal(f.state.plays, speed >= 0.4 ? 1 : 0, `${speed}px/ms`);
    }
});

test("small reverse steps before recognition accumulate and cancel the original stroke", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(f.event(200, 500));
    for (const [time, y] of [[1010, 492], [1020, 493], [1030, 494], [1040, 495], [1050, 496]]) {
        f.advance(time);
        f.hand.onpointermove(f.event(200, y));
    }
    f.hand.onpointerup(f.event(200, 496));
    assert.equal(f.state.plays, 0);
});

test("lift-off recoil tolerance works across touch flick angles and selected cards", () => {
    for (const angle of [-64, -45, 0, 45, 64]) {
        for (const selected of [false, true]) {
            const f = pointerFixture();
            if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
            const radians = angle * Math.PI / 180;
            const x = 200 + Math.sin(radians) * 24;
            const y = 500 - Math.cos(radians) * 24;
            f.hand.onpointerdown(f.event(200, 500));
            f.advance(1030);
            f.hand.onpointermove(f.event(x, y));
            f.advance(1046);
            f.hand.onpointerup(f.event(x, y + 1));
            assert.equal(f.state.plays, 1, `${angle}/${selected}`);
            assert.equal(f.state.scrolls, 0);
        }
    }
});

test("a recent flick is cancelled by deliberate downward or sideways movement, or holding", () => {
    for (const [dx, dy, releaseTime] of [[0, 6, 1060], [20, 0, 1060], [0, 0, 1161]]) {
        const f = pointerFixture();
        f.hand.onpointerdown(f.event(200, 500));
        f.advance(1020);
        f.hand.onpointermove(f.event(200, 484));
        f.advance(1040);
        f.hand.onpointermove(f.event(200, 468));
        f.advance(releaseTime);
        f.hand.onpointerup(f.event(200 + dx, 468 + dy));
        assert.equal(f.state.plays, 0, `${dx}/${dy}/${releaseTime}`);
    }
});

test("small successive movements cannot renew or accumulate past the flick recoil tolerance", () => {
    for (const finish of ["reverse", "expire"]) {
        const f = pointerFixture();
        f.hand.onpointerdown(f.event(200, 500));
        f.advance(1030);
        f.hand.onpointermove(f.event(200, 476));
        let y = 476;
        const times = finish == "reverse" ? [1040, 1050, 1060, 1070] : [1080, 1130, 1180];
        for (const time of times) {
            y += finish == "reverse" ? 1 : 0.5;
            f.advance(time);
            f.hand.onpointermove(f.event(200, y));
        }
        f.hand.onpointerup(f.event(200, y));
        assert.equal(f.state.plays, 0, finish);
    }
});

test("a circular pickup can finish with a short upward flick anywhere below the table", () => {
    for (const desktop of [false, true]) {
        for (const selected of [false, true]) {
            for (const x of [5, 200, 395]) {
                const f = pointerFixture({ desktop });
                if (selected) { vm.runInContext('selectedCardKeys.add("1:5")', f.context); }
                f.hand.onpointerdown(f.event(x, 500));
                f.advance(1050);
                f.hand.onpointermove(f.event(x, 488));
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

test("a card can be held for many seconds before finishing with an upward flick", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(f.event(200, 500));
    f.advance(1100);
    f.hand.onpointermove(f.event(200, 480));
    f.advance(10000);
    f.hand.onpointermove(f.event(200, 480));
    f.advance(10020);
    f.hand.onpointermove(f.event(200, 468));
    f.hand.onpointerup(f.event(200, 468));
    assert.equal(f.state.plays, 1);
});

test("resuming movement after a long hold needs no new pickup or drag deadline reset", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(f.event(200, 500));
    f.advance(1100);
    f.hand.onpointermove(f.event(200, 480));
    f.advance(10000);
    f.hand.onpointermove(f.event(200, 470));
    f.advance(10020);
    f.hand.onpointermove(f.event(200, 458));
    f.hand.onpointerup(f.event(200, 458));
    assert.equal(f.state.plays, 1);
});
test("recent flick detection is consistent across pointer sampling rates at the new speed threshold", () => {
    for (const interval of [4, 8, 16, 32]) {
        for (const speed of [0.3, 0.45, 0.75]) {
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
            assert.equal(f.state.plays, speed >= 0.4 ? 1 : 0, `${interval}ms/${speed}px/ms`);
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

function roundStartHandFixture({ serverOffset = 0, mode = "button" } = {}) {
    const f = fixture();
    f.preferences.set("PlayInputMode", mode);
    f.context.navigator = {};
    f.context.window.requestAnimationFrame = () => 0;
    const shared = source("shared.js");
    vm.runInContext(shared.slice(shared.indexOf("function hasClass("), shared.indexOf("function generatePlayerKey(")), f.context);
    f.context.Element.prototype.focus = function () {};
    const hand = new Element();
    Object.defineProperty(hand, "innerHTML", { set() { this.children = []; }, get() { return ""; } });
    f.nodes.set("playerHand", hand);
    vm.runInContext(`GamePresence.serverOffset = ${serverOffset};`, f.context);
    const { PresidentGame, PresidentPlayer, PresidentCard, GameLayout } = f.types;
    const player = new PresidentPlayer("Owner", "owner");
    player.turn = 1;
    player.cards.push(new PresidentCard(1, 4), new PresidentCard(2, 4), new PresidentCard(3, 9));
    const other = new PresidentPlayer("Other", "other");
    other.cards.push(new PresidentCard(4, 5));
    const plays = [];
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "room", status: "S", round: 1, turn: 0, players: [player, other], piles: [],
        rules: {}, controllers: {}, connectionOnline: true, localWritePending: false,
        turnPause: null, exchangeReady: null, shuffleStartedAt: null
    });
    game.playCards = (actor, pile) => plays.push(Array.from(pile, card => `${card.suit}:${card.rank}`));
    const cards = () => hand.children.filter(card => card.classes.has("game-card"));
    const selected = () => cards().filter(card => card.classes.has("is-selected")).map(card => card.dataset.cardKey);
    const render = () => GameLayout.updatePlayerView(game, player);
    return { ...f, hand, game, player, plays, cards, selected, render,
        playButton: f.context.document.getElementById("playButton"),
        set now(value) { f.now = value; } };
}

test("the first move unlocks as soon as the shuffle presentation ends, whatever the local clock skew", () => {
    for (const serverOffset of [-1500, -400, 0, 400, 1500]) {
        const f = roundStartHandFixture({ serverOffset });
        // The host stamps the shuffle with the shared session clock; this client's local clock may differ.
        f.game.shuffleStartedAt = 10000;
        let revealedAt = null;
        for (let local = 10000 - serverOffset; local <= 14000 - serverOffset; local += 50) {
            f.now = local;
            f.render();
            if (f.cards().length > 0) { revealedAt = local; break; }
        }
        assert.notEqual(revealedAt, null, `offset ${serverOffset}`);
        assert.equal(f.game.isTurnPaused(), false, `offset ${serverOffset}`);
        assert.ok(f.cards().every(card => card.disabled === false), `offset ${serverOffset}: cards stay selectable`);
        assert.deepEqual(f.selected().sort(), ["1:4", "2:4"], "Auto-suggest picks the lowest pair");
        assert.equal(f.playButton.disabled, false);
        f.playButton.onclick();
        assert.deepEqual(f.plays, [["1:4", "2:4"]], `offset ${serverOffset}: the suggestion is playable without toggling`);
    }
});

test("auto-suggested round starts keep manual choice and refresh the play button after a pending write", () => {
    const f = roundStartHandFixture();
    f.now = 50000;
    f.game.exchangeReady = { id: "gate" };
    f.render();
    assert.ok(f.cards().every(card => card.disabled), "The exchange summary gate still pauses play");
    f.game.exchangeReady = null;
    f.game.localWritePending = true;
    f.render();
    assert.deepEqual(f.selected().sort(), ["1:4", "2:4"]);
    assert.equal(f.playButton.disabled, true, "A pending write blocks the play button");
    f.game.localWritePending = false;
    f.render();
    assert.equal(f.playButton.disabled, false, "Write completion without card changes re-enables play");
    const nine = f.cards().find(card => card.dataset.cardKey == "3:9");
    nine.onclick();
    assert.deepEqual(f.selected(), ["3:9"]);
    for (let snapshot = 0; snapshot < 3; snapshot++) {
        f.render();
        assert.deepEqual(f.selected(), ["3:9"], "Repeated snapshots do not reapply the suggestion");
    }
    f.game.localWritePending = true;
    f.render();
    f.game.localWritePending = false;
    f.render();
    assert.deepEqual(f.selected(), ["3:9"]);
    assert.equal(f.playButton.disabled, false);
    f.playButton.onclick();
    assert.deepEqual(f.plays, [["3:9"]]);
});

test("quick flicks use input timestamps and coalesced samples, so handler delays cannot drop them", () => {
    for (const coalesced of [false, true]) {
        const f = pointerFixture();
        const timed = (x, y, timeStamp, extra = {}) => Object.assign(f.event(x, y), { timeStamp }, extra);
        f.hand.onpointerdown(timed(100, 500, 1000));
        // Building the drag preview stalls the main thread; the events arrive late.
        f.advance(1150);
        const samples = [timed(100, 490, 1010), timed(100, 480, 1020), timed(100, 470, 1030)];
        f.hand.onpointermove(timed(100, 470, 1030,
            coalesced ? { getCoalescedEvents: () => samples } : {}));
        f.advance(1160);
        f.hand.onpointerup(timed(100, 470, 1035));
        assert.equal(f.state.plays, 1, `coalesced: ${coalesced}`);
    }
    const held = pointerFixture();
    const timed = (x, y, timeStamp) => Object.assign(held.event(x, y), { timeStamp });
    held.hand.onpointerdown(timed(100, 500, 1000));
    held.advance(1040);
    held.hand.onpointermove(timed(100, 470, 1030));
    held.advance(1400);
    held.hand.onpointerup(timed(100, 470, 1390));
    assert.equal(held.state.plays, 0, "A real hold before release is still not a flick");
});

test("a flick from a non-primary touch still plays, but a second finger cannot hijack a gesture", () => {
    const f = pointerFixture();
    f.hand.onpointerdown(Object.assign(f.event(100, 500, 2), { isPrimary: false }));
    f.advance(1025);
    f.hand.onpointerdown(f.event(300, 500, 3));
    f.hand.onpointermove(f.event(100, 475, 2));
    f.hand.onpointerup(f.event(100, 475, 2));
    assert.equal(f.state.plays, 1);
});

test("a card sliding back keeps gliding while an uncaught gesture or hand rebuild starts", () => {
    const f = pointerFixture({ catchable: false });
    f.hand.onpointerdown(f.event(100, 500));
    f.advance(2500);
    f.hand.onpointermove(f.event(100, 400));
    f.hand.onpointerup(f.event(100, 400));
    assert.equal(f.hand._cardDragPreview, null, "The returning preview is detached from the hand");
    assert.equal(f.body.children.length, 1);
    const returning = f.body.children[0];
    assert.equal(returning.children[0].classList.contains("is-returning"), true);
    const returnTimer = f.timers.at(-1);
    f.hand.onpointerdown(f.event(100, 500));
    f.context.clearCardDragPreview(f.hand);
    assert.equal(f.body.children.includes(returning), true, "Neither a new press nor a rebuild clears it");
    f.advance(2510);
    f.hand.onpointermove(f.event(100, 460));
    const preview = f.hand._cardDragPreview;
    assert.equal(preview.returning, false);
    assert.equal(f.body.children.length, 2);
    returnTimer.callback();
    assert.equal(f.body.children.includes(returning), false, "It removes itself once it has landed");
    assert.equal(f.hand._cardDragPreview, preview, "The old return timer must not clear the new drag");
    assert.equal(f.card._dragPreview, preview.previews[0]);
    assert.equal(f.card.classList.contains("is-drag-source"), true);
});

test("snapshot refreshes during a hand gesture are deferred instead of cancelling the drag", () => {
    const f = fixture();
    const hand = new Element();
    f.nodes.set("playerHand", hand);
    const game = { id: "room" };
    const player = { name: "Owner" };
    let rebinds = 0;
    let cancels = 0;
    hand._handSignature = "before";
    hand._rebindHand = () => rebinds++;
    hand._handOwner = "room:Owner";
    hand._handGestureActive = () => true;
    hand.onpointercancel = () => cancels++;
    f.types.GameLayout.handSignature = () => "after";
    f.types.GameLayout.updateHand(game, player, null, true);
    assert.equal(rebinds, 1);
    assert.equal(cancels, 0);
    assert.equal(hand._deferredHandUpdate.game, game);
    assert.equal(hand._deferredHandUpdate.player, player);

    const pointer = pointerFixture();
    const updates = [];
    pointer.types.GameLayout.updateHand = (...args) => updates.push(args);
    pointer.hand.onpointerdown(pointer.event(100, 500));
    assert.equal(pointer.hand._handGestureActive(), true);
    pointer.hand._deferredHandUpdate = { game, player };
    pointer.advance(1025);
    pointer.hand.onpointermove(pointer.event(100, 475));
    pointer.hand.onpointerup(pointer.event(100, 475));
    assert.equal(pointer.state.plays, 1);
    assert.equal(pointer.hand._handGestureActive(), false);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][0], game);
    assert.equal(updates[0][1], player);
    assert.equal(updates[0][3], true);
    assert.equal(pointer.hand._deferredHandUpdate, null);
});

function missedReturn(options = {}) {
    const f = pointerFixture(options);
    f.hand.onpointerdown(f.event(100, 500));
    f.advance(2500);
    f.hand.onpointermove(f.event(100, 400));
    f.hand.onpointerup(f.event(100, 400));
    const layer = f.body.children[0];
    const preview = layer.children[0];
    const timer = f.timers.at(-1);
    // Mid-glide: 40% of the 100 px offset is left.
    preview.bounds = { left: 0, top: -40, right: 400, bottom: 260, width: 400, height: 300 };
    const press = (x, y, target = preview) => Object.assign(f.event(x, y), { target });
    return { ...f, layer, preview, timer, press };
}

test("grabbing a card while it glides back catches the same preview without a second copy", () => {
    const f = missedReturn();
    const drag = f.hand._returningCardDrag;
    assert.equal(drag.returning, true);
    assert.equal(f.preview.classList.contains("is-returning"), true);
    f.layer.onpointerdown(f.press(100, 460));
    assert.equal(f.hand._cardDragPreview, drag);
    assert.equal(f.hand._returningCardDrag, null);
    assert.equal(drag.returning, false);
    assert.equal(f.body.children.length, 1, "No second copy is created");
    assert.equal(f.preview.classList.contains("is-returning"), false);
    assert.equal(f.preview.properties.get("--drag-offset-y"), "-40px");
    assert.equal(f.card.classList.contains("is-drag-source"), true);
    f.timer.callback();
    assert.equal(f.body.children.length, 1, "The old glide timer never removes a caught card");
    assert.equal(f.hand._cardDragPreview, drag);
});

test("a caught card follows the finger from where it was caught and can still be flicked", () => {
    const f = missedReturn();
    f.layer.onpointerdown(f.press(100, 460));
    f.advance(2510);
    f.hand.onpointermove(f.press(100, 450));
    assert.equal(f.preview.properties.get("--drag-offset-y"), "-50px", "No jump back to the hand");
    f.advance(2530);
    f.hand.onpointermove(f.press(100, 425));
    f.hand.onpointerup(f.press(100, 425));
    assert.equal(f.state.plays, 1);
    assert.equal(f.body.children.length, 0);
});

test("pressing the empty hand slot catches the gliding card too", () => {
    const f = missedReturn();
    const drag = f.hand._returningCardDrag;
    f.hand.onpointerdown(f.press(100, 500, f.card));
    assert.equal(f.hand._cardDragPreview, drag);
    assert.equal(f.body.children.length, 1);
    assert.equal(f.preview.properties.get("--drag-offset-y"), "-40px");
});

test("a re-released caught card glides back again and only its newest timer removes it", () => {
    const f = missedReturn();
    f.layer.onpointerdown(f.press(100, 460));
    f.advance(3500);
    f.hand.onpointermove(f.press(100, 400));
    f.hand.onpointerup(f.press(100, 400));
    assert.equal(f.preview.classList.contains("is-returning"), true);
    const newer = f.timers.at(-1);
    assert.notEqual(newer, f.timer);
    f.timer.callback();
    assert.equal(f.body.children.length, 1);
    newer.callback();
    assert.equal(f.body.children.length, 0);
    assert.equal(f.hand._returningCardDrag, null);
});

test("unplayable or vanished cards are not caught and keep gliding back", () => {
    const unplayable = missedReturn({ catchable: false });
    unplayable.layer.onpointerdown(unplayable.press(100, 460));
    assert.equal(unplayable.hand._cardDragPreview, null);
    assert.equal(unplayable.preview.classList.contains("is-returning"), true);
    unplayable.hand.onpointerup(unplayable.press(100, 460));
    unplayable.timer.callback();
    assert.equal(unplayable.body.children.length, 0);

    const rebuilt = missedReturn();
    rebuilt.hand.children = [];
    rebuilt.layer.onpointerdown(rebuilt.press(100, 460));
    assert.equal(rebuilt.hand._cardDragPreview, null);
    assert.equal(rebuilt.preview.classList.contains("is-returning"), true);
    rebuilt.timer.callback();
    assert.equal(rebuilt.body.children.length, 0);
});
