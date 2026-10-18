const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGame() {
    const context = vm.createContext({ console, getCookie: () => null });
    for (const file of ["cards.js", "player.js", "game.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(file === "game.js" ? source.split(/\r?\n\(\r?\n/)[0] : source, context);
    }
    return vm.runInContext("({ PresidentGame, PresidentPlayer, PresidentCard, CardPile })", context);
}

function setupGame() {
    const types = loadGame();
    const game = Object.create(types.PresidentGame.prototype);
    const players = [
        new types.PresidentPlayer("Human", "human-key"),
        new types.PresidentPlayer("Bot 1", "PC"),
        new types.PresidentPlayer("Bot 2", "PC")
    ];
    Object.assign(game, {
        id: "test", players, status: "S", piles: [], turn: 1,
        turnPause: null, rules: {}, round: 1, hostKey: "human-key",
        roundStartVote: null, gameEndVote: null, roundStarterName: null,
        shuffleStartedAt: null, preservePlayerOrderOnStart: false
    });
    game.updatePublicListing = () => {};
    const pile = (owner, rank, count = 4) => new types.CardPile(
        owner.name, ...Array.from({ length: count }, (_, suit) =>
            new types.PresidentCard(suit + 1, rank))
    );
    return { game, players, pile };
}

test("one human and bots can vote to return to lobby atomically", () => {
    const { game, players } = setupGame();
    players.forEach((player, i) => { player.placement = i + 1; });
    game.status = "F";
    game.gameEndVote = { id: "vote", until: Date.now() + 10000, votes: [] };
    const stored = { status: "F", gameEndVote: game.gameEndVote, roundStartVote: null };
    const snapshots = [];
    const notify = () => {
        snapshots.push({ status: stored.status, vote: stored.gameEndVote });
        game.status = stored.status;
        game.gameEndVote = stored.gameEndVote;
    };
    game.databaseRef = {
        update(record) {
            Object.assign(stored, record);
            notify();
            return Promise.resolve();
        },
        child(key) {
            return {
                transaction(transform, complete) {
                    const result = transform(stored[key]);
                    if (result !== undefined) {
                        stored[key] = result;
                        notify();
                    }
                    complete(null, result !== undefined, { val: () => stored[key] });
                },
                remove() {
                    stored[key] = null;
                    notify();
                    return Promise.resolve();
                }
            };
        }
    };
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "O");
    assert.equal(stored.gameEndVote, null);
    assert.equal(stored.roundStartVote, null);
    assert.equal(snapshots.some(snapshot => snapshot.status === "F" && snapshot.vote == null), false);
    assert.equal(game.players.length, 3);
    assert.ok(game.players.every(player => player.cards.length === 0 && player.turn === 0));
});

test("higher four of a kind keeps the pile open and can be played", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 7)];
    const response = pile(players[1], 8);
    players[1].cards = Array.from(response);
    players[1].turn = 1;
    assert.equal(game.pileCleared(), false);
    assert.equal(game.canPlayPile(players[1], response), true);
    const info = {};
    assert.equal(game.canPlayRank(players[1], 8, info), true);
    assert.equal(info.pile.length, 4);
    game.piles.push(response);
    assert.equal(game.pileCleared(), true);
});

test("four accumulated equal cards can be beaten only by four higher cards", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 7, 2), pile(players[2], 7, 2)];
    const response = pile(players[1], 9);
    players[1].cards = Array.from(response);
    players[1].turn = 1;
    assert.equal(game.pileCleared(), false);
    const pair = new response.constructor(players[1].name, response[0], response[1]);
    assert.equal(game.canPlayPile(players[1], pair), false);
    assert.equal(game.canPlayPile(players[1], response), true);
});

test("lower four of a kind cannot beat the top pile", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 9)];
    const response = pile(players[1], 8);
    players[1].cards = Array.from(response);
    players[1].turn = 1;
    assert.equal(game.canPlayPile(players[1], response), false);
    assert.equal(game.canPlayRank(players[1], 8, {}), false);
});

test("unbeatable four clears, including when a higher holder passed or finished", () => {
    for (const state of ["no-higher", "passed", "finished"]) {
        const { game, players, pile } = setupGame();
        game.piles = [pile(players[0], 7)];
        players[1].cards = Array.from(pile(players[1], state === "no-higher" ? 6 : 8));
        if (state === "passed") { players[1].lastPlay = "Pass"; }
        if (state === "finished") { players[1].placement = 1; }
        assert.equal(game.pileCleared(), true, state);
    }
});

test("club three still clears and ordinary pairs remain open until everyone passes", () => {
    const { game, players, pile } = setupGame();
    game.piles = [pile(players[0], 7, 2)];
    assert.equal(game.pileCleared(), false);
    players[1].lastPlay = players[2].lastPlay = "Pass";
    assert.equal(game.pileCleared(), true);
    const { PresidentCard, CardPile } = loadGame();
    game.piles = [new CardPile(players[0].name, new PresidentCard(3, 3))];
    assert.equal(game.pileCleared(), true);
});
