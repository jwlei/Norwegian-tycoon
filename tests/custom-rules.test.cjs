const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
    const context = vm.createContext({
        console, Math, getCookie: () => null, getPlayerKey: () => "host",
        localStorage: { getItem: () => null }, setTimeout: () => 0, clearTimeout() {},
        document: { dispatchEvent() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    });
    for (const file of [
        "cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "layout-animations.js", "layout-table.js", "layout-hand.js", "engine.js", "bot-turn.js"
    ]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    return vm.runInContext("({ BotAI, PresidentGame, PresidentPlayer, PresidentCard, CardDeck, CardPile, playBotTurn, CUSTOM_RULES, normalizeCustomRules, activeCustomRules, customRulesFromRecord, customRulesToRecord, hasCustomRule })", context);
}

const { BotAI, PresidentGame, PresidentPlayer, PresidentCard, CardDeck, CardPile, playBotTurn, CUSTOM_RULES,
    normalizeCustomRules, activeCustomRules, customRulesFromRecord, customRulesToRecord } = load();

const card = (rank, suit = 1) => new PresidentCard(suit, rank);
const CLUB_THREE = () => new PresidentCard(3, 3);
const filler = (count = 3) => Array.from({ length: count }, (_, index) => card(4, index % 2 == 0 ? 2 : 4));

function makeGame(hands, rules = {}) {
    const players = hands.map((cards, index) => {
        const player = new PresidentPlayer("P" + index, "PC");
        player.cards = new CardDeck(...cards);
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "test", players, status: "S", piles: [], playedCards: [], turn: 0,
        turnPause: null, round: 1, rules, hostKey: "host", hostName: "Host"
    });
    game.save = () => {};
    game.finishGame = () => { game.status = "F"; };
    game.setTurn(0);
    return game;
}

// Plays cards from the current player's hand and moves past the presentation pause.
function play(game, ...picks) {
    const player = game.players[game.turn];
    const pile = new CardPile(player.name);
    picks.forEach(pick => pile.push(player.cards.find(held => held.suit == pick.suit && held.rank == pick.rank)));
    game.playCards(player, pile);
    const pause = game.turnPause;
    game.turnPause = null;
    return pause;
}

function pass(game) {
    game.passTurn(game.players[game.turn]);
    const pause = game.turnPause;
    game.turnPause = null;
    return pause;
}

const canPlay = (game, ...cards) => {
    const player = game.players[game.turn];
    return game.canPlayPile(player, new CardPile(player.name, ...cards.map(pick =>
        player.cards.find(held => held.suit == pick.suit && held.rank == pick.rank))));
};

test("every custom rule has a unique record key and English text", () => {
    const translations = fs.readFileSync(path.join(__dirname, "..", "js", "i18n.js"), "utf8");
    assert.equal(new Set(CUSTOM_RULES.map(rule => rule.record)).size, CUSTOM_RULES.length);
    CUSTOM_RULES.forEach(rule => {
        [rule.title, `${rule.title}:`, rule.summary, rule.details].forEach(text => {
            assert.ok(translations.includes(JSON.stringify(text)), `Missing translation: ${text}`);
        });
    });
    const roundTrip = customRulesFromRecord(customRulesToRecord({ downfall: true, openPass: true }));
    assert.deepEqual(Array.from(activeCustomRules(roundTrip), rule => rule.id).sort(), ["downfall", "openPass"]);
});

test("conflicting rules can't both be on, and every conflict is declared on both rules", () => {
    CUSTOM_RULES.forEach(rule => (rule.conflicts || []).forEach(id => {
        const other = CUSTOM_RULES.find(candidate => candidate.id == id);
        assert.ok(other.conflicts.includes(rule.id), `${id} must also conflict with ${rule.id}`);
        assert.equal(other.category, rule.category, "The editor shows conflicting rules in one box");
        const both = normalizeCustomRules({ [rule.id]: true, [id]: true });
        assert.equal(Number(both[rule.id]) + Number(both[id]), 1);
    }));
});

test("standard rules are unchanged while the new rules are off", () => {
    const game = makeGame([[card(5), card(10)], [card(5, 2), card(6)], [card(7), card(8)]]);
    play(game, card(5));
    assert.equal(game.turn, 1);
    play(game, card(5, 2));
    assert.equal(game.turn, 2, "Equal cards don't skip");
    assert.equal(game.piles.length, 2);
    assert.equal(game.turnDirection, undefined);
});

test("equal cards skip one active player", () => {
    const game = makeGame([[card(5), ...filler()], [card(5, 2), ...filler()], [card(7), ...filler()]],
        { sameRankSkip: true });
    play(game, card(5));
    const pause = play(game, card(5, 2));
    assert.equal(game.turn, 0, "P2 sits out");
    assert.equal(pause.extraMessage, "P2 står over.");
    assert.equal(game.skipNextPlayer, false);

    const higher = makeGame([[card(5), ...filler()], [card(6), ...filler()], [card(7), ...filler()]], { sameRankSkip: true });
    play(higher, card(5));
    assert.equal(play(higher, card(6)).extraMessage, undefined);
    assert.equal(higher.turn, 2, "A higher card doesn't skip");
});

test("equal cards hand the turn straight back with two players, and bots use the free play", () => {
    const game = makeGame([[card(5), ...filler()], [card(5, 2), card(8), ...filler()]], { sameRankSkip: true });
    play(game, card(5));
    play(game, card(5, 2));
    assert.equal(game.turn, 1);
    assert.equal(canPlay(game, card(8)), true);
    const view = BotAI.observe(game, game.players[1]);
    assert.equal(view.top.own, true);
    assert.notEqual(BotAI.chooseMove(view, "good"), null);
});

test("a clearing play doesn't carry the skip over to the next lead", () => {
    const game = makeGame([[card(5, 1), card(5, 3), ...filler()], [card(5, 2), card(5, 4), ...filler()], filler()],
        { sameRankSkip: true });
    play(game, card(5, 1), card(5, 3));
    play(game, card(5, 2), card(5, 4));
    assert.equal(game.piles.length, 0, "Four of a kind built on the table clears");
    assert.equal(game.turn, 1, "The player who cleared leads");
    assert.equal(game.skipNextPlayer, false);
});

test("higher value only rejects equal cards for players and bots", () => {
    const game = makeGame([[card(5), ...filler()], [card(5, 2), card(6), CLUB_THREE(), ...filler()]], { higherOnly: true });
    play(game, card(5));
    assert.equal(canPlay(game, card(5, 2)), false);
    assert.equal(canPlay(game, card(6)), true);
    assert.equal(canPlay(game, CLUB_THREE()), true);
    const info = {};
    assert.equal(game.canPlayRank(game.players[1], 5, info), false);
    assert.match(info.text, /Må legge høyere enn 5/);
    const ranks = BotAI.moves(BotAI.observe(game, game.players[1])).map(move => move[0].strengthRank);
    assert.equal(ranks.includes(5), false);
    assert.equal(ranks.includes(6), true);
});

test("four of a kind from hand always clears when the rule is on", () => {
    const fours = [card(5, 1), card(5, 2), card(5, 3), card(5, 4)];
    const higher = [card(9, 1), card(9, 2), card(9, 3), card(9, 4)];
    const standard = makeGame([[...fours, ...filler()], [...higher, ...filler()]]);
    play(standard, ...fours);
    assert.equal(standard.piles.length, 1, "Standard: a higher four can still answer");

    const game = makeGame([[...fours, ...filler()], [...higher, ...filler()]], { fourAlwaysClears: true });
    const pause = play(game, ...fours);
    assert.equal(game.piles.length, 0);
    assert.equal(game.turn, 0);
    assert.match(pause.message, /Fire like/);
    assert.equal(BotAI.clears({ rules: { fourAlwaysClears: true }, tableCards: [] }, fours), true);
});

test("an open pass lets a player answer newer cards, and clears once all pass on the same cards", () => {
    const hands = () => [[card(5), ...filler()], [card(7), card(8), ...filler()], [card(6), ...filler()]];
    const locked = makeGame(hands());
    play(locked, card(5));
    pass(locked);
    play(locked, card(6));
    pass(locked);
    assert.equal(locked.piles.length, 0, "Standard: P1 stays locked out, so the pile clears");

    const game = makeGame(hands(), { openPass: true });
    play(game, card(5));
    pass(game);
    assert.equal(game.players[1].lastPlay, "Pass");
    play(game, card(6));
    assert.equal(game.players[1].lastPlay, null, "New cards release the pass");
    pass(game);
    assert.equal(game.turn, 1, "P1 gets to answer");
    assert.equal(game.piles.length, 2);
    pass(game);
    assert.equal(game.piles.length, 0);
    assert.equal(game.turn, 2, "The last player to play leads");
});

test("a single two clears anything but four of a kind, while several twos follow the normal rules", () => {
    const pair = [card(5, 1), card(5, 2)];
    const game = makeGame([[...pair, ...filler()], [card(2, 1), ...filler()], filler()], { twoClears: true });
    play(game, ...pair);
    assert.equal(canPlay(game, card(2, 1)), true);
    const info = {};
    assert.equal(game.canPlayRank(game.players[1], 15, info), true);
    assert.equal(info.pile.length, 1);
    const pause = play(game, card(2, 1));
    assert.equal(game.piles.length, 0);
    assert.equal(game.turn, 1);
    assert.match(pause.message, /Toer/);

    const twos = [card(2, 1), card(2, 2)];
    const pairs = makeGame([[...pair, ...filler()], [...twos, ...filler()], filler()], { twoClears: true });
    play(pairs, ...pair);
    assert.equal(BotAI.moves(BotAI.observe(pairs, pairs.players[1])).some(move => move.length == 1 && move[0].strengthRank == 15), true);
    play(pairs, ...twos);
    assert.equal(pairs.piles.length, 2, "A pair of twos doesn't clear");

    const fours = [card(5, 1), card(5, 2), card(5, 3), card(5, 4)];
    const blocked = makeGame([[...fours, ...filler()], [card(2, 1), card(9, 1), card(9, 2), card(9, 3), card(9, 4)]], { twoClears: true });
    play(blocked, ...fours);
    assert.equal(canPlay(blocked, card(2, 1)), false);
    assert.equal(blocked.canPlayRank(blocked.players[1], 15), false);

    const standard = makeGame([[...pair, ...filler()], [card(2, 1), ...filler()]]);
    play(standard, ...pair);
    assert.equal(canPlay(standard, card(2, 1)), false);
});

test("tens follow the normal rules and burn the pile", () => {
    const game = makeGame([[card(8), ...filler()], [card(10), ...filler()], filler()], { tenClears: true });
    play(game, card(8));
    const pause = play(game, card(10));
    assert.equal(game.piles.length, 0);
    assert.equal(game.turn, 1);
    assert.match(pause.message, /Tier/);

    const higher = makeGame([[card(11), ...filler()], [card(10), ...filler()], filler()], { tenClears: true });
    play(higher, card(11));
    assert.equal(canPlay(higher, card(10)), false, "A ten can't go on a jack");
});

test("nines reverse the direction until the next nine, and a new round resets it", () => {
    const hands = () => [[card(9), card(6), ...filler()], [card(7), ...filler()], [card(8), ...filler()], [card(9, 2), card(10), ...filler()]];
    const standard = makeGame(hands());
    play(standard, card(9));
    assert.equal(standard.turn, 1);

    const game = makeGame(hands(), { reversingNine: true });
    const pause = play(game, card(9));
    assert.equal(pause.extraMessage, "Spillretningen snus!");
    assert.equal(game.turnDirection, -1);
    assert.equal(game.turn, 3, "Play moves to the other neighbour");
    assert.equal(BotAI.observe(game, game.players[3]).opponents[0].name, "P2", "Bots read the seats in turn order");
    play(game, card(9, 2));
    assert.equal(game.turnDirection, 1);
    assert.equal(game.turn, 0);

    game.turnDirection = -1;
    game.players.forEach((player, index) => { player.placement = 0; player.lastPlacement = 0; });
    game.prepareRound();
    assert.equal(game.turnDirection, 1);
});

test("the three of clubs can beat four of a kind, and keeps the pile open for its holder", () => {
    const fours = [card(5, 1), card(5, 2), card(5, 3), card(5, 4)];
    const standard = makeGame([[...fours, ...filler()], [CLUB_THREE(), ...filler()]]);
    play(standard, ...fours);
    assert.equal(standard.piles.length, 0, "Standard: nobody can answer, so the pile clears");

    const game = makeGame([[...fours, ...filler()], [CLUB_THREE(), ...filler()]], { clubThreeBeatsFour: true });
    play(game, ...fours);
    assert.equal(game.piles.length, 1);
    assert.equal(canPlay(game, CLUB_THREE()), true);
    assert.equal(BotAI.moves(BotAI.observe(game, game.players[1])).some(move => move[0].strengthRank == 16), true);
    const pause = play(game, CLUB_THREE());
    assert.equal(game.piles.length, 0);
    assert.match(pause.message, /Kløver 3/);
});

function exchangeGame(playerCount, rules, bumCards = null) {
    const game = makeGame(Array.from({ length: playerCount }, () => []), rules);
    game.players.forEach((player, index) => { player.placement = index + 1; });
    game.prepareRound();
    if (bumCards) {
        const bum = game.players[playerCount - 1];
        const others = game.players.slice(0, -1);
        bumCards.forEach(wanted => others.forEach(other => {
            const index = other.cards.findIndex(held => held.suit == wanted.suit && held.rank == wanted.rank);
            if (index >= 0) { other.cards.splice(index, 1, bum.cards.shift()); bum.cards.push(wanted); }
        }));
    }
    return game;
}

test("the three of clubs is handed up as the best card only when the rule is on", () => {
    const withClub = (rules) => {
        // Deals are random, so retry until the Bum holds the three of clubs.
        for (let attempt = 0; attempt < 500; attempt++) {
            const game = exchangeGame(3, rules);
            if (game.players[2].cards.some(held => held.isClubThree())) { return game; }
        }
        throw new Error("The Bum never held the three of clubs");
    };
    const standard = withClub({}).piles.find(exchange => exchange.mode == "Best");
    assert.equal(standard.cards.some(held => held.isClubThree()), false);
    const given = withClub({ clubThreeGiven: true }).piles.find(exchange => exchange.mode == "Best");
    assert.equal(given.cards[0].isClubThree(), true);
    assert.equal(given.cards.length, 2);
});

test("the trade-count rules set the top exchange at every player count, and the Vice pair trades one fewer", () => {
    const counts = (players, rules) => exchangeGame(players, rules).piles.map(exchange => exchange.count);
    assert.deepEqual(Array.from(counts(4, {})), [2, 1, 1, 2]);
    assert.deepEqual(Array.from(counts(4, { tradeOne: true })), [1, 1]);
    assert.deepEqual(Array.from(counts(4, { tradeThree: true })), [3, 2, 2, 3]);
    assert.deepEqual(Array.from(counts(3, {})), [2, 2]);
    assert.deepEqual(Array.from(counts(3, { tradeOne: true })), [1, 1]);
    assert.deepEqual(Array.from(counts(3, { tradeThree: true })), [3, 3]);
    assert.deepEqual(Array.from(counts(2, {})), [1, 1]);
    assert.deepEqual(Array.from(counts(2, { tradeOne: true })), [1, 1]);
    assert.deepEqual(Array.from(counts(2, { tradeThree: true })), [3, 3]);

    const three = exchangeGame(4, { tradeThree: true });
    assert.equal(three.piles[0].text, "Presidenten skal gi bomsen tre kort:");
    assert.equal(three.piles[1].text, "Visepresidenten skal gi visebomsen to kort:");
    assert.equal(three.piles[2].text, "Visebomsen skal gi visepresidenten sine to beste kort:");
    assert.equal(three.piles[2].cards.length, 2);
    assert.equal(three.piles[3].text, "Bomsen skal gi presidenten sine tre beste kort:");
    assert.equal(three.piles[3].cards.length, 3);
    const one = exchangeGame(4, { tradeOne: true });
    assert.equal(one.piles.some(exchange => [exchange.from, exchange.to].includes(1)), false,
        "The Vice President sits out when the top pair trades one card");
    const standard = exchangeGame(4, {});
    assert.equal(standard.piles[0].text, "Presidenten skal gi bomsen to kort:");
    assert.equal(standard.piles[3].text, "Bomsen skal gi presidenten sine to beste kort:");
    assert.equal(exchangeGame(3, {}).piles[1].text, "Boms må gi sine to beste kort til Presidenten:");
    assert.equal(exchangeGame(2, {}).piles[1].text, "Boms må gi sitt beste kort til Presidenten:");
    assert.equal(exchangeGame(3, { tradeOne: true }).piles[0].text, "Presidenten skal velge ett kort til Boms:");
});

test("quick play uses the saved preset only when the player opted in", () => {
    const cookies = new Map();
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const attributes = {};
            elements.set(id, {
                id, listeners: {}, disabled: false, textContent: "",
                setAttribute(name, value) { attributes[name] = value; },
                getAttribute: name => attributes[name],
                addEventListener(type, handler) { this.listeners[type] = handler; }
            });
        }
        return elements.get(id);
    };
    const context = vm.createContext({
        getCookie: name => cookies.get(name) ?? "",
        setCookie: (name, value) => cookies.set(name, String(value)),
        normalizeCustomRules, activeCustomRules, CUSTOM_RULES, showDialog() {}, GameLayout: {},
        document: { getElementById: element, addEventListener() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "custom-rules.js"), "utf8"), context);
    const ui = vm.runInContext("CustomRulesUI", context);
    const toggle = element("quickPlayMyRulesToggleButton");
    const quickRules = () => Array.from(activeCustomRules(ui.quickPlayRules()), rule => rule.id);

    ui.updateQuickPlaySetting();
    assert.equal(toggle.disabled, true, "There is nothing to use before a preset is saved");
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
    cookies.set("QuickPlayUsesMyRules", "true");
    assert.deepEqual(quickRules(), [], "No preset falls back to Standard");

    cookies.clear();
    cookies.set("CustomRulesPreset", "openPass.downfall");
    ui.updateQuickPlaySetting();
    assert.equal(toggle.disabled, false);
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
    assert.deepEqual(quickRules(), [], "A saved preset alone keeps Standard");

    toggle.listeners.click.call(toggle);
    assert.equal(cookies.get("QuickPlayUsesMyRules"), "true");
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    assert.deepEqual(quickRules().sort(), ["downfall", "openPass"]);

    toggle.listeners.click.call(toggle);
    assert.equal(cookies.get("QuickPlayUsesMyRules"), "false");
    assert.deepEqual(quickRules(), []);
});

test("a new game is created with the rules it is given", () => {
    const records = [];
    const database = () => ({
        ref: gamePath => gamePath.startsWith("boms_1/")
            ? { transaction(transform) { records.push(transform(null)); return Promise.resolve(); } }
            : { remove: () => Promise.resolve() }
    });
    const context = vm.createContext({
        console, Math, getCookie: () => null, getPlayerKey: () => "host", firebase: { database },
        localStorage: { getItem: () => null }, setTimeout: () => 0, clearTimeout() {},
        document: { dispatchEvent() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    });
    for (const file of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "layout-animations.js", "layout-table.js", "layout-hand.js", "engine.js", "bot-turn.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    const Game = vm.runInContext("PresidentGame", context);
    const standard = new Game(null, true);
    assert.equal(records[0].regler.BytteTreKort, false);
    assert.equal(activeCustomRules(standard.rules).length, 0);
    const custom = new Game(null, true, { tradeThree: true });
    assert.equal(records[1].regler.BytteTreKort, true, "The rules are in the room from its first write");
    assert.deepEqual(Array.from(activeCustomRules(custom.rules), rule => rule.id), ["tradeThree"]);
});

test("the President can open the round instead of the Bum", () => {
    assert.equal(exchangeGame(4, {}).roundStarterName, "P3");
    assert.equal(exchangeGame(4, { presidentStarts: true }).roundStarterName, "P0");
});

test("downfall drops the sitting President to the worst free place when someone else goes out first", () => {
    const hands = () => [[card(4), card(5)], [card(13)], [card(6), card(7)], [card(8), card(9)]];
    const seat = game => { game.players.forEach((player, index) => { player.lastPlacement = index + 1; }); game.setTurn(1); };
    const standard = makeGame(hands());
    seat(standard);
    play(standard, card(13));
    assert.equal(standard.players[0].placement, 0);

    const game = makeGame(hands(), { downfall: true });
    seat(game);
    const pause = play(game, card(13));
    assert.equal(game.players[1].placement, 1);
    assert.equal(game.players[0].placement, 4);
    assert.equal(pause.extraMessage, "P0 mister makten!");
    assert.equal(game.players[0].cards.length, 2, "The fallen President keeps their cards");
    assert.equal(game.turn, 2);
    pass(game);
    pass(game);
    assert.equal(game.piles.length, 0);
    assert.equal(game.players[game.turn].placement, 0, "The fallen President never leads");
});

test("downfall doesn't apply to the President winning, or to a first round without roles", () => {
    const hands = () => [[card(13)], [card(4), card(5)], [card(6), card(7)]];
    const reigning = makeGame(hands(), { downfall: true });
    reigning.players.forEach((player, index) => { player.lastPlacement = index + 1; });
    play(reigning, card(13));
    assert.equal(reigning.players[0].placement, 1);
    assert.deepEqual(reigning.players.slice(1).map(player => player.placement), [0, 0]);

    const first = makeGame([[card(4), card(5)], [card(13)], [card(6), card(7)]], { downfall: true });
    first.setTurn(1);
    play(first, card(13));
    assert.deepEqual(first.players.map(player => player.placement), [0, 1, 0]);
});

test("downfall ends a three-player round with every place filled", () => {
    const game = makeGame([[card(4), card(5)], [card(13)], [card(6), card(7)]], { downfall: true });
    game.players.forEach((player, index) => { player.lastPlacement = index + 1; });
    game.setTurn(1);
    play(game, card(13));
    assert.deepEqual(game.players.map(player => player.placement), [3, 1, 2]);
});

// Full games driven through the real engine: an illegal bot move throws in playCards.
function seededRandom(seed) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function playRound(game, random) {
    for (let step = 0; step < 5000; step++) {
        if (game.players.every(player => player.placement != 0)) { return; }
        game.turnPause = null;
        game.exchangeReady = null;
        if (game.status == "G") {
            game.players.forEach(player => {
                if (game.status == "G") { game.turnPause = null; playBotTurn(game, player, random); }
            });
            continue;
        }
        const current = game.players[game.turn];
        assert.ok(current, "Someone must have the turn while cards remain");
        assert.equal(current.placement, 0, "A finished player never gets the turn");
        playBotTurn(game, current, random);
    }
    assert.fail("The round never finished");
}

const RULE_SETS = [
    ...CUSTOM_RULES.filter(rule => !["sevenJackTrade", "sneakyTrade"].includes(rule.id)).map(rule => ({ [rule.id]: true })),
    { sameRankSkip: true, fourAlwaysClears: true, openPass: true, twoClears: true, tenClears: true, reversingNine: true, clubThreeGiven: true, tradeThree: true, presidentStarts: true, downfall: true },
    { higherOnly: true, clubThreeBeatsFour: true, openPass: true, twoClears: true, reversingNine: true, tradeOne: true, downfall: true }
];

for (const playerCount of [2, 3, 4]) {
    test(`bots finish two legal rounds with ${playerCount} players under every rule`, () => {
        RULE_SETS.forEach((rules, index) => {
            const random = seededRandom(index + playerCount * 100);
            const game = makeGame(Array.from({ length: playerCount }, () => []), rules);
            game.players.forEach((player, seat) => { player.botSkill = ["good", "pro", "god", "good"][seat]; });
            game.prepareRound();
            playRound(game, random);
            const places = game.players.map(player => player.placement).sort((a, b) => a - b);
            assert.deepEqual(places, Array.from({ length: playerCount }, (_, place) => place + 1), JSON.stringify(rules));
            game.status = "S";
            game.piles = [];
            game.prepareRound();
            playRound(game, random);
            assert.deepEqual(game.players.map(player => player.placement).sort((a, b) => a - b),
                Array.from({ length: playerCount }, (_, place) => place + 1), JSON.stringify(rules));
        });
    });
}
