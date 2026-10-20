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
    closest(selector) { return selector == ".game-card" ? this : null; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
        if (selector == "*") { return descendants; }
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
            body, createElement: () => new Element(), addEventListener() {},
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
        ["none", "holo", "galaxy", "v", "vmax", "vstar", "full-art", "trainer-full-art",
            "radiant", "rainbow-alt", "gallery-holo", "gallery-v", "gallery-vmax", "rainbow", "gold"]);
    assert.deepEqual([1, 2, 5, 10, 15].map(wins =>
        types.Card.foilOptions().filter(option => types.Card.foilUnlockWins(option.id) == wins).length
    ), [3, 2, 3, 2, 2]);
    assert.equal(types.Card.foilUnlockWins("rainbow"), 20);
    assert.equal(types.Card.foilUnlockWins("gold"), 20);
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

test("the foil selector persists independently, updates previews and never registers card-style actions", () => {
    const { context, preferences, nodes } = fixture();
    const dialogs = [];
    context.currentGame = null;
    context.currentPlayerName = null;
    context.localizedMessage = text => text;
    context.readLastUsedPlayerName = () => "Ada";
    context.playerPresidentWins = 5;
    context.playerStatsSubscription = null;
    context.firebase = {
        database: () => ({
            ref(path) {
                assert.equal(path, "playerStats/owner");
                return { on(event, listener) { listener({ val: () => ({ presidentWins: 5 }) }); } };
            }
        })
    };
    context.showDialog = (...args) => dialogs.push(args);
    let styleUpdates = 0;
    context.updateCardStyleButtons = () => styleUpdates++;
    context.updateCardAppearancePreview = () => {};
    const connection = source("connection.js");
    const helperStart = connection.indexOf("        function bindCardPreviewTilt(wrapper)");
    vm.runInContext(connection.slice(helperStart,
        connection.indexOf("        function updateCardAppearancePreview()", helperStart)), context);
    const watcherStart = connection.indexOf("        function watchPlayerPresidentWins()");
    const watcherEnd = connection.indexOf("        function updateCardStyleButtons()", watcherStart);
    vm.runInContext(connection.slice(watcherStart, watcherEnd), context);
    const start = connection.indexOf("        function updateCardFoilButtons()");
    const end = connection.indexOf('        document.getElementById("hideToastsToggleButton")', start);
    vm.runInContext(connection.slice(start, end), context);
    const options = nodes.get("cardFoilOptions");
    assert.equal(options.childElementCount, 15);
    assert.ok(options.children.every(button => button.querySelectorAll(".card-preview").length == 1));
    assert.deepEqual(options.children.slice(0, 5).map(button => button.dataset.cardFoil),
        ["none", "holo", "galaxy", "v", "vmax"]);
    assert.equal(nodes.get("cardFoilWins").textContent, "Your wins: 5");
    const gold = options.children.find(button => button.dataset.cardFoil == "gold");
    assert.equal(gold.disabled, true);
    assert.equal(gold.querySelector(".card-foil-option__unlock").textContent,
        "Krever 20 seire");
    const radiant = options.children.find(child => child.dataset.cardFoil == "radiant");
    assert.equal(radiant.classList.contains("card-style-option"), false);
    radiant.onclick();
    assert.equal(preferences.get("CardFoil"), "radiant");
    assert.equal(preferences.get("CardStyle"), undefined);
    assert.equal(styleUpdates, 1);
    assert.equal(nodes.get("cardFoilCurrentName").textContent, "Rutenett");
    assert.equal(radiant.attributes["aria-pressed"], "true");
    assert.equal(options.children[0].attributes["aria-pressed"], "false");
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
        Card: fixture().types.Card
    });
    vm.runInContext(connection.slice(start, end), context);
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), false);
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), false);
    context.playerPresidentWins = 1;
    assert.equal(context.isCardFoilUnlocked("holo", "Ada"), true);
    assert.equal(context.isCardFoilUnlocked("gold", "Ada"), false);
    assert.equal(context.isCardFoilUnlocked("gold", "h4cker"), true);
    assert.equal(context.isCardFoilUnlocked("rainbow", "TÅKEFYRSTEN"), true);

    const themeCss = fs.readFileSync(path.join(__dirname, "..", "css", "theme.css"), "utf8");
    assert.match(themeCss, /\.card-foil-option\.is-locked::after\s*\{[^}]*content:\s*"×";/);
    assert.match(themeCss, /\.card-foil-option__unlock\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*text-align:\s*center;/);
    assert.match(themeCss, /\.card-foil-option__unlock\s*\{[^}]*border:\s*1px solid var\(--line\);/);
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.match(html, /id="cardFoilWins">Your wins: 0<\/p>/);
});

test("foil overlays cover the full card surface and settings share one card preview", () => {
    const { types } = fixture();
    const foilCss = fs.readFileSync(path.join(__dirname, "..", "css", "foil.css"), "utf8");
    assert.match(foilCss, /\[data-foil\]:not\(\[data-foil="none"\]\)::before\s*\{[^}]*inset:\s*0;/);
    assert.match(foilCss, /\[data-foil\]:not\(\[data-foil="none"\]\)::after\s*\{[^}]*inset:\s*0;/);
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

test("touch-dragging a foil preview tilts the card without selecting its option", () => {
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
    f.context.clearCardDragPreview(hand);
    assert.equal(f.body.children.length, 0);
    assert.equal(first._dragPreview, undefined);
    assert.equal(first.classList.contains("is-drag-source"), false);
    assert.equal(f.nodes.get("gameTable").classList.contains("is-card-drop-target"), false);
});

test("horizontal drag previews stay level in either direction", () => {
    const f = fixture();
    const hand = new Element();
    const card = new Element();
    card.dataset = { cardKey: "1:5", cardStyle: "normal", foil: "none" };
    card.className = "game-card";
    hand.appendChild(card);
    vm.runInContext('selectedCardKeys.add("1:5")', f.context);
    f.context.startCardDragPreview(hand, { clientX: 100, clientY: 100 });
    f.now = 1020;
    f.context.moveCardDragPreview(hand, { clientX: 200, clientY: 100 }, 100, 100);
    assert.equal(card._dragPreview.properties.get("--tilt-y"), "0deg");
    f.now = 1040;
    f.context.moveCardDragPreview(hand, { clientX: 0, clientY: 100 }, 100, 100);
    assert.equal(card._dragPreview.properties.get("--tilt-y"), "0deg");
    f.context.clearCardDragPreview(hand);
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

test("slow drops play only on the board and flicking keeps its original sensitivity", () => {
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
    drag.lastFlickDistance = 23;
    drag.lastFlickVelocity = 0.55;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.lastFlickDistance = 24;
    drag.lastFlickVelocity = 0.54;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
    drag.lastFlickVelocity = 0.55;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), true);
    drag.lastFlickDistance = -16;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), false);
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

test("touch flick plays outside the board while sideways touch scrolling never plays", () => {
    const flick = pointerFixture();
    flick.hand.onpointerdown(flick.event(100, 500));
    flick.hand.onpointermove(flick.event(100, 470));
    flick.advance(1040);
    flick.hand.onpointerup(flick.event(100, 470));
    assert.equal(flick.state.plays, 1);
    const scroll = pointerFixture();
    scroll.hand.onpointerdown(scroll.event(100, 500));
    scroll.hand.onpointermove(scroll.event(170, 490));
    scroll.hand.onpointerup(scroll.event(170, 100));
    assert.equal(scroll.state.plays, 0);
    assert.equal(scroll.state.scrolls, 1);
});

test("selected cards drag on diagonal gestures and scroll only on deliberate sideways gestures", () => {
    const drag = pointerFixture();
    vm.runInContext('selectedCardKeys.add("1:5")', drag.context);
    drag.hand.onpointerdown(drag.event(100, 500));
    drag.hand.onpointermove(drag.event(112, 492));
    assert.equal(drag.body.children.length, 1);
    assert.equal(drag.hand.classList.contains("is-hand-dragging"), false);
    drag.hand.onpointerup(drag.event(112, 492));

    const scroll = pointerFixture();
    vm.runInContext('selectedCardKeys.add("1:5")', scroll.context);
    scroll.hand.onpointerdown(scroll.event(100, 500));
    scroll.hand.onpointermove(scroll.event(110, 500));
    assert.equal(scroll.hand.classList.contains("is-hand-dragging"), false);
    scroll.hand.onpointermove(scroll.event(119, 501));
    scroll.hand.onpointerup(scroll.event(119, 501));
    assert.equal(scroll.body.children.length, 0);
    assert.equal(scroll.state.scrolls, 1);
    assert.equal(scroll.state.plays, 0);
});

test("dragged foil cards preserve their preview angle while returning", () => {
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
    let preview = card._dragPreview;
    assert.equal(preview.style.getPropertyValue("--tilt-x"), "0deg");
    assert.equal(preview.style.getPropertyValue("--tilt-y"), "0deg");
    f.context.returnCardDragPreview(hand);
    assert.equal(card._dragPreview.properties.get("--tilt-y"), "0deg");
    f.timers.at(-1).callback();
});

test("a brief diagonal drift does not lock a vertical flick into hand scrolling", () => {
    const flick = pointerFixture();
    flick.hand.onpointerdown(flick.event(100, 500));
    flick.advance(1005);
    flick.hand.onpointermove(flick.event(108, 498));
    flick.advance(1020);
    flick.hand.onpointermove(flick.event(110, 488));
    flick.hand.onpointerup(flick.event(110, 488));
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

test("gameplay cards stay level, and cancellation or lost capture clears all drag visuals", () => {
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
        assert.equal(f.body.children.length, 1);
        f.hand[cancel](f.event(200, 200));
        assert.equal(f.body.children.length, 0);
        assert.equal(f.card.classList.contains("is-pressed"), false);
        assert.equal(f.state.plays, 0);
    }
});
