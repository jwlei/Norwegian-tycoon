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
    const body = new Element();
    let now = 1000;
    let reducedMotion = false;
    const context = vm.createContext({
        console, Element, getCookie: key => preferences.get(key),
        setCookie: (key, value) => preferences.set(key, value),
        getPlayerKey: () => "owner", setTimeout() {}, clearTimeout() {},
        performance: { now: () => now },
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
    return { context, types, preferences, nodes, body,
        set now(value) { now = value; }, set reducedMotion(value) { reducedMotion = value; } };
}

test("foil lists every supplied variant except reverse holo non-rares and defaults safely", () => {
    const { types, preferences } = fixture();
    assert.deepEqual(Array.from(types.Card.foilOptions(), option => option.id),
        ["none", "holo", "galaxy", "v", "vmax", "vstar", "full-art", "trainer-full-art",
            "rainbow", "rainbow-alt", "gold", "radiant", "gallery-holo", "gallery-v", "gallery-vmax"]);
    const names = Array.from(types.Card.foilOptions(), option => option.name);
    assert.deepEqual(names, ["Ingen folie", "Stripet", "Stjernestøv", "Prisme", "Bølger", "Fasetter",
        "Ringer", "Vev", "Regnbue", "Kontrast", "Gullglans", "Rutenett", "Fargespill", "Perlemor", "Stråler"]);
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

test("the foil selector persists independently, updates previews and never registers card-style actions", () => {
    const { context, preferences, nodes } = fixture();
    const dialogs = [];
    context.currentGame = null;
    context.localizedMessage = text => text;
    context.showDialog = (...args) => dialogs.push(args);
    let styleUpdates = 0;
    context.updateCardStyleButtons = () => styleUpdates++;
    const connection = source("connection.js");
    const start = connection.indexOf("        function updateCardFoilButtons()");
    const end = connection.indexOf('        document.getElementById("hideToastsToggleButton")', start);
    vm.runInContext(connection.slice(start, end), context);
    const options = nodes.get("cardFoilOptions");
    assert.equal(options.childElementCount, 15);
    assert.ok(options.children.every(button => button.querySelectorAll(".card-preview").length == 1));
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
    nodes.get("cardFoilOpenButton").onclick();
    assert.deepEqual(dialogs.slice(-2), [["Innstillinger", false], ["Kortfolie", true]]);
    nodes.get("cardFoilCloseButton").onclick();
    assert.deepEqual(dialogs.slice(-2), [["Kortfolie", false], ["Innstillinger", true]]);
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
        assert.equal(card._dragPreview.properties.get("--tilt-x"), "28deg");
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

test("slow drops play only on the board, while the original 24px fast flick still works", () => {
    const f = fixture();
    f.context.document.getElementById("gameTable");
    const drag = { canDragToPlay: true, canSwipeToPlay: false, didPlayDrag: true,
        axis: "vertical", startX: 100, startY: 500, startTime: 0 };
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 200 }), true);
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 401, clientY: 200 }), false);
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 400 }), false);
    drag.canSwipeToPlay = true;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 400 }), false);
    f.now = 40;
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 476 }), true);
    assert.equal(f.context.shouldPlayCardDrag(drag, { clientX: 100, clientY: 477 }), false);
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
    context.clearDragStyles = () => context.clearCardDragPreview(hand);
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

test("hover tilts without pressing, and cancellation or lost capture clears all drag visuals", () => {
    const f = pointerFixture({ desktop: true });
    f.hand.onpointermove(f.event(300, 200));
    assert.equal(f.card.classList.contains("is-tilting"), true);
    f.hand.onpointerleave();
    assert.equal(f.card.classList.contains("is-tilting"), false);
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
