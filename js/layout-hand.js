// GameLayout: The player's hand: rendering, pointer gestures, reflow and scrolling.
GameLayout.extend(class {
    // Describes everything the hand rendering depends on during play, so an
    // unchanged hand can be kept in the DOM across snapshots. Null means "always rebuild".
    static handSignature(game, player) {
        if (game == null || player == null || game.status != "S") { return null; }
        var keyOf = card => `${card.suit}:${card.rank}`;
        return [
            game.id,
            game.round,
            game.turn,
            player.name,
            player.placement,
            player.turn,
            game.isTurnPaused() ? 1 : 0,
            game.connectionOnline === false ? 0 : 1,
            GamePresence.isBot(game, player) ? 1 : 0,
            game.piles.map(pile => `${pile.strengthRank}/${pile.map(keyOf).join(",")}`).join("|"),
            player.cards.map(keyOf).join(","),
            Array.from(selectedCardKeys).join(","),
            selectedCardStrength,
            Array.from(autoSuggestedCardKeys).join(","),
            autoSuggestPlayableCards ? 1 : 0,
            GameLayout.cardStyle(),
            GameLayout.cardFoil(),
            GameLayout.playInputMode()
        ].join(";");
    }
    static updateHand(game, player, centerCardKey = null, allowSkip = false) {
        var element = document.getElementById("playerHand");
        element.ondragstart = function (event) {
            event.preventDefault();
        };
        if (allowSkip && centerCardKey == null && element._handSignature &&
            element._handSignature == GameLayout.handSignature(game, player)) {
            // Same hand: keep the DOM and only point the existing handlers at the fresh objects.
            element._rebindHand(game, player);
            return;
        }
        if (allowSkip && game != null && player != null && element._rebindHand &&
            element._handGestureActive && element._handGestureActive() &&
            element._handOwner == `${game.id}:${player.name}`) {
            // Rebuilding would cancel the drag and snap the card back mid-flick. Finish
            // the gesture against the fresh state, then render once it ends.
            element._rebindHand(game, player);
            element._deferredHandUpdate = { game, player };
            return;
        }
        element._deferredHandUpdate = null;
        element._handGestureActive = null;
        element._handOwner = null;
        element._handSignature = null;
        element._rebindHand = null;
        element.classList.remove("is-dealing-in");
        clearCardDragPreview(element);
        if (element.onpointercancel) { element.onpointercancel(); }
        cancelCardDragPreparation(element);
        var previousScrollLeft = element.scrollLeft;
        var shouldCenterAutoSelection = false;
        var autoCenterTurnKey = null;
        var autoCenterCardKeys = [];
        var shouldScrollToLowestCards = false;
        var lowestCardTurnKey = null;
        var lowestCardKeys = [];
        var previouslySelectedCardKeys = new Set(
            Array.from(element.querySelectorAll(".game-card.is-selected"))
                .map(card => card.dataset.cardKey)
        );
        var selectionCount = document.getElementById("selectedCardCount");
        var passButton = document.getElementById("passButton");
        var playButton = document.getElementById("playButton");
        playButton.hidden = true;
        playButton.disabled = true;
        playButton.onclick = null;
        var previousHandOwner = selectedCardOwner;
        var previousCardBounds = this.captureHandCardBounds(element);
        if (typeof CardDepth != "undefined") { CardDepth.stopObservingFoils(element); }
        element.innerHTML = "";
        if (player == null || game == null) {
            stopCardHandInertia();
            clearCardSelection();
            selectedCardOwner = null;
            activeExchangeId = null;
            autoSelectedTurnKey = null;
            autoScrollEmptyTurnKey = null;
            if (selectionCount) { selectionCount.textContent = ""; }
            passButton.classList.remove("pass-needs-action");
            element.classList.remove("HasHandSelection");
            element.classList.remove("is-hand-dragging");
            element.onpointerdown = null;
            element.onpointermove = null;
            element.onpointerup = null;
            element.onpointercancel = null;
            element.onpointerleave = null;
            element.onlostpointercapture = null;
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
            autoScrollEmptyTurnKey = null;
        }
        element._handOwner = ownerKey;
        var handScrollDrag = null;
        element._handGestureActive = () => handScrollDrag != null;
        var flushDeferredHandUpdate = function () {
            var deferred = element._deferredHandUpdate;
            if (!deferred || handScrollDrag) { return; }
            element._deferredHandUpdate = null;
            GameLayout.updateHand(deferred.game, deferred.player, null, true);
        };
        var selectExchangeCard = null;
        var restorePointerSelection = function (drag) {
            if (!drag.selectionBeforeDrag || drag.selectionRestored) { return; }
            clearCardSelection();
            drag.selectionBeforeDrag.forEach(key => selectedCardKeys.add(key));
            drag.suggestionsBeforeDrag.forEach(key => autoSuggestedCardKeys.add(key));
            selectedCardStrength = drag.strengthBeforeDrag;
            drag.selectionRestored = true;
        };
        var recordFlickMovement = function (drag, pointerX, pointerY, moveTime) {
            var deltaX = pointerX - drag.lastPointerX;
            var deltaY = pointerY - drag.lastPointerY;
            var intent = drag.flickIntent;
            if (intent) {
                var finishX = pointerX - intent.endX;
                var finishY = pointerY - intent.endY;
                var reverseDistance = -(finishX * intent.x - finishY * intent.y) / intent.distance;
                if (moveTime - intent.time > CARD_FLICK_RELEASE_GRACE_MS ||
                    finishY > CARD_FLICK_RECOIL_TOLERANCE ||
                    reverseDistance > CARD_FLICK_RECOIL_TOLERANCE ||
                    (Math.hypot(finishX, finishY) > CARD_FLICK_RECOIL_TOLERANCE &&
                        !isUpwardFlick(finishX, -finishY))) {
                    drag.flickIntent = null;
                }
            }
            if (deltaX == 0 && deltaY == 0 &&
                moveTime - drag.lastPointerMoveTime > 80) {
                drag.flickSamples = [];
                drag.flickDirection = 0;
                drag.flickExtremeY = pointerY;
            }
            if (deltaX != 0 || deltaY != 0) {
                var elapsed = Math.max(1, moveTime - drag.lastPointerMoveTime);
                drag.velocityX = drag.velocityX * 0.35 + deltaX / elapsed * 0.65;
                drag.velocityY = drag.velocityY * 0.35 + deltaY / elapsed * 0.65;
                drag.lastMotionTime = moveTime;
            }
            var distance = drag.lastPointerY - pointerY;
            if (deltaX != 0 || distance != 0) {
                var direction = Math.sign(distance) || drag.flickDirection;
                var extremeY = drag.flickExtremeY ?? drag.lastPointerY;
                // Sub-threshold recoil must not split a short, not-yet-recognized stroke.
                if (direction != drag.flickDirection &&
                    (drag.flickDirection == 0 ||
                        (pointerY - extremeY) * drag.flickDirection > CARD_FLICK_RECOIL_TOLERANCE)) {
                    drag.flickDirection = direction;
                    drag.flickSamples = [];
                    extremeY = drag.lastPointerY;
                }
                drag.flickExtremeY = drag.flickDirection > 0
                    ? Math.min(extremeY, pointerY) : Math.max(extremeY, pointerY);
                var samples = drag.flickSamples;
                if (samples.length == 0) {
                    samples.push({ x: drag.lastPointerX, y: drag.lastPointerY, time: drag.lastPointerMoveTime });
                }
                samples.push({ x: pointerX, y: pointerY, time: moveTime });
                // Only the recent finish matters, not a slow pickup or the earlier part of a curve.
                var cutoff = moveTime - 80;
                while (samples.length > 2 && samples[1].time <= cutoff) { samples.shift(); }
                var first = samples[0];
                var next = samples[1];
                var startTime = Math.max(first.time, cutoff);
                var fraction = (next.time > first.time)
                    ? Math.max(0, Math.min(1, (startTime - first.time) / (next.time - first.time)))
                    : 0;
                var startX = first.x + (next.x - first.x) * fraction;
                var startY = first.y + (next.y - first.y) * fraction;
                for (var i = samples.length - 2; i >= 0; i--) {
                    var sample = samples[i];
                    if (sample.time < cutoff) { break; }
                    if (Math.hypot(pointerX - sample.x, pointerY - sample.y) >= CARD_FLICK_MIN_DISTANCE) {
                        startX = sample.x;
                        startY = sample.y;
                        startTime = sample.time;
                        break;
                    }
                }
                drag.lastFlickX = pointerX - startX;
                drag.lastFlickY = startY - pointerY;
                drag.lastFlickDistance = Math.hypot(drag.lastFlickX, drag.lastFlickY);
                drag.lastFlickVelocity = drag.lastFlickDistance /
                    Math.max(1, moveTime - startTime);
                drag.lastFlickMoveTime = moveTime;
                if (distance > 0 && pointerY <= extremeY &&
                    isUpwardFlick(drag.lastFlickX, drag.lastFlickY) &&
                    drag.lastFlickDistance >= CARD_FLICK_MIN_DISTANCE &&
                    drag.lastFlickVelocity >= CARD_FLICK_MIN_VELOCITY) {
                    // Keep a recognized flick through tiny lift-off recoil, not a deliberate reversal.
                    drag.flickIntent = {
                        x: drag.lastFlickX, y: drag.lastFlickY,
                        distance: drag.lastFlickDistance, velocity: drag.lastFlickVelocity,
                        time: moveTime, endX: pointerX, endY: pointerY
                    };
                }
            }
            drag.lastPointerY = pointerY;
            drag.lastPointerX = pointerX;
            drag.lastPointerMoveTime = moveTime;
        };
        element.classList.remove("is-hand-dragging");
        element.classList.remove("hand-finished");
        element.onclick = function (event) {
            if (suppressNextCardClick) {
                suppressNextCardClick = false;
                return;
            }
            if (!(event.target instanceof Element) ||
                event.target.closest("button") ||
                selectedCardKeys.size == 0) {
                return;
            }
            clearCardSelection();
            GameLayout.updateHand(game, player);
        };
        element.onpointerdown = function (event) {
            // A resting thumb elsewhere on the screen makes the flicking finger non-primary.
            if (event.button != 0 ||
                (handScrollDrag && handScrollDrag.pointerId != event.pointerId)) {
                return;
            }
            // Same pointer pressing again means its previous gesture never ended cleanly.
            if (handScrollDrag) { element.onpointercancel(); }
            stopCardHandInertia();
            var downTime = pointerEventTime(event);
            var returningTarget = returningCardDragTarget(element, event.target);
            var cardElement = (event.target instanceof Element)
                ? event.target.closest(".game-card")
                : null;
            if (returningTarget && returningTarget.onPreview) {
                // Until it is caught, a press on the gliding card counts as one on its hand slot.
                cardElement = handCardElement(element, returningTarget.hitKey);
            }
            var card = cardElement
                ? player.cards.find(candidate =>
                    `${candidate.suit}:${candidate.rank}` == cardElement.dataset.cardKey
                )
                : null;
            if (cardElement) {
                cardElement.classList.add("is-pressed");
            }
            handScrollDrag = {
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                startX: event.clientX,
                startY: event.clientY,
                lastPointerY: event.clientY,
                lastPointerX: event.clientX,
                velocityX: 0, velocityY: 0, lastMotionTime: downTime,
                lastPointerMoveTime: downTime,
                flickDirection: 0,
                flickSamples: [],
                lastFlickDistance: 0,
                lastFlickVelocity: 0,
                lastX: event.clientX,
                previewStartX: event.clientX,
                previewStartY: event.clientY,
                startTime: Date.now(),
                lastMoveTime: performance.now(),
                startScrollLeft: element.scrollLeft,
                scrollVelocity: 0,
                scrollSamples: [{ x: element.scrollLeft, time: performance.now() }],
                axis: null,
                cardElement: cardElement,
                card: card,
                isSelectedCard: cardElement != null &&
                    selectedCardKeys.has(cardElement.dataset.cardKey),
                canSwipeToPlay: GameLayout.playInputMode() != "button" && game.status == "S" && isPlayingTurn,
                canDragToPlay: game.status == "S" && isPlayingTurn &&
                    (GameLayout.playInputMode() != "button" || event.pointerType == "mouse") &&
                    !game.localWritePending && game.connectionOnline !== false && !GamePresence.isBot(game, player),
                didMove: false,
                didPlayDrag: false,
                canPlay: false,
                selectionBeforeDrag: Array.from(selectedCardKeys),
                suggestionsBeforeDrag: Array.from(autoSuggestedCardKeys),
                strengthBeforeDrag: selectedCardStrength
            };
            var caught = null;
            if (returningTarget && card && handScrollDrag.canDragToPlay) {
                var caughtCards = returningTarget.keys.map(key =>
                    player.cards.find(candidate => `${candidate.suit}:${candidate.rank}` == key));
                if (caughtCards.every(caughtCard => caughtCard != null) && canPlayCaughtCards(caughtCards)) {
                    caught = catchReturningCardDrag(element, returningTarget, event);
                }
                if (caught) {
                    clearCardSelection();
                    selectedCardStrength = caughtCards[0].strengthRank;
                    returningTarget.keys.forEach(key => selectedCardKeys.add(key));
                    // The card is already in the air: keep dragging it from where it was caught.
                    Object.assign(handScrollDrag, {
                        axis: "vertical", didMove: true, didPlayDrag: true, canPlay: true,
                        isSelectedCard: true,
                        previewStartX: event.clientX - caught.x,
                        previewStartY: event.clientY - caught.y
                    });
                }
            }
            if (!caught && card && handScrollDrag.canDragToPlay) {
                handScrollDrag.canPlay = selectCardsForSwipe(card);
                if (event.pointerType == "mouse" &&
                    (handScrollDrag.canPlay || handScrollDrag.isSelectedCard)) {
                    startCardDragPreview(element, event);
                }
            }
            if (cardElement && typeof cardElement.setPointerCapture == "function") {
                cardElement.setPointerCapture(event.pointerId);
            } else if (typeof element.setPointerCapture == "function") {
                element.setPointerCapture(event.pointerId);
            }
        };
        element.onpointermove = function (event) {
            if (!handScrollDrag) {
                return;
            }
            if (handScrollDrag.pointerId != event.pointerId) { return; }
            // Browsers merge fast touch moves into one event per frame; the merged samples
            // keep a short flick's speed and direction intact.
            var flickEvents = typeof event.getCoalescedEvents == "function"
                ? event.getCoalescedEvents() : [];
            if (!flickEvents || flickEvents.length == 0) { flickEvents = [event]; }
            flickEvents.forEach(sample => recordFlickMovement(
                handScrollDrag, sample.clientX, sample.clientY, pointerEventTime(sample)));
            var dragOffsetX = event.clientX - handScrollDrag.startX;
            var dragOffsetY = event.clientY - handScrollDrag.startY;
            if (handScrollDrag.axis == null &&
                Math.max(Math.abs(dragOffsetX), Math.abs(dragOffsetY)) >= 8) {
                if (handScrollDrag.pointerType == "mouse" && handScrollDrag.card != null &&
                    handScrollDrag.canDragToPlay) {
                    handScrollDrag.axis = "vertical";
                } else {
                    handScrollDrag.axis = cardTouchDragAxis(dragOffsetX, dragOffsetY);
                }
                handScrollDrag.didMove = true;
            }
            if (handScrollDrag.axis == "horizontal") {
                restorePointerSelection(handScrollDrag);
                clearCardDragPreview(element);
                event.preventDefault();
                element.classList.add("is-hand-dragging");
                var moveTime = performance.now();
                var previousScroll = element.scrollLeft;
                var maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
                element.scrollLeft = Math.max(0, Math.min(maxScroll,
                    previousScroll - (event.clientX - handScrollDrag.lastX)));
                if (element.scrollLeft != previousScroll) {
                    var samples = handScrollDrag.scrollSamples;
                    samples.push({ x: element.scrollLeft, time: moveTime });
                    var cutoff = moveTime - 80;
                    while (samples.length > 2 && samples[1].time <= cutoff) { samples.shift(); }
                    var first = samples[0];
                    var next = samples[1];
                    var startTime = Math.max(first.time, cutoff);
                    var fraction = next.time > first.time
                        ? Math.max(0, Math.min(1, (startTime - first.time) / (next.time - first.time))) : 0;
                    var startX = first.x + (next.x - first.x) * fraction;
                    handScrollDrag.scrollVelocity = Math.max(-2.4, Math.min(2.4,
                        (element.scrollLeft - startX) / Math.max(1, moveTime - startTime)));
                    handScrollDrag.lastMoveTime = moveTime;
                } else if (event.clientX != handScrollDrag.lastX) {
                    handScrollDrag.scrollVelocity = 0;
                    handScrollDrag.scrollSamples = [{ x: element.scrollLeft, time: moveTime }];
                }
                handScrollDrag.lastX = event.clientX;
                if (handScrollDrag.cardElement) {
                    resetCardTilt(handScrollDrag.cardElement);
                }
                return;
            }
            if (handScrollDrag.axis == "vertical" &&
                handScrollDrag.canDragToPlay &&
                handScrollDrag.card != null) {
                if (!handScrollDrag.didPlayDrag) {
                    handScrollDrag.didPlayDrag = true;
                    if (!element._cardDragPreview &&
                        (handScrollDrag.canPlay || handScrollDrag.isSelectedCard)) {
                        startCardDragPreview(element, {
                            clientX: handScrollDrag.startX, clientY: handScrollDrag.startY
                        });
                    }
                }
                if (handScrollDrag.canPlay) {
                    event.preventDefault();
                    moveCardDragPreview(element, event, handScrollDrag.previewStartX, handScrollDrag.previewStartY);
                }
            }
            if (handScrollDrag.axis == null && element._cardDragPreview) {
                moveCardDragPreview(element, event, handScrollDrag.previewStartX, handScrollDrag.previewStartY);
            }
        };
        element.onpointerup = function (event) {
            var activeDrag = handScrollDrag;
            if (!activeDrag || activeDrag.pointerId != event.pointerId) { return; }
            if (event.clientX != activeDrag.lastPointerX || event.clientY != activeDrag.lastPointerY) {
                element.onpointermove(event);
            }
            var pointerUpTime = pointerEventTime(event);
            recordFlickMovement(activeDrag, event.clientX, event.clientY, pointerUpTime);
            flushCardDragPosition(element);
            handScrollDrag = null;
            element.classList.remove("is-hand-dragging");
            if (activeDrag.didMove) {
                suppressNextCardClick = true;
                window.setTimeout(function () {
                    suppressNextCardClick = false;
                }, 0);
            }
            var keepDragPosition = false;
            if (activeDrag.card != null && shouldPlayCardDrag(activeDrag, event)) {
                if ((activeDrag.didPlayDrag && activeDrag.canPlay) ||
                    (!activeDrag.didPlayDrag &&
                        activeDrag.card != null &&
                        selectCardsForSwipe(activeDrag.card))) {
                    keepDragPosition = playSelectedCards(GameLayout.cardThrowMotion(activeDrag, event, element));
                } else {
                    showInvalidCardWarning(game);
                }
            }
            if (activeDrag.axis == "horizontal") {
                var releaseDelay = performance.now() - activeDrag.lastMoveTime;
                startCardHandInertia(
                    element,
                    activeDrag.scrollVelocity * Math.exp(-releaseDelay / 90)
                );
            }
            if (!keepDragPosition) {
                clearDragStyles();
                if (!activeDrag.didMove) {
                    restorePointerSelection(activeDrag);
                    clearCardDragPreview(element);
                } else {
                    returnCardDragPreview(element);
                }
            } else {
                clearCardDragPreview(element);
            }
            if (activeDrag.cardElement) {
                activeDrag.cardElement.classList.remove("is-pressed");
                resetCardTilt(activeDrag.cardElement);
            }
            flushDeferredHandUpdate();
            if (isPlayingTurn && !keepDragPosition) { scheduleCardDragPreparation(element); }
        };
        element.onpointercancel = function () {
            if (handScrollDrag) { restorePointerSelection(handScrollDrag); }
            if (handScrollDrag && handScrollDrag.cardElement) {
                handScrollDrag.cardElement.classList.remove("is-pressed");
                resetCardTilt(handScrollDrag.cardElement);
            }
            handScrollDrag = null;
            element.classList.remove("is-hand-dragging");
            clearDragStyles();
            clearCardDragPreview(element);
            flushDeferredHandUpdate();
            if (isPlayingTurn) { scheduleCardDragPreparation(element); }
        };
        element.onlostpointercapture = function (event) {
            if (handScrollDrag && handScrollDrag.pointerId == event.pointerId) { element.onpointercancel(); }
        };
        element.onpointerleave = function () {
            if (handScrollDrag) { return; }
            element.querySelectorAll(".game-card.is-tilting").forEach(resetCardTilt);
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
        var displayedExchange = activeExchange || (game.status == "G"
            ? game.piles.find(exchange => exchange.mode == "Best" &&
                game.players[exchange.from] == player)
            : null);
        if (activeExchange) {
            selectExchangeCard = function (card) {
                if (game.localWritePending) { return; }
                if (activeExchange.cards.length == activeExchange.count) {
                    activeExchange.cards = [];
                    GameLayout.saveExchangeSelection(game, activeExchange);
                    GameLayout.updateTable(game, player);
                    GameLayout.updateHand(game, player);
                    return;
                }
                var selectedIndex = activeExchange.cards.findIndex(selectedCard =>
                    selectedCard.suit == card.suit && selectedCard.rank == card.rank
                );
                if (selectedIndex >= 0) {
                    activeExchange.cards.splice(selectedIndex, 1);
                } else {
                    var stillAvailable = getAvailableExchangeCards(
                        game,
                        game.players.indexOf(player),
                        activeExchange
                    ).some(availableCard =>
                        availableCard.suit == card.suit && availableCard.rank == card.rank
                    );
                    if (!stillAvailable ||
                        activeExchange.cards.length >= activeExchange.count ||
                        !isCardAllowedForExchange(activeExchange, card, game)) {
                        return;
                    }
                    activeExchange.cards.push(card);
                }
                GameLayout.saveExchangeSelection(game, activeExchange);
                GameLayout.updateTable(game, player);
                GameLayout.updateHand(game, player);
            };
        }
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
            autoScrollEmptyTurnKey = null;
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
                var suggestionApplied = false;
                if (topPile == null) {
                    var lowestHandStrength = autoSuggestPlayableCards
                        ? chooseSuggestedPlayStrength(player, null, playableStrengths, 1)
                        : Math.min(...player.cards.map(card => card.strengthRank));
                    lowestCardKeys = player.cards
                        .filter(card => card.strengthRank == lowestHandStrength)
                        .map(card => `${card.suit}:${card.rank}`);
                    shouldScrollToLowestCards = lowestCardKeys.length > 0;
                    lowestCardTurnKey = turnKey;
                    autoScrollEmptyTurnKey = turnKey;
                    if (autoSuggestPlayableCards && lowestCardKeys.length > 0) {
                        selectedCardStrength = lowestHandStrength;
                        autoSuggestedCardKeys.clear();
                        lowestCardKeys.forEach(cardKey => {
                            selectedCardKeys.add(cardKey);
                            autoSuggestedCardKeys.add(cardKey);
                        });
                        suggestionApplied = true;
                    }
                } else if (autoSuggestPlayableCards) {
                    var requiredCardCount = hasFourOfKindOnTop(game) ? 4 : topPile.length;
                    var lowestPlayableStrength = chooseSuggestedPlayStrength(
                        player, topPile, playableStrengths, requiredCardCount
                    );
                    if (lowestPlayableStrength != null) {
                        var lowestPlay = {};
                        if (game.canPlayRank(player, lowestPlayableStrength, lowestPlay) && lowestPlay.pile) {
                            selectedCardStrength = lowestPlayableStrength;
                            var automaticCards = lowestPlay.pile;
                            autoSuggestedCardKeys.clear();
                            automaticCards.forEach(card =>
                                selectedCardKeys.add(`${card.suit}:${card.rank}`)
                            );
                            automaticCards.forEach(card =>
                                autoSuggestedCardKeys.add(`${card.suit}:${card.rank}`)
                            );
                            shouldCenterAutoSelection = automaticCards.length > 0;
                            autoCenterTurnKey = turnKey;
                            autoCenterCardKeys = automaticCards.map(card => `${card.suit}:${card.rank}`);
                            suggestionApplied = automaticCards.length > 0;
                        }
                    }
                }
                // Retry on the next render if no suggestion could be applied yet.
                if (autoSuggestPlayableCards && !suggestionApplied && playableStrengths.size > 0) {
                    autoSelectedTurnKey = null;
                }
            }
        }
        element.classList.toggle("HasHandSelection", isPlayingTurn && selectedCardKeys.size > 0);
        var playSelectedCards = function (motion = null) {
            if (game.localWritePending || game.status != "S" || player.turn != 1 || player.placement != 0 ||
                game.isTurnPaused() || game.connectionOnline === false ||
                GamePresence.isBot(game, player)) {
                return false;
            }
            var selectedCards = player.cards.filter(card =>
                selectedCardKeys.has(`${card.suit}:${card.rank}`)
            );
            if (selectedCards.length == 0) { return false; }
            var pile = new CardPile(player.name, ...selectedCards);
            if (!game.canPlayPile(player, pile)) {
                showInvalidCardWarning(game);
                return false;
            }
            if (motion && typeof motion.x == "number") { pile.motion = CardPile.normalizeMotion(motion); }
            clearCardSelection();
            game.playCards(player, pile);
            return true;
        };
        playButton.hidden = GameLayout.playInputMode() == "flick" ||
            game.status != "S" || player.placement != 0 ||
            GamePresence.isBot(game, player);
        var updatePlayButtonDisabled = function () {
            var selectedPile = new CardPile(player.name, ...player.cards.filter(card =>
                selectedCardKeys.has(`${card.suit}:${card.rank}`)
            ));
            playButton.disabled = game.localWritePending || playButton.hidden || !isPlayingTurn ||
                game.connectionOnline === false || selectedPile.length == 0 ||
                !game.canPlayPile(player, selectedPile);
        };
        updatePlayButtonDisabled();
        playButton.onclick = () => playSelectedCards();
        var selectCardsForSwipe = function (card) {
            if (!playableStrengths.has(card.strengthRank)) { return false; }
            autoSuggestedCardKeys.clear();
            var cardKey = `${card.suit}:${card.rank}`;
            if (selectedCardKeys.has(cardKey)) {
                var currentSelection = player.cards.filter(selectedCard =>
                    selectedCardKeys.has(`${selectedCard.suit}:${selectedCard.rank}`)
                );
                if (currentSelection.length > 0 &&
                    game.canPlayPile(player, new CardPile(player.name, ...currentSelection))) {
                    return true;
                }
            }
            var playInfo = {};
            if (!game.canPlayRank(player, card.strengthRank, playInfo) || !playInfo.pile) {
                return false;
            }
            var cardsToPlay = playInfo.pile.slice();
            if (game.topPile() == null) {
                cardsToPlay = [card];
            } else if (!cardsToPlay.includes(card)) {
                cardsToPlay[cardsToPlay.length - 1] = card;
            }
            clearCardSelection();
            selectedCardStrength = card.strengthRank;
            cardsToPlay.forEach(selectedCard =>
                selectedCardKeys.add(`${selectedCard.suit}:${selectedCard.rank}`)
            );
            return true;
        };
        var canPlayCaughtCards = function (cards) {
            return cards.length > 0 && playableStrengths.has(cards[0].strengthRank) &&
                game.canPlayPile(player, new CardPile(player.name, ...cards));
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
                    : (game.canPlayPile(player, new CardPile(player.name, ...selectedCards))
                        ? selectedCards.length
                        : ((selectedCardStrength == PresidentCard.clubThreePower()) ? 1 : topPile.length));
                selectionCount.textContent = (requiredCount == null)
                    ? `${selectedCards.length} kort valgt. Sveip vannrett over kortene for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.`
                    : `${selectedCards.length} av ${requiredCount} kort valgt. Sveip vannrett over kortene for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.`;
                if (GameLayout.playInputMode() != "flick") {
                    selectionCount.textContent = requiredCount == null
                        ? `${selectedCards.length} kort valgt. Trykk Legg ut eller Enter for å spille.`
                        : `${selectedCards.length} av ${requiredCount} kort valgt. Trykk Legg ut eller Enter for å spille.`;
                }
                selectionCount.setAttribute("aria-label", selectionCount.textContent);
            } else {
                selectionCount.textContent = "";
            }
        }
        if (player.placement == 0) {
            if (player.cards.length == 0) {
                setClass(element, "card-hand", false);
                setClass(element, "hand-explanation", true);
                element.innerHTML = document.getElementById("handExplanation").innerHTML;
            } else {
                setClass(element, "card-hand", true);
                setClass(element, "hand-explanation", false);
                var handStyle = GameLayout.cardStyle();
                var handFoil = GameLayout.cardFoil();
                var cardIndex = -1;
                player.cards.forEach(k => {
                    cardIndex++;
                    var cardButton = document.createElement("button");
                    cardButton.type = "button";
                    cardButton.disabled = true;
                    var fanPosition = (player.cards.length > 1)
                        ? Math.round(100 * ((cardIndex / (player.cards.length - 1)) - 0.5)) / 10
                        : 0;
                    var cardKey = `${k.suit}:${k.rank}`;
                    cardButton.className = "game-card";
                    cardButton.dataset.cardKey = cardKey;
                    cardButton.dataset.foil = handFoil;
                    cardButton.dataset.cardStyle = handStyle;
                    cardButton.style.setProperty("--card-offset", "0px");
                    cardButton.style.setProperty("--card-rotation", `${fanPosition}deg`);
                    cardButton.appendChild(GameLayout.createCardImage(k, null, handStyle, handFoil));
                    var isSelected = selectedCardKeys.has(cardKey);
                    var isPlayable = isPlayingTurn && playableStrengths.has(k.strengthRank);
                    if (isSelected) {
                        cardButton.classList.add("is-selected");
                        if (!previouslySelectedCardKeys.has(cardKey)) {
                            cardButton.classList.add("is-rising");
                        }
                    } else if (previouslySelectedCardKeys.has(cardKey)) {
                        cardButton.classList.add("is-lowering");
                    }
                    if (displayedExchange && displayedExchange.cards.some(card =>
                        card.suit == k.suit && card.rank == k.rank
                    )) {
                        cardButton.classList.add("is-exchange-selected");
                    }
                    if (recentlyReceivedCards.owner == `${game.id}:${player.name}` &&
                        recentlyReceivedCards.keys.has(cardKey)) {
                        cardButton.classList.add("is-received");
                    }
                    if (isPlayable) {
                        cardButton.classList.add("is-playable");
                    } else if (isPlayingTurn) {
                        cardButton.classList.add("is-unplayable");
                    }
                    if (selectedCardStrength != null && !isSelected) {
                        var mixTopPile = game.topPile();
                        var mixLimit = (mixTopPile == null)
                            ? Infinity
                            : ((selectedCardStrength == PresidentCard.clubThreePower())
                                ? 1
                                : (hasFourOfKindOnTop(game) ? 4 : mixTopPile.length));
                        if (k.strengthRank == selectedCardStrength && isPlayable) {
                            if (selectedCardKeys.size < mixLimit) {
                                cardButton.classList.add("is-mixable");
                            } else {
                                cardButton.classList.remove("is-playable");
                                cardButton.classList.add("is-unplayable");
                            }
                        }
                    }
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
                                    isCardAllowedForExchange(activeExchange, k, game) &&
                                    activeExchange.cards.length < activeExchange.count;
                                cardButton.disabled = activeExchange.cards.length != activeExchange.count &&
                                    !isSelectedForExchange && !canSelectForExchange;
                                if (cardButton.disabled) {
                                    cardButton.classList.add("is-unplayable");
                                }
                                if (!cardButton.disabled) {
                                cardButton.tabIndex = 0;
                                cardButton.setAttribute(
                                    "aria-label",
                                    `${k.getName()}${isSelectedForExchange ? ", valgt for bytte" : ", velg for bytte"}`
                                );
                                cardButton.onclick = function () {
                                    if (suppressNextCardClick) {
                                        suppressNextCardClick = false;
                                        return;
                                    }
                                    selectExchangeCard(k);
                                };
                                }
                            }
                            break;
                        case "S":
                            if (isPlayingTurn) {
                                cardButton.disabled = false;
                                cardButton.tabIndex = 0;
                                cardButton.setAttribute(
                                    "aria-label",
                                    `${k.getName()}${isPlayable ? ", kan spilles" : ", kan ikke spilles nå"}`
                                );
                                cardButton.title = isPlayable
                                    ? (GameLayout.playInputMode() == "button"
                                        ? "Klikk for å velge. Trykk Legg ut, Enter eller mellomrom for å spille."
                                        : GameLayout.playInputMode() == "both"
                                            ? "Klikk for å velge. Dra til brettet, flick opp eller trykk Legg ut, Enter eller mellomrom for å spille."
                                            : "Klikk for å velge. Dra til brettet, flick opp eller trykk Enter eller mellomrom for å legge ut.")
                                    : "Dette kortet kan ikke spilles nå";
                                cardButton.setAttribute("aria-pressed", String(isSelected));
                                cardButton.onclick = function () {
                                    if (suppressNextCardClick) {
                                        suppressNextCardClick = false;
                                        return;
                                    }
                                    if (!playableStrengths.has(k.strengthRank)) {
                                        showInvalidCardWarning(game);
                                        return;
                                    }
                                    autoSuggestedCardKeys.clear();
                                    if (selectedCardKeys.has(cardKey) && selectedCardKeys.size > 1) {
                                        clearCardSelection();
                                        selectedCardStrength = k.strengthRank;
                                        selectedCardKeys.add(cardKey);
                                    } else if (game.topPile() == null) {
                                        if (selectedCardStrength != null && selectedCardStrength != k.strengthRank) {
                                            clearCardSelection();
                                        }
                                        if (selectedCardKeys.has(cardKey)) {
                                            selectedCardKeys.delete(cardKey);
                                            if (selectedCardKeys.size == 0) {
                                                selectedCardStrength = null;
                                            }
                                        } else {
                                            selectedCardStrength = k.strengthRank;
                                            var matchingCards = player.cards.filter(card =>
                                                card.strengthRank == k.strengthRank
                                            );
                                            if (selectedCardKeys.size == 0) {
                                                matchingCards.forEach(card =>
                                                    selectedCardKeys.add(`${card.suit}:${card.rank}`)
                                                );
                                            } else {
                                                selectedCardKeys.add(cardKey);
                                            }
                                        }
                                    } else {
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
                                            var maxCards = (k.strengthRank == PresidentCard.clubThreePower())
                                                ? 1
                                                : (hasFourOfKindOnTop(game) ? 4 : topPile.length);
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
                                                    .slice(0, clearsAsSingleTwo(game, k.strengthRank) ? 1 : maxCards)
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
                                    }
                                    GameLayout.updateHand(
                                        game,
                                        player,
                                        selectedCardKeys.has(cardKey) ? cardKey : null
                                    );
                                    var focusedCard = Array.from(element.querySelectorAll(".game-card"))
                                        .find(card => card.dataset.cardKey == cardKey);
                                    if (focusedCard) {
                                        focusedCard.focus({ preventScroll: true });
                                    }
                                };
                            } else if (player.turn == 1 && game.isTurnPaused()) {
                                cardButton.title = "Vent litt før neste trekk";
                                cardButton.setAttribute("aria-label", `${k.getName()}, vent før neste trekk`);
                            }
                            break;
                        default:
                            break;
                    }
                    if (!cardButton.disabled) {
                        cardButton.onkeydown = function (event) {
                            if ((event.key == "Enter" || event.key == " ") && !event.repeat) {
                                event.preventDefault();
                                if (game.status == "S" && selectedCardKeys.has(cardKey)) {
                                    playSelectedCards();
                                } else {
                                    cardButton.click();
                                }
                            } else if (event.key == "ArrowLeft" || event.key == "ArrowRight") {
                                event.preventDefault();
                                var cards = Array.from(element.querySelectorAll(".game-card:not(:disabled)"));
                                var currentIndex = cards.indexOf(cardButton);
                                var direction = (event.key == "ArrowRight") ? 1 : -1;
                                var nextCard = cards[currentIndex + direction];
                                if (nextCard) {
                                    nextCard.focus();
                                }
                            }
                        };
                    }
                    element.appendChild(cardButton)
                });
            }
        } else {
            clearCardSelection();
            setClass(element, "card-hand", true);
            setClass(element, "hand-explanation", false);
            var resultIcon = resultIconForPlacement(game, player.placement);
            var nodes = [];
            if (resultIcon != null) {
                var icon = document.createElement("span");
                icon.className = "player-placement-result-icon";
                icon.setAttribute("aria-hidden", "true");
                icon.textContent = resultIcon;
                nodes.push(icon);
            }
            var placementTitle = document.createElement("b");
            placementTitle.textContent = game.placementTitle(player.placement).title;
            var message = document.createElement("span");
            message.append("Du ble ", placementTitle,
                game.status == "S" ? ". Venter på at de andre skal spille ferdig." : ".");
            nodes.push(message);
            element.replaceChildren(...nodes);
            element.classList.add("hand-finished");
        }
        element.scrollLeft = previousScrollLeft;
        if (typeof CardDepth != "undefined") { CardDepth.observeFoils(element); }
        if (isPlayingTurn) { scheduleCardDragPreparation(element); }
        if (previousHandOwner === ownerKey) {
            this.animateHandReflow(element, previousCardBounds);
        }
        element._handSignature = GameLayout.handSignature(game, player);
        element._rebindHand = function (newGame, newPlayer) {
            game = newGame;
            player = newPlayer;
            updatePlayButtonDisabled();
        };
        if (displayedExchange && displayedExchange.mode == "Best") {
            this.centerHandSelection(element, ownerKey, displayedExchange.cards.map(card =>
                `${card.suit}:${card.rank}`
            ));
        } else if (shouldCenterAutoSelection) {
            this.centerHandSelection(element, ownerKey, autoCenterCardKeys, autoCenterTurnKey);
        } else if (centerCardKey != null && selectedCardKeys.has(centerCardKey)) {
            this.centerHandSelection(element, ownerKey, Array.from(selectedCardKeys));
        } else if (shouldScrollToLowestCards && lowestCardTurnKey == autoScrollEmptyTurnKey) {
            this.scrollHandCardsIntoView(
                element,
                ownerKey,
                lowestCardKeys,
                lowestCardTurnKey
            );
        }
    }
    static captureHandCardBounds(element) {
        var bounds = new Map();
        if (typeof element.querySelectorAll != "function") { return bounds; }
        element.querySelectorAll(".game-card[data-card-key]").forEach(card => {
            bounds.set(card.dataset.cardKey, card.getBoundingClientRect());
        });
        return bounds;
    }
    // Slides the cards that stay in the hand from their old slots after others leave it.
    static animateHandReflow(element, previousBounds) {
        if (previousBounds.size == 0 ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        var cards = Array.from(element.querySelectorAll(".game-card[data-card-key]"));
        if (cards.length == 0 || cards.length >= previousBounds.size ||
            cards.some(card => !previousBounds.has(card.dataset.cardKey))) {
            return;
        }
        var currentBounds = cards.map(card => card.getBoundingClientRect());
        cards.forEach((card, index) => {
            if (typeof card.animate != "function") { return; }
            var before = previousBounds.get(card.dataset.cardKey);
            var after = currentBounds[index];
            var dx = before.left - after.left;
            var dy = before.top - after.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { return; }
            card.animate([
                { translate: `${dx}px ${dy}px` },
                { translate: "0px 0px" }
            ], { duration: animationDuration(typeof currentGame != "undefined" ? currentGame : null, 320),
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        });
    }
    static scrollHandCardsIntoView(element, ownerKey, cardKeys, turnKey) {
        stopCardHandInertia();
        cancelCardDragPreparation(element);
        var scrollVersion = cardHandScrollVersion;
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                if (scrollVersion != cardHandScrollVersion || selectedCardOwner != ownerKey ||
                    autoSelectedTurnKey != turnKey ||
                    autoScrollEmptyTurnKey != turnKey) {
                    return;
                }
                scheduleCardDragPreparation(element);
                var cardKeySet = new Set(cardKeys);
                var cards = Array.from(element.querySelectorAll(".game-card"))
                    .filter(card => cardKeySet.has(card.dataset.cardKey));
                if (cards.length == 0) { return; }
                var bounds = cards.map(card => card.getBoundingClientRect());
                var left = Math.min(...bounds.map(rect => rect.left));
                var right = Math.max(...bounds.map(rect => rect.right));
                var handBounds = element.getBoundingClientRect();
                var edgeZone = Math.max(8, bounds[0].width * 0.25);
                var comfortMargin = bounds[0].width * 0.6;
                var delta = 0;
                if (left < handBounds.left + edgeZone) {
                    delta = left - (handBounds.left + comfortMargin);
                } else if (right > handBounds.right - edgeZone) {
                    delta = right - (handBounds.right - comfortMargin);
                }
                if (right - left > handBounds.width - comfortMargin * 2) {
                    delta = left - (handBounds.left + comfortMargin);
                }
                if (Math.abs(delta) < 1) { return; }
                var maxScrollLeft = element.scrollWidth - element.clientWidth;
                animateHandScroll(
                    element,
                    Math.max(0, Math.min(maxScrollLeft, element.scrollLeft + delta))
                );
            });
        });
    }
    static centerHandSelection(element, ownerKey, cardKeys, turnKey = null) {
        stopCardHandInertia();
        cancelCardDragPreparation(element);
        var scrollVersion = cardHandScrollVersion;
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                if (scrollVersion != cardHandScrollVersion || selectedCardOwner != ownerKey ||
                    (turnKey != null && autoSelectedTurnKey != turnKey)) {
                    return;
                }
                scheduleCardDragPreparation(element);
                var selectedCards = Array.from(element.querySelectorAll(
                    ".game-card.is-selected, .game-card.is-exchange-selected"
                ));
                if (selectedCards.length == 0 || selectedCards.length != cardKeys.length ||
                    !selectedCards.every(card => cardKeys.includes(card.dataset.cardKey))) { return; }
                var selectedBounds = selectedCards.map(card => card.getBoundingClientRect());
                var selectedLeft = Math.min(...selectedBounds.map(bounds => bounds.left));
                var selectedRight = Math.max(...selectedBounds.map(bounds => bounds.right));
                var handBounds = element.getBoundingClientRect();
                var cardWidth = selectedBounds[0].width;
                // Only scroll when the selection sits right at an edge of the hand.
                var edgeZone = Math.max(8, cardWidth * 0.25);
                var comfortMargin = cardWidth * 0.6;
                var delta = 0;
                if (selectedLeft < handBounds.left + edgeZone) {
                    delta = selectedLeft - (handBounds.left + comfortMargin);
                } else if (selectedRight > handBounds.right - edgeZone) {
                    delta = selectedRight - (handBounds.right - comfortMargin);
                }
                if (selectedRight - selectedLeft > handBounds.width - comfortMargin * 2) {
                    delta = selectedLeft - (handBounds.left + comfortMargin);
                }
                if (Math.abs(delta) < 1) { return; }
                var maxScrollLeft = element.scrollWidth - element.clientWidth;
                animateHandScroll(
                    element,
                    Math.max(0, Math.min(maxScrollLeft, element.scrollLeft + delta))
                );
            });
        });
    }
});
