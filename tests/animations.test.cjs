const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(globals = {}) {
    const context = vm.createContext({
        console, getCookie: () => null, getPlayerKey: () => "owner-key",
        localStorage: { getItem: () => null }, setTimeout: () => 0, ...globals
    });
    for (const file of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "engine.js", "bot-turn.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    return context;
}

test("card flights use the unrotated card size centred on a rotated card's bounds", () => {
    const context = load();
    context.card = {
        offsetWidth: 80,
        offsetHeight: 120,
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 100, height: 136 })
    };
    const bounds = vm.runInContext("GameLayout.unrotatedCardBounds(card)", context);
    assert.deepEqual({ ...bounds }, { left: 110, top: 108, width: 80, height: 120 });
});

test("bot flicks vary landing, strength and tilt without consuming strategy randomness", () => {
    const context = load();
    const result = vm.runInContext(`
        var player = { name: "Bot", turn: 1, placement: 0, botSkill: "medium" };
        var cards = [1, 2, 3, 4].map(suit => new PresidentCard(suit, 7));
        var strategyCalls = 0;
        var chosenRandom;
        var strategyRandom = () => { strategyCalls++; return 0.5; };
        BotAI.observe = () => ({});
        BotAI.chooseMove = (view, skill, random) => { chosenRandom = random; return cards; };
        var played = [];
        var game = {
            status: "S", isTurnPaused: () => false,
            playCards: (actor, pile) => played.push(pile),
            passTurn: () => { throw new Error("Unexpected pass"); }
        };
        for (var sample of [0, 0.25, 0.5, 0.75, 0.999999]) {
            Math.random = () => sample;
            playBotTurn(game, player, strategyRandom);
        }
        ({
            motions: played.map(pile => pile.motion),
            restored: played.map(pile => PresidentCard.deserializePiles([pile.toRecord()])[0].motion),
            cardsUnchanged: played.every(pile => pile.length == 4 && pile.every((card, i) => card === cards[i])),
            strategyCalls, sameStrategyRandom: chosenRandom === strategyRandom
        });
    `, context);
    assert.equal(result.strategyCalls, 0);
    assert.equal(result.sameStrategyRandom, true);
    assert.equal(result.cardsUnchanged, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.restored)), JSON.parse(JSON.stringify(result.motions)));
    for (const key of ["x", "y", "power", "spin", "pitch", "yaw"]) {
        assert.ok(new Set(result.motions.map(motion => motion[key])).size > 2, `${key} must vary`);
    }
    for (const motion of result.motions) {
        assert.ok(Math.abs(motion.x) <= 0.8);
        assert.ok(Math.abs(motion.y) <= 0.64);
        assert.ok(motion.power >= 0.2 && motion.power <= 0.9);
        assert.ok(Math.abs(motion.spin) <= 16);
        assert.ok(Math.abs(motion.pitch) <= 15);
        assert.ok(Math.abs(motion.yaw) <= 16.4);
    }
});

test("normal play animation restores the original movement, easing and card stagger", () => {
    const animations = [];
    const flights = [];
    const layoutEvents = [];
    const element = () => ({
        src: "data:image/svg+xml,card",
        dataset: {},
        children: [],
        classList: { add() {} },
        style: { getPropertyValue: () => "0" },
        setAttribute() {},
        appendChild(child) { this.children.push(child); },
        cloneNode() { return element(); },
        animate(frames, timing) {
            animations.push({ frames, timing });
            return {};
        },
        getBoundingClientRect: () => ({ left: 200, top: 200, width: 80, height: 120 })
    });

    const targetImage = element();
    const context = load({
        window: { innerWidth: 1000, innerHeight: 800, matchMedia: () => ({ matches: false }) },
        document: { createElement: element, body: { appendChild(flight) {
            layoutEvents.push("write");
            flights.push(flight);
        } } }
    });
    context.target = {
        dataset: { cardStyle: "normal", foil: "galaxy" },
        style: { getPropertyValue: () => "0" },
        querySelector: () => targetImage,
        animate() {},
        getBoundingClientRect: () => {
            layoutEvents.push("read");
            return { left: 200, top: 200, width: 80, height: 120 };
        }
    };
    vm.runInContext(`
        var pile = new CardPile("Owner", ...[1,2,3,4].map(suit => new PresidentCard(suit, 7)));
        GameLayout.animatePlayedCards({ querySelector: () => target }, pile, {
            playerOrigins: new Map(),
            cardOrigins: new Map(pile.map(card => [card.suit + ":7",
                { left: 0, top: 0, width: 80, height: 120, rotation: 0 }]))
        });
    `, context);
    assert.equal(animations.length, 4);
    assert.deepEqual(layoutEvents, [...Array(4).fill("read"), ...Array(4).fill("write")]);
    assert.equal(flights.length, 4);
    flights.forEach(flight => {
        assert.match(flight.className, /card-preview--normal/);
        assert.equal(flight.dataset.foil, "galaxy");
        assert.equal(flight.children.length, 1);
    });
    for (const [index, { frames, timing }] of animations.entries()) {
        assert.equal(timing.duration, 520);
        assert.equal(timing.delay, index * 55);
        assert.equal(timing.easing, "cubic-bezier(.22,.8,.25,1)");
        assert.equal(timing.fill, "both");
        assert.match(frames[0].transform, /translate\(0, 0\) rotate\(-?[\d.]+deg\)/);
        assert.match(frames[1].transform, /translate\(130px, 130px\)/);
        assert.equal(frames[1].offset, 0.68);
        assert.match(frames[2].transform, /translate\(200px, 200px\)/);
    }
});

test("depth flights render rotation internally, preserve foil activity, and release renderer state", () => {
    const flights = [], animations = [], followers = [];
    const states = new Map();
    const depth = {
        states,
        attach(element) { states.set(element, {}); },
        update(element, pose) { states.get(element).pose = pose; },
        follow(element, animation, poseAtProgress) { followers.push(poseAtProgress); },
        detach(element) { states.delete(element); }
    };
    const element = () => ({
        dataset: {}, style: {}, setAttribute() {}, appendChild() {},
        cloneNode: () => element(), remove() { this.removed = true; },
        animate(frames, timing) {
            const animation = { frames, timing };
            animations.push(animation);
            return animation;
        }
    });
    const target = {
        dataset: { cardStyle: "normal", foil: "rainbow" },
        style: { getPropertyValue: () => "15" }, animate() {}, querySelector: element,
        getBoundingClientRect: () => ({ left: 200, top: 200, width: 80, height: 120 })
    };
    const context = load({
        CardDepth: depth, target,
        window: { innerWidth: 1000, innerHeight: 800, matchMedia: () => ({ matches: false }) },
        document: { createElement: element, body: { appendChild: flight => flights.push(flight) } }
    });
    vm.runInContext(`
        var pile = new CardPile("Owner", new PresidentCard(1,7));
        pile.motion = {x:0,y:0,power:1,spin:10,pitch:12,yaw:-10};
        GameLayout.animatePlayedCards({querySelector:()=>target}, pile, {
            playerOrigins:new Map(), cardOrigins:new Map([["1:7",{
                left:0,top:500,width:120,height:180,rotation:0,pitch:12,yaw:-10
            }]])
        });
    `, context);
    assert.equal(states.size, 1);
    assert.equal(flights[0].dataset.foil, "rainbow");
    for (const frame of animations[0].frames) {
        assert.doesNotMatch(frame.transform, /rotate|perspective/);
        assert.match(frame.transform, /scale/);
    }
    assert.equal(animations[0].frames[0]["--foil-activity"], 1);
    assert.equal(animations[0].timing.duration, 520);
    assert.equal(followers[0](0).pitch, 12);
    assert.equal(followers[0](0).yaw, -10);
    assert.equal(followers[0](1).pitch, 0);
    assert.equal(followers[0](1).yaw, 0);
    assert.equal(followers[0](1).roll, 15);
    animations[0].oncancel();
    assert.equal(states.size, 0);
    assert.equal(flights[0].removed, true);
});

test("throw metadata survives both pile deserializers and clamps finite motion values", () => {
    const context = load();
    const result = vm.runInContext(`
        var pile = new CardPile("Owner", new PresidentCard(1, 7));
        pile.motion = { x: 2, y: -2, power: 3, spin: 40, pitch: -40, yaw: 40 };
        var record = JSON.parse(JSON.stringify(pile));
        var restored = PresidentCard.deserializePiles([record])[0];
        var lastPlay = new CardPile("").fromRecord(record);
        ({ record, restored, lastPlay });
    `, context);
    const expected = { x: 1, y: -1, power: 1, spin: 20, pitch: -18, yaw: 18 };
    assert.deepEqual({ ...result.record.motion }, expected);
    assert.deepEqual({ ...result.restored.motion }, expected);
    assert.deepEqual({ ...result.lastPlay.motion }, expected);
    assert.equal(result.restored[0].rank, 7);
    assert.equal(result.lastPlay[0].suit, 1);
    for (const value of [NaN, Infinity, "1", undefined]) {
        context.bad = value;
        assert.throws(() => vm.runInContext(
            "CardPile.normalizeMotion({x:bad,y:0,power:0,spin:0,pitch:0,yaw:0})", context), /Ugyldig bevegelse/);
    }
    assert.equal(vm.runInContext('new CardPile("").fromRecord({nick:"Legacy",verdiBoms:7}).motion', context), undefined);
});

test("hard throws spread cards further and clients in the same board-size class share landing jitter", () => {
    const context = load();
    const result = vm.runInContext(`
        var game = {shuffleStartedAt:123,players:[{name:"Owner"},{name:"Other"}]};
        var pile = new CardPile("Owner", ...[1,2,3,4].map(suit=>new PresidentCard(suit,7)));
        pile.motion = {x:0,y:0,power:0,spin:0,pitch:0,yaw:0};
        var gentle = pile.map((card,index)=>GameLayout.pileCardJitter(game,pile,card,index,index));
        pile.motion.power = 1;
        var hard = pile.map((card,index)=>GameLayout.pileCardJitter(game,pile,card,index,index));
        var remote = PresidentCard.deserializePiles([JSON.parse(JSON.stringify(pile))])[0];
        var repeated = remote.map((card,index)=>GameLayout.pileCardJitter(game,remote,card,index,index));
        ({gentle,hard,repeated});
    `, context);
    assert.equal(result.hard[0].x, result.gentle[0].x - 12);
    assert.equal(result.hard[3].x, result.gentle[3].x + 12);
    assert.equal(result.hard[0].angle, Math.max(-30, Math.round((result.gentle[0].angle - 6) * 10) / 10));
    assert.equal(result.hard[3].angle, Math.min(30, Math.round((result.gentle[3].angle + 6) * 10) / 10));
    assert.deepEqual(JSON.parse(JSON.stringify(result.hard)), JSON.parse(JSON.stringify(result.repeated)));
});

test("small boards allow more directional inertia while large-board rotation stays bounded", () => {
    const context = load();
    const result = vm.runInContext(`
        var game = {shuffleStartedAt:123,players:[{name:"Owner"}]};
        var pile = new CardPile("Owner", new PresidentCard(1,7));
        var rotations = [-20, 0, 20].map(spin => {
            pile.motion = {x:0,y:0,power:1,spin,pitch:0,yaw:0};
            return {
                desktop: GameLayout.pileCardJitter(game,pile,pile[0],0,0,false),
                mobile: GameLayout.pileCardJitter(game,pile,pile[0],0,0,true)
            };
        });
        rotations;
    `, context);
    assert.ok(result[0].mobile.angle < result[0].desktop.angle);
    assert.ok(result[2].mobile.angle > result[2].desktop.angle);
    assert.equal(result[1].mobile.angle, result[1].desktop.angle);
    for (const { mobile, desktop } of result) {
        assert.ok(Math.abs(desktop.angle) <= 30);
        assert.ok(Math.abs(mobile.angle) <= 40);
        assert.equal(mobile.x, desktop.x);
        assert.equal(mobile.y, desktop.y);
    }
});

test("played flights retain source tilt, scale and foil position and settle level before cleanup", () => {
    const flights = [];
    const animations = [];
    const element = () => ({
        dataset: {}, style: {}, children: [], setAttribute() {},
        appendChild(child) { this.children.push(child); },
        cloneNode() { return element(); },
        remove() { this.removed = true; },
        animate(frames, timing) {
            const animation = {};
            animations.push({ frames, timing, animation });
            return animation;
        }
    });
    const target = {
        offsetWidth: 80, offsetHeight: 120, style: { getPropertyValue: () => "15" },
        dataset: { cardStyle: "normal", foil: "rainbow" }, animate() {},
        querySelector: () => element(),
        getBoundingClientRect: () => ({ left: 200, top: 200, width: 100, height: 140 })
    };
    const context = load({
        window: { innerWidth: 1000, innerHeight: 800, matchMedia: () => ({ matches: false }) },
        document: { createElement: element, body: { appendChild: flight => flights.push(flight) } }
    });
    Object.assign(context, { target, completed: 0 });
    vm.runInContext(`
        var pile = new CardPile("Owner",new PresidentCard(1,7));
        pile.motion = {x:.5,y:-.5,power:1,spin:10,pitch:12,yaw:-10};
        GameLayout.animatePlayedCards({querySelector:()=>target},pile,{
            playerOrigins:new Map(),cardOrigins:new Map([["1:7",{
                left:0,top:500,width:120,height:180,rotation:0,pitch:12,yaw:-10,
                pointerX:"25%",pointerY:"20%"
            }]])
        },()=>completed++);
    `, context);
    const { frames, animation } = animations[0];
    assert.match(frames[0].transform, /rotateX\(12deg\) rotateY\(-10deg\) rotate\(0deg\) scale\(1.5\)/);
    assert.equal(frames[0]["--pointer-x"], "25%");
    assert.equal(frames[0]["--pointer-y"], "20%");
    assert.match(frames[1].transform, /rotateX\(8\.2deg\) rotateY\(-5\.5deg\)/);
    assert.equal(frames[1]["--pointer-x"], "36.25%");
    assert.match(frames[2].transform, /rotateX\(0deg\) rotateY\(0deg\) rotate\(15deg\) scale\(1\)/);
    assert.equal(frames[2]["--pointer-x"], "50%");
    assert.equal(frames[2]["--pointer-y"], "50%");
    assert.equal(frames[2]["--foil-activity"], 0);
    assert.equal(target.style.opacity, "0");
    animation.onfinish();
    animation.oncancel();
    assert.equal(target.style.opacity, "");
    assert.equal(flights[0].removed, true);
    assert.equal(context.completed, 1);
});

test("multi-card flights stay visible until the entire refreshed play can be revealed", () => {
    for (const count of [2, 3, 4]) {
        const animations = [];
        const flights = [];
        const element = () => ({
            dataset: {}, style: {}, setAttribute() {},
            appendChild() {}, cloneNode: () => element(),
            remove() { this.removed = true; },
            animate() { const animation = {}; animations.push(animation); return animation; }
        });
        const targets = Array.from({ length: count }, () => ({
            dataset: {}, style: { getPropertyValue: () => "0" }, animate() {},
            querySelector: element,
            getBoundingClientRect: () => ({ left: 200, top: 200, width: 80, height: 120 })
        }));
        const context = load({
            window: { innerWidth: 1000, innerHeight: 800, matchMedia: () => ({ matches: false }) },
            document: { createElement: element, body: { appendChild: flight => flights.push(flight) } },
            targets, count, completed: 0
        });
        vm.runInContext(`
            var pile = new CardPile("Owner", ...Array.from({length:count},(_,i)=>new PresidentCard(i+1,7)));
            var currentTargets = targets;
            var refreshed = targets.map(() => ({style:{opacity:"0"}}));
            GameLayout.animatePlayedCards({
                querySelector: selector => currentTargets[Number(selector.match(/"(\\d+)/)[1])-1]
            }, pile, null, () => {
                refreshed.forEach(card => card.style.opacity = "");
                completed++;
            });
            currentTargets = refreshed;
        `, context);
        for (let index = 0; index < count - 1; index++) {
            animations[index].onfinish();
            animations[index].oncancel();
            assert.ok(flights.every(flight => !flight.removed));
            assert.equal(context.completed, 0);
        }
        animations[count - 1].onfinish();
        assert.ok(flights.every(flight => flight.removed));
        assert.equal(context.completed, 1);
        assert.equal(vm.runInContext('refreshed.every(card => card.style.opacity == "")', context), true);
    }
});

test("clear animation scheduling includes the original duration and every card's stagger", () => {
    const context = load();
    assert.equal(vm.runInContext("discardAnimationMs(1)", context), 720);
    assert.equal(vm.runInContext("discardAnimationMs(52)", context), 1332);
    assert.equal(vm.runInContext(`clearAnimationStartsAt({
        until: 2000, clearedPiles: [{ nick: "Owner", 0: {}, 1: {}, 2: {}, 3: {} }]
    })`, context), 1244);
});

test("discard animation restores the original easing and scales duration and stagger together", () => {
    for (const [speed, factor] of [["fast", 0.5], ["normal", 1], ["slow", 1.5]]) {
        const timings = [];
        const layoutEvents = [];
        const context = load({
            getCookie: () => speed,
            window: { innerHeight: 800, matchMedia: () => ({ matches: false }) },
            document: { body: { appendChild() { layoutEvents.push("write"); } } }
        });
        context.table = {
            querySelectorAll: () => Array.from({ length: 4 }, () => ({
                style: { getPropertyValue: () => "0" },
                getBoundingClientRect: () => {
                    layoutEvents.push("read");
                    return { left: 100, top: 100, width: 80, height: 120 };
                },
                cloneNode: () => ({
                    style: {}, setAttribute() {}, classList: { add() {} },
                    animate(frames, timing) { timings.push(timing); return {}; }
                })
            }))
        };
        vm.runInContext("GameLayout.animateDiscardedCards(table)", context);
        assert.equal(timings.length, 4);
        assert.deepEqual(layoutEvents, [...Array(4).fill("read"), ...Array(4).fill("write")]);
        timings.forEach((timing, index) => {
            assert.equal(timing.duration, 720 * factor);
            assert.equal(timing.delay, index * 12 * factor);
            assert.equal(timing.easing, "cubic-bezier(.45,0,.8,.4)");
        });
    }
});

test("hand reflow measures all remaining cards before starting any animation", () => {
    const events = [];
    const cards = ["1:7", "2:7"].map(cardKey => ({
        dataset: { cardKey },
        getBoundingClientRect() {
            events.push("read");
            return { left: 10, top: 20 };
        },
        animate(frames, timing) {
            events.push("animate");
            assert.equal(frames[0].translate, "20px 20px");
            assert.equal(frames[1].translate, "0px 0px");
            assert.equal(timing.duration, 320);
            assert.equal(timing.easing, "cubic-bezier(0.2, 0.8, 0.2, 1)");
        }
    }));
    const context = load({
        window: { matchMedia: () => ({ matches: false }) },
        hand: { querySelectorAll: () => cards },
        previous: new Map(["1:7", "2:7", "3:7"].map(key => [key, { left: 30, top: 40 }]))
    });
    vm.runInContext("GameLayout.animateHandReflow(hand, previous)", context);
    assert.deepEqual(events, ["read", "read", "animate", "animate"]);
});

test("discarded foil previews retain their clipped card layer and are removed after flight", () => {
    let animation;
    const flight = {
        className: "table-play__card card-preview card-preview--normal",
        dataset: { foil: "galaxy" },
        style: {},
        classList: { add(name) { this[name] = true; } },
        setAttribute() {},
        animate() { animation = {}; return animation; },
        remove() { this.removed = true; }
    };
    const card = {
        style: { getPropertyValue: () => "0", set opacity(value) { this.opacityValue = value; } },
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 80, height: 120 }),
        cloneNode() { return flight; }
    };
    const context = load({
        window: { innerHeight: 800, matchMedia: () => ({ matches: false }) },
        document: { body: { appendChild() {} } },
        requestAnimationFrame(callback) { callback(); }
    });
    context.table = { querySelectorAll: () => [card] };
    context.completed = 0;
    vm.runInContext("GameLayout.animateDiscardedCards(table, () => { completed++; })", context);
    assert.equal(flight.classList["card-discard-flight"], true);
    assert.match(flight.className, /card-preview/);
    assert.equal(flight.dataset.foil, "galaxy");
    assert.equal(card.style.opacityValue, "0");
    animation.onfinish();
    assert.equal(flight.removed, true);
    assert.equal(card.style.opacityValue, "");
    assert.equal(context.completed, 1);
});

test("giving exchange cards animates mixed ranks toward the recipient and cleans up the hidden target", () => {
    const targets = [];
    const target = {
        getBoundingClientRect: () => ({ left: 500, top: 20, width: 120, height: 80 }),
        dataset: { playerName: "Recipient" }
    };
    const element = () => ({
        style: {}, dataset: {}, children: [], setAttribute() {},
        appendChild(child) { this.children.push(child); },
        remove() { this.removed = true; }
    });
    const context = load({
        window: { matchMedia: () => ({ matches: false }) },
        document: {
            querySelectorAll: () => [target],
            createElement: element,
            body: { appendChild: node => targets.push(node) }
        }
    });
    vm.runInContext(`
        var game = { players: [{ name: "Sender" }, { name: "Recipient" }] };
        var exchange = { from: 0, to: 1, cards: [
            new PresidentCard(1, 12), new PresidentCard(2, 1)
        ] };
        var origins = { cardOrigins: new Map(), playerOrigins: new Map() };
        GameLayout.styleForPlayer = () => "pixel";
        GameLayout.animatePlayedCards = (destination, pile, captured, done) => {
            if (pile.name != "Sender" || pile.length != 2 || captured != origins) {
                throw new Error("Exchange flight lost its sender, mixed cards or captured hand origins");
            }
            done();
        };
        GameLayout.animateGivenExchangeCards(game, exchange, origins);
    `, context);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].removed, true);
    assert.equal(targets[0].children.length, 2);
    assert.equal(targets[0].children[0].dataset.cardKey, "1:12");
    assert.equal(targets[0].children[1].dataset.cardKey, "2:1");
    assert.equal(targets[0].children[0].style.top, "24px");
    assert.equal(targets[0].children[0].style.left, "536px");
});

test("personal animation speeds scale original durations and stagger by exactly minus or plus 50 percent", () => {
    let speed = null;
    const context = load({ getCookie: () => speed });
    for (const [preference, duration] of [[null, 520], ["fast", 260], ["normal", 520], ["slow", 780]]) {
        speed = preference;
        assert.equal(vm.runInContext("animationDuration({})", context), duration);
        const factor = duration / 520;
        assert.equal(vm.runInContext("animationDuration({}, DISCARD_ANIMATION_MS)", context), 720 * factor);
        assert.equal(vm.runInContext("animationDuration({}, 55)", context), 55 * factor);
        assert.equal(vm.runInContext("animationDuration({}, 12)", context), 12 * factor);
    }
    assert.equal(vm.runInContext("animationDuration({ fastForward: true })", context), 260);
    assert.equal(vm.runInContext("animationDuration({ fastForward: false })", context), 780);
});

test("human actions unlock on local animation completion with no grace or shared observation pause", () => {
    const context = load({ window: {} });
    vm.runInContext(`
        var game = Object.assign(Object.create(PresidentGame.prototype), {
            status: "S", players: [new PresidentPlayer("Human", "owner-key")],
            turn: 0, turnPause: { id: "action", presentationVersion: 1, until: Date.now() + 10000 }
        });
    `, context);
    assert.equal(vm.runInContext("game.isTurnPaused()", context), true);
    vm.runInContext('game.presentationCompletedPauseId = "action"', context);
    assert.equal(vm.runInContext("game.isTurnPaused()", context), false);
    vm.runInContext('game.turnPause.id = "next-action"', context);
    assert.equal(vm.runInContext("game.isTurnPaused()", context), true);
});

test("bot deadlines follow animation speed, stay fixed per turn and ignore toast preferences", () => {
    let speed = null;
    let toastSpeed = "fast";
    const context = load({
        getCookie: key => key == "AnimationSpeed" ? speed : null,
        localStorage: { getItem: () => toastSpeed }
    });
    for (const [preference, expected] of [[null, 2000], ["fast", 1000], ["normal", 2000], ["slow", 3000]]) {
        speed = preference;
        vm.runInContext(`
            Math.random = () => { throw new Error("Bot timing must not use randomness"); };
            var game = { players: [new PresidentPlayer("Bot", "PC")], turn: 0,
                turnPause: { presentationVersion: 1 } };
            preparePresentationPause(game);
        `, context);
        assert.equal(vm.runInContext("game.turnPause.botUntil - game.turnPause.startedAt", context), expected);
        assert.equal(vm.runInContext("game.turnPause.botDelayMs", context), expected);
        const deadline = vm.runInContext("game.turnPause.botUntil", context);
        speed = "fast";
        toastSpeed = "slow";
        vm.runInContext("preparePresentationPause(game)", context);
        assert.equal(vm.runInContext("game.turnPause.botUntil", context), deadline);
    }
    speed = "slow";
    vm.runInContext(`
        game.fastForward = true;
        game.turnPause = { presentationVersion: 1 };
        preparePresentationPause(game);
    `, context);
    assert.equal(vm.runInContext("game.turnPause.botUntil - game.turnPause.startedAt", context), 1000);
    assert.equal(vm.runInContext("game.turnPause.botDelayMs", context), 3000,
        "The selected pace must be available when fast-forward is turned off");
});

test("local clear completion does not mutate shared piles or wait for the reserve deadline", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let discardComplete;
    let refreshed = 0;
    const pause = {
        id: "clear", presentationVersion: 1, kind: "clear",
        until: Date.now() + 10000, clearedPiles: [{ 0: {} }]
    };
    const game = {
        turnPause: pause, getPlayer: () => null, players: [], turn: 0, connectionOnline: true
    };
    const context = vm.createContext({
        currentGame: game, currentPlayerName: "Spectator",
        document: { getElementById: () => ({ dataset: {} }) },
        GameLayout: { animateDiscardedCards: (_, done) => { discardComplete = done; } },
        refreshAfterTurnPause: () => { refreshed++; }, scheduleBotLoop() {},
        GamePresence: {}, Date
    });
    vm.runInContext(source.slice(source.indexOf("        var presentationSnapshots = [];"),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.completeLocalPresentation(game, pause);
    assert.equal(game.presentationCompletedPauseId, undefined);
    context.completeLocalPresentation(game, pause);
    discardComplete();
    assert.equal(game.presentationCompletedPauseId, "clear");
    assert.equal(refreshed, 1);
    assert.equal(pause.clearedPiles.length, 1, "Another viewer still needs the original animation data");
});

test("new snapshots queue in order while a local animation is running, without dropping actions", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const begin = source.indexOf("                var snapshotRecord = snapshot.val();",
        source.indexOf("            currentGameListener = function"));
    const end = source.indexOf("                if (snapshotRecord != null && GamePresence.isExpired", begin);
    const game = {
        status: "S", shuffleStartedAt: 123,
        turnPause: { id: "first", presentationVersion: 1 }
    };
    const context = vm.createContext({
        connectingGame: game, presentationSnapshots: [], completingPresentationId: "first", accepted: []
    });
    vm.runInContext(`function receive(snapshot) {
        ${source.slice(begin, end)}
        accepted.push(snapshotRecord.turnPause.id);
    }`, context);
    const snapshot = id => ({ val: () => ({ status: "S", shuffleStartedAt: 123, turnPause: { id } }) });
    context.receive(snapshot("second"));
    context.receive(snapshot("third"));
    assert.deepEqual(Array.from(context.presentationSnapshots, item => item.val().turnPause.id), ["second", "third"]);
    assert.equal(context.accepted.length, 0);
    game.presentationCompletedPauseId = "first";
    context.receive(context.presentationSnapshots.shift());
    context.receive(context.presentationSnapshots.shift());
    assert.deepEqual(Array.from(context.accepted), ["second", "third"]);
});

function snapshotGateContext(game, visible = false) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const begin = source.indexOf("                if (currentGame != connectingGame) { return; }",
        source.indexOf("            currentGameListener = function"));
    const end = source.indexOf("                if (snapshotRecord != null && GamePresence.isExpired", begin);
    const toast = {
        textContent: "Last message",
        classList: { contains: () => visible, remove: () => { visible = false; } },
        getAnimations: () => []
    };
    const context = vm.createContext({
        currentGame: game, connectingGame: game, pendingResultsSnapshot: null,
        presentationSnapshots: [], completingPresentationId: null, accepted: [],
        gameToastsHidden: () => false, document: { getElementById: () => toast, querySelectorAll: () => [] },
        archivedToasts: [], gameToastTimer: null, activeToastPauseId: "final", gameToastExpiresAt: 10000,
        clearTimeout() {}, handleTurnPause() {},
        fadeOutToast: (node, complete) => { context.exitComplete = complete; }
    });
    vm.runInContext(`function receive(snapshot) {
        ${source.slice(begin, end)}
        accepted.push(snapshotRecord);
    }
    var currentGameListener = receive;
    ${source.slice(source.indexOf("        function hideGameToast("),
        source.indexOf("        function resetGameLog("))}`, context);
    return context;
}

test("pre-move snapshots cannot replace or queue a hand while its write is pending", () => {
    const game = { status: "S", shuffleStartedAt: 123, localWritePending: true,
        turnPause: { id: "played", presentationVersion: 1 } };
    const context = snapshotGateContext(game);
    context.receive({ val: () => ({ status: "S", shuffleStartedAt: 123, turnPause: { id: "old" } }) });
    assert.equal(context.accepted.length, 0);
    assert.equal(context.presentationSnapshots.length, 0);
    game.localWritePending = false;
    context.receive({ val: () => ({ status: "S", shuffleStartedAt: 123, turnPause: { id: "played" } }) });
    assert.equal(context.accepted.length, 1);
});

test("results wait for the final toast exit or dismissal and accept only the latest snapshot", () => {
    for (const animate of [false, true]) {
        const game = { status: "S", shuffleStartedAt: 123 };
        const context = snapshotGateContext(game, true);
        const first = { val: () => ({ status: "F", shuffleStartedAt: 123, marker: 1 }) };
        const latest = { val: () => ({ status: "F", shuffleStartedAt: 123, marker: 2 }) };
        context.receive(first);
        context.receive(latest);
        assert.equal(context.accepted.length, 0);
        context.hideGameToast(true, animate);
        if (animate) {
            assert.equal(context.accepted.length, 0, "The exit animation must finish first");
            context.exitComplete();
        }
        assert.equal(context.accepted.length, 1);
        assert.equal(context.accepted[0].marker, 2);
        assert.equal(context.pendingResultsSnapshot, null);
    }
});

test("results cannot skip a queued final play and its placement toast", () => {
    const game = { status: "S", shuffleStartedAt: 123,
        turnPause: { id: "earlier", presentationVersion: 1 } };
    const context = snapshotGateContext(game, true);
    const finalPlay = { val: () => ({ status: "S", shuffleStartedAt: 123,
        turnPause: { id: "final", presentationVersion: 1, pendingGameEnd: true } }) };
    const results = { val: () => ({ status: "F", shuffleStartedAt: 123 }) };
    context.receive(finalPlay);
    context.receive(results);
    assert.equal(context.presentationSnapshots.length, 2);
    assert.equal(context.pendingResultsSnapshot, null);
    game.presentationCompletedPauseId = "earlier";
    context.receive(context.presentationSnapshots.shift());
    game.turnPause = finalPlay.val().turnPause;
    game.presentationCompletedPauseId = "final";
    context.receive(context.presentationSnapshots.shift());
    assert.equal(context.accepted.length, 1, "Only the final play is accepted before toast dismissal");
    assert.equal(context.pendingResultsSnapshot.snapshot, results);
    context.hideGameToast();
    assert.equal(context.accepted.at(-1).status, "F");
});

test("leaving during the final toast discards buffered results without advancing the game", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const game = { status: "S", shuffleStartedAt: 123,
        turnPause: { id: "final", pendingGameEnd: true } };
    const context = snapshotGateContext(game, true);
    context.receive({ val: () => ({ status: "F", shuffleStartedAt: 123 }) });
    assert.ok(context.pendingResultsSnapshot);
    Object.assign(context, {
        connection: null, currentGameSubscription: null, gameEndVoteRefreshTimer: null,
        handleTurnPause: () => { throw new Error("Disconnected games must not advance"); }
    });
    vm.runInContext(source.slice(source.indexOf("        function disconnectGameListener()"),
        source.indexOf("        function leaveCurrentGame()")), context);
    context.disconnectGameListener();
    context.hideGameToast();
    assert.equal(context.pendingResultsSnapshot, null);
    assert.equal(context.accepted.length, 0);
});

test("saved local actions apply their committed snapshot rather than an intervening old hand", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const game = {};
    const accepted = [];
    let listener;
    const context = vm.createContext({
        currentGame: game,
        document: { addEventListener: (name, callback) => { listener = callback; } },
        currentGameListener: snapshot => accepted.push(snapshot),
        refreshAfterTurnPause() {}, handleTurnPause() {}, updateTurnTimer() {}, scheduleBotLoop() {}
    });
    const begin = source.indexOf('        document.addEventListener("local-game-action"');
    vm.runInContext(source.slice(begin, source.indexOf('        document.addEventListener("visibilitychange"', begin)), context);
    const committed = { val: () => ({ spillere: [{ kort: [] }] }) };
    listener({ detail: { game, phase: "saved", snapshot: committed } });
    assert.deepEqual(accepted, [committed]);
});

test("result screens never show new game toasts", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const context = vm.createContext({
        hidden: 0, hideGameToast: () => context.hidden++,
        currentGameSpeed: () => "slow", GAME_SPEED_MS: { slow: 9000 }
    });
    vm.runInContext(source.slice(source.indexOf("        function showGameToast("),
        source.indexOf("        function archiveGameToast(")), context);
    context.showGameToast("Late message", { status: "F" });
    assert.equal(context.hidden, 1);
});

test("the driver waits for its final toast before finishing the game", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    let visible = true;
    let finishes = 0;
    const pause = { id: "final", pendingGameEnd: true, botUntil: 0 };
    const game = {
        turnPause: pause, presentationCompletedPauseId: pause.id,
        players: [], getPlayer: () => null,
        finishGame: () => finishes++, save() {}
    };
    const context = vm.createContext({
        currentGame: game, currentPlayerName: "Spectator", gameToastsHidden: () => false,
        document: { getElementById: () => ({ classList: { contains: () => visible } }) },
        GamePresence: { canDrive: () => true, now: () => 1000 }
    });
    vm.runInContext(source.slice(source.indexOf("        var presentationSnapshots = [];"),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.publishPresentationReady(game, pause);
    assert.equal(finishes, 0);
    visible = false;
    context.publishPresentationReady(game, pause);
    assert.equal(finishes, 1);
});

test("readiness is published only after completion and rechecks the current named seat transactionally", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    const { GamePresence } = vm.runInContext("({ GamePresence })", load());
    const player = { name: "Owner", playerKey: "owner-key" };
    const pause = { id: "action", presentationVersion: 1 };
    const record = {
        status: "S", turnPause: pause, sinTur: 0,
        spillere: [{ nick: "Owner", spillerKey: "owner-key" }]
    };
    let saved;
    let writes = 0;
    const game = {
        turnPause: pause, turn: 0, players: [player], getPlayer: () => player,
        databaseRef: { transaction(transform) {
            writes++;
            saved = transform(record);
            return Promise.resolve();
        } }
    };
    const context = vm.createContext({
        console, currentGame: game, currentPlayerName: player.name,
        getPlayerKey: () => player.playerKey,
        GamePresence: {
            isBot: (game, player) => GamePresence.isBot(game, player),
            playerId: player => GamePresence.playerId(player), now: () => 12345
        }
    });
    vm.runInContext(source.slice(source.indexOf("        var presentationSnapshots = [];"),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.publishPresentationReady(game, pause);
    assert.equal(writes, 0);
    game.presentationCompletedPauseId = pause.id;
    context.publishPresentationReady(game, pause);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.turnPause.until, 12345);
    assert.equal(saved.turnPause.readyAt, 12345);
    record.turnPause = { id: "new-action" };
    context.publishPresentationReady(game, pause);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved, undefined, "A delayed readiness acknowledgment cannot unlock a newer action");
});

test("automatically selected exchange cards scroll into view without playing-turn selection", () => {
    const scrolls = [];
    const context = load({
        window: { requestAnimationFrame: callback => callback() }
    });
    context.hand = {
        scrollWidth: 900, clientWidth: 300, scrollLeft: 0,
        getBoundingClientRect: () => ({ left: 0, right: 300, width: 300 }),
        querySelectorAll: selector => {
            assert.equal(selector, ".game-card.is-selected, .game-card.is-exchange-selected");
            return ["1:14", "2:14"].map((key, index) => ({
                dataset: { cardKey: key },
                getBoundingClientRect: () => ({
                    left: 700 + index * 30, right: 780 + index * 30, width: 80
                })
            }));
        }
    };
    context.recordScroll = value => scrolls.push(value);
    vm.runInContext(`
        selectedCardOwner = "game:Boms";
        selectedCardKeys.clear();
        animateHandScroll = (element, target) => recordScroll(target);
        GameLayout.centerHandSelection(hand, "game:Boms", ["1:14", "2:14"]);
    `, context);
    assert.deepEqual(scrolls, [558]);
    vm.runInContext('GameLayout.centerHandSelection(hand, "game:Boms", ["1:7"])', context);
    assert.equal(scrolls.length, 1, "A stale selection must not scroll the hand");
});

test("local actions render before the network write and remain guarded until acknowledgment", () => {
    const events = [];
    const snapshots = [];
    let complete;
    const context = load({
        document: { dispatchEvent: event => {
            events.push(event.detail.phase);
            snapshots.push(event.detail.snapshot);
        } },
        CustomEvent: class { constructor(type, options) { this.detail = options.detail; } }
    });
    context.databaseRef = {
        transaction(transform, callback) {
            assert.deepEqual(events, ["started"]);
            complete = () => callback(null, true, { val: () => ({ status: "S", turnSeconds: 2 }) });
        }
    };
    vm.runInContext(`
        var owner = new PresidentPlayer("Owner", "owner-key");
        var game = Object.assign(Object.create(PresidentGame.prototype), {
            id: "test", status: "S", rules: {}, players: [owner], piles: [],
            round: 1, turn: 0, localPlayerName: owner.name, databaseRef,
            updatePublicListing() {}
        });
        game.recordHumanAction(owner);
        game.save();
    `, context);
    assert.equal(vm.runInContext("game.localWritePending", context), true);
    assert.throws(() => vm.runInContext("game.assertSessionActive()", context), /Venter/);
    complete();
    assert.equal(vm.runInContext("game.localWritePending", context), false);
    assert.deepEqual(events, ["started", "saved"]);
    assert.equal(snapshots[1].val().status, "S");
});

test("clear starts before the deadline but does not unlock the next turn early", () => {
    let now = 1000;
    const timers = [];
    const context = vm.createContext({
        currentGame: null, turnPauseRefreshTimer: null, lastShownTurnPauseId: null,
        activeToastPauseId: null, gameToastExpiresAt: 0,
        Date: { now: () => now }, clearTimeout() {},
        setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
        currentGameSpeed: () => "fast", GAME_SPEED_MS: { fast: 3000 },
        showGameToast() {},
        clearAnimationStartsAt: pause => pause.until - 300,
        completeTurnPause: () => { context.completions++; }, completions: 0
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "connection.js"), "utf8");
    vm.runInContext(source.slice(source.indexOf("        function handleTurnPause("),
        source.indexOf("        function handleRoundStartVote(")), context);
    context.currentGame = { id: "test", turnPause: {
        id: "clear", kind: "clear", until: 2000, clearedPiles: [{}]
    } };
    context.handleTurnPause(context.currentGame);
    assert.equal(timers.at(-1).delay, 700);
    now = 1500;
    context.handleTurnPause(context.currentGame);
    assert.equal(timers.at(-1).delay, 200, "A repeated snapshot must retain the clear start time");
    now = 1700;
    timers.at(-1).callback();
    assert.equal(context.completions, 1);
});

test("failed local writes notify once, release the pending guard and do not emit success", async () => {
    const events = [];
    const context = load({
        console: { error() {} },
        document: { dispatchEvent: event => events.push(event.detail.phase) },
        CustomEvent: class { constructor(type, options) { this.detail = options.detail; } }
    });
    const error = new Error("Write rejected");
    context.databaseRef = { transaction(transform, complete) {
        complete(error, false, null);
        return Promise.reject(error);
    } };
    const write = vm.runInContext(`
        var owner = new PresidentPlayer("Owner", "owner-key");
        var game = Object.assign(Object.create(PresidentGame.prototype), {
            status: "S", rules: {}, players: [owner], piles: [], localPlayerName: owner.name,
            databaseRef, updatePublicListing() {}
        });
        game.recordHumanAction(owner);
        game.save();
    `, context);
    await assert.rejects(write, /Write rejected/);
    assert.deepEqual(events, ["started", "failed"]);
    assert.equal(vm.runInContext("game.localWritePending", context), false);
});

test("reduced motion skips flights but still completes the animation lifecycle", () => {
    const context = load({     document: {},
    window: { matchMedia: () => ({ matches: true }) } });
    assert.equal(vm.runInContext(`
        var completions = 0;
        GameLayout.animatePlayedCards({}, [], null, () => completions++);
        completions;
    `, context), 1);
});
