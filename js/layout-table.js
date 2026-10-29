// GameLayout: The table: played piles, guidance text, the turn timer and table content.
GameLayout.extend(class {
    static updateTableCardVisibility(element, hiddenCardKeys) {
        element.querySelectorAll(".table-play__card").forEach(card => {
            var opacity = hiddenCardKeys.has(card.dataset.cardKey) ? "0" : "";
            if (card.style.opacity !== opacity) {
                card.style.opacity = opacity;
                if (typeof CardDepth != "undefined") { CardDepth.setHidden(card, opacity === "0"); }
            }
        });
    }
    static createTablePile(game, piles, existingPileSignatures, hiddenCardKeys = new Set()) {
        var board = document.getElementById("gameTable");
        var boardBounds = board.getBoundingClientRect();
        var compactStack = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
        var contextKey = JSON.stringify([game.id, game.round, game.shuffleStartedAt, compactStack, boardBounds.width <= 600,
            game.players.map(player => player.name)]);
        var playKeys = piles.map(pile => JSON.stringify([pile.name, Array.from(pile, card => [card.suit, card.rank]), pile.motion,
            GameLayout.styleForPlayer(game, pile.name), GameLayout.foilForPlayer(game, pile.name)]));
        var renderKey = JSON.stringify([contextKey, playKeys]);
        var cached = board._tablePileView;
        if (cached && cached.key === renderKey && cached.element.parentElement === board) {
            this.updateTableCardVisibility(cached.element, hiddenCardKeys);
            return { element: cached.element, newlyPlayed: cached.plays.flatMap((play, index) =>
                existingPileSignatures.has(play.element.dataset.playSignature) ? [] : [{ element: play.element, pile: piles[index] }]) };
        }
        var append = cached && cached.contextKey === contextKey && cached.element.parentElement === board &&
            cached.playKeys.length < playKeys.length && cached.playKeys.every((key, index) => key === playKeys[index]);
        var tablePile = append ? cached.element : document.createElement("div");
        tablePile.className = "table-card-pile";
        tablePile.style.setProperty("--board-width", `${boardBounds.width}px`);
        tablePile.style.setProperty("--board-height", `${boardBounds.height}px`);
        if (GameLayout.tableSizeObserver == null && typeof ResizeObserver != "undefined") {
            var board = document.getElementById("gameTable");
            GameLayout.tableSizeObserver = new ResizeObserver(() => {
                var bounds = board.getBoundingClientRect();
                board.querySelectorAll(".table-card-pile").forEach(pile => {
                    pile.style.setProperty("--board-width", `${bounds.width}px`);
                    pile.style.setProperty("--board-height", `${bounds.height}px`);
                    if (typeof CardDepth != "undefined") { CardDepth.prepareTable(pile); }
                });
            });
            GameLayout.tableSizeObserver.observe(board);
        }
        var cardsOnTable = 0;
        var newlyPlayed = [];
        var plays = [];
        var totalCardCount = piles.reduce((total, pile) => total + pile.length, 0);
        var maxCardsPerPlay = piles.reduce((max, pile) => Math.max(max, pile.length), 0);
        tablePile.style.setProperty("--pile-fan-count", String(Math.max(0, maxCardsPerPlay - 1)));
        tablePile.style.setProperty("--pile-depth", `${Math.min(totalCardCount * 2.5, compactStack ? 18 : 44)}px`);
        piles.forEach((pile, playIndex) => {
            var signature = `${game.shuffleStartedAt || ""}:${pile.name}:${pile.map(card => `${card.suit}:${card.rank}`).join(",")}`;
            if (append && playIndex < cached.plays.length) {
                var retainedPlay = cached.plays[playIndex].element;
                retainedPlay.dataset.topPlay = "false";
                retainedPlay.querySelectorAll(".table-play__beat-outline").forEach(outline => outline.remove());
                plays.push({ element: retainedPlay, pile: pile });
                cardsOnTable += pile.length;
                if (!existingPileSignatures.has(signature)) { newlyPlayed.push({ element: retainedPlay, pile: pile }); }
                return;
            }
            var playElement = document.createElement("div");
            playElement.className = "table-play";
            playElement.dataset.topPlay = String(playIndex == piles.length - 1);
            playElement.dataset.playSignature = signature;
            playElement.style.setProperty("--play-index", String(playIndex));
            playElement.style.setProperty("--pile-fan-count", String(Math.max(0, pile.length - 1)));
            playElement.style.setProperty("--pile-depth", `${Math.min((cardsOnTable + pile.length) * 2.5, compactStack ? 18 : 44)}px`);
            if (pile.motion) {
                playElement.style.setProperty("--landing-x", `calc(${pile.motion.x} * var(--landing-space-x))`);
                playElement.style.setProperty("--landing-y", `calc(${pile.motion.y} * var(--landing-space-y))`);
            }
            var playOffset = Math.min(cardsOnTable * 2.5, compactStack ? 18 : 44);
            pile.forEach((card, cardIndex) => {
                var style = GameLayout.styleForPlayer(game, pile.name);
                var foil = GameLayout.foilForPlayer(game, pile.name);
                var image = GameLayout.createCardImage(card, null, style, foil);
                var cardElement = document.createElement("div");
                cardElement.className = `table-play__card card-preview card-preview--${style}`;
                cardElement.dataset.cardStyle = style;
                cardElement.dataset.foil = foil;
                var cardKey = `${card.suit}:${card.rank}`;
                cardElement.dataset.cardKey = cardKey;
                cardElement.setAttribute("aria-hidden", "true");
                image.alt = "";
                image.setAttribute("aria-hidden", "true");
                cardElement.appendChild(image);
                if (hiddenCardKeys.has(cardKey)) {
                    cardElement.style.opacity = "0";
                }
                if (playIndex == piles.length - 1) {
                    var outline = document.createElement("span");
                    outline.className = "table-play__beat-outline";
                    outline.setAttribute("aria-hidden", "true");
                    cardElement.appendChild(outline);
                }
                var rotation = GameLayout.pileCardJitter(game, pile, card, cardsOnTable, cardIndex,
                    boardBounds.width <= 600);
                cardElement.style.left = `calc(5px + ${cardIndex} * var(--pile-fan-step) + ${rotation.x}px + var(--landing-x, 0px))`;
                cardElement.style.top = `calc(${5 + playOffset + rotation.y}px + var(--landing-y, 0px))`;
                cardElement.style.setProperty("--stack-index", String(cardsOnTable));
                cardElement.style.setProperty("--pile-rotation", `${rotation.angle}deg`);
                playElement.appendChild(cardElement);
                cardsOnTable++;
            });
            if (append) {
                this.updateTableCardVisibility(tablePile, hiddenCardKeys);
            }
            tablePile.appendChild(playElement);
            plays.push({ element: playElement, pile: pile });
            if (!existingPileSignatures.has(signature)) {
                newlyPlayed.push({ element: playElement, pile: pile });
            }
        });
        if (cardsOnTable > 0) {
            var repeatedSingle = getRepeatedSinglePlay(piles);
            tablePile.setAttribute("role", "group");
            if (repeatedSingle != null) {
                var countBadge = board._pileCount || document.createElement("span");
                board._pileCount = countBadge;
                countBadge.hidden = false;
                countBadge.className = "table-card-pile__count";
                countBadge.textContent =
                    `${repeatedSingle.count} × ${PresidentCard.strengthName(repeatedSingle.strengthRank)}`;
                var statusDock = document.getElementById("tableStatusDock") || board;
                if (countBadge.parentElement !== statusDock) { statusDock.appendChild(countBadge); }
                tablePile.setAttribute(
                    "aria-label",
                    `På bordet ligger ${repeatedSingle.count} singlekort med verdien ${PresidentCard.strengthName(repeatedSingle.strengthRank)}.`
                );
            } else {
                if (board._pileCount) { board._pileCount.hidden = true; }
                var latestPile = piles[piles.length - 1];
                tablePile.setAttribute("aria-label", `På bordet ligger ${latestPile.describe()}.`);
            }
        }
        board._tablePileView = { key: renderKey, contextKey: contextKey, playKeys: playKeys, element: tablePile, plays: plays };
        return { element: tablePile, newlyPlayed: newlyPlayed };
    }
    static updateTable(game, player, existingPileSignatures = new Set(), playOrigins = null) {
        if (this.toastRegion == null) {
            this.toastRegion = document.getElementById("gameToastRegion");
        }
        this.updatePlayerStatus(game, player);
        var exchangeActions = document.getElementById("exchangeActions");
        if (exchangeActions) {
            exchangeActions.replaceChildren();
            exchangeActions.hidden = true;
        }
        var table = document.getElementById("gameTable");
        if (this.tableTurnHint == null) {
            this.tableTurnHint = document.getElementById("tableTurnHint");
        }
        if (this.tableTurnHint) {
            this.tableTurnHint.hidden = !(player && game.status == "S" &&
                player.placement == 0 && player.turn == 1 && game.piles.length == 0 &&
                !game.isTurnPaused());
        }
        if (this.turnTimerElement == null) {
            this.turnTimerElement = document.getElementById("turnTimer");
        }
        if (this.isShuffling(game)) {
            table.className = "table-explanation";
            this.clearTableContent(table);
            this.keepTurnTimer(table);
            return;
        }
        GameLayout.viewerName = player != null ? player.name : null;
        var pauseId = game.turnPause ? `${game.id}:${game.turnPause.id}` : null;
        if (pauseId != null && table.dataset.clearingPauseId == pauseId) { return; }
        var isNewPause = pauseId != null && table.dataset.turnPauseId != pauseId;
        table.dataset.gameId = String(game.id);
        table.dataset.gameStatus = game.status;
        table.dataset.gameRound = String(game.round);
        if (game.status != "F") {
            delete table.dataset.gameOverAnimationId;
        }
        if (pauseId != null) {
            table.dataset.turnPauseId = pauseId;
        } else {
            delete table.dataset.turnPauseId;
        }
        var clearedPiles = game.turnPause &&
            game.turnPause.kind == "clear" &&
            game.presentationCompletedPauseId != game.turnPause.id &&
            Array.isArray(game.turnPause.clearedPiles)
            ? PresidentCard.deserializePiles(game.turnPause.clearedPiles)
            : [];
        var displayPiles = game.status == "S"
            ? (clearedPiles.length > 0 ? clearedPiles : game.piles)
            : [];
        var playedPause = game.turnPause &&
            game.turnPause.playedPile &&
            (game.turnPause.kind == "play" || game.turnPause.kind == "clear")
            ? game.turnPause.playedPile
            : null;
        var playedCardKeys = new Set();
        if (playedPause != null && Array.isArray(playedPause.cards)) {
            PresidentCard.deserializeDeck(playedPause.cards).forEach(card => {
                playedCardKeys.add(`${card.suit}:${card.rank}`);
            });
        }
        var isAnimatingPlayedPause = pauseId != null &&
            table.dataset.animatingPlayedPauseId == pauseId;
        var shouldAnimatePlayedPause = isNewPause &&
            playedPause != null &&
            playedCardKeys.size > 0 &&
            displayPiles.length > 0 &&
            table.dataset.completedPlayedPauseId != pauseId &&
            !isAnimatingPlayedPause &&
            !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (shouldAnimatePlayedPause) {
            table.dataset.animatingPlayedPauseId = pauseId;
        }
        var hiddenCardKeys = shouldAnimatePlayedPause || isAnimatingPlayedPause
            ? playedCardKeys
            : new Set();
        var pileView = displayPiles.length > 0
            ? this.createTablePile(game, displayPiles, existingPileSignatures, hiddenCardKeys)
            : null;
        var shouldAnimateUntrackedPlays = !shouldAnimatePlayedPause &&
            !isAnimatingPlayedPause &&
            playOrigins != null &&
            pileView != null &&
            pileView.newlyPlayed.length > 0 &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (shouldAnimateUntrackedPlays) {
            pileView.newlyPlayed.forEach(play => {
                play.element.querySelectorAll(".table-play__card").forEach(card => {
                    card.style.opacity = "0";
                });
            });
        }
        var completePlayedAnimation = () => {
            if (table.dataset.animatingPlayedPauseId != pauseId) { return; }
            table.dataset.completedPlayedPauseId = pauseId;
            delete table.dataset.animatingPlayedPauseId;
            table.querySelectorAll(".table-play__card[data-card-key]").forEach(card => {
                if (playedCardKeys.has(card.dataset.cardKey)) {
                    card.style.opacity = "";
                    if (typeof CardDepth != "undefined" && typeof CardDepth.setHidden == "function") { CardDepth.setHidden(card, false); }
                }
            });
            this.flashClubThree(game, table, pauseId);
            table.dispatchEvent(new CustomEvent("played-cards-animation-complete", {
                detail: { pauseId: pauseId }
            }));
        };
        switch (game.status) {
            case "O":
                if (game.players.length == 0) {
                    // Show guidance while the room is waiting for players.
                    table.className = "table-explanation";
                    this.setTableContent(table, document.getElementById("tableExplanation").innerHTML);
                } else {
                    // Show the deck while players are joining.
                    table.className = "table-decks";
                    var s = "";
                    for (let i = 0; i < game.deckCount(); i++) {
                        s += GameLayout.cardImageHtml(Card.createBack(), null);
                    }
                    this.setTableContent(table, s);
                }
                break;
            case "G": {
                table.className = "exchange-panel";
                this.clearTableContent(table);
                if (GamePresence.exchangeBlocksActions(game)) {
                    var receiptWaiting = document.createElement("p");
                    receiptWaiting.className = "exchange-ready-hint";
                    receiptWaiting.setAttribute("role", "status");
                    receiptWaiting.textContent = "Venter på at spillerne bekrefter mottatte kort …";
                    table.appendChild(receiptWaiting);
                    break;
                }
                var currentPlayerIndex = player == null ? -1 : game.players.indexOf(player);
                var { selectedExchange } = this.exchangeStatus(game, player);
                var exchangeHeading = document.createElement("div");
                exchangeHeading.className = "exchange-panel__heading";
                var heading = document.createElement("strong");
                heading.textContent = `Kortbytte før runde ${game.round}`;
                exchangeHeading.append(heading);
                table.appendChild(exchangeHeading);
                game.piles.forEach(exchange => {
                    if (exchange.mode == "Tilbud" && exchange != activeTradeOffer(game)) { return; }
                    if (!exchange.cards) { exchange.cards = [] };
                    var fromPlayer = game.players[exchange.from];
                    var toPlayer = game.players[exchange.to];
                    var isSender = fromPlayer == player;
                    var isRecipient = toPlayer == player;
                    var exchangeRole = game.placementTitle(
                        fromPlayer.lastPlacement || exchange.from + 1
                    );
                    var countText = exchange.count == 1 ? "ett kort" : `${exchange.count} kort`;
                    var element = document.createElement("div");
                    element.className = "exchange";
                    if (exchange.mode == "Gitt" && isSender) {
                        element.classList.add("exchange--waiting");
                    } else if (
                        (exchange.mode == "Velg" || exchange.mode == "Best") && isSender ||
                        exchange.mode == "Kan se" && isRecipient ||
                        exchange.mode == "Tilbud" && (isSender || isRecipient)
                    ) {
                        setClass(element, "exchange--active");
                    } else {
                        setClass(element, "exchange--passive");
                    }
                    var playerIcon = document.createElement("div");
                    playerIcon.className = "exchange-player";
                    if (exchangeRole.title == "President" || exchangeRole.title == "Boms") {
                        var roleImage = document.createElement("span");
                        roleImage.className = "exchange-player__emoji";
                        roleImage.textContent = exchangeRole.title == "President" ? "👑" : "🗑️";
                        roleImage.setAttribute("aria-hidden", "true");
                        playerIcon.appendChild(roleImage);
                    } else {
                        element.classList.add("exchange--neutral");
                    }
                    element.appendChild(playerIcon);
                    var title = document.createElement("div");
                    title.className = "exchange-title";
                    switch (exchange.mode) {
                        case "Velg":
                            title.textContent = fromPlayer.leaveAfterExchange === true
                                ? `${fromPlayer.name} velger ${countText} automatisk til ${toPlayer.name}.`
                                : (isSender
                                    ? `Velg ${countText} du vil gi til ${toPlayer.name}.`
                                    : `${fromPlayer.name} velger ${countText} til ${toPlayer.name}.`);
                            break;
                        case "Best":
                            var bestCardsText = exchange.count == 1 ? "ditt beste kort" : "dine to beste kort";
                            title.textContent = fromPlayer.leaveAfterExchange === true
                                ? `${fromPlayer.name} gir ${exchange.count == 1 ? "sitt beste kort" : "sine beste kort"} automatisk til ${toPlayer.name}.`
                                : (isSender
                                    ? `Du må gi ${bestCardsText} til ${toPlayer.name}.`
                                    : `${fromPlayer.name} må gi ${exchange.count == 1 ? "sitt beste kort" : "sine beste kort"} til ${toPlayer.name}.`);
                            break;
                        case "Gitt":
                            title.textContent = fromPlayer.leaveAfterExchange === true
                                ? `${fromPlayer.name} har valgt kort automatisk. Venter på ${toPlayer.name}.`
                                : (isSender
                                    ? `Kortvalget er bekreftet. Venter på ${toPlayer.name}.`
                                    : `${fromPlayer.name} har bekreftet kortvalget.`);
                            break;
                        case "Kan se":
                            title.textContent = toPlayer.leaveAfterExchange === true
                                ? `${toPlayer.name} mottar kort automatisk fra ${fromPlayer.name}.`
                                : (isRecipient
                                    ? `Motta ${countText} fra ${fromPlayer.name}.`
                                    : `Venter på at ${toPlayer.name} mottar kort fra ${fromPlayer.name}.`);
                            break;
                        case "Tilbud":
                            var fromRole = game.placementTitle(fromPlayer.lastPlacement).title;
                            var toRole = game.placementTitle(toPlayer.lastPlacement).title;
                            var sneakyAvailable = isSneakyTradeAvailable(game);
                            title.textContent = exchange.forcedAt != null
                                ? (isRecipient
                                    ? (sneakyAvailable
                                        ? `${fromPlayer.name} har tvunget et bytte. Godta vanlig bytte, eller godta med ureglementert samtykke.`
                                        : `${fromPlayer.name} har tvunget et bytte. Godta vanlig bytte med kort 7–J.`)
                                    : isSender
                                        ? `Venter på at ${toPlayer.name} godtar byttet.`
                                        : `${fromPlayer.name} har tvunget et bytte med ${toPlayer.name}.`)
                                : isSender
                                ? `Du som ${fromRole} kan tvinge bytte av kort mellom 7–J med ${toRole}.`
                                : `${fromPlayer.name} som ${fromRole} bestemmer om det blir bytte med ${toPlayer.name}.`;
                            if (isSneakyTradeAvailable(game) && exchange.forcedAt == null) {
                                title.textContent += " Om begge velger ureglementert bytte, kan alle kort byttes.";
                            }
                            break;
                        default:
                            title.textContent = exchange.text;
                            break;
                    }
                    element.appendChild(title);
                    var cardContainer = document.createElement("div");
                    cardContainer.className = "exchange-cards";
                    var exchangeStatus = document.createElement("span");
                    exchangeStatus.className = "exchange-status";
                    if (exchange.mode == "Velg" && isSender) {
                        exchangeStatus.textContent =
                            `${exchange.cards.length} av ${exchange.count} kort valgt.`;
                    } else if (exchange.mode == "Best" && isSender) {
                        exchangeStatus.textContent = "Kortene er valgt automatisk.";
                    } else if (exchange.mode == "Gitt") {
                        exchangeStatus.textContent = isSender
                            ? `Valget er sendt til ${toPlayer.name}.`
                            : "Venter på at byttet fullføres.";
                    } else if (exchange.mode == "Kan se") {
                        exchangeStatus.textContent = isRecipient
                            ? "Kortene er klare til å mottas."
                            : `Venter på at ${toPlayer.name} mottar kortene.`;
                    }
                    var buttonSpan = document.createElement("span");
                    if (exchange.mode == "Tilbud") {
                        element.classList.add("exchange--offer");
                        buttonSpan.className = "exchange-offer__actions";
                        var voters = exchange.sneakyVotes || [];
                        var canInitiate = isSender && exchange.forcedAt == null && !game.exchangeReady;
                        var participantIndex = currentPlayerIndex;
                        // The initiator sees Force, the consent tick box and No exchange; the receiver answers once forced.
                        if (canInitiate) {
                            var startButton = document.createElement("button");
                            startButton.type = "button";
                            startButton.textContent = "Tving bytte";
                            startButton.disabled = !(isSneakyTradeAvailable(game) &&
                                voters.includes(exchange.from)) &&
                                (!hasLegalTradeCard(game, exchange.from, exchange) ||
                                    !hasLegalTradeCard(game, exchange.to, exchange));
                            startButton.title = startButton.disabled
                                ? "Begge spillerne trenger minst ett ledig kort fra 7 til J."
                                : "";
                            startButton.onclick = function () {
                                game.startOptionalTrade(exchange);
                            };
                            buttonSpan.appendChild(startButton);
                        }
                        if (canInitiate && isSneakyTradeAvailable(game)) {
                            var sneakyCheck = document.createElement("button");
                            sneakyCheck.type = "button";
                            sneakyCheck.textContent = "Ureglementert samtykke";
                            sneakyCheck.className = "exchange-sneaky-check";
                            sneakyCheck.setAttribute("role", "checkbox");
                            sneakyCheck.setAttribute("aria-checked", String(voters.includes(participantIndex)));
                            sneakyCheck.onclick = function () {
                                game.toggleSneakyTrade(exchange, participantIndex);
                            };
                            buttonSpan.appendChild(sneakyCheck);
                        }
                        if (canInitiate) {
                            var skipButton = document.createElement("button");
                            skipButton.type = "button";
                            skipButton.textContent = "Ingen bytte";
                            skipButton.onclick = function () {
                                game.skipOptionalTrade(exchange, participantIndex);
                            };
                            buttonSpan.appendChild(skipButton);
                        }
                        if (exchange.forcedAt != null && isRecipient && !game.exchangeReady) {
                            for (const sneaky of isSneakyTradeAvailable(game) ? [false, true] : [false]) {
                                var responseButton = document.createElement("button");
                                responseButton.type = "button";
                                responseButton.textContent = sneaky ? "Godta med ureglementert samtykke" : "Godta bytte";
                                responseButton.onclick = () => game.respondToForcedTrade(exchange, participantIndex, sneaky);
                                buttonSpan.appendChild(responseButton);
                            }
                        }
                    } else {
                        var outgoingForSender = game.piles.filter(candidate =>
                            candidate.from == currentPlayerIndex && candidate.mode == "Velg"
                        );
                        if (isSender && exchange.mode == "Velg" && outgoingForSender.length > 1) {
                            var chooseButton = document.createElement("button");
                            chooseButton.type = "button";
                            chooseButton.textContent = activeExchangeId == getExchangeId(exchange)
                                ? `Valgt: til ${toPlayer.name}`
                                : `Velg bytte til ${toPlayer.name}`;
                            chooseButton.setAttribute("aria-pressed", String(activeExchangeId == getExchangeId(exchange)));
                            chooseButton.onclick = function () {
                                activeExchangeId = getExchangeId(exchange);
                                GameLayout.updateTable(game, player);
                                GameLayout.updateHand(game, player);
                            };
                            buttonSpan.appendChild(chooseButton);
                        }
                        if (exchange.kind == "playerTrade" && player != null && (isSender || isRecipient)) {
                            var tradeStatus = document.createElement("span");
                            tradeStatus.className = "trade-status";
                            tradeStatus.textContent = hasSneakyConsent(exchange, game)
                                ? "Ureglementert bytte: alle kort kan brukes."
                                : "Vanlig bytte: kort 7–J.";
                            exchangeStatus.appendChild(tradeStatus);
                            var consentCanChange = game.piles
                                .filter(candidate => candidate.tradeId == exchange.tradeId)
                                .every(candidate =>
                                    candidate.sneakyLocked !== true &&
                                    (candidate.cards || []).length == 0 &&
                                    candidate.mode == "Velg"
                                );
                            if (exchange.mode == "Velg" && isSender && consentCanChange && isSneakyTradeAvailable(game)) {
                                var sneakyButton = document.createElement("button");
                                var voters = exchange.sneakyVotes || [];
                                sneakyButton.type = "button";
                                sneakyButton.className = "exchange-sneaky-toggle";
                                sneakyButton.textContent = voters.includes(currentPlayerIndex)
                                    ? "Trekk ureglementert samtykke"
                                    : "Ureglementert bytte";
                                sneakyButton.setAttribute("aria-pressed", String(
                                    voters.includes(currentPlayerIndex)
                                ));
                                sneakyButton.onclick = function () {
                                    game.toggleSneakyTrade(exchange, currentPlayerIndex);
                                };
                                buttonSpan.appendChild(sneakyButton);
                            }
                        }
                        if (isRecipient && exchange.mode == "Kan se") {
                            var receiveButton = document.createElement("button");
                            receiveButton.type = "button";
                            receiveButton.textContent = `Motta fra ${fromPlayer.name}`;
                            receiveButton.onclick = function () {
                                game.receiveExchangeCards(exchange);
                            };
                            buttonSpan.appendChild(receiveButton);
                        }
                    }
                    if (exchange.mode == "Kan se" && (isSender || isRecipient) && exchange.cards) {
                        var previewCards = document.createElement("span");
                        previewCards.className = "exchange-preview";
                        exchange.cards.forEach(card => {
                            var previewModel = new Card(card.suit, card.rank);
                            previewCards.appendChild(GameLayout.createOwnedCardPreview(
                                previewModel, game, fromPlayer.name, "exchange-selection__card"));
                        });
                        cardContainer.appendChild(previewCards);
                    }
                    if (exchangeStatus.childElementCount > 0) {
                        cardContainer.appendChild(exchangeStatus);
                    }
                    if (buttonSpan.childElementCount > 0) {
                        cardContainer.appendChild(buttonSpan);
                    }
                    element.appendChild(cardContainer);
                    table.appendChild(element);
                });

                if (selectedExchange != null && player != null) {
                    var selectedRecipient = game.players[selectedExchange.to];
                    var isBestExchange = selectedExchange.mode == "Best";
                    if (selectedExchange.mode == "Velg" || isBestExchange) {
                        var confirmExchange = document.createElement("button");
                        confirmExchange.type = "button";
                        confirmExchange.className = "exchange-selection__confirm";
                        confirmExchange.textContent = "Gi kort";
                        confirmExchange.setAttribute("aria-label", `Gi kort til ${selectedRecipient.name}`);
                        confirmExchange.disabled = selectedExchange.cards.length != selectedExchange.count;
                        confirmExchange.onclick = function () {
                            var origins = GameLayout.capturePlayOrigins();
                            game.giveExchangeCards(selectedExchange);
                            GameLayout.animateGivenExchangeCards(game, selectedExchange, origins);
                        };
                        if (exchangeActions && !confirmExchange.disabled) {
                            exchangeActions.hidden = false;
                            exchangeActions.appendChild(confirmExchange);
                            if (!isBestExchange) {
                                var cancelExchange = document.createElement("button");
                                cancelExchange.type = "button";
                                cancelExchange.textContent = "Avbryt";
                                cancelExchange.onclick = function () {
                                    selectedExchange.cards = [];
                                    GameLayout.saveExchangeSelection(game, selectedExchange);
                                    GameLayout.updateTable(game, player);
                                    GameLayout.updateHand(game, player);
                                };
                                exchangeActions.appendChild(cancelExchange);
                            }
                        }
                    }
                }
                break;
            }
            case "S":
                table.className = "table-deck";
                this.clearTableContent(table, pileView && pileView.element);
                if (game.exchangeReady != null) {
                    var exchangeWaiting = document.createElement("p");
                    exchangeWaiting.className = "exchange-ready-hint";
                    exchangeWaiting.setAttribute("role", "status");
                    var waitingCount = new Set(GamePresence.exchangeGates(game).flatMap(gate =>
                        GamePresence.exchangeWaitingPlayers(game, GamePresence.now(), gate).filter(candidate =>
                            candidate != player || game.exchangeSummaryCompletedId != gate.id
                        ).map(candidate => GamePresence.playerId(candidate)))).size;
                    exchangeWaiting.textContent = waitingCount == 0 ? "Starter runden …" : waitingCount == 1
                        ? "Venter på 1 spiller …"
                        : `Venter på ${waitingCount} spillere …`;
                    table.appendChild(exchangeWaiting);
                }
                if (pileView != null) {
                    if (pileView.element.parentElement !== table) { table.appendChild(pileView.element); }
                    if (typeof CardDepth != "undefined") { CardDepth.prepareTable(pileView.element); }
                    if (shouldAnimatePlayedPause) {
                        var transitionPlay = displayPiles[displayPiles.length - 1];
                        var transitionElement = pileView.newlyPlayed.find(play =>
                            play.pile == transitionPlay
                        );
                        if (transitionElement != null) {
                            this.animatePlayedCards(
                                transitionElement.element,
                                transitionElement.pile,
                                playOrigins,
                                completePlayedAnimation
                            );
                        } else {
                            completePlayedAnimation();
                        }
                    } else if (shouldAnimateUntrackedPlays) {
                        window.requestAnimationFrame(() => {
                            pileView.newlyPlayed.forEach(play => {
                                this.animatePlayedCards(play.element, play.pile, playOrigins);
                            });
                        });
                    }
                }
                if (game.topPile() != null) {
                    var tableSummary = table._pileSummary || document.createElement("div");
                    if (!table._pileSummary) {
                        table._pileSummary = tableSummary;
                        tableSummary.onanimationstart = event => {
                            if (event.animationName == "table-guidance-fade-in" &&
                                tableSummary.classList.contains("table-pile-summary--required")) {
                                table._beatPulseStartsAt = performance.now() + 5000;
                                this.syncRequiredPilePulse(table);
                            }
                        };
                    }
                    tableSummary.hidden = false;
                    tableSummary.className = "table-pile-summary";
                    var mustBeatPile = player != null && player.turn == 1;
                    tableSummary.classList.toggle("table-pile-summary--required", mustBeatPile);
                    tableSummary.textContent = mustBeatPile
                        ? `Du må slå: ${describeRequiredPlay(game)}`
                        : `På bordet ligger: ${describeRequiredPlay(game)}`;
                    tableSummary.title = tableSummary.textContent;
                    var topPile = game.topPile();
                    var pulseKey = mustBeatPile
                        ? `${game.id}:${game.round}:${player.name}:${game.piles.length}:${topPile.name}:${topPile.map(card => `${card.suit}:${card.rank}`).join(",")}`
                        : null;
                    if (table._beatPulseKey != pulseKey) {
                        table._beatPulseKey = pulseKey;
                        table._beatPulseStartsAt = performance.now() + 6000;
                    }
                    if (tableSummary.parentElement != table) { table.appendChild(tableSummary); }
                    this.syncRequiredPilePulse(table);
                }
                if (isNewPause && !shouldAnimatePlayedPause && !isAnimatingPlayedPause) {
                    this.flashClubThree(game, table, pauseId);
                }
                break;
            case "F":
                table.className = "table-explanation";
                this.clearTableContent(table);
                var gameOver = document.createElement("section");
                gameOver.className = "game-over";
                var heading = document.createElement("h2");
                heading.textContent = "Resultater";
                gameOver.appendChild(heading);
                var standings = document.createElement("ol");
                standings.className = "game-over__standings";
                var gameOverAnimationId = String(game.id);
                var animateStandings = table.dataset.gameOverAnimationId != gameOverAnimationId;
                table.dataset.gameOverAnimationId = gameOverAnimationId;
                game.players.slice()
                    .sort((a, b) => a.placement - b.placement)
                    .forEach((standingPlayer, index) => {
                        var row = document.createElement("li");
                        row.className = "game-over__standing";
                        row.classList.toggle("game-over__standing--self", standingPlayer === player);
                        if (animateStandings) {
                            row.classList.add("game-over__standing--enter");
                            row.style.animationDelay = `${index * 90}ms`;
                        }
                        var rank = document.createElement("span");
                        rank.className = "game-over__rank";
                        var rankNumber = document.createElement("span");
                        rankNumber.className = "game-over__rank-number";
                        rankNumber.textContent = `${standingPlayer.placement}.`;
                        rank.appendChild(rankNumber);
                        var positionIcon = resultIconForPlacement(game, standingPlayer.placement, standingPlayer);
                        if (positionIcon != null) {
                            var rankIcon = document.createElement("span");
                            rankIcon.className = "game-over__standing-icon";
                            rankIcon.textContent = positionIcon;
                            rankIcon.setAttribute("aria-hidden", "true");
                            rank.appendChild(rankIcon);
                        }
                        var rankTitle = document.createElement("span");
                        rankTitle.textContent = game.placementTitle(standingPlayer.placement).title;
                        rank.appendChild(rankTitle);
                        var name = document.createElement("span");
                        name.className = "game-over__name";
                        var nameLabel = document.createElement("span");
                        nameLabel.textContent = standingPlayer.name;
                        this.enableNameExpansion(nameLabel);
                        name.appendChild(nameLabel);
                        if (standingPlayer === player) {
                            var youLabel = document.createElement("span");
                            youLabel.className = "game-over__you";
                            youLabel.textContent = "Du";
                            name.appendChild(youLabel);
                        }
                        row.append(rank, name);
                        standings.appendChild(row);
                    });
                gameOver.appendChild(standings);
                if (game.gameEndVote != null && game.gameEndVote.started !== true) {
                    var endVotePanel = document.createElement("section");
                    endVotePanel.className = "round-start-vote game-end-vote";
                    var endVoteHeading = document.createElement("strong");
                    endVoteHeading.textContent = "Hva vil dere gjøre videre?";
                    var humanVoters = game.players.filter(voter => !GamePresence.isBot(game, voter));
                    var humanIds = new Set(humanVoters.map(roundVotePlayerId));
                    var endVotes = new Map();
                    (Array.isArray(game.gameEndVote.votes) ? game.gameEndVote.votes : [])
                        .forEach(vote => {
                            if (humanIds.has(vote.playerId) &&
                                (vote.choice == "lobby" || vote.choice == "next_round")) {
                                endVotes.set(vote.playerId, vote.choice);
                            }
                        });
                    var endVoteSummary = document.createElement("span");
                    endVoteSummary.className = "round-start-vote__summary";
                    if (game.gameEndVote.result != null) {
                        endVoteSummary.textContent = game.gameEndVote.result == "lobby"
                            ? "Flertallet valgte lobbyen."
                            : "Flertallet valgte neste runde.";
                    } else {
                        endVoteSummary.id = "gameEndVoteCountdown";
                        endVoteSummary.textContent =
                            `${endVotes.size} av ${humanVoters.length} menneskespillere har stemt.`;
                    }
                    endVotePanel.append(endVoteHeading, endVoteSummary);
                    if (game.gameEndVote.result == null) {
                        var canVote = player != null && player.playerKey != "PC" && humanVoters.includes(player);
                        var endVoteChoices = document.createElement("div");
                        endVoteChoices.className = "round-start-vote__choices game-end-vote__choices";
                        var playerVoteId = canVote ? roundVotePlayerId(player) : null;
                        var lobbyVote = document.createElement("button");
                        lobbyVote.type = "button";
                        lobbyVote.disabled = !canVote;
                        lobbyVote.textContent = "Lobby";
                        var waitingCount = Object.keys(game.waitingSpectators || {}).length;
                        lobbyVote.classList.toggle("has-waiting-player", waitingCount > 0);
                        if (waitingCount > 0) {
                            lobbyVote.title = "En spiller har blitt med og venter på plass. Gå til lobbyen for å ta spilleren med.";
                            var waitingHint = document.createElement("small");
                            waitingHint.className = "lobby-waiting-hint";
                            waitingHint.textContent = lobbyVote.title;
                            waitingHint.id = "lobbyWaitingHint";
                            lobbyVote.setAttribute("aria-describedby", waitingHint.id);
                            endVotePanel.appendChild(waitingHint);
                        }
                        lobbyVote.setAttribute("aria-pressed", String(endVotes.get(playerVoteId) == "lobby"));
                        lobbyVote.onclick = function () {
                            game.submitGameEndVote(player, "lobby");
                        };
                        var nextRoundVote = document.createElement("button");
                        nextRoundVote.type = "button";
                        nextRoundVote.disabled = !canVote;
                        nextRoundVote.textContent = "Neste runde";
                        nextRoundVote.setAttribute("aria-pressed", String(endVotes.get(playerVoteId) == "next_round"));
                        nextRoundVote.onclick = function () {
                            game.submitGameEndVote(player, "next_round");
                        };
                        endVoteChoices.append(
                            GameLayout.voteChoice(lobbyVote, humanVoters.filter(voter =>
                                endVotes.get(roundVotePlayerId(voter)) == "lobby")),
                            GameLayout.voteChoice(nextRoundVote, humanVoters.filter(voter =>
                                endVotes.get(roundVotePlayerId(voter)) == "next_round"))
                        );
                        endVotePanel.appendChild(endVoteChoices);
                    }
                    gameOver.appendChild(endVotePanel);
                } else if (game.roundStartVote != null) {
                    var votePanel = document.createElement("section");
                    votePanel.className = "round-start-vote";
                    var voteHeading = document.createElement("strong");
                    voteHeading.textContent = "Skal neste runde starte med alle Nøytrale?";
                    var humanVoters = game.players.filter(voter => !GamePresence.isBot(game, voter));
                    var humanIds = new Set(humanVoters.map(roundVotePlayerId));
                    var voteMap = new Map();
                    (Array.isArray(game.roundStartVote.votes) ? game.roundStartVote.votes : [])
                        .forEach(playerVote => {
                            if (humanIds.has(playerVote.playerId)) {
                                voteMap.set(playerVote.playerId, playerVote.neutral === true);
                            }
                        });
                    var voteSummary = document.createElement("span");
                    voteSummary.className = "round-start-vote__summary";
                    if (game.roundStartVote.result != null) {
                        voteSummary.textContent = game.roundStartVote.result == "neutral"
                            ? "Flertallet valgte at alle starter Nøytrale."
                            : "Flertallet valgte vanlig plassering.";
                    } else {
                        voteSummary.id = "roundStartVoteCountdown";
                        voteSummary.textContent =
                            `${voteMap.size} av ${humanVoters.length} menneskespillere har stemt.`;
                    }
                    votePanel.append(voteHeading, voteSummary);
                    if (game.roundStartVote.result == null) {
                        var canVote = player != null && player.playerKey != "PC" && humanVoters.includes(player);
                        var voteChoices = document.createElement("div");
                        voteChoices.className = "round-start-vote__choices";
                        var votePlayerId = canVote ? roundVotePlayerId(player) : null;
                        var normalVote = document.createElement("button");
                        normalVote.type = "button";
                        normalVote.disabled = !canVote;
                        normalVote.textContent = "Fortsett";
                        normalVote.setAttribute("aria-pressed", String(voteMap.get(votePlayerId) === false));
                        normalVote.onclick = function () {
                            game.submitNeutralRoundVote(player, false);
                        };
                        var neutralVote = document.createElement("button");
                        neutralVote.type = "button";
                        neutralVote.disabled = !canVote;
                        neutralVote.textContent = "Alle nøytrale";
                        neutralVote.setAttribute("aria-pressed", String(voteMap.get(votePlayerId) === true));
                        neutralVote.onclick = function () {
                            game.submitNeutralRoundVote(player, true);
                        };
                        voteChoices.append(
                            GameLayout.voteChoice(normalVote, humanVoters.filter(voter =>
                                voteMap.get(roundVotePlayerId(voter)) === false)),
                            GameLayout.voteChoice(neutralVote, humanVoters.filter(voter =>
                                voteMap.get(roundVotePlayerId(voter)) === true))
                        );
                        votePanel.appendChild(voteChoices);
                    }
                    gameOver.appendChild(votePanel);
                } else if (game.gameEndVote != null) {
                    var nextStepWaiting = document.createElement("span");
                    nextStepWaiting.className = "round-start-vote__summary";
                    nextStepWaiting.textContent = "Starter valgt neste steg …";
                    gameOver.appendChild(nextStepWaiting);
                } else {
                    var voteWaiting = document.createElement("span");
                    voteWaiting.className = "round-start-vote__summary";
                    voteWaiting.textContent = "Klargjør avstemning …";
                    gameOver.appendChild(voteWaiting);
                }
                if (game.gameEndVote != null || game.roundStartVote != null) {
                    var voteHint = document.createElement("small");
                    voteHint.className = "round-start-vote__hint";
                    voteHint.textContent = "Flertallet bestemmer. Verten avgjør ved uavgjort.";
                    gameOver.appendChild(voteHint);
                }
                table.appendChild(gameOver);
                break;
            default:
                throw ("Ukent status.");
                break;
        }
        this.keepTurnTimer(table);
    }
    static clearTableContent(table, retainedPile = null) {
        if (table._pileSummary) { table._pileSummary.hidden = true; }
        if (table._pileCount && retainedPile == null) { table._pileCount.hidden = true; }
        if (this.turnTimerElement && this.turnTimerElement.parentElement &&
            this.turnTimerElement.parentElement.id == "tableStatusDock") {
            table._statusDock = this.turnTimerElement.parentElement;
        }
        if (!table.children) {
            if (typeof table.replaceChildren == "function") { table.replaceChildren(); }
            else { table.innerHTML = ""; }
            return;
        }
        var persistent = new Set([this.toastRegion, this.turnTimerElement, this.tableTurnHint, table._pileSummary,
            table._pileCount, table._statusDock, retainedPile]);
        var dynamic = Array.from(table.children).filter(element => !persistent.has(element));
        if (typeof CardDepth != "undefined") {
            dynamic.forEach(element => {
                CardDepth.stopObservingFoils(element);
                element.querySelectorAll(".has-card-depth").forEach(card => CardDepth.detach(card));
            });
        }
        if (table._tablePileView && table._tablePileView.element !== retainedPile) { delete table._tablePileView; }
        if (dynamic.every(element => typeof element.remove == "function")) {
            dynamic.forEach(element => element.remove());
        } else if (typeof table.replaceChildren == "function") {
            table.replaceChildren(...Array.from(table.children).filter(element => persistent.has(element)));
        } else {
            table.innerHTML = "";
        }
    }
    static syncRequiredPilePulse(table) {
        var delay = (table._beatPulseStartsAt || performance.now() + 6000) - performance.now();
        table.querySelectorAll(".table-play__beat-outline").forEach(outline => {
            outline.style.animationDelay = `${delay}ms`;
            // The remaining delay is relative to now, not to when this card was created.
            if (typeof outline.getAnimations == "function") {
                outline.getAnimations().forEach(animation => { animation.currentTime = 0; });
            }
        });
    }
    static setTableContent(table, html) {
        this.clearTableContent(table);
        if (typeof table.insertAdjacentHTML == "function") {
            table.insertAdjacentHTML("afterbegin", html);
        } else {
            table.innerHTML = html;
        }
    }
    static keepTurnTimer(table) {
        if (this.toastRegion != null && this.toastRegion.parentElement != table &&
            typeof table.appendChild == "function") {
            table.appendChild(this.toastRegion);
        }
        if (this.tableTurnHint != null && this.tableTurnHint.parentElement != table &&
            typeof table.appendChild == "function") {
            table.appendChild(this.tableTurnHint);
        }
        var statusDock = table._statusDock;
        if (statusDock && statusDock.parentElement !== table && typeof table.appendChild == "function") {
            table.appendChild(statusDock);
        }
        if (this.turnTimerElement != null &&
            this.turnTimerElement.parentElement != (statusDock || table) &&
            typeof table.appendChild == "function") {
            (statusDock || table).appendChild(this.turnTimerElement);
        }
    }
});
