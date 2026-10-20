(
    function () {
        var currentGame = null;
        var currentPlayerName = null;
        var playerPresidentWins = 0;
        var playerRoundsPlayed = 0;
        var playerWinsRequest = 0;
        var playerWinsName = null;
        var playerWinsLoading = false;
        var playerWinsError = false;
        var pendingNewGameName = false;
        var currentGameSubscription = null;
        var currentGameListener = null;
        var connection = null;
        var resumeStorageKey = "norwegian-tycoon-active-game";
        var resumeSubscription = null;
        var resumeListener = null;
        var resumeSnapshot = null;
        var resumeSeat = null;
        var resumeExpiryTimer = null;
        function readResumableGame() {
            try {
                var saved = JSON.parse(localStorage.getItem(resumeStorageKey) || "null");
                return saved && /^[1-9]\d{0,5}$/.test(saved.id) &&
                    typeof saved.name == "string" && saved.playerKey == getPlayerKey() ? saved : null;
            } catch (error) {
                console.warn("Kunne ikke lese lagret spill.", error);
                return null;
            }
        }
        function updateResumeButton() {
            var saved = readResumableGame();
            var seat = saved && JSON.stringify([saved.id, saved.name, saved.playerKey]);
            if (seat != null && seat == resumeSeat) { return; }
            if (resumeSubscription) { resumeSubscription.off("value", resumeListener); }
            if (resumeExpiryTimer != null) { clearTimeout(resumeExpiryTimer); resumeExpiryTimer = null; }
            resumeSubscription = null;
            resumeListener = null;
            resumeSnapshot = null;
            resumeSeat = seat;
            document.getElementById("resumeGameButton").hidden = true;
            if (!saved) { return; }
            var ref = firebase.database().ref(`boms_1/${saved.id}`);
            resumeSubscription = ref;
            resumeListener = function (snapshot) {
                if (resumeSeat != seat) { return; }
                var latest = readResumableGame();
                if (!latest || JSON.stringify([latest.id, latest.name, latest.playerKey]) != seat) {
                    updateResumeButton();
                    return;
                }
                resumeSnapshot = snapshot;
                if (resumeExpiryTimer != null) { clearTimeout(resumeExpiryTimer); resumeExpiryTimer = null; }
                var record = snapshot.val();
                var player = record && (record.spillere || []).find(candidate =>
                    candidate.nick == saved.name && candidate.spillerKey == saved.playerKey);
                if (!record || GamePresence.isExpired(record) || !player || player.gaveUp) {
                    if (record && record.status != "V" && GamePresence.isExpired(record)) {
                        voidExpiredSession(ref);
                    }
                    forgetActiveGame();
                    return;
                }
                document.getElementById("resumeGameButton").hidden = false;
                var lastAction = GamePresence.lastActivityAt(record);
                if (lastAction != null) {
                    resumeExpiryTimer = setTimeout(() => {
                        if (resumeSeat == seat) { resumeListener(snapshot); }
                    },
                        Math.max(1, lastAction + GamePresence.sessionMs + 1 - GamePresence.now()));
                }
            };
            ref.on("value", resumeListener, function (error) {
                if (resumeSeat != seat) { return; }
                document.getElementById("resumeGameButton").hidden = true;
                console.warn("Kunne ikke kontrollere lagret spill.", error);
            });
        }
        function voidExpiredSession(ref) {
            ref.transaction(record => record && GamePresence.isExpired(record) && record.status != "V"
                ? GamePresence.reconcile(record, GamePresence.now()) : undefined, undefined, false)
                .then(result => {
                    if (result.committed) {
                        return firebase.database().ref(`${PUBLIC_LOBBY_PATH}/${ref.key}`).remove();
                    }
                })
                .catch(error => console.warn("Kunne ikke avslutte utløpt spill.", error));
        }
        function updateSessionClock(snapshot) {
            GamePresence.serverOffset = Number(snapshot.val()) || 0;
            if (resumeListener && resumeSnapshot) { resumeListener(resumeSnapshot); }
        }
        function rememberActiveGame(player) {
            try {
                localStorage.setItem(resumeStorageKey, JSON.stringify({
                    id: String(currentGame.id), name: player.name, playerKey: player.playerKey
                }));
            } catch (error) {
                console.warn("Kunne ikke huske aktivt spill.", error);
            }
            updateResumeButton();
        }
        function forgetActiveGame() {
            try { localStorage.removeItem(resumeStorageKey); }
            catch (error) { console.warn("Kunne ikke fjerne lagret spill.", error); }
            updateResumeButton();
        }
        function updateTurnTimer() {
            var timer = document.getElementById("turnTimer");
            var countdown = document.getElementById("turnCountdown");
            var extend = document.getElementById("extendTurnButton");
            if (!timer || !countdown || !extend) { return; }
            var player = currentGame && currentGame.getPlayer(currentPlayerName);
            var controlled = player && GamePresence.isBot(currentGame, player);
            var deadline = player && (currentGame.actionDeadlines || {})[GamePresence.playerId(player)];
            var timerActive = !!currentGame &&
                GamePresence.activeHumanCount(currentGame) > 1 &&
                (currentGame.status == "S" || currentGame.status == "G");
            var now = connection ? connection.now() : Date.now();
            var offer = activeTradeOffer(currentGame);
            if (offer) {
                var offerRemaining = offer.offerUntil == null ? 120 :
                    Math.max(0, Math.ceil((offer.offerUntil - now) / 1000));
                countdown.textContent = `${Math.floor(offerRemaining / 60)}:${String(offerRemaining % 60).padStart(2, "0")}`;
                timer.hidden = false;
                countdown.hidden = false;
                extend.hidden = true;
                return;
            }
            var canAct = timerActive && !GamePresence.isActionPaused(currentGame, now);
            var timerDeadline = canAct && (currentGame.players || [])
                .filter(candidate => !candidate.gaveUp && !GamePresence.isBot(currentGame, candidate))
                .map(candidate => (currentGame.actionDeadlines || {})[GamePresence.playerId(candidate)])
                .filter(candidateDeadline => !!candidateDeadline)
                .sort((first, second) => first.until - second.until)[0];
            var active = !!player && !!deadline && !controlled && canAct;
            var ownRemaining = active ? Math.max(0, Math.ceil((deadline.until - now) / 1000)) : 0;
            var remaining = timerActive && timerDeadline
                ? Math.max(0, Math.ceil((timerDeadline.until - now) / 1000))
                : 0;
            var seconds = remaining % 60;
            var text = timerActive
                ? (timerDeadline
                    ? `${Math.floor(remaining / 60)}:${seconds < 10 ? "0" : ""}${seconds}`
                    : "–:–")
                : "";
            if (countdown.textContent != text) { countdown.textContent = text; }
            countdown.hidden = !timerActive;
            timer.hidden = !timerActive;
            extend.hidden = !active || ownRemaining == 0 || ownRemaining > 30 ||
                deadline.extended || GamePresence.hasExtendedThisRound(currentGame, player);
            extend.disabled = !currentGame || currentGame.connectionOnline === false;
        }
        function refreshConnectionView() {
            if (!currentGame || !currentGame.players) { return; }
            var player = currentGame.getPlayer(currentPlayerName);
            var controlled = player && GamePresence.isBot(currentGame, player);
            var online = currentGame.connectionOnline !== false;
            if (connection && connection.online && currentGame.isPublic && isLobbyHost(currentGame)) {
                if (!connection.listingHost) {
                    connection.listingHost = true;
                    currentGame.updatePublicListing();
                }
            } else if (connection) {
                connection.listingHost = false;
            }
            GameLayout.updatePlayers(currentGame, player);
            updateFastForwardButton();
            updateTurnTimer();
            updateTurnSpeedButtons();
            if (currentGame.turnPause?.presentationVersion == 1 &&
                currentGame.presentationCompletedPauseId == currentGame.turnPause.id) {
                publishPresentationReady(currentGame, currentGame.turnPause);
            }
            currentGame.expireOptionalTrades();
            var reclaim = document.getElementById("reclaimSeatButton");
            reclaim.hidden = !controlled || !player || player.playerKey == "PC";
            reclaim.disabled = !online;
            document.getElementById("playerHand").inert = !online || !!controlled;
            document.getElementById("gameTable").inert = !online || !!controlled;
            document.getElementById("exchangeActions").inert = !online || !!controlled || currentGame.localWritePending === true;
            if (controlled) { document.getElementById("exchangeActions").hidden = true; }
            if (!online || controlled || currentGame.localWritePending) {
                document.getElementById("passButton").disabled = true;
            } else {
                document.getElementById("passButton").disabled = false;
            }
            scheduleBotLoop();
        }
        var turnPauseRefreshTimer = null;
        var roundVoteRefreshTimer = null;
        var gameEndVoteRefreshTimer = null;
        var gameToastTimer = null;
        var archivedToasts = [];
        var gameToastExpiresAt = 0;
        var lastShownTurnPauseId = null;
        var activeToastPauseId = null;
        var clearingPauseId = null;
        var gameLogGameId = null;
        var gameLogEntries = [];
        var gameLogTrickCount = 0;
        var gameLogNeedsTrickHeader = true;
        var appShell = document.getElementById("gameShell");
        var gameMenuToggle = document.getElementById("BnGameMenuToggle");
        var gameMenu = document.getElementById("gameMenu");
        var playerNameCookie = "norwegian_tycoon_player_name";
        document.addEventListener("lobby-player-error", function (event) {
            if (event.detail.game == currentGame) {
                showGameToast(event.detail.message, currentGame);
            }
        });

        function readLastUsedPlayerName() {
            var name = getCookie(playerNameCookie);
            if (name == "") { return ""; }
            try {
                return sanitizePlayerName(decodeURIComponent(name)).trim();
            } catch (error) {
                console.warn("Kunne ikke lese lagret spillernavn fra cookie.", error);
                return "";
            }
        }

        function saveLastUsedPlayerName(name) {
            setCookie(playerNameCookie, encodeURIComponent(name), 365);
            updateSavedPlayerName();
        }

        function updateSavedPlayerName() {
            var name = readLastUsedPlayerName();
            GameLayout.savedPlayerName = name;
            if (currentGame == null) {
                GameLayout.cardStylePlayerName = name;
                document.documentElement.dataset.cardStyle = GameLayout.cardStyle();
            }
            var splashName = document.getElementById("splashPlayerName");
            var key = getPlayerKey();
            var pinProfile = getCookie("playerPinProfile");
            var hasPinProfile = pinProfile == encodeURIComponent(JSON.stringify([PlayerIdentity.normalizeName(name), key]));
            splashName.textContent = name + (name && hasPinProfile ? ` · ID ${key}` : "");
            splashName.hidden = name == "";
            document.getElementById("settingsPlayerName").textContent = name;
        }

        function promptForPlayerName(isRename = false, errorMessage = "") {
            document.querySelector("#dialogSporOmNick .dialog-title").textContent =
                isRename ? "Bytt spillernavn" : "Hva vil du hete?";
            document.getElementById("dialogSporOmNickTxt").value =
                isRename && currentPlayerName != null
                    ? currentPlayerName
                    : readLastUsedPlayerName();
            document.getElementById("playerNameError").textContent = errorMessage;
            document.getElementById("dialogSporOmNickTxt").classList.remove("input-soft-error");
            document.getElementById("dialogSporOmNickTxt").setAttribute("aria-invalid", "false");
            document.getElementById("playerRecoveryPin").value = "";
            document.getElementById("playerRecoveryPin").classList.remove("input-soft-error");
            document.getElementById("playerRecoveryPin").setAttribute("aria-invalid", "false");
            document.getElementById("playerUsePin").setAttribute("aria-pressed", "false");
            document.getElementById("playerPinFields").hidden = true;
            document.getElementById("dialogSporOmNickOk").textContent =
                isRename ? "Lagre navn" : "Bli spiller";
            showDialog("SporOmNick", true);
        }

        var pendingSpectatorJoinName = null;

        async function joinRememberedPlayerOrPrompt() {
            pendingSpectatorJoinName = null;
            var rememberedName = readLastUsedPlayerName();
            if (currentGame.status == "S" || currentGame.status == "G") {
                var alreadyPlaying = currentGame.players.some(player =>
                    player.playerKey == getPlayerKey()
                );
                if (!alreadyPlaying) {
                    // Spectate until the round is over, then join automatically.
                    pendingSpectatorJoinName = rememberedName != "" ? rememberedName : null;
                    showSpectatorJoinToast();
                    registerWaitingSpectator(currentGame);
                    if (rememberedName == "") { promptForPlayerName(); }
                    return;
                }
            }
            if (rememberedName != "") {
                var joiningGame = currentGame;
                var result = await joiningGame.addPlayer(
                    new PresidentPlayer(rememberedName, getPlayerKey())
                );
                if (currentGame != joiningGame) { return; }
                if (result.player) {
                    currentPlayerName = result.player.name;
                    pendingNewGameName = false;
                    saveLastUsedPlayerName(currentPlayerName);
                    GameLayout.updateSharedView(currentGame, result.player);
                    GameLayout.updatePlayerView(currentGame, result.player);
                    scheduleBotLoop();
                    return;
                }
                promptForPlayerName(false, result.text);
                return;
            }
            promptForPlayerName();
        }

        var spectatorJoinPending = false;
        var waitingSpectatorRef = null;
        var spectatorJoinToastTimer = null;
        function showSpectatorJoinToast() {
            if (gameToastsHidden()) { return; }
            var toast = document.getElementById("spectatorJoinToast");
            if (spectatorJoinToastTimer != null) { clearTimeout(spectatorJoinToastTimer); }
            toast.replaceChildren();
            appendColoredGameMessage(toast, localizedMessage("Spillet pågår. Du ser på til neste runde."), [], true);
            toast.classList.add("is-visible");
            spectatorJoinToastTimer = setTimeout(function () {
                toast.classList.remove("is-visible");
                spectatorJoinToastTimer = null;
            }, 3000);
        }
        async function clearWaitingSpectator() {
            var ref = waitingSpectatorRef;
            waitingSpectatorRef = null;
            if (ref == null) { return; }
            try {
                await ref.remove();
            } catch (error) {
                console.error("Kunne ikke fjerne ventende tilskuer.", error);
            }
        }
        async function registerWaitingSpectator(game) {
            if (waitingSpectatorRef != null) { return; }
            var ref = game.databaseRef.child("waitingSpectators").push();
            waitingSpectatorRef = ref;
            try {
                await ref.onDisconnect().remove();
                if (waitingSpectatorRef != ref || currentGame != game) { return; }
                await ref.set({ playerKey: getPlayerKey() });
                if (waitingSpectatorRef != ref || currentGame != game) { await ref.remove(); }
            } catch (error) {
                console.error("Kunne ikke registrere ventende tilskuer.", error);
                if (waitingSpectatorRef == ref) {
                    await clearWaitingSpectator();
                    showGameToast("Kunne ikke registrere deg som ventende spiller.", game);
                }
            }
        }
        async function tryJoinWaitingSpectator(game) {
            if (pendingSpectatorJoinName == null || currentGame != game ||
                currentPlayerName != null || spectatorJoinPending ||
                game.gameEndVote != null || game.roundStartVote != null ||
                (game.status != "O" && game.status != "F")) {
                return;
            }
            spectatorJoinPending = true;
            var result = await game.addPlayer(
                new PresidentPlayer(pendingSpectatorJoinName, getPlayerKey())
            );
            spectatorJoinPending = false;
            if (currentGame != game) { return; }
            if (result.player) {
                pendingSpectatorJoinName = null;
                currentPlayerName = result.player.name;
                clearWaitingSpectator();
                saveLastUsedPlayerName(currentPlayerName);
                GameLayout.updateSharedView(game, result.player);
                GameLayout.updatePlayerView(game, result.player);
            } else {
                pendingSpectatorJoinName = null;
                clearWaitingSpectator();
                showGameToast(result.text, game);
            }
        }

        function connectAndPromptForPlayerName() {
            var shouldJoin = true;
            connectGame(function () {
                if (shouldJoin && currentGame != null) {
                    shouldJoin = false;
                    joinRememberedPlayerOrPrompt();
                }
            });
        }

        function toggleAutoSuggestion() {
            autoSuggestPlayableCards = !autoSuggestPlayableCards;
            setCookie("AutoSuggestPlayableCards", autoSuggestPlayableCards, 365);
            updateAutoSuggestionButton();
            var player = currentGame == null || currentPlayerName == null
                ? null
                : currentGame.getPlayer(currentPlayerName);
            if (player == null) { return; }
            if (autoSuggestPlayableCards) {
                autoSelectedTurnKey = null;
            } else {
                var selectionIsAutoSuggested = autoSuggestedCardKeys.size > 0 &&
                    autoSuggestedCardKeys.size == selectedCardKeys.size &&
                    Array.from(autoSuggestedCardKeys).every(cardKey =>
                        selectedCardKeys.has(cardKey)
                    );
                if (selectionIsAutoSuggested) {
                    clearCardSelection();
                }
            }
            GameLayout.updateHand(currentGame, player);
        }

        var STARTER_FLASH_DURATION_MS = 2500;
        var STARTER_FLASH_DURATION_MS = 1900;
        var lastShuffleStartedAt = null;
        var shuffleEndsAt = 0;
        var shuffleTicker = null;
        var starterFlashTimer = null;
        var handDealTimer = null;
        var announcedStarterRound = null;
        var announcedBomsStarterGame = null;

        function clearShuffleAnimation(keepFlash = false) {
            if (shuffleTicker != null) {
                clearInterval(shuffleTicker);
                shuffleTicker = null;
            }
            shuffleEndsAt = 0;
            var overlay = document.getElementById("shuffleOverlay");
            if (overlay != null) { overlay.remove(); }
            var hand = document.getElementById("playerHand");
            if (hand != null) { hand.classList.remove("is-dealing-wait"); }
            if (!keepFlash) {
                if (starterFlashTimer != null) {
                    clearTimeout(starterFlashTimer);
                    starterFlashTimer = null;
                }
                document.querySelectorAll(".player-summary--starter-flash").forEach(element => {
                    element.classList.remove("player-summary--starter-flash");
                });
            }
        }

        function flashRoundStarter() {
            var game = currentGame;
            if (game == null || game.status != "S" ||
                GamePresence.isActionPaused(game, GamePresence.now()) ||
                game.turn < 0 || game.players[game.turn] == null) { return; }
            var roundKey = `${game.id}:${game.round}:${game.shuffleStartedAt}`;
            if (announcedStarterRound == roundKey) { return; }
            announcedStarterRound = roundKey;
            var starter = game.players[game.turn];
            var starterName = starter.name;
            var isFirstBomsStart = starter.lastPlacement == game.players.length &&
                announcedBomsStarterGame != game.id;
            if (isFirstBomsStart) { announcedBomsStarterGame = game.id; }
            showGameToast(isFirstBomsStart
                ? `${starterName} er Boms og starter.`
                : (starterName == currentPlayerName ? "Du begynner" : `${starterName} begynner`), game);
            document.querySelectorAll("#playerList [data-player-name]").forEach(element => {
                element.classList.toggle(
                    "player-summary--starter-flash",
                    element.dataset.playerName == starterName
                );
            });
            if (starterFlashTimer != null) { clearTimeout(starterFlashTimer); }
            starterFlashTimer = setTimeout(() => {
                starterFlashTimer = null;
                document.querySelectorAll(".player-summary--starter-flash").forEach(element => {
                    element.classList.remove("player-summary--starter-flash");
                });
            }, STARTER_FLASH_DURATION_MS + 100);
        }

        function dealCardsIntoHand() {
            var hand = document.getElementById("playerHand");
            if (hand == null) { return; }
            hand.classList.remove("is-dealing-wait");
            var cards = hand.querySelectorAll(".game-card");
            cards.forEach((card, index) => card.style.setProperty("--deal-index", String(index)));
            hand.classList.add("is-dealing-in");
            if (handDealTimer != null) { clearTimeout(handDealTimer); }
            handDealTimer = setTimeout(() => {
                handDealTimer = null;
                hand.classList.remove("is-dealing-in");
            }, 600 + cards.length * 45);
        }

        function playShuffleAnimation(game) {
            clearShuffleAnimation();
            var startedAt = game.shuffleStartedAt;
            var overlay = document.createElement("div");
            overlay.id = "shuffleOverlay";
            overlay.className = "shuffle-overlay";
            overlay.setAttribute("role", "status");
            overlay.setAttribute("aria-label", "Stokker kortene");
            var stack = document.createElement("div");
            stack.className = "shuffle-stack";
            for (var i = 0; i < 8; i++) {
                var card = document.createElement("div");
                card.className = "shuffle-card";
                card.setAttribute("aria-hidden", "true");
                card.style.setProperty("--shuffle-index", String(i));
                stack.appendChild(card);
            }
            var label = document.createElement("div");
            label.className = "shuffle-label";
            label.textContent = "Stokker kortene …";
            overlay.append(stack, label);
            document.body.appendChild(overlay);
            var hand = document.getElementById("playerHand");
            if (hand != null) { hand.classList.add("is-dealing-wait"); }
            shuffleEndsAt = startedAt + SHUFFLE_DURATION_MS;
            shuffleTicker = setInterval(function () {
                if (currentGame != game) {
                    clearShuffleAnimation();
                    return;
                }
                if (Date.now() - startedAt >= SHUFFLE_DURATION_MS) {
                    clearShuffleAnimation(true);
                    refreshAfterTurnPause(game);
                    dealCardsIntoHand();
                    flashRoundStarter();
                }
            }, 40);
        }

        function playShuffleIfNew(game) {
            if (game == null || game.shuffleStartedAt == null ||
                game.shuffleStartedAt == lastShuffleStartedAt) { return; }
            lastShuffleStartedAt = game.shuffleStartedAt;
            var elapsed = Math.max(0, Date.now() - game.shuffleStartedAt);
            if (elapsed < SHUFFLE_DURATION_MS) {
                playShuffleAnimation(game);
            }
        }

        function startNewGame(isPublic = false) {
            currentGame = new PresidentGame(null, isPublic === true);
            currentPlayerName = null;
            pendingNewGameName = true;
            resetGameLog(currentGame);
            connectAndPromptForPlayerName();
        }

        function startRoundInCurrentGame() {
            if (currentGame == null || (currentGame.status != "O" && currentGame.status != "F")) { return; }
            if (!isLobbyHost(currentGame)) {
                showGameToast("Bare verten kan starte spillet.", currentGame);
                return;
            }
            if (currentGame.status == "O" && !currentGame.allHumansReady()) {
                showGameToast("Alle menneskespillere må være klare.", currentGame);
                return;
            }
            if (currentGame.status == "O" && currentGame.players.length < 2) { return; }
            if (currentGame.status == "F") {
                if (currentGame.roundStartVote != null) {
                    handleRoundStartVote(currentGame);
                    return;
                }
                if (currentGame.gameEndVote == null) {
                    currentGame.beginGameEndVote();
                    GameLayout.updateSharedView(
                        currentGame,
                        currentGame.getPlayer(currentPlayerName)
                    );
                    GameLayout.updatePlayerView(
                        currentGame,
                        currentGame.getPlayer(currentPlayerName)
                    );
                }
                handleGameEndVote(currentGame);
                return;
            }
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            if (roundVoteRefreshTimer != null) {
                clearTimeout(roundVoteRefreshTimer);
                roundVoteRefreshTimer = null;
            }
            if (gameEndVoteRefreshTimer != null) {
                clearTimeout(gameEndVoteRefreshTimer);
                gameEndVoteRefreshTimer = null;
            }
            hideGameToast();
            lastShownTurnPauseId = null;
            clearingPauseId = null;
            currentGame.roundStartVote = null;
            currentGame.startGame();
            refreshAfterTurnPause(currentGame);
            scheduleBotLoop();
        }

        function disconnectGameListener() {
            if (connection) { connection.stop(); connection = null; }
            if (currentGameSubscription != null && currentGameListener != null) {
                currentGameSubscription.off("value", currentGameListener);
            }
            currentGameSubscription = null;
            currentGameListener = null;
            if (gameEndVoteRefreshTimer != null) {
                clearTimeout(gameEndVoteRefreshTimer);
                gameEndVoteRefreshTimer = null;
            }
        }

        function leaveCurrentGame() {
            var game = currentGame;
            disconnectGameListener();
            clearWaitingSpectator();
            if (spectatorJoinToastTimer != null) {
                clearTimeout(spectatorJoinToastTimer);
                spectatorJoinToastTimer = null;
            }
            document.getElementById("spectatorJoinToast").classList.remove("is-visible");
            receivedCardQueue = [];
            if (receivedCardTimer != null) { clearTimeout(receivedCardTimer); receivedCardTimer = null; }
            document.getElementById("receivedCardsOverlay").hidden = true;
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            if (roundVoteRefreshTimer != null) {
                clearTimeout(roundVoteRefreshTimer);
                roundVoteRefreshTimer = null;
            }
            if (gameEndVoteRefreshTimer != null) {
                clearTimeout(gameEndVoteRefreshTimer);
                gameEndVoteRefreshTimer = null;
            }
            if (gameToastTimer != null) {
                clearTimeout(gameToastTimer);
                gameToastTimer = null;
            }
            hideGameToast();
            lastShuffleStartedAt = null;
            clearShuffleAnimation();
            lastShownTurnPauseId = null;
            clearingPauseId = null;
            if (game != null && currentPlayerName != null) {
                var player = game.getPlayer(currentPlayerName);
                if (player != null) {
                    game.leavePlayer(player);
                }
            }
            currentGame = null;
            forgetActiveGame();
            currentPlayerName = null;
            pendingNewGameName = false;
            pendingSpectatorJoinName = null;
            resetGameLog(null);
            GameLayout.updateSharedView(null, null);
            GameLayout.updatePlayerView(null, null);
        }

        function showConnectGameDialog() {
            document.getElementById("dialogKobleSpillId").value = null;
            document.getElementById("joinGameError").innerHTML = "";
            showDialog("KobleSpill", true);
        }

        function connectToAnotherGame() {
            leaveCurrentGame();
        }

        function gameToastsHidden() {
            return getCookie("HideGameToasts") == "true";
        }

        function updateToastVisibility() {
            var hidden = gameToastsHidden();
            document.getElementById("hideToastsToggleButton").setAttribute("aria-pressed", String(hidden));
            document.querySelector(".setting-speed").hidden = hidden;
            document.getElementById("gameToastRegion").hidden = hidden;
            if (hidden) {
                hideGameToast();
                if (spectatorJoinToastTimer != null) {
                    clearTimeout(spectatorJoinToastTimer);
                    spectatorJoinToastTimer = null;
                }
                document.getElementById("spectatorJoinToast").classList.remove("is-visible");
            }
        }

        function toastExitFrames() {
            var mask = "linear-gradient(to bottom, transparent 33.333%, black 66.667%)";
            return [
                { maskImage: mask, maskSize: "100% 300%", maskPosition: "0% 100%" },
                { maskImage: mask, maskSize: "100% 300%", maskPosition: "0% 0%" }
            ];
        }

        function fadeOutToast(node, onComplete) {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                onComplete();
                return;
            }
            var fast = document.getElementById("gameToastRegion").dataset.animationSpeed == "fast";
            var animation = node.animate(fast ? [
                { opacity: 1 },
                { opacity: 0 }
            ] : toastExitFrames(), {
                duration: fast ? 180 : 320,
                easing: fast ? "ease-out" : "ease-in-out",
                fill: "forwards"
            });
            animation.onfinish = onComplete;
        }

        function hideGameToast(clearHistory = true, animate = false) {
            if (clearHistory) {
                archivedToasts.forEach(entry => { clearTimeout(entry.timer); entry.node.remove(); });
                archivedToasts = [];
                document.querySelectorAll("#gameToastRegion .game-toast--exiting")
                    .forEach(node => node.remove());
            }
            if (gameToastTimer != null) {
                clearTimeout(gameToastTimer);
                gameToastTimer = null;
            }
            var toast = document.getElementById("GameToast");
            toast.getAnimations().filter(animation => animation.effect.target == toast)
                .forEach(animation => animation.cancel());
            if (animate && toast.classList.contains("is-visible")) {
                fadeOutToast(toast, () => hideGameToast(clearHistory));
                return;
            }
            toast.classList.remove("is-visible");
            toast.textContent = "";
            activeToastPauseId = null;
            gameToastExpiresAt = 0;
        }

        function resetGameLog(game) {
            gameLogGameId = game == null ? null : `${game.id}:${game.shuffleStartedAt || ""}`;
            gameLogEntries = [];
            gameLogTrickCount = 0;
            gameLogNeedsTrickHeader = true;
            var log = document.getElementById("gameLogEntries");
            if (log == null) { return; }
            log.replaceChildren();
            if (game != null) {
                var emptyMessage = document.createElement("p");
                emptyMessage.className = "game-log__empty";
                emptyMessage.textContent = localizedMessage("Ingen hendelser ennå.");
                log.appendChild(emptyMessage);
            }
        }

        function ensureGameLog(game) {
            var logKey = game == null ? null : `${game.id}:${game.shuffleStartedAt || ""}`;
            if (gameLogGameId !== logKey) {
                resetGameLog(game);
            }
        }

        function appendColoredGameMessage(container, message, players, separateNotices = false) {
            var appendText = text => container.appendChild(document.createTextNode(
                separateNotices ? text.replace(/([.!?]) +(?=\p{Lu}|$)/gu, "$1\n") : text
            ));
            var position = 0;
            while (position < message.length) {
                var match = null;
                var matchIndex = message.length;
                var isWordChar = character => character != null && /[\p{L}\p{N}_]/u.test(character);
                players.forEach(player => {
                    var index = message.indexOf(player.name, position);
                    while (index >= 0 && (
                        isWordChar(message[index - 1]) ||
                        isWordChar(message[index + player.name.length])
                    )) {
                        index = message.indexOf(player.name, index + 1);
                    }
                    if (index >= 0 &&
                        (index < matchIndex ||
                            (index == matchIndex && match != null && player.name.length > match.name.length))) {
                        match = player;
                        matchIndex = index;
                    }
                });
                if (match == null) {
                    appendText(message.slice(position));
                    break;
                }
                if (matchIndex > position) {
                    appendText(message.slice(position, matchIndex));
                }
                var name = document.createElement("span");
                name.className = "game-toast__player";
                name.style.setProperty("--player-color", match.displayColor);
                name.textContent = match.name;
                container.appendChild(name);
                position = matchIndex + match.name.length;
            }
        }

        function localizedMessage(message) {
            return window.I18n ? window.I18n.msg(message) : message;
        }

        function appendGameLogEntry(entry, animate = true) {
            var log = document.getElementById("gameLogEntries");
            var emptyMessage = log.querySelector(".game-log__empty");
            if (emptyMessage) { emptyMessage.remove(); }
            var item = document.createElement("div");
            if (entry.trick != null) {
                item.className = "game-log__trick";
                if (animate) { item.classList.add("game-log__entry--enter"); }
                item.textContent = localizedMessage(`Stikk ${entry.trick}`);
                log.appendChild(item);
                log.scrollTop = log.scrollHeight;
                return;
            }
            item.className = "game-log__entry";
            if (animate) { item.classList.add("game-log__entry--enter"); }
            appendColoredGameMessage(item, localizedMessage(entry.message), entry.players);
            log.appendChild(item);
            log.scrollTop = log.scrollHeight;
        }

        function showGameLog() {
            if (currentGame == null) { return; }
            ensureGameLog(currentGame);
            var log = document.getElementById("gameLogEntries");
            log.replaceChildren();
            if (gameLogEntries.length == 0) {
                var emptyMessage = document.createElement("p");
                emptyMessage.className = "game-log__empty";
                emptyMessage.textContent = localizedMessage("Ingen hendelser ennå.");
                log.appendChild(emptyMessage);
            } else {
                gameLogEntries.forEach(entry => appendGameLogEntry(entry, false));
            }
            showDialog("Spillogg", true);
            log.scrollTop = log.scrollHeight;
        }

        function receiveSkippedTrades(game, trades) {
            if (!game.notifiedSkippedTrades) { game.notifiedSkippedTrades = new Set(); }
            trades.forEach(trade => {
                if (game.notifiedSkippedTrades.has(trade.id)) { return; }
                game.notifiedSkippedTrades.add(trade.id);
                if (game.skippedTrades != null && trade.recipient == currentPlayerName) {
                    showGameToast(`${trade.sender} valgte å ikke gjennomføre ekstra bytte med deg.`, game);
                }
            });
            game.skippedTrades = trades;
        }

        function notifyStartedTrades(game) {
            if (game.status != "G") { return; }
            if (!game.notifiedTrades) { game.notifiedTrades = new Set(); }
            game.piles.forEach(exchange => {
                if (exchange.kind != "playerTrade" || exchange.mode == "Tilbud") { return; }
                var key = `${game.shuffleStartedAt}:${game.round}:${exchange.tradeId}`;
                var sneaky = hasSneakyConsent(exchange, game);
                var sneakyKey = `${key}:sneaky`;
                if (game.notifiedTrades.has(key) &&
                    (!sneaky || game.notifiedTrades.has(sneakyKey))) { return; }
                var participant = [game.players[exchange.from], game.players[exchange.to]]
                    .some(player => player && player.name == currentPlayerName);
                if (!participant) { return; }
                game.notifiedTrades.add(key);
                if (sneaky) { game.notifiedTrades.add(sneakyKey); }
                showGameToast(sneaky
                    ? "Oooh.. Sneaky.."
                    : "Sneaky-samtykke ikke nådd. Byttet starter med kort 7–J.", game);
            });
        }

        function showGameToast(message, game, duration = game.fastForward === true ? 1000 : GAME_SPEED_MS[currentGameSpeed()], pauseId = null, endsTrick = false) {
            ensureGameLog(game);
            positionArchivedToasts();
            var toast = document.getElementById("GameToast");
            if (toast.classList.contains("is-visible") && Date.now() >= gameToastExpiresAt) {
                hideGameToast(false);
            }

            if (!gameToastsHidden() &&
                document.getElementById("gameToastRegion").dataset.animationSpeed != "fast" &&
                toast.classList.contains("is-visible") && toast.textContent != "") {
                archiveGameToast(toast);
            }
            toast.classList.remove("is-visible");
            toast.getBoundingClientRect();
            toast.replaceChildren();
            var players = game.players.slice().filter(player => player.name)
                .sort((a, b) => b.name.length - a.name.length);
            var logEntry = {
                message: message,
                players: players.map(player => ({
                    name: player.name,
                    displayColor: player.displayColor
                }))
            };
            var logIsOpen = document.getElementById("dialogSpillogg")
                .classList.contains("dialog-container--visible");
            if (gameLogNeedsTrickHeader) {
                var trickEntry = { trick: ++gameLogTrickCount };
                gameLogEntries.push(trickEntry);
                if (logIsOpen) { appendGameLogEntry(trickEntry); }
                gameLogNeedsTrickHeader = false;
            }
            gameLogEntries.push(logEntry);
            if (logIsOpen) {
                appendGameLogEntry(logEntry);
            }
            if (endsTrick) { gameLogNeedsTrickHeader = true; }
            if (gameToastsHidden()) {
                hideGameToast();
                return;
            }
            var progressColors = players.map(player => player.displayColor).filter(Boolean);
            toast.style.setProperty("--toast-duration", `${duration}ms`);
            toast.style.setProperty(
                "--toast-progress-gradient",
                progressColors.length > 0
                    ? `linear-gradient(90deg, ${progressColors.join(", ")})`
                    : "linear-gradient(90deg, var(--success-fill), var(--success), var(--warning))"
            );
            activeToastPauseId = pauseId;
            appendColoredGameMessage(toast, localizedMessage(message), players, true);
            toast.classList.add("is-visible");
            animateToastEntry(toast);
            gameToastExpiresAt = Date.now() + duration;
            if (gameToastTimer != null) {
                clearTimeout(gameToastTimer);
            }
            gameToastTimer = setTimeout(() => hideGameToast(false, true), duration);
        }

        function archiveGameToast(toast) {
            var region = document.getElementById("gameToastRegion");
            var fast = region.dataset.animationSpeed == "fast";
            var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            region.querySelectorAll(".game-toast--exiting").forEach(node => node.remove());
            archivedToasts.forEach(entry => {
                clearTimeout(entry.timer);
                if (fast || reduced) { entry.node.remove(); return; }
                entry.node.classList.add("game-toast--exiting");
                var frames = toastExitFrames();
                var exit = entry.node.animate([
                    { ...frames[0], transform: getComputedStyle(entry.node).transform, opacity: 1 },
                    { ...frames[1], transform: `translateY(-${toast.getBoundingClientRect().height + 6}px)`, opacity: 0 }
                ], { duration: 320, easing: "cubic-bezier(.2,.8,.25,1)", fill: "forwards" });
                exit.onfinish = () => entry.node.remove();
                exit.oncancel = () => entry.node.remove();
            });
            archivedToasts = [];
            var node = toast.cloneNode(true);
            node.removeAttribute("id");
            node.classList.add("game-toast--archived");
            node.setAttribute("aria-hidden", "true");
            node.style.height = `${toast.getBoundingClientRect().height}px`;
            var entry = { node, expiresAt: gameToastExpiresAt, timer: null };
            region.appendChild(node);
            node.style.bottom = fast ? "0px" : "calc(var(--board-toast-height) + 6px)";
            node.style.height = "";
            node.style.width = "";
            node.style.left = "";
            node.style.top = "";
            entry.timer = setTimeout(() => {
                archivedToasts = archivedToasts.filter(item => item != entry);
                if (fast) {
                    node.remove();
                } else {
                    node.classList.add("game-toast--exiting");
                    fadeOutToast(node, () => node.remove());
                }
                positionArchivedToasts();
            }, fast ? 180 : Math.max(0, entry.expiresAt - Date.now()));
            archivedToasts.push(entry);
            if (!reduced) {
                var height = toast.getBoundingClientRect().height;
                var frames = toastExitFrames();
                node.animate(fast ? [
                    { ...frames[0], transform: "scale(1)", opacity: 1 },
                    { ...frames[1], transform: "scale(1.12)", opacity: 0 }
                ] : [
                    { transform: `translateY(${height + 6}px)`, opacity: 1 },
                    { transform: "translateY(0)", opacity: 1 }
                ], { duration: fast ? 180 : 320, easing: "cubic-bezier(.2,.8,.25,1)", fill: "forwards" });
            } else if (fast) {
                clearTimeout(entry.timer);
                node.remove();
                archivedToasts = [];
            }
        }

        function positionArchivedToasts() {
            var region = document.getElementById("gameToastRegion");
            if (!region) { return; }
            var previousSpeed = region.dataset.animationSpeed;
            region.dataset.animationSpeed = currentGame?.fastForward
                ? "fast" : getCookie("AnimationSpeed") || "normal";
            if (region.dataset.animationSpeed == "fast" && previousSpeed != "fast") {
                archivedToasts.forEach(entry => { clearTimeout(entry.timer); entry.node.remove(); });
                archivedToasts = [];
            }
        }

        function animateToastEntry(toast) {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }
            var fast = document.getElementById("gameToastRegion").dataset.animationSpeed == "fast";
            toast.getAnimations().filter(animation => animation.effect.target == toast)
                .forEach(animation => animation.cancel());
            toast.animate([
                { transform: "translateY(12px) scale(.92)", opacity: 0 },
                { transform: "translateY(0) scale(1)", opacity: 1 }
            ], { duration: fast ? 180 : 320, easing: "cubic-bezier(.2,.8,.25,1)" });
        }

        var receivedCardQueue = [];
        var receivedCardTimer = null;
        var seenReceivedCards = new Set();
        function queueReceivedCards(receipt) {
            if (currentGame != receipt.game || currentPlayerName != receipt.recipient) { return; }
            var key = receipt.id == null ? null : `${receipt.game.id}:${receipt.id}`;
            if (key != null && seenReceivedCards.has(key)) { return; }
            if (key != null) { seenReceivedCards.add(key); }
            receivedCardQueue.push(receipt);
            if (receivedCardTimer == null) { showNextReceivedCards(); }
        }
        function receiveExchangeReceipts(game, receipts) {
            receipts.forEach(receipt => {
                if (game.exchangeReceipts == null) {
                    seenReceivedCards.add(`${game.id}:${receipt.id}`);
                } else {
                    queueReceivedCards(Object.assign({}, receipt, {
                        game, cards: receipt.cards.map(card => new PresidentCard(card.suit, card.rank))
                    }));
                }
            });
            game.exchangeReceipts = receipts;
        }
        function showNextReceivedCards() {
            var overlay = document.getElementById("receivedCardsOverlay");
            var receipt = receivedCardQueue.shift();
            if (receipt == null) {
                overlay.hidden = true;
                receivedCardTimer = null;
                return;
            }
            if (currentGame != receipt.game || currentPlayerName != receipt.recipient) {
                showNextReceivedCards();
                return;
            }
            var content = document.getElementById("receivedCardsContent");
            content.replaceChildren();
            var pile = document.createElement("div");
            pile.className = "received-cards__pile";
            receipt.cards.forEach((card, index) => {
                var image = GameLayout.createCardImage(card, null, GameLayout.styleForPlayer(receipt.game, receipt.sender));
                image.style.setProperty("--received-angle", `${(index - (receipt.cards.length - 1) / 2) * 10}deg`);
                image.style.setProperty("--received-index", String(index));
                pile.appendChild(image);
            });
            var message = document.createElement("p");
            var names = receipt.cards.map(card => localizedMessage(card.getName(card.isClubThree())));
            var language = document.documentElement.lang;
            var cardList = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(names);
            var text = language.startsWith("en")
                ? `You received ${cardList} from ${receipt.sender}.`
                : `Du fikk ${cardList} fra ${receipt.sender}.`;
            appendColoredGameMessage(message, text, receipt.game.players);
            content.append(pile, message);
            overlay.hidden = false;
            receivedCardTimer = setTimeout(showNextReceivedCards,
                { fast: 5000, normal: 10000, slow: 15000 }[currentGameSpeed()]);
        }
        document.addEventListener("exchange-cards-received", function (event) {
            queueReceivedCards(event.detail);
        });
        document.getElementById("receivedCardsOverlay").addEventListener("click", function (event) {
            if (event.target != event.currentTarget) { return; }
            if (receivedCardTimer != null) { clearTimeout(receivedCardTimer); }
            showNextReceivedCards();
        });

        function refreshAfterTurnPause(game) {
            if (currentGame != game) { return; }
            var player = game.getPlayer(currentPlayerName);
            GameLayout.updateSharedView(game, player);
            GameLayout.updatePlayerView(game, player);
        }

        document.addEventListener("local-game-action", function (event) {
            var { game, phase } = event.detail;
            if (currentGame != game) { return; }
            if (phase == "failed" || phase == "rejected") {
                showGameToast("Kunne ikke lagre handlingen. Henter spillet på nytt.", game);
                game.connectionOnline = false;
                GameLayout.clearCardFlights();
                refreshConnectionView();
                game.databaseRef.once("value").then(snapshot => {
                    if (currentGame != game) { return; }
                    game.connectionOnline = connection ? connection.online : true;
                    currentGameListener(snapshot);
                }).catch(error => {
                    console.error("Kunne ikke hente spillet etter lagringsfeil.", error);
                    showGameToast("Kunne ikke hente spillet. Koble til på nytt.", game);
                });
                return;
            }
            refreshAfterTurnPause(game);
            handleTurnPause(game);
            updateTurnTimer();
            if (phase == "saved") { scheduleBotLoop(); }
        });

        document.addEventListener("visibilitychange", function () {
            if (!currentGame) { return; }
            if (document.hidden) {
                GameLayout.clearCardFlights();
                var hand = document.getElementById("playerHand");
                if (hand.onpointercancel) { hand.onpointercancel(); }
            }
            if (currentGame.turnPause?.presentationVersion == 1) {
                completeLocalPresentation(currentGame, currentGame.turnPause);
            }
        });
        window.addEventListener("resize", positionArchivedToasts);

        function completeTurnPause(game, pause) {
            if (pause.presentationVersion == 1) {
                completeLocalPresentation(game, pause);
                return;
            }
            if (currentGame != game || game.turnPause == null ||
                game.turnPause.id != pause.id) {
                return;
            }
            if (game.localWritePending) { return; }
            var hasClearedPiles = pause.kind == "clear" &&
                Array.isArray(game.turnPause.clearedPiles) &&
                game.turnPause.clearedPiles.length > 0;
            if (!hasClearedPiles) {
                if (Date.now() < pause.until) {
                    turnPauseRefreshTimer = setTimeout(() => completeTurnPause(game, pause),
                        pause.until - Date.now());
                    return;
                }
                if (pause.pendingGameEnd === true) {
                    if (!GamePresence.canDrive(game, connection ? connection.now() : Date.now())) {
                        refreshAfterTurnPause(game);
                        return;
                    }
                    game.finishGame();
                    game.save();
                    refreshAfterTurnPause(game);
                    handleGameEndVote(game);
                    return;
                }
                refreshAfterTurnPause(game);
                return;
            }
            var table = document.getElementById("gameTable");
            var clearingPauseKey = `${game.id}:${pause.id}`;
            if (table.dataset.animatingPlayedPauseId == clearingPauseKey) {
                table.dataset.pendingClearPauseId = clearingPauseKey;
                return;
            }
            if (clearingPauseId == pause.id) { return; }
            clearingPauseId = pause.id;
            table.dataset.clearingPauseId = clearingPauseKey;
            GameLayout.animateDiscardedCards(
                table,
                function () {
                    if (currentGame != game || game.turnPause == null ||
                        game.turnPause.id != pause.id) {
                        if (clearingPauseId == pause.id) { clearingPauseId = null; }
                        if (table.dataset.clearingPauseId == clearingPauseKey) {
                            delete table.dataset.clearingPauseId;
                        }
                        return;
                    }
                    delete game.turnPause.clearedPiles;
                    if (clearingPauseId == pause.id) { clearingPauseId = null; }
                    delete table.dataset.clearingPauseId;
                    var pendingGameEnd = game.turnPause.pendingGameEnd === true;
                    if (GamePresence.canDrive(game, connection ? connection.now() : Date.now())) {
                        if (pendingGameEnd && Date.now() >= pause.until) { game.finishGame(); }
                        game.save();
                    }
                    refreshAfterTurnPause(game);
                    if (pendingGameEnd && Date.now() >= pause.until) { handleGameEndVote(game); }
                    if (Date.now() < pause.until) { handleTurnPause(game); }
                }
            );
        }

        document.getElementById("gameTable").addEventListener(
            "played-cards-animation-complete",
            function (event) {
                var table = document.getElementById("gameTable");
                var pauseId = event.detail && event.detail.pauseId;
                if (pauseId == null || table.dataset.pendingClearPauseId != pauseId) {
                    return;
                }
                delete table.dataset.pendingClearPauseId;
                var game = currentGame;
                if (game != null && game.turnPause != null &&
                    `${game.id}:${game.turnPause.id}` == pauseId) {
                    completeTurnPause(game, game.turnPause);
                }
            }
        );

        function handleTurnPause(game) {
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            var pause = game.turnPause;
            if (pause == null) { return; }
            if (pause.presentationVersion == 1) {
                if (pause.id != lastShownTurnPauseId) {
                    lastShownTurnPauseId = pause.id;
                    showGameToast(pause.message, game, undefined, pause.id, pause.kind == "clear");
                    if (pause.extraMessage) { showGameToast(pause.extraMessage, game, undefined, pause.id); }
                }
                completeLocalPresentation(game, pause);
                return;
            }
            var delay = pause.until - Date.now();
            if (game.fastForward === true && activeToastPauseId == pause.id &&
                gameToastExpiresAt > pause.until) {
                clearTimeout(gameToastTimer);
                gameToastExpiresAt = pause.until;
                gameToastTimer = setTimeout(hideGameToast, Math.max(0, delay));
            }
            if (pause.id != lastShownTurnPauseId) {
                lastShownTurnPauseId = pause.id;
                if (delay > 0) {
                    var duration = game.fastForward === true ? Math.min(delay, 1000) : currentGameSpeed() == "fast"
                        ? Math.min(delay, GAME_SPEED_MS.fast)
                        : GAME_SPEED_MS[currentGameSpeed()];
                    showGameToast(pause.message, game, duration, pause.id, pause.kind == "clear");
                    if (pause.extraMessage) {
                        showGameToast(pause.extraMessage, game, duration, pause.id);
                    }
                    if (game.fastForward === true || currentGameSpeed() == "fast") {
                        gameToastExpiresAt = Math.min(gameToastExpiresAt, pause.until);
                    }
                }
            }
            var clearStartsAt = pause.kind == "clear" && (pause.clearedPiles || []).length > 0
                ? clearAnimationStartsAt(pause) : pause.until;
            var nextDelay = Math.max(0, clearStartsAt - Date.now());
            if (nextDelay > 0) {
                turnPauseRefreshTimer = setTimeout(function () {
                    turnPauseRefreshTimer = null;
                    if (currentGame != game || game.turnPause == null || game.turnPause.id != pause.id) { return; }
                    completeTurnPause(game, pause);
                }, nextDelay);
            } else {
                completeTurnPause(game, pause);
            }
        }

        var presentationSnapshots = [];
        var completingPresentationId = null;
        var readinessInFlight = null;
        function completeLocalPresentation(game, pause) {
            if (currentGame != game || game.turnPause?.id != pause.id) { return; }
            var table = document.getElementById("gameTable");
            if (table.dataset.animatingPlayedPauseId == `${game.id}:${pause.id}`) {
                table.dataset.pendingClearPauseId = `${game.id}:${pause.id}`;
                return;
            }
            var finish = function () {
                if (currentGame != game || game.turnPause?.id != pause.id) { return; }
                completingPresentationId = null;
                delete table.dataset.clearingPauseId;
                game.presentationCompletedPauseId = pause.id;
                refreshAfterTurnPause(game);
                publishPresentationReady(game, pause);
                if (presentationSnapshots.length > 0) {
                    var snapshot = presentationSnapshots.shift();
                    currentGameListener(snapshot);
                }
                scheduleBotLoop();
            };
            if (game.presentationCompletedPauseId == pause.id) {
                publishPresentationReady(game, pause);
                if (presentationSnapshots.length > 0) {
                    currentGameListener(presentationSnapshots.shift());
                }
                return;
            }
            if (completingPresentationId == pause.id) { return; }
            completingPresentationId = pause.id;
            if (pause.kind == "clear") {
                table.dataset.clearingPauseId = `${game.id}:${pause.id}`;
                GameLayout.animateDiscardedCards(table, finish);
            } else {
                finish();
            }
        }

        function publishPresentationReady(game, pause) {
            if (currentGame != game || game.turnPause?.id != pause.id ||
                game.presentationCompletedPauseId != pause.id ||
                game.localWritePending || game.connectionOnline === false ||
                readinessInFlight == pause.id) { return; }
            var player = game.getPlayer(currentPlayerName);
            var next = game.players[game.turn];
            if (pause.pendingGameEnd) {
                if (GamePresence.canDrive(game, GamePresence.now())) {
                    var remaining = pause.botUntil - GamePresence.now();
                    if (remaining > 0) {
                        if (turnPauseRefreshTimer != null) { clearTimeout(turnPauseRefreshTimer); }
                        turnPauseRefreshTimer = setTimeout(() => publishPresentationReady(game, pause), remaining);
                    } else {
                        game.finishGame();
                        game.save();
                    }
                }
                return;
            }
            if (!player || player != next || GamePresence.isBot(game, player) ||
                player.playerKey != getPlayerKey() || pause.readyAt != null) { return; }
            readinessInFlight = pause.id;
            game.databaseRef.transaction(record => {
                if (!record || record.turnPause?.id != pause.id || record.turnPause.readyAt != null ||
                    record.status != "S") { return; }
                var actor = record.spillere[record.sinTur];
                if (!actor || actor.nick != player.name || actor.spillerKey != getPlayerKey() ||
                    (record.controllers || {})[GamePresence.playerId(actor)]) { return; }
                var now = GamePresence.now();
                return Object.assign({}, record, {
                    turnPause: Object.assign({}, record.turnPause, { readyAt: now, until: now })
                });
            }, undefined, false).catch(error => {
                console.error("Kunne ikke melde at kortanimasjonen er ferdig.", error);
                showGameToast("Kunne ikke oppdatere turen. Prøver igjen.", game);
            }).finally(() => { readinessInFlight = null; });
        }

        function handleRoundStartVote(game) {
            if (roundVoteRefreshTimer != null) {
                clearTimeout(roundVoteRefreshTimer);
                roundVoteRefreshTimer = null;
            }
            var vote = game.roundStartVote;
            if (vote == null) { return; }
            if (isLobbyHost(game) && vote.result == null) {
                game.resolveNeutralRoundVote();
                if (game.roundStartVote == null || game.roundStartVote.id != vote.id) { return; }
            }
            if (vote.result != null) {
                game.claimNeutralRoundStart();
                return;
            }
            var remaining = vote.until - Date.now();
            var humanPlayers = game.players.filter(player => !GamePresence.isBot(game, player));
            var humanIds = new Set(humanPlayers.map(roundVotePlayerId));
            var voteMap = new Map();
            (Array.isArray(vote.votes) ? vote.votes : []).forEach(playerVote => {
                if (humanIds.has(playerVote.playerId)) {
                    voteMap.set(playerVote.playerId, playerVote.neutral === true);
                }
            });
            var countdown = document.getElementById("roundStartVoteCountdown");
            if (countdown) {
                countdown.textContent =
                    `${voteMap.size} av ${humanPlayers.length} har stemt.` +
                    (remaining > 0 ? ` ${Math.ceil(remaining / 1000)} sekunder igjen.` : "");
            }
            if (remaining <= 0) {
                game.resolveNeutralRoundVote(true);
                return;
            }
            roundVoteRefreshTimer = setTimeout(function () {
                roundVoteRefreshTimer = null;
                if (currentGame != game || game.roundStartVote == null ||
                    game.roundStartVote.id != vote.id) {
                    return;
                }
                handleRoundStartVote(game);
            }, Math.min(1000, remaining));
        }

        function handleGameEndVote(game) {
            if (gameEndVoteRefreshTimer != null) {
                clearTimeout(gameEndVoteRefreshTimer);
                gameEndVoteRefreshTimer = null;
            }
            if (currentGame != game || game.status != "F" || game.roundStartVote != null) {
                return;
            }
            if (game.gameEndVote == null) {
                game.beginGameEndVote();
                var player = game.getPlayer(currentPlayerName);
                GameLayout.updateSharedView(game, player);
                GameLayout.updatePlayerView(game, player);
            }
            var vote = game.gameEndVote;
            if (vote == null) { return; }
            if (isLobbyHost(game) && vote.result == null) {
                game.resolveGameEndVote();
                if (game.gameEndVote == null || game.gameEndVote.id != vote.id) { return; }
            }
            if (vote.started === true) { return; }
            if (vote.result != null) {
                game.claimGameEndVote();
                return;
            }
            var remaining = vote.until - Date.now();
            var humanPlayers = game.players.filter(player => !GamePresence.isBot(game, player));
            var humanIds = new Set(humanPlayers.map(roundVotePlayerId));
            var voteIds = new Set();
            (Array.isArray(vote.votes) ? vote.votes : []).forEach(playerVote => {
                if (humanIds.has(playerVote.playerId) &&
                    (playerVote.choice == "lobby" || playerVote.choice == "next_round")) {
                    voteIds.add(playerVote.playerId);
                }
            });
            var countdown = document.getElementById("gameEndVoteCountdown");
            if (countdown) {
                countdown.textContent =
                    `${voteIds.size} av ${humanPlayers.length} har stemt.` +
                    (remaining > 0 ? ` ${Math.ceil(remaining / 1000)} sekunder igjen.` : "");
            }
            if (remaining <= 0) {
                game.resolveGameEndVote(true);
                return;
            }
            var voteId = vote.id;
            gameEndVoteRefreshTimer = setTimeout(function () {
                gameEndVoteRefreshTimer = null;
                if (currentGame != game || game.gameEndVote == null ||
                    game.gameEndVote.id != voteId) {
                    return;
                }
                handleGameEndVote(game);
            }, Math.min(1000, remaining));
        }

        function dismissGameToast() {
            hideGameToast(true, true);
        }

        function clearSelectedCardsFromBackground(event) {
            if (!(event.target instanceof Element) ||
                event.target.closest("button, a, input, select, textarea, [role='button']")) {
                return;
            }
            if (document.getElementById("GameToast").classList.contains("is-visible")) {
                dismissGameToast();
                return;
            }
            if (selectedCardKeys.size == 0) { return; }
            clearCardSelection();
            var player = currentGame == null || currentPlayerName == null
                ? null
                : currentGame.getPlayer(currentPlayerName);
            if (player != null) {
                GameLayout.updateHand(currentGame, player);
            }
        }

        document.getElementById("GameToast").addEventListener("click", function (event) {
            event.stopPropagation();
            dismissGameToast();
        });
        document.getElementById("playerActions").addEventListener(
            "click",
            clearSelectedCardsFromBackground
        );

        function setGameMenuOpen(isOpen, returnFocus = false) {
            appShell.classList.toggle("GameMenuOpen", isOpen);
            gameMenuToggle.setAttribute("aria-expanded", String(isOpen));
            var label = isOpen ? "Lukk spillmeny" : "Åpne spillmeny";
            gameMenuToggle.setAttribute("aria-label", label);
            gameMenuToggle.title = label;
            if (!isOpen && returnFocus && appShell.classList.contains("game-active")) {
                gameMenuToggle.focus();
            }
        }

        gameMenuToggle.addEventListener("click", function () {
            setGameMenuOpen(!appShell.classList.contains("GameMenuOpen"));
        });

        gameMenu.addEventListener("click", function (event) {
            var action = event.target.closest ? event.target.closest("button") : null;
            if (!action || !appShell.classList.contains("GameMenuOpen")) { return; }
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
                var focusedCard = Array.from(document.querySelectorAll("#playerHand .game-card"))
                    .find(card => card.dataset.cardKey == focusedCardKey);
                if (focusedCard) {
                    focusedCard.focus();
                }
            }
        });

        document.getElementById('BnHNySpill').addEventListener('click', function () {
            document.getElementById("dialogNyttSpillOffentlig").checked = true;
            showDialog("NyttSpill", true);
        });

        document.getElementById('dialogNyttSpillOk').addEventListener('click', function () {
            var isPublic = document.getElementById("dialogNyttSpillOffentlig").checked;
            showDialog("NyttSpill", false);
            startNewGame(isPublic);
        });

        var quickPlayPlayerCount = null;
        var quickPlayPending = false;
        document.querySelectorAll(".quick-play-option").forEach(button => {
            button.addEventListener("click", function () {
                quickPlayPlayerCount = Number(button.dataset.players);
                document.querySelectorAll(".quick-play-option").forEach(option => {
                    option.setAttribute("aria-pressed", String(option == button));
                });
                document.getElementById("quickPlayButton").disabled = false;
            });
        });

        async function startQuickPlay() {
            if (quickPlayPending || currentGame != null || ![2, 3, 4].includes(quickPlayPlayerCount)) {
                return;
            }
            quickPlayPending = true;
            var menu = document.getElementById("mainMenu");
            var button = document.getElementById("quickPlayButton");
            menu.inert = true;
            button.disabled = true;
            showPublicLobbyError("");
            var game = null;
            var setupListener = null;
            try {
                game = new PresidentGame(null, false);
                // Keep Firebase's room cache alive until connectGame attaches its listener.
                var setupReady = new Promise((resolve, reject) => {
                    setupListener = resolve;
                    game.databaseRef.on("value", setupListener, reject);
                });
                await Promise.all([game.creation, setupReady]);
                var name = readLastUsedPlayerName() || localizedMessage("Spiller");
                var human = new PresidentPlayer(name, getPlayerKey());
                human.ready = true;
                var result = await game.addPlayer(human);
                if (!result.player) { throw new Error(result.text); }
                name = result.player.name;
                game.localPlayerName = name;
                while (game.players.length < quickPlayPlayerCount) {
                    var usedNames = game.players.map(player => player.name.toLocaleLowerCase());
                    var availableNames = BOT_NAMES.filter(candidate =>
                        !usedNames.includes(candidate.toLocaleLowerCase()));
                    var botName = availableNames[Math.floor(Math.random() * availableNames.length)];
                    var botResult = await game.addPlayer(new PresidentPlayer(botName, "PC"));
                    if (!botResult.player) { throw new Error(botResult.text); }
                }
                await game.startGame();
                currentGame = game;
                currentPlayerName = name;
                saveLastUsedPlayerName(name);
                connectGame();
            } catch (error) {
                console.error("Kunne ikke starte hurtigspill.", error);
                showPublicLobbyError("Kunne ikke starte hurtigspill. Prøv igjen.");
            } finally {
                if (game != null && setupListener != null) {
                    game.databaseRef.off("value", setupListener);
                }
                quickPlayPending = false;
                menu.inert = false;
                button.disabled = quickPlayPlayerCount == null;
            }
        }

        document.getElementById("quickPlayButton").addEventListener("click", startQuickPlay);

        var publicLobbies = [];

        function joinableLobbies() {
            var oldest = Date.now() - PUBLIC_LOBBY_MAX_AGE_MS;
            return publicLobbies.filter(lobby => lobby.ts > oldest);
        }

        function shuffledSample(items, count) {
            var copy = items.slice();
            for (var i = copy.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy.slice(0, count);
        }

        function renderPublicLobbies() {
            var list = document.getElementById("publicLobbyList");
            var lobbies = joinableLobbies();
            var heading = list.querySelector(".public-lobby-heading");
            if (heading == null) {
                heading = document.createElement("div");
                heading.className = "public-lobby-heading";
                var headingText = document.createElement("span");
                headingText.textContent = "Åpne lobbyer";
                heading.appendChild(headingText);
                var randomButton = document.createElement("button");
                randomButton.type = "button";
                randomButton.className = "public-lobby-random";
                var randomIcon = document.createElement("img");
                randomIcon.src = "icons/shuffle.svg";
                randomIcon.alt = "";
                randomIcon.setAttribute("aria-hidden", "true");
                randomButton.appendChild(randomIcon);
                randomButton.title = "Bli med i en tilfeldig åpen lobby";
                randomButton.setAttribute("aria-label", "Bli med i en tilfeldig åpen lobby");
                randomButton.addEventListener("click", joinRandomPublicLobby);
                heading.appendChild(randomButton);
                list.appendChild(heading);
            }
            heading.querySelector("button").hidden =
                !lobbies.some(lobby => lobby.waiting && (lobby.players < MAX_PLAYERS || lobby.bots > 0));
            var empty = list.querySelector(".public-lobby-empty");
            if (empty == null) {
                empty = document.createElement("div");
                empty.className = "public-lobby-empty";
                empty.textContent = "Ingen åpne lobbyer akkurat nå";
                list.appendChild(empty);
            }
            empty.hidden = lobbies.length != 0;
            var available = new Map(lobbies.map(lobby => [lobby.id, lobby]));
            var buttons = new Map();
            list.querySelectorAll(".public-lobby-entry").forEach(button => {
                if (available.has(button.dataset.lobbyId)) {
                    buttons.set(button.dataset.lobbyId, button);
                } else {
                    button.remove();
                }
            });
            var additions = shuffledSample(lobbies.filter(lobby => !buttons.has(lobby.id)), 5 - buttons.size);
            additions.forEach(lobby => {
                var button = document.createElement("button");
                button.type = "button";
                button.className = "public-lobby-entry";
                button.dataset.lobbyId = lobby.id;
                var name = document.createElement("span");
                var speed = document.createElement("small");
                speed.className = "public-lobby-entry__speed";
                var status = document.createElement("span");
                status.className = "public-lobby-entry__status";
                button.append(name, speed, status);
                button.addEventListener("click", function () {
                    joinGameById(lobby.id, showPublicLobbyError);
                });
                list.appendChild(button);
                buttons.set(lobby.id, button);
            });
            buttons.forEach((button, id) => {
                var lobby = available.get(id);
                button.classList.toggle("is-running", !lobby.waiting);
                var name = `${lobby.host} · ${lobby.players}/${MAX_PLAYERS}`;
                var speed = localizedMessage("Personlig animasjonshastighet");
                var status = lobby.waiting ? "Venter i lobby" : "Spill pågår";
                if (button.children[0].textContent != name) { button.children[0].textContent = name; }
                if (button.children[1].textContent != speed) { button.children[1].textContent = speed; }
                if (button.children[2].textContent != status) { button.children[2].textContent = status; }
            });
        }

        function showPublicLobbyError(text) {
            var error = document.getElementById("publicLobbyError");
            error.textContent = text;
        }

        function updatePublicLobbies(snapshot) {
            publicLobbies = [];
            snapshot.forEach(child => {
                var lobby = child.val();
                if (lobby != null && lobby.id != null && typeof lobby.host == "string") {
                    publicLobbies.push({
                        id: String(lobby.id),
                        host: lobby.host,
                        players: Number(lobby.players) || 0,
                        bots: Number(lobby.bots) || 0,
                        waiting: lobby.waiting !== false,
                        turnSeconds: gameTurnSeconds(lobby.turnSeconds),
                        ts: Number(lobby.ts) || 0
                    });
                }
            });
            publicLobbies.sort((a, b) => b.ts - a.ts);
            renderPublicLobbies();
        }
        var publicLobbyRef = firebase.database().ref(PUBLIC_LOBBY_PATH);
        publicLobbyRef.on("value", updatePublicLobbies, function (error) {
            console.error("Kunne ikke hente offentlige lobbyer.", error);
        });
        renderPublicLobbies();

        var publicLobbyRefreshPending = false;
        async function refreshPublicLobbies() {
            if (currentGame != null || document.hidden || publicLobbyRefreshPending) { return; }
            publicLobbyRefreshPending = true;
            try {
                updatePublicLobbies(await publicLobbyRef.once("value"));
            } catch (error) {
                console.error("Kunne ikke oppdatere offentlige lobbyer.", error);
            } finally {
                publicLobbyRefreshPending = false;
            }
        }
        setInterval(refreshPublicLobbies, 15000);
        document.addEventListener("visibilitychange", refreshPublicLobbies);

        function joinRandomPublicLobby() {
            var lobbies = joinableLobbies().filter(lobby =>
                lobby.waiting && (lobby.players < MAX_PLAYERS || lobby.bots > 0)
            );
            if (lobbies.length == 0) {
                showPublicLobbyError("Ingen åpne lobbyer akkurat nå.");
                return;
            }
            var lobby = lobbies[Math.floor(Math.random() * lobbies.length)];
            joinGameById(lobby.id, showPublicLobbyError);
        }

        document.getElementById("gameTable").addEventListener("click", function (event) {
            clearSelectedCardsFromBackground(event);
        });

        document.getElementById('BnHKobleSpill').addEventListener('click', function () {
            showConnectGameDialog();
        });

        document.getElementById('BnFKobleSpill').addEventListener('click', connectToAnotherGame);

        function joinGameById(id, onFail) {
            showPublicLobbyError("");
            var targetId = String(id || "").trim();
            if (targetId == "") {
                onFail("Skriv inn et spill-nummer.");
                return;
            }
            if (currentGame != null && String(currentGame.id) == targetId) {
                showDialog("KobleSpill", false);
                return;
            }
            // Check the target first so a failed attempt keeps the current game.
            firebase.database().ref(`boms_1/${targetId}`).once("value").then(function (snapshot) {
                if (!snapshot.exists() || GamePresence.isExpired(snapshot.val())) {
                    if (snapshot.exists()) { voidExpiredSession(firebase.database().ref(`boms_1/${targetId}`)); }
                    onFail("Kunne ikke koble til. Er spill-nummeret riktig?");
                    return;
                }
                if (currentGame != null) { leaveCurrentGame(); }
                currentGame = new PresidentGame(targetId);
                currentPlayerName = null;
                var shouldJoin = true;
                connectGame(function () {
                    if (currentGame == null) {
                        onFail("Kunne ikke koble til. Er spill-nummeret riktig?");
                    } else {
                        showDialog("KobleSpill", false);
                        if (shouldJoin) {
                            shouldJoin = false;
                            joinRememberedPlayerOrPrompt();
                        }
                    }
                });
            }).catch(function () {
                onFail("Kunne ikke koble til. Prøv igjen.");
            });
        }

        document.getElementById('dialogKobleSpillOk').addEventListener('click', function () {
            joinGameById(document.getElementById("dialogKobleSpillId").value, function (text) {
                document.getElementById('joinGameError').innerHTML = text;
                document.getElementById('dialogKobleSpillId').focus();
            });
        });

        function connectGame(afterConnect = function () { }) {
            disconnectGameListener();
            if (turnPauseRefreshTimer != null) {
                clearTimeout(turnPauseRefreshTimer);
                turnPauseRefreshTimer = null;
            }
            if (roundVoteRefreshTimer != null) {
                clearTimeout(roundVoteRefreshTimer);
                roundVoteRefreshTimer = null;
            }
            lastShownTurnPauseId = null;
            var connectingGame = currentGame;
            resetGameLog(connectingGame);
            connection = new GamePresence({
                game: connectingGame,
                playerName: () => currentPlayerName,
                refresh: refreshConnectionView,
                notify: message => {
                    if (currentGame == connectingGame) { showGameToast(message, connectingGame); }
                },
                remember: player => {
                    if (currentGame == connectingGame) { rememberActiveGame(player); }
                }
            });
            connectingGame.onRoundStarted = function () {
                if (currentGame == connectingGame) {
                    if (roundVoteRefreshTimer != null) {
                        clearTimeout(roundVoteRefreshTimer);
                        roundVoteRefreshTimer = null;
                    }
                    if (gameEndVoteRefreshTimer != null) {
                        clearTimeout(gameEndVoteRefreshTimer);
                        gameEndVoteRefreshTimer = null;
                    }
                    refreshAfterTurnPause(connectingGame);
                    scheduleBotLoop();
                }
            };
            currentGameSubscription = connectingGame.databaseRef;
            currentGameListener = function (snapshot) {
                if (currentGame != connectingGame) { return; }
                var snapshotRecord = snapshot.val();
                if (snapshotRecord == null || snapshotRecord.status != "S" ||
                    snapshotRecord.shuffleStartedAt != connectingGame.shuffleStartedAt) {
                    presentationSnapshots = [];
                    completingPresentationId = null;
                }
                var activePause = connectingGame.turnPause;
                if (snapshotRecord && activePause?.presentationVersion == 1 &&
                    connectingGame.presentationCompletedPauseId != activePause.id &&
                    snapshotRecord.turnPause?.id != activePause.id &&
                    snapshotRecord.status == "S" &&
                    snapshotRecord.shuffleStartedAt == connectingGame.shuffleStartedAt) {
                    presentationSnapshots.push(snapshot);
                    return;
                }
                if (snapshotRecord != null && GamePresence.isExpired(snapshotRecord,
                    connection ? connection.now() : GamePresence.now())) {
                    voidExpiredSession(connectingGame.databaseRef);
                    snapshotRecord = null;
                }
                if (snapshotRecord != null) {
                    var storedPlayers = snapshotRecord["spillere"] || [];
                    var storedPiles = snapshotRecord["spillBunke"] || [];
                    connectingGame.status = snapshotRecord.status;
                    connectingGame.hostKey = snapshotRecord["hostKey"] || null;
                    connectingGame.hostName = snapshotRecord["hostName"] || null;
                    connectingGame.isPublic = snapshotRecord["isPublic"] === true;
                    connectingGame.waitingSpectators = snapshotRecord["waitingSpectators"] || {};
                    if (connectingGame.hostKey == null) {
                        var firstHumanRecord = storedPlayers.find(record =>
                            record["spillerKey"] != "PC"
                        );
                        connectingGame.hostKey = firstHumanRecord
                            ? firstHumanRecord["spillerKey"]
                            : null;
                    }
                    if (connectingGame.hostName == null) {
                        var hostRecord = storedPlayers.find(record => record["spillerKey"] == connectingGame.hostKey);
                        connectingGame.hostName = hostRecord ? hostRecord.nick : null;
                    }
                    var storedRules = snapshotRecord["regler"] || {};
                    connectingGame.rules = { showCardsOnly: storedRules["VisKunKort"] };
                    connectingGame.round = snapshotRecord["runde"];
                    connectingGame.shuffleStartedAt = snapshotRecord["shuffleStartedAt"] || null;
                    ensureGameLog(connectingGame);
                    connectingGame.roundStarterName = snapshotRecord["roundStarterName"] || null;
                    connectingGame.playedCards = snapshotRecord["playedCards"] || [];
                    connectingGame.dealTotal = snapshotRecord["dealTotal"] || 0;
                    connectingGame.dealStarterStep = snapshotRecord["dealStarterStep"] ?? null;
                    connectingGame.roundStartVote = snapshotRecord["roundStartVote"] || null;
                    connectingGame.gameEndVote = snapshotRecord["gameEndVote"] || null;
                    connectingGame.preservePlayerOrderOnStart =
                        snapshotRecord["preservePlayerOrderOnStart"] === true;
                    connectingGame.players = PresidentPlayer.deserializePlayers(storedPlayers);
                    connectingGame.cardStyles = snapshotRecord.cardStyles || {};
                    connectingGame.cardFoils = snapshotRecord.cardFoils || {};
                    connectingGame.piles = ((connectingGame.status == "G") ? PresidentGame.deserializeExchanges(storedPiles) : PresidentCard.deserializePiles(storedPiles));
                    connectingGame.turn = snapshotRecord["sinTur"];
                    connectingGame.turnPause = snapshotRecord["turnPause"] || null;
                    connectingGame.fastForward = snapshotRecord.fastForward === true;
                    connectingGame.turnSeconds = gameTurnSeconds(snapshotRecord.turnSeconds);
                    connectingGame.ts = snapshotRecord.ts;
                    connectingGame.lastHumanActionAt = snapshotRecord.lastHumanActionAt ?? null;
                    receiveExchangeReceipts(connectingGame, snapshotRecord.exchangeReceipts || []);
                    connection.receive(snapshotRecord);
                    if (connectingGame.status == "F") {
                        var stillActivePlayers = connectingGame.players.filter(player =>
                            player.placement == 0
                        );
                        if (stillActivePlayers.length > 0) {
                            console.error("Spillet er markert ferdig mens aktive spillere fortsatt finnes.", {
                                gameId: connectingGame.id,
                                activePlayerCount: stillActivePlayers.length,
                                activeCardsRemaining: stillActivePlayers.reduce(
                                    (total, player) => total + player.cards.length,
                                    0
                                )
                            });
                        }
                    }
                    GameLayout.updateSharedView(connectingGame, connectingGame.getPlayer(currentPlayerName));
                    GameLayout.updatePlayerView(connectingGame, connectingGame.getPlayer(currentPlayerName));
                    syncPlayerCardAppearance(connectingGame);
                    notifyStartedTrades(connectingGame);
                    handleTurnPause(connectingGame);
                    handleRoundStartVote(connectingGame);
                    handleGameEndVote(connectingGame);
                    playShuffleIfNew(connectingGame);
                    flashRoundStarter();
                    receiveSkippedTrades(connectingGame, snapshotRecord.skippedTrades || []);
                    tryJoinWaitingSpectator(connectingGame);
                    updateFastForwardButton();
                    scheduleBotLoop();
                } else {
                    disconnectGameListener();
                    clearShuffleAnimation();
                    if (roundVoteRefreshTimer != null) {
                        clearTimeout(roundVoteRefreshTimer);
                        roundVoteRefreshTimer = null;
                    }
                    if (gameEndVoteRefreshTimer != null) {
                        clearTimeout(gameEndVoteRefreshTimer);
                        gameEndVoteRefreshTimer = null;
                    }
                    currentGame = null;
                    forgetActiveGame();
                    clearWaitingSpectator();
                    currentPlayerName = null;
                    resetGameLog(null);
                    GameLayout.updateSharedView(null, null);
                    GameLayout.updatePlayerView(null, null);
                }
                afterConnect();
            };
            currentGameSubscription.on('value', currentGameListener, function (error) {
                console.error("Kunne ikke koble til spillet.", error);
                connectingGame.connectionOnline = false;
                refreshConnectionView();
                showGameToast("Kunne ikke koble til spillet. Prøv igjen.", connectingGame);
            });
        }

        const inviteParams = new URLSearchParams(window.location.search);
        const inviteId = inviteParams.get("gameid") || inviteParams.get("spillid");
        if (inviteId && /^[1-9]\d{0,5}$/.test(inviteId)) {
            currentGame = new PresidentGame(inviteId);
            currentPlayerName = null;
            connectAndPromptForPlayerName();
        }
        document.getElementById("resumeGameButton").addEventListener("click", function () {
            var saved = readResumableGame();
            if (!saved) { updateResumeButton(); return; }
            currentGame = new PresidentGame(saved.id);
            currentPlayerName = saved.name;
            var checked = false;
            connectGame(function () {
                if (checked) { return; }
                checked = true;
                if (!currentGame) {
                    showPublicLobbyError("Spillet finnes ikke lenger.");
                    return;
                }
                var player = currentGame.getPlayer(saved.name);
                if (!player || player.playerKey != getPlayerKey() || player.gaveUp) {
                    leaveCurrentGame();
                    showPublicLobbyError("Du har ikke lenger en plass i dette spillet.");
                }
            });
        });
        document.getElementById("extendTurnButton").addEventListener("click", () => {
            if (connection) { connection.changeControl(); }
        });
        document.getElementById("reclaimSeatButton").addEventListener("click", () => {
            if (connection) { connection.changeControl(true); }
        });
        firebase.database().ref(".info/serverTimeOffset").on("value", updateSessionClock);
        updateResumeButton();

        document.getElementById('BnFInviterSpill').addEventListener('click', function () {
            if (currentGame == null) { throw ('Må lage spill før du inviterer.') }
            const inviteUrl = new URL(document.baseURI);
            inviteUrl.search = "";
            inviteUrl.hash = "";
            inviteUrl.searchParams.set("gameid", currentGame.id);
            showInviteLink(currentGame.id, inviteUrl.href);
        });

        var GAME_SPEED_MS = { fast: 3000, normal: 5000, slow: 8000 };
        function currentGameSpeed() {
            if (currentGame && currentGame.fastForward === true) { return "fast"; }
            var stored = null;
            try { stored = localStorage.getItem("gameSpeed"); } catch (error) { }
            return GAME_SPEED_MS[stored] != null ? stored : "fast";
        }
        function updateSpeedButtons() {
            updateToastVisibility();
            var speed = currentGameSpeed();
            document.querySelectorAll(".speed-option").forEach(button => {
                button.setAttribute("aria-pressed", String(button.dataset.speed == speed));
                button.disabled = !!currentGame && currentGame.fastForward === true;
            });
        }
        function updateTurnSpeedButtons() {
            positionArchivedToasts();
            var speed = currentGame?.fastForward ? "fast" : getCookie("AnimationSpeed") || "normal";
            document.querySelectorAll(".animation-speed-option").forEach(button => {
                button.setAttribute("aria-pressed", String(button.dataset.animationSpeed == speed));
                button.disabled = currentGame?.fastForward === true;
            });
        }
        function updatePlayInputButtons() {
            var mode = GameLayout.playInputMode();
            document.getElementById("playInputFlickHint").hidden = mode != "flick";
            document.getElementById("playInputButtonHint").hidden = mode != "button";
            document.querySelectorAll(".play-input-option").forEach(button => {
                button.setAttribute("aria-pressed", String(button.dataset.playInput == mode));
                button.disabled = false;
            });
        }
        document.querySelectorAll(".animation-speed-option").forEach(button => {
            button.addEventListener("click", function () {
                setCookie("AnimationSpeed", button.dataset.animationSpeed, 1000);
                updateTurnSpeedButtons();
            });
        });
        document.querySelectorAll(".play-input-option").forEach(button => {
            button.addEventListener("click", function () {
                if (button.disabled) { return; }
                setCookie("PlayInputMode", button.dataset.playInput, 1000);
                updatePlayInputButtons();
                if (currentGame != null) { refreshAfterTurnPause(currentGame); }
            });
        });
        window.addEventListener("storage", function (event) {
            if (event.key != "norwegian-tycoon-cookie-PlayInputMode") { return; }
            updatePlayInputButtons();
            if (currentGame != null) { refreshAfterTurnPause(currentGame); }
        });
        window.matchMedia("(hover: hover) and (pointer: fine)").addEventListener("change", function () {
            updatePlayInputButtons();
            if (currentGame != null) { refreshAfterTurnPause(currentGame); }
        });
        function bindCardPreviewTilt(wrapper) {
            var pointer = null;
            var dragged = false;
            wrapper.addEventListener("pointerdown", event => {
                pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
                dragged = false;
                updateCardTilt(wrapper, event);
                if (typeof wrapper.setPointerCapture == "function") {
                    wrapper.setPointerCapture(event.pointerId);
                }
            });
            wrapper.addEventListener("pointermove", event => {
                if (pointer != null && pointer.id == event.pointerId) {
                    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 4) {
                        dragged = true;
                    }
                    if (dragged) { event.preventDefault(); }
                }
                updateCardTilt(wrapper, event);
            });
            wrapper.addEventListener("pointerup", event => {
                if (pointer != null && pointer.id == event.pointerId) {
                    pointer = null;
                    resetCardTilt(wrapper);
                }
            });
            wrapper.addEventListener("pointercancel", event => {
                if (pointer != null && pointer.id == event.pointerId) {
                    pointer = null;
                    dragged = false;
                    resetCardTilt(wrapper);
                }
            });
            wrapper.addEventListener("lostpointercapture", event => {
                if (pointer != null && pointer.id == event.pointerId) {
                    pointer = null;
                    dragged = false;
                    resetCardTilt(wrapper);
                }
            });
            wrapper.addEventListener("pointerleave", () => {
                if (pointer == null) { resetCardTilt(wrapper); }
            });
            wrapper.addEventListener("click", event => {
                if (!dragged) { return; }
                event.preventDefault();
                event.stopPropagation();
                dragged = false;
            });
        }
        function updateCardAppearancePreview() {
            var holder = document.getElementById("cardAppearancePreview");
            var style = GameLayout.cardStyle();
            var foil = GameLayout.cardFoil();
            if (holder.dataset.style == style && holder.dataset.foil == foil) { return; }
            holder.dataset.style = style;
            holder.dataset.foil = foil;
            var wrapper = document.createElement("span");
            wrapper.className = "card-preview card-preview--" + style;
            wrapper.dataset.foil = foil;
            var image = GameLayout.createCardImage(new PresidentCard(2, 1), null, style, foil);
            image.alt = "";
            wrapper.appendChild(image);
            bindCardPreviewTilt(wrapper);
            holder.replaceChildren(wrapper);
        }
        async function refreshPlayerPresidentWins() {
            var request = ++playerWinsRequest;
            var name = currentPlayerName || readLastUsedPlayerName();
            playerWinsName = name;
            playerPresidentWins = 0;
            playerRoundsPlayed = 0;
            playerWinsLoading = true;
            playerWinsError = false;
            updateCardFoilButtons();
            updateCardStyleButtons();
            try {
                var stats = await PlayerIdentity.statsForName(name, getPlayerKey());
                if (request != playerWinsRequest) { return; }
                playerPresidentWins = stats.presidentWins;
                playerRoundsPlayed = stats.roundsPlayed;
            } catch (error) {
                if (request != playerWinsRequest) { return; }
                playerWinsError = true;
                console.error("Kunne ikke hente spillerstatistikk.", error);
            } finally {
                if (request == playerWinsRequest) {
                    playerWinsLoading = false;
                    updateCardFoilButtons();
                    updateCardStyleButtons();
                }
            }
        }
        function isCardFoilUnlocked(foil, playerName) {
            if (Card.hasAllAppearanceUnlocks(playerName)) { return true; }
            var requiredWins = Card.foilUnlockWins(foil);
            if (requiredWins == 0) { return true; }
            return !playerWinsLoading && !playerWinsError &&
                playerWinsName == (currentPlayerName || readLastUsedPlayerName()) &&
                requiredWins != null && playerPresidentWins >= requiredWins;
        }
        function isCardStyleUnlocked(style, playerName) {
            if (Card.hasAllAppearanceUnlocks(playerName)) { return true; }
            if (style == "botanical") { return Card.normalizeStyle(style, playerName) == style; }
            var requiredRounds = Card.styleUnlockRounds(style);
            if (requiredRounds == 0) { return true; }
            return !playerWinsLoading && !playerWinsError &&
                playerWinsName == (currentPlayerName || readLastUsedPlayerName()) &&
                requiredRounds != null && playerRoundsPlayed >= requiredRounds;
        }
        function updateCardStyleButtons() {
            document.querySelectorAll(".card-style-scope-option").forEach(button => {
                button.setAttribute("aria-pressed", String(button.dataset.scope == GameLayout.cardStyleScope()));
            });
            document.getElementById("secretStyleHeader").hidden = !GameLayout.canUseBotanicalStyle();
            var style = GameLayout.cardStyle();
            document.documentElement.dataset.cardStyle = style;
            var previewCards = [new PresidentCard(2, 1), new PresidentCard(1, 12), new PresidentCard(4, 7)];
            document.querySelectorAll(".card-style-option").forEach(row => {
                row.hidden = row.dataset.cardStyle == "botanical" && !GameLayout.canUseBotanicalStyle();
                var button = row.querySelector(".card-style-option__select");
                button.setAttribute("aria-pressed", String(row.dataset.cardStyle == style));
                var unlocked = isCardStyleUnlocked(row.dataset.cardStyle, currentPlayerName || readLastUsedPlayerName());
                button.disabled = !unlocked;
                row.classList.toggle("is-locked", !unlocked);
                var unlock = button.querySelector(".card-style-option__unlock");
                unlock.textContent = unlocked ? "" : localizedMessage(`Krever ${Card.styleUnlockRounds(row.dataset.cardStyle)} runder`);
                unlock.hidden = unlocked;
                var holder = row.querySelector(".card-style-option__cards");
                if (holder != null && (holder.childElementCount == 0 || holder.dataset.foil != GameLayout.cardFoil())) {
                    holder.replaceChildren();
                    holder.dataset.foil = GameLayout.cardFoil();
                    previewCards.forEach(card => {
                        var wrapper = document.createElement("span");
                        wrapper.className = "card-preview card-preview--" + row.dataset.cardStyle;
                        wrapper.dataset.foil = GameLayout.cardFoil();
                        wrapper.tabIndex = 0;
                        wrapper.setAttribute("aria-label", localizedMessage(button.querySelector("strong").textContent));
                        var image = GameLayout.createCardImage(card, null, row.dataset.cardStyle);
                        image.alt = "";
                        wrapper.appendChild(image);
                        bindCardPreviewTilt(wrapper);
                        holder.appendChild(wrapper);
                    });
                }
            });
            document.getElementById("cardStyleRounds").textContent = playerWinsLoading
                ? localizedMessage("Henter runder…")
                : playerWinsError ? localizedMessage("Kunne ikke hente runder. Åpne menyen igjen for å prøve på nytt.")
                : localizedMessage(`Dine runder: ${playerRoundsPlayed}`);
            var selected = document.querySelector(`.card-style-option[data-card-style="${style}"] strong`);
            if (selected != null) {
                document.getElementById("cardStyleCurrentName").textContent =
                    localizedMessage(selected.textContent);
            }
            updateCardAppearancePreview();
        }
        updateCardStyleButtons();
        document.addEventListener("languagechange", updateCardStyleButtons);

        document.getElementById("cardStyleOpenButton").addEventListener("click", function () {
            refreshPlayerPresidentWins();
            showDialog("Innstillinger", false);
            showDialog("Korttype", true);
        });

        function syncPlayerCardAppearance(game) {
            var player = game.getPlayer(currentPlayerName);
            if (!player || player.playerKey != getPlayerKey() || game.connectionOnline === false) { return; }
            var style = GameLayout.cardStyle();
            var foil = GameLayout.cardFoil();
            var id = GamePresence.playerId(player);
            var attempt = `${id}:${style}:${foil}`;
            if (((game.cardStyles || {})[id] == style && (game.cardFoils || {})[id] == foil) ||
                game.cardStyleSyncPending || game.cardStyleSyncFailed == attempt) { return; }
            game.cardStyleSyncPending = true;
            game.setPlayerCardAppearance(style, foil).catch(error => {
                game.cardStyleSyncFailed = attempt;
                console.error("Kunne ikke lagre kortutseendet.", error);
                if (currentGame == game) { showGameToast(error.message, game); }
            }).finally(() => {
                game.cardStyleSyncPending = false;
                if (currentGame == game && game.cardStyleSyncFailed != attempt) {
                    syncPlayerCardAppearance(game);
                }
            });
        }
        document.querySelectorAll(".card-style-scope-option").forEach(button => {
            button.addEventListener("click", function () {
                setCookie("CardStyleScope", button.dataset.scope, 1000);
                updateCardStyleButtons();
                if (currentGame) { refreshAfterTurnPause(currentGame); }
            });
        });
        window.addEventListener("storage", function (event) {
            if (event.key != "cardStyle" && event.key != "norwegian-tycoon-cookie-CardStyleScope" &&
                event.key != "norwegian-tycoon-cookie-CardFoil") { return; }
            updateCardStyleButtons();
            updateCardFoilButtons();
            if (currentGame) {
                if (event.key == "cardStyle" || event.key == "norwegian-tycoon-cookie-CardFoil") {
                    currentGame.cardStyleSyncFailed = null;
                    syncPlayerCardAppearance(currentGame);
                }
                refreshAfterTurnPause(currentGame);
            }
        });
        document.getElementById("cardStyleCloseButton").addEventListener("click", function () {
            showDialog("Korttype", false);
            showDialog("Innstillinger", true);
        });

        function updateCardFoilButtons() {
            var foil = GameLayout.cardFoil();
            var style = GameLayout.cardStyle();
            var options = document.getElementById("cardFoilOptions");
            if (options.childElementCount == 0) {
                Card.foilOptionsByUnlock().forEach(option => {
                    var row = document.createElement("div");
                    row.className = "card-foil-option";
                    row.dataset.cardFoil = option.id;
                    var button = document.createElement("button");
                    button.type = "button";
                    button.className = "card-foil-option__select";
                    var cards = document.createElement("span");
                    cards.className = "card-style-option__cards";
                    var name = document.createElement("strong");
                    name.textContent = option.name;
                    var unlock = document.createElement("small");
                    unlock.className = "card-foil-option__unlock";
                    button.append(name, unlock);
                    row.append(cards, button);
                    button.addEventListener("click", function () {
                        if (!isCardFoilUnlocked(option.id, currentPlayerName || readLastUsedPlayerName())) {
                            return;
                        }
                        setCookie("CardFoil", option.id, 1000);
                        updateCardStyleButtons();
                        updateCardFoilButtons();
                        if (currentGame != null) {
                            currentGame.cardStyleSyncFailed = null;
                            syncPlayerCardAppearance(currentGame);
                        }
                        if (currentGame != null) { refreshAfterTurnPause(currentGame); }
                        showDialog("Kortfolie", false);
                        showDialog("Innstillinger", true);
                    });
                    options.appendChild(row);
                });
            }
            options.querySelectorAll(".card-foil-option").forEach(row => {
                var button = row.querySelector(".card-foil-option__select");
                button.setAttribute("aria-pressed", String(row.dataset.cardFoil == foil));
                var unlocked = isCardFoilUnlocked(
                    row.dataset.cardFoil,
                    currentPlayerName || readLastUsedPlayerName()
                );
                button.disabled = !unlocked;
                row.classList.toggle("is-locked", !unlocked);
                var holder = row.querySelector(".card-style-option__cards");
                var unlock = button.querySelector(".card-foil-option__unlock");
                var requiredWins = Card.foilUnlockWins(row.dataset.cardFoil);
                unlock.textContent = unlocked ? "" : `Krever ${requiredWins} seire`;
                unlock.hidden = unlocked;
                if (holder.dataset.style == style) { return; }
                holder.dataset.style = style;
                holder.replaceChildren();
                var card = new PresidentCard(2, 1);
                var wrapper = document.createElement("span");
                wrapper.className = "card-preview card-preview--" + style;
                wrapper.dataset.foil = row.dataset.cardFoil;
                wrapper.tabIndex = 0;
                wrapper.setAttribute("aria-label", localizedMessage(
                    Card.foilOptions().find(option => option.id == row.dataset.cardFoil).name));
                var image = GameLayout.createCardImage(card, null, style, row.dataset.cardFoil);
                image.alt = "";
                wrapper.appendChild(image);
                bindCardPreviewTilt(wrapper);
                holder.appendChild(wrapper);
            });
            document.getElementById("cardFoilCurrentName").textContent =
                localizedMessage(Card.foilOptions().find(option => option.id == foil).name);
            document.getElementById("cardFoilWins").textContent = playerWinsLoading
                ? localizedMessage("Henter seire…")
                : playerWinsError ? localizedMessage("Kunne ikke hente seire. Åpne menyen igjen for å prøve på nytt.")
                : `Your wins: ${playerPresidentWins}`;
            updateCardAppearancePreview();
        }
        updateCardFoilButtons();
        document.addEventListener("languagechange", updateCardFoilButtons);
        document.getElementById("cardFoilOpenButton").addEventListener("click", function () {
            refreshPlayerPresidentWins();
            showDialog("Innstillinger", false);
            showDialog("Kortfolie", true);
        });
        document.getElementById("cardFoilCloseButton").addEventListener("click", function () {
            showDialog("Kortfolie", false);
            showDialog("Innstillinger", true);
        });

        document.getElementById("hideToastsToggleButton").addEventListener("click", function () {
            setCookie("HideGameToasts", String(!gameToastsHidden()), 1000);
            updateToastVisibility();
        });
        updateToastVisibility();

        document.querySelectorAll(".speed-option")        .forEach(button => {
                    button.addEventListener("click", function () {
                        try { localStorage.setItem("gameSpeed", button.dataset.speed); } catch (error) { }
                updateSpeedButtons();
            });
        });

        document.querySelectorAll(".card-style-option__select").forEach(button => {
            button.addEventListener("click", function () {
                var style = button.closest(".card-style-option").dataset.cardStyle;
                if (!isCardStyleUnlocked(style, currentPlayerName || readLastUsedPlayerName())) { return; }
                try { localStorage.setItem("cardStyle", style); } catch (error) { }
                if (currentGame) {
                    currentGame.cardStyleSyncFailed = null;
                    syncPlayerCardAppearance(currentGame);
                }
                updateCardStyleButtons();
                updateCardFoilButtons();
                if (currentGame != null) { refreshAfterTurnPause(currentGame); }
                showDialog("Korttype", false);
                showDialog("Innstillinger", true);
            });
        });

        function openSettings() {
            var inGame = currentGame != null;
            updateSavedPlayerName();
            updateCardStyleButtons();
            refreshPlayerPresidentWins();
            GameLayout.setVisible("BnPByttNavn", !inGame || currentGame.status == "O");
            document.querySelector(".setting-turn-speed").hidden = false;
            document.getElementById("settingsGameId").hidden = !inGame;
            updateAutoSuggestionButton();
            updateSpeedButtons();
            updateTurnSpeedButtons();
            updatePlayInputButtons();
            showDialog("Innstillinger", true);
        }

        document.getElementById("BnInnstillinger").addEventListener("click", openSettings);
        window.addEventListener("resize", () => GameLayout.fitNames());
        document.getElementById("homeButton").addEventListener("click", function () {
            if (currentGame == null) { return; }
            if (currentGame.status == "S" || currentGame.status == "G") {
                showChoiceDialog(
                    "Vil du forlate runden og gå til hovedmenyen? De andre spillerne fortsetter.",
                    ["Ja, gå til hovedmenyen", "Fortsett spillet"],
                    [leaveCurrentGame, function () {}]
                );
            } else {
                leaveCurrentGame();
            }
        });

        document.addEventListener("languagechange", function () {
            if (currentGame != null &&
                document.getElementById("dialogSpillogg").classList.contains("dialog-container--visible")) {
                showGameLog();
            }
        });

        var copyToastTimer = null;
        function showCopyToast(text) {
            var toast = document.getElementById("CopyToast");
            toast.textContent = text;
            toast.classList.add("is-visible");
            clearTimeout(copyToastTimer);
            copyToastTimer = setTimeout(function () {
                toast.classList.remove("is-visible");
            }, 1600);
        }

        function copyGameId(element) {
            var id = element.textContent.trim();
            if (id == "") { return; }
            var fallbackCopy = function () {
                var input = document.createElement("textarea");
                input.value = id;
                input.setAttribute("readonly", "");
                input.style.position = "fixed";
                input.style.opacity = "0";
                document.body.appendChild(input);
                input.select();
                var copied = false;
                try { copied = document.execCommand("copy"); } catch (error) { }
                input.remove();
                return copied;
            };
            var done = copied => showCopyToast(
                copied ? `Spill-ID ${id} kopiert` : "Kunne ikke kopiere"
            );
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(id).then(
                    () => done(true),
                    () => done(fallbackCopy())
                );
            } else {
                done(fallbackCopy());
            }
        }

        document.querySelectorAll(".copyable-game-id").forEach(element => {
            element.addEventListener("click", function () { copyGameId(element); });
            element.addEventListener("keydown", function (event) {
                if (event.key == "Enter" || event.key == " ") {
                    event.preventDefault();
                    copyGameId(element);
                }
            });
        });

        document.getElementById("autoSuggestionToggleButton").addEventListener(
            "click",
            toggleAutoSuggestion
        );

        document.getElementById('startGameButton').addEventListener('click', function () {
            startRoundInCurrentGame();
        });
        document.getElementById("readyButton").addEventListener("click", function () {
            if (currentGame == null) { return; }
            var player = currentGame.getPlayer(currentPlayerName);
            currentGame.setReady(player, !player.ready);
        });

        function updateFastForwardButton() {
            updateSpeedButtons();
            updateTurnSpeedButtons();
            var button = document.getElementById("fastForwardButton");
            if (!button) { return; }
            button.hidden = !GamePresence.onlyBotsRemain(currentGame);
            var player = currentGame && currentGame.getPlayer(currentPlayerName);
            button.disabled = !player || currentGame.connectionOnline === false ||
                GamePresence.isBot(currentGame, player);
            button.setAttribute("aria-pressed", String(!!currentGame && currentGame.fastForward === true));
            var label = localizedMessage(currentGame?.fastForward ? "Vanlig avspilling" : "Spol frem");
            button.title = label;
            button.setAttribute("aria-label", label);
        }
        document.getElementById("fastForwardButton").addEventListener("click", function (event) {
            event.stopPropagation();
            if (currentGame) { currentGame.setFastForward(!currentGame.fastForward); }
        });
        document.addEventListener("languagechange", updateFastForwardButton);

        var botLoopTimer = null;
        var botLoopFastForward = false;
        function scheduleBotLoop() {
            var fastForward = !!currentGame && currentGame.fastForward === true &&
                (GamePresence.onlyBotsRemain(currentGame) || currentGame.turnPause?.pendingGameEnd === true);
            if (fastForward != botLoopFastForward) {
                if (botLoopTimer != null) { clearTimeout(botLoopTimer); }
                botLoopTimer = null;
                botLoopFastForward = fastForward;
            }
            if (botLoopTimer != null || currentGame == null ||
                currentGame.localWritePending ||
                !GamePresence.canDrive(currentGame, connection ? connection.now() : Date.now()) ||
                (currentGame.status != "S" && currentGame.status != "G")) { return; }
            var delay = currentGame.turnPause?.presentationVersion == 1
                ? Math.max(0, currentGame.turnPause.botUntil - GamePresence.now())
                : animationDuration(currentGame, 2000);
            if (currentGame.turnPause != null) {
                var pauseRemaining = currentGame.turnPause.until - Date.now();
                if (pauseRemaining > 0) {
                    delay = Math.min(delay, pauseRemaining);
                }
            }
            if (currentGame.turnPause?.presentationVersion == 1 &&
                currentGame.presentationCompletedPauseId != currentGame.turnPause.id) { return; }
            if (currentGame.status == "S" &&
                (currentGame.turn < 0 ||
                    !GamePresence.isBot(currentGame, currentGame.players[currentGame.turn]))) { return; }
            botLoopTimer = setTimeout(runBotLoop, delay);
        }

        function runBotLoop() {
            botLoopTimer = null;
            if (currentGame == null ||
                currentGame.localWritePending ||
                !GamePresence.canDrive(currentGame, connection ? connection.now() : Date.now())) { return; }
            if (Date.now() < shuffleEndsAt) {
                scheduleBotLoop();
                return;
            }
            if (currentGame.status == "G") {
                currentGame.players.filter(player =>
                    GamePresence.isBot(currentGame, player) || player.leaveAfterExchange === true
                ).forEach(player => {
                    playBotTurn(currentGame, player);
                });
            } else if (currentGame.status == "S" && currentGame.turn >= 0 && GamePresence.isBot(currentGame, currentGame.players[currentGame.turn])) {
                playBotTurn(currentGame, currentGame.players[currentGame.turn]);
            }
            scheduleBotLoop();
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
            if (currentGame != null && currentGame.status != "O") { return; }
            showDialog("Innstillinger", false);
            promptForPlayerName(currentPlayerName != null || currentGame == null);
        });

        document.getElementById("playerUsePin").addEventListener("click", function () {
            var enabled = this.getAttribute("aria-pressed") != "true";
            this.setAttribute("aria-pressed", String(enabled));
            document.getElementById("playerPinFields").hidden = !enabled;
            if (enabled) { document.getElementById("playerRecoveryPin").focus(); }
            else { document.getElementById("playerRecoveryPin").value = ""; }
        });
        document.getElementById("dialogSporOmNickTxt").addEventListener("input", function () {
            var name = this.value.trim();
            var invalid = name == "" || Array.from(name).length > 24 || sanitizePlayerName(name) != name;
            this.classList.toggle("input-soft-error", invalid);
            this.setAttribute("aria-invalid", String(invalid));
            document.getElementById("playerNameError").textContent = "";
        });
        document.getElementById("playerRecoveryPin").addEventListener("input", function () {
            var invalid = !PlayerIdentity.isRecoveryPin(this.value);
            this.classList.toggle("input-soft-error", invalid);
            this.setAttribute("aria-invalid", String(invalid));
        });
        document.getElementById("playerRecoveryPin").addEventListener("keydown", function (event) {
            if (event.key == "Enter") { document.getElementById("dialogSporOmNickOk").click(); }
        });

        async function applyPlayerIdentity(name) {
            var game = currentGame;
            var previousName = currentPlayerName;
            var oldKey = getPlayerKey();
            var usePin = document.getElementById("playerUsePin").getAttribute("aria-pressed") == "true";
            var pin = usePin ? document.getElementById("playerRecoveryPin").value : "";
            if (usePin && !PlayerIdentity.isRecoveryPin(pin)) {
                throw new Error("PIN må ha 6 sifre. Eldre PIN kan fortsatt brukes til gjenoppretting.");
            }
            var identity = await PlayerIdentity.resolve(name, oldKey, pin,
                previousName != null ? oldKey : null,
                !usePin ? PlayerIdentity.rememberedPinCredential(oldKey) : null);
            if (currentGame != game || currentPlayerName != previousName) {
                throw new Error("Spillet ble endret. Åpne navnevalget på nytt.");
            }
            if (identity.playerKey == oldKey) {
                setCookie("playerPinProfile", identity.hasPin
                    ? encodeURIComponent(JSON.stringify([PlayerIdentity.normalizeName(name), identity.playerKey])) : "", 1000);
                setCookie("playerKeyPending", "", 1000);
                setCookie("playerPinCredential", identity.pinCredential || "", 1000);
                setCookie("playerPinKey", identity.hasPin ? identity.playerKey : "", 1000);
                return;
            }
            if (currentPlayerName != null) {
                throw new Error("Dette navnet tilhører en annen spiller-ID. Gå til hovedmenyen før du henter profilen.");
            }
            if (game && pendingNewGameName && game.status == "O" && game.players.length == 0) {
                await game.creation;
                var result = await game.databaseRef.transaction(record => {
                    if (!record || record.status != "O" || record.hostKey != oldKey ||
                        (record.spillere || []).length > 0) { return; }
                    return Object.assign({}, record, { hostKey: identity.playerKey });
                }, undefined, false);
                if (!result.committed) { throw new Error("Lobbyen ble endret. Opprett et nytt spill fra hovedmenyen."); }
                game.hostKey = identity.playerKey;
            }
            setCookie("SpillerKey", identity.playerKey, 1000);
            setCookie("playerPinProfile", identity.hasPin
                ? encodeURIComponent(JSON.stringify([PlayerIdentity.normalizeName(name), identity.playerKey])) : "", 1000);
            setCookie("playerKeyPending", "", 1000);
            setCookie("playerPinCredential", identity.pinCredential || "", 1000);
            setCookie("playerPinKey", identity.hasPin ? identity.playerKey : "", 1000);
            playerWinsName = null;
            playerPresidentWins = 0;
            playerRoundsPlayed = 0;
        }

        document.getElementById("dialogSporOmNickCancel").addEventListener("click", async function () {
            showDialog("SporOmNick", false);
            if (!pendingNewGameName) { return; }
            var game = currentGame;
            pendingNewGameName = false;
            var voidEmptyLobby = game != null && game.status == "O" && game.players.length == 0;
            leaveCurrentGame();
            if (voidEmptyLobby) {
                try {
                    if (game.creation && typeof game.creation.then == "function") { await game.creation; }
                } catch (error) {
                    console.error("Kunne ikke fullføre opprettelsen av lobbyen som ble avbrutt.", error);
                }
            }
            if (voidEmptyLobby && game.status == "O" && game.players.length == 0) {
                game.status = "V";
                game.save();
            }
        });

        document.getElementById('dialogSporOmNickOk').addEventListener('click', async function () {
            var requestedName = document.getElementById('dialogSporOmNickTxt').value.trim();
            var invalidName = requestedName == "" || Array.from(requestedName).length > 24 ||
                sanitizePlayerName(requestedName) != requestedName;
            document.getElementById("dialogSporOmNickTxt").classList.toggle("input-soft-error", invalidName);
            document.getElementById("dialogSporOmNickTxt").setAttribute("aria-invalid", String(invalidName));
            if (invalidName) {
                return;
            }
            var pinField = document.getElementById("playerRecoveryPin");
            var invalidPin = document.getElementById("playerUsePin").getAttribute("aria-pressed") == "true" &&
                !PlayerIdentity.isRecoveryPin(pinField.value);
            pinField.classList.toggle("input-soft-error", invalidPin);
            pinField.setAttribute("aria-invalid", String(invalidPin));
            if (invalidPin) { return; }
            if (requestedName != "") {
                var submit = document.getElementById("dialogSporOmNickOk");
                if (submit.disabled) { return; }
                submit.disabled = true;
                try {
                    if (currentPlayerName != null && currentGame != null && currentGame.status != "O") {
                        throw new Error("Kan ikke endre navn under spill.");
                    }
                    await applyPlayerIdentity(requestedName);
                    if (currentGame == null) {
                        saveLastUsedPlayerName(requestedName);
                        showDialog("SporOmNick", false);
                        return;
                    }
                    if (currentPlayerName != null) {
                        if (currentGame.status != "O") {
                            document.getElementById('playerNameError').textContent = "Kan ikke endre navn under spill.";
                            return;
                        }
                        var playerToRename = currentGame.getPlayer(currentPlayerName);
                        if (playerToRename == null) {
                            document.getElementById('playerNameError').textContent = "Spilleren finnes ikke lenger.";
                            return;
                        }
                        var renamingGame = currentGame;
                        var renameResult = await renamingGame.renamePlayer(playerToRename, requestedName);
                        if (currentGame != renamingGame) { return; }
                        if (!renameResult.player) {
                            document.getElementById('playerNameError').textContent = renameResult.text;
                            return;
                        }
                        currentPlayerName = renameResult.player.name;
                        saveLastUsedPlayerName(currentPlayerName);
                        GameLayout.updateSharedView(currentGame, renameResult.player);
                        GameLayout.updatePlayerView(currentGame, renameResult.player);
                        showDialog("SporOmNick", false);
                    } else {
                        if (currentGame.status == "S" || currentGame.status == "G") {
                            pendingSpectatorJoinName = requestedName;
                            saveLastUsedPlayerName(requestedName);
                            registerWaitingSpectator(currentGame);
                            showDialog("SporOmNick", false);
                            return;
                        }
                        var key = getPlayerKey();
                        var joiningGame = currentGame;
                        var newPlayerResult = await joiningGame.addPlayer(new PresidentPlayer(requestedName, key));
                        if (currentGame != joiningGame) { return; }
                        if (newPlayerResult.player) {
                            pendingSpectatorJoinName = null;
                            pendingNewGameName = false;
                            currentPlayerName = newPlayerResult.player.name;
                            clearWaitingSpectator();
                            saveLastUsedPlayerName(currentPlayerName);
                            GameLayout.updateSharedView(currentGame, newPlayerResult.player);
                            GameLayout.updatePlayerView(currentGame, newPlayerResult.player);
                            showDialog("SporOmNick", false);
                        } else {
                            document.getElementById('playerNameError').textContent = newPlayerResult.text;
                        }
                    }
                } catch (error) {
                    console.error("Kunne ikke hente eller lagre spillerprofilen.", error);
                    document.getElementById("playerNameError").textContent = error.message;
                } finally {
                    submit.disabled = false;
                    document.getElementById("playerRecoveryPin").value = "";
                }
            }
        });

        document.getElementById('BnPGiOpp').addEventListener('click', function () {
            showChoiceDialog(
                "Vil du forlate runden og gå til hovedmenyen? De andre spillerne fortsetter.",
                ["Ja, gå til hovedmenyen", "Fortsett spillet"],
                [leaveCurrentGame, function () { }]
            );
        });

        document.getElementById('BnFNyAutoSpiller').addEventListener('click', async function () {
            if (currentGame == null || !isLobbyHost(currentGame) ||
                (currentGame.status != "O" && currentGame.status != "F") ||
                currentGame.gameEndVote != null) {
                return;
            }
            const key = "PC";
            var usedNames = currentGame.players.map(player => player.name.toLocaleLowerCase());
            var availableNames = BOT_NAMES.filter(name => !usedNames.includes(name.toLocaleLowerCase()));
            if (availableNames.length > 0) {
                var name = availableNames[Math.floor(Math.random() * availableNames.length)];
                var botGame = currentGame;
                var result = await botGame.addPlayer(new PresidentPlayer(name, key));
                if (currentGame != botGame) { return; }
                if (!result.player) {
                    showGameToast(result.text, currentGame);
                }
            }
        })

        document.getElementById('passButton').addEventListener('click', function () {
            currentGame.passTurn(currentGame.getPlayer(currentPlayerName));
        });

        updateSavedPlayerName();
        GameLayout.updateSharedView(null, null);
        GameLayout.updatePlayerView(null, null);

        document.getElementById('BnFRegler').addEventListener('click', function () {
            showDialog("Regler", true);
        });

        document.getElementById('BnFSpillogg').addEventListener('click', showGameLog);

        setInterval(() => {
            updateTurnTimer();
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
