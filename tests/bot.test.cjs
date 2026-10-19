const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function seededRandom(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function loadBots() {
    const context = vm.createContext({
        console, Math, getCookie: () => null, getPlayerKey: () => "host",
        localStorage: { getItem: () => null }, setTimeout: () => 0, clearTimeout() {},
        document: { dispatchEvent() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    });
    for (const file of [
        "cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "engine.js", "bot-turn.js"
    ]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(source, context);
    }
    return vm.runInContext("({ BotAI, PresidentGame, PresidentPlayer, PresidentCard, CardDeck, CardPile, playBotTurn, BOT_NAMES, isCardAllowedForExchange })", context);
}

const types = loadBots();
const { BotAI, PresidentGame, PresidentPlayer, PresidentCard, CardDeck, CardPile, playBotTurn, isCardAllowedForExchange } = types;
const card = (rank, suit = 1) => new PresidentCard(suit, rank);
const view = (cards, top = null, opponents = [{ name: "Other", count: 8, passed: false }]) =>
    ({ cards, top, opponents: opponents.map(other => ({
        ...other, cards: Array.from({ length: other.count }, (_, index) => card(4 + index % 9, 2))
    })), tableCards: [], playedCards: [], playerCount: 3 });

function gameWithHands(hands, skills = hands.map(() => "good")) {
    const players = hands.map((cards, index) => {
        const player = new PresidentPlayer("Bot " + index, "PC");
        player.cards = new CardDeck(...cards);
        player.botSkill = skills[index];
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "test", players, status: "S", piles: [], playedCards: [], turn: 0,
        turnPause: null, round: 1, rules: {}, hostKey: "host", hostName: "Host"
    });
    game.save = () => {};
    game.finishGame = () => { game.status = "F"; };
    game.setTurn(0);
    return game;
}

function optionalTradeGame() {
    const game = gameWithHands([
        [card(7), card(9), card(14)], [card(8, 2), card(10, 2), card(13, 2)],
        [card(5, 4), card(12, 4), card(15, 4)]
    ]);
    game.status = "G";
    game.players.forEach((player, index) => { player.lastPlacement = index + 1; });
    game.piles = [{ id: "offer", tradeId: "trade", kind: "playerTrade", mode: "Tilbud",
        from: 0, to: 1, count: 1, cards: [], sneakyVotes: [] }];
    return game;
}

test("bot-initiated sneaky offers require both votes and complete legally through actual engine turns", () => {
    const game = optionalTradeGame();
    const before = game.players.reduce((sum, player) => sum + player.cards.length, 0);
    let rolls = 0;
    playBotTurn(game, game.players[0], () => { rolls++; return 0; });
    assert.equal(game.piles[0].mode, "Tilbud");
    assert.deepEqual(Array.from(game.piles[0].sneakyVotes), [0]);
    playBotTurn(game, game.players[0], () => { throw new Error("Decision must be cached"); });
    assert.equal(rolls, 1);
    playBotTurn(game, game.players[1], () => 0);
    assert.equal(game.piles[0].mode, "Tilbud");
    playBotTurn(game, game.players[0], () => { throw new Error("Decision must be cached"); });
    assert.equal(game.piles.filter(exchange => exchange.mode == "Tilbud").length, 0);
    assert.ok(game.piles.every(exchange => exchange.sneakyVotes.length === 2));
    for (let step = 0; step < 8 && game.status === "G"; step++) {
        for (const player of game.players) {
            if (game.status === "G") { playBotTurn(game, player, () => 0); }
        }
    }
    assert.equal(game.status, "S");
    assert.equal(game.players.reduce((sum, player) => sum + player.cards.length, 0) +
        game.piles.reduce((sum, pile) => sum + pile.length, 0), before);
});

test("sneaky consent may be added after initiation until a card is given", () => {
    const game = optionalTradeGame();
    const offer = game.piles[0];
    game.toggleSneakyTrade(offer, 0);
    game.startOptionalTrade(offer);
    const outgoing = game.piles.find(exchange => exchange.from === 0);
    const incoming = game.piles.find(exchange => exchange.from === 1);
    assert.ok(game.piles.every(exchange => !exchange.sneakyLocked));
    game.toggleSneakyTrade(incoming, 1);
    assert.ok(game.piles.every(exchange => exchange.sneakyVotes.length === 2));
    assert.ok(game.piles.every(exchange => isCardAllowedForExchange(exchange, card(14))));
    outgoing.cards = [card(14)];
    game.giveExchangeCards(outgoing);
    assert.equal(outgoing.mode, "Gitt");
    assert.ok(game.piles.every(exchange => exchange.sneakyLocked));
    assert.throws(() => game.toggleSneakyTrade(incoming, 1), /kan ikke endres/);
});

test("mutual consent at initiation allows cards outside 7–J without requiring a legal normal card", () => {
    const game = optionalTradeGame();
    game.players[0].cards = new CardDeck(card(14));
    game.players[1].cards = new CardDeck(card(13, 2));
    const offer = game.piles[0];
    assert.throws(() => game.startOptionalTrade(offer), /7 til J/);
    game.toggleSneakyTrade(offer, 0);
    game.toggleSneakyTrade(offer, 1);
    assert.equal(game.piles.length, 1);
    game.startOptionalTrade(offer);
    const outgoing = game.piles.find(exchange => exchange.from === 0);
    outgoing.cards = [card(14)];
    game.giveExchangeCards(outgoing);
    assert.equal(outgoing.mode, "Gitt");
});

test("a bot declining sneaky consent cannot leave the initiating bot stuck forever", () => {
    const game = optionalTradeGame();
    playBotTurn(game, game.players[0], () => 0);
    playBotTurn(game, game.players[1], () => 0.99);
    assert.equal(game.piles[0].botDecisions[1], "skip");
    playBotTurn(game, game.players[0], () => { throw new Error("Decision must be cached"); });
    assert.ok(game.piles.every(pile => pile.mode !== "Tilbud"));
    assert.equal(game.status, "S");
});

test("optional bot decisions survive exchange serialization and host handoff", () => {
    const game = optionalTradeGame();
    game.piles[0].botDecisions = { 0: "sneaky", 1: "skip" };
    const restored = PresidentGame.deserializeExchanges(game.serializePiles());
    assert.equal(restored[0].botDecisions[0], "sneaky");
    assert.equal(restored[0].botDecisions[1], "skip");
});

test("a human recipient can decline a bot's optional trade without waiting for a timeout", () => {
    const game = optionalTradeGame();
    game.players[1].playerKey = "human";
    const offer = game.piles[0];
    game.skipOptionalTrade(offer, 1);
    assert.equal(game.status, "S");
    assert.equal(game.piles.length, 0);
});

test("skills default to good, persist for bots, and reject unknown levels explicitly", () => {
    assert.equal(new PresidentPlayer("New", "PC").botSkill, "good");
    for (const skill of BotAI.skills) {
        const player = new PresidentPlayer("Bot", "PC");
        player.botSkill = skill;
        assert.equal(new PresidentPlayer().fromRecord(player.toRecord()).botSkill, skill);
    }
    const legacy = new PresidentPlayer("Old", "PC").toRecord();
    delete legacy.botSkill;
    assert.equal(new PresidentPlayer().fromRecord(legacy).botSkill, "good");
    const human = new PresidentPlayer("Human", "host");
    assert.equal(Object.hasOwn(human.toRecord(), "botSkill"), false);
    assert.throws(() => BotAI.skill("super"), /Ukjent botnivå/);
});

test("good and pro preserve a pair while answering a single", () => {
    const cards = [card(6), card(7), card(7, 2), card(1)];
    const state = view(cards, { rank: 5, count: 1, own: false });
    for (const skill of ["good", "pro"]) {
        assert.equal(BotAI.chooseMove(state, skill, seededRandom(1))[0], cards[0]);
    }
    assert.ok(BotAI.chooseMove(state, "bad", () => 0.5));
});

test("good blocks a single-card opponent with a pair and pro avoids a weak single", () => {
    const cards = [card(4), card(8), card(8, 2), card(1)];
    const state = view(cards, null, [{ name: "Threat", count: 1, passed: false }]);
    assert.equal(BotAI.chooseMove(state, "good", seededRandom(2)).length, 2);
    const pro = BotAI.chooseMove(state, "pro", seededRandom(2));
    assert.ok(pro.length == 2 || pro[0].strengthRank >= 14);
});

test("every level takes a legal win and sheds club three before the last card", () => {
    for (const skill of BotAI.skills) {
        const pair = [card(7), card(7, 2)];
        assert.equal(BotAI.chooseMove(view(pair), skill, seededRandom(3)).length, 2);
        const cards = [card(1), card(3, 3)];
        assert.equal(BotAI.chooseMove(view(cards), skill, seededRandom(3))[0], cards[1]);
        const forced = [card(3, 3)];
        assert.equal(BotAI.chooseMove(view(forced), skill, seededRandom(3))[0], forced[0]);
    }
});

test("bots can pass only on occupied tables and cannot respond with the wrong count", () => {
    const cards = [card(6), card(7)];
    for (const skill of BotAI.skills) {
        assert.equal(BotAI.chooseMove(view(cards, { rank: 5, count: 2 }), skill, () => 0.1), null);
        assert.ok(BotAI.chooseMove(view(cards), skill, () => 0.1));
    }
    assert.equal(BotAI.chooseMove(view(cards, { rank: 5, count: 1 }), "bad", () => 0.1), null);
});

test("four accumulated equal cards require four higher cards or club three", () => {
    const cards = [card(6), card(6, 2), card(7), card(7, 2), card(7, 3), card(7, 4), card(3, 3)];
    const moves = BotAI.moves(view(cards, { rank: 5, count: 4 }));
    assert.deepEqual(Array.from(moves, move => [move[0].strengthRank, move.length]), [[7, 4], [16, 1]]);
});

test("observations never inspect opponents' hidden cards or chosen difficulty", () => {
    const game = gameWithHands([[card(6), card(7)], [card(1)], [card(8)]]);
    game.players.slice(1).forEach(player => {
        player.cards = new Proxy(player.cards, {
            get(target, key) {
                if (key !== "length") { throw new Error("Read hidden opponent cards: " + String(key)); }
                return target.length;
            }
        });
        Object.defineProperty(player, "botSkill", { get() { throw new Error("Read opponent skill"); } });
    });
    for (const skill of ["bad", "good", "pro"]) {
        const observed = BotAI.observe(game, game.players[0]);
        assert.ok(BotAI.chooseMove(observed, skill, seededRandom(4)));
        assert.deepEqual(Object.keys(observed.opponents[0]).sort(), ["count", "name", "passed"]);
    }
});

test("all 26 names belong to exactly one approved bucket and existing bots migrate", () => {
    const names = Object.values(BotAI.buckets).flat();
    assert.equal(names.length, 26);
    assert.equal(new Set(names).size, 26);
    assert.deepEqual([...names].sort(), Array.from(types.BOT_NAMES).sort());
    assert.deepEqual(Object.values(BotAI.buckets).map(bucket => bucket.length), [7, 10, 7, 2]);
    for (const [skill, bucket] of Object.entries(BotAI.buckets)) {
        for (const name of bucket) {
            assert.equal(new PresidentPlayer(name, "PC").botSkill, skill);
            const legacy = new PresidentPlayer(name, "PC").toRecord();
            legacy.botSkill = "good";
            delete legacy.botSkillVersion;
            assert.equal(new PresidentPlayer().fromRecord(legacy).botSkill, skill);
            assert.equal(new PresidentPlayer(name.toUpperCase(), "PC").botSkill, skill);
        }
    }
    const explicit = new PresidentPlayer("Mysil Bergsprekken", "PC");
    explicit.botSkill = "bad";
    assert.equal(new PresidentPlayer().fromRecord(explicit.toRecord()).botSkill, "bad");
});

test("only God sees actual opponent hands, with copies instead of mutable references", () => {
    const game = gameWithHands([[card(4), card(5)], [card(1)], [card(8), card(9)]], ["god", "pro", "good"]);
    const state = BotAI.observe(game, game.players[0]);
    assert.equal(state.opponents[0].cards[0], game.players[1].cards[0]);
    state.opponents[0].cards.pop();
    assert.equal(game.players[1].cards.length, 1);
    for (const skill of ["bad", "good", "pro"]) {
        game.players[0].botSkill = skill;
        assert.ok(BotAI.observe(game, game.players[0]).opponents.every(other => !("cards" in other)));
    }
    const publicView = BotAI.observe(game, game.players[0]);
    assert.throws(() => BotAI.chooseMove(publicView, "god"), /faktiske kort/);
});

test("God uses exact cards to choose the cheapest safe lead against a one-card opponent", () => {
    for (const [opponentRank, expectedRank] of [[8, 10], [13, 1], [2, 4]]) {
        const game = gameWithHands([
            [card(4), card(10), card(1)], [card(opponentRank, 2)]
        ], ["god", "pro"]);
        const state = BotAI.observe(game, game.players[0]);
        const move = BotAI.chooseMove(state, "god", () => assert.fail("God must not sample unknown cards"));
        assert.equal(move[0].rank, expectedRank);
    }
});

test("same public state gives identical pro decisions despite different hidden hands", () => {
    const game = gameWithHands([[card(6), card(7), card(7, 2), card(1)], [card(8), card(9)], [card(10)]]);
    const before = BotAI.chooseMove(BotAI.observe(game, game.players[0]), "pro", seededRandom(5));
    game.players[1].cards = [card(2), card(2, 2)];
    game.players[2].cards = [card(3, 3)];
    const after = BotAI.chooseMove(BotAI.observe(game, game.players[0]), "pro", seededRandom(5));
    assert.deepEqual(Array.from(after, c => c.code()), Array.from(before, c => c.code()));
});

test("pro samples exclude public cards and account for the undealt two-player cards", () => {
    const state = view([card(4)], null, [{ name: "Opponent", count: 1, passed: false }]);
    state.playerCount = 2;
    state.playedCards = [card(1), card(3, 3)];
    for (const hands of BotAI.samples(state, seededRandom(6))) {
        assert.equal(hands[0].length, 1);
        assert.ok(!["S4", "SA", "C3"].includes(hands[0][0].code()));
    }
    state.playerCount = 3;
    state.opponents[0].count = 48;
    assert.ok(BotAI.samples(state, seededRandom(7)).every(hands =>
        hands[0].every(c => c.code() !== "D3")));
});

test("public card memory changes pro control estimates without seeing hidden hands", () => {
    const state = view([card(13), card(4)], null, [{ name: "Other", count: 1, passed: false }]);
    const move = [state.cards[0]];
    const before = BotAI.responseRisk(state, move, BotAI.samples(state, seededRandom(8)));
    state.playedCards = [];
    for (const rank of [13, 1, 2]) {
        for (let suit = 1; suit <= 4; suit++) { state.playedCards.push(card(rank, suit)); }
    }
    state.playedCards.push(card(3, 3));
    const after = BotAI.responseRisk(state, move, BotAI.samples(state, seededRandom(8)));
    assert.equal(after.control, 1);
    assert.ok(before.control < after.control);
});

test("exchange choices preserve combinations, never mutate the hand, and honor available cards", () => {
    const cards = [card(4), card(4, 2), card(5), card(6), card(2)];
    for (const skill of ["good", "pro"]) {
        const chosen = BotAI.chooseExchange(cards, cards, 2, skill);
        assert.deepEqual(Array.from(chosen, c => c.rank), [5, 6]);
    }
    for (const skill of BotAI.skills) {
        const available = cards.slice(2);
        const chosen = BotAI.chooseExchange(cards, available, 2, skill, seededRandom(9));
        assert.equal(chosen.length, 2);
        assert.equal(new Set(chosen).size, 2);
        assert.ok(chosen.every(c => available.includes(c)));
    }
    assert.deepEqual(cards.map(c => c.rank), [4, 4, 5, 6, 2]);
    assert.throws(() => BotAI.chooseExchange(cards, [], 2), /ikke nok gyldige/);
});

function optionalOffer(game, from = 0, to = 1) {
    game.status = "G";
    const offer = {
        id: "optional", tradeId: "optional-trade", kind: "playerTrade",
        from, to, count: 1, mode: "Tilbud", cards: [], sneakyVotes: []
    };
    game.piles = [offer];
    return offer;
}

test("optional trade chances are seeded, skill-dependent, and use one roll per decision", () => {
    const frequencies = [];
    for (const skill of BotAI.skills) {
        const game = gameWithHands([[card(7), card(12), card(2)], [card(8)], [card(9)]]);
        const offer = optionalOffer(game);
        game.players[0].botSkill = skill;
        const decide = () => {
            const random = seededRandom(42);
            return Array.from({ length: 1000 }, () =>
                BotAI.chooseOptionalTrade(game, game.players[0], offer, random));
        };
        const decisions = decide();
        assert.deepEqual(decisions, decide());
        frequencies.push({
            sneaky: decisions.filter(value => value == "sneaky").length,
            active: decisions.filter(value => value != "skip").length
        });
        let rolls = 0;
        BotAI.chooseOptionalTrade(game, game.players[0], offer, () => { rolls++; return 0.5; });
        assert.equal(rolls, 1);
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, () => 0), "sneaky");
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, () => 0.99), "skip");
    }
    for (let index = 1; index < frequencies.length; index++) {
        assert.ok(frequencies[index].sneaky > frequencies[index - 1].sneaky);
        assert.ok(frequencies[index].active > frequencies[index - 1].active);
    }
});

test("ordinary offers use only the bot's hand, respect reservations, and preserve useful cards", () => {
    for (const skill of BotAI.skills) {
        const game = gameWithHands([[card(7), card(12), card(2)], [card(8)], [card(9)]]);
        game.players[0].botSkill = skill;
        const offer = optionalOffer(game);
        const normalRandom = () => ({ bad: 0.2, good: 0.4, pro: 0.5, god: 0.6 })[skill];
        game.players.slice(1).forEach(other => {
            Object.defineProperty(other, "cards", { get() { throw new Error("Hidden hand"); } });
        });
        game.piles.push({
            from: 1, to: 0, mode: "Velg",
            get cards() { throw new Error("Hidden selection"); }
        });
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, normalRandom), "normal");
        game.piles.push({ from: 0, to: 2, mode: "Best", cards: [game.players[0].cards[0]] });
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, normalRandom), "skip");
        game.piles.pop();
        game.players[0].cards = [card(11), card(12), card(2)];
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, normalRandom), skill == "bad" ? "normal" : "skip");
        game.players[0].cards = [card(7), card(7, 2), card(12)];
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, normalRandom), skill == "bad" ? "normal" : "skip");
    }
});

test("target bots can consent to sneaky but never initiate a normal trade or mutate votes", () => {
    const game = gameWithHands([[card(8)], [card(7), card(12)], [card(9)]]);
    const offer = optionalOffer(game);
    for (const skill of BotAI.skills) {
        game.players[1].botSkill = skill;
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[1], offer, () => 0), "sneaky");
        assert.equal(BotAI.chooseOptionalTrade(game, game.players[1], offer, () => 0.5), "skip");
    }
    assert.deepEqual(offer.sneakyVotes, []);
    assert.equal(offer.mode, "Tilbud");
    assert.equal(BotAI.chooseOptionalTrade(game, game.players[2], offer, () => 0), "skip");
    offer.mode = "Velg";
    assert.equal(BotAI.chooseOptionalTrade(game, game.players[0], offer, () => 0), "skip");

    const startedTrade = optionalTradeGame();
    startedTrade.startOptionalTrade(startedTrade.piles[0]);
    playBotTurn(startedTrade, startedTrade.players[1], () => 0);
    assert.ok(startedTrade.piles.every(exchange => exchange.sneakyVotes.length === 2));
    assert.ok(startedTrade.piles.some(exchange => exchange.mode === "Gitt"));
});

test("all sneaky skills use the actual chosen incoming card, before and after it is given", () => {
    for (const skill of BotAI.skills) {
        for (const mode of ["Velg", "Gitt", "Kan se"]) {
            const seven = card(7), eight = card(8);
            const game = gameWithHands([[seven, card(7, 2), eight, card(4)], [card(12), card(13)], [card(9)]]);
            game.players[0].botSkill = skill;
            const exchange = {
                ...optionalOffer(game), mode: "Velg", sneakyVotes: [0, 1]
            };
            const incoming = {
                ...exchange, id: "return", from: 1, to: 0, mode, cards: [card(7, 3)]
            };
            game.piles = [exchange, incoming];
            if (mode == "Velg") { game.players[1].cards.push(incoming.cards[0]); }
            assert.equal(BotAI.chooseSneakyExchange(game, game.players[0], exchange, [seven, eight],
                seededRandom(1))[0], eight);
            if (mode == "Velg") { game.players[1].cards.pop(); }
            incoming.cards = [{ suit: 3, rank: 8 }];
            assert.equal(BotAI.chooseSneakyExchange(game, game.players[0], exchange, [seven, eight],
                seededRandom(1))[0], seven);
            assert.deepEqual(Array.from(game.players[0].cards, c => c.rank), [7, 7, 8, 4]);
        }
    }
});

test("sneaky exchange avoids completing an opponent pair and predicts unchosen incoming cards", () => {
    const four = card(4), five = card(5);
    const game = gameWithHands([[four, five, card(12)], [card(4, 2), card(2)], [card(9)]]);
    game.players[0].lastPlacement = 2;
    game.players[1].lastPlacement = 1;
    const exchange = { ...optionalOffer(game), mode: "Velg", sneakyVotes: [0, 1] };
    const incoming = { ...exchange, id: "return", from: 1, to: 0, cards: [game.players[1].cards[1]] };
    game.piles = [exchange, incoming];
    assert.equal(BotAI.chooseSneakyExchange(game, game.players[0], exchange, [four, five])[0], five);
    incoming.cards = [];
    const before = Array.from(game.players[1].cards);
    const chosen = BotAI.chooseSneakyExchange(game, game.players[0], exchange, [four, five]);
    assert.equal(chosen.length, 1);
    assert.ok([four, five].includes(chosen[0]));
    assert.deepEqual(Array.from(game.players[1].cards), before);
});

test("sneaky role pressure values denying a higher-ranked rival more than a lower-ranked rival", () => {
    const six = card(6), jack = card(11);
    const game = gameWithHands([[six, jack, card(12)], [card(6, 2), card(2)], [card(9)]]);
    const player = game.players[0];
    player.lastPlacement = 2;
    const exchange = { ...optionalOffer(game), mode: "Velg", sneakyVotes: [0, 1] };
    game.piles = [exchange, {
        ...exchange, id: "return", from: 1, to: 0, cards: [game.players[1].cards[1]]
    }];
    game.players[1].lastPlacement = 3;
    assert.equal(BotAI.chooseSneakyExchange(game, player, exchange, [six, jack])[0], six);
    game.players[1].lastPlacement = 1;
    assert.equal(BotAI.chooseSneakyExchange(game, player, exchange, [six, jack])[0], jack);
});

test("sneaky choices require both real participants' consent and return distinct legal available cards", () => {
    const game = gameWithHands([[card(4), card(5), card(6), card(3, 3)], [card(8), card(9)], [card(10)]]);
    const exchange = { ...optionalOffer(game), count: 2, mode: "Velg", sneakyVotes: [0, 2] };
    const player = game.players[0];
    assert.throws(() => BotAI.chooseSneakyExchange(game, player, exchange, player.cards), /samtykke/);
    exchange.sneakyVotes = [0, 1];
    const reserved = { id: "mandatory", from: 0, to: 2, count: 1, mode: "Best", cards: [player.cards[0]] };
    game.piles = [exchange, reserved];
    const available = [player.cards[0], player.cards[1], player.cards[1], player.cards[2], card(1)];
    for (const skill of BotAI.skills) {
        player.botSkill = skill;
        const chosen = BotAI.chooseSneakyExchange(game, player, exchange, available, seededRandom(3));
        assert.deepEqual(Array.from(chosen), [player.cards[1], player.cards[2]]);
    }
    assert.throws(() => BotAI.chooseSneakyExchange(game, player, exchange, [player.cards[1]]), /ikke nok gyldige/);
    exchange.count = 1;
    assert.equal(BotAI.chooseSneakyExchange(game, player, exchange, [player.cards[3]])[0], player.cards[3]);
});

test("actual bot turns persist public memory, validate moves, and preserve hand order", () => {
    for (const skill of BotAI.skills) {
        const game = gameWithHands([[card(4), card(7), card(7, 2)], [card(8), card(9)], [card(10)]]);
        const player = game.players[0];
        player.botSkill = skill;
        const before = player.cards.slice();
        playBotTurn(game, player, seededRandom(10));
        assert.ok(game.playedCards.length > 0);
        assert.deepEqual(Array.from(player.cards), Array.from(before.filter(c => player.cards.includes(c))));
        let record;
        delete game.save;
        game.databaseRef = { update(value) { record = value; return Promise.resolve(); } };
        game.updatePublicListing = () => {};
        game.save();
        assert.deepEqual(record.playedCards, game.playedCards);
        assert.equal(record.spillere[0].botSkill, skill);
        game.turnPause = null;
        game.prepareRound();
        assert.equal(game.playedCards.length, 0);
    }
});

test("actual exchanges obey restrictions and retain skill when returning to the lobby", () => {
    const game = gameWithHands([
        [card(4), card(4, 2), card(7), card(8), card(2), card(3, 3)], [card(9)], [card(10)]
    ]);
    game.players[0].botSkill = "pro";
    game.status = "G";
    game.piles = [{
        id: "trade", kind: "playerTrade", from: 0, to: 1, count: 1, mode: "Velg", cards: []
    }];
    game.giveExchangeCards = exchange => {
        assert.ok(exchange.cards.every(c => c.strengthRank >= 7 && c.strengthRank <= 11));
        exchange.mode = "Gitt";
    };
    playBotTurn(game, game.players[0]);
    assert.equal(game.piles[0].mode, "Gitt");
    game.status = "F";
    game.clearNeutralRoundVoteRecord = () => {};
    game.clearGameEndVoteRecord = () => {};
    game.returnToLobby();
    assert.equal(game.players[0].botSkill, "pro");
    assert.equal(game.playedCards.length, 0);
});

test("even bad bots cannot give club three in a mandatory exchange", () => {
    for (const skill of BotAI.skills) {
        const game = gameWithHands([[card(4), card(5), card(3, 3)], [card(6)], [card(7)]]);
        game.players[0].botSkill = skill;
        game.status = "G";
        game.piles = [{ from: 0, to: 1, count: 2, mode: "Velg", cards: [] }];
        game.giveExchangeCards = exchange => {
            assert.ok(exchange.cards.every(c => !c.isClubThree()));
            assert.equal(exchange.cards.length, 2);
            exchange.mode = "Gitt";
        };
        playBotTurn(game, game.players[0], seededRandom(11));
        assert.equal(game.piles[0].mode, "Gitt");
    }
});

test("bot turns respect gameplay pauses and do not act for another player's turn", () => {
    const game = gameWithHands([[card(4), card(5)], [card(6)], [card(7)]]);
    game.turnPause = { until: Date.now() + 10000, kind: "play" };
    const before = game.players[0].cards.slice();
    playBotTurn(game, game.players[0]);
    assert.deepEqual(Array.from(game.players[0].cards), Array.from(before));
    game.turnPause = null;
    playBotTurn(game, game.players[1]);
    assert.equal(game.playedCards.length, 0);
});

test("rollouts agree with the actual engine when supplied the same hands", () => {
    for (const hands of [
        [[card(4), card(7)], [card(5), card(1)], [card(8), card(10)]],
        [[card(3, 3), card(4)], [card(6), card(6, 2)], [card(9), card(2)]],
        [[card(3), card(3, 2)], [card(4), card(7)], [card(1), card(8)]],
        [[card(7), card(7, 2), card(7, 3), card(7, 4)], [card(8)], [card(9), card(10)]]
    ]) {
        const game = gameWithHands(hands);
        const state = BotAI.observe(game, game.players[0]);
        const move = BotAI.chooseMove(state, "good");
        const forecast = BotAI.rollout(state, move, game.players.slice(1).map(p => p.cards));
        const pile = new CardPile(game.players[0].name);
        move.forEach(c => pile.push(c));
        game.playCards(game.players[0], pile);
        let turns = 0;
        while (game.status == "S" && turns++ < 200) {
            if (game.turnPause && game.turnPause.pendingGameEnd) {
                game.finishGame();
                break;
            }
            game.turnPause = null;
            playBotTurn(game, game.players[game.turn]);
        }
        assert.equal(game.status, "F");
        assert.equal(forecast, (game.players.length - game.players[0].placement) / (game.players.length - 1));
    }
});

function simulate(seed, skills) {
    const random = seededRandom(seed);
    const deck = new CardDeck();
    deck.addStandardCards((suit, rank) => new PresidentCard(suit, rank));
    if (skills.length == 3) { deck.splice(deck.findIndex(c => c.suit == 4 && c.rank == 3), 1); }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (skills.length == 2) { deck.splice(0, 12); }
    const hands = skills.map(() => []);
    deck.forEach((c, index) => hands[index % skills.length].push(c));
    const game = gameWithHands(hands, skills);
    const heartThree = game.players.findIndex(p => p.cards.some(c => c.suit == 2 && c.rank == 3));
    game.setTurn(heartThree < 0 ? 0 : heartThree);
    const decisions = skills.map((skill, index) => seededRandom(seed * 31 + index));
    let turns = 0;
    let maxDecisionMs = 0;
    while (game.status == "S" && turns < 1000) {
        if (game.turnPause) {
            const pause = game.turnPause;
            if (pause.pendingGameEnd) {
                game.finishGame();
                break;
            }
            game.turnPause = null;
        }
        const player = game.players[game.turn];
        assert.ok(player && player.placement == 0, "turn must belong to an active player");
        const started = performance.now();
        playBotTurn(game, player, decisions[game.turn]);
        maxDecisionMs = Math.max(maxDecisionMs, performance.now() - started);
        turns++;
    }
    assert.equal(game.status, "F", `game did not finish: seed ${seed}, skills ${skills}`);
    assert.equal(new Set(game.players.map(p => p.placement)).size, skills.length);
    assert.equal(new Set(game.playedCards.map(c => `${c.suit}:${c.rank}`)).size, game.playedCards.length);
    return { players: game.players, turns, maxDecisionMs };
}

test("seeded games terminate legally with all skills and two, three or four players", () => {
    for (let seed = 1; seed <= 8; seed++) {
        for (const skills of [["bad", "good"], ["pro", "bad"], ["pro", "good"],
            ["bad", "good", "pro"], ["pro", "good", "bad", "pro"],
            ["god", "pro"], ["god", "good", "pro"], ["god", "pro", "good", "bad"]]) {
            simulate(seed, skills);
        }
    }
});

test("God beats Pro in paired heads-up games with identical deals and swapped seats", () => {
    const placements = { god: 0, pro: 0 };
    const wins = { god: 0, pro: 0 };
    const rounds = 60;
    let slowest = 0;
    for (let seed = 201; seed < 201 + rounds; seed++) {
        for (const skills of [["god", "pro"], ["pro", "god"]]) {
            const result = simulate(seed, skills);
            result.players.forEach(player => {
                placements[player.botSkill] += player.placement;
                if (player.placement == 1) { wins[player.botSkill]++; }
            });
            slowest = Math.max(slowest, result.maxDecisionMs);
        }
    }
    console.log("God vs Pro paired heads-up:", { wins, games: rounds * 2,
        averageGod: placements.god / (rounds * 2), averagePro: placements.pro / (rounds * 2),
        slowestDecisionMs: slowest.toFixed(1) });
    assert.ok(wins.god > wins.pro, "God must outperform Pro, not just have access to more data");
});

test("God outperforms the other levels in rotating three- and four-player tournaments", () => {
    for (const lineup of [["god", "pro", "good"], ["god", "pro", "good", "bad"]]) {
        const placements = Object.fromEntries(lineup.map(skill => [skill, 0]));
        const wins = Object.fromEntries(lineup.map(skill => [skill, 0]));
        const seeds = 16;
        for (let seed = 401; seed < 401 + seeds; seed++) {
            for (let rotation = 0; rotation < lineup.length; rotation++) {
                const skills = lineup.slice(rotation).concat(lineup.slice(0, rotation));
                const result = simulate(seed, skills);
                result.players.forEach(player => {
                    placements[player.botSkill] += player.placement;
                    if (player.placement == 1) { wins[player.botSkill]++; }
                });
            }
        }
        const games = seeds * lineup.length;
        const averages = Object.fromEntries(Object.entries(placements).map(([skill, total]) => [skill, total / games]));
        console.log("God multiplayer tournament:", { players: lineup.length, games, wins, averages });
        assert.ok(averages.god < averages.pro, "God must beat Pro on average");
        assert.ok(averages.god < averages.good, "God must beat Good on average");
        if (lineup.includes("bad")) { assert.ok(averages.god < averages.bad); }
    }
});

test("paired rotating-seat tournament measures the three levels on identical deals", () => {
    const placements = { bad: 0, good: 0, pro: 0 };
    const rounds = 90;
    let turns = 0;
    let maxDecisionMs = 0;
    for (let seed = 1; seed <= rounds; seed++) {
        for (const skills of [["bad", "good", "pro"], ["good", "pro", "bad"], ["pro", "bad", "good"]]) {
            const result = simulate(seed, skills);
            result.players.forEach(p => { placements[p.botSkill] += p.placement; });
            turns += result.turns;
            maxDecisionMs = Math.max(maxDecisionMs, result.maxDecisionMs);
        }
    }
    const averages = Object.fromEntries(Object.entries(placements).map(([skill, total]) => [skill, total / (rounds * 3)]));
    console.log("Bot tournament average placement (lower is better):", averages,
        "turns:", turns, "slowest decision ms:", maxDecisionMs.toFixed(1));
    assert.ok(averages.good < averages.bad, "good must outperform bad on paired deals");
    assert.ok(averages.pro < averages.good, "pro must outperform good on paired deals");
});
