var selectedCardKeys = new Set();
var selectedCardStrength = null;
var selectedCardOwner = null;
var activeExchangeId = null;
var autoSelectedTurnKey = null;
var autoSuggestedCardKeys = new Set();
var autoSuggestPlayableCards = getCookie("AutoSuggestPlayableCards") != "false";
var autoScrollEmptyTurnKey = null;
var recentlyReceivedCards = { owner: null, keys: new Set(), timer: null };
var suppressNextCardClick = false;
const PUBLIC_LOBBY_PATH = "boms_public";
const PUBLIC_LOBBY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
function markReceivedCards(owner, cards) {
    if (recentlyReceivedCards.timer != null) { clearTimeout(recentlyReceivedCards.timer); }
    recentlyReceivedCards.owner = owner;
    recentlyReceivedCards.keys = new Set(cards.map(card => `${card.suit}:${card.rank}`));
    recentlyReceivedCards.cards = cards.map(card => ({ suit: card.suit, rank: card.rank }));
    recentlyReceivedCards.timer = setTimeout(function () {
        recentlyReceivedCards = { owner: null, keys: new Set(), cards: [], timer: null };
        document.querySelectorAll(".game-card.is-received").forEach(element =>
            element.classList.remove("is-received"));
        document.querySelectorAll(".exchange-received").forEach(element => element.remove());
    }, 8000);
}
var cardHandInertiaFrame = null;
var invalidCardAttemptRound = null;
var invalidCardAttemptCount = 0;
var invalidCardWarningShown = false;

function getExchangeId(exchange) {
    return exchange.id || `${exchange.tradeId || "exchange"}:${exchange.from}:${exchange.to}`;
}

function activeTradeOffer(game) {
    if (!game || game.status != "G" ||
        (game.piles || []).some(exchange => exchange.mode != "Tilbud")) { return null; }
    return (game.piles || []).find(exchange => exchange.mode == "Tilbud") || null;
}

function isSneakyTradeAvailable(game) {
    return game != null && game.players.length == 3 && game.players.some(player =>
        player.playerKey != "PC" && ["tåkefyrsten", "h4cker", "mrhotbox", "bjørn", "ekrem", "joachim"]
            .includes((player.name || "").trim().normalize("NFC").toLowerCase()));
}

function hasSneakyConsent(exchange, game = null) {
    return (game == null || isSneakyTradeAvailable(game)) && exchange.kind == "playerTrade" &&
        Array.isArray(exchange.sneakyVotes) &&
        exchange.sneakyVotes.includes(exchange.from) &&
        exchange.sneakyVotes.includes(exchange.to);
}

function isCardAllowedForExchange(exchange, card, game = null) {
    return exchange.kind != "playerTrade" ||
        hasSneakyConsent(exchange, game) ||
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
    if (game.players.length == 3 && excludedExchange?.kind == "playerTrade" &&
        excludedExchange.from == playerIndex &&
        game.players[playerIndex].lastPlacement == 2 &&
        game.players[excludedExchange.to].lastPlacement == 3 &&
        !hasSneakyConsent(excludedExchange, game)) {
        var president = game.players.find(player => player.lastPlacement == 1);
        (game.exchangeReceipts || []).filter(receipt =>
            receipt.sender == president?.name &&
            receipt.recipient == game.players[playerIndex].name
        ).forEach(receipt => {
            receipt.cards.forEach(card => reservedCards.add(exchangeCardKey(card)));
        });
    }
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

function describeCards(rank, count) {
    var spelledRank = [
        "", "ess", "to", "tre", "fire", "fem", "seks", "syv",
        "åtte", "ni", "ti", "knekt", "dame", "konge"
    ][rank];
    if (count == 1) { return `singel ${Card.rankInfo(rank).singularName.toLowerCase()}`; }
    var playType = ["", "", "par", "tress", "fire like"][count];
    return playType ? `${playType} i ${spelledRank}` : `${count} ${Card.rankInfo(rank).pluralName.toLowerCase()}`;
}

function describeRequiredPlay(game) {
    var topPile = game.topPile();
    if (topPile[0].isClubThree()) { return "kløver 3"; }
    var requiredCardCount = hasFourOfKindOnTop(game) ? 4 : topPile.length;
    return describeCards(topPile[0].rank, requiredCardCount);
}

function hasBothNaturalThreesOnTop(game) {
    var requiredSuits = game.players.length == 2 ? [1, 2, 4] : [1, 2];
    if (game.players.length != 2 && game.players.length != 3) { return false; }
    var threesOnTop = new Set();
    for (var index = game.piles.length - 1; index >= 0; index--) {
        var pile = game.piles[index];
        if (pile.strengthRank != 3) { break; }
        pile.forEach(card => {
            if (card.rank == 3 && requiredSuits.includes(card.suit)) {
                threesOnTop.add(card.suit);
            }
        });
        if (threesOnTop.size == requiredSuits.length) { return true; }
    }
    return false;
}

function getRepeatedSinglePlay(piles) {
    if (piles.length < 2 || piles[piles.length - 1].length != 1) { return null; }
    var strengthRank = piles[piles.length - 1].strengthRank;
    var count = 0;
    for (var index = piles.length - 1; index >= 0; index--) {
        var pile = piles[index];
        if (pile.length != 1 || pile.strengthRank != strengthRank) { break; }
        count++;
    }
    return count > 1 ? { count: count, strengthRank: strengthRank } : null;
}

function assignPlayerColors(game) {
    var usedHues = game.players.map(player => {
        var match = typeof player.displayColor == "string"
            ? player.displayColor.match(/^hsl\((\d+) 82% 70%\)$/)
            : null;
        return match ? Number(match[1]) : null;
    }).filter(hue => hue != null);
    game.players.filter(player => !player.displayColor)
        .sort((a, b) => a.name < b.name ? -1 : (a.name > b.name ? 1 : 0))
        .forEach(player => {
            var key = `${game.id}:${player.name.toLowerCase()}`;
            var hash = 2166136261;
            for (var index = 0; index < key.length; index++) {
                hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
            }
            var hue = hash % 360;
            // With at most four players, a 60-degree gap always leaves an available hue.
            while (usedHues.some(used => Math.min(Math.abs(hue - used), 360 - Math.abs(hue - used)) < 60)) {
                hue = (hue + 137) % 360;
            }
            usedHues.push(hue);
            player.displayColor = `hsl(${hue} 82% 70%)`;
        });
}

const BOT_NAMES = [
    "Knurt", "Boten Anna", "Turbo-Tore", "Haakon VIII", "Bomsen",
    "Onkel Pass", "Severin Suveren", "H4cker-man", "Kurt-Josef", "Kjell-Bjarne",
    "Steinar Storspiller", "Mathias (CEO)", "xXLegolasXx", "J21Oslo", "Guest_839201",
    "Fetter Anton", "DeepSeek", "GPT6", "Jompa", "Sjefen_Over_Alle_Sjefer",
    "Mysil Bergsprekken", "RNGesus", "Tante_Pose", "BobRoss", "IlIllIlIIl", "ギフテッド"
];
const TURN_ACTION_PAUSE_MS = 2000;
const BOT_ACTION_DELAY_MS = TURN_ACTION_PAUSE_MS;
const SHUFFLE_DURATION_MS = 3000;

function gameTurnSeconds(value) {
    return [1, 2, 3].includes(Number(value)) ? Number(value) : TURN_ACTION_PAUSE_MS / 1000;
}

function isGiftPackage(piles) {
    if (piles.length < 4) { return false; }
    var singles = piles.slice(-4);
    var rank = singles[0].strengthRank;
    return rank != PresidentCard.clubThreePower() &&
        singles.every(pile => pile.length == 1 && pile.strengthRank == rank) &&
        singles[0].name == singles[3].name &&
        (piles.length == 4 || piles[piles.length - 5].strengthRank != rank);
}

function resultIconForPlacement(game, placement, player = null) {
    if (placement == 1) {
        return "👑" + (player && player.presidentStreak > 1 ? ` 🔥 ×${player.presidentStreak}` : "");
    }
    if (placement == game.players.length) {
        return "🗑️" + (player && player.bomsStreak > 1 ? ` 🌧️ ×${player.bomsStreak}` : "");
    }
    return null;
}

function roundVotePlayerId(player) {
    return JSON.stringify([player.playerKey || "", player.name]);
}

function sanitizePlayerName(name) {
    return name.replace(/[^0-9A-ZÆØÅa-zæøå \/\-\p{Script_Extensions=Katakana}\p{Script_Extensions=Hiragana}\p{Script=Han}\p{Extended_Pictographic}\u200d\ufe0f]/gu, "");
}

function availablePlayerName(name, usedNames) {
    var used = new Set(usedNames.map(value => value.toLocaleLowerCase()));
    var candidate = name;
    var number = 0;
    while (used.has(candidate.toLocaleLowerCase())) {
        var suffix = `-${++number}`;
        candidate = Array.from(name).slice(0, 24 - suffix.length).join("") + suffix;
    }
    return candidate;
}

function updateAutoSuggestionButton() {
    var button = document.getElementById("autoSuggestionToggleButton");
    if (button == null) { return; }
    button.setAttribute("aria-pressed", String(autoSuggestPlayableCards));
    button.setAttribute(
        "aria-label",
        autoSuggestPlayableCards
            ? "Slå av automatisk kortforslag"
            : "Slå på automatisk kortforslag"
    );
    button.title = autoSuggestPlayableCards
        ? "Automatisk kortforslag er på"
        : "Automatisk kortforslag er av";
}

function isLobbyHost(game) {
    if (game == null) { return false; }
    var hostKey = game.hostKey;
    if (hostKey == null || hostKey == "") {
        var firstHumanPlayer = game.players.find(player => player.playerKey != "PC");
        hostKey = firstHumanPlayer ? firstHumanPlayer.playerKey : null;
    }
    return hostKey != null && hostKey === getPlayerKey() &&
        (game.hostName == null || game.hostName === game.localPlayerName);
}

function clearCardSelection() {
    selectedCardKeys.clear();
    autoSuggestedCardKeys.clear();
    selectedCardStrength = null;
}

const PLAY_ANIMATION_MS = 520;
const DISCARD_ANIMATION_MS = 720;

function animationDuration(game, normal = PLAY_ANIMATION_MS) {
    if (game && game.fastForward === true) { return normal * 0.5; }
    var speed = getCookie("AnimationSpeed");
    return normal * ({ fast: 0.5, normal: 1, slow: 1.5 }[speed] || 1);
}

function preparePresentationPause(game) {
    var pause = game.turnPause;
    if (!pause || pause.presentationVersion != 1 || pause.startedAt != null) { return; }
    pause.startedAt = GamePresence.now();
    pause.botDelayMs = animationDuration(null, 2000);
    pause.botUntil = pause.startedAt + (game.fastForward ? 1000 : pause.botDelayMs);
    var next = game.players[game.turn];
    pause.until = (next && GamePresence.isBot(game, next)) || pause.pendingGameEnd
        ? pause.botUntil : pause.startedAt + 10000;
}

function discardAnimationMs(cardCount) {
    return DISCARD_ANIMATION_MS + Math.max(0, cardCount - 1) * 12;
}

function clearAnimationStartsAt(pause) {
    var count = (pause.clearedPiles || []).reduce((total, pile) =>
        total + Object.keys(pile).filter(key => /^\d+$/.test(key)).length, 0);
    return pause.until - discardAnimationMs(count);
}

function showInvalidCardWarning(game) {
    var roundKey = `${game.id}:${game.round}`;
    if (invalidCardAttemptRound != roundKey) {
        invalidCardAttemptRound = roundKey;
        invalidCardAttemptCount = 0;
        invalidCardWarningShown = false;
    }
    invalidCardAttemptCount++;
    if (invalidCardAttemptCount >= 3 && !invalidCardWarningShown) {
        invalidCardWarningShown = true;
        showDialog("KanIkkeLeggeKort", true);
    }
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
    cardElement.classList.add("is-tilting");
}

function resetCardTilt(cardElement) {
    cardElement.classList.remove("is-tilting");
    cardElement.style.setProperty("--tilt-x", "0deg");
    cardElement.style.setProperty("--tilt-y", "0deg");
}

function startCardDragPreview(hand, event) {
    clearCardDragPreview(hand);
    var layer = document.createElement("div");
    layer.className = "card-drag-layer";
    layer.setAttribute("aria-hidden", "true");
    var cards = [];
    hand.querySelectorAll(".game-card").forEach(card => {
        if (!selectedCardKeys.has(card.dataset.cardKey)) { return; }
        var bounds = card.getBoundingClientRect();
        var preview = card.cloneNode(true);
        preview.removeAttribute("id");
        preview.removeAttribute("aria-pressed");
        preview.className = `game-card card-preview card-preview--${card.dataset.cardStyle} card-drag-preview`;
        preview.tabIndex = -1;
        preview.style.left = `${bounds.left}px`;
        preview.style.top = `${bounds.top}px`;
        preview.style.width = `${bounds.width}px`;
        preview.style.height = `${bounds.height}px`;
        preview.style.setProperty("--card-offset", "0px");
        preview.style.setProperty("--card-rotation", "0deg");
        preview.style.setProperty("--drag-offset-x", "0px");
        preview.style.setProperty("--drag-offset-y", "0px");
        preview.style.setProperty("--tilt-x", "0deg");
        preview.style.setProperty("--tilt-y", "0deg");
        preview.style.setProperty("--drag-scale", "1");
        layer.appendChild(preview);
        card.classList.add("is-drag-source");
        card._dragPreview = preview;
        cards.push(card);
    });
    document.body.appendChild(layer);
    hand._cardDragPreview = {
        layer, cards, pointerX: event.clientX, pointerY: event.clientY,
        sampledX: event.clientX, sampledY: event.clientY,
        pitch: 0, yaw: 0, targetPitch: 0, targetYaw: 0,
        frame: null, lastFrameTime: null, returning: false
    };
}

function animateCardDragTilt(drag, time) {
    drag.frame = null;
    var elapsed = drag.lastFrameTime == null ? 16 : Math.max(1, time - drag.lastFrameTime);
    drag.lastFrameTime = time;
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var velocityX = (drag.pointerX - drag.sampledX) / Math.max(16, elapsed);
    var velocityY = (drag.pointerY - drag.sampledY) / Math.max(16, elapsed);
    drag.sampledX = drag.pointerX;
    drag.sampledY = drag.pointerY;
    var targetPitch = drag.returning || reducedMotion ? 0 : Math.max(-18, Math.min(18, -velocityY * 720)) * 0.7;
    var targetYaw = drag.returning || reducedMotion ? 0 : Math.max(-18, Math.min(18, -velocityX * 720));
    var targetBlend = 1 - Math.exp(-elapsed / 100);
    drag.targetPitch = reducedMotion || drag.returning ? 0 : drag.targetPitch + (targetPitch - drag.targetPitch) * targetBlend;
    drag.targetYaw = reducedMotion || drag.returning ? 0 : drag.targetYaw + (targetYaw - drag.targetYaw) * targetBlend;
    var blend = 1 - Math.exp(-elapsed / 120);
    drag.pitch = reducedMotion ? 0 : drag.pitch + (drag.targetPitch - drag.pitch) * blend;
    drag.yaw = reducedMotion ? 0 : drag.yaw + (drag.targetYaw - drag.yaw) * blend;
    var settled = Math.abs(drag.pitch) < 0.02 && Math.abs(drag.yaw) < 0.02 &&
        Math.abs(drag.targetPitch) < 0.02 && Math.abs(drag.targetYaw) < 0.02 &&
        targetPitch == 0 && targetYaw == 0;
    if (settled) { drag.pitch = drag.yaw = drag.targetPitch = drag.targetYaw = 0; }
    drag.cards.forEach((card, index) => {
        var pitchScale = drag.cards.length == 1 ? 1 : 0.9 + 0.2 * index / (drag.cards.length - 1);
        var pitch = Math.max(-18, Math.min(18, drag.pitch * pitchScale));
        card._dragPreview.style.setProperty("--tilt-x", pitch == 0 ? "0deg" : `${pitch.toFixed(2)}deg`);
        card._dragPreview.style.setProperty("--tilt-y", drag.yaw == 0 ? "0deg" : `${drag.yaw.toFixed(2)}deg`);
        card._dragPreview.style.setProperty("--pointer-x", `${(50 + drag.yaw / 18 * 45).toFixed(2)}%`);
        card._dragPreview.style.setProperty("--pointer-y", `${(50 - pitch / 18 * 45).toFixed(2)}%`);
        card._dragPreview.classList.toggle("is-tilting", !settled && !reducedMotion);
    });
    if (!settled) {
        drag.frame = requestAnimationFrame(nextTime => animateCardDragTilt(drag, nextTime));
    } else {
        drag.lastFrameTime = null;
    }
}

function moveCardDragPreview(hand, event, startX, startY) {
    var drag = hand._cardDragPreview;
    if (!drag) { return; }
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    drag.pointerX = event.clientX;
    drag.pointerY = event.clientY;
    if (reducedMotion) {
        if (drag.frame != null) { cancelAnimationFrame(drag.frame); }
        animateCardDragTilt(drag, performance.now());
    } else if (drag.frame == null) {
        drag.frame = requestAnimationFrame(time => animateCardDragTilt(drag, time));
    }
    drag.cards.forEach(card => {
        var preview = card._dragPreview;
        preview.style.setProperty("--drag-offset-x", `${event.clientX - startX}px`);
        preview.style.setProperty("--drag-offset-y", `${event.clientY - startY}px`);
        preview.style.setProperty("--drag-scale", reducedMotion ? "1" : "1.12");
    });
    document.getElementById("gameTable").classList.toggle("is-card-drop-target", isCardDropOnTable(event));
}

function isCardDropOnTable(event) {
    var table = document.getElementById("gameTable");
    var bounds = table.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 &&
        event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

function isUpwardFlick(x, y) {
    return y > 0 && y + 1e-6 >= Math.abs(x) * Math.tan(Math.PI / 9);
}

function shouldPlayCardDrag(drag, event) {
    if (!drag.canDragToPlay || drag.axis == "horizontal") { return false; }
    if (drag.didPlayDrag && isCardDropOnTable(event)) { return true; }
    var flickX = drag.lastFlickX || 0;
    var flickY = drag.lastFlickY ?? drag.lastFlickDistance;
    return drag.canSwipeToPlay && isUpwardFlick(flickX, flickY) &&
        drag.lastFlickDistance >= 12 && drag.lastFlickVelocity >= 0.55 &&
        (drag.lastFlickMoveTime == null || performance.now() - drag.lastFlickMoveTime <= 120);
}

function clearCardDragPreview(hand) {
    var drag = hand._cardDragPreview;
    if (!drag) { return; }
    if (drag.frame != null) { cancelAnimationFrame(drag.frame); }
    drag.cards.forEach(card => {
        card.classList.remove("is-drag-source");
        delete card._dragPreview;
    });
    drag.layer.remove();
    hand._cardDragPreview = null;
    document.getElementById("gameTable").classList.remove("is-card-drop-target");
}

function returnCardDragPreview(hand) {
    var drag = hand._cardDragPreview;
    if (!drag) { return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        clearCardDragPreview(hand);
        return;
    }
    drag.returning = true;
    if (drag.frame != null) { cancelAnimationFrame(drag.frame); drag.frame = null; }
    drag.cards.forEach(card => {
        var preview = card._dragPreview;
        preview.getBoundingClientRect();
        preview.classList.add("is-returning");
        preview.style.setProperty("--drag-offset-x", "0px");
        preview.style.setProperty("--drag-offset-y", "0px");
        preview.style.setProperty("--drag-scale", "1");
        preview.style.setProperty("--tilt-x", "0deg");
        preview.style.setProperty("--tilt-y", "0deg");
        preview.style.setProperty("--pointer-x", "50%");
        preview.style.setProperty("--pointer-y", "50%");
        preview.classList.remove("is-tilting");
    });
    document.getElementById("gameTable").classList.remove("is-card-drop-target");
    setTimeout(() => {
        if (hand._cardDragPreview == drag) { clearCardDragPreview(hand); }
    }, 340);
}

function stopCardHandInertia() {
    if (cardHandInertiaFrame != null) {
        cancelAnimationFrame(cardHandInertiaFrame);
        cardHandInertiaFrame = null;
    }
}

function animateHandScroll(element, targetScrollLeft, duration = 700) {
    stopCardHandInertia();
    var startScrollLeft = element.scrollLeft;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        element.scrollLeft = targetScrollLeft;
        return;
    }
    var startTime = null;
    var step = function (frameTime) {
        if (startTime == null) { startTime = frameTime; }
        var progress = Math.min(1, (frameTime - startTime) / duration);
        var eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        element.scrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * eased;
        cardHandInertiaFrame = (progress < 1) ? requestAnimationFrame(step) : null;
    };
    cardHandInertiaFrame = requestAnimationFrame(step);
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
            velocity *= Math.exp(-elapsed / 260);
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
