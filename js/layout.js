function chooseSuggestedPlayStrength(player, topPile, playableStrengths, requiredCardCount) {
    var clubThreePower = PresidentCard.clubThreePower();
    var otherTricks = new Set(player.cards
        .filter(card => !card.isClubThree())
        .map(card => card.strengthRank));
    if (player.cards.length > 1 &&
        otherTricks.size == 1 && playableStrengths.has(clubThreePower)) {
        return clubThreePower;
    }
    var sortedPlayableStrengths = Array.from(playableStrengths).sort((a, b) => a - b);
    if (topPile == null) { return sortedPlayableStrengths[0]; }
    if (topPile.length == 1) {
        sortedPlayableStrengths = sortedPlayableStrengths.filter(strength => strength != clubThreePower);
        if (sortedPlayableStrengths.length == 0) {
            return playableStrengths.has(clubThreePower) ? clubThreePower : undefined;
        }
    }
    return sortedPlayableStrengths.find(strengthRank =>
        player.cards.filter(card => card.strengthRank == strengthRank).length == requiredCardCount
    ) ?? (requiredCardCount == 1 ? sortedPlayableStrengths.find(strengthRank =>
        player.cards.filter(card => card.strengthRank == strengthRank).length == 3
    ) : undefined) ?? sortedPlayableStrengths[0];
}

class GameLayout {
    static usesDesktopControls() {
        return typeof window == "undefined" ||
            window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    }
    static playInputMode() {
        var stored = getCookie("PlayInputMode");
        if (stored == "flick" || stored == "button" || stored == "both") { return stored; }
        return this.usesDesktopControls() ? "button" : "flick";
    }
    static isShuffling(game) {
        return game != null && (game.status == "G" || game.status == "S") && game.shuffleStartedAt != null &&
            GamePresence.now() < Number(game.shuffleStartedAt) + SHUFFLE_DURATION_MS;
    }
    static fitName(name) {
        name.style.fontSize = "";
        var size = parseFloat(getComputedStyle(name).fontSize);
        while (name.scrollWidth > name.clientWidth && size > 8) {
            size = Math.max(8, size - 0.5);
            name.style.fontSize = `${size}px`;
        }
    }
    static fitNames() {
        requestAnimationFrame(() => {
            if (this.nameResizeObserver == null) {
                this.nameResizeObserver = new ResizeObserver(entries => {
                    entries.forEach(entry => this.fitName(entry.target));
                });
            }
            this.nameResizeObserver.disconnect();
            document.querySelectorAll(".game-over__rank").forEach(name => {
                this.fitName(name);
                this.nameResizeObserver.observe(name);
            });
        });
    }
    static enableNameExpansion(element) {
        element.tabIndex = 0;
        element.setAttribute("role", "button");
        element.setAttribute("aria-expanded", "false");
        element.title = element.textContent;
        element.onclick = event => {
            event.stopPropagation();
            this.expandName(element);
        };
        element.onkeydown = event => {
            if (event.key == "Enter" || event.key == " ") {
                event.preventDefault();
                event.stopPropagation();
                this.expandName(element);
            }
        };
    }
    static expandName(element) {
        if (this.nameExpansionTimer) { clearTimeout(this.nameExpansionTimer); }
        if (this.expandedName) { this.expandedName.setAttribute("aria-expanded", "false"); }
        document.getElementById("expandedPlayerName")?.remove();
        var label = document.createElement("span");
        label.id = "expandedPlayerName";
        label.className = "expanded-player-name";
        label.textContent = element.textContent;
        var bounds = element.getBoundingClientRect();
        label.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 280))}px`;
        label.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 60))}px`;
        document.body.appendChild(label);
        element.setAttribute("aria-expanded", "true");
        this.expandedName = element;
        this.nameExpansionTimer = setTimeout(() => {
            label.remove();
            element.setAttribute("aria-expanded", "false");
            this.expandedName = null;
        }, 3000);
    }
    static voteChoice(button, voters) {
        var column = document.createElement("div");
        column.className = "vote-choice";
        column.appendChild(button);
        voters.forEach(player => {
            var name = document.createElement("small");
            name.className = "player-summary__name";
            name.textContent = player.name;
            this.enableNameExpansion(name);
            name.style.color = player.displayColor;
            column.appendChild(name);
        });
        return column;
    }
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
    static cardStyle() {
        var active = typeof currentGame != "undefined" && currentGame;
        var player = active && !["O", "F"].includes(active.status) && active.getPlayer(GameLayout.cardStylePlayerName);
        if (player) {
            return Card.normalizeStyle((active.cardStyles || {})[GamePresence.playerId(player)], player.name, player.playerKey);
        }
        var stored = null;
        try { stored = localStorage.getItem("cardStyle"); } catch (error) { }
        return Card.normalizeStyle(stored, GameLayout.cardStylePlayerName || "", getPlayerKey());
    }
    static cardStyleScope() {
        var active = typeof currentGame != "undefined" && currentGame;
        if (active && !["O", "F"].includes(active.status) && active.localCardStyleScope) {
            return active.localCardStyleScope;
        }
        return getCookie("CardStyleScope") == "own" ? "own" : "player";
    }
    static cardFoil() {
        var active = typeof currentGame != "undefined" && currentGame;
        var player = active && !["O", "F"].includes(active.status) && active.getPlayer(GameLayout.cardStylePlayerName);
        if (player) { return Card.normalizeFoil((active.cardFoils || {})[GamePresence.playerId(player)]); }
        return Card.normalizeFoil(getCookie("CardFoil"));
    }
    static styleForPlayer(game, name) {
        if (GameLayout.cardStyleScope() == "own" || name == GameLayout.viewerName) {
            return GameLayout.cardStyle();
        }
        var player = game.players.find(player => player.name == name);
        return player ? Card.normalizeStyle((game.cardStyles || {})[GamePresence.playerId(player)], name, player.playerKey) : "normal";
    }
    static foilForPlayer(game, name) {
        if (GameLayout.cardStyleScope() == "own" || name == GameLayout.viewerName) {
            return GameLayout.cardFoil();
        }
        var player = game.players.find(player => player.name == name);
        return player
            ? Card.normalizeFoil((game.cardFoils || {})[GamePresence.playerId(player)])
            : "none";
    }
    static canUseBotanicalStyle() {
        return Card.normalizeStyle("botanical", GameLayout.cardStylePlayerName || "", getPlayerKey()) == "botanical";
    }
    static cardImageHtml(card, width = null, rotation = null, style = "normal", foil = GameLayout.cardFoil()) {
        return `<img draggable="false" src='${card.toImageDataUri(style, foil)}' ${((width != null) ? "width='" + width + "'" : "")} alt='${card.getName()}' ${((rotation != null) ? "transform: translateX(" + rotation + "px) rotate(" + rotation + "deg);" : "")} />`;
    }
    static createCardImage(card, width, style = "normal", foil = GameLayout.cardFoil()) {
        var e = document.createElement("img");
        e.draggable = false;
        e.src = card.toImageDataUri(style, foil);
        if (width != null) { e.width = width };
        e.alt = card.getName();
        return e;
    }
    static createOwnedCardPreview(card, game, owner, className) {
        var style = this.styleForPlayer(game, owner);
        var foil = this.foilForPlayer(game, owner);
        var preview = document.createElement("span");
        preview.className = `${className} card-preview card-preview--${style}`;
        preview.dataset.foil = foil;
        preview.appendChild(this.createCardImage(card, null, style, foil));
        return preview;
    }
    static updateSharedView(game, player) {
        if (game != null && !["O", "F"].includes(game.status) && !game.localCardStyleScope) {
            game.localCardStyleScope = GameLayout.cardStyleScope();
        } else if (game != null && ["O", "F"].includes(game.status)) {
            delete game.localCardStyleScope;
        }
        if (game == null || game.status == "O") { this.clearCardFlights(); }
        document.getElementById("homeButton").hidden = game == null;
        document.getElementById("rulesButton").hidden = false;
        document.getElementById("gameLogButton").hidden = game == null || game.status == "O";
        var capacity = document.getElementById("lobbyCapacity");
        capacity.hidden = game == null || game.status != "O";
        if (!capacity.hidden) {
            capacity.textContent = `${game.players.length}/${MAX_PLAYERS} plasser fylt`;
        }
        var waitingCount = game == null ? 0 : Object.keys(game.waitingSpectators || {}).length;
        var waitingLabel = document.getElementById("waitingPlayers");
        waitingLabel.hidden = waitingCount == 0;
        waitingLabel.textContent = waitingCount == 1
            ? "1 spiller venter på å bli med..."
            : `${waitingCount} spillere venter på å bli med...`;
        GameLayout.cardStylePlayerName = player ? player.name :
            (game == null ? GameLayout.savedPlayerName : null);
        document.documentElement.dataset.cardStyle = GameLayout.cardStyle();
        var appearanceLocked = game != null && !["O", "F"].includes(game.status);
        document.querySelectorAll("#cardStyleOpenButton, #cardFoilOpenButton, .card-style-scope-option, .card-style-option__select, .card-foil-option__select")
            .forEach(button => {
                if (appearanceLocked) { button.disabled = true; }
                else if (button.id == "cardStyleOpenButton" || button.id == "cardFoilOpenButton" ||
                    button.classList.contains("card-style-scope-option")) { button.disabled = false; }
            });
        document.getElementById("cardAppearanceLocked").hidden = !appearanceLocked;
        if (game != null) { game.localPlayerName = player ? player.name : null; }
        var appShell = document.getElementById("gameShell");
        setClass(appShell, "game-active", (game != null));
        setClass(appShell, "Lobby", (game != null && game.status == "O"));
        setClass(appShell, "GameFinished", (game != null && game.status == "F"));
        var menuToggle = document.getElementById("gameMenuToggleButton");
        var mainMenu = document.getElementById("mainMenu");
        var gameControls = document.querySelectorAll("#gameMenu, #playerList, #gameTable, #playerActions, #playerHand");
        var showMenu = (game == null);
        if (showMenu) {
            appShell.classList.remove("GameMenuOpen");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.setAttribute("aria-label", "Åpne spillmeny");
            menuToggle.title = "Åpne spillmeny";
        } else if (game.status == "S" || game.status == "G") {
            appShell.classList.remove("GameMenuOpen");
            menuToggle.setAttribute("aria-expanded", "false");
        }
        mainMenu.setAttribute("aria-hidden", String(!showMenu));
        gameControls.forEach(element => { element.inert = showMenu; });
        if (game != null && player != null &&
            (game.connectionOnline === false || GamePresence.isBot(game, player))) {
            document.getElementById("gameTable").inert = true;
            document.getElementById("playerHand").inert = true;
        }
        this.setVisible("gameMetadata", (player == null || game == null || game.status == "O"));
        if (game == null) {
            this.updatePlayerStatus(null, null);
            setClass(mainMenu, "is-hidden", false);
            this.updateMainMenu();
            var emptyTable = document.getElementById("gameTable");
            if (this.toastRegion == null) {
                this.toastRegion = document.getElementById("gameToastRegion");
            }
            if (this.tableTurnHint == null) {
                this.tableTurnHint = document.getElementById("tableTurnHint");
            }
            if (this.turnTimerElement == null) {
                this.turnTimerElement = document.getElementById("turnTimer");
            }
            this.clearTableContent(emptyTable);
            this.keepTurnTimer(emptyTable);
            delete document.getElementById("gameTable").dataset.gameId;
            delete document.getElementById("gameTable").dataset.gameStatus;
            delete document.getElementById("gameTable").dataset.gameRound;
            delete document.getElementById("gameTable").dataset.turnPauseId;
        } else {
            var table = document.getElementById("gameTable");
            var isContinuingRound = table.dataset.gameId == String(game.id) &&
                table.dataset.gameStatus == "S" &&
                table.dataset.gameRound == String(game.round) &&
                game.status == "S";
            var currentPauseId = game.turnPause ? `${game.id}:${game.turnPause.id}` : null;
            var hasNewPlayedAction = game.turnPause != null &&
                game.turnPause.playedPile != null &&
                table.dataset.gameId == String(game.id) &&
                table.dataset.turnPauseId != currentPauseId;
            var existingPileSignatures = new Set(
                Array.from(document.querySelectorAll("#gameTable .table-play[data-play-signature]"))
                    .map(element => element.dataset.playSignature)
            );
            var playOrigins = (isContinuingRound || hasNewPlayedAction)
                ? this.capturePlayOrigins()
                : null;
            setClass(mainMenu, "is-hidden", true);
            // The splash intro plays once per visit; later returns to the menu use the quick settle.
            setClass(mainMenu, "is-intro", false);
            this.updateGameButtons(game);
            this.updatePlayers(game, player);
            this.updateTable(game, player, existingPileSignatures, playOrigins);
            this.fitNames();
        }
    }
    static updateMainMenu() {
        this.setVisible("newGameButton", true);
        this.setVisible("joinGameButton", true);
    }
    static updateGameButtons(game) {
        this.el("gameIdDisplay").textContent = game.id;
        this.el("settingsGameIdValue").textContent = game.id;
        this.el("settingsGameId").hidden = false;
        this.el("settingsButton").title = `Innstillinger · Spill-ID ${game.id}`;
        var waitingForPlayers = game.status == "O" && game.players.length < 2;
        this.el("gameMenu").classList.toggle("waiting-for-players", waitingForPlayers);
        var startButton = this.el("startGameButton");
        var readyButton = this.el("readyButton");
        var localPlayer = game.getPlayer(game.localPlayerName);
        readyButton.hidden = game.status != "O" || localPlayer == null || GamePresence.isBot(game, localPlayer);
        readyButton.disabled = game.connectionOnline === false ||
            (localPlayer != null && GamePresence.disconnectedAt(game.presence, localPlayer) != null);
        var localPlayerReady = localPlayer != null && localPlayer.ready === true && !readyButton.disabled;
        readyButton.textContent = localPlayerReady ? "Fjern klar" : "Klar";
        readyButton.setAttribute("aria-pressed", String(localPlayerReady));
        startButton.classList.toggle("is-waiting",
            game.status == "O" && (waitingForPlayers || !game.allHumansReady()));
        startButton.disabled = waitingForPlayers;
        switch (game.status) {
            case "O":
                startButton.textContent = waitingForPlayers ? "Venter på flere spillere" :
                    (game.allHumansReady() ? "Start spill" : "Venter på spillere");
                startButton.disabled = !isLobbyHost(game) || !game.allHumansReady() || waitingForPlayers;
                this.setVisible("inviteButton", true);
                this.setVisible("lobbyMainMenuButton", false);
                var lobbyHost = isLobbyHost(game);
                this.setVisible("addBotButton", lobbyHost);
                var lobbyFull = game.players.length >= MAX_PLAYERS;
                this.el("addBotButton").classList.toggle("is-full", lobbyFull);
                this.el("addBotButton").disabled = lobbyFull;
                this.el("addBotButton").textContent = lobbyFull ? "Maks antall spillere nådd" : "Legg til bot";
                if (!lobbyHost) { this.setVisible("addBotButton_Off", false); }
                this.setVisible("startGameButton", lobbyHost);
                this.setVisible("startGameButton_Off", false);
                this.setVisible("mainMenuButton", false);
                break;
            case "S":
            case "G":
                this.setVisible("inviteButton", false);
                updateAutoSuggestionButton();
                this.setVisible("lobbyMainMenuButton", false);
                this.setVisible("addBotButton", false);
                this.el("addBotButton").classList.remove("is-full");
                this.el("addBotButton").disabled = false;
                this.el("addBotButton").textContent = "Legg til bot";
                this.setVisible("addBotButton_Off", false);
                this.setVisible("startGameButton", false);
                this.setVisible("startGameButton_Off", false);
                this.setVisible("mainMenuButton", false);
                break;
            case "F":
                this.el("startGameButton").textContent =
                    game.gameEndVote != null || game.roundStartVote != null
                        ? "Avstemning pågår"
                        : "Start ny runde";
                this.setVisible("inviteButton", game.gameEndVote == null);
                this.setVisible("lobbyMainMenuButton", false);
                var finishedGameHost = isLobbyHost(game);
                this.el("addBotButton").classList.remove("is-full");
                this.el("addBotButton").disabled = false;
                this.el("addBotButton").textContent = "Legg til bot";
                this.setVisible(
                    "addBotButton",
                    finishedGameHost &&
                        game.players.length < MAX_PLAYERS &&
                        game.roundStartVote == null &&
                        game.gameEndVote == null
                );
                if (!finishedGameHost || game.gameEndVote != null) {
                    this.setVisible("addBotButton_Off", false);
                }
                this.setVisible(
                    "startGameButton",
                    finishedGameHost && game.roundStartVote == null && game.gameEndVote == null
                );
                if (game.gameEndVote != null) { this.setVisible("startGameButton_Off", false); }
                this.setVisible("mainMenuButton", false);
                break;
            default:
                throw ('Ukjent spillstatus.');
                break;
        }
    }
    static bindLobbyReorder(element, game, player) {
        element.onpointerdown = element.onkeydown = null;
        element.classList.remove("is-reorderable");
        element.removeAttribute("tabindex");
        element.removeAttribute("title");
        if (game.status != "O" || !isLobbyHost(game)) {
            return;
        }
        element.classList.add("is-reorderable");
        element.tabIndex = 0;
        element.title = "Dra for å flytte. Bruk piltastene med tastatur.";
        var move = async targetName => {
            try {
                await game.reorderLobbyPlayers(player.name, targetName);
            } catch (error) {
                console.error("Kunne ikke flytte spilleren.", error);
                document.dispatchEvent(new CustomEvent("lobby-player-error", {
                    detail: { game, message: error.message }
                }));
            }
        };
        element.onkeydown = event => {
            if (event.target !== element) { return; }
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { return; }
            event.preventDefault();
            var delta = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1;
            var target = game.players[game.players.indexOf(player) + delta];
            if (target) { move(target.name); }
        };
        element.onpointerdown = event => {
            if (event.button != 0 || event.target.closest("button, a, input, select, textarea")) { return; }
            var dragging = false;
            var target = null;
            var cleanup = () => {
                element.classList.remove("is-reordering");
                if (target) { target.classList.remove("is-reorder-target"); }
                element.onpointermove = element.onpointerup = element.onpointercancel = element.onlostpointercapture = null;
                if (element.hasPointerCapture(event.pointerId)) { element.releasePointerCapture(event.pointerId); }
            };
            element.onpointermove = pointer => {
                if (!dragging && Math.hypot(pointer.clientX - event.clientX, pointer.clientY - event.clientY) < 6) { return; }
                if (!dragging) { element.setPointerCapture(event.pointerId); }
                dragging = true;
                pointer.preventDefault();
                element.classList.add("is-reordering");
                var next = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest("#playerList > [data-player-name]");
                if (target) { target.classList.remove("is-reorder-target"); }
                target = next && next !== element ? next : null;
                if (target) { target.classList.add("is-reorder-target"); }
            };
            element.onpointerup = () => {
                var name = target && target.dataset.playerName;
                cleanup();
                if (dragging) {
                    var suppressClick = click => {
                        click.preventDefault();
                        click.stopPropagation();
                    };
                    element.addEventListener("click", suppressClick, { once: true, capture: true });
                    setTimeout(() => element.removeEventListener("click", suppressClick, true), 0);
                }
                if (name) { move(name); }
            };
            element.onpointercancel = element.onlostpointercapture = cleanup;
        };
    }
    static updatePlayers(game, currentPlayer) {
        assignPlayerColors(game);
        var playerList = document.getElementById("playerList");
        playerList.dataset.playerCount = String(game.players.length);
        var canManageLobby = isLobbyHost(game) &&
            (game.status != "F" || game.gameEndVote == null);
        var passedNames = new Set(
            (game.turnPause && game.isTurnPaused() && game.turnPause.passedPlayers) || []
        );
        var existingElements = new Map();
        playerList.querySelectorAll("[data-player-name]").forEach(element => {
            existingElements.set(element.dataset.playerName, element);
        });
        var opponentList = playerList.querySelector(":scope > .opponent-list");
        if (opponentList == null) {
            opponentList = document.createElement("div");
            opponentList.className = "opponent-list";
        }
        var isActiveStatus = (game.status == "S" || game.status == "G");
        // Update player blocks in place so unchanged blocks are never redrawn.
        var updatePlayerSummary = (player, isCurrentPlayer = false) => {
            var playerElement = existingElements.get(player.name);
            existingElements.delete(player.name);
            if (playerElement == null) {
                playerElement = document.createElement("div");
                playerElement.className = "player-summary";
                playerElement.dataset.playerName = player.name;
                var createdName = document.createElement("span");
                createdName.className = "player-summary__name";
                createdName.textContent = player.name;
                this.enableNameExpansion(createdName);
                var createdDetails = document.createElement("span");
                createdDetails.className = "player-summary__details";
                playerElement.append(createdName, createdDetails);
            }
            var isTurn = player.turn == 1;
            var isPassed = game.status == "S" && !isTurn &&
                (player.lastPlay === "Pass" || passedNames.has(player.name));
            playerElement.classList.toggle("player-summary--self", isCurrentPlayer);
            playerElement.classList.toggle("is-current-turn", isTurn && isActiveStatus);
            playerElement.classList.toggle("player-summary--passed", isPassed);
            var turnState = isTurn && isActiveStatus ? "turn" : (isPassed ? "passed" : "");
            if (playerElement.dataset.turnState !== undefined &&
                playerElement.dataset.turnState !== turnState && turnState !== "" &&
                document.getElementById("shuffleOverlay") == null &&
                document.querySelector(".player-summary--starter-flash") == null) {
                playerElement.classList.remove("player-summary--pulse-turn", "player-summary--pulse-passed");
                void playerElement.offsetWidth;
                playerElement.classList.add(`player-summary--pulse-${turnState}`);
                if (typeof playerElement.animate == "function" &&
                    !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    playerElement.animate([
                        { scale: "1" }, { scale: "1.035", offset: 0.45 }, { scale: "1" }
                    ], { duration: 900, easing: "ease-in-out" });
                }
                var finishAttention = event => {
                    if (event.target != playerElement || event.animationName != "attention-flash") { return; }
                    playerElement.classList.remove("player-summary--pulse-turn", "player-summary--pulse-passed");
                    playerElement.removeEventListener("animationend", finishAttention);
                };
                playerElement.addEventListener("animationend", finishAttention);
            }
            playerElement.dataset.turnState = turnState;
            playerElement.style.setProperty("--player-color", player.displayColor);
            var detailsText;
            var displayedPlacement = displayedPlayerPlacement(game, player);
            var reconnecting = player.playerKey != "PC" &&
                ((isCurrentPlayer && game.connectionOnline === false) ||
                    GamePresence.disconnectedAt(game.presence, player) != null);
            playerElement.classList.toggle("player-summary--ready",
                game.status == "O" && !reconnecting &&
                (player.ready === true || GamePresence.isBot(game, player)));
            if (reconnecting) {
                detailsText = "Kobler til igjen …";
            } else if (GamePresence.isBot(game, player) && player.playerKey != "PC") {
                detailsText = isCurrentPlayer ? "Bot spiller for deg" : "Bot spiller";
            } else if (player.leaveAfterExchange === true) {
                detailsText = "Forlater etter bytte";
            } else if (player.placement == 0 && isActiveStatus) {
                detailsText = `${player.cards.length} kort`;
            } else if (game.status == "O") {
                detailsText = player.playerKey == "PC" || player.ready === true ? "Klar" : "Ikke klar";
            } else if (player.placement > 0) {
                detailsText = game.placementTitle(player.placement).title;
            } else {
                detailsText = "Venter";
            }
            var detailsElement = playerElement.querySelector(".player-summary__details");
            var detailsTextElement = detailsElement.querySelector(".player-summary__details-text");
            if (detailsTextElement == null) {
                detailsElement.replaceChildren();
                detailsTextElement = document.createElement("span");
                detailsTextElement.className = "player-summary__details-text";
                detailsElement.appendChild(detailsTextElement);
            }
            if (detailsTextElement.textContent != detailsText) {
                detailsTextElement.textContent = detailsText;
            }
            detailsTextElement.classList.toggle("player-summary__low-cards",
                game.status == "S" && player.placement == 0 &&
                !reconnecting && !(game.controllers || {})[GamePresence.playerId(player)] &&
                player.cards.length > 0 && player.cards.length <= 2);
            var hostLabel = playerElement.querySelector(".player-summary__host");
            var isHostPlayer = game.status == "O" && player.playerKey == game.hostKey &&
                (game.hostName == null || player.name == game.hostName);
            if (isHostPlayer && hostLabel == null) {
                hostLabel = document.createElement("small");
                hostLabel.className = "player-summary__host";
                hostLabel.textContent = "Vert";
                playerElement.appendChild(hostLabel);
            } else if (!isHostPlayer && hostLabel != null) {
                hostLabel.remove();
            }
            var rankIcon = displayedPlacement > 0
                ? resultIconForPlacement(game, displayedPlacement)
                : null;
            var rankIconElement = detailsElement.querySelector(".player-summary__rank-icon");
            if (rankIcon == null) {
                if (rankIconElement != null) { rankIconElement.remove(); }
            } else {
                if (rankIconElement == null) {
                    rankIconElement = document.createElement("span");
                    rankIconElement.className = "player-summary__rank-icon";
                    rankIconElement.setAttribute("aria-hidden", "true");
                    detailsElement.insertBefore(rankIconElement, detailsTextElement);
                }
                if (rankIconElement.textContent != rankIcon) {
                    rankIconElement.textContent = rankIcon;
                }
            }
            var turnElement = playerElement.querySelector(".player-summary__turn");
            if (isActiveStatus) {
                if (turnElement == null) {
                    turnElement = document.createElement("span");
                    turnElement.className = "player-summary__turn";
                    playerElement.appendChild(turnElement);
                }
                var turnText = "";
                var turnLabel = null;
                if (isTurn) {
                    turnText = isCurrentPlayer ? "Din tur" : "Tur";
                    turnLabel = isCurrentPlayer ? "Du har tur" : "Denne spilleren har tur";
                } else if (isPassed) {
                    turnText = "Pass";
                    turnLabel = `${player.name} har passet`;
                }
                if (turnElement.textContent != turnText) {
                    turnElement.textContent = turnText;
                }
                if (turnLabel != null) {
                    turnElement.setAttribute("aria-label", turnLabel);
                    turnElement.removeAttribute("aria-hidden");
                } else {
                    turnElement.removeAttribute("aria-label");
                    turnElement.setAttribute("aria-hidden", "true");
                }
            } else if (turnElement != null) {
                turnElement.remove();
            }
            var removeButton = playerElement.querySelector(":scope > button");
            if (canManageLobby && !isCurrentPlayer && !isActiveStatus) {
                if (removeButton == null) {
                    removeButton = document.createElement("button");
                    removeButton.type = "button";
                    removeButton.textContent = "Fjern";
                    removeButton.setAttribute("aria-label", `Fjern ${player.name}`);
                    playerElement.appendChild(removeButton);
                }
                removeButton.onclick = async function () {
                    if (!isLobbyHost(game) || game.status == "S" || game.status == "G" ||
                        game.gameEndVote != null) {
                        return;
                    }
                    var result = await game.removeLobbyPlayer(player);
                    if (result.text) {
                        document.dispatchEvent(new CustomEvent("lobby-player-error", {
                            detail: { game: game, message: result.text }
                        }));
                    }
                };
            } else if (removeButton != null) {
                removeButton.remove();
            }
            playerElement.classList.toggle("is-my-turn", player.placement == 0 && isTurn);
            playerElement.classList.toggle("OneCard", player.placement == 0 && player.cards.length == 1);
            playerElement.classList.toggle("is-finished", player.placement != 0);
            this.bindLobbyReorder(playerElement, game, player);
            return playerElement;
        };
        var placeElement = (parent, element, index) => {
            if (parent.children[index] !== element) {
                parent.insertBefore(element, parent.children[index] || null);
            }
        };
        if (game.status == "O") {
            var lobbyElements = game.players.map(player =>
                updatePlayerSummary(player, player === currentPlayer));
            var emptySeats = playerList.querySelectorAll(".lobby-empty-seat");
            for (var index = lobbyElements.length; index < MAX_PLAYERS; index++) {
                var emptySeat = emptySeats[index - game.players.length] || document.createElement("div");
                emptySeat.className = "lobby-empty-seat";
                emptySeat.textContent = "Ledig plass";
                lobbyElements.push(emptySeat);
            }
            lobbyElements.forEach((element, index) => placeElement(playerList, element, index));
            existingElements.forEach(staleElement => staleElement.remove());
            Array.from(playerList.children).forEach(child => {
                if (!lobbyElements.includes(child)) { child.remove(); }
            });
            return;
        }
        var selfElement = currentPlayer ? updatePlayerSummary(currentPlayer, true) : null;
        var currentPlayerIndex = (currentPlayer == null) ? -1 : game.players.indexOf(currentPlayer);
        var opponents = currentPlayerIndex < 0
            ? game.players.slice()
            : game.players.slice(currentPlayerIndex + 1).concat(game.players.slice(0, currentPlayerIndex));
        var opponentElements = opponents.map(player => updatePlayerSummary(player));
        existingElements.forEach(staleElement => staleElement.remove());
        if (selfElement) {
            placeElement(playerList, selfElement, 0);
        }
        placeElement(playerList, opponentList, selfElement ? 1 : 0);
        opponentElements.forEach((element, index) => {
            element.className = element.className.replace(/\s*opponent-seat-\d+/g, "");
            element.classList.add(`opponent-seat-${index}`);
            element.dataset.clockwiseSeat = String(index);
            placeElement(opponentList, element, index);
        });
        Array.from(playerList.children).forEach(child => {
            if (child !== selfElement && child !== opponentList) { child.remove(); }
        });
    }
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
    static exchangeStatus(game, player) {
        var playerIndex = player == null ? -1 : game.players.indexOf(player);
        var outgoing = game.piles.filter(exchange =>
            exchange.from == playerIndex &&
            ["Velg", "Best", "Gitt"].includes(exchange.mode)
        );
        var selectableOutgoing = outgoing.filter(exchange => exchange.mode == "Velg");
        var selectedExchange = outgoing.find(exchange => getExchangeId(exchange) == activeExchangeId) ||
            (selectableOutgoing.length == 1 ? selectableOutgoing[0] :
                outgoing.find(exchange => exchange.mode == "Best" || exchange.mode == "Gitt"));
        var prompt = "";
        if (GamePresence.exchangeBlocksActions(game) ||
            (player && GamePresence.exchangeGateForPlayer(game, player))) {
            prompt = "Venter på at spillerne bekrefter mottatte kort …";
        } else if (selectedExchange != null && player != null) {
            var recipient = game.players[selectedExchange.to];
            prompt = selectedExchange.mode == "Best"
                ? (selectedExchange.count == 1
                    ? `Du må gi ditt beste kort til ${recipient.name}`
                    : `Du må gi dine to beste kort til ${recipient.name}`)
                : `Kort til ${recipient.name} (${selectedExchange.cards.length}/${selectedExchange.count})`;
        } else if (selectableOutgoing.length > 1) {
            prompt = "Velg hvilket bytte du vil gjøre";
        } else if (game.piles.some(exchange => exchange.mode == "Velg" || exchange.mode == "Best")) {
            var pendingCount = game.piles.filter(exchange =>
                ["Velg", "Best", "Gitt", "Kan se"].includes(exchange.mode)
            ).length;
            prompt = `${pendingCount} bytte${pendingCount == 1 ? "" : "r"} gjenstår`;
        } else if (game.piles.some(exchange => exchange.mode == "Kan se")) {
            prompt = "Motta kortene som venter";
        } else if (game.piles.some(exchange => exchange.mode == "Tilbud")) {
            prompt = activeTradeOffer(game)?.forcedAt != null
                ? "Venter på mottakerens valg av bytte."
                : "Tving bytte eller velg Ingen bytte";
        } else {
            prompt = "Venter på at byttene fullføres";
        }
        return { selectedExchange, prompt };
    }
    static saveExchangeSelection(game, exchange) {
        if (exchange.kind != "playerTrade") {
            game.pendingExchangeAction = {
                id: getExchangeId(exchange), cards: PresidentCard.serializeDeck(exchange.cards), select: true
            };
        }
        return game.save();
    }
    static updatePlayerStatus(game, player) {
        var status = this.el("playerStatus");
        status.textContent = game != null && game.status == "G" && !this.isShuffling(game)
            ? this.exchangeStatus(game, player).prompt
            : "";
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
                                        ? `${fromPlayer.name} har tvunget et bytte. Ureglementert bytte?`
                                        : `${fromPlayer.name} har tvunget et bytte. Bekreft vanlig bytte med kort 7–J.`)
                                    : isSender
                                        ? (sneakyAvailable
                                            ? `Venter på at ${toPlayer.name} velger ureglementert eller vanlig bytte.`
                                            : `Venter på at ${toPlayer.name} bekrefter vanlig bytte.`)
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
                        var isParticipant = isSender || isRecipient;
                        var canInitiate = isSender && exchange.forcedAt == null && !game.exchangeReady;
                        var participantIndex = currentPlayerIndex;
                        if (isParticipant && isSneakyTradeAvailable(game) &&
                            exchange.forcedAt == null && !game.exchangeReady) {
                            var sneakyButton = document.createElement("button");
                            sneakyButton.type = "button";
                            sneakyButton.textContent = "Ureglementert bytte";
                            sneakyButton.className = "exchange-offer__sneaky exchange-sneaky-toggle";
                            sneakyButton.setAttribute("aria-pressed", String(voters.includes(participantIndex)));
                            sneakyButton.onclick = function () {
                                game.toggleSneakyTrade(exchange, participantIndex);
                            };
                            buttonSpan.appendChild(sneakyButton);
                        }
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
                            for (const sneaky of isSneakyTradeAvailable(game) ? [true, false] : [false]) {
                                var responseButton = document.createElement("button");
                                responseButton.type = "button";
                                responseButton.textContent = sneaky ? "Ureglementert bytte" : "Vanlig bytte";
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
    static updatePlayerView(game, player) {
        setClass(document.getElementById("gameShell"), "spectator-mode", (player == null));
        setClass(document.getElementById("gameShell"), "cards-only-mode", (game != null && game.rules.showCardsOnly && player != null));
        var waitingForShuffle = this.isShuffling(game) ||
            (game != null && document.getElementById("playerHand").classList.contains("is-dealing-wait"));
        this.updatePlayerButtons(waitingForShuffle ? null : game, waitingForShuffle ? null : player);
        this.updateHand(waitingForShuffle ? null : game, waitingForShuffle ? null : player, null, true);
        var blocked = game != null && player != null &&
            (game.connectionOnline === false || GamePresence.isBot(game, player));
        document.getElementById("playerHand").inert = blocked;
        document.getElementById("gameTable").inert = game == null || blocked;
        var exchangeActions = document.getElementById("exchangeActions");
        if (exchangeActions) {
            exchangeActions.inert = game == null || blocked || game.localWritePending === true;
            if (game == null || (player && GamePresence.isBot(game, player))) {
                exchangeActions.hidden = true;
            }
        }
        if (blocked) { this.setVisible("passButton", false); }
    }
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
    static updatePlayerButtons(game, player) {
        this.updatePlayerStatus(game, player);
        this.el("playerStatus").classList.remove("player-status--turn-hint");
        if (game == null) {
            ["exchangeActions", "tableTurnHint"].forEach(id => {
                var element = this.el(id);
                if (element) { element.hidden = true; }
            });
            ["reclaimSeatButton", "extendTurnButton", "turnCountdown"].forEach(id => {
                var hiddenElement = this.el(id);
                if (hiddenElement != null) { hiddenElement.hidden = true; }
            });
            this.setVisible("joinAsPlayerButton", false);
            this.setVisible("passButton", false);
            this.setVisible("passButton_Off", false);
            this.setVisible("leaveGameButton", false);
            this.setVisible("changeNameButton", true);
            return;
        }
        var pauseActive = game.isTurnPaused();
        if (setClass(this.el("playerActions"), "is-my-turn", (player != null && player.turn))) {
            // Update turn-dependent controls when the state changes.
            setClass(this.el("playerHand"), "is-my-turn", (player != null && player.turn));
            if (player != null && player.turn) {
                // Enable vibration feedback where supported.
                navigator.vibrate = navigator.vibrate || navigator.webkitVibrate || navigator.mozVibrate || navigator.msVibrate;
                if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                }
            }
        };
        this.setVisible(
            "joinAsPlayerButton",
            player == null &&
                (game.status == "O" || game.status == "F") &&
            (game.players.length < MAX_PLAYERS || game.players.some(candidate => candidate.playerKey == "PC")) &&
            game.roundStartVote == null &&
            game.gameEndVote == null
        );
        var isPassTurn = player != null &&
            game.status == "S" &&
            player.placement == 0 &&
            player.turn == 1;
        var canPass = isPassTurn && !pauseActive;
        this.el("passButton").disabled = game.connectionOnline === false ||
            (player != null && GamePresence.isBot(game, player)) ||
            game.localWritePending === true || pauseActive;
        this.setVisible("passButton", canPass);
        this.setVisible(
            "passButton_Off",
            player != null && game.status == "S" && player.placement == 0 &&
            !GamePresence.isBot(game, player) && !canPass &&
            (game.topPile() != null || player.turn != 1 || pauseActive)
        );
        this.setVisible("leaveGameButton", false);
        this.setVisible(
            "changeNameButton",
            game.status == "O"
        );
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
                    (Math.hypot(finishX, finishY) >= CARD_FLICK_MIN_DISTANCE &&
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
                    : ((selectedCardStrength == PresidentCard.clubThreePower()) ? 1 : topPile.length);
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
            var s = (resultIcon == null)
                ? ""
                : `<span class="player-placement-result-icon" aria-hidden="true">${resultIcon}</span>`;
            if (game.status == "S") {
                s += `<span>Du ble <b>${game.placementTitle(player.placement).title}</b>. Venter på at de andre skal spille ferdig.</span>`;
            } else {
                s += `<span>Du ble <b>${game.placementTitle(player.placement).title}</b>.</span>`;
            }
            element.innerHTML = s;
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
}
