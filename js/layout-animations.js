// GameLayout: Card flights, exchange and discard animations, and resting pile jitter.
GameLayout.extend(class {
    static foilState(element, advance = 0) {
        return this.foilStates([element], advance)[0];
    }
    static foilStates(elements, advance = 0) {
        var samples = elements.map(element => {
            if (typeof getComputedStyle !== "function" || !element || element.dataset?.foil === "none") { return null; }
            var animations = advance && typeof element.getAnimations === "function" ? element.getAnimations({ subtree: true }) : [];
            var idle = animations.filter(animation => /^foil-idle-(color|glare)$/.test(animation.animationName));
            return { element: element, idle: idle, times: idle.map(animation => animation.currentTime) };
        });
        try {
            samples.forEach(sample => {
                if (!sample) { return; }
                sample.idle.forEach((animation, index) => {
                    if (typeof sample.times[index] === "number" && animation.playState === "running") {
                        animation.currentTime = sample.times[index] + advance;
                    }
                });
            });
            return samples.map(sample => {
                if (!sample) { return null; }
                var color = getComputedStyle(sample.element, "::before");
                var glare = getComputedStyle(sample.element, "::after");
                var strength = parseFloat(color.getPropertyValue("--foil-strength")) || 1;
                var pattern = color.backgroundPosition?.split(",")[2]?.trim().split(/\s+/);
                var glareShift = String(glare.translate || "none").trim().split(/\s+/);
                var glareOffset = (value, size) => {
                    if (!value || value === "none") { return 0; }
                    var number = parseFloat(value) || 0;
                    return value.endsWith("px") ? (parseFloat(size) ? number / parseFloat(size) * 100 : 0) : number;
                };
                return {
                    pointerX: color.getPropertyValue("--pointer-x").trim() || "50%",
                    pointerY: color.getPropertyValue("--pointer-y").trim() || "50%",
                    patternX: pattern ? parseFloat(pattern[0]) : undefined,
                    patternY: pattern ? parseFloat(pattern[1]) : undefined,
                    glareX: glareOffset(glareShift[0], glare.width),
                    glareY: glareOffset(glareShift[1], glare.height),
                    foilColor: Number(color.opacity) / strength,
                    foilGlare: Number(glare.opacity) / strength
                };
            });
        } finally {
            samples.forEach(sample => {
                if (sample) { sample.idle.forEach((animation, index) => { animation.currentTime = sample.times[index]; }); }
            });
        }
    }
    static capturePlayOrigins() {
        var cardOrigins = new Map();
        document.querySelectorAll("#playerHand .game-card[data-card-key] img").forEach(image => {
            var cardElement = image.closest(".game-card");
            var preview = cardElement._dragPreview;
            var bounds = (preview || image).getBoundingClientRect();
            var scale = preview ? parseFloat(preview.style.getPropertyValue("--drag-scale")) || 1 : 1;
            var width = preview && preview.offsetWidth ? preview.offsetWidth * scale : bounds.width;
            var height = preview && preview.offsetHeight ? preview.offsetHeight * scale : bounds.height;
            cardOrigins.set(cardElement.dataset.cardKey, {
                left: bounds.left + (bounds.width - width) / 2,
                top: bounds.top + (bounds.height - height) / 2,
                width: width,
                height: height,
                rotation: preview ? 0 : parseFloat(cardElement.style.getPropertyValue("--card-rotation")) || 0,
                pitch: preview ? parseFloat(preview.style.getPropertyValue("--tilt-x")) || 0 : 0,
                yaw: preview ? parseFloat(preview.style.getPropertyValue("--tilt-y")) || 0 : 0,
                pointerX: preview ? preview.style.getPropertyValue("--pointer-x") || "50%" : "50%",
                pointerY: preview ? preview.style.getPropertyValue("--pointer-y") || "50%" : "50%",
                ...GameLayout.foilState(preview || cardElement)
            });
        });
        var playerOrigins = new Map();
        document.querySelectorAll("#playerList [data-player-name]").forEach(element => {
            playerOrigins.set(element.dataset.playerName, element.getBoundingClientRect());
        });
        return { cardOrigins: cardOrigins, playerOrigins: playerOrigins };
    }
    static cardThrowMotion(drag, event, hand) {
        var bounds = document.getElementById("gameTable").getBoundingClientRect();
        var decay = Math.exp(-Math.max(0, pointerEventTime(event) - drag.lastMotionTime) / 90);
        var velocityX = drag.velocityX * decay;
        var velocityY = drag.velocityY * decay;
        var tilt = hand._cardDragPreview;
        return CardPile.normalizeMotion({
            x: (event.clientX + velocityX * 160 - bounds.left - bounds.width / 2) / Math.max(1, bounds.width / 2),
            y: (event.clientY + velocityY * 160 - bounds.top - bounds.height / 2) / Math.max(1, bounds.height / 2),
            power: Math.hypot(velocityX, velocityY) / 2.5,
            spin: velocityX * 5,
            pitch: tilt ? tilt.pitch : 0,
            yaw: tilt ? tilt.yaw : 0
        });
    }
    static animatePlayedCards(playElement, pile, origins, onComplete = null) {
        if (playElement.isConnected === false) {
            if (onComplete) { onComplete(); }
            return;
        }
        if (typeof CardDepth != "undefined" && typeof CardDepth.prepareTable == "function") {
            CardDepth.prepareTable(playElement.closest(".table-card-pile") || playElement);
        }
        if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            if (onComplete) { onComplete(); }
            return;
        }
        var playerOrigin = origins ? origins.playerOrigins.get(pile.name) : null;
        var duration = animationDuration(typeof currentGame != "undefined" ? currentGame : null);
        var lastDelay = animationDuration(typeof currentGame != "undefined" ? currentGame : null,
            Math.max(0, pile.length - 1) * 55);
        var pendingAnimations = 0;
        var finishedAnimations = 0;
        var landedCards = [];
        var completeAnimation = function () {
            finishedAnimations++;
            if (finishedAnimations != pendingAnimations) { return; }
            // A table refresh can replace the targets mid-flight. Keep every flight visible
            // until the whole play can be revealed on the current table.
            landedCards.forEach(({ target, flight }) => {
                target.style.opacity = "";
                if (typeof CardDepth != "undefined" && typeof CardDepth.setHidden == "function") { CardDepth.setHidden(target, false); }
                if (typeof CardDepth != "undefined") { CardDepth.detach(flight); }
                flight.remove();
            });
            if (onComplete) { onComplete(); }
        };
        // Measure every destination before inserting flights or hiding table cards.
        var destinations = Array.from(pile, card => {
            var target = playElement.querySelector(`[data-card-key="${card.suit}:${card.rank}"]`);
            if (!target || typeof target.animate != "function") { return null; }
            var image = target.src ? target : target.querySelector("img");
            if (image == null) { return null; }
            return { target: target, image: image, bounds: GameLayout.unrotatedCardBounds(target) };
        });
        var restingFoils = GameLayout.foilStates(destinations.map(destination => destination && destination.target), duration + lastDelay);
        pile.forEach((card, cardIndex) => {
            var cardKey = `${card.suit}:${card.rank}`;
            var source = (origins && origins.cardOrigins.get(cardKey)) || playerOrigin;
            var destination = destinations[cardIndex];
            if (destination == null) { return; }
            var target = destination.target;
            var targetImage = destination.image;
            var targetBounds = destination.bounds;
            var restingFoil = restingFoils[cardIndex];
            if (targetBounds.width == 0 || targetBounds.height == 0) { return; }
            if (!source || source.width == 0 || source.height == 0) {
                source = {
                    left: (window.innerWidth - targetBounds.width) / 2,
                    top: window.innerHeight - targetBounds.height - 12,
                    width: targetBounds.width,
                    height: targetBounds.height
                };
            }
            var flight = document.createElement("span");
            var cardStyle = target.dataset.cardStyle || "normal";
            flight.className = `card-flight card-preview card-preview--${cardStyle}`;
            flight.dataset.foil = target.dataset.foil || "none";
            var flightImage = targetImage.cloneNode(false);
            flightImage.alt = "";
            flightImage.setAttribute("aria-hidden", "true");
            flight.appendChild(flightImage);
            flight.setAttribute("aria-hidden", "true");
            var flightLeft = source.left + (source.width - targetBounds.width) / 2;
            var flightTop = source.top + (source.height - targetBounds.height) / 2;
            var flightX = targetBounds.left - flightLeft;
            var flightY = targetBounds.top - flightTop;
            var targetRotation = parseFloat(target.style.getPropertyValue("--pile-rotation")) || 0;
            var sourceRotation = typeof source.rotation == "number" ? source.rotation : 0;
            var startRotation = sourceRotation * 0.45 + (Math.random() - 0.5) * 40;
            var middleRotation = startRotation + (targetRotation - startRotation) * 0.35 +
                (Math.random() - 0.5) * 50;
            var hasTilt = source.pitch != null || pile.motion != null;
            var pitch = source.pitch ?? (pile.motion ? pile.motion.pitch : 0);
            var yaw = source.yaw ?? (pile.motion ? pile.motion.yaw : 0);
            if (hasTilt) {
                startRotation = sourceRotation;
                middleRotation = startRotation + (targetRotation - startRotation) * 0.7 +
                    (pile.motion ? pile.motion.spin * 0.2 : 0);
            }
            var flightTransform = function (x, y, rotation, amount, tiltPitch = pitch * amount, tiltYaw = yaw * amount) {
                var translation = `translate(${x}px, ${y}px)`;
                if (usesDepth) {
                    var depthScale = hasTilt ? 1 + (source.width / targetBounds.width - 1) * amount : 1;
                    return `${translation} scale(${depthScale})`;
                }
                if (!hasTilt) {
                    return `${x == 0 && y == 0 ? "translate(0, 0)" : translation} rotate(${rotation}deg)`;
                }
                var scale = 1 + (source.width / targetBounds.width - 1) * amount;
                return `${translation} perspective(900px) rotateX(${tiltPitch}deg) rotateY(${tiltYaw}deg) rotate(${rotation}deg) scale(${scale})`;
            };
            var middlePitch = pitch * 0.35 + (pile.motion ? Math.sign(-flightY) * pile.motion.power * 4 : 0);
            var middleYaw = yaw * 0.35 - (pile.motion ? pile.motion.spin * 0.2 : 0);
            flight.style.left = `${flightLeft}px`;
            flight.style.top = `${flightTop}px`;
            flight.style.width = `${targetBounds.width}px`;
            flight.style.height = `${targetBounds.height}px`;
            document.body.appendChild(flight);
            if (typeof CardDepth != "undefined") { CardDepth.attach(flight); }
            var usesDepth = typeof CardDepth != "undefined" && CardDepth.states.has(flight);
            var landingPose = usesDepth && typeof CardDepth.landingMotion == "function"
                ? CardDepth.landingMotion(flight, target, {
                    x: flightLeft + targetBounds.width / 2, y: flightTop + targetBounds.height / 2,
                    z: 0, pitch, yaw, roll: startRotation
                }, pile.motion ? pile.motion.power : .55) : null;
            target.style.opacity = "0";
            if (usesDepth && typeof CardDepth.setHidden == "function") { CardDepth.setHidden(target, true); }
            landedCards.push({ target, flight });
            pendingAnimations++;
            var flightFrames = [
                {
                    transform: flightTransform(0, 0, startRotation, 1),
                    opacity: 1
                },
                {
                    transform: flightTransform(flightX * 0.65, flightY * 0.65, middleRotation, 0.35, middlePitch, middleYaw),
                    opacity: 1,
                    offset: 0.68
                },
                {
                    transform: flightTransform(flightX, flightY, targetRotation, 0),
                    opacity: 1
                }
            ];
            if (landingPose) {
                flightFrames = Array.from({ length: 81 }, (_, index) => {
                    var progress = index / 80;
                    var pose = landingPose.positionAtProgress(progress);
                    var amount = Math.max(0, 1 - progress / LandingGeometry.CONTACT);
                    var scale = 1 + (source.width / targetBounds.width - 1) * amount * amount;
                    return {
                        offset: progress,
                        transform: `translate(${pose.x - flightLeft - targetBounds.width / 2}px, ${pose.y - flightTop - targetBounds.height / 2}px) scale(${scale})`,
                        opacity: 1
                    };
                });
            }
            if (flight.dataset.foil !== "none") {
                // Match the visible light and eased pattern, then join the table's idle phase at reveal.
                var sourceX = source.pointerX != null ? parseFloat(source.pointerX) : 50 + yaw / 18 * 45;
                var sourceY = source.pointerY != null ? parseFloat(source.pointerY) : 50 + pitch / 18 * 45;
                var endX = restingFoil ? parseFloat(restingFoil.pointerX) : 50;
                var endY = restingFoil ? parseFloat(restingFoil.pointerY) : 50;
                var sourceColor = source.foilColor ?? (hasTilt ? .72 : .48);
                var sourceGlare = source.foilGlare ?? .3;
                var endColor = restingFoil ? restingFoil.foilColor : .48;
                var endGlare = restingFoil ? restingFoil.foilGlare : .3;
                var sourcePatternX = source.patternX ?? 50 + (sourceX - 50) * .8;
                var sourcePatternY = source.patternY ?? 50 + (sourceY - 50) * .8;
                var endPatternX = restingFoil?.patternX ?? 50 + (endX - 50) * .8;
                var endPatternY = restingFoil?.patternY ?? 50 + (endY - 50) * .8;
                var sourceGlareX = source.glareX ?? 0;
                var sourceGlareY = source.glareY ?? 0;
                var endGlareX = restingFoil?.glareX ?? 0;
                var endGlareY = restingFoil?.glareY ?? 0;
                var restPose = landingPose ? landingPose.orientationAtProgress(1) : { pitch: 0, yaw: 0 };
                flightFrames.forEach((frame, index) => {
                    var progress = frame.offset ?? (index === 0 ? 0 : index === flightFrames.length - 1 ? 1 : .68);
                    var blend = progress * progress * (3 - 2 * progress);
                    var pose = landingPose ? landingPose.orientationAtProgress(progress) :
                        { pitch: index === 0 ? pitch : index === 1 ? middlePitch : 0,
                            yaw: index === 0 ? yaw : index === 1 ? middleYaw : 0 };
                    var tiltX = (pose.yaw - yaw - (restPose.yaw - yaw) * blend) / 18 * 45;
                    var tiltY = (pose.pitch - pitch - (restPose.pitch - pitch) * blend) / 18 * 45;
                    frame["--pointer-x"] = `${sourceX + (endX - sourceX) * blend + tiltX}%`;
                    frame["--pointer-y"] = `${sourceY + (endY - sourceY) * blend + tiltY}%`;
                    frame["--foil-pattern-x"] = `${sourcePatternX + (endPatternX - sourcePatternX) * blend + tiltX * .8}%`;
                    frame["--foil-pattern-y"] = `${sourcePatternY + (endPatternY - sourcePatternY) * blend + tiltY * .8}%`;
                    frame["--foil-color-opacity"] = sourceColor + (endColor - sourceColor) * blend;
                    frame["--foil-glare-opacity"] = sourceGlare + (endGlare - sourceGlare) * blend;
                    frame["--foil-glare-x"] = `${sourceGlareX + (endGlareX - sourceGlareX) * blend}%`;
                    frame["--foil-glare-y"] = `${sourceGlareY + (endGlareY - sourceGlareY) * blend}%`;
                });
            }
            var animation = flight.animate(flightFrames, {
                duration: duration,
                delay: animationDuration(typeof currentGame != "undefined" ? currentGame : null, cardIndex * 55),
                easing: landingPose ? "linear" : "cubic-bezier(.22,.8,.25,1)",
                fill: "both"
            });
            if (usesDepth) {
                CardDepth.update(flight, { pitch, yaw, roll: startRotation, lift: 18 });
                CardDepth.follow(flight, animation, progress => {
                    if (landingPose) { return landingPose.poseAtProgress(progress); }
                    var firstSegment = progress <= 0.68;
                    var amount = firstSegment ? progress / 0.68 : (progress - 0.68) / 0.32;
                    var interpolate = (start, middle, end) => progress >= 1 ? end : firstSegment
                        ? start + (middle - start) * amount : middle + (end - middle) * amount;
                    return {
                        pitch: hasTilt ? interpolate(pitch, middlePitch, 0) : 0,
                        yaw: hasTilt ? interpolate(yaw, middleYaw, 0) : 0,
                        roll: interpolate(startRotation, middleRotation, targetRotation),
                        lift: 18 * (1 - progress)
                    };
                });
            }
            var animationFinished = false;
            var finishAnimation = function () {
                if (animationFinished) { return; }
                animationFinished = true;
                completeAnimation();
            };
            animation.onfinish = finishAnimation;
            animation.oncancel = finishAnimation;
        });
        if (pendingAnimations == 0 && onComplete) { onComplete(); }
    }
    // getBoundingClientRect returns the enlarged axis-aligned box of a rotated card; flights rotate
    // themselves, so they need the card's own layout size centred on that box.
    static unrotatedCardBounds(element) {
        var bounds = element.getBoundingClientRect();
        var width = element.offsetWidth || bounds.width;
        var height = element.offsetHeight || bounds.height;
        return {
            left: bounds.left + (bounds.width - width) / 2,
            top: bounds.top + (bounds.height - height) / 2,
            width: width,
            height: height
        };
    }
    static clearCardFlights() {
        document.querySelectorAll(".card-flight, .card-discard-flight").forEach(flight => {
            if (typeof flight.getAnimations == "function") {
                flight.getAnimations().forEach(animation => animation.cancel());
            }
            if (typeof CardDepth != "undefined") { CardDepth.detach(flight); }
            flight.remove();
        });
    }
    static animateGivenExchangeCards(game, exchange, origins) {
        if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }
        var recipient = game.players[exchange.to];
        var target = Array.from(document.querySelectorAll("#playerList [data-player-name]"))
            .find(element => element.dataset.playerName == recipient.name) ||
            document.getElementById("gameTable");
        var bounds = target.getBoundingClientRect();
        var destination = document.createElement("div");
        destination.className = "exchange-flight-target";
        destination.setAttribute("aria-hidden", "true");
        var pile = new CardDeck(...exchange.cards);
        pile.name = game.players[exchange.from].name;
        pile.forEach((card, index) => {
            var style = GameLayout.styleForPlayer(game, pile.name);
            var foil = GameLayout.foilForPlayer(game, pile.name);
            var cardElement = document.createElement("span");
            cardElement.className = `card-preview card-preview--${style}`;
            cardElement.dataset.cardKey = `${card.suit}:${card.rank}`;
            cardElement.dataset.cardStyle = style;
            cardElement.dataset.foil = foil;
            var image = GameLayout.createCardImage(card, null, style, foil);
            image.alt = "";
            cardElement.appendChild(image);
            cardElement.style.position = "fixed";
            cardElement.style.width = "48px";
            cardElement.style.height = "72px";
            cardElement.style.left = `${bounds.left + (bounds.width - 48) / 2 + index * 6}px`;
            cardElement.style.top = `${bounds.top + (bounds.height - 72) / 2}px`;
            destination.appendChild(cardElement);
        });
        document.body.appendChild(destination);
        GameLayout.animatePlayedCards(destination, pile, origins, () => destination.remove());
    }
    static flashClubThree(game, table, pauseId) {
        var played = game.turnPause && game.turnPause.playedPile;
        if (pauseId == null || table.dataset.clubThreeFlashId == pauseId ||
            table.dataset.turnPauseId != pauseId || played == null ||
            !Array.isArray(played.cards) || played.cards.length != 1) { return; }
        var card = PresidentCard.deserializeDeck(played.cards)[0];
        if (!card.isClubThree()) { return; }
        var target = table.querySelector('.table-play__card[data-card-key="3:3"]');
        if (target == null) { return; }
        table.dataset.clubThreeFlashId = pauseId;
        var sender = game.getPlayer(played.name);
        target.classList.add("club-three-glint");
        target.classList.toggle("club-three-glint--loss", sender != null && sender.placement > 0);
    }
    static animateDiscardedCards(table, onComplete = null) {
        var pendingAnimations = 0;
        var completed = false;
        var completeIfReady = function () {
            if (pendingAnimations == 0 && !completed) {
                completed = true;
                if (onComplete) { onComplete(); }
                // Cards stay hidden until the table has been re-rendered, so they don't flash back.
                requestAnimationFrame(function () {
                    if (table == null) { return; }
                    table.querySelectorAll(".table-play__card").forEach(card => {
                        card.style.opacity = "";
                        if (typeof CardDepth != "undefined" && typeof CardDepth.setHidden == "function") { CardDepth.setHidden(card, false); }
                    });
                });
            }
        };
        if (table == null || document.hidden ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            completeIfReady();
            return;
        }
        var cards = Array.from(table.querySelectorAll(".table-play__card"));
        var cardBounds = cards.map(card => GameLayout.unrotatedCardBounds(card));
        cards.forEach((card, index) => {
            var bounds = cardBounds[index];
            if (bounds.width == 0 || bounds.height == 0) { return; }
            var rotation = parseFloat(card.style.getPropertyValue("--pile-rotation")) || 0;
            var flight = card.cloneNode(true);
            flight.classList.add("card-discard-flight");
            flight.setAttribute("aria-hidden", "true");
            if (typeof flight.animate != "function") { return; }
            flight.style.left = `${bounds.left}px`;
            flight.style.top = `${bounds.top}px`;
            flight.style.width = `${bounds.width}px`;
            flight.style.height = `${bounds.height}px`;
            document.body.appendChild(flight);
            if (typeof CardDepth != "undefined") { CardDepth.attach(flight); }
            var usesDepth = typeof CardDepth != "undefined" && CardDepth.states.has(flight);
            var horizontalOffset = ((index % 7) - 3) * 35 + (Math.random() - 0.5) * 24;
            var spin = (index % 2 == 0 ? -1 : 1) * (35 + (index % 5) * 12) +
                (Math.random() - 0.5) * 50;
            var animation = flight.animate([
                {
                    transform: usesDepth ? "translate(0, 0)" : `translate(0, 0) rotate(${rotation}deg)`,
                    opacity: 1
                },
                {
                    transform: `translate(${horizontalOffset}px, ${-Math.max(150, window.innerHeight * 0.4)}px)` +
                        (usesDepth ? "" : ` rotate(${rotation + spin}deg)`),
                    opacity: 0
                }
            ], {
                duration: animationDuration(typeof currentGame != "undefined" ? currentGame : null, DISCARD_ANIMATION_MS),
                delay: animationDuration(typeof currentGame != "undefined" ? currentGame : null, index * 12),
                easing: "cubic-bezier(.45,0,.8,.4)",
                fill: "forwards"
            });
            if (usesDepth) {
                var sourceDepth = CardDepth.states.get(card);
                // Cards from deep in a large pile were mostly hidden; as they fade out they cast no shadow at all.
                if (sourceDepth && !CardDepth.detailed(sourceDepth)) { CardDepth.states.get(flight).shadowless = true; }
                var initial = sourceDepth && sourceDepth.world
                    ? { pitch: sourceDepth.world.pitch, yaw: sourceDepth.world.yaw, z: sourceDepth.world.z }
                    : { pitch: 0, yaw: 0, z: undefined };
                // Cleared cards fade as they rise, so a floor shadow is enough; no card-to-card shadows.
                CardDepth.update(flight, initial.z == null ? { pitch: 0, yaw: 0, roll: rotation, lift: 0 }
                    : { ...initial, roll: rotation });
                CardDepth.follow(flight, animation, progress => initial.z == null
                    ? { roll: rotation + spin * progress, lift: 18 * progress }
                    : { ...initial, roll: rotation + spin * progress, z: initial.z + 18 * progress });
            }
            card.style.opacity = "0";
            if (usesDepth && typeof CardDepth.setHidden == "function") { CardDepth.setHidden(card, true); }
            pendingAnimations++;
            var animationFinished = false;
            var finishAnimation = function () {
                if (animationFinished) { return; }
                animationFinished = true;
                if (typeof CardDepth != "undefined") { CardDepth.detach(flight); }
                flight.remove();
                pendingAnimations--;
                completeIfReady();
            };
            animation.onfinish = finishAnimation;
            animation.oncancel = finishAnimation;
        });
        completeIfReady();
    }
    // Deterministic within each board-size class; the player's seat biases the tilt.
    // Grouped cards share a readable fan, with stable per-card splay that survives table redraws.
    static pileCardJitter(game, pile, card, stackIndex, cardIndex = 0, smallScreen = false) {
        var seed = 2166136261;
        var first = pile[0];
        var text = `${game.shuffleStartedAt || ""}:${pile.name}:${first.suit}:${first.rank}:${stackIndex - cardIndex}`;
        for (var i = 0; i < text.length; i++) {
            seed = Math.imul(seed ^ text.charCodeAt(i), 16777619) >>> 0;
        }
        var unit = function (shift, value = seed) {
            return (((value >>> shift) & 255) / 255) - 0.5;
        };
        var cardSeed = Math.imul(seed ^ (card.suit * 31 + card.rank), 2654435761) >>> 0;
        var splay = pile.length > 1;
        var seatCount = Math.max(1, game.players.length);
        var seat = game.players.findIndex(player => player.name == pile.name);
        var seatBias = (seat < 0 || seatCount < 2)
            ? 0
            : ((seat / (seatCount - 1)) - 0.5) * 24;
        var power = pile.motion ? pile.motion.power : 0;
        var spread = 6 + power * 4;
        var fanAngle = (cardIndex - (pile.length - 1) / 2) * spread;
        var arc = Math.abs(cardIndex - (pile.length - 1) / 2);
        return {
            angle: Math.round(Math.max(smallScreen ? -40 : -30, Math.min(smallScreen ? 40 : 30,
                seatBias + unit(0) * 20 + fanAngle + (splay ? unit(0, cardSeed) * 4 : 0) +
                (pile.motion ? pile.motion.spin * (smallScreen ? 1.4 : 1) : 0))) * 10) / 10,
            x: Math.round(unit(8) * 14 + (cardIndex - (pile.length - 1) / 2) * power * 8 +
                (splay ? unit(8, cardSeed) * 6 : 0)),
            y: Math.round(unit(16) * 10 + arc * (3 + power * 4) +
                (splay ? unit(16, cardSeed) * 10 : 0))
        };
    }
});
