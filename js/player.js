const MAX_PLAYERS = 4;

class Player {
    constructor(name, playerKey) {
        this.name = name;
        this.playerKey = playerKey;
        this.placement = 0;
        this.cards = [];
        this.turn = 0;
        this.messages = [];
        this.lastPlay = null;
    }
    toRecord() {
        var result = {
            "nick": this.name,
            "spillerKey": this.playerKey,
            "plassering": this.placement,
            "kort": this.cards,
            "sinTur": this.turn,
            "melding": this.messages,
            "laPaaSist": ((this.lastPlay == null) ? [] :
                ((typeof this.lastPlay.toRecord == "function") ? this.lastPlay.toRecord() : this.lastPlay))
        }
        return result;
    }
    fromRecord(record) {
        this.name = record["nick"];
        this.playerKey = record["spillerKey"];
        this.placement = record["plassering"];
        this.cards = record["kort"];
        this.turn = record["sinTur"];
        this.messages = ((record["melding"] == null) ? [] : record["melding"]);
        this.lastPlay = record["laPaaSist"];
        return this;
    }
    resetRound(currentTurnPlayer) {
        if (this != currentTurnPlayer) {
            this.messages = [];
        }
    }
}

class Game {
    constructor(id = null) {
        // Access the Firebase database service.
        var database = firebase.database();
    }
    save() {
        throw ("Må implementeres");
    }
    shouldShufflePlayersOnStart() {
        return true;
    }
    getPlayer(name) {
        var result = null;
        this.players.filter(player => (player.name == name)).forEach(player => {
            result = player;
        });
        return result;
    }
    prepareRound() {
        throw ("Må implementeres");
    }
    startGame() {
        switch (this.status) {
            case "O":
            case "F":
                if (this.shouldShufflePlayersOnStart()) {
                    for (var i = this.players.length - 1; i > 0; i--) {
                        var n = Math.floor(Math.random() * (i + 1));
                        var previousValue = this.players[i];
                        this.players[i] = this.players[n];
                        this.players[n] = previousValue;
                    }
                }
                this.shufflePlayerOrder = false;
                this.players.forEach(player => {
                    player.resetRound(null);
                    player.turn = 0;
                    player.gaveUp = false;
                });
                this.round = 1;
                this.turnPause = null;
                this.setTurn(0);
                this.startTime = Date.now();
                this.endTime = null;
                this.status = "S";
                // Prepare game-specific state.
                this.prepareRound();
                // Start the game.
                this.save();
                break;
            default:
                throw ('Spillet har allerede startet.');
                break;
        }
    }
    setTurn(player) {
        this.players.forEach(player => { player.turn = 0; })
        if (player == null) {
            this.turn = -1;
        } else if (typeof player == "number") {
            this.turn = player;
        } else if (typeof player == "string") {
            this.turn = this.getPlayer(player);
        }
        if (this.turn >= 0) {
            this.players[this.turn].turn = 1;
        }
    }
    elapsedMinutes() {
        if (this.startTime != null) {
            if (this.endTime == null) {
                return Math.floor((Date.now() - this.startTime) / 60000);
            } else {
                return Math.floor((this.endTime - this.startTime) / 60000);
            }
        } else {
            return null;
        }
    }
    finishPlayer(player, won = true) {
        if (player.placement != 0) { return false; }
        var nextPlacement = ((won) ? 0 : this.players.length + 1);
        do {
            nextPlacement += ((won) ? 1 : -1);
            // Find the next unused placement.
        } while (this.players.filter(s => {
            return s.placement == nextPlacement;
        }).length >= 1);
        player.placement = nextPlacement;
        player.resetRound();
        return true;
    }
    nextTurnIndex(currentTurnPlayer) {
        throw ("Må kodes!");
    }
    shouldSkipTurn(turn) {
        return false;
        // Override this to skip players; players who have finished are always skipped.
    }
    onTurnCycleComplete() {
        // Override this to run logic after a complete turn cycle.
    }
    finishGame() {
        if (this.status == "F") { return false; }
        this.endTime = Date.now();
        this.setTurn(-1);
        if (!this.results) { this.results = []; }
        this.results.push(
            this.players.slice()
                .sort((a, b) => a.placement - b.placement)
                .map(player => player.name)
        );
        this.turnPause = null;
        this.status = "F";
        var game = this;
        setTimeout(function () {
            if (game.status == "F" || game.status == "O") {
                var fixed = false;
                game.players.filter(player => player.messages.length > 0).forEach(player => {
                    player.messages = [];
                    fixed = true;
                });
                if (fixed) { game.save(); }
            }
        }, 14000 + 2000 * Math.random());
        return true;
    }
    advanceTurn() {
        if (this.turn == -1 || this.status != "S" || this.turn == null) { throw ('Spillet er ikke i gang.') }
        var currentTurnPlayer = this.players[this.turn];
        currentTurnPlayer.turn = 0;
        var remainingPlayers = this.players.filter(player => { return player.placement == 0; });
        if (remainingPlayers.length <= 1) {
            var finalPlayer = remainingPlayers[0];
            var allOthersGaveUp = finalPlayer != null &&
                this.players.filter(player => player !== finalPlayer)
                    .every(player => player.gaveUp === true);
            if (finalPlayer != null) {
                this.finishPlayer(finalPlayer, allOthersGaveUp);
            }
            var finalPlayerMessage = finalPlayer == null
                ? null
                : (finalPlayer.placement == this.players.length
                    ? `${finalPlayer.name} ble Boms!`
                    : (finalPlayer.placement == 1 ? `${finalPlayer.name} ble President!` : null));
            var placementMessage = this.turnPause && this.turnPause.placementMessage;
            var endMessages = [];
            if (placementMessage) { endMessages.push(placementMessage); }
            if (finalPlayerMessage) { endMessages.push(finalPlayerMessage); }
            if (endMessages.length > 0) {
                var pause = this.turnPause;
                var isCurrentPlayPause = pause != null &&
                    pause.kind == "play" &&
                    pause.playedPile != null &&
                    pause.playedPile.name == currentTurnPlayer.name;
                var isCurrentPassPause = pause != null &&
                    pause.kind == "pass" &&
                    currentTurnPlayer.lastPlay == "Pass";
                var pauseMessage = endMessages.join(" ");
                if (isCurrentPlayPause || isCurrentPassPause) {
                    pause.message = pauseMessage;
                    pause.pendingGameEnd = true;
                    pause.until = Math.max(
                        pause.until || 0,
                        Date.now() + TURN_ACTION_PAUSE_MS
                    );
                } else {
                    var now = Date.now();
                    this.turnPause = {
                        id: `${now}-${Math.random().toString(36).slice(2)}`,
                        kind: "finish",
                        until: now + TURN_ACTION_PAUSE_MS,
                        message: pauseMessage,
                        pendingGameEnd: true
                    };
                }
                this.setTurn(-1);
            } else {
                this.finishGame();
            }
        } else {
            var nextAttempt = 0;
            var nextTurnIndex = this.turn;
            do {
                nextTurnIndex = this.nextTurnIndex(nextTurnIndex, nextAttempt);
                nextAttempt++;
                while (nextTurnIndex >= this.players.length) {
                    nextTurnIndex -= this.players.length;
                    this.onTurnCycleComplete();
                }
                while (nextTurnIndex < 0) {
                    nextTurnIndex += this.players.length;
                }
            } while (this.shouldSkipTurn(nextTurnIndex) || this.players[nextTurnIndex].placement != 0);
            this.setTurn(nextTurnIndex);
            this.players[nextTurnIndex].resetRound(currentTurnPlayer);
        }
        this.save();
    }
    addPlayer(incomingPlayer) {
        var existingPlayer = this.players.find(player => player.name == incomingPlayer.name);
        if (existingPlayer != null) {
            if (existingPlayer.playerKey == incomingPlayer.playerKey) {
                return { player: existingPlayer };
            }
            return { text: 'Nick er allerede i bruk av annen spiller.' };
        }
        if ((this.status == "O" || this.status == "F") &&
            this.players.length >= MAX_PLAYERS) {
            return { text: `Spillet har plass til maks ${MAX_PLAYERS} spillere.` };
        }
        switch (this.status) {
            case "F":
                this.resetForRound();
            case 'O':
                this.players.push(incomingPlayer);
                this.save();
                return { player: incomingPlayer };
                break;
            default:
                return { text: 'Ingen nye spillere når spillet pågår.' };
                break;
        }
    }
    leavePlayer(player) {
        switch (this.status) {
            case 'O':
            case "F":
                this.players = this.players.filter(s => { return s !== player; });
                this.save();
                return null;
                break;
            case 'S':
                if (player.placement == 0) {
                    player.gaveUp = true;
                }
                this.finishPlayer(player, false);
                if (player.turn == 1) {
                    this.advanceTurn();
                } else {
                    this.save();
                }
                player.messages.push("Gir opp!");
                return player;
                break;
            default:
                throw ('Kan ikke gi opp nå.');
                break;
        }
    }
    resetForRound() {
        // Reset a finished game so another round can be set up.
        if (this.status == "S") { throw ("Kan ikke gå til oppsett før spillet er ferdig.") }
        this.players.forEach(player => {
            player.placement = 0;
            player.cards = [];
        });
        this.status = "O";
        this.save();
    }
}