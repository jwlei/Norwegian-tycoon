class GamePresence {
    static actionMs = 120000;
    static disconnectMs = 120000;
    static hostMs = 240000;
    static sessionMs = 600000;
    static serverOffset = 0;

    static now() { return Date.now() + this.serverOffset; }

    static lastActivityAt(record) {
        if (record == null) { return null; }
        var lastAction = record.lastHumanActionAt;
        if (lastAction == null) {
            lastAction = typeof record.ts == "number" ? record.ts : Date.parse(record.ts);
        }
        return lastAction != null && Number.isFinite(Number(lastAction)) ? Number(lastAction) : null;
    }

    static isExpired(record, now = this.now()) {
        if (record == null) { return false; }
        var lastAction = this.lastActivityAt(record);
        return record.status == "V" || (lastAction != null && now - lastAction > this.sessionMs);
    }

    static playerId(player) {
        return Array.from(JSON.stringify([player.playerKey || player.spillerKey, player.name || player.nick]))
            .map(character => character.codePointAt(0).toString(16)).join("-");
    }

    static disconnectedAt(presence, player) {
        var sessions = Object.values((presence || {})[this.playerId(player)] || {});
        if (sessions.length == 0 || sessions.some(session => session.online === true)) { return null; }
        return Math.max(...sessions.map(session => Number(session.changedAt) || 0));
    }

    static isOnline(presence, player) {
        return Object.values((presence || {})[this.playerId(player)] || {})
            .some(session => session.online === true);
    }

    static isBot(game, player) {
        return player.playerKey == "PC" || !!(game.controllers || {})[this.playerId(player)];
    }

    static onlyBotsRemain(record) {
        if (record == null || record.status != "S") { return false; }
        var active = (record.players || record.spillere || []).filter(player =>
            (player.placement ?? player.plassering) == 0
        );
        return active.length > 1 && active.every(player =>
            (player.playerKey || player.spillerKey) == "PC" ||
            !!(record.controllers || {})[this.playerId(player)]
        );
    }

    static activeHumanCount(record) {
        return (record.spillere || record.players || []).filter(player =>
            player.playerKey != "PC" && player.spillerKey != "PC" &&
            player.gaveUp !== true &&
            !(record.controllers || {})[this.playerId(player)]
        ).length;
    }

    static roundToken(record) {
        return JSON.stringify([record.shuffleStartedAt || null, record.runde ?? record.round]);
    }

    static hasExtendedThisRound(record, player) {
        return (record.turnExtensions || {})[this.playerId(player)] === this.roundToken(record);
    }

    static canDrive(game, now = this.now()) {
        if (game.connectionOnline === false || this.isExpired(game, now)) { return false; }
        var host = game.players.find(player => player.playerKey == game.hostKey &&
            (!game.hostName || player.name == game.hostName));
        var offlineAt = host ? this.disconnectedAt(game.presence, host) : null;
        if (offlineAt == null) { return isLobbyHost(game); }
        if (now < offlineAt + this.disconnectMs) { return false; }
        // Keep bots running during the extra grace period before the host role transfers.
        var driver = game.players.find(player => player.playerKey != "PC" &&
            player.gaveUp !== true && this.isOnline(game.presence, player));
        return driver != null && driver.playerKey == getPlayerKey() &&
            driver.name == game.localPlayerName;
    }

    static actionToken(record, player, index) {
        if (record.status == "S" && player.plassering == 0 && record.sinTur == index &&
            record.turnPause == null) {
            return JSON.stringify([record.shuffleStartedAt, record.runde, index, record.spillBunke || []]);
        }
        if (record.status == "G") {
            var exchanges = (record.spillBunke || []).filter(exchange =>
                (exchange.modus == "Tilbud" && (exchange.fra == index ||
                    (exchange.til == index && (exchange.sneakyVotes || []).includes(exchange.fra)))) ||
                ((exchange.modus == "Velg" || exchange.modus == "Best") && exchange.fra == index) ||
                (exchange.modus == "Kan se" && exchange.til == index));
            if (exchanges.length > 0) {
                return JSON.stringify([record.shuffleStartedAt, exchanges.map(exchange =>
                    [exchange.id, exchange.modus, (exchange.sneakyVotes || []).includes(index)])]);
            }
        }
        return null;
    }

    static reconcile(record, now = this.now()) {
        if (record == null || record.status == "V") { return; }
        var baseline = this.lastActivityAt(record);
        var changed = record.lastHumanActionAt == null && baseline != null;
        if (changed) { record = Object.assign({}, record, { lastHumanActionAt: baseline }); }
        if (this.isExpired(record, now)) {
            return Object.assign({}, record, { status: "V" });
        }
        var players = (record.spillere || []).slice();
        var controllers = Object.assign({}, record.controllers);
        var deadlines = Object.assign({}, record.actionDeadlines);
        var notices = (record.connectionNotices || []).slice();
        var timersEnabled = this.activeHumanCount(record) > 1;
        players.forEach((player, index) => {
            if (player.spillerKey == "PC" || player.gaveUp === true) { return; }
            var id = this.playerId(player);
            var token = timersEnabled ? this.actionToken(record, player, index) : null;
            var deadline = deadlines[id];
            if (token != null && !controllers[id] && (!deadline || deadline.token != token)) {
                deadlines[id] = { token, until: Math.max(now, Number(record.shuffleStartedAt || 0) + SHUFFLE_DURATION_MS) + this.actionMs, extended: this.hasExtendedThisRound(record, player) };
                deadline = deadlines[id];
                changed = true;
            } else if (token == null && deadline) {
                delete deadlines[id];
                changed = true;
            }
            var offlineAt = this.disconnectedAt(record.presence, player);
            if (record.status == "O" && offlineAt != null && player.ready === true) {
                players[index] = Object.assign({}, player, { ready: false });
                changed = true;
            }
            var offlineExpired = offlineAt != null && now >= offlineAt + this.disconnectMs;
            var idleExpired = offlineAt == null && deadline && token != null && now >= deadline.until;
            if ((record.status == "S" || record.status == "G") &&
                player.plassering == 0 && !controllers[id] && (offlineExpired || idleExpired)) {
                controllers[id] = { since: now, reason: offlineExpired ? "offline" : "idle" };
                notices.push({
                    id: `${id}:${now}`,
                    message: offlineExpired
                        ? `${player.nick} ble frakoblet. En bot overtar.`
                        : `${player.nick} brukte opp tiden. En bot overtar.`
                });
                changed = true;
            }
        });
        var host = players.find(player => player.spillerKey == record.hostKey &&
            (!record.hostName || player.nick == record.hostName));
        var hostOffline = host ? this.disconnectedAt(record.presence, host) : null;
        if (!host || (hostOffline != null && now >= hostOffline + this.hostMs)) {
            var successor = players.find(player => player.spillerKey != "PC" &&
                player.gaveUp !== true && this.isOnline(record.presence, player));
            if (successor && (successor.spillerKey != record.hostKey || successor.nick != record.hostName)) {
                record = Object.assign({}, record, { hostKey: successor.spillerKey, hostName: successor.nick });
                changed = true;
            }
        }
        if (!changed) { return; }
        return Object.assign({}, record, {
            spillere: players, controllers, actionDeadlines: deadlines, connectionNotices: notices.slice(-12)
        });
    }

    constructor({ game, playerName, refresh, notify, remember }) {
        this.game = game;
        this.playerName = playerName;
        this.refresh = refresh;
        this.notify = notify;
        this.remember = remember;
        this.seen = new Set();
        this.offset = GamePresence.serverOffset;
        this.online = false;
        this.pending = false;
        this.stopped = false;
        this.retryAt = 0;
        this.connectedRef = firebase.database().ref(".info/connected");
        this.offsetRef = firebase.database().ref(".info/serverTimeOffset");
        this.onOffset = snapshot => {
            this.offset = Number(snapshot.val()) || 0;
            GamePresence.serverOffset = this.offset;
        };
        this.onConnected = snapshot => {
            this.online = snapshot.val() === true;
            this.game.connectionOnline = this.online;
            if (!this.online) { this.registeredId = null; }
            if (this.online) { this.register(); }
            this.refresh();
        };
        this.offsetRef.on("value", this.onOffset);
        this.connectedRef.on("value", this.onConnected);
        this.ticker = setInterval(() => this.tick(), 1000);
    }

    now() { return Date.now() + this.offset; }

    async register() {
        if (!this.game.players || GamePresence.isExpired(this.game, this.now())) { return; }
        var player = this.game.getPlayer(this.playerName());
        if (!player || player.playerKey == "PC") { return; }
        var id = GamePresence.playerId(player);
        if (this.registeredId == id && this.session != null) { return; }
        this.registeredId = id;
        var previousSession = this.session;
        var session = this.game.databaseRef.child(`presence/${id}`).push();
        this.session = session;
        try {
            await session.onDisconnect().set({ online: false, changedAt: firebase.database.ServerValue.TIMESTAMP });
            if (this.stopped || !this.online || this.session !== session) {
                await session.onDisconnect().cancel();
                return;
            }
            await session.set({ online: true, changedAt: firebase.database.ServerValue.TIMESTAMP });
            if (previousSession) {
                await previousSession.onDisconnect().cancel();
                await previousSession.remove();
            }
            if (this.stopped || this.session !== session) { return; }
            this.remember(player);
        } catch (error) {
            this.registeredId = null;
            console.error("Kunne ikke registrere tilkoblingen.", error);
            this.notify("Kunne ikke registrere tilkoblingen. Prøver igjen.");
        }
    }

    receive(record) {
        if (!this.record) {
            (record.connectionNotices || []).forEach(notice => this.seen.add(notice.id));
        }
        this.record = record;
        this.game.lastHumanActionAt = GamePresence.lastActivityAt(record);
        this.game.presence = record.presence || {};
        this.game.controllers = record.controllers || {};
        this.game.actionDeadlines = record.actionDeadlines || {};
        this.game.turnExtensions = record.turnExtensions || {};
        (record.connectionNotices || []).forEach(notice => {
            if (!this.seen.has(notice.id)) {
                this.seen.add(notice.id);
                this.notify(notice.message);
            }
        });
        if (this.online) { this.register(); }
        this.tick();
    }

    async tick() {
        this.refresh();
        if (!this.online || this.pending || !this.record || this.stopped || this.now() < this.retryAt) { return; }
        this.register();
        if (!GamePresence.reconcile(this.record, this.now())) { return; }
        this.pending = true;
        try {
            var result = await this.game.databaseRef.transaction(record => GamePresence.reconcile(record, this.now()), undefined, false);
            if (result.committed && result.snapshot.val() && result.snapshot.val().status == "V") {
                this.game.status = "V";
                this.game.updatePublicListing();
            }
        } catch (error) {
            this.retryAt = this.now() + 5000;
            console.error("Kunne ikke oppdatere spillerstatus.", error);
            this.notify("Kunne ikke oppdatere spillerstatus. Prøver igjen.");
        } finally {
            this.pending = false;
        }
    }

    async changeControl(reclaim = false) {
        var player = this.game.getPlayer(this.playerName());
        if (!player || !this.online || this.pending) { return; }
        var id = GamePresence.playerId(player);
        this.pending = true;
        try {
            var result = await this.game.databaseRef.transaction(record => {
                if (!record || GamePresence.isExpired(record, this.now())) { return; }
                var owner = (record.spillere || []).find(candidate =>
                    candidate.spillerKey == player.playerKey && candidate.nick == player.name);
                if (!owner || owner.spillerKey != getPlayerKey()) { return; }
                var deadline = (record.actionDeadlines || {})[id];
                if (reclaim) {
                    if (!(record.controllers || {})[id]) { return; }
                    record.controllers = Object.assign({}, record.controllers);
                    delete record.controllers[id];
                    if (deadline) {
                        record.actionDeadlines = Object.assign({}, record.actionDeadlines, {
                            [id]: Object.assign({}, deadline, {
                                until: this.now() + GamePresence.actionMs,
                                extended: GamePresence.hasExtendedThisRound(record, owner) || deadline.extended === true
                            })
                        });
                    }
                } else {
                    if (!deadline || deadline.extended || GamePresence.hasExtendedThisRound(record, owner) ||
                        deadline.token != GamePresence.actionToken(record, owner, record.spillere.indexOf(owner)) ||
                        this.now() >= deadline.until ||
                        (record.controllers || {})[id]) { return; }
                    record.turnExtensions = Object.assign({}, record.turnExtensions, {
                        [id]: GamePresence.roundToken(record)
                    });
                    record.actionDeadlines = Object.assign({}, record.actionDeadlines, {
                        [id]: Object.assign({}, deadline, { until: deadline.until + GamePresence.actionMs, extended: true })
                    });
                }
                return record;
            }, undefined, false);
            if (!result.committed) { this.notify("Handlingen er ikke lenger tilgjengelig."); }
        } catch (error) {
            console.error("Kunne ikke oppdatere tidsfristen.", error);
            this.notify("Kunne ikke oppdatere tidsfristen. Prøv igjen.");
        } finally {
            this.pending = false;
        }
    }

    stop() {
        this.stopped = true;
        clearInterval(this.ticker);
        this.connectedRef.off("value", this.onConnected);
        this.offsetRef.off("value", this.onOffset);
        if (this.session) {
            this.session.onDisconnect().cancel().catch(error => console.error("Kunne ikke avslutte tilkoblingen.", error));
            this.session.remove().catch(error => console.error("Kunne ikke fjerne tilkoblingen.", error));
        }
    }
}
