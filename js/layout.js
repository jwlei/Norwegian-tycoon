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
    // Adds the static methods of a class (from the layout-*.js files) to GameLayout.
    static extend(methods) {
        for (const name of Object.getOwnPropertyNames(methods)) {
            if (!["length", "name", "prototype"].includes(name)) {
                Object.defineProperty(this, name, Object.getOwnPropertyDescriptor(methods, name));
            }
        }
    }
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
        if (isVisible === null) {
            isVisible = element.style.display == "none";
        } else if (typeof isVisible != "boolean") {
            throw new TypeError("Ukjent argument.");
        }
        element.style.display = isVisible ? "inline" : "none";
        // An optional disabled "<id>_Off" twin is shown in the element's place while it is hidden.
        var placeholder = element.id ? this.el(element.id + "_Off") : null;
        if (placeholder) { placeholder.style.display = isVisible ? "none" : "inline"; }
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
        this.updateCustomRules(game);
        this.el("gameIdDisplay").textContent = game.id;
        this.el("gameIdDisplay").title = game.status == "O" ? "Inviter spiller" : "Trykk for å kopiere spill-ID";
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
                // In the lobby the game ID at the top opens the invite.
                this.setVisible("inviteButton", false);
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
    // Custom rules: the lobby panel (tap a rule to read it).
    static updateCustomRules(game) {
        GameLayout.customRulesGame = game;
        var rules = activeCustomRules(game.rules);
        if (!rules.some(rule => rule.id == GameLayout.openCustomRule)) { GameLayout.openCustomRule = null; }
        var panel = this.el("customRulesPanel");
        panel.hidden = game.status != "O" || (rules.length == 0 && !isLobbyHost(game));
        if (!panel.hidden) { this.renderCustomRulesPanel(panel, game, rules); }
    }
    static renderCustomRulesPanel(panel, game, rules) {
        var host = isLobbyHost(game);
        var seats = Math.max(2, game.players.length);
        var signature = JSON.stringify([rules.map(rule => rule.id), host, seats, GameLayout.openCustomRule]);
        if (panel.dataset.signature == signature) { return; }
        panel.dataset.signature = signature;
        var make = (tag, className, text) => {
            var node = document.createElement(tag);
            if (className) { node.className = className; }
            if (text != null) { node.textContent = text; }
            return node;
        };
        var edit = make("button", "custom-rules-edit", rules.length ? "Endre" : "Endre regler");
        edit.type = "button";
        edit.onclick = () => CustomRulesUI.openEditor(game);
        // Without custom rules only the host sees the panel, as a single button.
        panel.classList.toggle("is-empty", rules.length == 0);
        if (!rules.length) { panel.replaceChildren(edit); return; }
        var head = make("div", "custom-rules-panel__head");
        var heading = make("span", "custom-rules-panel__heading");
        heading.appendChild(make("span", "custom-rules-panel__title", "Regler"));
        head.appendChild(heading);
        if (host) { head.appendChild(edit); }
        panel.replaceChildren(head);
        var chips = make("ul", "custom-rules-chips");
        rules.forEach(rule => {
            var open = GameLayout.openCustomRule == rule.id;
            var chip = make("button", "custom-rule-chip", rule.title);
            chip.type = "button";
            chip.setAttribute("aria-expanded", String(open));
            chip.setAttribute("aria-controls", "customRuleDetails");
            chip.onclick = () => {
                GameLayout.openCustomRule = open ? null : rule.id;
                this.renderCustomRulesPanel(panel, game, rules);
                Array.from(panel.querySelectorAll(".custom-rule-chip"))[rules.indexOf(rule)]?.focus();
            };
            var item = make("li");
            item.appendChild(chip);
            chips.appendChild(item);
        });
        panel.appendChild(chips);
        var openRule = rules.find(rule => rule.id == GameLayout.openCustomRule);
        if (openRule) {
            var details = make("div", "custom-rules-explain");
            details.id = "customRuleDetails";
            details.append(make("strong", null, openRule.title), make("p", null, customRuleDetails(openRule, seats)));
            panel.appendChild(details);
        } else {
            panel.appendChild(make("p", "custom-rules-hint", "Trykk på en regel for å lese mer."));
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
}
