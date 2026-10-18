const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGame() {
    const context = vm.createContext({
        console, getCookie: () => null, getPlayerKey: () => "human-key", setTimeout: () => 0
    });
    for (const file of ["cards.js", "player.js", "game.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(file === "game.js" ? source.split(/\r?\n\(\r?\n/)[0] : source, context);
    }
    return vm.runInContext("({ PresidentGame, PresidentPlayer, PresidentCard, CardPile, isLobbyHost })", context);
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

function lobbyWithStoredPlayers(names) {
    const { game, players } = setupGame();
    const { PresidentPlayer } = loadGame();
    game.status = "O";
    game.hostName = game.localPlayerName = players[0].name;
    const stored = {
        status: "O", hostKey: game.hostKey, hostName: game.hostName,
        spillere: [
            players[0].toRecord(),
            ...names.map(([name, key]) => new PresidentPlayer(name, key).toRecord())
        ]
    };
    game.databaseRef = {
        transaction(transform, complete) {
            const next = transform(JSON.parse(JSON.stringify(stored)));
            if (next !== undefined) { Object.assign(stored, next); }
            complete(null, next !== undefined, { val: () => JSON.parse(JSON.stringify(stored)) });
        }
    };
    return { game, stored, PresidentPlayer };
}

test("adding a bot preserves humans missing from the host's stale local list", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Guest", "guest-key"]]);
    game.players = game.players.slice(0, 1);
    const result = await game.addPlayer(new PresidentPlayer("New bot", "PC"));
    assert.equal(result.player.name, "New bot");
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "New bot"]);
    assert.equal(stored.spillere[1].spillerKey, "guest-key");
});

test("a human replaces only a bot when the lobby is full", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Bot A", "PC"], ["Bot B", "PC"]
    ]);
    stored.spillere[1].ready = true;
    const result = await game.addPlayer(new PresidentPlayer("New human", "new-key"));
    assert.equal(result.player.name, "New human");
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "New human", "Bot B"]);
    assert.equal(stored.spillere[1].ready, true);
    assert.equal(stored.spillere[2].ready, false);
});

test("bots cannot replace anyone in a full lobby", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Bot A", "PC"], ["Bot B", "PC"]
    ]);
    const before = JSON.stringify(stored);
    const result = await game.addPlayer(new PresidentPlayer("New bot", "PC"));
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("a full human lobby rejects a fifth human without overwriting players", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Third", "third-key"], ["Fourth", "fourth-key"]
    ]);
    const before = JSON.stringify(stored);
    const result = await game.addPlayer(new PresidentPlayer("Fifth", "fifth-key"));
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("a non-host cannot add a bot through the game method", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([]);
    game.localPlayerName = "Guest";
    const result = await game.addPlayer(new PresidentPlayer("Bot", "PC"));
    assert.ok(result.text);
    assert.equal(stored.spillere.length, 1);
});

test("rejoining and duplicate names never replace an existing human", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([["Guest", "guest-key"]]);
    const result = await game.addPlayer(new PresidentPlayer("Guest", "guest-key"));
    assert.equal(result.player.playerKey, "guest-key");
    const rejected = await game.addPlayer(new PresidentPlayer("Guest", "PC"));
    assert.ok(rejected.text);
    assert.equal(stored.spillere.length, 2);
    assert.equal(stored.spillere[1].spillerKey, "guest-key");
});

test("a transaction retry uses the new human's slot instead of overwriting it", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([]);
    game.databaseRef.transaction = (transform, complete) => {
        transform(JSON.parse(JSON.stringify(stored)));
        stored.spillere.push(new PresidentPlayer("Concurrent human", "guest-key").toRecord());
        const next = transform(JSON.parse(JSON.stringify(stored)));
        Object.assign(stored, next);
        complete(null, true, { val: () => JSON.parse(JSON.stringify(stored)) });
    };
    await game.addPlayer(new PresidentPlayer("Bot", "PC"));
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Concurrent human", "Bot"]);
});

test("a human cannot replace a bot in a game already in progress", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Bot A", "PC"], ["Bot B", "PC"]
    ]);
    stored.status = "S";
    const before = JSON.stringify(stored);
    const result = await game.addPlayer(new PresidentPlayer("New human", "new-key"));
    assert.ok(result.text);
    assert.equal(JSON.stringify(stored), before);
});

test("the creator is assigned as host when joining the empty room", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([]);
    stored.spillere = [];
    stored.hostName = null;
    await game.addPlayer(new PresidentPlayer("Creator", "human-key"));
    assert.equal(stored.hostKey, "human-key");
    assert.equal(stored.hostName, "Creator");
    assert.equal(game.hostName, "Creator");
});

test("a retry at full capacity preserves the concurrent human and rejects the bot", async () => {
    const { game, stored, PresidentPlayer } = lobbyWithStoredPlayers([
        ["Guest", "guest-key"], ["Third", "third-key"]
    ]);
    game.databaseRef.transaction = (transform, complete) => {
        transform(JSON.parse(JSON.stringify(stored)));
        stored.spillere.push(new PresidentPlayer("Fourth", "fourth-key").toRecord());
        const next = transform(JSON.parse(JSON.stringify(stored)));
        assert.equal(next, undefined);
        complete(null, false, { val: () => stored });
    };
    const result = await game.addPlayer(new PresidentPlayer("Bot", "PC"));
    assert.ok(result.text);
    assert.deepEqual(stored.spillere.map(player => player.nick), ["Human", "Guest", "Third", "Fourth"]);
});

function finishedVotingGame(sharedKey = false) {
    const { game, players } = setupGame();
    if (sharedKey) { players[1].playerKey = players[0].playerKey; }
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
    return { game, players, stored, snapshots };
}

test("one human and bots can vote to return to lobby atomically", () => {
    const { game, players, stored, snapshots } = finishedVotingGame();
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "O");
    assert.equal(stored.gameEndVote, null);
    assert.equal(stored.roundStartVote, null);
    assert.equal(snapshots.some(snapshot => snapshot.status === "F" && snapshot.vote == null), false);
    assert.equal(game.players.length, 3);
    assert.ok(game.players.every(player => player.cards.length === 0 && player.turn === 0));
});

test("two humans sharing a browser key each get a separate lobby vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "F");
    assert.equal(game.submitGameEndVote(players[1], "lobby"), true);
    assert.equal(stored.status, "O");
});

test("two humans need a majority before returning to the lobby", () => {
    const { game, players, stored } = finishedVotingGame();
    players[1].playerKey = "second-human";
    assert.equal(game.submitGameEndVote(players[0], "lobby"), true);
    assert.equal(stored.status, "F");
    assert.equal(game.submitGameEndVote(players[1], "lobby"), true);
    assert.equal(stored.status, "O");
});

test("a tied result vote clears votes and requires a new vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    const previousId = game.gameEndVote.id;
    game.submitGameEndVote(players[0], "lobby");
    game.submitGameEndVote(players[1], "next_round");
    assert.equal(stored.status, "F");
    assert.notEqual(stored.gameEndVote.id, previousId);
    assert.equal(stored.gameEndVote.votes.length, 0);
    assert.equal(stored.gameEndVote.revote, true);
    game.submitGameEndVote(players[0], "lobby");
    game.submitGameEndVote(players[1], "lobby");
    assert.equal(stored.status, "O");
});

test("a non-host cannot resolve or claim the result vote", () => {
    const { game, players, stored } = finishedVotingGame();
    game.hostKey = "another-host";
    game.submitGameEndVote(players[0], "lobby");
    assert.equal(stored.status, "F");
    assert.equal(stored.gameEndVote.result, undefined);
    game.hostKey = "human-key";
    game.resolveGameEndVote();
    assert.equal(stored.status, "O");
});

test("a tied neutral-round vote also requires a new vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    game.roundStartVote = stored.roundStartVote = {
        id: "neutral-vote", until: Date.now() + 10000, votes: []
    };
    game.submitNeutralRoundVote(players[0], true);
    game.submitNeutralRoundVote(players[1], false);
    assert.equal(stored.roundStartVote.revote, true);
    assert.equal(stored.roundStartVote.votes.length, 0);
    assert.equal(stored.status, "F");
});

test("only the host can start, even if everyone is ready", () => {
    const { game, players } = setupGame();
    game.status = "O";
    players[0].ready = true;
    game.hostKey = "someone-else";
    assert.throws(() => game.startGame(), /Bare verten/);
});

test("host must wait for all humans, but bots need not press ready", () => {
    const { game, players } = setupGame();
    game.status = "O";
    game.prepareRound = () => {};
    game.save = () => {};
    game.databaseRef = { child: () => ({ remove: () => Promise.resolve() }) };
    assert.equal(game.allHumansReady(), false);
    assert.throws(() => game.startGame(), /må være klare/);
    players[0].ready = true;
    assert.equal(game.allHumansReady(), true);
    game.startGame();
    assert.equal(game.status, "S");
});

test("host identity distinguishes two names using the same browser key", () => {
    const { game } = setupGame();
    const { isLobbyHost } = loadGame();
    game.hostName = "Human";
    game.localPlayerName = "Other";
    assert.equal(isLobbyHost(game), false);
    game.localPlayerName = "Human";
    assert.equal(isLobbyHost(game), true);
});

test("the next human inherits the lobby when its creator leaves", () => {
    const { game, players } = setupGame();
    game.status = "O";
    game.hostName = players[0].name;
    players[2].playerKey = "next-human";
    game.save = () => {};
    game.leavePlayer(players[0]);
    assert.equal(game.hostKey, "next-human");
    assert.equal(game.hostName, players[2].name);
    assert.equal(game.players.length, 2);
});

test("the next human also inherits a finished room with an active vote", () => {
    const { game, players, stored } = finishedVotingGame(true);
    game.hostName = players[0].name;
    game.leavePlayer(players[0]);
    assert.equal(game.hostName, players[1].name);
    assert.equal(stored.spillere.length, 2);
    assert.equal(stored.status, "F");
});

test("ready state persists and is reset on returning to the lobby", () => {
    const { game, players } = finishedVotingGame();
    const { PresidentPlayer } = loadGame();
    players[0].ready = true;
    const restored = new PresidentPlayer().fromRecord(
        JSON.parse(JSON.stringify(players[0].toRecord()))
    );
    assert.equal(restored.ready, true);
    game.returnToLobby();
    assert.ok(game.players.every(player => player.ready === false));
});

test("readiness writes only the current player's ready field", async () => {
    const { game, players } = setupGame();
    game.status = "O";
    const writes = [];
    game.databaseRef = {
        child(key) {
            return { set: value => { writes.push({ key, value }); return Promise.resolve(); } };
        }
    };
    await game.setReady(players[0], true);
    assert.deepEqual(writes, [{ key: "spillere/0/ready", value: true }]);
    assert.throws(() => game.setReady(players[1], true), /klar-status/);
});

test("one human with bots can still vote for the next round", () => {
    const { game, players } = finishedVotingGame();
    let started = false;
    game.needsNeutralRoundVote = () => false;
    game.startGame = () => { started = true; };
    assert.equal(game.submitGameEndVote(players[0], "next_round"), true);
    assert.equal(started, true);
});

test("the host starts a voted next round without exposing a finished game with no vote", () => {
    const { game, players, stored, snapshots } = finishedVotingGame();
    game.needsNeutralRoundVote = () => false;
    game.prepareRound = () => {};
    game.submitGameEndVote(players[0], "next_round");
    assert.equal(stored.status, "S");
    assert.equal(stored.gameEndVote, null);
    assert.equal(snapshots.some(snapshot => snapshot.status === "F" && snapshot.vote == null), false);
});

test("finished status is saved before creating the result vote", () => {
    const { game, stored, snapshots } = finishedVotingGame();
    game.status = stored.status = "S";
    game.gameEndVote = stored.gameEndVote = null;
    assert.equal(game.finishGame(), true);
    assert.equal(stored.status, "F");
    assert.ok(stored.gameEndVote);
    assert.equal(snapshots[0].status, "F");
    assert.equal(snapshots.some(snapshot => snapshot.status === "S" && snapshot.vote != null), false);
});

test("host start waits for a second human to be ready too", () => {
    const { game, players } = setupGame();
    game.status = "O";
    players[0].ready = true;
    players[1].playerKey = "guest-key";
    assert.equal(game.allHumansReady(), false);
    assert.throws(() => game.startGame(), /må være klare/);
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

test("opening four fives stays on the table in a two-human game after serialization", () => {
    const { game, players, pile } = setupGame();
    game.players = players.slice(0, 2);
    players[1].playerKey = "second-human";
    const opening = pile(players[0], 5);
    players[0].cards = [...opening, ...pile(players[0], 4)];
    players[1].cards = [...pile(players[1], 6), ...pile(players[1], 10), ...pile(players[1], 13)];
    const { PresidentPlayer } = loadGame();
    game.players = PresidentPlayer.deserializePlayers(
        JSON.parse(JSON.stringify(game.players.map(player => player.toRecord())))
    );
    game.save = () => {};
    game.setTurn(0);
    const play = new opening.constructor(game.players[0].name, ...game.players[0].cards.slice(0, 4));
    game.playCards(game.players[0], play);
    assert.equal(game.turn, 1);
    assert.equal(game.piles.length, 1);
    assert.equal(game.turnPause.kind, "play");
    assert.equal(game.piles[0].strengthRank, 5);
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

test("all three natural threes clear with two players but only two do not", () => {
    const { game, players } = setupGame();
    const { PresidentCard, CardPile } = loadGame();
    game.players = players.slice(0, 2);
    const threes = [1, 2, 4].map(suit => new PresidentCard(suit, 3));
    game.piles = [new CardPile(players[0].name, threes[0], threes[1])];
    assert.equal(game.pileCleared(), false);
    game.piles = [new CardPile(players[0].name, ...threes)];
    const info = {};
    assert.equal(game.pileCleared(info), true);
    assert.equal(info.text, "Hjerter 3, Spar 3 og Ruter 3");
    game.piles = threes.map(card => new CardPile(players[0].name, card));
    assert.equal(game.pileCleared(), true);
});

test("natural-three clear remains restricted to the correct player count", () => {
    const { game, players } = setupGame();
    const { PresidentCard, CardPile, PresidentPlayer } = loadGame();
    game.piles = [new CardPile(players[0].name, new PresidentCard(1, 3), new PresidentCard(2, 3))];
    assert.equal(game.pileCleared(), true);
    game.players.push(new PresidentPlayer("Fourth", "fourth-key"));
    assert.equal(game.pileCleared(), false);
});
