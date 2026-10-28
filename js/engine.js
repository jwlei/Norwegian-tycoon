class PresidentCard extends Card {
    static clubThreePower() { return 16; }
    static strengthName(strengthRank) {
        return ["", "", "", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "Kløver 3"][strengthRank];
    }
    constructor(suit, rank) {
        super(suit, rank);
        if (this.rank > 3) {
            this.strengthRank = this.rank;
        } else if (this.rank < 3) {
            this.strengthRank = this.rank + 13;
        } else {
            // Handle the special club-three rank.
            if (this.suit == 3) {
                this.strengthRank = 16; // Club three.
            } else {
                this.strengthRank = 3;
            }
        }
        Object.defineProperty(this, "strengthRank", { enumerable: false });
    }
    isClubThree() {
        return (this.strengthRank == 16);
    }
    compareByStrength(a, b) {
        return (a.strengthRank - b.strengthRank) * 10 + (a.suit - b.suit);
    }
    static serializeDeck(deck) {
        var result = [];
        deck.forEach(card => {
            result.push({ "farge": card.suit, "verdi": card.rank });
        });
        return result;
    }
    static deserializeDeck(records) {
        if (records == null) { return [] }
        var result = new CardDeck();
        records.forEach(element => {
            result.push(new PresidentCard(element["farge"], element["verdi"]));
        });
        return result;
    }
    static serializePiles(deck) {
        var result = [];
        deck.forEach(pile => {
            result.push(pile.toRecord());
        });
        return result;
    }
    static deserializePiles(records) {
        if (records == null) { return [] }
        var result = [];
        records.forEach(element => {
            var pile = new CardPile(element["nick"])
            var index = 0;
            while (element[index]) {
                const card = element[index];
                pile.push(new PresidentCard(card["farge"], card["verdi"]));
                index++;
            }
            if (pile.length == 0) {
                pile.strengthRank = element["verdiBoms"];
            }
            if (element.motion != null) { pile.motion = CardPile.normalizeMotion(element.motion); }
            result.push(pile);
        });
        return result;
    }
}

class CardPile extends Array {
    static normalizeMotion(motion) {
        const limits = { x: 1, y: 1, power: 1, spin: 20, pitch: 18, yaw: 18 };
        const result = {};
        for (const [key, limit] of Object.entries(limits)) {
            if (!Number.isFinite(motion[key])) { throw new Error("Ugyldig bevegelse for spilte kort."); }
            result[key] = Math.max(key == "power" ? 0 : -limit, Math.min(limit, motion[key]));
        }
        if (motion.launch != null) {
            result.launch = {};
            for (const [key, limit] of Object.entries({ x: 4, y: 4, vx: 8, vy: 8 })) {
                if (!Number.isFinite(motion.launch[key])) { throw new Error("Ugyldig bevegelse for spilte kort."); }
                result.launch[key] = Math.max(-limit, Math.min(limit, motion.launch[key]));
            }
        }
        return result;
    }
    constructor(name, ...cards) {
        super(...cards);
        if (this.length > 0) {
            this.strengthRank = this[0].strengthRank;
            this.forEach(k => {
                if (k.strengthRank != this.strengthRank) { throw ("Kan ikke legge på forskjellige kort.") }
            });
        } else {
            this.strengthRank = null;
        }
        this.name = name;
    }
    toRecord() {
        var record = { "nick": this.name, "verdiBoms": this.strengthRank };
        if (this.motion != null) { record.motion = CardPile.normalizeMotion(this.motion); }
        this.forEach((card, index) => {
            record[index] = { "farge": card.suit, "verdi": card.rank };
        });
        return record;
    }
    toJSON() {
        return this.toRecord();
    }
    push(item) {
        if (this.strengthRank != null) {
            if (item.strengthRank != this.strengthRank) { throw ("Kan ikke legge på forskjellige kort.") }
        } else {
            this.strengthRank = item.strengthRank;
        }
        super.push(item);
    }
    fromRecord(pile) {
        this.name = pile["nick"];
        if (pile.motion != null) { this.motion = CardPile.normalizeMotion(pile.motion); }
        else { delete this.motion; }
        var i = 0;
        while (pile[i]) {
            var card = pile[i];
            if (!(card instanceof PresidentCard)) { card = new PresidentCard(card["farge"], card["verdi"]); };
            this.push(card);
            i++;
        };
        if (this.length == 0) {
            this.strengthRank = pile["verdiBoms"];
        }
        return this;
    }
    describe() {
        if (this.length == 0) { return "ingen kort" };
        if (this[0].isClubThree()) { return "kløver 3" };
        return describeCards(this[0].rank, this.length);
    }
    canBePlayedOn(topPile) {
        return (
            (topPile == null) || // First card in a new pile.
            (this.length == topPile.length && this.strengthRank >= topPile.strengthRank) || // Standard rules.
            (topPile.length < 4 && this.length == 1 && this[0].isClubThree()) // Club three.
        )
    }
}

class PresidentPlayer extends Player {
    constructor(name, playerKey) {
        super(name, playerKey);
        this.title = "";
        this.presidentStreak = 0;
        this.bomsStreak = 0;
        this.lastPlacement = 0;
        this.gaveUp = false;
        this.botSkill = playerKey == "PC" ? BotAI.skillForName(name) : null;
    }
    toRecord() {
        var result = super.toRecord();
        result["kort"] = PresidentCard.serializeDeck(result["kort"]);
        result["tittel"] = this.title;
        result["presidentStreak"] = this.presidentStreak;
        result["bomsStreak"] = this.bomsStreak;
        result["lastPlacement"] = this.lastPlacement;
        if (this.playerKey == "PC") {
            result.botSkill = BotAI.skill(this.botSkill);
            result.botSkillVersion = 2;
        }
        if (this.gaveUp === true) {
            result["gaveUp"] = true;
        }
        if (this.leaveAfterExchange === true) {
            result["leaveAfterExchange"] = true;
        }
        return result;
    }
    fromRecord(record) {
        record["kort"] = PresidentCard.deserializeDeck(record["kort"]);
        const lastPlay = record["laPaaSist"];
        record["laPaaSist"] = ((lastPlay == null) ? null :
            ((lastPlay["verdiBoms"] != null) ? new CardPile(lastPlay["nick"]).fromRecord(lastPlay) : lastPlay));
        super.fromRecord(record);
        this.title = record["tittel"];
        this.presidentStreak = Number.isInteger(record["presidentStreak"])
            ? record["presidentStreak"]
            : 0;
        this.bomsStreak = Number.isInteger(record["bomsStreak"])
            ? record["bomsStreak"]
            : 0;
        this.lastPlacement = Number.isInteger(record["lastPlacement"])
            ? record["lastPlacement"]
            : 0;
        this.gaveUp = record["gaveUp"] === true;
        this.botSkill = this.playerKey == "PC"
            ? (record.botSkillVersion === 2 ? BotAI.skill(record.botSkill) : BotAI.skillForName(this.name))
            : null;
        this.leaveAfterExchange = record["leaveAfterExchange"] === true;
        return this;
    }
    resetRound(currentTurnPlayer) {
        super.resetRound(currentTurnPlayer);
        if (currentTurnPlayer === null || (this.lastPlay != "Pass" && this.placement == 0)) {
            // Clear the previous play while the player remains in the round.
            // Also clear it when there is no current player, such as a new game.
            this.lastPlay = null;
        }
    }
    static serializePlayers(players) {
        var result = [];
        players.forEach(player => {
            result.push(player.toRecord());
        });
        return result;
    }
    static deserializePlayers(rank) {
        var players = [];
        rank.forEach(element => {
            players.push((new PresidentPlayer()).fromRecord(element));
        });
        return players;
    }
}

class PresidentGame extends Game {
    constructor(id = null, isPublic = false) {
        super(id);
        this.debug = true;
        this.isPublic = isPublic === true;
        this.turnPause = null;
        this.exchangeReady = null;
        this.fastForward = false;
        this.turnSeconds = gameTurnSeconds();
        this.roundStartVote = null;
        this.gameEndVote = null;
        this.roundStarterName = null;
        this.shuffleStartedAt = null;
        this.playedCards = [];
        this.shufflePlayerOrder = false;
        this.preservePlayerOrderOnStart = false;
        this.lobbyPlayerOrder = false;
        this.endGameVoteResolvedForStart = false;
        this.hostKey = id == null ? getPlayerKey() : null;
        this.hostName = null;
        // Attach to the existing room without overwriting its data.
        if (id == null) {
            this.id = Math.floor(Math.random() * 999999 + 1).toString();
            this.databaseRef = firebase.database().ref(`boms_1/${this.id}`);
            this.rules = {
                showCardsOnly: false
            };
            this.status = 'O'; // O = waiting, G = exchanging cards, S = playing, F = finished, V = void.
            this.lastHumanActionAt = GamePresence.now();
            this.round = 0;
            this.players = [];
            this.piles = [];
            this.turn = -1;
            this.creation = this.save(true);
        } else {
            this.id = id;
            this.databaseRef = firebase.database().ref(`boms_1/${this.id}`);
        }
    }
    shouldShufflePlayersOnStart() {
        var shouldShuffle = this.shufflePlayerOrder === true ||
            (this.status == "O" && this.preservePlayerOrderOnStart !== true);
        this.preservePlayerOrderOnStart = false;
        this.lobbyPlayerOrder = false;
        return shouldShuffle;
    }
    startGame() {
        this.assertSessionActive();
        if (!isLobbyHost(this)) { throw ("Bare verten kan starte spillet."); }
        if (this.status == "O" && (this.players.length < 2 || !this.allHumansReady())) {
            throw ("Alle menneskespillere må være klare.");
        }
        if (this.status == "F" && this.gameEndVote != null &&
            this.endGameVoteResolvedForStart !== true) {
            throw ("Sluttavstemningen må være ferdig før neste runde starter.");
        }
        this.endGameVoteResolvedForStart = false;
        this.lastHumanActionAt = GamePresence.now();
        this.shuffleStartedAt = GamePresence.now();
        this.fastForward = false;
        if (this.status == "O" || this.status == "F") {
            this.roundStartVote = null;
            this.gameEndVote = null;
        }
        return super.startGame();
    }
    assertSessionActive() {
        if (this.localWritePending) { throw ("Venter på at handlingen lagres."); }
        if (!GamePresence.isExpired(this)) { return; }
        this.save();
        throw ("Spilløkten er avsluttet.");
    }
    recordHumanAction(player) {
        if (player && player.gaveUp !== true && !GamePresence.isBot(this, player)) {
            this.lastHumanActionAt = GamePresence.now();
            if (player.playerKey == getPlayerKey() && player.name == this.localPlayerName) {
                this.localActionQueued = true;
            }
        }
    }
    allHumansReady() {
        var humans = this.players.filter(player => !GamePresence.isBot(this, player));
        return this.connectionOnline !== false && humans.length > 0 &&
            humans.every(player => player.ready === true &&
                GamePresence.disconnectedAt(this.presence, player) == null);
    }
    setReady(player, ready) {
        if (this.status != "O" || player == null || player.playerKey == "PC" ||
            player.playerKey != getPlayerKey() || !this.players.includes(player)) {
            throw ("Kan ikke endre klar-status nå.");
        }
        var index = this.players.indexOf(player);
        var now = GamePresence.now();
        this.lastHumanActionAt = Math.max(Number(this.lastHumanActionAt) || 0, now);
        return this.databaseRef.update({
            [`spillere/${index}/ready`]: ready === true,
            lastHumanActionAt: this.lastHumanActionAt
        }).catch(error => {
            console.error("Kunne ikke lagre klar-status.", error);
        });
    }
    clearNeutralRoundVoteRecord() {
        this.databaseRef.child("roundStartVote").remove().catch(error => {
            console.error("Kunne ikke fjerne avstemningen om nøytral runde.", error);
        });
    }
    clearGameEndVoteRecord() {
        this.databaseRef.child("gameEndVote").remove().catch(error => {
            console.error("Kunne ikke fjerne avstemningen etter spillet.", error);
        });
    }
    save(allowCreate = false) {
        if (this.status == "S") { preparePresentationPause(this); }
        if (this.status != "S" ||
            (!GamePresence.onlyBotsRemain(this) && !this.turnPause?.pendingGameEnd)) {
            this.fastForward = false;
        }
        var expiredLocally = this.status != "V" && GamePresence.isExpired(this);
        if (GamePresence.isExpired(this)) { this.status = "V"; }
        var lastAction = GamePresence.lastActivityAt(this);
        var hasLastAction = lastAction != null;
        this.lastHumanActionAt = hasLastAction ? Number(lastAction) : GamePresence.now();
        var update = {
            status: this.status,
            lastHumanActionAt: this.lastHumanActionAt,
            "regler": { "VisKunKort": this.rules.showCardsOnly },
            "runde": this.round,
            "spillere": PresidentPlayer.serializePlayers(this.players),
            "spillBunke": this.status == "V" ? [] : this.serializePiles(),
            "sinTur": this.turn,
            "turnPause": this.turnPause,
            "fastForward": this.fastForward === true,
            "turnSeconds": gameTurnSeconds(this.turnSeconds),
            "roundStarterName": this.roundStarterName,
            "shuffleStartedAt": this.shuffleStartedAt,
            "playedCards": this.playedCards || [],
            "exchangeReceipts": this.exchangeReceipts || [],
            "exchangeReady": this.exchangeReady || null,
            "skippedTrades": this.skippedTrades || [],
            "dealTotal": this.dealTotal ?? null,
            "dealStarterStep": this.dealStarterStep ?? null,
            "hostKey": this.hostKey,
            "hostName": this.hostName ?? null,
            "isPublic": this.isPublic === true,
            "preservePlayerOrderOnStart": this.preservePlayerOrderOnStart,
            "lobbyPlayerOrder": this.lobbyPlayerOrder === true,
            ...(this.status != "F" ? { roundStartVote: null, gameEndVote: null } : {}),
            ts: new Date()
        };
        var localAction = this.localActionQueued === true;
        this.localActionQueued = false;
        var notifyLocalAction = (phase, snapshot = null) => {
            if (localAction && typeof document != "undefined" && typeof document.dispatchEvent == "function") {
                document.dispatchEvent(new CustomEvent("local-game-action", {
                    detail: { game: this, phase, snapshot }
                }));
            }
        };
        if (localAction) {
            this.localWritePending = true;
            notifyLocalAction("started");
        }
        var failureReported = false;
        var exchangeAction = this.pendingExchangeAction;
        delete this.pendingExchangeAction;
        var snapshotUpdate = update;
        var failed = error => {
            if (failureReported) { return; }
            failureReported = true;
            console.error("Kunne ikke lagre spillet.", error);
            if (localAction) { this.localWritePending = false; }
            notifyLocalAction("failed");
        };
        var write;
        if (typeof this.databaseRef.transaction == "function") {
            write = this.databaseRef.transaction(current => {
                var update = snapshotUpdate;
                if (current == null) {
                    if (!allowCreate) { return; }
                    return Object.assign({}, update, {
                        lastHumanActionAt: firebase.database.ServerValue?.TIMESTAMP ?? update.lastHumanActionAt
                    });
                }
                if (GamePresence.isExpired(current)) {
                    this.status = "V";
                    return current.status == "V" ? undefined : Object.assign({}, current, { status: "V" });
                }
                if (expiredLocally) { return; }
                if (exchangeAction) {
                    if (current.status != "G" || current.shuffleStartedAt != update.shuffleStartedAt ||
                        current.runde != update.runde) { return; }
                    const replay = Object.assign(Object.create(PresidentGame.prototype), this, {
                        status: "G", players: PresidentPlayer.deserializePlayers(current.spillere || []),
                        piles: PresidentGame.deserializeExchanges(current.spillBunke || []),
                        exchangeReceipts: current.exchangeReceipts || [], exchangeReady: current.exchangeReady || null,
                        roundStarterName: current.roundStarterName || null,
                        controllers: current.controllers || {},
                        replayingExchange: true, assertSessionActive() {}, recordHumanAction() {}, save() {}
                    });
                    const exchange = replay.piles.find(candidate => getExchangeId(candidate) == exchangeAction.id);
                    if (!exchange || !["Velg", "Best"].includes(exchange.mode)) { return; }
                    exchange.cards = PresidentCard.deserializeDeck(exchangeAction.cards);
                    if (exchangeAction.select) {
                        const available = getAvailableExchangeCards(replay, exchange.from, exchange);
                        if (exchange.mode != "Velg" || exchange.cards.length > exchange.count ||
                            new Set(exchange.cards.map(exchangeCardKey)).size != exchange.cards.length ||
                            exchange.cards.some(card => !available.some(candidate => exchangeCardKey(candidate) == exchangeCardKey(card)))) {
                            return;
                        }
                    } else {
                        replay.giveExchangeCards(exchange);
                    }
                    update = Object.assign({}, update, {
                        status: replay.status, spillere: PresidentPlayer.serializePlayers(replay.players),
                        spillBunke: replay.serializePiles(), sinTur: replay.turn,
                        roundStarterName: replay.roundStarterName, exchangeReceipts: replay.exchangeReceipts,
                        exchangeReady: replay.exchangeReady || null
                    });
                }
                var baseline = GamePresence.lastActivityAt(current);
                var lastHumanActionAt = baseline != null
                    ? (hasLastAction ? Math.max(Number(baseline), update.lastHumanActionAt) : Number(baseline))
                    : update.lastHumanActionAt;
                var next = Object.assign({}, current, update, { lastHumanActionAt });
                if (current.shuffleStartedAt == update.shuffleStartedAt && current.runde == update.runde) {
                    if (current.status == "G" && update.status == "G" &&
                        (update.spillBunke || []).some(exchange => {
                            if (exchange.modus != "Tilbud") { return false; }
                            var saved = (current.spillBunke || []).find(candidate => candidate.id == exchange.id);
                            return !saved || saved.modus != "Tilbud" ||
                                (saved.forcedAt != null && exchange.forcedAt != saved.forcedAt);
                        })) { return; }
                    var receipts = new Map((current.exchangeReceipts || []).map(receipt => [receipt.id, receipt]));
                    update.exchangeReceipts.forEach(receipt => receipts.set(receipt.id,
                        Object.assign({}, receipt, receipts.get(receipt.id)?.summaryGateId
                            ? { summaryGateId: receipts.get(receipt.id).summaryGateId } : {})));
                    next.exchangeReceipts = Array.from(receipts.values());
                    var skippedTrades = new Map((current.skippedTrades || []).map(trade => [trade.id, trade]));
                    update.skippedTrades.forEach(trade => skippedTrades.set(trade.id, trade));
                    next.skippedTrades = Array.from(skippedTrades.values());
                    var hasNewReceipts = update.exchangeReceipts.some(receipt =>
                        !(current.exchangeReceipts || []).some(previous => previous.id == receipt.id));
                    if (!hasNewReceipts && !(current.status == "G" && update.status == "S" &&
                        update.exchangeReady && !update.exchangeReady.receiptIds)) {
                        next.exchangeReady = current.exchangeReady || null;
                    }
                }
                next.turnSeconds = gameTurnSeconds(current.turnSeconds);
                next.fastForward = current.fastForward === true &&
                    current.shuffleStartedAt == update.shuffleStartedAt &&
                    (GamePresence.onlyBotsRemain(next) ||
                        (next.status == "S" && next.turnPause?.pendingGameEnd === true));
                if (next.turnPause) {
                    if (current.turnPause?.id == next.turnPause.id) {
                        next.turnPause = Object.assign({}, next.turnPause, {
                            until: current.turnPause.until,
                            ...(current.turnPause.presentationVersion == 1 ? {
                                botUntil: current.turnPause.botUntil,
                                ...(current.turnPause.readyAt != null ? { readyAt: current.turnPause.readyAt } : {})
                            } : {})
                        });
                    } else if (next.turnPause.presentationVersion == 1 &&
                        next.fastForward != update.fastForward) {
                        var botUntil = next.turnPause.startedAt +
                            (next.fastForward ? 1000 : next.turnPause.botDelayMs);
                        next.turnPause = Object.assign({}, next.turnPause, { botUntil, until: botUntil });
                    } else if (next.turnPause.presentationVersion != 1 && (next.fastForward != update.fastForward ||
                        next.turnSeconds != gameTurnSeconds(update.turnSeconds))) {
                        var previousDelay = update.fastForward ? 1000 : gameTurnSeconds(update.turnSeconds) * 1000;
                        var nextDelay = next.fastForward ? 1000 : next.turnSeconds * 1000;
                        next.turnPause = Object.assign({}, next.turnPause, {
                            until: next.turnPause.until + nextDelay - previousDelay
                        });
                    }
                }
                return next;
            }, (error, committed, snapshot) => {
                if (error) { failed(error); return; }
                if (localAction) { this.localWritePending = false; }
                if (snapshot && snapshot.val()) {
                    this.lastHumanActionAt = GamePresence.lastActivityAt(snapshot.val());
                    this.turnSeconds = gameTurnSeconds(snapshot.val().turnSeconds);
                    if (snapshot.val().status == "V" || expiredLocally) { this.status = snapshot.val().status; }
                } else if (!allowCreate) {
                    this.status = "V";
                }
                this.updatePublicListing();
                notifyLocalAction(committed ? "saved" : "rejected", snapshot);
            }, allowCreate === true);
        } else {
            write = this.databaseRef.update(update);
            if (localAction && write && typeof write.then == "function") {
                write.then(() => {
                    this.localWritePending = false;
                    notifyLocalAction("saved");
                }, failed);
            }
        }
        if (write && typeof write.catch == "function") { write.catch(failed); }
        this.updatePublicListing();
        return write;
    }
    updatePublicListing() {
        var listingRef = firebase.database().ref(`${PUBLIC_LOBBY_PATH}/${this.id}`);
        var humans = (this.players || []).filter(player => player.playerKey != "PC");
        var listed = !GamePresence.isExpired(this) && this.isPublic === true && humans.length > 0;
        if (!listed) {
            listingRef.remove().catch(() => { });
            return;
        }
        listingRef.set({
            id: this.id,
            host: humans[0].name,
            players: this.players.length,
            bots: this.players.filter(player => player.playerKey == "PC").length,
            turnSeconds: gameTurnSeconds(this.turnSeconds),
            waiting: this.status == "O",
            ts: Date.now()
        }).catch(error => {
            console.error("Kunne ikke oppdatere offentlig lobby.", error);
        });
        if (isLobbyHost(this)) {
            listingRef.onDisconnect().remove();
        }
    }
    finishGame() {
        if (GamePresence.isExpired(this)) {
            this.save();
            return false;
        }
        var finished = super.finishGame();
        if (finished) {
            this.save();
            this.recordFinishedPlayerStats().catch(error => {
                console.error("Kunne ikke lagre spillerstatistikk.", error);
            });
            this.beginGameEndVote();
        }
        return finished;
    }
    async recordFinishedPlayerStats() {
        var gameId = this.id;
        var roundKey = `${gameId}:${this.round || 1}:${this.shuffleStartedAt || 0}`;
        var finishedAt = this.endTime || Date.now();
        var playerCount = this.players.length;
        var players = this.players.map(player => ({
            playerKey: player.playerKey == "PC"
                ? `bot-${Array.from(player.name, character => character.codePointAt(0).toString(16)).join("-")}`
                : player.playerKey,
            isBot: player.playerKey == "PC", name: player.name, placement: player.placement,
            presidentStreak: player.presidentStreak, bomsStreak: player.bomsStreak
        }));
        await Promise.all(players.map(player =>
            firebase.database().ref(`playerStats/${player.playerKey}`).transaction(record => {
                var previous = record && typeof record == "object" ? record : {};
                var latestName = previous.nameUpdatedAt > finishedAt ? previous.name : player.name;
                var names = Array.isArray(previous.names)
                    ? previous.names.filter(name => typeof name == "string")
                    : [];
                var nameAdded = !names.includes(player.name);
                if (nameAdded) { names.push(player.name); }
                var winGames = previous.presidentWinGames &&
                    typeof previous.presidentWinGames == "object"
                    ? Object.assign({}, previous.presidentWinGames)
                    : {};
                var normalizedName = player.name.trim().toLocaleLowerCase();
                var hasDefaultName = normalizedName == "spiller" || normalizedName == "player";
                var completedRounds = Object.assign({}, previous.completedRounds || {});
                var newRound = !completedRounds[roundKey] && playerCount >= 2 &&
                    Number.isInteger(player.placement) && player.placement >= 1 && player.placement <= playerCount;
                var legacyWin = previous.completedRounds == null && winGames[gameId] === true;
                var wonGame = newRound && player.placement == 1 && !hasDefaultName && !legacyWin;
                if (wonGame) { winGames[gameId] = true; winGames[roundKey] = true; }
                var wins = Number.isSafeInteger(previous.presidentWins) && previous.presidentWins >= 0
                    ? previous.presidentWins
                    : 0;
                if (previous.name == player.name && !newRound && !nameAdded) {
                    return;
                }
                var roundStats = {};
                if (newRound) {
                    completedRounds[roundKey] = true;
                    var number = value => Number.isFinite(value) && value >= 0 ? value : 0;
                    var roundsPlayed = number(previous.roundsPlayed) + 1;
                    var placementTotal = number(previous.normalizedPlacementTotal) +
                        1 + 2 * (player.placement - 1) / (playerCount - 1);
                    var isPresident = player.placement == 1;
                    var isBum = player.placement == playerCount;
                    roundStats = {
                        completedRounds, roundsPlayed, normalizedPlacementTotal: placementTotal,
                        placementScore: placementTotal / roundsPlayed,
                        bomsCount: number(previous.bomsCount) + Number(isBum),
                        longestPresidentStreak: Math.max(number(previous.longestPresidentStreak),
                            isPresident ? Math.max(1, number(player.presidentStreak)) : 0),
                        longestBomsStreak: Math.max(number(previous.longestBomsStreak),
                            isBum ? Math.max(1, number(player.bomsStreak)) : 0),
                        ...(!hasDefaultName ? { lastActiveAt: Math.max(number(previous.lastActiveAt), finishedAt) } : {})
                    };
                }
                return Object.assign({}, previous, {
                    ...(player.isBot ? { isBot: true } : {}),
                    name: latestName,
                    nameUpdatedAt: Math.max(previous.nameUpdatedAt || 0, finishedAt),
                    names,
                    presidentWins: wins + Number(wonGame),
                    presidentWinGames: winGames
                }, roundStats);
            }, undefined, false)
        ));
    }
    beginGameEndVote() {
        if (!isLobbyHost(this)) { return null; }
        if (this.status != "F") {
            throw ("Spillet må være ferdig før sluttavstemningen starter.");
        }
        if (this.gameEndVote != null) { return this.gameEndVote; }
        var humanPlayers = this.players.filter(player => !GamePresence.isBot(this, player));
        var vote = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            until: Date.now() + 150000,
            votes: []
        };
        if (humanPlayers.length == 0) {
            vote.result = "lobby";
        }
        this.gameEndVote = vote;
        this.databaseRef.child("gameEndVote").transaction(
            current => current == null ? vote : current,
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke starte sluttavstemningen.", error);
                    return;
                }
                if (snapshot != null && snapshot.val() != null) {
                    this.gameEndVote = snapshot.val();
                    if (this.gameEndVote.result != null) {
                        this.claimGameEndVote();
                    }
                }
            },
            false
        );
        return vote;
    }
    submitGameEndVote(player, choice) {
        var vote = this.gameEndVote;
        var humanPlayers = this.players.filter(candidate => !GamePresence.isBot(this, candidate));
        if (this.status != "F" || vote == null || vote.result != null ||
            !humanPlayers.includes(player) ||
            (choice != "lobby" && choice != "next_round")) {
            return false;
        }
        var playerId = roundVotePlayerId(player);
        this.databaseRef.child("gameEndVote").transaction(
            current => {
                if (current == null || current.id != vote.id || current.result != null) {
                    return;
                }
                var votes = Array.isArray(current.votes) ? current.votes.slice() : [];
                var existingVote = votes.findIndex(item => item.playerId == playerId);
                var playerVote = { playerId: playerId, choice: choice };
                if (existingVote >= 0) {
                    votes[existingVote] = playerVote;
                } else {
                    votes.push(playerVote);
                }
                return Object.assign({}, current, { votes: votes });
            },
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke lagre sluttstemmen.", error);
                    return;
                }
                if (snapshot != null && snapshot.val() != null) {
                    this.gameEndVote = snapshot.val();
                    this.resolveGameEndVote(false);
                }
            },
            false
        );
        return true;
    }
    resolveGameEndVote(timeoutReached = false) {
        if (!isLobbyHost(this)) { return; }
        var vote = this.gameEndVote;
        if (this.status != "F" || vote == null) { return; }
        if (vote.result != null) {
            this.claimGameEndVote();
            return;
        }
        var humanPlayers = this.players.filter(player => !GamePresence.isBot(this, player));
        var humanIds = new Set(humanPlayers.map(roundVotePlayerId));
        var voteId = vote.id;
        this.databaseRef.child("gameEndVote").transaction(
            current => {
                if (current == null || current.id != voteId || current.result != null) {
                    return;
                }
                var votesByPlayer = new Map();
                (Array.isArray(current.votes) ? current.votes : []).forEach(playerVote => {
                    if (humanIds.has(playerVote.playerId) &&
                        (playerVote.choice == "lobby" || playerVote.choice == "next_round")) {
                        votesByPlayer.set(playerVote.playerId, playerVote.choice);
                    }
                });
                var lobbyVotes = Array.from(votesByPlayer.values())
                    .filter(choice => choice == "lobby").length;
                var nextRoundVotes = votesByPlayer.size - lobbyVotes;
                var majority = Math.floor(humanPlayers.length / 2) + 1;
                var result = null;
                if (lobbyVotes >= majority) {
                    result = "lobby";
                } else if (nextRoundVotes >= majority) {
                    result = "next_round";
                } else if (votesByPlayer.size >= humanPlayers.length ||
                    timeoutReached || current.until <= Date.now()) {
                    if (lobbyVotes == nextRoundVotes) {
                        var host = humanPlayers.find(player => player.playerKey == this.hostKey &&
                            (this.hostName == null || player.name == this.hostName));
                        var hostChoice = host ? votesByPlayer.get(roundVotePlayerId(host)) : null;
                        if (hostChoice == null) { return; }
                        return Object.assign({}, current, { result: hostChoice });
                    }
                    result = lobbyVotes > nextRoundVotes ? "lobby" : "next_round";
                }
                if (result == null) { return; }
                return Object.assign({}, current, { result: result });
            },
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke fullføre sluttavstemningen.", error);
                    return;
                }
                if (snapshot != null && snapshot.val() != null) {
                    this.gameEndVote = snapshot.val();
                    this.claimGameEndVote();
                }
            },
            false
        );
    }
    claimGameEndVote() {
        if (!isLobbyHost(this)) { return; }
        var vote = this.gameEndVote;
        if (this.status != "F" || vote == null || vote.result == null) { return; }
        var voteId = vote.id;
        this.databaseRef.child("gameEndVote").transaction(
            current => {
                if (current == null || current.id != voteId ||
                    current.result == null || current.started === true) {
                    return;
                }
                return Object.assign({}, current, { started: true });
            },
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke starte valgte sluttalternativ.", error);
                    return;
                }
                if (!committed || snapshot == null || snapshot.val() == null ||
                    this.status != "F") {
                    return;
                }
                var result = snapshot.val().result;
                if (result == "lobby") {
                    this.returnToLobby();
                    return;
                }
                var humanPlayers = this.players.filter(player => !GamePresence.isBot(this, player));
                if (this.needsNeutralRoundVote() && humanPlayers.length > 0) {
                    this.roundStartVote = null;
                    this.beginNeutralRoundVote();
                    return;
                }
                this.endGameVoteResolvedForStart = true;
                this.startGame();
                if (typeof this.onRoundStarted == "function") {
                    this.onRoundStarted();
                }
            },
            false
        );
    }
    finishPlayer(player, won = true) {
        var finished = super.finishPlayer(player, won);
        if (!finished || this.status != "S") { return finished; }
        if (player.placement == 1) {
            player.presidentStreak = player.lastPlacement == 1
                ? player.presidentStreak + 1
                : 1;
            player.bomsStreak = 0;
        } else if (player.placement == this.players.length) {
            player.bomsStreak = player.lastPlacement == this.players.length
                ? player.bomsStreak + 1
                : 1;
            player.presidentStreak = 0;
        } else {
            player.presidentStreak = 0;
            player.bomsStreak = 0;
        }
        player.lastPlacement = player.placement;
        return finished;
    }
    resetForRound() {
        this.assertSessionActive();
        super.resetForRound();
        this.playedCards = [];
        this.players.forEach(player => {
            player.presidentStreak = 0;
            player.bomsStreak = 0;
            player.lastPlacement = 0;
        });
        this.roundStartVote = null;
        this.gameEndVote = null;
        this.roundStarterName = null;
        this.shufflePlayerOrder = true;
        this.preservePlayerOrderOnStart = false;
        this.clearNeutralRoundVoteRecord();
        this.clearGameEndVoteRecord();
        this.save();
    }
    returnToLobby() {
        this.assertSessionActive();
        if (this.status != "F") {
            throw ("Bare et ferdig spill kan gå tilbake til lobbyen.");
        }
        this.players.forEach(player => {
            player.ready = false;
            player.cards = new CardDeck();
            player.turn = 0;
            player.messages = [];
            player.lastPlay = null;
            player.gaveUp = false;
            delete player.leaveAfterExchange;
        });
        this.status = "O";
        this.round = 0;
        this.startTime = null;
        this.endTime = null;
        this.turn = -1;
        this.turnPause = null;
        this.piles = [];
        this.playedCards = [];
        this.roundStartVote = null;
        this.gameEndVote = null;
        this.roundStarterName = null;
        this.shufflePlayerOrder = false;
        this.preservePlayerOrderOnStart = true;
        this.save();
    }
    resetPreservedLobbyPlacements() {
        this.players.forEach(player => {
            player.placement = 0;
            player.lastPlacement = 0;
            player.presidentStreak = 0;
            player.bomsStreak = 0;
        });
        this.preservePlayerOrderOnStart = this.lobbyPlayerOrder === true;
        this.shufflePlayerOrder = this.lobbyPlayerOrder !== true;
    }
    addPlayer(incomingPlayer) {
        return new Promise(resolve => {
            var failure;
            var assignedName = incomingPlayer.name;
            this.databaseRef.transaction(current => {
                failure = null;
                assignedName = incomingPlayer.name;
                if (current == null) {
                    failure = "Spillet er ikke tilkoblet.";
                    return;
                }
                if (GamePresence.isExpired(current)) {
                    failure = "Spilløkten er avsluttet.";
                    return;
                }
                var players = current.spillere || [];
                var existing = players.find(player =>
                    player.nick.toLocaleLowerCase() == incomingPlayer.name.toLocaleLowerCase());
                if (existing != null) {
                    if (incomingPlayer.playerKey == "PC") {
                        failure = "Navnet er allerede i bruk.";
                        return;
                    }
                    if (existing.spillerKey == incomingPlayer.playerKey && existing.nick == incomingPlayer.name) {
                        assignedName = existing.nick;
                        return current;
                    }
                }
                if (current.status != "O" && current.status != "F") {
                    failure = "Ingen nye spillere når spillet pågår.";
                    return;
                }
                if (current.gameEndVote != null || current.roundStartVote != null) {
                    failure = "Vent til avstemningen er ferdig før du blir med i neste runde.";
                    return;
                }
                var botIndex = incomingPlayer.playerKey != "PC"
                    ? players.findIndex(player => player.spillerKey == "PC") : -1;
                if (players.length >= MAX_PLAYERS && botIndex < 0) {
                    failure = `Spillet har plass til maks ${MAX_PLAYERS} spillere.`;
                    return;
                }
                if (incomingPlayer.playerKey == "PC" &&
                    (current.hostKey != getPlayerKey() ||
                        (current.hostName != null && current.hostName != this.localPlayerName))) {
                    failure = "Bare verten kan legge til bots.";
                    return;
                }
                var next = Object.assign({}, current);
                assignedName = availablePlayerName(incomingPlayer.name, players.map(player => player.nick));
                var incomingRecord = incomingPlayer.toRecord();
                incomingRecord.nick = assignedName;
                next.spillere = players.slice();
                var colorPlayers = players.map(player => ({
                    name: player.nick,
                    displayColor: player.displayColor
                }));
                assignPlayerColors({ id: this.id, players: colorPlayers });
                next.spillere = next.spillere.map((player, index) => Object.assign({}, player, {
                    displayColor: colorPlayers[index].displayColor
                }));
                var existingColors = colorPlayers.filter((player, index) => index != botIndex);
                var incomingColorPlayer = { name: assignedName };
                assignPlayerColors({
                    id: this.id,
                    players: existingColors.concat([incomingColorPlayer])
                });
                incomingRecord.displayColor = incomingColorPlayer.displayColor;
                if (players.length >= MAX_PLAYERS) {
                    next.spillere[botIndex] = incomingRecord;
                } else {
                    next.spillere.push(incomingRecord);
                }
                if (current.status == "F" || current.preservePlayerOrderOnStart) {
                    next.spillere = next.spillere.map(player => Object.assign({}, player, {
                        plassering: 0, lastPlacement: 0, presidentStreak: 0, bomsStreak: 0
                    }));
                    next.preservePlayerOrderOnStart = current.lobbyPlayerOrder === true;
                    next.shufflePlayerOrder = current.lobbyPlayerOrder !== true;
                }
                next.status = "O";
                next.playedCards = [];
                if (incomingPlayer.playerKey != "PC") {
                    next.lastHumanActionAt = Math.max(GamePresence.lastActivityAt(current) ?? 0, GamePresence.now());
                }
                if (incomingPlayer.playerKey != "PC" &&
                    (next.hostKey == null || (next.hostName == null && next.hostKey == incomingPlayer.playerKey))) {
                    next.hostKey = incomingPlayer.playerKey;
                    next.hostName = assignedName;
                }
                return next;
            }, (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke legge til spilleren.", error);
                    resolve({ text: "Kunne ikke legge til spilleren. Prøv igjen." });
                    return;
                }
                if (!committed) {
                    resolve({ text: failure || "Kunne ikke legge til spilleren. Prøv igjen." });
                    return;
                }
                var record = snapshot.val();
                this.players = PresidentPlayer.deserializePlayers(record.spillere || []);
                this.hostKey = record.hostKey || null;
                this.hostName = record.hostName || null;
                this.status = record.status;
                this.lastHumanActionAt = GamePresence.lastActivityAt(record);
                this.preservePlayerOrderOnStart = record.preservePlayerOrderOnStart === true;
                this.lobbyPlayerOrder = record.lobbyPlayerOrder === true;
                this.updatePublicListing();
                resolve({ player: this.getPlayer(assignedName) });
            }, false);
        });
    }
    async reorderLobbyPlayers(sourceName, targetName) {
        if (this.connectionOnline === false) { throw new Error("Kan ikke flytte spillere uten tilkobling."); }
        var result = await this.databaseRef.transaction(record => {
            if (!record || record.status != "O" || GamePresence.isExpired(record) ||
                record.hostKey != getPlayerKey() ||
                (record.hostName != null && record.hostName != this.localPlayerName)) { return; }
            var players = (record.spillere || []).slice();
            var from = players.findIndex(player => player.nick == sourceName);
            var to = players.findIndex(player => player.nick == targetName);
            if (from < 0 || to < 0 || from == to) { return; }
            players.splice(to, 0, players.splice(from, 1)[0]);
            return Object.assign({}, record, {
                spillere: players, preservePlayerOrderOnStart: true, shufflePlayerOrder: false, lobbyPlayerOrder: true
            });
        }, undefined, false);
        if (!result.committed) {
            throw new Error("Bare verten kan flytte spillere i en åpen lobby. Prøv igjen.");
        }
        this.players = PresidentPlayer.deserializePlayers(result.snapshot.val().spillere);
        this.preservePlayerOrderOnStart = true;
        this.shufflePlayerOrder = false;
        this.lobbyPlayerOrder = true;
    }
    removeLobbyPlayer(player) {
        return new Promise(resolve => {
            var failure = "Kan ikke fjerne spilleren nå.";
            this.databaseRef.transaction(current => {
                if (current == null) { return; }
                if (current.hostKey != getPlayerKey() ||
                    (current.hostName != null && current.hostName != this.localPlayerName)) {
                    failure = "Bare verten kan fjerne spillere.";
                    return;
                }
                if ((current.status != "O" && current.status != "F") ||
                    current.gameEndVote != null || current.roundStartVote != null) { return; }
                var players = current.spillere || [];
                var index = players.findIndex(record =>
                    record.nick == player.name && record.spillerKey == player.playerKey);
                if (index < 0 || (player.playerKey == current.hostKey &&
                    (current.hostName == null || player.name == current.hostName))) { return; }
                var next = Object.assign({}, current, {
                    spillere: players.filter((record, i) => i != index)
                });
                if (current.status == "O" && current.preservePlayerOrderOnStart) {
                    next.spillere = next.spillere.map(record => Object.assign({}, record, {
                        plassering: 0, lastPlacement: 0, presidentStreak: 0, bomsStreak: 0
                    }));
                    next.preservePlayerOrderOnStart = current.lobbyPlayerOrder === true;
                    next.shufflePlayerOrder = current.lobbyPlayerOrder !== true;
                }
                return next;
            }, (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke fjerne spilleren.", error);
                    resolve({ text: "Kunne ikke fjerne spilleren. Prøv igjen." });
                    return;
                }
                if (!committed) { resolve({ text: failure }); return; }
                var record = snapshot.val();
                this.players = PresidentPlayer.deserializePlayers(record.spillere || []);
                this.preservePlayerOrderOnStart = record.preservePlayerOrderOnStart === true;
                this.lobbyPlayerOrder = record.lobbyPlayerOrder === true;
                this.shufflePlayerOrder = record.shufflePlayerOrder === true;
                this.updatePublicListing();
                resolve({});
            }, false);
        });
    }
    renamePlayer(player, requestedName) {
        var oldName = player.name;
        var assignedName;
        return new Promise(resolve => {
            this.databaseRef.transaction(current => {
                if (current == null) { return; }
                var players = current.spillere || [];
                var index = players.findIndex(record =>
                    record.nick == oldName && record.spillerKey == player.playerKey);
                if (index < 0 || player.playerKey != getPlayerKey() || current.status != "O") { return; }
                assignedName = availablePlayerName(requestedName,
                    players.filter((record, i) => i != index).map(record => record.nick));
                var next = Object.assign({}, current);
                next.spillere = players.map((record, i) => {
                    var updated = Object.assign({}, record);
                    if (i == index) { updated.nick = assignedName; }
                    if (updated.laPaaSist && updated.laPaaSist.nick == oldName) {
                        updated.laPaaSist = Object.assign({}, updated.laPaaSist, { nick: assignedName });
                    }
                    return updated;
                });
                if (Array.isArray(current.spillBunke)) {
                    next.spillBunke = current.spillBunke.map(pile =>
                        pile.nick == oldName ? Object.assign({}, pile, { nick: assignedName }) : pile);
                }
                if (current.hostName == oldName && current.hostKey == player.playerKey) {
                    next.hostName = assignedName;
                }
                ["gameEndVote", "roundStartVote"].forEach(key => {
                    if (current[key] && Array.isArray(current[key].votes)) {
                        next[key] = Object.assign({}, current[key], {
                            votes: current[key].votes.map(vote =>
                                vote.playerId == roundVotePlayerId(player)
                                    ? Object.assign({}, vote, {
                                        playerId: roundVotePlayerId({ name: assignedName, playerKey: player.playerKey })
                                    }) : vote)
                        });
                    }
                });
                return next;
            }, (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke endre spillernavnet.", error);
                }
                if (error || !committed) {
                    resolve({ text: "Kunne ikke endre spillernavnet. Prøv igjen." });
                    return;
                }
                var record = snapshot.val();
                this.players = PresidentPlayer.deserializePlayers(record.spillere || []);
                this.hostName = record.hostName || null;
                if (this.status != "G") {
                    this.piles = PresidentCard.deserializePiles(record.spillBunke || []);
                }
                this.gameEndVote = record.gameEndVote || null;
                this.roundStartVote = record.roundStartVote || null;
                this.updatePublicListing();
                resolve({ player: this.getPlayer(assignedName) });
            }, false);
        });
    }
    needsNeutralRoundVote() {
        return this.players.some(player =>
            player.presidentStreak >= 3 || player.bomsStreak >= 3
        );
    }
    beginNeutralRoundVote() {
        if (!isLobbyHost(this)) { return null; }
        if (this.status != "F" || !this.needsNeutralRoundVote()) {
            throw ("Det er ikke grunnlag for en nøytralrunde-avstemning.");
        }
        if (this.roundStartVote != null) { return this.roundStartVote; }
        var vote = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            until: Date.now() + 150000,
            votes: []
        };
        this.roundStartVote = vote;
        this.databaseRef.child("roundStartVote").transaction(
            current => current == null ? vote : current,
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke starte avstemning om nøytral runde.", error);
                    return;
                }
                if (snapshot != null && snapshot.val() != null) {
                    this.roundStartVote = snapshot.val();
                }
            },
            false
        );
        return vote;
    }
    submitNeutralRoundVote(player, neutral) {
        var vote = this.roundStartVote;
        var humanPlayers = this.players.filter(candidate => !GamePresence.isBot(this, candidate));
        if (this.status != "F" || vote == null || vote.result != null ||
            !humanPlayers.includes(player)) {
            return false;
        }
        var playerId = roundVotePlayerId(player);
        this.databaseRef.child("roundStartVote").transaction(
            current => {
                if (current == null || current.id != vote.id || current.result != null) {
                    return;
                }
                var votes = Array.isArray(current.votes) ? current.votes.slice() : [];
                var existingVote = votes.findIndex(item => item.playerId == playerId);
                var playerVote = { playerId: playerId, neutral: neutral === true };
                if (existingVote >= 0) {
                    votes[existingVote] = playerVote;
                } else {
                    votes.push(playerVote);
                }
                return Object.assign({}, current, { votes: votes });
            },
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke lagre stemmen om nøytral runde.", error);
                    return;
                }
                if (snapshot != null && snapshot.val() != null) {
                    this.roundStartVote = snapshot.val();
                    this.resolveNeutralRoundVote(false);
                }
            },
            false
        );
        return true;
    }
    resolveNeutralRoundVote(timeoutReached = false) {
        if (!isLobbyHost(this)) { return; }
        var vote = this.roundStartVote;
        if (this.status != "F" || vote == null) { return; }
        if (vote.result != null) {
            this.claimNeutralRoundStart();
            return;
        }
        var humanPlayers = this.players.filter(player => !GamePresence.isBot(this, player));
        var humanIds = new Set(humanPlayers.map(roundVotePlayerId));
        var voteId = vote.id;
        this.databaseRef.child("roundStartVote").transaction(
            current => {
                if (current == null || current.id != voteId || current.result != null) {
                    return;
                }
                var votesByPlayer = new Map();
                (Array.isArray(current.votes) ? current.votes : []).forEach(playerVote => {
                    if (humanIds.has(playerVote.playerId)) {
                        votesByPlayer.set(playerVote.playerId, playerVote.neutral === true);
                    }
                });
                var neutralVotes = Array.from(votesByPlayer.values()).filter(Boolean).length;
                var normalVotes = votesByPlayer.size - neutralVotes;
                var majority = Math.floor(humanPlayers.length / 2) + 1;
                var result = null;
                if (neutralVotes >= majority) {
                    result = "neutral";
                } else if (normalVotes >= majority) {
                    result = "normal";
                } else if (votesByPlayer.size >= humanPlayers.length) {
                    if (neutralVotes == normalVotes) {
                        var host = this.players.find(player => player.playerKey == this.hostKey &&
                            (this.hostName == null || player.name == this.hostName));
                        var hostChoice = host ? votesByPlayer.get(roundVotePlayerId(host)) : undefined;
                        if (hostChoice === undefined) { return; }
                        return Object.assign({}, current, { result: hostChoice ? "neutral" : "normal" });
                    }
                    result = neutralVotes > normalVotes ? "neutral" : "normal";
                } else if (timeoutReached || current.until <= Date.now()) {
                    if (neutralVotes == normalVotes) {
                        var host = this.players.find(player => player.playerKey == this.hostKey &&
                            (this.hostName == null || player.name == this.hostName));
                        var hostChoice = host ? votesByPlayer.get(roundVotePlayerId(host)) : undefined;
                        if (hostChoice === undefined) { return; }
                        return Object.assign({}, current, { result: hostChoice ? "neutral" : "normal" });
                    }
                    result = neutralVotes > normalVotes ? "neutral" : "normal";
                }
                if (result == null) { return; }
                return Object.assign({}, current, { result: result });
            },
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke fullføre avstemning om nøytral runde.", error);
                    return;
                }
                if (snapshot != null && snapshot.val() != null) {
                    this.roundStartVote = snapshot.val();
                    this.claimNeutralRoundStart();
                }
            },
            false
        );
    }
    claimNeutralRoundStart() {
        if (!isLobbyHost(this)) { return; }
        var vote = this.roundStartVote;
        if (this.status != "F" || vote == null || vote.result == null) { return; }
        var voteId = vote.id;
        this.databaseRef.child("roundStartVote").transaction(
            current => {
                if (current == null || current.id != voteId ||
                    current.result == null || current.started === true) {
                    return;
                }
                return Object.assign({}, current, { started: true });
            },
            (error, committed, snapshot) => {
                if (error) {
                    console.error("Kunne ikke starte neste runde etter avstemningen.", error);
                    return;
                }
                if (!committed || snapshot == null || snapshot.val() == null) { return; }
                var result = snapshot.val().result;
                if (this.status != "F") { return; }
                this.roundStartVote = null;
                if (result == "neutral") {
                    this.players.forEach(player => {
                        player.placement = 0;
                        player.presidentStreak = 0;
                        player.bomsStreak = 0;
                        player.lastPlacement = 0;
                    });
                    this.shufflePlayerOrder = true;
                } else {
                    this.shufflePlayerOrder = false;
                }
                this.endGameVoteResolvedForStart = true;
                this.startGame();
                if (typeof this.onRoundStarted == "function") {
                    this.onRoundStarted();
                }
            },
            false
        );
    }
    leavePlayer(player) {
        if (player == null || !this.players.includes(player)) {
            throw ("Spilleren finnes ikke i dette spillet.");
        }
        if (this.status == "V") { return player; }
        if (GamePresence.isExpired(this) || (player.playerKey != "PC" &&
            !this.players.some(candidate => candidate !== player && candidate.gaveUp !== true &&
                !GamePresence.isBot(this, candidate)))) {
            player.gaveUp = true;
            this.status = "V";
            this.turnPause = null;
            this.setTurn(-1);
            this.save();
            return player;
        }
        if (this.status == "O" && this.preservePlayerOrderOnStart &&
            this.players.includes(player)) {
            this.resetPreservedLobbyPlacements();
        }
        if (player.playerKey == this.hostKey && (this.hostName == null || player.name == this.hostName)) {
            var nextHost = this.players.find(candidate => candidate !== player &&
                !GamePresence.isBot(this, candidate) && candidate.gaveUp !== true);
            this.hostKey = nextHost ? nextHost.playerKey : null;
            this.hostName = nextHost ? nextHost.name : null;
        }
        if (this.status == "S") { player.gaveUp = true; }
        if (this.status != "G") {
            return super.leavePlayer(player);
        }
        player.gaveUp = true;
        if (player.leaveAfterExchange !== true) {
            player.leaveAfterExchange = true;
            this.save();
        }
        if (isLobbyHost(this)) { playBotTurn(this, player); }
        return player;
    }
    serializePiles() {
        if (this.status != "G") {
            return PresidentCard.serializePiles(this.piles);
        }
        return this.piles.map(exchange => {
            var record = {
                "tekst": exchange.text,
                "fra": exchange.from,
                "til": exchange.to,
                "antall": exchange.count,
                "modus": exchange.mode,
                "kort": PresidentCard.serializeDeck(exchange.cards || [])
            };
            ["id", "kind", "tradeId", "sneakyVotes", "sneakyLocked", "botDecisions", "offerUntil",
                "forcedAt", "receiverChoice"].forEach(key => {
                if (exchange[key] != null) {
                    record[key] = exchange[key];
                }
            });
            return record;
        });
    }
    static deserializeExchanges(records) {
        if (records == null) { return []; }
        return records.map(record => {
            var exchange = {
                text: record["tekst"],
                from: record["fra"],
                to: record["til"],
                count: record["antall"],
                mode: record["modus"],
                cards: PresidentCard.deserializeDeck(record["kort"]),
                kind: record.kind || null,
                tradeId: record.tradeId || null,
                sneakyVotes: record.sneakyVotes || [],
                sneakyLocked: record.sneakyLocked === true,
                botDecisions: record.botDecisions || {}
            };
            exchange.offerUntil = record.offerUntil ?? null;
            exchange.forcedAt = record.forcedAt ?? null;
            exchange.receiverChoice = record.receiverChoice ?? null;
            exchange.id = record.id || `exchange:${exchange.from}:${exchange.to}`;
            return exchange;
        });
    }
    deckCount() {
        return 1;
    }
    placementTitle(placement) {
        if (this.players.length >= 4) {
            switch (placement) {
                case 1:
                    return ({ title: "President", img: "president.svg" });
                case 2:
                    return ({ title: "Visepresident", img: "vice-president.svg" });
                case this.players.length - 1:
                    return ({ title: "Viseboms", img: "vice-boms.svg" });
                case this.players.length:
                    return ({ title: "Boms", img: "boms.svg" });
                default:
                    return ({ title: "Nøytral", img: "worker.svg" });
            }
        } else {
            if (this.players.length == 3 && placement == 2) {
                return ({ title: "Nøytral", img: "worker.svg" });
            }
            switch (placement) {
                case 1:
                    return ({ title: "President", img: "president.svg" });
                case this.players.length:
                    return ({ title: "Boms", img: "boms.svg" });
                default:
                    return ({ title: "Nøytral", img: "worker.svg" });
            }
        }
    }
    prepareRound() {
        this.playedCards = [];
        this.exchangeReady = null;
        // Build a fresh deck.
        var deck = new CardDeck();
        for (let i = this.deckCount(); i > 0; i--) {
            deck.addStandardCards(function (suit, rank) { return new PresidentCard(suit, rank) });
        }
        if (this.players.length == 3) {
            var diamondThreeIndex = deck.findIndex(card => (card.suit == 4 && card.rank == 3));
            if (diamondThreeIndex >= 0) {
                deck.splice(diamondThreeIndex, 1);
            }
        }
        // Keep heart three available for the opening turn while trimming the remainder.
        deck.sortCards();
        var cardsToRemove = deck.length % this.players.length;
        while (cardsToRemove > 0) {
            var discardIndex = deck.findIndex(card => !(card.suit == 2 && card.rank == 3));
            deck.splice(discardIndex, 1);
            cardsToRemove--;
        }
        // Shuffle and deal the cards.
        deck.shuffle();
        if (this.players.length == 2) { deck.splice(0, 12); }
        this.players.forEach(player => {
            player.cards = new CardDeck();
        });
        const h4cker = this.players.find(player =>
            typeof player.name === "string" && player.name.trim().toLowerCase() === "h4cker"
        );
        if (h4cker) {
            const cardCount = Math.floor(deck.length / this.players.length);
            deck.sort((a, b) => b.strengthRank - a.strengthRank || b.suit - a.suit);
            deck.splice(0, cardCount).forEach(cards => h4cker.cards.push(cards));
        }
        var dealStep = 0;
        this.dealStarterStep = null;
        while (deck.length > 0) {
            this.players.forEach(player => {
                if (player !== h4cker && deck.length > 0) {
                    var dealtCard = deck.pop();
                    if (dealtCard.suit == 2 && dealtCard.rank == 3) {
                        this.dealStarterStep = dealStep;
                    }
                    player.cards.push(dealtCard);
                    dealStep++;
                }
            });
        }
        this.dealTotal = dealStep;
        var hasPreviousPlacements = this.players.some(player => player.placement != 0);
        if (hasPreviousPlacements || this.players.length == 2) { this.dealStarterStep = null; }
        if (hasPreviousPlacements) {
            var presidentIndex = this.players.findIndex(player => player.placement == 1);
            var bumIndex = this.players.findIndex(player => player.placement == this.players.length);
            var vicePresidentIndex = this.players.findIndex(player => player.placement == 2);
            var viceBumIndex = this.players.findIndex(player =>
                player.placement == this.players.length - 1
            );
            var neutralIndex = this.players.findIndex(player =>
                player.placement == 2
            );
            if (presidentIndex < 0 || bumIndex < 0) {
                throw ("Forrige rundes President eller Boms mangler.");
            }
            this.roundStarterName = this.players[bumIndex].name;
            this.players.forEach(player => {
                player.cards.sortCards();
                player.lastPlacement = player.placement;
                player.placement = 0;
            });
            this.piles = [];
            this.status = "G"; // Exchange cards.
            this.exchangeReceipts = [];
            this.skippedTrades = [];
            this.setTurn(null);
            if (this.players.length >= 4) {
                if (vicePresidentIndex < 0 || viceBumIndex < 0) {
                    throw ("Forrige rundes visepresident eller viseboms mangler.");
                }
                this.players[presidentIndex].messages.push("Skal gi to kort til bomsen.");
                this.players[vicePresidentIndex].messages.push("Skal gi ett kort til visebomsen.");
                this.players[viceBumIndex].messages.push("Gir sitt beste kort til visepresidenten.");
                this.players[bumIndex].messages.push("Gir sine to beste kort til presidenten.");
                this.piles = [{
                    text: "Presidenten skal gi bomsen to kort:",
                    from: presidentIndex,
                    to: bumIndex,
                    count: 2,
                    mode: "Velg"
                }, {
                    text: "Visepresidenten skal gi visebomsen ett kort:",
                    from: vicePresidentIndex,
                    to: viceBumIndex,
                    count: 1,
                    mode: "Velg"
                }, {
                    text: "Visebomsen skal gi visepresidenten sitt beste kort:",
                    from: viceBumIndex,
                    to: vicePresidentIndex,
                    count: 1,
                    mode: "Best"
                }, {
                    text: "Bomsen skal gi presidenten sine to beste kort:",
                    from: bumIndex,
                    to: presidentIndex,
                    count: 2,
                    mode: "Best"
                }];
            } else {
                this.piles = [{
                    text: this.players.length == 2 ? "Presidenten skal velge ett kort til Boms:" : "Presidenten skal velge to kort til Boms:",
                    from: presidentIndex,
                    to: bumIndex,
                    count: this.players.length == 2 ? 1 : 2,
                    mode: "Velg"
                }, {
                    text: this.players.length == 2 ? "Boms må gi sitt beste kort til Presidenten:" : "Boms må gi sine to beste kort til Presidenten:",
                    from: bumIndex,
                    to: presidentIndex,
                    count: this.players.length == 2 ? 1 : 2,
                    mode: "Best"
                }];
                if (this.players.length == 3 && neutralIndex >= 0) {
                    this.piles.push({
                        id: `offer:${this.round}:${presidentIndex}:${neutralIndex}`,
                        tradeId: `trade:${this.round}:${presidentIndex}:${neutralIndex}`,
                        kind: "playerTrade",
                        text: "Presidenten kan starte et tvunget bytte med Nøytral:",
                        from: presidentIndex,
                        to: neutralIndex,
                        count: 1,
                        mode: "Tilbud",
                        cards: [],
                        sneakyVotes: []
                    }, {
                        id: `offer:${this.round}:${neutralIndex}:${bumIndex}`,
                        tradeId: `trade:${this.round}:${neutralIndex}:${bumIndex}`,
                        kind: "playerTrade",
                        text: "Nøytral kan starte et tvunget bytte med Boms:",
                        from: neutralIndex,
                        to: bumIndex,
                        count: 1,
                        mode: "Tilbud",
                        cards: [],
                        sneakyVotes: []
                    });
                }
            }
            this.piles.forEach(exchange => {
                if (exchange.kind != "playerTrade") {
                    exchange.tradeId = `mandatory:${this.round}:${Math.min(exchange.from, exchange.to)}:${Math.max(exchange.from, exchange.to)}`;
                }
                if (!exchange.id) {
                    exchange.id = `exchange:${exchange.from}:${exchange.to}`;
                }
            });
            this.piles.filter(exchange => (exchange.mode == "Best")).forEach(exchange => {
                exchange.cards = [];
                var cards = this.players[exchange.from].cards.filter(k => (!k.isClubThree())); // The club three must not be exchanged.
                for (var i = 1; i <= exchange.count; i++) {
                    exchange.cards.push(cards[cards.length - i]);
                }
            });
            this.setTurn(null);
            this.piles.filter(exchange => (exchange.mode == "Velg")).forEach(exchange => {
                this.players[exchange.from].turn = 1;
            })
        } else {
            this.piles = [];
            this.players.forEach(player => {
                player.cards.sortCards();
            });
            this.roundStarterName = null;
            var heartThreePlayerIndex = this.players.findIndex(player =>
                player.cards.some(card => (card.suit == 2 && card.rank == 3))
            );
            if (this.players.length != 2 && heartThreePlayerIndex >= 0) {
                this.setTurn(heartThreePlayerIndex);
            } else {
                this.setTurn(Math.floor(Math.random() * this.players.length));
            }
        }
    }
    startOptionalTrade(offer) {
        this.assertSessionActive();
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); }
        var offerId = getExchangeId(offer);
        var currentOffer = this.piles.find(exchange =>
            getExchangeId(exchange) == offerId && exchange.mode == "Tilbud"
        );
        if (!currentOffer || currentOffer.kind != "playerTrade" ||
            currentOffer != activeTradeOffer(this)) {
            throw ("Dette byttet er ikke lenger tilgjengelig.");
        }
        if (this.exchangeReady) { throw ("Vent til mottatte kort er bekreftet."); }
        if (currentOffer.offerUntil != null && GamePresence.now() >= currentOffer.offerUntil) {
            throw ("Tiden for å tvinge bytte er ute.");
        }
        var fromPlacement = this.players[currentOffer.from].lastPlacement;
        var toPlacement = this.players[currentOffer.to].lastPlacement;
        var isAuthorizedPair =
            (fromPlacement == 1 && toPlacement == 2) ||
            (fromPlacement == 2 && toPlacement == 3);
        if (this.players.length != 3 || !isAuthorizedPair) {
            throw ("Denne bytteregelen gjelder bare President, Nøytral og Boms i et tre-spillers spill.");
        }
        var requestedSneaky = isSneakyTradeAvailable(this) &&
            (currentOffer.sneakyVotes || []).includes(currentOffer.from);
        if (currentOffer.receiverChoice == null) {
            if (currentOffer.forcedAt != null) { throw ("Venter på mottakerens valg av bytte."); }
            if (!requestedSneaky && (!hasLegalTradeCard(this, currentOffer.from, currentOffer) ||
                !hasLegalTradeCard(this, currentOffer.to, currentOffer))) {
                throw ("Begge spillerne må ha et ledig kort fra 7 til J.");
            }
            currentOffer.forcedAt = GamePresence.now();
            currentOffer.offerUntil = currentOffer.forcedAt + 120000;
            currentOffer.sneakyVotes = requestedSneaky ? [currentOffer.from] : [];
            this.recordHumanAction(this.players[currentOffer.from]);
            this.save();
            return;
        }
        var sneaky = hasSneakyConsent(currentOffer, this);
        if (!sneaky && (!hasLegalTradeCard(this, currentOffer.from, currentOffer) ||
            !hasLegalTradeCard(this, currentOffer.to, currentOffer))) {
            throw ("Begge spillerne må ha et ledig kort fra 7 til J.");
        }
        this.piles.splice(this.piles.indexOf(currentOffer), 1);
        var tradeId = currentOffer.tradeId || `trade:${this.round}:${currentOffer.from}:${currentOffer.to}`;
        var votes = isSneakyTradeAvailable(this) ? (currentOffer.sneakyVotes || []).slice() : [];
        var createExchange = (from, to) => ({
            id: `${tradeId}:${from}:${to}`,
            tradeId: tradeId,
            kind: "playerTrade",
            text: `${this.players[from].name} gir ett kort til ${this.players[to].name}:`,
            from: from,
            to: to,
            count: 1,
            mode: "Velg",
            cards: [],
            sneakyVotes: votes.slice(),
            sneakyLocked: currentOffer.forcedAt != null
        });
        this.piles.push(
            createExchange(currentOffer.from, currentOffer.to),
            createExchange(currentOffer.to, currentOffer.from)
        );
        this.players[currentOffer.from].turn = 1;
        this.players[currentOffer.to].turn = 1;
        this.recordHumanAction(this.players[currentOffer.from]);
        this.save();
    }
    respondToForcedTrade(offer, playerIndex, sneaky) {
        this.assertSessionActive();
        var current = activeTradeOffer(this);
        if (this.status != "G" || !current || getExchangeId(current) != getExchangeId(offer) ||
            current.forcedAt == null || current.receiverChoice != null || current.to != playerIndex ||
            this.exchangeReady != null || typeof sneaky != "boolean" ||
            (current.offerUntil != null && GamePresence.now() >= current.offerUntil)) {
            throw ("Dette byttevalget er ikke lenger tilgjengelig.");
        }
        if (sneaky && !isSneakyTradeAvailable(this)) {
            throw ("Ureglementert bytte er ikke tilgjengelig i dette spillet.");
        }
        var votes = (current.sneakyVotes || []).filter(index => index != playerIndex);
        if (sneaky) { votes.push(playerIndex); }
        var agreed = votes.includes(current.from) && votes.includes(current.to);
        if (!agreed && (!hasLegalTradeCard(this, current.from, current) ||
            !hasLegalTradeCard(this, current.to, current))) {
            this.skipForcedTradeWithoutLegalCards(current, playerIndex);
            return;
        }
        current.sneakyVotes = votes;
        current.receiverChoice = sneaky ? "sneaky" : "normal";
        this.recordHumanAction(this.players[playerIndex]);
        this.startOptionalTrade(current);
    }
    skipForcedTradeWithoutLegalCards(offer, playerIndex) {
        this.skippedTrades = [...(this.skippedTrades || []), {
            id: `${this.shuffleStartedAt}:${this.round}:${getExchangeId(offer)}`,
            sender: this.players[offer.from].name, recipient: this.players[offer.to].name,
            reason: "noLegalCards"
        }];
        this.piles = this.piles.filter(candidate => candidate != offer);
        this.recordHumanAction(this.players[playerIndex]);
        this.advanceExchangeStage();
        this.save();
    }
    expireOptionalTrades(now = GamePresence.now()) {
        if (this.status != "G" || !GamePresence.canDrive(this, now) ||
            GamePresence.isActionPaused(this, now)) { return false; }
        var offer = activeTradeOffer(this);
        if (!offer) { return false; }
        if (offer.offerUntil == null) {
            offer.offerUntil = now + 120000;
            this.save();
            return true;
        }
        if (now < offer.offerUntil) { return false; }
        this.piles = this.piles.filter(exchange => exchange != offer);
        this.advanceExchangeStage();
        this.save();
        return true;
    }
    skipOptionalTrade(offer, playerIndex) {
        this.assertSessionActive();
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); }
        var currentOffer = this.piles.find(exchange =>
            getExchangeId(exchange) == getExchangeId(offer) && exchange.mode == "Tilbud"
        );
        if (!currentOffer || currentOffer.kind != "playerTrade" ||
            currentOffer != activeTradeOffer(this)) {
            throw ("Dette byttet er ikke lenger tilgjengelig.");
        }
        if (currentOffer.from != playerIndex || currentOffer.forcedAt != null || this.exchangeReady) {
            throw ("Du kan ikke avslå dette byttet.");
        }
        this.skippedTrades = [...(this.skippedTrades || []), {
            id: `${this.shuffleStartedAt}:${this.round}:${getExchangeId(currentOffer)}`,
            sender: this.players[currentOffer.from].name,
            recipient: this.players[currentOffer.to].name
        }];
        this.piles.splice(this.piles.indexOf(currentOffer), 1);
        this.recordHumanAction(this.players[playerIndex]);
        this.advanceExchangeStage();
        this.save();
    }
    toggleSneakyTrade(exchange, playerIndex) {
        this.assertSessionActive();
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); }
        var current = this.piles.find(candidate =>
            getExchangeId(candidate) == getExchangeId(exchange)
        );
        if (!current || current.kind != "playerTrade" ||
            (current.mode != "Tilbud" && current.mode != "Velg")) {
            throw ("Ureglementert samtykke kan ikke endres nå.");
        }
        if (current.mode == "Tilbud" && current != activeTradeOffer(this)) {
            throw ("Dette byttet er ikke lenger tilgjengelig.");
        }
        if (current.forcedAt != null || this.exchangeReady) {
            throw ("Ureglementert samtykke kan ikke endres nå.");
        }
        if (!isSneakyTradeAvailable(this)) { throw ("Ureglementert bytte er ikke tilgjengelig i dette spillet."); }
        if (playerIndex != current.from && playerIndex != current.to) {
            throw ("Bare deltakerne i byttet kan gi ureglementert samtykke.");
        }
        var relatedExchanges = this.piles.filter(candidate =>
            candidate.tradeId != null && candidate.tradeId == current.tradeId
        );
        if (relatedExchanges.some(candidate =>
            candidate.sneakyLocked === true ||
            (candidate.cards || []).length > 0 ||
            (candidate.mode != "Tilbud" && candidate.mode != "Velg")
        )) {
            throw ("Ureglementert samtykke kan ikke endres etter at kort er valgt.");
        }
        var votes = (current.sneakyVotes || []).slice();
        var voteIndex = votes.indexOf(playerIndex);
        if (voteIndex >= 0) {
            votes.splice(voteIndex, 1);
        } else {
            votes.push(playerIndex);
        }
        relatedExchanges.forEach(candidate => {
            candidate.sneakyVotes = votes.slice();
        });
        this.recordHumanAction(this.players[playerIndex]);
        this.save();
    }
    advanceExchangeStage() {
        if (this.piles.length == 0) {
            this.status = "S";
            var departingPlayers = this.players.filter(player => player.leaveAfterExchange === true);
            departingPlayers.forEach(player => {
                delete player.leaveAfterExchange;
                this.finishPlayer(player, false);
            });
            var activePlayers = this.players.filter(player => player.placement == 0);
            if (activePlayers.length <= 1) {
                if (activePlayers.length == 1) {
                    this.finishPlayer(activePlayers[0], true);
                }
                this.endTime = Date.now();
                this.setTurn(-1);
                this.roundStarterName = null;
                this.status = "F";
                if (!this.results) { this.results = []; }
                this.results.push(
                    this.players.slice()
                        .sort((a, b) => a.placement - b.placement)
                        .map(player => player.name)
                );
            } else {
                var startIndex = -1;
                if (this.roundStarterName != null) {
                    var previousStarterIndex = this.players.findIndex(player =>
                        player.name == this.roundStarterName
                    );
                    if (previousStarterIndex >= 0 &&
                        this.players[previousStarterIndex].placement == 0) {
                        startIndex = previousStarterIndex;
                    } else if (previousStarterIndex >= 0) {
                        for (var offset = 1; offset <= this.players.length; offset++) {
                            var nextIndex = (previousStarterIndex + offset) % this.players.length;
                            if (this.players[nextIndex].placement == 0) {
                                startIndex = nextIndex;
                                break;
                            }
                        }
                    }
                }
                if (startIndex < 0) {
                    startIndex = this.players.indexOf(activePlayers[0]);
                }
                this.roundStarterName = null;
                this.setTurn(startIndex);
                if (!this.exchangeReady && (this.exchangeReceipts || []).some(receipt => !receipt.summaryGateId) &&
                    activePlayers.some(player => !GamePresence.isBot(this, player) && player.gaveUp !== true)) {
                    var now = GamePresence.now();
                    this.exchangeReady = {
                        id: GamePresence.roundToken(this), startedAt: now, until: now + 7000, ready: {}
                    };
                }
            }
        } else {
            var exchangeGroups = new Map();
            this.piles.filter(exchange => exchange.mode != "Tilbud").forEach(exchange => {
                var groupId = exchange.tradeId != null ? `trade:${exchange.tradeId}` :
                    `mandatory:${Math.min(exchange.from, exchange.to)}:${Math.max(exchange.from, exchange.to)}`;
                if (!exchangeGroups.has(groupId)) { exchangeGroups.set(groupId, []); }
                exchangeGroups.get(groupId).push(exchange);
            });
            var completedExchanges = Array.from(exchangeGroups.values())
                .filter(group => group.every(exchange => exchange.mode == "Gitt"))
                .flat();
            if (completedExchanges.length > 0) {
                var previousReceiptCount = (this.exchangeReceipts || []).length;
                var completedExchangeSet = new Set(completedExchanges);
                completedExchanges.forEach(exchange => this.deliverExchangeCards(exchange));
                this.piles = this.piles.filter(exchange => !completedExchangeSet.has(exchange));
                var receipts = this.exchangeReceipts.slice(previousReceiptCount);
                var now = GamePresence.now();
                var gateId = JSON.stringify([GamePresence.roundToken(this), receipts.map(receipt => receipt.id)]);
                receipts.forEach(receipt => { receipt.summaryGateId = gateId; });
                var participants = completedExchanges.every(exchange => exchange.kind != "playerTrade")
                    ? [...new Set(receipts.map(receipt => receipt.recipient))]
                    : this.players.map(player => player.name);
                var gate = this.players.some(player =>
                    participants.includes(player.name) && player.placement == 0 &&
                    player.gaveUp !== true && !GamePresence.isBot(this, player)) ? {
                    id: gateId, startedAt: now, until: now + 7000, ready: {},
                    receiptIds: receipts.map(receipt => receipt.id), participants
                } : null;
                if (gate) {
                    var gates = GamePresence.exchangeGates(this);
                    this.exchangeReady = gates.length
                        ? Object.assign({}, gates[0], { pending: [...gates.slice(1), gate] }) : gate;
                }
                if (this.piles.length == 0) { this.advanceExchangeStage(); }
            }
            var offer = activeTradeOffer(this);
            if (offer && offer.offerUntil == null && !this.exchangeReady) {
                offer.offerUntil = GamePresence.now() + 120000;
            }
        }
    }
    deliverExchangeCards(exchange) {
        if (exchange.cards.length != exchange.count) { throw ("Feil antall kort som byttes."); };
        exchange.cards.forEach(k => {
            this.players[exchange.to].cards.push(new PresidentCard(k.suit, k.rank));
        });
        this.players[exchange.to].cards.sortCards();
        if (!this.replayingExchange) { markReceivedCards(`${this.id}:${this.players[exchange.to].name}`, exchange.cards); }
        var receipt = {
            id: `${this.shuffleStartedAt}:${this.round}:${getExchangeId(exchange)}`,
            recipient: this.players[exchange.to].name,
            sender: this.players[exchange.from].name,
            cards: exchange.cards.map(card => ({ suit: card.suit, rank: card.rank }))
        };
        this.exchangeReceipts = [...(this.exchangeReceipts || []), receipt];
        if (!this.replayingExchange) {
            document.dispatchEvent(new CustomEvent("exchange-cards-received", {
                detail: Object.assign({}, receipt, {
                    game: this, cards: exchange.cards.map(card => new PresidentCard(card.suit, card.rank))
                })
            }));
        }
    }
    giveExchangeCards(exchange) {
        this.assertSessionActive();
        if (GamePresence.exchangeBlocksActions(this)) { throw ("Vent til mottatte kort er bekreftet."); }
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); };
        if (exchange.mode != 'Velg' && exchange.mode != 'Best') { throw (`Kan ikke gi kort når modus er ${exchange.mode} (må være Velg eller Best).`); };
        if (exchange.cards.length != exchange.count) { throw ("Feil antall kort som byttes."); };
        var availableCards = getAvailableExchangeCards(this, exchange.from, exchange);
        var usedCards = new Set();
        exchange.cards.forEach(k => {
            var key = exchangeCardKey(k);
            if (usedCards.has(key) ||
                !availableCards.some(card => exchangeCardKey(card) == key) ||
                !isCardAllowedForExchange(exchange, k, this)) {
                throw ("Kortene er ikke gyldige for dette byttet.");
            }
            usedCards.add(key);
        });
        if (exchange.kind != "playerTrade" && !this.replayingExchange) {
            this.pendingExchangeAction = { id: getExchangeId(exchange), cards: PresidentCard.serializeDeck(exchange.cards) };
        }
        if (exchange.kind == "playerTrade") {
            var relatedExchanges = this.piles.filter(candidate =>
                candidate.tradeId == exchange.tradeId
            );
            relatedExchanges.forEach(candidate => {
                candidate.sneakyLocked = true;
            });
        }
        exchange.cards.forEach(k => {
            var cardIndex = this.players[exchange.from].cards.findIndex(card =>
                card.suit == k.suit && card.rank == k.rank
            );
            this.players[exchange.from].cards.splice(cardIndex, 1);
        });
        exchange.mode = "Gitt";
        this.recordHumanAction(this.players[exchange.from]);
        this.advanceExchangeStage();
        this.save();
    }
    receiveExchangeCards(exchange) {
        this.assertSessionActive();
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); };
        if (exchange.mode != 'Kan se') { throw (`Kan ikke gi kort når modus er ${exchange.mode} (må være Kan se).`); };
        this.deliverExchangeCards(exchange);
        var exchangeIndex = this.piles.findIndex(b => b == exchange);
        if (exchangeIndex >= 0) { this.piles.splice(exchangeIndex, 1); }
        this.recordHumanAction(this.players[exchange.to]);
        this.advanceExchangeStage();
        this.save();
    }
    topPile() {
        if (this.piles.length == 0) { return null; }
        return this.piles[this.piles.length - 1];
    }
    isTurnPaused() {
        if ((this.status == "S" || this.status == "G") && this.shuffleStartedAt != null &&
            GamePresence.now() < Number(this.shuffleStartedAt) + SHUFFLE_DURATION_MS) { return true; }
        if ((this.status == "S" || this.status == "G") && GamePresence.exchangeBlocksActions(this)) { return true; }
        if (this.turnPause?.presentationVersion == 1) {
            var next = this.players[this.turn];
            if ((next && GamePresence.isBot(this, next)) || this.turnPause.pendingGameEnd) {
                return GamePresence.now() < this.turnPause.botUntil;
            }
            return typeof window != "undefined" &&
                this.presentationCompletedPauseId != this.turnPause.id;
        }
        return this.turnPause != null &&
            (Date.now() < this.turnPause.until ||
                (this.turnPause.kind == "clear" &&
                    Array.isArray(this.turnPause.clearedPiles) &&
                    this.turnPause.clearedPiles.length > 0));
    }
    actionPauseMs() {
        return this.fastForward === true &&
            (GamePresence.onlyBotsRemain(this) ||
                (this.status == "S" && this.turnPause?.pendingGameEnd))
            ? 1000 : gameTurnSeconds(this.turnSeconds) * 1000;
    }
    async setPlayerCardAppearance(style, foil = "none") {
        var name = this.localPlayerName;
        if ((this.status != "O" && this.status != "F") || this.connectionOnline === false ||
            Card.normalizeStyle(style, name || "", getPlayerKey()) != style ||
            Card.normalizeFoil(foil) != foil) {
            throw new Error("Kan ikke lagre kortutseendet nå.");
        }
        var result = await this.databaseRef.transaction(record => {
            if (!record || !["O", "F"].includes(record.status) || GamePresence.isExpired(record)) { return; }
            var player = (record.spillere || []).find(player =>
                player.spillerKey == getPlayerKey() && player.nick == name);
            if (!player) { return; }
            return Object.assign({}, record, {
                cardStyles: Object.assign({}, record.cardStyles, { [GamePresence.playerId(player)]: style }),
                cardFoils: Object.assign({}, record.cardFoils, { [GamePresence.playerId(player)]: foil })
            });
        }, undefined, false);
        if (!result.committed) { throw new Error("Kan ikke lagre kortutseendet nå."); }
        this.cardStyles = result.snapshot.val().cardStyles;
        this.cardFoils = result.snapshot.val().cardFoils;
    }
    async setTurnSeconds(seconds) {
        if (![1, 2, 3].includes(seconds)) {
            throw new Error("Velg 1, 2 eller 3 sekunder.");
        }
        if (this.connectionOnline === false || !isLobbyHost(this)) {
            throw new Error("Bare verten kan endre spillhastigheten.");
        }
        var result = await this.databaseRef.transaction(record => {
            if (!record || GamePresence.isExpired(record) ||
                record.hostKey != getPlayerKey() ||
                (record.hostName && record.hostName != this.localPlayerName)) { return; }
            var host = (record.spillere || []).find(player =>
                player.spillerKey == getPlayerKey() && player.nick == this.localPlayerName);
            if (!host || host.gaveUp || (record.controllers || {})[GamePresence.playerId(host)]) { return; }
            return Object.assign({}, record, { turnSeconds: seconds });
        }, undefined, false);
        if (!result.committed) { throw new Error("Bare verten kan endre spillhastigheten."); }
        this.turnSeconds = gameTurnSeconds(result.snapshot.val().turnSeconds);
        this.updatePublicListing();
    }
    setFastForward(enabled) {
        var player = this.getPlayer(this.localPlayerName);
        if (this.connectionOnline === false || !player || player.playerKey != getPlayerKey() ||
            GamePresence.isBot(this, player) || !GamePresence.onlyBotsRemain(this) || !isLobbyHost(this)) {
            return Promise.resolve();
        }
        return this.databaseRef.transaction(record => {
            if (!GamePresence.onlyBotsRemain(record) || GamePresence.isExpired(record)) { return; }
            var member = (record.spillere || []).find(candidate =>
                candidate.nick == player.name && candidate.spillerKey == player.playerKey
            );
            if (!member || member.spillerKey == "PC" ||
                (record.controllers || {})[GamePresence.playerId(member)]) { return; }
            // Only the host may change playback speed; recheck against the stored host.
            var hostKey = record.hostKey ||
                (record.spillere || []).find(candidate => candidate.spillerKey != "PC")?.spillerKey;
            if (member.spillerKey != hostKey || (record.hostName && record.hostName != member.nick)) { return; }
            var update = { fastForward: enabled === true };
            if (record.turnPause && record.turnPause.until > Date.now()) {
                update.turnPause = Object.assign({}, record.turnPause, {
                    until: GamePresence.now() + (enabled ? 1000 : 2000 + Math.floor(Math.random() * 3001))
                });
                update.turnPause.botUntil = update.turnPause.until;
            }
            return Object.assign({}, record, update);
        }).catch(error => {
            console.error("Kunne ikke endre avspillingshastigheten.", error);
        });
    }
    canPlayRank(player, strengthRank, resultInfo = {}) {
        // Check whether a player can play a rank, and mark the matching cards.
        if (this.isTurnPaused()) {
            resultInfo.svar = false;
            resultInfo.text = "Vent til bunken er ryddet.";
            return false;
        }
        if (this.status != "S") {
            resultInfo.svar = false;
            resultInfo.text = "Spillet har ikke startet.";
            return false;
        }
        if (player == null || player.turn != 1) {
            resultInfo.svar = false;
            resultInfo.text = "Ikke din tur.";
            return false;
        };
        if (this.piles.length == 0) {
            // Any rank may start an empty pile.
            var pile = new CardPile(player.name);
            player.cards.forEach(cards => {
                if (cards.strengthRank == strengthRank) {
                    pile.push(cards);
                    cards._Merket = true;
                } else {
                    cards._Merket = false;
                }
            })
            resultInfo.svar = true;
            resultInfo.pile = pile;
            return true;
        };
        var topPile = this.topPile();
        var fourOfKindOnTop = hasFourOfKindOnTop(this);
        var isClubThree = strengthRank == PresidentCard.clubThreePower();
        if (fourOfKindOnTop && isClubThree) {
            resultInfo.svar = false;
            resultInfo.text = "Kløver 3 kan ikke slå fire like.";
            return false;
        }
        if (fourOfKindOnTop && topPile.length < 4 && !isClubThree) {
            resultInfo.svar = false;
            resultInfo.text = "Fire like fra singler eller to par rydder bunken og kan ikke slås.";
            return false;
        }
        if (!isClubThree && strengthRank < topPile.strengthRank) {
            resultInfo.svar = false;
            resultInfo.text = `Må legge på samme eller høyere enn ${topPile.strengthRank}.`;
            return false;
        };
        var cardCount = isClubThree ? 1 : (fourOfKindOnTop ? 4 : topPile.length);
        var pile = new CardPile(player.name);
        var n = 0;
        player.cards.forEach(k => {
            if (n < cardCount && k.strengthRank == strengthRank) {
                pile.push(k);
                n++;
                k._Merket = true;
            } else {
                k._Merket = false;
            }
        });
        if (pile.length < cardCount) {
            player.cards.forEach(k => { k._Merket = false; });
            resultInfo.svar = false;
            resultInfo.text = `Du må ha ${cardCount} like kort.`;
            return false;
        };
        resultInfo.svar = true
        resultInfo.pile = pile;
        return true;
    }

    canPlayPile(player, pile) {
        var topPile = this.topPile();
        var fourOfKindOnTop = hasFourOfKindOnTop(this);
        var canBeatCurrentPile = fourOfKindOnTop
            ? pile != null &&
                topPile.length == 4 &&
                pile.length == 4 &&
                pile.every(card => card.strengthRank == pile[0].strengthRank) &&
                pile.strengthRank >= topPile.strengthRank
            : pile != null && pile.canBePlayedOn(topPile);
        return player != null &&
            pile != null &&
            this.status == "S" &&
            player.turn == 1 &&
            !this.isTurnPaused() &&
            player.name == pile.name &&
            canBeatCurrentPile &&
            player.cards.filter(k => (pile.includes(k))).length == pile.length;
    }
    pileCleared(info = {}) {
        var topPile = this.topPile();
        if (topPile == null) { return false; }
        if (topPile[0].isClubThree()) {
            info.text = "Kløver 3";
            return true;
        }
        if (hasFourOfKindOnTop(this)) {
            if (topPile.length < 4) {
                info.text = "Fire like";
                return true;
            }
            var canBeBeaten = this.players.some(player => {
                if (player.placement != 0 || player.name == topPile.name ||
                    player.lastPlay == "Pass") { return false; }
                var counts = new Map();
                player.cards.forEach(card => {
                    if (card.strengthRank > topPile.strengthRank) {
                        counts.set(card.strengthRank, (counts.get(card.strengthRank) || 0) + 1);
                    }
                });
                return Array.from(counts.values()).some(count => count >= 4);
            });
            if (!canBeBeaten) {
                info.text = "Fire like";
                return true;
            }
        }
        if (hasBothNaturalThreesOnTop(this)) {
            info.text = "Treere";
            return true;
        }
        var lastPlayer = this.getPlayer(topPile.name);
        var playersWhoCouldRespond = this.players.filter(player =>
            player.placement == 0 && player !== lastPlayer
        );
        if (playersWhoCouldRespond.length > 0 &&
            playersWhoCouldRespond.every(player => player.lastPlay == "Pass")) {
            info.text = "Alle spillere sa pass";
            return true;
        }
        return false;
    }
    playCards(player, pile) {
        this.assertSessionActive();
        if (!this.canPlayPile(player, pile)) { throw ("Kan ikke legge dette nå!"); };
        if (this.piles.length == 0) {
            this.players.filter(s => (s.placement > 0 && s.messages.length > 0)).forEach(s => {
                s.messages = [];
            })
        }
        pile.forEach(playedCard => {
            var i = player.cards.findIndex(k => (k == playedCard));
            player.cards.splice(i, 1);
        });
        player.lastPlay = pile;
        this.playedCards = (this.playedCards || []).concat(pile.map(card => ({
            suit: card.suit, rank: card.rank
        })));
        this.piles.push(pile);
        var now = Date.now();
        this.turnPause = {
            presentationVersion: 1,
            id: `${now}-${Math.random().toString(36).slice(2)}`,
            kind: "play",
            until: now + this.actionPauseMs(),
            message: `${player.name}: ${pile.describe()}.`,
            playedPile: {
                name: player.name,
                cards: PresidentCard.serializeDeck(pile)
            }
        };
        if (isGiftPackage(this.piles)) {
            this.turnPause.extraMessage = "Oi, oi.. gavepakke!";
        }
        if (player.cards.length == 0) {
            if (pile.strengthRank == PresidentCard.clubThreePower()) {
                // Playing the club three as the final card is a loss.
                this.finishPlayer(player, false);
            } else {
                // Otherwise, the player finishes normally.
                this.finishPlayer(player);
            }
            if (player.placement == 1) {
                this.turnPause.placementMessage = `${player.name} ble President!`;
                this.turnPause.message = this.turnPause.placementMessage;
            } else if (player.placement > 1 && player.placement < this.players.length) {
                this.turnPause.placementMessage = `${player.name} gikk ut som ${this.placementTitle(player.placement).title}.`;
                this.turnPause.message = this.turnPause.placementMessage;
            }
        }
        this.recordHumanAction(player);
        this.advanceTurn();
    }
    canPass(player) {
        return !this.localWritePending && player != null &&
            player.placement == 0 &&
            this.status == "S" &&
            player.turn == 1 &&
            !this.isTurnPaused();
    }
    passTurn(player) {
        this.assertSessionActive();
        if (!this.canPass(player)) { throw ("Kan ikke passe nå."); }
        player.lastPlay = this.topPile() != null ? "Pass" : null;
        var now = Date.now();
        this.turnPause = {
            presentationVersion: 1,
            id: `${now}-${Math.random().toString(36).slice(2)}`,
            kind: "pass",
            until: now + this.actionPauseMs(),
            message: `${player.name}: pass.`
        };
        this.recordHumanAction(player);
        this.advanceTurn();
    }
    nextTurnIndex(currentTurnPlayer) {
        var info = {};
        if (this.pileCleared(info)) {
            var clearedPile = this.topPile();
            var previousPlayer = this.players[currentTurnPlayer];
            if (previousPlayer.lastPlay) {
                previousPlayer.messages.push(`${((previousPlayer.lastPlay.describe) ? "La på " + previousPlayer.lastPlay.describe() : previousPlayer.lastPlay)}, bunken går ut. (${info.text})`);
            } else {
                previousPlayer.messages.push(`Bunken gikk ut og ferdig. (${info.text})`);
            }
            this.round++;
            // Remember who passed so their blocks stay marked while the clear message is shown.
            var passedPlayers = (info.text == "Alle spillere sa pass")
                ? this.players.filter(player => player.lastPlay === "Pass").map(player => player.name)
                : [];
            this.players.forEach(player => {
                player.lastPlay = null;
            });
            // Find the last player who still has cards.
            var nextPlayerName = null;
            this.piles.forEach(pile => {
                if (this.getPlayer(pile.name).cards.length > 0) {
                    nextPlayerName = pile.name;
                }
            });
            var lastPilePlayer = this.getPlayer(clearedPile.name);
            var lastPilePlayerFinished =
                info.text == "Alle spillere sa pass" &&
                lastPilePlayer != null &&
                lastPilePlayer.placement > 0;
            var nextPlayerIndex;
            if (lastPilePlayerFinished) {
                nextPlayerIndex = this.players.indexOf(lastPilePlayer);
                do {
                    nextPlayerIndex = (nextPlayerIndex + 1) % this.players.length;
                } while (this.players[nextPlayerIndex].placement > 0);
            } else if (nextPlayerName == null) {
                // If no player from this round remains, search backward from the last pile.
                nextPlayerName = this.topPile().name;
                var savedIndex = this.players.findIndex(player => (player.name == nextPlayerName));
                do {
                    savedIndex--;
                    if (savedIndex < 0) { savedIndex += this.players.length };
                } while (this.players[savedIndex].placement > 0);
                nextPlayerIndex = savedIndex;
            } else {
                nextPlayerIndex = this.players.findIndex(player => (player.name == nextPlayerName));
            }
            var clearedPiles = PresidentCard.serializePiles(this.piles);
            var playedPile = this.turnPause && this.turnPause.kind == "play"
                ? this.turnPause.playedPile
                : null;
            this.piles = [];
            var now = Date.now();
            var nextPlayer = this.players[nextPlayerIndex];
            var clearMessage = (info.text == "Alle spillere sa pass")
                ? `Alle passet. ${nextPlayer.name} starter.`
                : ((clearedPile.name == nextPlayer.name)
                    ? `${clearedPile.name}: ${info.text}! Starter igjen.`
                    : `${clearedPile.name}: ${info.text}! ${nextPlayer.name} starter.`);
            var placementMessage = this.turnPause && this.turnPause.placementMessage;
            var extraMessage = this.turnPause && this.turnPause.extraMessage;
            this.turnPause = {
                presentationVersion: 1,
                id: `${now}-${Math.random().toString(36).slice(2)}`,
                kind: "clear",
                until: now + this.actionPauseMs(),
                message: placementMessage || clearMessage,
                clearedPiles: clearedPiles,
                playedPile: playedPile
            };
            if (extraMessage) { this.turnPause.extraMessage = extraMessage; }
            if (passedPlayers.length > 0) {
                this.turnPause.passedPlayers = passedPlayers;
            }
            return nextPlayerIndex;
        } else {
            return currentTurnPlayer + 1;
        }
    }
    shouldSkipTurn(turn) {
        return (this.players[turn].lastPlay == "Pass");
    }
}
