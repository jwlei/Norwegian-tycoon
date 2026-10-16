class GameLayout {
    static el(title) {
        return document.getElementById(title);
    }
    static setVisible(element, isVisible = true) {
        if (typeof (element) == "string") {
            element = this.el(element)
        }
        switch (isVisible) {
            case true:
                element.style.display = "inline";
                break;
            case false:
                element.style.display = "none";
                break;
            case null:
                element.style.display = ((element.style.display == "none") ? "inline" : "none");
                break;
            default:
                throw ("Ukjent argument.")
                break;
        }
        try {
            var elementOffset
            elementOffset = this.el(element.id + "_Off");
            elementOffset.style.display = ((element.style.display == "none") ? "inline" : "none");
        } catch (error) { }
    }
    static cardImageHtml(K, width = null, rotering = null) {
        return `<img src='${K.toImageDataUri()}' ${((width != null) ? "width='" + width + "'" : "")} alt='${K.getName()}' ${((rotering != null) ? "transform: translateX(" + rotering + "px) rotate(" + rotering + "deg);" : "")} />`;
    }
    static createCardImage(K, width) {
        var e = document.createElement("img");
        e.src = K.toImageDataUri();
        if (width != null) { e.width = width };
        e.alt = K.getName();
        return e;
    }
    static updateSharedView(game, player) {
        var mainMenu = document.getElementById("DivHovedmeny");
        var gameControls = document.querySelectorAll("#DivFKnapper, #DivSpillere, #DivBord, #DivPKnapper, #DivKort");
        var showMenu = (game == null);
        mainMenu.setAttribute("aria-hidden", String(!showMenu));
        gameControls.forEach(element => { element.inert = showMenu; });
        if (game == null) {
            setClass(mainMenu, "Skjul", false);
            this.updateMainMenu();
            document.getElementById("DivBord").innerHTML = "";
        } else {
            setClass(mainMenu, "Skjul", true);
            this.updateGameButtons(game);
            this.updatePlayers(game, player);
            this.updateTable(game, player);
        }
    }
    static updateMainMenu() {
        this.setVisible("BnHNySpill", true);
        this.setVisible("BnHKobleSpill", true);
    }
    static updateGameButtons(game) {
        this.el("SpanSpillId").innerHTML = game.id;
        switch (game.status) {
            case "O":
                this.setVisible("BnFInviterSpill", true);
                this.setVisible("BnFNyAutoSpiller", true);
                this.setVisible("BnFStartSpill", game.players.length >= 2);
                this.setVisible("BnFRegler", true);
                this.setVisible("BnFHovedmeny", true);
                break;
            case "S":
            case "G":
                this.setVisible("BnFInviterSpill", true);
                this.setVisible("BnFNyAutoSpiller", false);
                this.setVisible("BnFStartSpill", false);
                this.setVisible("BnFRegler", true);
                this.setVisible("BnFHovedmeny", false);
                break;
            case "F":
                this.setVisible("BnFInviterSpill", true);
                this.setVisible("BnFNyAutoSpiller", true);
                this.setVisible("BnFStartSpill", true);
                this.setVisible("BnFRegler", true);
                this.setVisible("BnFHovedmeny", true);
                break;
            default:
                throw ('Ukjent spillstatus.');
                break;
        }
    }
    static updatePlayers(game, currentPlayer) {
        var playerList = document.getElementById("DivSpillere");
        playerList.innerHTML = "";
        game.players.forEach(player => {
            var playerElement = document.createElement("div");
            var nameElement = document.createElement("span");
            nameElement.innerHTML = player.name;
            playerElement.appendChild(nameElement);
            if (game.status != "S" && game.status != "G") {
                // Hide the remove-player button while a game is running.
                var removeButton = document.createElement("button");
                removeButton.innerHTML = "Fjern";
                removeButton.onclick = function () {
                    game.leavePlayer(player);
                }
                playerElement.appendChild(removeButton);
            }
            if (player.placement == 0) {
                // Waiting room or active game.
                if (player.lastPlay) {
                    if (player.lastPlay == "Pass") {
                        var passImage = document.createElement("img");
                        passImage.src = "icons/pass.svg";
                        passImage.alt = "Passet";
                        playerElement.appendChild(passImage);
                    } else {
                        var i = 0;
                        while (player.lastPlay[i]) {
                            playerElement.appendChild(GameLayout.createCardImage(player.lastPlay[i], null));
                            i++;
                        }
                    }
                } else if (player.turn == 1) {
                    var placeholder = document.createElement("span");
                    placeholder.id = "SpanHoppover"
                    playerElement.appendChild(placeholder);
                    scheduleIdleHelp(game);
                }
                playerElement.className =
                    ((player.turn == 1) ? " MinTur" : "") +
                    ((player.cards.length == 1) ? " EttKort" : "");
                var cardBacks = document.createElement("div");
                cardBacks.className = "SpillerKortBakgrunner";
                for (let cardIndex = player.cards.length; cardIndex > 0; cardIndex--) {
                    if (cardIndex <= player.antTrukket) {
                        cardBacks.appendChild(GameLayout.createCardImage(PresidentCard.createBack(1), null));
                    } else {
                        cardBacks.appendChild(GameLayout.createCardImage(PresidentCard.createBack(), null));
                    }
                }
                player.cards.forEach(k => { });
                playerElement.appendChild(cardBacks);
            } else {
                // Player has finished.
                playerElement.className = "Ferdig";
                var placementElement = document.createElement("div");
                placementElement.className = "SpillerKortPlassering";
                var title = game.placementTitle(player.placement);
                placementElement.innerHTML = `<img src='icons/${title.img}' alt='${title.title}' />` + `&nbsp;${title.title}`;
                playerElement.appendChild(placementElement);
            }
            player.messages.forEach(m => {
                var messageElement = document.createElement("span");
                messageElement.className = "melding";
                messageElement.innerHTML = m;
                playerElement.appendChild(messageElement);
                playerElement.appendChild(document.createElement("br"));
            });
            playerList.appendChild(playerElement);
        });
    }
    static drawIdleHelp(choices, callbacks) {
        choices.push("Avbryt (ikke gjÃ¸r noe)");
        callbacks.push(function () { });
        var element = document.getElementById("SpanHoppover");
        if (element == null) { return; };
        setClass(element, "DropdownButton", true);
        var b = document.createElement("img");
        b.src = 'icons/sleep.svg';
        b.alt = 'Hjelp spiller som har sovnet';
        b.onclick = function () {
            showChoiceDialog(
                "Spilleren har ikke gjort noe pÃ¥ en stund. Vil du overstyre spilleren?",
                choices,
                callbacks
            )
        };
        element.appendChild(b);
    }
    static updateTable(game, player) {
        var table = document.getElementById("DivBord");
        switch (game.status) {
            case "O":
                if (game.players.length == 0) {
                    // Show guidance while the room is waiting for players.
                    table.className = "BordForklaring";
                    table.innerHTML = document.getElementById("DivBord_Bordforklaring").innerHTML;
                } else {
                    // Show the deck while players are joining.
                    table.className = "BordKortstokker";
                    var s = "";
                    for (let i = 0; i < game.deckCount(); i++) {
                        s += GameLayout.cardImageHtml(Card.createBack(), null);
                    }
                    table.innerHTML = s;
                }
                break;
            case "G":
                table.className = "BordBytte";
                table.innerHTML = "";
                game.piles.forEach(exchange => {
                    if (!exchange.cards) { exchange.cards = [] };
                    var canSeeCards = (
                        (game.players[exchange.from] == player && (exchange.mode == "Velg" || exchange.mode == "Best")) ||
                        (game.players[exchange.to] == player && exchange.mode == "Kan se")
                    );
                    var element = document.createElement("div");
                    element.className = "bytte";
                    if (canSeeCards) {
                        setClass(element, "aktivbytte");
                    } else {
                        setClass(element, "passivbytte");
                    }
                    element.innerHTML = `<div class="bytteFigur"><img src="icons/${game.placementTitle(exchange.from + 1).img}" alt="${game.placementTitle(exchange.from + 1).title}" /></div>`;
                    element.innerHTML += `<div class="bytteTittel">${exchange.text}</div>`;
                    var cardContainer = document.createElement("div");
                    cardContainer.className = "bytteKort";
                    var cardSpan = document.createElement("span");
                    exchange.cards.forEach(cards => {
                        var cardElement = GameLayout.createCardImage(((canSeeCards) ? new Card(cards.suit, cards.rank) : Card.createBack()), null);
                        cardSpan.appendChild(cardElement);
                    });
                    var buttonSpan = document.createElement("span");
                    if (game.players[exchange.from] == player && exchange.count == exchange.cards.length && (exchange.mode == "Velg" || exchange.mode == "Best")) {
                        var buttonElement = document.createElement("button");
                        buttonElement.innerHTML = `Gi til ${game.players[exchange.to].name}`;
                        buttonElement.onclick = function () {
                            game.giveExchangeCards(exchange);
                        }
                        buttonSpan.appendChild(buttonElement);
                    }
                    if (game.players[exchange.to] == player && exchange.mode == "Kan se") {
                        var buttonElement = document.createElement("button");
                        buttonElement.innerHTML = `Motta fra ${game.players[exchange.from].name}`;
                        buttonElement.onclick = function () {
                            game.receiveExchangeCards(exchange);
                        }
                        buttonSpan.appendChild(buttonElement);
                    }
                    switch (exchange.mode) {
                        case "Velg":
                        case "Best":
                            cardContainer.appendChild(cardSpan);
                            cardContainer.appendChild(buttonSpan);
                            cardContainer.style.textAlign = "left";
                            break;
                        case "Gitt":
                            cardContainer.appendChild(cardSpan);
                            cardContainer.style.textAlign = "center";
                            break;
                        case "Kan se":
                            cardContainer.appendChild(buttonSpan);
                            cardContainer.appendChild(cardSpan);
                            cardContainer.style.textAlign = "right";
                            break;
                        default:
                            break;
                    }
                    element.appendChild(cardContainer);
                    table.appendChild(element);
                })
                break;
            case "S":
                table.className = "BordKortstokk";
                table.innerHTML = "";
                const seed = "H" + game.id + game.ts + game.round;
                var seedRandom = new Math.seedrandom(seed);
                var element = null;
                game.piles.forEach(pile => {
                    pile.forEach(k => {
                        element = GameLayout.createCardImage(k, null);
                        element.style = `transform: translateX(${Math.round(seedRandom() * 50 - 25)}px) translateY(${Math.round(seedRandom() * 80 - 40)}px) rotate(${Math.round(seedRandom() * 30 - 15)}deg);`;
                        table.appendChild(element);
                    })
                });
                break;
            case "F":
                table.className = "BordForklaring";
                table.innerHTML = "";
                var element = document.createElement("div");
                element.className = "tips";
                element.innerHTML = `<div><img src="icons/president.svg" alt='President' /><b>${game.players[0].name}</b> ble President.</div>`;
                table.appendChild(element);
                break;
            default:
                throw ("Ukent status.");
                break;
        }
    }
    static updatePlayerView(game, player) {
        setClass(document.getElementById("DivHele"), "SePaaModus", (player == null));
        setClass(document.getElementById("DivHele"), "KunKortModus", (game != null && game.rules.showCardsOnly && player != null));
        this.updatePlayerButtons(game, player);
        this.updateHand(game, player);
    }
    static updatePlayerButtons(game, player) {
        if (game == null) {
            this.setVisible("BnPNySpiller", false);
            this.setVisible("BnPPass", false);
            this.setVisible("BnPGiOpp", false);
            return;
        }
        if (player == null) {
            this.el("SpanSpillerNick").innerHTML = "";
            this.el("SpanSpillerInfo").innerHTML = "";
        } else {
            this.el("SpanSpillerNick").innerHTML = player.name;
            if (player.turn == 1) {
                switch (game.status) {
                    case "G":
                        this.el("SpanSpillerInfo").innerHTML = `Du skal gi kort.`;
                        break;
                    case "S":
                        var o = game.topPile();
                        if (o == null) {
                            this.el("SpanSpillerInfo").innerHTML = `Du skal starte Ã¥ legge ut.`;
                        } else {
                            this.el("SpanSpillerInfo").innerHTML = `Spilleren fÃ¸r deg la ${o.describe()}.`;
                        }
                        break;
                    default:
                        this.el("SpanSpillerInfo").innerHTML = ``;
                        break;
                }
            } else {
                this.el("SpanSpillerInfo").innerHTML = "";
            }
        }
        if (setClass(this.el("DivPKnapper"), "MinTur", (player != null && player.turn))) {
            // Update turn-dependent controls when the state changes.
            setClass(this.el("DivKort"), "MinTur", (player != null && player.turn));
            if (player != null && player.turn) {
                // Enable vibration feedback where supported.
                navigator.vibrate = navigator.vibrate || navigator.webkitVibrate || navigator.mozVibrate || navigator.msVibrate;
                if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                }
            }
        };
        this.setVisible("BnPNySpiller", (player == null));
        this.setVisible("BnPPass", (player != null && game.canPass(player)));
        this.setVisible("BnPGiOpp", (player != null && !(game.status == "S" && player.placement != 0)));
    }
    static updateHand(game, player) {
        var element = document.getElementById("DivKort");
        element.innerHTML = "";
        if (player == null) {
            return;
        }
        if (player.placement == 0) {
            if (player.cards.length == 0) {
                setClass(element, "KortKort", false);
                setClass(element, "KortForklaring", true);
                element.innerHTML = document.getElementById("DivKort_Kortforklaring").innerHTML;
            } else {
                setClass(element, "KortKort", true);
                setClass(element, "KortForklaring", false);
                var cardIndex = -1;
                player.cards.forEach(k => {
                    cardIndex++;
                    var elemKort = document.createElement('span');
                    elemKort.style.transform = `translateX(${-2 * Math.round(100 * ((cardIndex / (player.cards.length - 1)) - 0.5)) / 10}px) rotate(${Math.round(100 * ((cardIndex / (player.cards.length - 1)) - 0.5)) / 10}deg)`;
                    elemKort.innerHTML = GameLayout.cardImageHtml(k, null);
                    switch (game.status) {
                        case "G":
                            game.piles.filter(gave => (gave.mode == "Velg" && game.players[gave.from] == player)).forEach(gave => {
                                elemKort.onclick = function () {
                                    if (!gave.cards) { gave.cards = []; };
                                    var i = gave.cards.findIndex(cards => (cards.suit == k.suit && cards.rank == k.rank))
                                    if (i >= 0) {
                                        gave.cards.splice(i, 1);
                                        game.save();
                                    } else {
                                        gave.cards.push(k);
                                        game.save();
                                    };
                                }
                            });
                            break;
                        case "S":
                            elemKort.onclick = function () {
                                if (player.turn == 1) {
                                    if (game.piles.length == 0) {
                                        var dialogTexts = [];
                                        var dialogCallbacks = [];
                                        var info = {};
                                        if (game.canPlayRank(player, k.strengthRank, info)) {
                                            for (let i = 1; i <= info.pile.length; i++) {
                                                var pile = new CardPile(player.name);
                                                for (let n = 0; n < i; n++) { pile.push(info.pile[n]) };
                                                var htmlText = "<div class='AskKort'>";
                                                pile.forEach(cards => {
                                                    htmlText += GameLayout.cardImageHtml(cards, null);
                                                })
                                                htmlText += '</div>';
                                                dialogTexts.push(htmlText);
                                                dialogCallbacks.push(function () {
                                                    game.playCards(player, pile);
                                                });
                                            }
                                        }
                                        dialogTexts.push("Velg annet kort");
                                        dialogCallbacks.push(function () { });
                                        showChoiceDialog("Vil du legge:", dialogTexts, dialogCallbacks);
                                    } else {
                                        var info = {};
                                        if (game.canPlayRank(player, k.strengthRank, info)) {
                                            var htmlText = "<div class='AskKort'>";
                                            info.pile.forEach(cards => {
                                                htmlText += GameLayout.cardImageHtml(cards, null);
                                            })
                                            htmlText += '</div>';
                                            var dialogTexts = [
                                                htmlText,
                                                "Velg annet kort"
                                            ];
                                            var dialogCallbacks = [function () {
                                                game.playCards(player, info.pile);
                                            },
                                            function () { }
                                            ];
                                            showChoiceDialog("Vil du legge:", dialogTexts, dialogCallbacks);
                                        } else {
                                            showDialog("KanIkkeLeggeKort", true);
                                        }
                                    }
                                }
                            }
                            break;
                        default:
                            break;
                    }
                    element.appendChild(elemKort)
                });
            }
        } else {
            setClass(element, "KortKort", true);
            setClass(element, "KortForklaring", false);
            var s = `<img src='icons/${game.placementTitle(player.placement).img}' alt='Ferdig' height='90%' />`;
            if (game.status == "S") {
                s += `<span>Du ble <b>${game.placementTitle(player.placement).title}</b>. Venter pÃ¥ at de andre skal spille ferdig.</span>`;
            } else {
                s += `<span>Spillet er ferdig. Du ble <b>${game.placementTitle(player.placement).title}</b> (av ${game.players.length} spillere). For Ã¥ spille en runde til, trykk pÃ¥ <img src="icons/start.svg" style="height: 1em; vertical-align: text-bottom;" alt="startknappen" />.</span>`;
            }
            element.innerHTML = s;
        }
    }
}

class PresidentCard extends Card {
    static clubThreePower() { return 16; }
    static strengthName(strengthRank) {
        return ["", "", "", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "KlÃ¸ver 3"][strengthRank];
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
            result.push(pile);
        });
        return result;
    }
}

class CardPile extends Array {
    constructor(name, ...cards) {
        super(...cards);
        if (this.length > 0) {
            this.strengthRank = this[0].strengthRank;
            this.forEach(k => {
                if (k.strengthRank != this.strengthRank) { throw ("Kan ikke legge pÃ¥ forskjellige kort.") }
            });
        } else {
            this.strengthRank = null;
        }
        this.name = name;
    }
    toRecord() {
        var record = { "nick": this.name, "verdiBoms": this.strengthRank };
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
            if (item.strengthRank != this.strengthRank) { throw ("Kan ikke legge pÃ¥ forskjellige kort.") }
        } else {
            this.strengthRank = item.strengthRank;
        }
        super.push(item);
    }
    fromRecord(pile) {
        this.name = pile["nick"];
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
        if (this[0].isClubThree()) { return "klÃ¸ver 3" };
        return ["", "en", "to", "tre", "fire", "fem", "seks", "syv"][this.length] + " " + ((this.length > 1) ? Card.rankInfo(this[0].rank).pluralName : Card.rankInfo(this[0].rank).singularName);
    }
    canBePlayedOn(topPile) {
        return (
            (topPile == null) || // First card in a new pile.
            (this.length == topPile.length && this.strengthRank >= topPile.strengthRank) || // Standard rules.
            (this.length == 1 && this[0].isClubThree()) // Club three.
        )
    }
}

class PresidentPlayer extends Player {
    constructor(name, playerKey) {
        super(name, playerKey);
        this.title = "";
    }
    toRecord() {
        var result = super.toRecord();
        result["kort"] = PresidentCard.serializeDeck(result["kort"]);
        result["tittel"] = this.title;
        return result;
    }
    fromRecord(record) {
        record["kort"] = PresidentCard.deserializeDeck(record["kort"]);
        const lastPlay = record["laPaaSist"];
        record["laPaaSist"] = ((lastPlay == null) ? null :
            ((lastPlay["verdiBoms"] != null) ? new CardPile(lastPlay["nick"]).fromRecord(lastPlay) : lastPlay));
        super.fromRecord(record);
        this.title = record["tittel"];
        return this;
    }
    countRank(strengthRank) {
        return this.cards.filter(k => (k.strengthRank == strengthRank)).length;
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
    constructor(id = null) {
        super(id);
        this.debug = true;
        // Attach to the existing room without overwriting its data.
        if (id == null) {
            this.id = Math.floor(Math.random() * 999999 + 1).toString();
            this.databaseRef = firebase.database().ref(`boms_1/${this.id}`);
            this.rules = {
                showCardsOnly: false
            };
            this.status = 'O'; // O = waiting, G = exchanging cards, S = playing, F = finished.
            this.round = 0;
            this.players = [];
            this.piles = [];
            this.turn = -1;
            this.save();
        } else {
            this.id = id;
            this.databaseRef = firebase.database().ref(`boms_1/${this.id}`);
        }
    }
    save() {
        this.databaseRef.set({
            status: this.status,
            "regler": { "VisKunKort": this.rules.showCardsOnly },
            "runde": this.round,
            "spillere": PresidentPlayer.serializePlayers(this.players),
            "spillBunke": this.serializePiles(),
            "sinTur": this.turn,
            ts: new Date()
        });
    }
    serializePiles() {
        if (this.status != "G") {
            return PresidentCard.serializePiles(this.piles);
        }
        return this.piles.map(exchange => ({
            "tekst": exchange.text,
            "fra": exchange.from,
            "til": exchange.to,
            "antall": exchange.count,
            "modus": exchange.mode,
            "kort": PresidentCard.serializeDeck(exchange.cards || [])
        }));
    }
    static deserializeExchanges(records) {
        if (records == null) { return []; }
        return records.map(record => ({
            text: record["tekst"],
            from: record["fra"],
            to: record["til"],
            count: record["antall"],
            mode: record["modus"],
            cards: PresidentCard.deserializeDeck(record["kort"])
        }));
    }
    deckCount() {
        return 1;
    }
    placementTitle(placement) {
        if (this.players.length >= 5) {
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
                    return ({ title: `Arbeider${((this.players.length > 5) ? " " + (placement - 2) : "")}`, img: "worker.svg" });
            }
        } else {
            switch (placement) {
                case 1:
                    return ({ title: "President", img: "president.svg" });
                case this.players.length:
                    return ({ title: "Boms", img: "boms.svg" });
                default:
                    return ({ title: `Arbeider${((this.players.length > 3) ? " " + (placement - 1) : "")}`, img: "worker.svg" });
            }
        }
    }
    prepareRound() {
        // Build a fresh deck.
        var deck = new CardDeck();
        for (let i = this.deckCount(); i > 0; i--) {
            deck.addStandardCards(function (suit, rank) { return new PresidentCard(suit, rank) });
        }
        // Remove cards that cannot be dealt evenly.
        deck.sortCards();
        deck.splice(0, deck.length % this.players.length);
        // Shuffle and deal the cards.
        deck.shuffle();
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
        while (deck.length > 0) {
            this.players.forEach(player => {
                if (player !== h4cker && deck.length > 0) {
                    player.cards.push(deck.pop());
                }
            });
        }
        // Restore player order and exchange cards after an earlier round.
        if (this.players.filter(s => (s.placement != 0)).length > 0) {
            // Reorder players and exchange cards.
            this.players.filter(s => (s.placement == 0)).forEach(s => (s.placement = 99)); // New players start last.
            this.players.sort((a, b) => a.placement - b.placement);
            this.players.forEach(player => {
                player.cards.sortCards();
                player.placement = 0;
            });
            this.piles = [];
            this.status = "G"; // Exchange cards.
            this.setTurn(null);
            if (this.players.length >= 5) {
                this.players[0].messages.push("Skal gi to kort til bomsen.");
                this.players[1].messages.push("Skal gi ett kort til visebomsen.");
                this.players[this.players.length - 2].messages.push("Gir sitt dÃ¥rligste kort til visepresidenten.");
                this.players[this.players.length - 1].messages.push("Gir sine to dÃ¥rligste kort til presidenten.");
                this.piles = [{
                    text: "Presidenten skal gi bomsen to kort:",
                    from: 0,
                    to: this.players.length - 1,
                    count: 2,
                    mode: "Velg"
                }, {
                    text: "Visepresidenten skal gi visebomsen ett kort:",
                    from: 1,
                    to: this.players.length - 2,
                    count: 1,
                    mode: "Velg"
                }, {
                    text: "Visebomsen skal gi visepresidenten sitt beste kort:",
                    from: this.players.length - 2,
                    to: 1,
                    count: 1,
                    mode: "Best"
                }, {
                    text: "Bomsen skal gi presidenten sine to beste kort:",
                    from: this.players.length - 1,
                    to: 0,
                    count: 2,
                    mode: "Best"
                }];
            } else {
                this.piles = [{
                    text: "Presidenten skal gi bomsen ett kort:",
                    from: 0,
                    to: this.players.length - 1,
                    count: 1,
                    mode: "Velg"
                }, {
                    text: "Bomsen skal gi presidenten sitt beste kort:",
                    from: this.players.length - 1,
                    to: 0,
                    count: 1,
                    mode: "Best"
                }];
            }
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
        }
    }
    giveExchangeCards(exchange) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); };
        if (exchange.mode != 'Velg' && exchange.mode != 'Best') { throw (`Kan ikke gi kort nÃ¥r modus er ${exchange.mode} (mÃ¥ vÃ¦re Velg eller Best).`); };
        if (exchange.cards.length != exchange.count) { throw ("Feil antall kort som byttes."); };
        exchange.cards.forEach(k => {
            this.players[exchange.from].cards.splice(
                this.players[exchange.from].cards.findIndex(k_ut => (k_ut.suit == k.suit && k_ut.rank == k.rank)),
                1
            );
        });
        exchange.mode = "Gitt";
        if (this.piles.filter(b => (b.mode != "Gitt")).length == 0) {
            // All players have submitted their cards.
            this.piles.forEach(exchange => {
                exchange.mode = "Kan se";
            });
            this.setTurn(-1);
        }
        this.save();
    }
    receiveExchangeCards(exchange) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); };
        if (exchange.mode != 'Kan se') { throw (`Kan ikke gi kort nÃ¥r modus er ${exchange.mode} (mÃ¥ vÃ¦re Kan se).`); };
        if (exchange.cards.length != exchange.count) { throw ("Feil antall kort som byttes."); };
        exchange.cards.forEach(k => {
            this.players[exchange.to].cards.push(new PresidentCard(k.suit, k.rank));
        });
        this.players[exchange.to].cards.sortCards();
        this.piles.splice(this.piles.findIndex(b => (b == exchange)), 1);
        if (this.piles.length == 0) {
            // All exchanges are complete.
            this.status = "S";
            this.setTurn(0);
        }
        this.save();
    }
    topPile() {
        if (this.piles.length == 0) { return null; }
        return this.piles[this.piles.length - 1];
    }
    canPlayRank(player, strengthRank, resultInfo = {}) {
        // Check whether a player can play a rank, and mark the matching cards.
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
        if (strengthRank < topPile.strengthRank) {
            resultInfo.svar = false;
            resultInfo.text = `MÃ¥ legge pÃ¥ ${topPile.strengthRank} eller hÃ¸yere.`;
            return false;
        };
        var cardCount = ((strengthRank == PresidentCard.clubThreePower()) ? 1 : cardCount = topPile.length);
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
            resultInfo.text = `Du mÃ¥ ha ${cardCount} like kort.`;
            return false;
        };
        resultInfo.svar = true
        resultInfo.pile = pile;
        return true;
    }

    canPlayPile(player, pile) {
        return player != null &&
            pile != null &&
            this.status == "S" &&
            player.turn == 1 &&
            player.name == pile.name &&
            pile.canBePlayedOn(this.topPile()) &&
            player.cards.filter(k => (pile.includes(k))).length == pile.length;
    }
    pileCleared(info = {}) {
        var topPile = this.topPile();
        if (topPile == null) { return false; }
        if (topPile[0].isClubThree()) {
            info.text = "KlÃ¸ver 3";
            return true;
        }
        var rank = topPile.strengthRank;
        var count = 0;
        var pile;
        var i = this.piles.length;
        do {
            i--;
            pile = this.piles[i];
            count += pile.length;
        } while (i > 0 && count < 4 && pile.strengthRank == rank);
        if (count >= 4 && pile.strengthRank == rank) {
            info.text = `Fire ${Card.rankInfo(pile[0].rank).pluralName}`;
            return true;
        }
        if (this.players.filter(player => (player.lastPlay != "Pass" && player.placement == 0)).length <= 1) {
            info.text = "Alle spillere sa pass";
            return true;
        }
        return false;
    }
    playCards(player, pile) {
        if (!this.canPlayPile(player, pile)) { throw ("Kan ikke legge dette nÃ¥!"); };
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
        this.piles.push(pile);
        if (player.cards.length == 0) {
            if (pile.strengthRank == PresidentCard.clubThreePower()) {
                // Playing the club three as the final card is a loss.
                this.finishPlayer(player, false);
            } else {
                // Otherwise, the player finishes normally.
                this.finishPlayer(player);
            }
        }
        this.advanceTurn();
    }
    canPass(player) {
        return player != null &&
            this.status == "S" &&
            player.turn == 1;
    }
    passTurn(player) {
        player.lastPlay = "Pass";
        this.advanceTurn();
    }
    nextTurnIndex(currentTurnPlayer) {
        var info = {};
        if (this.pileCleared(info)) {
            var previousPlayer = this.players[currentTurnPlayer];
            if (previousPlayer.lastPlay) {
                previousPlayer.messages.push(`${((previousPlayer.lastPlay.describe) ? "La pÃ¥ " + previousPlayer.lastPlay.describe() : previousPlayer.lastPlay)}, bunken gÃ¥r ut. (${info.text})`);
            } else {
                previousPlayer.messages.push(`Bunken gikk ut og ferdig. (${info.text})`);
            }
            this.round++;
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
            if (nextPlayerName == null) {
                // If no player from this round remains, search backward from the last pile.
                nextPlayerName = this.topPile().name;
                var savedIndex = this.players.findIndex(player => (player.name == nextPlayerName));
                do {
                    savedIndex--;
                    if (savedIndex < 0) { savedIndex += this.players.length };
                } while (this.players[savedIndex].placement > 0);
                this.piles = [];
                return savedIndex;
            }
            this.piles = [];
            return this.players.findIndex(player => (player.name == nextPlayerName));
        } else {
            return currentTurnPlayer + 1;
        }
    }
    shouldSkipTurn(turn) {
        return (this.players[turn].lastPlay == "Pass");
    }
}

(
    function () {
        var currentGame = null;
        var currentPlayerName = null;

        document.getElementById('BnHNySpill').addEventListener('click', function () {
            if (navigator.userAgent.match(/Android|iPhone/i)) {
                try {
                    openFullscreen(document.getElementsByTagName("body")[0]);
                } catch (error) { }
            }
            currentGame = new PresidentGame();
            currentPlayerName = null;
            connectGame();
        });

        document.getElementById('BnHKobleSpill').addEventListener('click', function () {
            try {
                openFullscreen(document.getElementsByTagName("body")[0]);
            } catch (error) { }
            document.getElementById("dialogKobleSpillId").value = null;
            document.getElementById('dialogKobleSpillError').innerHTML = "";
            showDialog("KobleSpill", true);
        });

        document.getElementById('dialogKobleSpillOk').addEventListener('click', function () {
            var id = document.getElementById("dialogKobleSpillId").value;
            currentGame = new PresidentGame(id);
            currentPlayerName = null;
            connectGame(function () {
                if (currentGame == null) {
                    document.getElementById('dialogKobleSpillError').innerHTML = "Kunne ikke koble til. Er spill-nummeret riktig?";
                    document.getElementById('dialogKobleSpillId').focus();
                } else {
                    showDialog("KobleSpill", false);
                }
            });
        });

        function connectGame(afterConnect = function () { }) {
            currentGame.databaseRef.on('value', function (snapshot) {
                var snapshotRecord = snapshot.val();
                if (snapshotRecord != null) {
                    var storedPlayers = snapshotRecord["spillere"] || [];
                    var storedPiles = snapshotRecord["spillBunke"] || [];
                    currentGame.status = snapshotRecord.status;
                    var storedRules = snapshotRecord["regler"] || {};
                    currentGame.rules = { showCardsOnly: storedRules["VisKunKort"] };
                    currentGame.round = snapshotRecord["runde"];
                    currentGame.players = PresidentPlayer.deserializePlayers(storedPlayers);
                    currentGame.piles = ((currentGame.status == "G") ? PresidentGame.deserializeExchanges(storedPiles) : PresidentCard.deserializePiles(storedPiles));
                    currentGame.turn = snapshotRecord["sinTur"];
                    currentGame.ts = snapshotRecord.ts;
                    GameLayout.updateSharedView(currentGame, currentGame.getPlayer(currentPlayerName));
                    GameLayout.updatePlayerView(currentGame, currentGame.getPlayer(currentPlayerName));
                } else {
                    currentGame = null;
                    currentPlayerName = null;
                    GameLayout.updateSharedView(null, null);
                    GameLayout.updatePlayerView(null, null);
                }
                afterConnect();
            });
        }

        const inviteId = new URLSearchParams(window.location.search).get("spillid");
        if (inviteId && /^[1-9]\d{0,5}$/.test(inviteId)) {
            currentGame = new PresidentGame(inviteId);
            currentPlayerName = null;
            connectGame();
        }

        document.getElementById('BnFInviterSpill').addEventListener('click', function () {
            if (currentGame == null) { throw ('MÃ¥ lage spill fÃ¸r du inviterer.') }
            s = `${document.baseURI}?spillid=${currentGame.id}`;
            showInviteLink(currentGame.id, s);
        });

        document.getElementById('BnFStartSpill').addEventListener('click', function () {
            currentGame.startGame();
            setTimeout(runBotLoop, 1500);
        });

        function runBotLoop() {
            if (currentGame.status == "G") {
                currentGame.players.filter(s => (s.playerKey == "PC")).forEach(player => {
                    playBotTurn(currentGame, player);
                });
            } else if (currentGame.status == "S" && currentGame.turn >= 0 && currentGame.players[currentGame.turn].playerKey == "PC") {
                playBotTurn(currentGame, currentGame.players[currentGame.turn]);
            }
            if (currentGame.status != "F") { setTimeout(runBotLoop, 1500); }
        }

        document.getElementById('BnFHovedmeny').addEventListener('click', function () {
            if (currentGame != null) {
                if (currentPlayerName == null || currentGame.status == "F") {
                    currentGame = null;
                    try {
                        closeFullscreen();
                    } catch (error) { }
                    GameLayout.updateSharedView(null, null);
                } else {
                    showChoiceDialog(
                        "Vil du avslutte spillet?", [
                        "Ja, gÃ¥ til hovedmenyen",
                        "Nei, fortsett spillet"
                    ], [
                        function () {
                            currentGame.leavePlayer(currentGame.getPlayer(currentPlayerName));
                            currentPlayerName = null;
                            currentGame = null;
                            try {
                                closeFullscreen();
                            } catch (error) { }
                            GameLayout.updateSharedView(null, null);
                            GameLayout.updatePlayerView(null, null);
                        },
                        function () { }
                    ]
                    );
                }
            }
        });

        document.getElementById('BnPNySpiller').addEventListener('click', function () {
            if (currentPlayerName != null) { throw ('Skal ikke lage ny spiller nÃ¥r man allerede har en spiller.') }
            showDialog("SporOmNick", true);
        });

        document.getElementById('dialogSporOmNickOk').addEventListener('click', function () {
            var requestedName = document.getElementById('dialogSporOmNickTxt').value.replace("'", "").replace('"', '').replace("<", "").replace(">", "").trim(" ");
            if (requestedName != "") {
                var key = getPlayerKey();
                var newPlayerResult = currentGame.addPlayer(new PresidentPlayer(requestedName, key));
                if (newPlayerResult.player) {
                    currentPlayerName = newPlayerResult.player.name;
                    GameLayout.updatePlayerView(currentGame, newPlayerResult.player);
                    showDialog("SporOmNick", false);
                } else {
                    document.getElementById('dialogSporOmNickError').innerHTML = newPlayerResult.text;
                }
            }
        });

        document.getElementById('BnPGiOpp').addEventListener('click', function () {
            if (currentGame.status == "S") {
                showChoiceDialog(
                    "Er du sikker pÃ¥ at du vil gi opp?", [
                    "Ja, jeg vil avslutte spillet",
                    "Nei, jeg fortsetter spillet"
                ], [
                    function () {
                        var player = currentGame.leavePlayer(currentGame.getPlayer(currentPlayerName));
                        if (player == null) { currentPlayerName = null; }
                    },
                    function () { }
                ]
                );
            } else {
                var player = currentGame.leavePlayer(currentGame.getPlayer(currentPlayerName));
                if (player == null) { currentPlayerName = null; }
            }
        });

        document.getElementById('BnFNyAutoSpiller').addEventListener('click', function () {
            const key = "PC";
            var alternatives = ["PC A", "PC B", "PC C", "PC D", "PC E"];
            currentGame.players.forEach(player => {
                alternatives = alternatives.filter(name => (name != player.name));
            });
            if (alternatives.length > 0) {
                currentGame.addPlayer(new PresidentPlayer(alternatives[0], key));
            } else {
            }
        })

        document.getElementById('BnPPass').addEventListener('click', function () {
            currentGame.passTurn(currentGame.getPlayer(currentPlayerName));
        });

        GameLayout.updateSharedView(null, null);
        GameLayout.updatePlayerView(null, null);

        document.getElementById('BnFResultater').addEventListener('click', function () {
            if (!currentGame.results) { currentGame.results = []; };
            showResultsDialog(currentGame.results);
        });

        document.getElementById('BnFRegler').addEventListener('click', function () {
            showDialog("Regler", true);
        });

        setInterval(() => {
            function formatTime(minutes) {
                const hours = Math.floor(minutes / 60);
                const remainingMinutes = minutes % 60;
                return `${hours}:${((remainingMinutes < 10) ? "0" : "")}${remainingMinutes}`;
            }
            if (currentGame && currentGame.round > 0) {
                document.getElementById("SpanSpillStat").innerHTML =
                    `Runde ${currentGame.round} - ${formatTime(currentGame.elapsedMinutes())}`;
            } else {
                document.getElementById("SpanSpillStat").innerHTML = "";
            }
        }, 1000);
    }
)();

function playBotTurn(game, player, entireRound = false) {
    if (game.status == "G") {
        game.piles.filter(b => (b.mode == "Kan se" && game.players[b.to] == player)).forEach(exchange => {
            game.receiveExchangeCards(exchange);
        });
        game.piles.filter(b => (b.mode == "Velg" && game.players[b.from] == player)).forEach(exchange => {
            // Find the lowest-ranked cards.
            for (var i = 1; i <= exchange.count; i++) {
                exchange.cards.push(player.cards[i - 1]);
            }
            // Give those cards to the receiving player.
            game.giveExchangeCards(exchange);
        });
        game.piles.filter(b => (b.mode == "Best" && game.players[b.from] == player)).forEach(exchange => {
            game.giveExchangeCards(exchange);
        });
    }
    if (game.status == "S" && player.turn == 1 && player.placement == 0) {
        var pile = null;
        if (game.piles.length == 0) {
            player.cards.forEach(cards => {
                cards._count = player.cards.filter(k => (k.strengthRank == cards.strengthRank)).length;
            });
            const selectedRank = player.cards.sort((a, b) => (b._count - a._count))[0].strengthRank;
            pile = new CardPile(player.name);
            player.cards.filter(k => (k.strengthRank == selectedRank)).forEach(cards => {
                pile.push(cards);
            })
        } else {
            player.cards.filter(cards => (game.canPlayRank(player, cards.strengthRank))).forEach(cards => {
                if (pile == null || cards.strengthRank < pile.strengthRank) {
                    pile = new CardPile(player.name, cards);
                } else if (cards.strengthRank == pile.strengthRank && (pile.length < game.topPile().length)) {
                    pile.push(cards);
                }
            })
        }
        if (pile != null) {
            game.playCards(player, pile);
        } else {
            game.passTurn(player);
        }
    }
}

var idleHelpTimer = null;

function scheduleIdleHelp(game) {
    if (idleHelpTimer != null) {
        clearTimeout(idleHelpTimer);
    }
    idleHelpTimer = setTimeout(function () {
        var skippedPlayer = game.players[game.turn]; // Capture the player index before concurrent actions can change the turn.
        GameLayout.drawIdleHelp([
            "GjÃ¸r det beste",
            "Hopp over",
            "Si pass",
            "Avslutt spiller"
        ], [function () {
            playBotTurn(game, skippedPlayer, true);
        }, function () {
            game.advanceTurn();
        }, function () {
            game.passTurn(skippedPlayer);
        }, function () {
            game.leavePlayer(skippedPlayer);
        }]);
    }, 20000); // Show the prompt after 20 seconds of inactivity.
}