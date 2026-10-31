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

function loadGame() {
    const context = vm.createContext({
        console, Math, getCookie: () => null, getPlayerKey: () => "host",
        localStorage: { getItem: () => null }, setTimeout: () => 0, clearTimeout() {},
        document: { dispatchEvent() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    });
    for (const file of ["cards.js", "player.js", "bot.js", "presence.js", "game.js", "layout.js", "layout-animations.js",
        "layout-table.js", "layout-hand.js", "engine.js", "bot-turn.js", "emotes.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    return vm.runInContext(`({ PresidentGame, PresidentPlayer, PresidentCard, CardDeck, playBotTurn, CUSTOM_RULES,
        createEmoteMemory, readEmoteEvents, planBotEmotes, planBotReply, emoteTrickKey, emoteCardsAreHigh,
        EMOTE_BOT_LIMIT_PER_TRICK, EMOTES, EMOTE_EXTRAS, EMOTE_ALL, emoteUnlockRound, normalizeEmoteLoadout, placeEmoteInLoadout })`, context);
}

const types = loadGame();
const { PresidentGame, PresidentPlayer, PresidentCard, CardDeck, playBotTurn, CUSTOM_RULES, createEmoteMemory,
    readEmoteEvents, planBotEmotes, planBotReply, emoteTrickKey, emoteCardsAreHigh, EMOTE_BOT_LIMIT_PER_TRICK,
    EMOTES, EMOTE_EXTRAS, EMOTE_ALL, emoteUnlockRound, normalizeEmoteLoadout, placeEmoteInLoadout } = types;

function dealtGame(playerCount, rules, random) {
    const deck = [];
    for (let suit = 1; suit <= 4; suit++) {
        for (let rank = 1; rank <= 13; rank++) { deck.push(new PresidentCard(suit, rank)); }
    }
    for (let index = deck.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [deck[index], deck[other]] = [deck[other], deck[index]];
    }
    const players = Array.from({ length: playerCount }, (_, index) => {
        const player = new PresidentPlayer(`Seat ${index}`, index == 0 ? "human" : "PC");
        player.cards = new CardDeck(...deck.filter((_card, cardIndex) => cardIndex % playerCount == index));
        player.cards.sortCards();
        player.botSkill = "good";
        return player;
    });
    const game = Object.assign(Object.create(PresidentGame.prototype), {
        id: "test", players, status: "S", piles: [], playedCards: [], turn: 0, turnPause: null, round: 1, rules,
        hostKey: "human", hostName: "Seat 0", shuffleStartedAt: 1000
    });
    game.save = () => {};
    game.finishGame = () => { game.status = "F"; };
    game.setTurn(0);
    return game;
}

function tableFor(game, random) {
    const bots = game.players.filter(player => player.playerKey == "PC").map(player => player.name);
    return {
        isBot: name => bots.includes(name),
        others: name => bots.filter(bot => bot != name),
        winner: () => game.players.find(player => player.placement == 1)?.name || null,
        random,
        roll: (_name, chance) => random() < chance
    };
}

// Plays a whole game through the real engine, feeding each state to the emote code as the client would.
function playThrough(rules, playerCount, seed) {
    const random = seededRandom(seed);
    const game = dealtGame(playerCount, rules, random);
    const memory = createEmoteMemory();
    readEmoteEvents(memory, game, 1000);
    const seen = [];
    const perTrick = new Map();
    for (let step = 0; step < 4000 && game.status == "S"; step++) {
        const current = game.players.find(player => player.turn == 1);
        // With no one left to move, the round ends once its final pause has played.
        if (current) {
            game.turnPause = null;
            playBotTurn(game, current, random);
        } else {
            game.finishGame();
        }
        for (const event of readEmoteEvents(memory, game, 1000)) {
            seen.push(event);
            const key = emoteTrickKey(game, event);
            const plan = planBotEmotes(event, tableFor(game, random));
            const said = plan.length == 0 ? 0 : plan[0].together ? plan.length : 1;
            perTrick.set(key, Math.min(EMOTE_BOT_LIMIT_PER_TRICK, (perTrick.get(key) || 0) + said));
        }
        if (!perTrick.has(emoteTrickKey(game))) { perTrick.set(emoteTrickKey(game), 0); }
    }
    return { game, seen, perTrick };
}

const ruleSetups = [{ name: "standard", rules: {} },
    ...CUSTOM_RULES.map(rule => ({
        name: rule.id,
        rules: { [rule.id]: true, ...(rule.requires ? { [rule.requires]: true } : {}) }
    }))];

for (const { name, rules } of ruleSetups) {
    test(`bots read the game correctly with the rule setup "${name}"`, () => {
        for (const playerCount of [2, 3, 4]) {
            for (let seed = 1; seed <= 6; seed++) {
                const { game, seen } = playThrough(rules, playerCount, seed * 97 + playerCount);
                assert.equal(game.status, "F", "the game finishes");
                const players = new Set(game.players.map(player => player.name));
                for (const event of seen) {
                    for (const field of ["actor", "beaten", "leader"]) {
                        if (event[field] != null) { assert.ok(players.has(event[field]), `${event.type}.${field} is a seated player`); }
                    }
                    if (event.type == "pass") { assert.ok(event.actor != null && event.streak >= 1); }
                }
                assert.ok(seen.some(event => event.type == "play" || event.type == "clear"), "plays are seen");
                assert.equal(seen.filter(event => event.type == "finish" && event.placement == 1).length, 1, "one winner");
                assert.equal(seen.filter(event => event.type == "finish" && event.last).length, 1, "one Boms");
                assert.equal(seen.filter(event => event.type == "gameOver").length, 1, "one game over");
                // An aimed emote never aims at its own speaker.
                const table = tableFor(game, () => 0);
                for (const event of seen) {
                    for (const entry of planBotEmotes(event, table)) {
                        assert.ok(entry.speaker != null && table.isBot(entry.speaker));
                        assert.notEqual(entry.to, entry.speaker);
                    }
                }
            }
        }
    });
}

test("bots average about one emote per trick and the most in any trick is three", () => {
    const counts = [];
    for (const { rules } of ruleSetups) {
        for (let seed = 1; seed <= 20; seed++) {
            counts.push(...playThrough(rules, 4, seed * 131).perTrick.values());
        }
    }
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    console.log(`emotes per trick: average ${average.toFixed(2)}, tricks ${counts.length}, ` +
        [0, 1, 2, 3].map(amount => `${amount}: ${(100 * counts.filter(count => count == amount).length / counts.length).toFixed(0)}%`).join(", "));
    assert.ok(Math.max(...counts) <= 3);
    assert.ok(average > 0.1 && average < 1.2, `average ${average.toFixed(2)} emotes per trick`);
});

test("passes count per player, reset on that player's own play and name who is leading", () => {
    const memory = createEmoteMemory();
    const game = {
        players: [{ name: "A", placement: 0 }, { name: "B", placement: 0 }], status: "S", shuffleStartedAt: 1,
        piles: [{ name: "B" }], turnPause: null, exchangeReceipts: []
    };
    readEmoteEvents(memory, game, 1e9);
    const passes = id => { game.turnPause = { id, kind: "pass", passedBy: "A" }; return readEmoteEvents(memory, game, 1e9); };
    assert.equal(passes("1")[0].streak, 1);
    const second = passes("2")[0];
    assert.equal(second.streak, 2);
    assert.equal(second.leader, "B");
    game.turnPause = { id: "3", kind: "play", playedPile: { name: "A", cards: [{ farge: 1, verdi: 5 }] } };
    assert.equal(readEmoteEvents(memory, game, 1e9)[0].beaten, null);
    assert.equal(passes("4")[0].streak, 1);
});

test("a clear tells a decision to clear apart from everyone passing, whatever card caused it", () => {
    const memory = createEmoteMemory();
    const game = {
        players: [{ name: "A", placement: 0 }, { name: "B", placement: 0 }], status: "S", shuffleStartedAt: 1,
        piles: [], turnPause: null, exchangeReceipts: []
    };
    readEmoteEvents(memory, game, 1e9);
    game.turnPause = { id: "1", kind: "clear", clearedPiles: [{ nick: "A" }, { nick: "B" }], playedPile: { name: "B", cards: [{ farge: 1, verdi: 10 }] } };
    assert.deepEqual(JSON.parse(JSON.stringify(readEmoteEvents(memory, game, 1e9))),
        [{ type: "clear", actor: "B", beaten: "A", high: false }]);
    game.turnPause = { id: "2", kind: "clear", clearedPiles: [{ nick: "A" }], passedBy: "B" };
    assert.equal(readEmoteEvents(memory, game, 1e9).map(event => event.type).join(), "pass,trickWon");
});

test("card exchanges come from the receipts, so every kind of trade counts and each counts once", () => {
    const memory = createEmoteMemory();
    const game = {
        players: [{ name: "A", placement: 0 }, { name: "B", placement: 0 }], status: "G", shuffleStartedAt: 1,
        piles: [], turnPause: null, exchangeReceipts: []
    };
    readEmoteEvents(memory, game, 1e9);
    game.exchangeReceipts = [
        { id: "1", recipient: "A", sender: "B", cards: [{ suit: 1, rank: 1 }] },
        { id: "2", recipient: "B", sender: "A", cards: [{ suit: 1, rank: 4 }] }
    ];
    assert.equal(readEmoteEvents(memory, game, 1e9).map(event => `${event.recipient}<${event.sender}:${event.high}`).join(), "A<B:true,B<A:false");
    assert.equal(readEmoteEvents(memory, game, 1e9).length, 0);
});

test("high cards are aces, twos, the club three and three or more of a kind", () => {
    const high = cards => emoteCardsAreHigh(cards.map(([suit, rank]) => ({ suit, rank })));
    assert.equal(high([[1, 1]]), true);
    assert.equal(high([[1, 2]]), true);
    assert.equal(high([[3, 3]]), true);
    assert.equal(high([[2, 3]]), false);
    assert.equal(high([[1, 13]]), false);
    assert.equal(high([[1, 5], [2, 5]]), false);
    assert.equal(high([[1, 5], [2, 5], [3, 5]]), true);
});

test("a reply goes back to the sender, and only bots answer", () => {
    const table = { isBot: name => name.startsWith("Bot"), others: name => ["Bot 1", "Bot 2"].filter(bot => bot != name),
        random: () => 0, roll: () => true };
    assert.deepEqual(JSON.parse(JSON.stringify(planBotReply("Bot 1", "gg", "Bot 2", table))), { speaker: "Bot 2", emote: "ty", to: "Bot 1" });
    assert.equal(planBotReply("Bot 1", "gg", "Human", table), null);
    assert.equal(planBotReply("Human", "hi", null, table).to, "Human");
});

test("the extras unlock evenly from round 1 to round 50, and the defaults are always available", () => {
    assert.equal(EMOTE_EXTRAS.length, 41);
    assert.equal(new Set(EMOTE_ALL.map(emote => emote.id)).size, EMOTE_ALL.length);
    assert.ok(EMOTES.every(emote => emoteUnlockRound(emote.id) == 0));
    const rounds = EMOTE_EXTRAS.map(emote => emoteUnlockRound(emote.id));
    assert.equal(rounds[0], 1);
    assert.equal(rounds[rounds.length - 1], 50);
    assert.equal(new Set(rounds).size, rounds.length, "one unlock per round at most");
    assert.ok(rounds.every((round, index) => index == 0 || round > rounds[index - 1]));
});

test("a loadout always holds six different known emotes, and placing one already in use swaps them", () => {
    const defaults = EMOTES.map(emote => emote.id);
    const text = list => Array.from(list).join();
    assert.equal(text(normalizeEmoteLoadout(null)), text(defaults));
    assert.equal(text(normalizeEmoteLoadout("hi,hi,ty,wow,omg,excellent")), text(defaults));
    assert.equal(text(normalizeEmoteLoadout("hi,gg,ty,wow,omg,nonsense")), text(defaults));
    assert.equal(text(normalizeEmoteLoadout("salt,gg,ty,wow,omg,excellent")), "salt,gg,ty,wow,omg,excellent");
    assert.equal(text(placeEmoteInLoadout(defaults, 0, "salt")), "salt,gg,ty,wow,omg,excellent");
    assert.equal(text(placeEmoteInLoadout(defaults, 0, "ty")), "ty,gg,hi,wow,omg,excellent");
});

test("bots only say the default emotes, and answer an extra the way they answer its default twin", () => {
    const defaults = new Set(EMOTES.map(emote => emote.id));
    const table = { isBot: () => true, others: name => ["Bot 1", "Bot 2"].filter(bot => bot != name), winner: () => "Bot 1",
        random: () => 0, roll: () => true };
    const events = [{ type: "roundStart" }, { type: "clear", actor: "Bot 1", beaten: "Bot 2", high: true },
        { type: "play", actor: "Bot 1", beaten: "Bot 2", high: true }, { type: "pass", actor: "Bot 1", streak: 3, leader: "Bot 2" },
        { type: "trickWon", actor: "Bot 1" }, { type: "exchange", recipient: "Bot 1", sender: "Bot 2", high: true },
        { type: "finish", actor: "Bot 1", placement: 1 }, { type: "finish", actor: "Bot 2", placement: 2, last: true }, { type: "gameOver" }];
    for (const event of events) {
        for (const entry of planBotEmotes(event, table)) { assert.ok(defaults.has(entry.emote), event.type); }
    }
    for (const extra of EMOTE_EXTRAS) {
        assert.ok(defaults.has(extra.like), extra.id);
        assert.ok(defaults.has(planBotReply("Human", extra.id, "Bot 1", table).emote), extra.id);
    }
});
