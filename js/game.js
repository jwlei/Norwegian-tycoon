var selectedCardKeys = new Set();
var selectedCardStrength = null;
var selectedCardOwner = null;
var activeExchangeId = null;
var autoSelectedTurnKey = null;
var suppressNextCardClick = false;
var cardHandInertiaFrame = null;

function getExchangeId(exchange) {
    return exchange.id || `${exchange.tradeId || "exchange"}:${exchange.from}:${exchange.to}`;
}

function hasSneakyConsent(exchange) {
    return exchange.kind == "playerTrade" &&
        Array.isArray(exchange.sneakyVotes) &&
        exchange.sneakyVotes.length >= 2;
}

function isCardAllowedForExchange(exchange, card) {
    return exchange.kind != "playerTrade" ||
        hasSneakyConsent(exchange) ||
        (card.strengthRank >= 7 && card.strengthRank <= 11);
}

function exchangeCardKey(card) {
    return `${card.suit}:${card.rank}`;
}

function getAvailableExchangeCards(game, playerIndex, excludedExchange = null) {
    var excludedId = excludedExchange ? getExchangeId(excludedExchange) : null;
    var reservedCards = new Set();
    game.piles
        .filter(exchange =>
            exchange.from == playerIndex &&
            getExchangeId(exchange) != excludedId &&
            (exchange.mode == "Velg" || exchange.mode == "Best")
        )
        .forEach(exchange => {
            (exchange.cards || []).forEach(card => reservedCards.add(exchangeCardKey(card)));
        });
    return game.players[playerIndex].cards.filter(card => !reservedCards.has(exchangeCardKey(card)));
}

function hasLegalTradeCard(game, playerIndex, excludedExchange = null) {
    return getAvailableExchangeCards(game, playerIndex, excludedExchange)
        .some(card => card.strengthRank >= 7 && card.strengthRank <= 11);
}

function hasFourOfKindOnTop(game) {
    var count = 0;
    var rank = null;
    for (var index = game.piles.length - 1; index >= 0; index--) {
        var pile = game.piles[index];
        if (rank == null) {
            rank = pile.strengthRank;
        }
        if (pile.strengthRank != rank) {
            break;
        }
        count += pile.length;
    }
    return count >= 4;
}

const BOT_NAMES = [
    "Boten Anna", "Kort-Knut", "Bunke-Bjørn", "Stikk-Stine", "Ruter-Rune",
    "Spar-Svein", "Hjerter-Hilde", "Kløver-Kåre", "Konge-Kjell", "Dronning-Dagny",
    "Pass-Pål", "Mister Mismatch", "Shuffle-Sigurd", "Trippel-Turid", "Firelike-Frode",
    "Par-Petter", "Bord-Bente", "Kortslutning-Kåre", "Nesten-Presidenten", "Korthai-Kim",
    "Boms-Borghild", "Rask-Ragnar", "Luring-Lars", "Taktikk-Tove", "Plukk-Pia",
    "Stopp-Siri", "Bunken-Bjarne", "Ess-Eirik", "Turbo-Tor", "Siste-Stikk-Sølvi"
];
const BOT_ACTION_DELAY_MS = 2500;

function clearCardSelection() {
    selectedCardKeys.clear();
    selectedCardStrength = null;
}

function updateCardTilt(cardElement, event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }
    var bounds = cardElement.getBoundingClientRect();
    if (bounds.width == 0 || bounds.height == 0) {
        return;
    }
    var x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    var y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    cardElement.style.setProperty("--pointer-x", `${Math.round(x * 100)}%`);
    cardElement.style.setProperty("--pointer-y", `${Math.round(y * 100)}%`);
    cardElement.style.setProperty("--tilt-x", `${((0.5 - y) * 8).toFixed(1)}deg`);
    cardElement.style.setProperty("--tilt-y", `${((x - 0.5) * 8).toFixed(1)}deg`);
    cardElement.classList.add("is-tilting");
}

function resetCardTilt(cardElement) {
    cardElement.classList.remove("is-tilting");
    cardElement.style.setProperty("--tilt-x", "0deg");
    cardElement.style.setProperty("--tilt-y", "0deg");
}

function stopCardHandInertia() {
    if (cardHandInertiaFrame != null) {
        cancelAnimationFrame(cardHandInertiaFrame);
        cardHandInertiaFrame = null;
    }
}

function startCardHandInertia(element, velocity) {
    stopCardHandInertia();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        Math.abs(velocity) < 0.04) {
        return;
    }
    var previousFrameTime = null;
    var continueInertia = function (frameTime) {
        if (previousFrameTime == null) {
            previousFrameTime = frameTime;
            cardHandInertiaFrame = requestAnimationFrame(continueInertia);
            return;
        } else {
            var elapsed = Math.min(frameTime - previousFrameTime, 32);
            previousFrameTime = frameTime;
            velocity *= Math.exp(-elapsed / 170);
            var maxScrollLeft = element.scrollWidth - element.clientWidth;
            element.scrollLeft = Math.max(0, Math.min(
                maxScrollLeft,
                element.scrollLeft + velocity * elapsed
            ));
            if (Math.abs(velocity) > 0.035 &&
                element.scrollLeft > 0 &&
                element.scrollLeft < maxScrollLeft) {
                cardHandInertiaFrame = requestAnimationFrame(continueInertia);
                return;
            }
        }
        cardHandInertiaFrame = null;
    };
    cardHandInertiaFrame = requestAnimationFrame(continueInertia);
}

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
        var appShell = document.getElementById("DivHele");
        setClass(appShell, "SpillAktivt", (game != null));
        setClass(appShell, "Lobby", (game != null && game.status == "O"));
        var mainMenu = document.getElementById("DivHovedmeny");
        var gameControls = document.querySelectorAll("#DivFKnapper, #DivSpillere, #DivBord, #DivPKnapper, #DivKort");
        var showMenu = (game == null);
        if (showMenu) {
            appShell.classList.remove("GameMenuOpen");
            var menuToggle = document.getElementById("BnGameMenuToggle");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.setAttribute("aria-label", "Åpne spillmeny");
            menuToggle.title = "Åpne spillmeny";
        }
        mainMenu.setAttribute("aria-hidden", String(!showMenu));
        gameControls.forEach(element => { element.inert = showMenu; });
        this.setVisible("DivSpillMeta", (player == null || game == null || game.status == "O"));
        if (game == null) {
            setClass(mainMenu, "Skjul", false);
            this.updateMainMenu();
            document.getElementById("DivBord").innerHTML = "";
            delete document.getElementById("DivBord").dataset.gameId;
            delete document.getElementById("DivBord").dataset.gameStatus;
            delete document.getElementById("DivBord").dataset.gameRound;
        } else {
            var table = document.getElementById("DivBord");
            var isContinuingRound = table.dataset.gameId == String(game.id) &&
                table.dataset.gameStatus == "S" &&
                table.dataset.gameRound == String(game.round) &&
                game.status == "S";
            var existingPileSignatures = new Set(
                Array.from(document.querySelectorAll("#DivBord .table-play[data-play-signature]"))
                    .map(element => element.dataset.playSignature)
            );
            var playOrigins = isContinuingRound ? this.capturePlayOrigins() : null;
            setClass(mainMenu, "Skjul", true);
            this.updateGameButtons(game);
            this.updatePlayers(game, player);
            this.updateTable(game, player, existingPileSignatures, playOrigins);
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
                this.setVisible("BnFKobleSpill", true);
                this.setVisible("BnFNyAutoSpiller", true);
                this.setVisible("BnFStartSpill", game.players.length >= 2);
                this.setVisible("BnFRegler", true);
                this.setVisible("BnFHovedmeny", true);
                this.setVisible("BnFResultater", false);
                break;
            case "S":
            case "G":
                this.setVisible("BnFInviterSpill", true);
                this.setVisible("BnFKobleSpill", false);
                this.setVisible("BnFNyAutoSpiller", false);
                this.setVisible("BnFStartSpill", false);
                this.setVisible("BnFRegler", true);
                this.setVisible("BnFHovedmeny", false);
                this.setVisible("BnFResultater", false);
                break;
            case "F":
                this.setVisible("BnFInviterSpill", true);
                this.setVisible("BnFKobleSpill", false);
                this.setVisible("BnFNyAutoSpiller", true);
                this.setVisible("BnFStartSpill", true);
                this.setVisible("BnFRegler", true);
                this.setVisible("BnFHovedmeny", true);
                this.setVisible("BnFResultater", true);
                break;
            default:
                throw ('Ukjent spillstatus.');
                break;
        }
    }
    static updatePlayers(game, currentPlayer) {
        var playerList = document.getElementById("DivSpillere");
        playerList.innerHTML = "";
        var createPlayerSummary = (player, isCurrentPlayer = false) => {
            var playerElement = document.createElement("div");
            playerElement.className = "player-summary";
            if (isCurrentPlayer) {
                playerElement.classList.add("player-summary--self");
            }
            if (player.turn == 1 && (game.status == "S" || game.status == "G")) {
                playerElement.classList.add("is-current-turn");
            }
            playerElement.dataset.playerName = player.name;
            var nameElement = document.createElement("span");
            nameElement.className = "player-summary__name";
            nameElement.textContent = player.name;
            playerElement.appendChild(nameElement);
            var detailsElement = document.createElement("span");
            detailsElement.className = "player-summary__details";
            if (player.placement == 0 && (game.status == "S" || game.status == "G")) {
                detailsElement.textContent = `${player.cards.length} kort`;
            } else if (player.placement > 0) {
                detailsElement.textContent = game.placementTitle(player.placement).title;
            } else {
                detailsElement.textContent = "Venter";
            }
            playerElement.appendChild(detailsElement);
            if (game.status == "S" || game.status == "G") {
                var turnElement = document.createElement("span");
                turnElement.className = "player-summary__turn";
                if (player.turn == 1) {
                    turnElement.textContent = isCurrentPlayer ? "Din tur" : "Tur";
                    turnElement.setAttribute("aria-label", isCurrentPlayer ? "Du har tur" : "Denne spilleren har tur");
                } else {
                    turnElement.setAttribute("aria-hidden", "true");
                }
                playerElement.appendChild(turnElement);
            }
            if (!isCurrentPlayer && game.status != "S" && game.status != "G") {
                var removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.textContent = "Fjern";
                removeButton.setAttribute("aria-label", `Fjern ${player.name}`);
                removeButton.onclick = function () {
                    game.leavePlayer(player);
                }
                playerElement.appendChild(removeButton);
            }
            if (player.placement == 0) {
                playerElement.classList.toggle("MinTur", player.turn == 1);
                playerElement.classList.toggle("EttKort", player.cards.length == 1);
            } else {
                playerElement.classList.add("Ferdig");
            }
            return playerElement;
        };
        if (currentPlayer) {
            playerList.appendChild(createPlayerSummary(currentPlayer, true));
        }
        var currentPlayerIndex = (currentPlayer == null) ? -1 : game.players.indexOf(currentPlayer);
        var opponents = currentPlayerIndex < 0
            ? game.players.slice()
            : game.players.slice(currentPlayerIndex + 1).concat(game.players.slice(0, currentPlayerIndex));
        var opponentList = document.createElement("div");
        opponentList.className = "opponent-list";
        opponents.forEach((player, index) => {
            var playerElement = createPlayerSummary(player);
            playerElement.classList.add(`opponent-seat-${index}`);
            playerElement.dataset.clockwiseSeat = String(index);
            opponentList.appendChild(playerElement);
        });
        playerList.appendChild(opponentList);
        if (game.status == "S" && game.players.some(player => player.turn == 1 && player.placement == 0 && !player.lastPlay)) {
            scheduleIdleHelp(game);
        } else if (idleHelpTimer != null) {
            clearTimeout(idleHelpTimer);
            idleHelpTimer = null;
        }
    }
    static drawIdleHelp(choices, callbacks) {
        choices.push("Avbryt (ikke gjør noe)");
        callbacks.push(function () { });
        var element = document.getElementById("SpanHoppover");
        if (element == null) { return; };
        setClass(element, "DropdownButton", true);
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = "Hjelp inaktiv spiller";
        b.onclick = function () {
            showChoiceDialog(
                "Spilleren har ikke gjort noe på en stund. Vil du overstyre spilleren?",
                choices,
                callbacks
            )
        };
        element.appendChild(b);
    }
    static capturePlayOrigins() {
        var cardOrigins = new Map();
        document.querySelectorAll("#DivKort .game-card[data-card-key] img").forEach(image => {
            cardOrigins.set(image.closest(".game-card").dataset.cardKey, image.getBoundingClientRect());
        });
        var playerOrigins = new Map();
        document.querySelectorAll("#DivSpillere [data-player-name]").forEach(element => {
            playerOrigins.set(element.dataset.playerName, element.getBoundingClientRect());
        });
        return { cardOrigins: cardOrigins, playerOrigins: playerOrigins };
    }
    static animatePlayedCards(playElement, pile, origins) {
        if (!origins || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }
        var playerOrigin = origins.playerOrigins.get(pile.name);
        pile.forEach(card => {
            var cardKey = `${card.suit}:${card.rank}`;
            var source = origins.cardOrigins.get(cardKey) || playerOrigin;
            var target = playElement.querySelector(`[data-card-key="${cardKey}"]`);
            if (!source || !target || typeof target.animate != "function") { return; }
            var targetBounds = target.getBoundingClientRect();
            if (source.width == 0 || source.height == 0 || targetBounds.width == 0 || targetBounds.height == 0) { return; }
            var flight = document.createElement("img");
            flight.src = target.src;
            flight.alt = "";
            flight.setAttribute("aria-hidden", "true");
            flight.className = "card-flight";
            var flightLeft = source.left + (source.width - targetBounds.width) / 2;
            var flightTop = source.top + (source.height - targetBounds.height) / 2;
            var flightX = targetBounds.left - flightLeft;
            var flightY = targetBounds.top - flightTop;
            var targetRotation = parseFloat(target.style.getPropertyValue("--pile-rotation")) || 0;
            flight.style.left = `${flightLeft}px`;
            flight.style.top = `${flightTop}px`;
            flight.style.width = `${targetBounds.width}px`;
            flight.style.height = `${targetBounds.height}px`;
            document.body.appendChild(flight);
            target.style.opacity = "0";
            var animation = flight.animate([
                {
                    transform: "translate(0, 0) rotate(-8deg)",
                    opacity: 1
                },
                {
                    transform: `translate(${flightX * 0.65}px, ${flightY * 0.65}px) rotate(7deg)`,
                    opacity: 1,
                    offset: 0.68
                },
                {
                    transform: `translate(${flightX}px, ${flightY}px) rotate(${targetRotation}deg)`,
                    opacity: 0.72
                }
            ], {
                duration: 520,
                delay: pile.indexOf(card) * 55,
                easing: "cubic-bezier(.22,.8,.25,1)",
                fill: "forwards"
            });
            animation.onfinish = function () {
                target.style.opacity = "";
                flight.remove();
            };
        });
    }
    static animateDiscardedCards(table) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }
        table.querySelectorAll(".table-play__card").forEach((card, index) => {
            var bounds = card.getBoundingClientRect();
            if (bounds.width == 0 || bounds.height == 0) { return; }
            var rotation = parseFloat(card.style.getPropertyValue("--pile-rotation")) || 0;
            var flight = card.cloneNode(false);
            flight.className = "card-discard-flight";
            flight.alt = "";
            flight.setAttribute("aria-hidden", "true");
            if (typeof flight.animate != "function") { return; }
            flight.style.left = `${bounds.left}px`;
            flight.style.top = `${bounds.top}px`;
            flight.style.width = `${bounds.width}px`;
            flight.style.height = `${bounds.height}px`;
            document.body.appendChild(flight);
            var horizontalOffset = ((index % 7) - 3) * 35;
            var spin = (index % 2 == 0 ? -1 : 1) * (35 + (index % 5) * 12);
            var animation = flight.animate([
                {
                    transform: `translate(0, 0) rotate(${rotation}deg)`,
                    opacity: 1
                },
                {
                    transform: `translate(${horizontalOffset}px, ${-Math.max(150, window.innerHeight * 0.4)}px) rotate(${rotation + spin}deg)`,
                    opacity: 0
                }
            ], {
                duration: 720,
                delay: index * 12,
                easing: "cubic-bezier(.45,0,.8,.4)",
                fill: "forwards"
            });
            animation.onfinish = function () { flight.remove(); };
        });
    }
    static updateTable(game, player, existingPileSignatures = new Set(), playOrigins = null) {
        var table = document.getElementById("DivBord");
        table.dataset.gameId = String(game.id);
        table.dataset.gameStatus = game.status;
        table.dataset.gameRound = String(game.round);
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
                    var buttonSpan = document.createElement("span");
                    if (exchange.mode == "Tilbud") {
                        var voters = exchange.sneakyVotes || [];
                        var participantIndex = (player == null) ? -1 : game.players.indexOf(player);
                        var isParticipant = participantIndex == exchange.from || participantIndex == exchange.to;
                        var canInitiate = participantIndex == exchange.from;
                        var status = document.createElement("span");
                        status.className = "trade-status";
                        status.textContent = `Sneaky bytte: ${voters.length}/2 samtykker. Vanlig bytte bruker kort 7–J.`;
                        cardContainer.appendChild(status);
                        if (isParticipant) {
                            var sneakyButton = document.createElement("button");
                            sneakyButton.type = "button";
                            sneakyButton.textContent = voters.includes(participantIndex)
                                ? "Trekk sneaky-samtykke"
                                : "Sneaky bytte";
                            sneakyButton.setAttribute("aria-pressed", String(voters.includes(participantIndex)));
                            sneakyButton.onclick = function () {
                                game.toggleSneakyTrade(exchange, participantIndex);
                            };
                            buttonSpan.appendChild(sneakyButton);
                        }
                        if (canInitiate) {
                            var startButton = document.createElement("button");
                            startButton.type = "button";
                            startButton.textContent = "Start tvunget bytte";
                            startButton.disabled = !hasLegalTradeCard(game, exchange.from, exchange) ||
                                !hasLegalTradeCard(game, exchange.to, exchange);
                            startButton.title = startButton.disabled
                                ? "Begge spillerne trenger minst ett ledig kort fra 7 til J."
                                : "";
                            startButton.onclick = function () {
                                game.startOptionalTrade(exchange);
                            };
                            buttonSpan.appendChild(startButton);
                            var skipButton = document.createElement("button");
                            skipButton.type = "button";
                            skipButton.textContent = "Ingen bytte";
                            skipButton.onclick = function () {
                                game.skipOptionalTrade(exchange, participantIndex);
                            };
                            buttonSpan.appendChild(skipButton);
                        }
                        cardContainer.appendChild(buttonSpan);
                    } else {
                    var cardSpan = document.createElement("span");
                    exchange.cards.forEach(cards => {
                        var cardElement = GameLayout.createCardImage(((canSeeCards) ? new Card(cards.suit, cards.rank) : Card.createBack()), null);
                        cardSpan.appendChild(cardElement);
                    });
                    var outgoingExchanges = game.piles.filter(candidate =>
                        candidate.mode == "Velg" && game.players[candidate.from] == player
                    );
                    if (game.players[exchange.from] == player && exchange.mode == "Velg" && outgoingExchanges.length > 1) {
                        var chooseButton = document.createElement("button");
                        chooseButton.type = "button";
                        chooseButton.textContent = activeExchangeId == getExchangeId(exchange)
                            ? "Valgt for kortvalg"
                            : "Velg denne bytten";
                        chooseButton.setAttribute("aria-pressed", String(activeExchangeId == getExchangeId(exchange)));
                        chooseButton.onclick = function () {
                            activeExchangeId = getExchangeId(exchange);
                            GameLayout.updateTable(game, player);
                            GameLayout.updateHand(game, player);
                        };
                        buttonSpan.appendChild(chooseButton);
                    }
                    if (exchange.kind == "playerTrade" && player != null &&
                        (game.players[exchange.from] == player || game.players[exchange.to] == player)) {
                        var voters = exchange.sneakyVotes || [];
                        var participantIndex = game.players.indexOf(player);
                        var tradeStatus = document.createElement("span");
                        tradeStatus.className = "trade-status";
                        tradeStatus.textContent = hasSneakyConsent(exchange)
                            ? "Sneaky bytte: alle kort kan brukes."
                            : `Vanlig bytte: kort 7–J. Sneaky-samtykke ${voters.length}/2.`;
                        buttonSpan.appendChild(tradeStatus);
                        var sneakyButton = document.createElement("button");
                        sneakyButton.type = "button";
                        sneakyButton.textContent = voters.includes(participantIndex)
                            ? "Trekk sneaky-samtykke"
                            : "Sneaky bytte";
                        sneakyButton.setAttribute("aria-pressed", String(voters.includes(participantIndex)));
                        var hasSelectedTradeCard = game.piles.some(candidate =>
                            candidate.tradeId == exchange.tradeId &&
                            candidate.cards && candidate.cards.length > 0
                        );
                        sneakyButton.disabled = exchange.sneakyLocked === true ||
                            (hasSelectedTradeCard && voters.includes(participantIndex));
                        sneakyButton.onclick = function () {
                            game.toggleSneakyTrade(exchange, participantIndex);
                        };
                        buttonSpan.appendChild(sneakyButton);
                    }
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
                        }
                        element.appendChild(cardContainer);
                        table.appendChild(element);
                })
                break;
            case "S":
                var turnPauseId = game.turnPause ? `${game.id}:${game.turnPause.id}` : null;
                if (turnPauseId && table.dataset.turnPauseId != turnPauseId) {
                    this.animateDiscardedCards(table);
                    table.dataset.turnPauseId = turnPauseId;
                }
                table.className = "BordKortstokk";
                table.innerHTML = "";
                var tablePile = document.createElement("div");
                tablePile.className = "table-card-pile";
                var cardsOnTable = 0;
                var newlyPlayed = [];
                var totalCardCount = game.piles.reduce((total, pile) => total + pile.length, 0);
                var maxCardsPerPlay = game.piles.reduce((max, pile) => Math.max(max, pile.length), 0);
                var fanStep = Math.max(24, Math.min(56, window.innerWidth * 0.05));
                var compactStack = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
                tablePile.style.setProperty("--pile-fan-width", `${Math.max(0, maxCardsPerPlay - 1) * fanStep}px`);
                tablePile.style.setProperty("--pile-depth", `${Math.min(totalCardCount * 2.5, compactStack ? 18 : 44)}px`);
                game.piles.forEach((pile, playIndex) => {
                    var signature = `${game.round}:${pile.name}:${pile.map(card => `${card.suit}:${card.rank}`).join(",")}`;
                    var playElement = document.createElement("div");
                    playElement.className = "table-play";
                    playElement.dataset.playSignature = signature;
                    playElement.style.setProperty("--play-index", String(playIndex));
                    var playOffset = Math.min(cardsOnTable * 2.5, compactStack ? 18 : 44);
                    pile.forEach((card, cardIndex) => {
                        var image = GameLayout.createCardImage(card, null);
                        image.className = "table-play__card";
                        image.dataset.cardKey = `${card.suit}:${card.rank}`;
                        image.setAttribute("aria-hidden", "true");
                        var rotation = (((cardsOnTable * 7) % 9) - 4) * 1.2;
                        image.style.left = `${5 + cardIndex * fanStep}px`;
                        image.style.top = `${5 + playOffset}px`;
                        image.style.setProperty("--stack-index", String(cardsOnTable));
                        image.style.setProperty("--pile-rotation", `${rotation}deg`);
                        playElement.appendChild(image);
                        cardsOnTable++;
                    });
                    tablePile.appendChild(playElement);
                    if (!existingPileSignatures.has(signature)) {
                        newlyPlayed.push({ element: playElement, pile: pile });
                    }
                });
                if (cardsOnTable > 0) {
                    var latestPile = game.piles[game.piles.length - 1];
                    tablePile.setAttribute("role", "group");
                    var pileCount = document.createElement("span");
                    pileCount.className = "table-card-pile__count";
                    pileCount.textContent = `${cardsOnTable} kort`;
                    var lastPlay = document.createElement("span");
                    lastPlay.className = "table-card-pile__last-play";
                    lastPlay.textContent = `På bordet: ${latestPile.describe()}`;
                    tablePile.setAttribute(
                        "aria-label",
                        `Bunken har ${cardsOnTable} kort. På bordet: ${latestPile.describe()}.`
                    );
                    tablePile.appendChild(pileCount);
                    tablePile.appendChild(lastPlay);
                    table.appendChild(tablePile);
                    if (newlyPlayed.length > 0) {
                        window.requestAnimationFrame(function () {
                            newlyPlayed.forEach(play => {
                                GameLayout.animatePlayedCards(play.element, play.pile, playOrigins);
                            });
                        });
                    }
                }
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
            this.el("SpanHoppover").innerHTML = "";
            this.setVisible("BnPNySpiller", false);
            this.setVisible("BnPPass", false);
            this.setVisible("BnPGiOpp", false);
            this.setVisible("BnPByttNavn", false);
            return;
        }
        this.el("SpanHoppover").innerHTML = "";
        if (player == null) {
            this.el("SpanSpillerInfo").innerHTML = "";
        } else {
            if (player.turn == 1) {
                switch (game.status) {
                    case "G":
                        this.el("SpanSpillerInfo").innerHTML = `Du skal gi kort.`;
                        break;
                    case "S":
                        var o = game.topPile();
                        if (o == null) {
                            this.el("SpanSpillerInfo").innerHTML = `Du skal starte å legge ut.`;
                        } else {
                            this.el("SpanSpillerInfo").innerHTML = `På bordet ligger: ${o.describe()}.`;
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
        this.setVisible("BnPGiOpp", (player != null && game.status != "O" && game.status != "F" && !(game.status == "S" && player.placement != 0)));
        this.setVisible("BnPByttNavn", (player != null));
    }
    static updateHand(game, player) {
        var element = document.getElementById("DivKort");
        var previousScrollLeft = element.scrollLeft;
        var shouldCenterAutoSelection = false;
        var autoCenterTurnKey = null;
        var autoCenterCardKeys = [];
        var previouslySelectedCardKeys = new Set(
            Array.from(element.querySelectorAll(".game-card.is-selected"))
                .map(card => card.dataset.cardKey)
        );
        var selectionCount = document.getElementById("selectedCardCount");
        var passButton = document.getElementById("BnPPass");
        element.innerHTML = "";
        if (player == null || game == null) {
            stopCardHandInertia();
            clearCardSelection();
            selectedCardOwner = null;
            activeExchangeId = null;
            autoSelectedTurnKey = null;
            if (selectionCount) { selectionCount.textContent = ""; }
            passButton.classList.remove("pass-needs-action");
            element.classList.remove("HasHandSelection");
            element.classList.remove("is-hand-dragging");
            element.onpointerdown = null;
            element.onpointermove = null;
            element.onpointerup = null;
            element.onpointercancel = null;
            element.onwheel = null;
            element.scrollLeft = 0;
            return;
        }
        var ownerKey = `${game.id}:${player.name}`;
        if (selectedCardOwner !== ownerKey) {
            stopCardHandInertia();
            previousScrollLeft = 0;
            clearCardSelection();
            selectedCardOwner = ownerKey;
            activeExchangeId = null;
            autoSelectedTurnKey = null;
        }
        var handScrollDrag = null;
        element.classList.remove("is-hand-dragging");
        element.onpointerdown = function (event) {
            if (event.pointerType == "touch" ||
                event.button != 0 ||
                !event.isPrimary ||
                (event.target instanceof Element && event.target.closest(".game-card"))) {
                return;
            }
            stopCardHandInertia();
            handScrollDrag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastMoveTime: performance.now(),
                startScrollLeft: element.scrollLeft,
                scrollVelocity: 0,
                axis: null
            };
            if (typeof element.setPointerCapture == "function") {
                element.setPointerCapture(event.pointerId);
            }
        };
        element.onpointermove = function (event) {
            if (!handScrollDrag || handScrollDrag.pointerId != event.pointerId) { return; }
            var dragOffsetX = event.clientX - handScrollDrag.startX;
            var dragOffsetY = event.clientY - handScrollDrag.startY;
            if (handScrollDrag.axis == null &&
                Math.max(Math.abs(dragOffsetX), Math.abs(dragOffsetY)) >= 8) {
                handScrollDrag.axis = Math.abs(dragOffsetX) > Math.abs(dragOffsetY)
                    ? "horizontal"
                    : "vertical";
            }
            if (handScrollDrag.axis != "horizontal") { return; }
            event.preventDefault();
            element.classList.add("is-hand-dragging");
            var moveTime = performance.now();
            var elapsed = moveTime - handScrollDrag.lastMoveTime;
            if (elapsed > 0) {
                var velocity = -(event.clientX - handScrollDrag.lastX) / elapsed;
                velocity = Math.max(-0.9, Math.min(0.9, velocity));
                handScrollDrag.scrollVelocity =
                    handScrollDrag.scrollVelocity * 0.35 + velocity * 0.65;
            }
            handScrollDrag.lastX = event.clientX;
            handScrollDrag.lastMoveTime = moveTime;
            element.scrollLeft = handScrollDrag.startScrollLeft - dragOffsetX;
        };
        element.onpointerup = function (event) {
            var activeDrag = handScrollDrag;
            handScrollDrag = null;
            element.classList.remove("is-hand-dragging");
            if (activeDrag &&
                activeDrag.pointerId == event.pointerId &&
                activeDrag.axis == "horizontal") {
                var releaseDelay = performance.now() - activeDrag.lastMoveTime;
                startCardHandInertia(
                    element,
                    activeDrag.scrollVelocity * Math.exp(-releaseDelay / 90)
                );
            }
        };
        element.onpointercancel = function () {
            handScrollDrag = null;
            element.classList.remove("is-hand-dragging");
        };
        element.onwheel = function (event) {
            if (element.scrollWidth <= element.clientWidth ||
                Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
                return;
            }
            event.preventDefault();
            stopCardHandInertia();
            element.scrollLeft += event.deltaY;
        };
        var selectableExchanges = (game.status == "G")
            ? game.piles.filter(exchange =>
                exchange.mode == "Velg" && game.players[exchange.from] == player
            )
            : [];
        if (!selectableExchanges.some(exchange => getExchangeId(exchange) == activeExchangeId)) {
            activeExchangeId = null;
        }
        if (selectableExchanges.length == 1) {
            activeExchangeId = getExchangeId(selectableExchanges[0]);
        }
        var activeExchange = selectableExchanges.find(exchange =>
            getExchangeId(exchange) == activeExchangeId
        ) || null;
        var isPlayingTurn = (game.status == "S" && player.turn == 1 && player.placement == 0 && !game.isTurnPaused());
        var playableStrengths = new Set();
        if (isPlayingTurn) {
            player.cards.forEach(card => {
                if (!playableStrengths.has(card.strengthRank)) {
                    var info = {};
                    if (game.canPlayRank(player, card.strengthRank, info)) {
                        playableStrengths.add(card.strengthRank);
                    }
                }
            });
        } else {
            clearCardSelection();
            autoSelectedTurnKey = null;
        }
        passButton.classList.toggle(
            "pass-needs-action",
            isPlayingTurn && playableStrengths.size == 0
        );
        if (selectedCardStrength != null && !playableStrengths.has(selectedCardStrength)) {
            clearCardSelection();
        }
        if (selectedCardKeys.size > 0) {
            var currentCardKeys = new Set(player.cards.map(card => `${card.suit}:${card.rank}`));
            selectedCardKeys.forEach(cardKey => {
                if (!currentCardKeys.has(cardKey)) {
                    selectedCardKeys.delete(cardKey);
                }
            });
            if (selectedCardKeys.size == 0) {
                selectedCardStrength = null;
            }
        }
        if (isPlayingTurn && selectedCardKeys.size == 0) {
            var topPile = game.topPile();
            var topPileKey = topPile
                ? topPile.map(card => `${card.suit}:${card.rank}`).join(",")
                : "empty";
            var turnKey = `${game.id}:${game.round}:${game.turn}:${player.name}:${topPileKey}`;
            if (autoSelectedTurnKey != turnKey) {
                autoSelectedTurnKey = turnKey;
                var lowestPlayableStrength = Array.from(playableStrengths)
                    .sort((a, b) => a - b)[0];
                if (lowestPlayableStrength != null) {
                    var lowestPlay = {};
                    if (game.canPlayRank(player, lowestPlayableStrength, lowestPlay) && lowestPlay.pile) {
                        selectedCardStrength = lowestPlayableStrength;
                        var automaticCards = lowestPlay.pile;
                        automaticCards.forEach(card =>
                            selectedCardKeys.add(`${card.suit}:${card.rank}`)
                        );
                        shouldCenterAutoSelection = automaticCards.length > 0;
                        autoCenterTurnKey = turnKey;
                        autoCenterCardKeys = automaticCards.map(card => `${card.suit}:${card.rank}`);
                    }
                }
            }
        }
        element.classList.toggle("HasHandSelection", isPlayingTurn && selectedCardKeys.size > 0);
        var playSelectedCards = function () {
            var selectedCards = player.cards.filter(card =>
                selectedCardKeys.has(`${card.suit}:${card.rank}`)
            );
            if (selectedCards.length == 0) { return false; }
            var pile = new CardPile(player.name, ...selectedCards);
            if (!game.canPlayPile(player, pile)) {
                showDialog("KanIkkeLeggeKort", true);
                return false;
            }
            clearCardSelection();
            game.playCards(player, pile);
            return true;
        };
        var selectCardsForSwipe = function (card) {
            if (!playableStrengths.has(card.strengthRank)) { return false; }
            var playInfo = {};
            if (!game.canPlayRank(player, card.strengthRank, playInfo) || !playInfo.pile) {
                return false;
            }
            var cardsToPlay = playInfo.pile.slice();
            if (!cardsToPlay.includes(card)) {
                cardsToPlay[cardsToPlay.length - 1] = card;
            }
            clearCardSelection();
            selectedCardStrength = card.strengthRank;
            cardsToPlay.forEach(selectedCard =>
                selectedCardKeys.add(`${selectedCard.suit}:${selectedCard.rank}`)
            );
            return true;
        };
        var clearDragStyles = function () {
            element.querySelectorAll(".game-card.is-dragging").forEach(draggedCard => {
                draggedCard.classList.remove("is-dragging");
                draggedCard.style.removeProperty("--drag-base-y");
                draggedCard.style.removeProperty("--drag-scale");
                draggedCard.style.removeProperty("--drag-offset-x");
                draggedCard.style.removeProperty("--drag-offset-y");
            });
        };
        if (selectionCount) {
            var selectedCards = player.cards.filter(card =>
                selectedCardKeys.has(`${card.suit}:${card.rank}`)
            );
            if (isPlayingTurn && selectedCards.length > 0) {
                var topPile = game.topPile();
                var requiredCount = (topPile == null)
                    ? null
                    : ((selectedCardStrength == PresidentCard.clubThreePower()) ? 1 : topPile.length);
                selectionCount.textContent = (requiredCount == null)
                    ? `${selectedCards.length} kort valgt. Sveip sidelengs for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.`
                    : `${selectedCards.length} av ${requiredCount} kort valgt. Sveip sidelengs for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.`;
                selectionCount.setAttribute("aria-label", selectionCount.textContent);
            } else {
                selectionCount.textContent = "";
            }
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
                    var elemKort = document.createElement("button");
                    elemKort.type = "button";
                    elemKort.disabled = true;
                    var fanPosition = (player.cards.length > 1)
                        ? Math.round(100 * ((cardIndex / (player.cards.length - 1)) - 0.5)) / 10
                        : 0;
                    var cardKey = `${k.suit}:${k.rank}`;
                    elemKort.className = "game-card";
                    elemKort.dataset.cardKey = cardKey;
                    elemKort.style.setProperty("--card-offset", "0px");
                    elemKort.style.setProperty("--card-rotation", `${fanPosition}deg`);
                    elemKort.innerHTML = GameLayout.cardImageHtml(k, null);
                    var isSelected = selectedCardKeys.has(cardKey);
                    var isPlayable = isPlayingTurn && playableStrengths.has(k.strengthRank);
                    if (isSelected) {
                        elemKort.classList.add("is-selected");
                        if (!previouslySelectedCardKeys.has(cardKey)) {
                            elemKort.classList.add("is-rising");
                        }
                    } else if (previouslySelectedCardKeys.has(cardKey)) {
                        elemKort.classList.add("is-lowering");
                    }
                    if (activeExchange && activeExchange.cards.some(card =>
                        card.suit == k.suit && card.rank == k.rank
                    )) {
                        elemKort.classList.add("is-exchange-selected");
                    }
                    if (isPlayable) {
                        elemKort.classList.add("is-playable");
                    } else if (isPlayingTurn) {
                        elemKort.classList.add("is-unplayable");
                    }
                    if (selectedCardStrength != null && !isSelected) {
                        if (k.strengthRank == selectedCardStrength && isPlayable) {
                            elemKort.classList.add("is-mixable");
                        } else {
                            elemKort.classList.add("is-dimmed");
                        }
                    }
                    var dragState = null;
                    switch (game.status) {
                        case "G":
                            if (activeExchange) {
                                var isSelectedForExchange = activeExchange.cards.some(card =>
                                    card.suit == k.suit && card.rank == k.rank
                                );
                                var availableCards = getAvailableExchangeCards(
                                    game,
                                    game.players.indexOf(player),
                                    activeExchange
                                );
                                var canSelectForExchange = availableCards.some(card =>
                                    card.suit == k.suit && card.rank == k.rank
                                ) &&
                                    isCardAllowedForExchange(activeExchange, k) &&
                                    activeExchange.cards.length < activeExchange.count;
                                elemKort.disabled = !isSelectedForExchange && !canSelectForExchange;
                                if (!elemKort.disabled) {
                                elemKort.tabIndex = 0;
                                elemKort.setAttribute(
                                    "aria-label",
                                    `${k.getName()}${isSelectedForExchange ? ", valgt for bytte" : ", velg for bytte"}`
                                );
                                elemKort.onclick = function () {
                                    var i = activeExchange.cards.findIndex(cards =>
                                        cards.suit == k.suit && cards.rank == k.rank
                                    );
                                    if (i >= 0) {
                                        activeExchange.cards.splice(i, 1);
                                    } else {
                                        var stillAvailable = getAvailableExchangeCards(
                                            game,
                                            game.players.indexOf(player),
                                            activeExchange
                                        ).some(card => card.suit == k.suit && card.rank == k.rank);
                                        if (!stillAvailable ||
                                            activeExchange.cards.length >= activeExchange.count ||
                                            !isCardAllowedForExchange(activeExchange, k)) {
                                            return;
                                        }
                                        activeExchange.cards.push(k);
                                    };
                                    game.save();
                                    GameLayout.updateTable(game, player);
                                    GameLayout.updateHand(game, player);
                                };
                                }
                            }
                            break;
                        case "S":
                            if (isPlayingTurn) {
                                elemKort.disabled = false;
                                elemKort.tabIndex = 0;
                                elemKort.setAttribute(
                                    "aria-label",
                                    `${k.getName()}${isPlayable ? ", kan spilles" : ", kan ikke spilles nå"}`
                                );
                                elemKort.title = isPlayable
                                    ? "Sveip sidelengs for å bla. Dra eller flick kortet opp, eller trykk Enter for å legge det ut"
                                    : "Dette kortet kan ikke spilles nå";
                                elemKort.setAttribute("aria-pressed", String(isSelected));
                                elemKort.onclick = function () {
                                    if (suppressNextCardClick) {
                                        suppressNextCardClick = false;
                                        return;
                                    }
                                    if (!playableStrengths.has(k.strengthRank)) {
                                        showDialog("KanIkkeLeggeKort", true);
                                        return;
                                    }
                                    if (selectedCardStrength != null && selectedCardStrength != k.strengthRank) {
                                        clearCardSelection();
                                    }
                                    if (selectedCardKeys.has(cardKey)) {
                                        selectedCardKeys.delete(cardKey);
                                        if (selectedCardKeys.size == 0) {
                                            selectedCardStrength = null;
                                        }
                                    } else {
                                        var topPile = game.topPile();
                                        var maxCards = (topPile == null)
                                            ? player.cards.filter(card => card.strengthRank == k.strengthRank).length
                                            : ((k.strengthRank == PresidentCard.clubThreePower())
                                                ? 1
                                                : (hasFourOfKindOnTop(game) ? 4 : topPile.length));
                                        selectedCardStrength = k.strengthRank;
                                        if (selectedCardKeys.size == 0) {
                                            var matchingCards = player.cards.filter(card =>
                                                card.strengthRank == k.strengthRank
                                            );
                                            matchingCards
                                                .filter(card => `${card.suit}:${card.rank}` == cardKey)
                                                .concat(matchingCards.filter(card =>
                                                    `${card.suit}:${card.rank}` != cardKey
                                                ))
                                                .slice(0, maxCards)
                                                .forEach(card => selectedCardKeys.add(`${card.suit}:${card.rank}`));
                                        } else {
                                            if (selectedCardKeys.size >= maxCards) {
                                                var lastSelectedKey = Array.from(selectedCardKeys).pop();
                                                if (lastSelectedKey) {
                                                    selectedCardKeys.delete(lastSelectedKey);
                                                }
                                            }
                                            selectedCardKeys.add(cardKey);
                                        }
                                    }
                                    GameLayout.updateHand(game, player);
                                    var focusedCard = Array.from(element.querySelectorAll(".game-card"))
                                        .find(card => card.dataset.cardKey == cardKey);
                                    if (focusedCard) {
                                        focusedCard.focus({ preventScroll: true });
                                    }
                                };
                            } else if (player.turn == 1 && game.isTurnPaused()) {
                                elemKort.title = "Vent litt før neste trekk";
                                elemKort.setAttribute("aria-label", `${k.getName()}, vent før neste trekk`);
                            }
                            break;
                        default:
                            break;
                    }
                    if (!elemKort.disabled) {
                        elemKort.onkeydown = function (event) {
                            if ((event.key == "Enter" || event.key == " ") && !event.repeat) {
                                event.preventDefault();
                                if (game.status == "S" && selectedCardKeys.has(cardKey)) {
                                    playSelectedCards();
                                } else {
                                    elemKort.click();
                                }
                            } else if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
                                event.preventDefault();
                                var cards = Array.from(element.querySelectorAll(".game-card:not(:disabled)"));
                                var currentIndex = cards.indexOf(elemKort);
                                var direction = (event.key == "ArrowRight") ? 1 : -1;
                                var nextCard = cards[currentIndex + direction];
                                if (nextCard) {
                                    nextCard.focus();
                                }
                            }
                        };
                        elemKort.onpointerdown = function (event) {
                            elemKort.classList.add("is-pressed");
                            updateCardTilt(elemKort, event);
                            if (event.isPrimary) {
                                stopCardHandInertia();
                                dragState = {
                                    pointerId: event.pointerId,
                                    startX: event.clientX,
                                    lastX: event.clientX,
                                    startY: event.clientY,
                                    startScrollLeft: element.scrollLeft,
                                    startTime: Date.now(),
                                    lastMoveTime: performance.now(),
                                    scrollVelocity: 0,
                                    axis: null,
                                    didMove: false,
                                    didPlayDrag: false,
                                    canPlay: false,
                                    canSwipeToPlay: game.status == "S" && isPlayingTurn
                                };
                                if (dragState.canSwipeToPlay) {
                                    elemKort.style.setProperty(
                                        "--drag-base-y",
                                        selectedCardKeys.has(cardKey) ? "-18px" : "0px"
                                    );
                                    elemKort.style.setProperty(
                                        "--drag-scale",
                                        selectedCardKeys.has(cardKey) ? "1.06" : "1"
                                    );
                                    elemKort.style.setProperty("--drag-offset-x", "0px");
                                }
                                if (event.pointerType != "touch" &&
                                    typeof elemKort.setPointerCapture == "function") {
                                    elemKort.setPointerCapture(event.pointerId);
                                }
                            }
                        };
                        elemKort.onpointermove = function (event) {
                            updateCardTilt(elemKort, event);
                            if (dragState && dragState.pointerId == event.pointerId) {
                                var dragOffsetX = event.clientX - dragState.startX;
                                var dragOffsetY = event.clientY - dragState.startY;
                                if (dragState.axis == null &&
                                    Math.max(Math.abs(dragOffsetX), Math.abs(dragOffsetY)) >= 8) {
                                    dragState.axis = (Math.abs(dragOffsetX) > Math.abs(dragOffsetY))
                                        ? "horizontal"
                                        : "vertical";
                                    dragState.didMove = true;
                                }
                                if (dragState.axis == "horizontal") {
                                    dragState.didMove = true;
                                    if (event.pointerType != "touch") {
                                        var moveTime = performance.now();
                                        var elapsed = moveTime - dragState.lastMoveTime;
                                        if (elapsed > 0) {
                                            var velocity = -(event.clientX - dragState.lastX) / elapsed;
                                            velocity = Math.max(-0.9, Math.min(0.9, velocity));
                                            dragState.scrollVelocity =
                                                dragState.scrollVelocity * 0.35 + velocity * 0.65;
                                        }
                                        dragState.lastX = event.clientX;
                                        dragState.lastMoveTime = moveTime;
                                        element.scrollLeft = dragState.startScrollLeft - dragOffsetX;
                                    }
                                    resetCardTilt(elemKort);
                                    return;
                                }
                                if (dragState.axis == "vertical" &&
                                    dragState.canSwipeToPlay &&
                                    dragOffsetY < -4) {
                                    if (event.pointerType == "touch" &&
                                        typeof elemKort.setPointerCapture == "function") {
                                        elemKort.setPointerCapture(event.pointerId);
                                    }
                                    if (!dragState.didPlayDrag) {
                                        dragState.didPlayDrag = true;
                                        dragState.canPlay = selectCardsForSwipe(k);
                                    }
                                    dragState.didMove = true;
                                    if (dragState.canPlay) {
                                        var selectionOffset = `${Math.max(-180, dragOffsetY)}px`;
                                        element.querySelectorAll(".game-card").forEach(draggedCard => {
                                            if (!selectedCardKeys.has(draggedCard.dataset.cardKey)) { return; }
                                            draggedCard.classList.add("is-selected", "is-dragging");
                                            draggedCard.setAttribute("aria-pressed", "true");
                                            draggedCard.style.setProperty("--drag-base-y", "-18px");
                                            draggedCard.style.setProperty("--drag-scale", "1.06");
                                            draggedCard.style.setProperty("--drag-offset-x", `${dragOffsetX}px`);
                                            draggedCard.style.setProperty("--drag-offset-y", selectionOffset);
                                        });
                                    }
                                }
                            }
                        };
                        elemKort.onpointerup = function (event) {
                            var activeDrag = dragState;
                            dragState = null;
                            elemKort.classList.remove("is-pressed");
                            var keepDragPosition = false;
                            if (activeDrag && activeDrag.pointerId == event.pointerId) {
                                var swipeDistance = activeDrag.startY - event.clientY;
                                var swipeThreshold = Math.max(
                                    48,
                                    Math.min(72, elemKort.getBoundingClientRect().height * 0.35)
                                );
                                var swipeVelocity = swipeDistance / Math.max(1, Date.now() - activeDrag.startTime);
                                var isFlick = swipeDistance >= 24 && swipeVelocity >= 0.55;
                                if (activeDrag.didMove) {
                                    suppressNextCardClick = true;
                                    window.setTimeout(function () {
                                        suppressNextCardClick = false;
                                    }, 0);
                                }
                                if (activeDrag.axis != "horizontal" &&
                                    activeDrag.canSwipeToPlay &&
                                    (swipeDistance >= swipeThreshold || isFlick)) {
                                    suppressNextCardClick = true;
                                    window.setTimeout(function () {
                                        suppressNextCardClick = false;
                                    }, 0);
                                    if ((activeDrag.didPlayDrag && activeDrag.canPlay) ||
                                        (!activeDrag.didPlayDrag && selectCardsForSwipe(k))) {
                                        keepDragPosition = playSelectedCards();
                                    } else {
                                        showDialog("KanIkkeLeggeKort", true);
                                    }
                                }
                                if (activeDrag.axis == "horizontal" && event.pointerType != "touch") {
                                    var releaseDelay = performance.now() - activeDrag.lastMoveTime;
                                    startCardHandInertia(
                                        element,
                                        activeDrag.scrollVelocity * Math.exp(-releaseDelay / 90)
                                    );
                                }
                            }
                            if (!keepDragPosition) {
                                clearDragStyles();
                            }
                            if (event.pointerType == "touch") {
                                resetCardTilt(elemKort);
                            }
                        };
                        elemKort.onpointercancel = function () {
                            dragState = null;
                            elemKort.classList.remove("is-pressed");
                            clearDragStyles();
                            resetCardTilt(elemKort);
                        };
                        elemKort.onpointerleave = function () {
                            if (dragState) { return; }
                            elemKort.classList.remove("is-pressed");
                            resetCardTilt(elemKort);
                        };
                    }
                    element.appendChild(elemKort)
                });
            }
        } else {
            clearCardSelection();
            setClass(element, "KortKort", true);
            setClass(element, "KortForklaring", false);
            var s = `<img src='icons/${game.placementTitle(player.placement).img}' alt='Ferdig' height='90%' />`;
            if (game.status == "S") {
                s += `<span>Du ble <b>${game.placementTitle(player.placement).title}</b>. Venter på at de andre skal spille ferdig.</span>`;
            } else {
                s += `<span>Spillet er ferdig. Du ble <b>${game.placementTitle(player.placement).title}</b> (av ${game.players.length} spillere). For å spille en runde til, trykk på «Start spill».</span>`;
            }
            element.innerHTML = s;
        }
        element.scrollLeft = previousScrollLeft;
        if (shouldCenterAutoSelection) {
            stopCardHandInertia();
            window.requestAnimationFrame(function () {
                window.requestAnimationFrame(function () {
                    if (selectedCardOwner != ownerKey ||
                        autoSelectedTurnKey != autoCenterTurnKey ||
                        selectedCardKeys.size != autoCenterCardKeys.length ||
                        !autoCenterCardKeys.every(cardKey => selectedCardKeys.has(cardKey))) {
                        return;
                    }
                    var autoSelectedCards = Array.from(element.querySelectorAll(".game-card.is-selected"));
                    if (autoSelectedCards.length == 0) { return; }
                    var selectedBounds = autoSelectedCards.map(card => card.getBoundingClientRect());
                    var selectedLeft = Math.min(...selectedBounds.map(bounds => bounds.left));
                    var selectedRight = Math.max(...selectedBounds.map(bounds => bounds.right));
                    var handBounds = element.getBoundingClientRect();
                    var targetScrollLeft = element.scrollLeft +
                        (selectedLeft + selectedRight) / 2 -
                        (handBounds.left + handBounds.width / 2);
                    var maxScrollLeft = element.scrollWidth - element.clientWidth;
                    element.scrollTo({
                        left: Math.max(0, Math.min(maxScrollLeft, targetScrollLeft)),
                        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                            ? "auto"
                            : "smooth"
                    });
                });
            });
        }
    }
}

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
                if (k.strengthRank != this.strengthRank) { throw ("Kan ikke legge på forskjellige kort.") }
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
            if (item.strengthRank != this.strengthRank) { throw ("Kan ikke legge på forskjellige kort.") }
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
        if (this[0].isClubThree()) { return "kløver 3" };
        var rank = Card.rankInfo(this[0].rank);
        if (this.length == 2) { return `Par i ${rank.name}`; }
        if (this.length == 3) { return `Triss i ${rank.name}`; }
        if (this.length == 4) { return `Fire like i ${rank.name}`; }
        return ["", "en", "to", "tre", "fire", "fem", "seks", "syv"][this.length] + " " + ((this.length > 1) ? rank.pluralName : rank.singularName);
    }
    canBePlayedOn(topPile) {
        return (
            (topPile == null) || // First card in a new pile.
            (this.length == topPile.length && this.strengthRank > topPile.strengthRank) || // Standard rules.
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
        this.turnPause = null;
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
            "turnPause": this.turnPause,
            ts: new Date()
        });
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
            ["id", "kind", "tradeId", "sneakyVotes", "sneakyLocked"].forEach(key => {
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
                sneakyLocked: record.sneakyLocked === true
            };
            exchange.id = record.id || `exchange:${exchange.from}:${exchange.to}`;
            return exchange;
        });
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
            if (this.players.length == 3 && placement == 2) {
                return ({ title: "Nøytral", img: "worker.svg" });
            }
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
                this.players[this.players.length - 2].messages.push("Gir sitt dårligste kort til visepresidenten.");
                this.players[this.players.length - 1].messages.push("Gir sine to dårligste kort til presidenten.");
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
                if (this.players.length == 3) {
                    this.piles.push({
                        id: `offer:${this.round}:0:1`,
                        tradeId: `trade:${this.round}:0:1`,
                        kind: "playerTrade",
                        text: "Presidenten kan starte et tvunget bytte med Nøytral:",
                        from: 0,
                        to: 1,
                        count: 1,
                        mode: "Tilbud",
                        cards: [],
                        sneakyVotes: []
                    }, {
                        id: `offer:${this.round}:1:2`,
                        tradeId: `trade:${this.round}:1:2`,
                        kind: "playerTrade",
                        text: "Nøytral kan starte et tvunget bytte med Boms:",
                        from: 1,
                        to: 2,
                        count: 1,
                        mode: "Tilbud",
                        cards: [],
                        sneakyVotes: []
                    });
                }
            }
            this.piles.forEach(exchange => {
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
            var heartThreePlayerIndex = this.players.findIndex(player =>
                player.cards.some(card => (card.suit == 2 && card.rank == 3))
            );
            if (heartThreePlayerIndex >= 0) {
                this.setTurn(heartThreePlayerIndex);
            }
        }
    }
    startOptionalTrade(offer, sneaky = false) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); }
        var offerId = getExchangeId(offer);
        var currentOffer = this.piles.find(exchange =>
            getExchangeId(exchange) == offerId && exchange.mode == "Tilbud"
        );
        if (!currentOffer || currentOffer.kind != "playerTrade") {
            throw ("Dette byttet er ikke lenger tilgjengelig.");
        }
        var isAuthorizedPair =
            (currentOffer.from == 0 && currentOffer.to == 1) ||
            (currentOffer.from == 1 && currentOffer.to == 2);
        if (this.players.length != 3 || !isAuthorizedPair) {
            throw ("Denne bytteregelen gjelder bare President, Nøytral og Boms i et tre-spillers spill.");
        }
        if (sneaky) {
            if (!hasSneakyConsent(currentOffer)) {
                throw ("Begge spillerne må samtykke til sneaky bytte.");
            }
        } else if (!hasLegalTradeCard(this, currentOffer.from, currentOffer) ||
            !hasLegalTradeCard(this, currentOffer.to, currentOffer)) {
            throw ("Begge spillerne må ha et ledig kort fra 7 til J.");
        }
        this.piles.splice(this.piles.indexOf(currentOffer), 1);
        var tradeId = currentOffer.tradeId || `trade:${this.round}:${currentOffer.from}:${currentOffer.to}`;
        var votes = (currentOffer.sneakyVotes || []).slice();
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
            sneakyLocked: false
        });
        this.piles.push(
            createExchange(currentOffer.from, currentOffer.to),
            createExchange(currentOffer.to, currentOffer.from)
        );
        this.players[currentOffer.from].turn = 1;
        this.players[currentOffer.to].turn = 1;
        this.save();
    }
    skipOptionalTrade(offer, playerIndex) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); }
        var currentOffer = this.piles.find(exchange =>
            getExchangeId(exchange) == getExchangeId(offer) && exchange.mode == "Tilbud"
        );
        if (!currentOffer || currentOffer.kind != "playerTrade") {
            throw ("Dette byttet er ikke lenger tilgjengelig.");
        }
        if (currentOffer.from != playerIndex) {
            throw ("Bare spilleren som kan starte byttet, kan velge Ingen bytte.");
        }
        this.piles.splice(this.piles.indexOf(currentOffer), 1);
        this.advanceExchangeStage();
        this.save();
    }
    toggleSneakyTrade(exchange, playerIndex) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); }
        var current = this.piles.find(candidate =>
            getExchangeId(candidate) == getExchangeId(exchange)
        );
        if (!current || current.kind != "playerTrade" ||
            (current.mode != "Tilbud" && current.mode != "Velg")) {
            throw ("Sneaky-samtykke kan ikke endres nå.");
        }
        if (playerIndex != current.from && playerIndex != current.to) {
            throw ("Bare deltakerne i byttet kan gi sneaky-samtykke.");
        }
        var relatedExchanges = this.piles.filter(candidate =>
            candidate.tradeId != null && candidate.tradeId == current.tradeId
        );
        var votes = (current.sneakyVotes || []).slice();
        var voteIndex = votes.indexOf(playerIndex);
        if (voteIndex >= 0) {
            if (relatedExchanges.some(candidate => candidate.cards && candidate.cards.length > 0)) {
                throw ("Sneaky-samtykke kan ikke trekkes tilbake etter at kort er valgt.");
            }
            votes.splice(voteIndex, 1);
        } else {
            votes.push(playerIndex);
        }
        relatedExchanges.forEach(candidate => {
            candidate.sneakyVotes = votes.slice();
        });
        if (current.mode == "Tilbud" && hasSneakyConsent(current)) {
            this.startOptionalTrade(current, true);
        } else {
            this.save();
        }
    }
    advanceExchangeStage() {
        if (this.piles.length == 0) {
            this.status = "S";
            this.setTurn(0);
        } else if (this.piles.every(exchange => exchange.mode == "Gitt")) {
            this.piles.forEach(exchange => {
                exchange.mode = "Kan se";
            });
            this.setTurn(-1);
        }
    }
    giveExchangeCards(exchange) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); };
        if (exchange.mode != 'Velg' && exchange.mode != 'Best') { throw (`Kan ikke gi kort når modus er ${exchange.mode} (må være Velg eller Best).`); };
        if (exchange.cards.length != exchange.count) { throw ("Feil antall kort som byttes."); };
        var availableCards = getAvailableExchangeCards(this, exchange.from, exchange);
        var usedCards = new Set();
        exchange.cards.forEach(k => {
            var key = exchangeCardKey(k);
            if (usedCards.has(key) ||
                !availableCards.some(card => exchangeCardKey(card) == key) ||
                !isCardAllowedForExchange(exchange, k)) {
                throw ("Kortene er ikke gyldige for dette byttet.");
            }
            usedCards.add(key);
        });
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
        this.advanceExchangeStage();
        this.save();
    }
    receiveExchangeCards(exchange) {
        if (this.status != "G") { throw ("Spillet er ikke i bytte-modus."); };
        if (exchange.mode != 'Kan se') { throw (`Kan ikke gi kort når modus er ${exchange.mode} (må være Kan se).`); };
        if (exchange.cards.length != exchange.count) { throw ("Feil antall kort som byttes."); };
        exchange.cards.forEach(k => {
            this.players[exchange.to].cards.push(new PresidentCard(k.suit, k.rank));
        });
        this.players[exchange.to].cards.sortCards();
        this.piles.splice(this.piles.findIndex(b => (b == exchange)), 1);
        this.advanceExchangeStage();
        this.save();
    }
    topPile() {
        if (this.piles.length == 0) { return null; }
        return this.piles[this.piles.length - 1];
    }
    isTurnPaused() {
        return this.turnPause != null && Date.now() < this.turnPause.until;
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
        if (!isClubThree && strengthRank <= topPile.strengthRank) {
            resultInfo.svar = false;
            resultInfo.text = `Må legge på høyere enn ${topPile.strengthRank}.`;
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
        var isClubThreePlay = pile != null && pile.length == 1 && pile[0].isClubThree();
        var canBeatCurrentPile = isClubThreePlay || (fourOfKindOnTop
            ? pile != null &&
                pile.length == 4 &&
                pile.every(card => card.strengthRank == pile[0].strengthRank) &&
                pile.strengthRank > topPile.strengthRank
            : pile != null && pile.canBePlayedOn(topPile));
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
            info.text = "Fire like";
            return true;
        }
        if (this.players.filter(player => (player.lastPlay != "Pass" && player.placement == 0)).length <= 1) {
            info.text = "Alle spillere sa pass";
            return true;
        }
        return false;
    }
    playCards(player, pile) {
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
            player.turn == 1 &&
            !this.isTurnPaused();
    }
    passTurn(player) {
        if (!this.canPass(player)) { throw ("Kan ikke passe nå."); }
        player.lastPlay = "Pass";
        this.advanceTurn();
    }
    nextTurnIndex(currentTurnPlayer) {
        var info = {};
        if (this.pileCleared(info)) {
            var previousPlayer = this.players[currentTurnPlayer];
            if (previousPlayer.lastPlay) {
                previousPlayer.messages.push(`${((previousPlayer.lastPlay.describe) ? "La på " + previousPlayer.lastPlay.describe() : previousPlayer.lastPlay)}, bunken går ut. (${info.text})`);
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
            var nextPlayerIndex;
            if (nextPlayerName == null) {
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
            this.piles = [];
            var now = Date.now();
            var nextPlayer = this.players[nextPlayerIndex];
            this.turnPause = {
                id: `${now}-${Math.random().toString(36).slice(2)}`,
                until: now + 2000,
                message: (info.text == "Alle spillere sa pass")
                    ? `Alle andre har passet. ${nextPlayer.name} får turen igjen.`
                    : `Det går ut! ${nextPlayer.name} får turen igjen.`
            };
            return nextPlayerIndex;
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
        var currentGameSubscription = null;
        var currentGameListener = null;
        var turnPauseRefreshTimer = null;
        var gameToastTimer = null;
        var lastShownTurnPauseId = null;
        var appShell = document.getElementById("DivHele");
        var gameMenuToggle = document.getElementById("BnGameMenuToggle");
        var gameMenu = document.getElementById("DivFKnapper");

        function promptForPlayerName(isRename = false) {
            document.querySelector("#dialogSporOmNick .dialogTittel").textContent =
                isRename ? "Bytt spillernavn" : "Hva vil du hete?";
            document.getElementById("dialogSporOmNickTxt").value =
                isRename && currentPlayerName != null ? currentPlayerName : "";
            document.getElementById("dialogSporOmNickError").innerHTML = "";
            document.getElementById("dialogSporOmNickOk").textContent =
                isRename ? "Lagre navn" : "Bli spiller";
            showDialog("SporOmNick", true);
        }

        function connectAndPromptForPlayerName() {
            var shouldPrompt = true;
            connectGame(function () {
                if (shouldPrompt && currentGame != null) {
                    shouldPrompt = false;
                    promptForPlayerName();
                }
            });
        }

        function disconnectGameListener() {
            if (currentGameSubscription != null && currentGameListener != null) {
                currentGameSubscription.off("value", currentGameListener);
            }
            currentGameSubscription = null;
            currentGameListener = null;
        }

        function leaveCurrentGame() {
            var game = currentGame;
            disconnectGameListener();
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            if (gameToastTimer != null) {
                clearTimeout(gameToastTimer);
                gameToastTimer = null;
            }
            hideGameToast();
            lastShownTurnPauseId = null;
            if (game != null && currentPlayerName != null && game.status != "F") {
                var player = game.getPlayer(currentPlayerName);
                if (player != null) {
                    game.leavePlayer(player);
                }
            }
            currentGame = null;
            currentPlayerName = null;
            try {
                closeFullscreen();
            } catch (error) { }
            GameLayout.updateSharedView(null, null);
            GameLayout.updatePlayerView(null, null);
        }

        function showConnectGameDialog() {
            try {
                openFullscreen(document.getElementsByTagName("body")[0]);
            } catch (error) { }
            document.getElementById("dialogKobleSpillId").value = null;
            document.getElementById("dialogKobleSpillError").innerHTML = "";
            showDialog("KobleSpill", true);
        }

        function connectToAnotherGame() {
            leaveCurrentGame();
            showConnectGameDialog();
        }

        function hideGameToast() {
            if (gameToastTimer != null) {
                clearTimeout(gameToastTimer);
                gameToastTimer = null;
            }
            var toast = document.getElementById("GameToast");
            toast.classList.remove("is-visible");
            toast.textContent = "";
        }

        function showGameToast(message) {
            var toast = document.getElementById("GameToast");
            toast.textContent = message;
            toast.classList.add("is-visible");
            if (gameToastTimer != null) {
                clearTimeout(gameToastTimer);
            }
            gameToastTimer = setTimeout(hideGameToast, 2000);
        }

        function handleTurnPause(game) {
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            var pause = game.turnPause;
            if (pause == null) { return; }
            if (pause.id != lastShownTurnPauseId) {
                lastShownTurnPauseId = pause.id;
                if (pause.until > Date.now()) {
                    showGameToast(pause.message);
                }
            }
            var delay = pause.until - Date.now();
            if (delay > 0) {
                turnPauseRefreshTimer = setTimeout(function () {
                    turnPauseRefreshTimer = null;
                    if (currentGame != game || game.turnPause == null || game.turnPause.id != pause.id) { return; }
                    GameLayout.updateSharedView(game, game.getPlayer(currentPlayerName));
                    GameLayout.updatePlayerView(game, game.getPlayer(currentPlayerName));
                }, delay + 20);
            }
        }

        function setGameMenuOpen(isOpen, returnFocus = false) {
            appShell.classList.toggle("GameMenuOpen", isOpen);
            gameMenuToggle.setAttribute("aria-expanded", String(isOpen));
            var label = isOpen ? "Lukk spillmeny" : "Åpne spillmeny";
            gameMenuToggle.setAttribute("aria-label", label);
            gameMenuToggle.title = label;
            if (!isOpen && returnFocus && appShell.classList.contains("SpillAktivt")) {
                gameMenuToggle.focus();
            }
        }

        gameMenuToggle.addEventListener("click", function () {
            setGameMenuOpen(!appShell.classList.contains("GameMenuOpen"));
        });

        gameMenu.addEventListener("click", function (event) {
            var action = event.target.closest ? event.target.closest("button") : null;
            if (!action) { return; }
            var dialogIsOpen = document.querySelector(".dialog-container--visible") != null;
            setGameMenuOpen(false, !dialogIsOpen);
        });

        document.addEventListener("pointerdown", function (event) {
            if (!appShell.classList.contains("GameMenuOpen") ||
                gameMenu.contains(event.target) || gameMenuToggle.contains(event.target)) {
                return;
            }
            setGameMenuOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key != "Escape" || !appShell.classList.contains("GameMenuOpen")) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            setGameMenuOpen(false, true);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key != "Escape" || selectedCardKeys.size == 0 ||
                document.querySelector(".dialog-container--visible")) {
                return;
            }
            var focusedCardKey = document.activeElement.dataset
                ? document.activeElement.dataset.cardKey
                : null;
            clearCardSelection();
            var currentPlayer = (currentGame == null) ? null : currentGame.getPlayer(currentPlayerName);
            if (currentPlayer) {
                GameLayout.updateHand(currentGame, currentPlayer);
                var focusedCard = Array.from(document.querySelectorAll("#DivKort .game-card"))
                    .find(card => card.dataset.cardKey == focusedCardKey);
                if (focusedCard) {
                    focusedCard.focus();
                }
            }
        });

        document.getElementById('BnHNySpill').addEventListener('click', function () {
            if (navigator.userAgent.match(/Android|iPhone/i)) {
                try {
                    openFullscreen(document.getElementsByTagName("body")[0]);
                } catch (error) { }
            }
            currentGame = new PresidentGame();
            currentPlayerName = null;
            connectAndPromptForPlayerName();
        });

        document.getElementById('BnHKobleSpill').addEventListener('click', function () {
            showConnectGameDialog();
        });

        document.getElementById('BnFKobleSpill').addEventListener('click', connectToAnotherGame);

        document.getElementById('dialogKobleSpillOk').addEventListener('click', function () {
            var id = document.getElementById("dialogKobleSpillId").value;
            currentGame = new PresidentGame(id);
            currentPlayerName = null;
            var shouldPromptForName = true;
            connectGame(function () {
                if (currentGame == null) {
                    document.getElementById('dialogKobleSpillError').innerHTML = "Kunne ikke koble til. Er spill-nummeret riktig?";
                    document.getElementById('dialogKobleSpillId').focus();
                } else {
                    showDialog("KobleSpill", false);
                    if (shouldPromptForName) {
                        shouldPromptForName = false;
                        promptForPlayerName();
                    }
                }
            });
        });

        function connectGame(afterConnect = function () { }) {
            disconnectGameListener();
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            lastShownTurnPauseId = null;
            var connectingGame = currentGame;
            currentGameSubscription = connectingGame.databaseRef;
            currentGameListener = function (snapshot) {
                if (currentGame != connectingGame) { return; }
                var snapshotRecord = snapshot.val();
                if (snapshotRecord != null) {
                    var storedPlayers = snapshotRecord["spillere"] || [];
                    var storedPiles = snapshotRecord["spillBunke"] || [];
                    connectingGame.status = snapshotRecord.status;
                    var storedRules = snapshotRecord["regler"] || {};
                    connectingGame.rules = { showCardsOnly: storedRules["VisKunKort"] };
                    connectingGame.round = snapshotRecord["runde"];
                    connectingGame.players = PresidentPlayer.deserializePlayers(storedPlayers);
                    connectingGame.piles = ((connectingGame.status == "G") ? PresidentGame.deserializeExchanges(storedPiles) : PresidentCard.deserializePiles(storedPiles));
                    connectingGame.turn = snapshotRecord["sinTur"];
                    connectingGame.turnPause = snapshotRecord["turnPause"] || null;
                    connectingGame.ts = snapshotRecord.ts;
                    GameLayout.updateSharedView(connectingGame, connectingGame.getPlayer(currentPlayerName));
                    GameLayout.updatePlayerView(connectingGame, connectingGame.getPlayer(currentPlayerName));
                    handleTurnPause(connectingGame);
                } else {
                    disconnectGameListener();
                    currentGame = null;
                    currentPlayerName = null;
                    GameLayout.updateSharedView(null, null);
                    GameLayout.updatePlayerView(null, null);
                }
                afterConnect();
            };
            currentGameSubscription.on('value', currentGameListener);
        }

        const inviteId = new URLSearchParams(window.location.search).get("spillid");
        if (inviteId && /^[1-9]\d{0,5}$/.test(inviteId)) {
            currentGame = new PresidentGame(inviteId);
            currentPlayerName = null;
            connectAndPromptForPlayerName();
        }

        document.getElementById('BnFInviterSpill').addEventListener('click', function () {
            if (currentGame == null) { throw ('Må lage spill før du inviterer.') }
            const inviteUrl = `${document.baseURI}?spillid=${currentGame.id}`;
            showInviteLink(currentGame.id, inviteUrl);
        });

        document.getElementById('BnFStartSpill').addEventListener('click', function () {
            currentGame.startGame();
            setTimeout(runBotLoop, BOT_ACTION_DELAY_MS);
        });

        function runBotLoop() {
            if (currentGame.status == "G") {
                currentGame.players.filter(s => (s.playerKey == "PC")).forEach(player => {
                    playBotTurn(currentGame, player);
                });
            } else if (currentGame.status == "S" && currentGame.turn >= 0 && currentGame.players[currentGame.turn].playerKey == "PC") {
                playBotTurn(currentGame, currentGame.players[currentGame.turn]);
            }
            if (currentGame.status != "F") { setTimeout(runBotLoop, BOT_ACTION_DELAY_MS); }
        }

        document.getElementById('BnFHovedmeny').addEventListener('click', function () {
            if (currentGame != null) {
                if (currentPlayerName == null || currentGame.status == "F") {
                    leaveCurrentGame();
                } else {
                    showChoiceDialog(
                        "Vil du avslutte spillet?", [
                        "Ja, gå til hovedmenyen",
                        "Nei, fortsett spillet"
                    ], [
                        leaveCurrentGame,
                        function () { }
                    ]
                    );
                }
            }
        });

        document.getElementById('BnPNySpiller').addEventListener('click', function () {
            if (currentPlayerName != null) { throw ('Skal ikke lage ny spiller når man allerede har en spiller.') }
            promptForPlayerName();
        });

        document.getElementById('BnPByttNavn').addEventListener('click', function () {
            if (currentPlayerName != null) {
                promptForPlayerName(true);
            }
        });

        document.getElementById('dialogSporOmNickOk').addEventListener('click', function () {
            var requestedName = document.getElementById('dialogSporOmNickTxt').value.trim();
            if (requestedName != "") {
                if (currentGame == null) {
                    document.getElementById('dialogSporOmNickError').textContent = "Spillet er ikke tilkoblet.";
                    return;
                }
                if (currentPlayerName != null) {
                    var playerToRename = currentGame.getPlayer(currentPlayerName);
                    if (playerToRename == null) {
                        document.getElementById('dialogSporOmNickError').textContent = "Spilleren finnes ikke lenger.";
                        return;
                    }
                    var isNameTaken = currentGame.players.some(player =>
                        player !== playerToRename && player.name.toLocaleLowerCase() == requestedName.toLocaleLowerCase()
                    );
                    if (isNameTaken) {
                        document.getElementById('dialogSporOmNickError').textContent = "Navnet er allerede i bruk.";
                        return;
                    }
                    var oldName = playerToRename.name;
                    playerToRename.name = requestedName;
                    currentGame.piles.forEach(pile => {
                        if (pile instanceof CardPile && pile.name == oldName) {
                            pile.name = requestedName;
                        }
                    });
                    currentGame.players.forEach(player => {
                        if (player.lastPlay instanceof CardPile && player.lastPlay.name == oldName) {
                            player.lastPlay.name = requestedName;
                        }
                    });
                    currentPlayerName = requestedName;
                    currentGame.save();
                    GameLayout.updateSharedView(currentGame, playerToRename);
                    GameLayout.updatePlayerView(currentGame, playerToRename);
                    showDialog("SporOmNick", false);
                } else {
                    var key = getPlayerKey();
                    var newPlayerResult = currentGame.addPlayer(new PresidentPlayer(requestedName, key));
                    if (newPlayerResult.player) {
                        currentPlayerName = newPlayerResult.player.name;
                        GameLayout.updatePlayerView(currentGame, newPlayerResult.player);
                        showDialog("SporOmNick", false);
                    } else {
                        document.getElementById('dialogSporOmNickError').textContent = newPlayerResult.text;
                    }
                }
            }
        });

        document.getElementById('BnPGiOpp').addEventListener('click', function () {
            if (currentGame.status == "S") {
                showChoiceDialog(
                    "Er du sikker på at du vil gi opp?", [
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
            var usedNames = currentGame.players.map(player => player.name.toLocaleLowerCase());
            var availableNames = BOT_NAMES.filter(name => !usedNames.includes(name.toLocaleLowerCase()));
            if (availableNames.length > 0) {
                var name = availableNames[Math.floor(Math.random() * availableNames.length)];
                currentGame.addPlayer(new PresidentPlayer(name, key));
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
    if (game.status == "S" && game.isTurnPaused()) { return; }
    if (game.status == "G") {
        game.piles.slice().filter(exchange =>
            exchange.mode == "Kan se" && game.players[exchange.to] == player
        ).forEach(exchange => {
            game.receiveExchangeCards(exchange);
        });
        if (game.status == "G") {
            game.piles.slice().filter(exchange =>
                exchange.mode == "Tilbud" && game.players[exchange.from] == player
            ).forEach(exchange => {
                game.skipOptionalTrade(exchange, game.players.indexOf(player));
            });
        }
        if (game.status == "G") {
            game.piles.slice().filter(exchange =>
                exchange.mode == "Velg" && game.players[exchange.from] == player
            ).forEach(exchange => {
                var availableCards = getAvailableExchangeCards(
                    game,
                    game.players.indexOf(player),
                    exchange
                );
                if (exchange.kind == "playerTrade") {
                    availableCards = availableCards.filter(card =>
                        isCardAllowedForExchange(exchange, card)
                    );
                }
                availableCards.sort((a, b) => a.strengthRank - b.strengthRank || a.suit - b.suit);
                if (availableCards.length < exchange.count) {
                    throw ("Datamaskinen har ikke nok gyldige kort til byttet.");
                }
                exchange.cards = availableCards.slice(0, exchange.count);
                game.giveExchangeCards(exchange);
            });
        }
        if (game.status == "G") {
            game.piles.slice().filter(exchange =>
                exchange.mode == "Best" && game.players[exchange.from] == player
            ).forEach(exchange => {
                game.giveExchangeCards(exchange);
            });
        }
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
                } else if (cards.strengthRank == pile.strengthRank &&
                    (pile.length < (hasFourOfKindOnTop(game) ? 4 : game.topPile().length))) {
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
            "Gjør det beste",
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