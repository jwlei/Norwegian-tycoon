var selectedCardKeys = new Set();
var selectedCardStrength = null;
var selectedCardOwner = null;
var activeExchangeId = null;
var autoSelectedTurnKey = null;
var autoSuggestedCardKeys = new Set();
var autoSuggestPlayableCards = getCookie("AutoSuggestPlayableCards") != "false";
var autoPassEnabled = getCookie("AutoPass") == "true";
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
var cardHandScrollVersion = 0;
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

function updateAutoPassButton() {
    var button = document.getElementById("autoPassToggleButton");
    if (button == null) { return; }
    button.setAttribute("aria-pressed", String(autoPassEnabled));
    button.setAttribute("aria-label", autoPassEnabled
        ? "Slå av automatisk pass" : "Slå på automatisk pass");
    button.title = autoPassEnabled ? "Automatisk pass er på" : "Automatisk pass er av";
}

function tryAutoPass(game, player) {
    if (!autoPassEnabled || game == null || player == null ||
        game.connectionOnline === false || game.localWritePending ||
        GamePresence.exchangeBlocksActions(game) || GamePresence.isBot(game, player) ||
        GamePresence.isExpired(game) || !game.canPass(player)) {
        return;
    }
    var strengths = new Set(player.cards.map(card => card.strengthRank));
    if (Array.from(strengths).some(strength => game.canPlayRank(player, strength))) { return; }
    game.passTurn(player);
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

function exchangeSummaryDuration(speed) {
    return { fast: 3000, normal: 5000, slow: 7000 }[speed];
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
        showDialog("CannotPlay", true);
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
    var previews = [];
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
        if (typeof CardDepth != "undefined") {
            CardDepth.attach(preview);
            CardDepth.update(preview, { lift: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 18 });
        }
        card.classList.add("is-drag-source");
        card._dragPreview = preview;
        cards.push(card);
        previews.push(preview);
    });
    document.body.appendChild(layer);
    hand._cardDragPreview = {
        layer, cards, previews, pointerX: event.clientX, pointerY: event.clientY,
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
    var targetPitch = drag.returning || reducedMotion ? 0 : Math.max(-18, Math.min(18, velocityY * 720)) * 0.7;
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
    drag.previews.forEach((preview, index) => {
        var pitchScale = drag.cards.length == 1 ? 1 : 0.9 + 0.2 * index / (drag.cards.length - 1);
        var pitch = Math.max(-18, Math.min(18, drag.pitch * pitchScale));
        preview.style.setProperty("--tilt-x", pitch == 0 ? "0deg" : `${pitch.toFixed(2)}deg`);
        preview.style.setProperty("--tilt-y", drag.yaw == 0 ? "0deg" : `${drag.yaw.toFixed(2)}deg`);
        preview.style.setProperty("--pointer-x", `${(50 + drag.yaw / 18 * 45).toFixed(2)}%`);
        preview.style.setProperty("--pointer-y", `${(50 + pitch / 18 * 45).toFixed(2)}%`);
        preview.classList.toggle("is-tilting", !settled && !reducedMotion);
        if (typeof CardDepth != "undefined") {
            CardDepth.update(preview, { pitch, yaw: drag.yaw, lift: reducedMotion ? 0 : 18 });
        }
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
    drag.previews.forEach(preview => {
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

function isUpwardFlick(x, y, coneDegrees = CARD_TOUCH_PICKUP_CONE) {
    return y > 0 && y + 1e-6 >= Math.abs(x) *
        Math.tan((180 - coneDegrees) * Math.PI / 360);
}

const CARD_TOUCH_PICKUP_CONE = 135;
const CARD_FLICK_MIN_DISTANCE = 6;
const CARD_FLICK_MIN_VELOCITY = 0.20;
const CARD_FLICK_RELEASE_GRACE_MS = 120;
const CARD_FLICK_RECOIL_TOLERANCE = 3;

// Input timestamps reflect when the finger actually moved, unlike handler time,
// which jank (e.g. building the drag preview) can delay and distort.
function pointerEventTime(event) {
    var now = performance.now();
    var stamp = event ? event.timeStamp : null;
    return typeof stamp == "number" && Number.isFinite(stamp) && stamp > 0 &&
        stamp <= now + 1 && now - stamp < 1000 ? stamp : now;
}

function cardTouchDragAxis(x, y) {
    if (Math.max(Math.abs(x), Math.abs(y)) < 8) { return null; }
    if (isUpwardFlick(x, -y, CARD_TOUCH_PICKUP_CONE)) { return "vertical"; }
    if (Math.abs(y) <= Math.abs(x) * Math.tan(Math.PI / 12) + 1e-6) {
        return Math.abs(x) >= 12 ? "horizontal" : null;
    }
    return Math.abs(y) >= Math.max(8, Math.abs(x) * 1.1) ? "vertical" : null;
}

function shouldPlayCardDrag(drag, event) {
    if (!drag.canDragToPlay || drag.axis == "horizontal" ||
        (drag.axis == null && drag.pointerType != "mouse")) { return false; }
    if (drag.didPlayDrag && isCardDropOnTable(event)) { return true; }
    var flick = drag.flickIntent;
    var releaseTime = pointerEventTime(event);
    var flickX = flick ? flick.x : drag.lastFlickX || 0;
    var flickY = flick ? flick.y : drag.lastFlickY ?? drag.lastFlickDistance;
    return drag.canSwipeToPlay && isUpwardFlick(flickX, flickY) &&
        (flick ? flick.distance : drag.lastFlickDistance) >= CARD_FLICK_MIN_DISTANCE &&
        (flick ? flick.velocity : drag.lastFlickVelocity) >= CARD_FLICK_MIN_VELOCITY &&
        (flick ? releaseTime - flick.time <= CARD_FLICK_RELEASE_GRACE_MS :
            drag.lastFlickMoveTime == null ||
            releaseTime - drag.lastFlickMoveTime <= CARD_FLICK_RELEASE_GRACE_MS);
}

function removeCardDragPreview(drag) {
    if (drag.frame != null) { cancelAnimationFrame(drag.frame); drag.frame = null; }
    if (typeof CardDepth != "undefined") { drag.previews.forEach(preview => CardDepth.detach(preview)); }
    drag.cards.forEach((card, index) => {
        // A newer drag may already own this card; leave its state alone.
        if (card._dragPreview != drag.previews[index]) { return; }
        card.classList.remove("is-drag-source");
        delete card._dragPreview;
    });
    drag.layer.remove();
}

function clearCardDragPreview(hand) {
    var drag = hand._cardDragPreview;
    if (!drag) { return; }
    removeCardDragPreview(drag);
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
    // Detach the gliding preview so a new gesture or a hand rebuild cannot cut it short;
    // it removes itself once it has landed back in the hand unless it is caught again.
    hand._cardDragPreview = null;
    hand._returningCardDrag = drag;
    drag.returning = true;
    if (drag.frame != null) { cancelAnimationFrame(drag.frame); drag.frame = null; }
    drag.release = drag.previews.map(preview => ({
        x: parseFloat(preview.style.getPropertyValue("--drag-offset-x")) || 0,
        y: parseFloat(preview.style.getPropertyValue("--drag-offset-y")) || 0,
        scale: parseFloat(preview.style.getPropertyValue("--drag-scale")) || 1,
        tiltX: parseFloat(preview.style.getPropertyValue("--tilt-x")) || 0,
        tiltY: parseFloat(preview.style.getPropertyValue("--tilt-y")) || 0
    }));
    drag.releasePitch = drag.pitch;
    drag.releaseYaw = drag.yaw;
    drag.previews.forEach(preview => {
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
        if (typeof CardDepth != "undefined") { CardDepth.returnToHand(preview); }
    });
    document.getElementById("gameTable").classList.remove("is-card-drop-target");
    // The layer lives outside the hand, so forward presses on the gliding card to it.
    drag.layer.onpointerdown = event => {
        if (drag.returning && typeof hand.onpointerdown == "function") { hand.onpointerdown(event); }
    };
    var token = drag.returnToken = (drag.returnToken || 0) + 1;
    drag.returnTimer = setTimeout(() => {
        // A caught (and possibly re-released) card must not be removed by an older glide.
        if (!drag.returning || drag.returnToken != token) { return; }
        removeCardDragPreview(drag);
        if (hand._returningCardDrag == drag) { hand._returningCardDrag = null; }
    }, 340);
}

// Describes a press on a card that is still gliding back, or on its empty slot in the hand.
function returningCardDragTarget(hand, target) {
    var drag = hand._returningCardDrag;
    if (!drag || !drag.returning || !(target instanceof Element)) { return null; }
    var hit = target.closest(".game-card");
    if (!hit) { return null; }
    var keys = drag.previews.map(preview => preview.dataset.cardKey);
    var onPreview = drag.previews.includes(hit);
    if (!onPreview && (hit.parentElement != hand || !keys.includes(hit.dataset.cardKey))) { return null; }
    return { drag, keys, hitKey: hit.dataset.cardKey, onPreview };
}

function handCardElement(hand, key) {
    return Array.from(hand.querySelectorAll(".game-card"))
        .find(card => card.parentElement == hand && card.dataset.cardKey == key) || null;
}

// Stops a gliding card where it currently is and makes it the active drag again.
// Returns its current offset from the hand, or null when its cards left the hand.
function catchReturningCardDrag(hand, target, event) {
    var drag = target.drag;
    if (hand._returningCardDrag != drag || !drag.returning) { return null; }
    var cards = target.keys.map(key => handCardElement(hand, key));
    if (cards.some(card => card == null)) { return null; }
    var preview = drag.previews[0];
    var bounds = preview.getBoundingClientRect();
    var left = parseFloat(preview.style.left) || 0;
    var top = parseFloat(preview.style.top) || 0;
    var width = parseFloat(preview.style.width) || bounds.width;
    var height = parseFloat(preview.style.height) || bounds.height;
    var x = bounds.left + bounds.width / 2 - (left + width / 2);
    var y = bounds.top + bounds.height / 2 - (top + height / 2);
    var release = drag.release[0];
    var releaseDistance = Math.hypot(release.x, release.y);
    // One transform transition drives offset, scale and tilt with the same easing,
    // so the remaining offset tells how far the rest of the glide has progressed.
    var remaining = releaseDistance > 0
        ? Math.max(0, Math.min(1, Math.hypot(x, y) / releaseDistance)) : 0;
    clearCardDragPreview(hand);
    clearTimeout(drag.returnTimer);
    drag.returning = false;
    drag.layer.onpointerdown = null;
    hand._returningCardDrag = null;
    drag.previews.forEach((preview, index) => {
        var start = drag.release[index];
        preview.classList.remove("is-returning");
        preview.style.setProperty("--drag-offset-x", `${x}px`);
        preview.style.setProperty("--drag-offset-y", `${y}px`);
        preview.style.setProperty("--drag-scale", `${1 + (start.scale - 1) * remaining}`);
        preview.style.setProperty("--tilt-x", `${(start.tiltX * remaining).toFixed(2)}deg`);
        preview.style.setProperty("--tilt-y", `${(start.tiltY * remaining).toFixed(2)}deg`);
        if (typeof CardDepth != "undefined") {
            CardDepth.cancelFollow(preview);
            CardDepth.update(preview, { pitch: start.tiltX * remaining, yaw: start.tiltY * remaining, lift: 18 });
        }
    });
    drag.pitch = drag.targetPitch = (drag.releasePitch || 0) * remaining;
    drag.yaw = drag.targetYaw = (drag.releaseYaw || 0) * remaining;
    drag.pointerX = drag.sampledX = event.clientX;
    drag.pointerY = drag.sampledY = event.clientY;
    drag.lastFrameTime = null;
    drag.cards = cards;
    cards.forEach((card, index) => {
        card.classList.add("is-drag-source");
        card._dragPreview = drag.previews[index];
    });
    hand._cardDragPreview = drag;
    return { x, y };
}

function stopCardHandInertia() {
    cardHandScrollVersion++;
    if (cardHandInertiaFrame != null) {
        cancelAnimationFrame(cardHandInertiaFrame);
        cardHandInertiaFrame = null;
    }
}

function animateHandScroll(element, targetScrollLeft, duration = null) {
    stopCardHandInertia();
    var startScrollLeft = element.scrollLeft;
    // Small corrections otherwise spend most frames rounding to the same scroll pixel.
    if (duration == null) {
        duration = Math.max(180, Math.min(700,
            700 * Math.sqrt(Math.abs(targetScrollLeft - startScrollLeft) / 700)));
    }
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
