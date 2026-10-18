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
        localStorage: { getItem: () => null }, setTimeout: () => 0,
        document: { dispatchEvent() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    });
    for (const file of ["cards.js", "player.js", "bot.js", "game.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(file == "game.js"
            ? source.split(/\r?\n\(\r?\n/)[0] + source.slice(source.indexOf("\nfunction playBotTurn("))
            : source, context);
    }
    return vm.runInContext("({ BotAI, PresidentGame, PresidentPlayer, PresidentCard, CardDeck, CardPile, playBotTurn })", context);
}

const types = loadBots();
const { BotAI, PresidentGame, PresidentPlayer, PresidentCard, CardDeck, CardPile, playBotTurn } = types;
const card = (rank, suit = 1) => new PresidentCard(suit, rank);
const view = (cards, top = null, opponents = [{ name: "Other", count: 8, passed: false }]) =>
    ({ cards, top, opponents, tableCards: [], playedCards: [], playerCount: 3 });

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
    for (const skill of BotAI.skills) {
        const observed = BotAI.observe(game, game.players[0]);
        assert.ok(BotAI.chooseMove(observed, skill, seededRandom(4)));
        assert.deepEqual(Object.keys(observed.opponents[0]).sort(), ["count", "name", "passed"]);
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

test("seeded games terminate legally with all three skills and two, three or four players", () => {
    for (let seed = 1; seed <= 8; seed++) {
        for (const skills of [["bad", "good"], ["pro", "bad"], ["pro", "good"],
            ["bad", "good", "pro"], ["pro", "good", "bad", "pro"]]) {
            simulate(seed, skills);
        }
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
