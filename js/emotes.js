// Emotes: a fixed set of reactions shown as speech bubbles at the speaker's seat.
// They travel outside the game document, so sending one never re-renders the table or retries a move.
// Bots read what happened in the game, never which rules are on, so they work under every custom rule setup.
const EMOTE_PATH = "boms_emotes";
const EMOTES = [
    { id: "hi", emoji: "👋", label: "Hei!" },
    { id: "gg", emoji: "👏", label: "GG" },
    { id: "ty", emoji: "🙏", label: "Takk!" },
    { id: "wow", emoji: "😮", label: "Oi!" },
    { id: "omg", emoji: "😅", label: "omg" },
    { id: "excellent", emoji: "😈", label: "Utmerket" }
];
// Unlocked by rounds played, in this order. `like` names the default emote a bot answers it as; bots only ever say the defaults.
const EMOTE_EXTRAS = [
    { id: "fatal", emoji: "💀", label: "Dødsstøt", like: "excellent" },
    { id: "defeat", emoji: "😭", label: "Totalt nederlag", like: "omg" },
    { id: "rage", emoji: "😡", label: "Rent raseri", like: "omg" },
    { id: "foolish", emoji: "🤡", label: "Tåpelig trekk", like: "excellent" },
    { id: "ghost", emoji: "👻", label: "Usynlig trussel", like: "excellent" },
    { id: "alien", emoji: "👽", label: "Uortodoks strategi", like: "wow" },
    { id: "garbage", emoji: "💩", label: "Søppelhånd", like: "omg" },
    { id: "strike", emoji: "🎯", label: "Perfekt treff", like: "excellent" },
    { id: "galaxy", emoji: "🧠", label: "Galaksehjerne", like: "excellent" },
    { id: "dominance", emoji: "👑", label: "Total dominans", like: "excellent" },
    { id: "motives", emoji: "🎭", label: "Skjulte motiver", like: "wow" },
    { id: "goodgame", emoji: "🤝", label: "Godt spilt", like: "gg" },
    { id: "mercy", emoji: "🙏", label: "Ber om nåde", like: "omg" },
    { id: "wasted", emoji: "💸", label: "Bortkastede ressurser", like: "excellent" },
    { id: "value", emoji: "📈", label: "Verdi skapt", like: "excellent" },
    { id: "badtrade", emoji: "📉", label: "Elendig bytte", like: "omg" },
    { id: "lethal", emoji: "⚔️", label: "Dødelig angrep", like: "excellent" },
    { id: "predicted", emoji: "🔮", label: "Forutså trekket", like: "excellent" },
    { id: "questionable", emoji: "🧐", label: "Tvilsomt trekk", like: "excellent" },
    { id: "salt", emoji: "🧂", label: "Salt oppdaget", like: "excellent" },
    { id: "calculated", emoji: "🧠", label: "Beregnet", like: "excellent" },
    { id: "trapped", emoji: "🪤", label: "I fella", like: "excellent" },
    { id: "doomed", emoji: "☠️", label: "Dømt", like: "excellent" },
    { id: "blunder", emoji: "🤡", label: "Bommert", like: "omg" },
    { id: "flawless", emoji: "✨", label: "Feilfritt", like: "excellent" },
    { id: "lucky", emoji: "🍀", label: "Heldig", like: "wow" },
    { id: "unlucky", emoji: "⛈️", label: "Uheldig", like: "omg" },
    { id: "denied", emoji: "🛑", label: "Avvist", like: "excellent" },
    { id: "countered", emoji: "🛡️", label: "Kontret", like: "excellent" },
    { id: "waiting", emoji: "⏳", label: "Venter", like: "wow" },
    { id: "thinking", emoji: "💭", label: "Tenker", like: "wow" },
    { id: "observing", emoji: "👁️", label: "Observerer", like: "wow" },
    { id: "panicking", emoji: "😱", label: "Panikk", like: "omg" },
    { id: "brilliant", emoji: "💡", label: "Briljant", like: "gg" },
    { id: "bait", emoji: "🎣", label: "Agn", like: "excellent" },
    { id: "punished", emoji: "⚖️", label: "Straffet", like: "excellent" },
    { id: "inevitable", emoji: "💀", label: "Uunngåelig", like: "excellent" },
    { id: "greed", emoji: "💰", label: "Grådighet", like: "excellent" },
    { id: "patience", emoji: "🧘", label: "Tålmodighet", like: "wow" },
    { id: "overkill", emoji: "💥", label: "Overkill", like: "excellent" },
    { id: "misclick", emoji: "🖱️", label: "Feilklikk", like: "omg" }
];
const EMOTE_ALL = [...EMOTES, ...EMOTE_EXTRAS];
const EMOTE_LAST_UNLOCK_ROUND = 50;
const EMOTE_DEFAULT_LOADOUT = EMOTES.map(emote => emote.id);
// How the list is sorted in the settings, by mood. Every emote belongs to exactly one.
const EMOTE_GROUPS = [
    { title: "Vennlig", ids: ["hi", "gg", "ty", "goodgame"] },
    { title: "Imponert", ids: ["wow", "strike", "galaxy", "flawless", "lucky", "brilliant"] },
    { title: "Skryt", ids: ["excellent", "fatal", "dominance", "value", "lethal", "calculated", "doomed", "denied", "countered", "punished", "inevitable", "overkill"] },
    { title: "Erting", ids: ["foolish", "wasted", "badtrade", "questionable", "salt", "blunder", "greed"] },
    { title: "Lur", ids: ["ghost", "alien", "motives", "predicted", "trapped", "bait"] },
    { title: "Oppgitt", ids: ["omg", "defeat", "rage", "garbage", "mercy", "unlucky", "panicking", "misclick"] },
    { title: "Rolig", ids: ["waiting", "thinking", "observing", "patience"] }
];
const EMOTE_COOLDOWN_MS = 3000;
const EMOTE_MAX_AGE_MS = 5000;
const EMOTE_BOT_GAP_MS = 8000;
const EMOTE_TABLE_GAP_MS = 2000;
const EMOTE_TAUNT_GAP_MS = 20000;
const EMOTE_BOT_LIMIT_PER_TRICK = 3;
const EMOTE_CHANCE = {
    roundStart: .12,
    clearSelf: .15,
    clearOther: .08,
    highBeatsHuman: .15,
    highSelf: .08,
    highOther: .06,
    trickWon: .05,
    passOnce: .02,
    passTwice: .1,
    passMany: .2,
    passTaunt: .05,
    receivedGood: .15,
    gaveGood: .08,
    winnerPraise: .25,
    bomsSelf: .3,
    bomsTaunt: .1,
    results: .2
};
// A reply, then its chance when the emote was aimed at the bot and when it was sent to the whole table.
const EMOTE_REPLIES = {
    hi: ["hi", .6, .2],
    gg: ["ty", .4, .1],
    ty: ["gg", .15, .03],
    wow: ["excellent", .15, .03],
    omg: ["wow", .15, .03],
    excellent: ["omg", .3, .05]
};
const EMOTE_CHATTINESS = [.5, 1, 1.5];

function emoteById(id) { return EMOTE_ALL.find(emote => emote.id == id); }

// The default six are always available; the extras spread evenly from round 1 to the last unlock round.
function emoteUnlockRound(id) {
    var index = EMOTE_EXTRAS.findIndex(emote => emote.id == id);
    return index < 0 ? 0 : Math.round(1 + index * (EMOTE_LAST_UNLOCK_ROUND - 1) / (EMOTE_EXTRAS.length - 1));
}

function normalizeEmoteLoadout(value) {
    var ids = typeof value == "string" ? value.split(",") : value;
    return Array.isArray(ids) && ids.length == EMOTE_DEFAULT_LOADOUT.length && new Set(ids).size == ids.length && ids.every(emoteById)
        ? ids.slice() : EMOTE_DEFAULT_LOADOUT.slice();
}

// Puts an emote in a slot. If it already sits in another slot, the two trade places, so a loadout never holds one twice.
function placeEmoteInLoadout(loadout, slot, id) {
    var next = loadout.slice();
    var current = next.indexOf(id);
    if (current >= 0) { next[current] = next[slot]; }
    next[slot] = id;
    return next;
}

// Strength comes from the cards themselves, so it reads the same under every rule setup.
function emoteCardsAreHigh(cards) {
    var list = Array.isArray(cards) ? cards : Object.values(cards || {});
    return list.length >= 3 || list.some(card =>
        new PresidentCard(card.suit ?? card.farge, card.rank ?? card.verdi).strengthRank >= 14);
}

function createEmoteMemory() {
    return { status: null, shuffle: null, pauseId: null, placements: new Map(), receipts: new Set(), passes: new Map() };
}

// Turns the latest game state into the things that just happened. A state seen for the first time only sets the baseline.
function readEmoteEvents(memory, game, now = Date.now()) {
    var events = [];
    var firstView = memory.status == null;
    if (game.shuffleStartedAt && game.shuffleStartedAt != memory.shuffle) {
        memory.shuffle = game.shuffleStartedAt;
        memory.placements = new Map();
        memory.passes = new Map();
        memory.pauseId = null;
        if (now - Number(game.shuffleStartedAt) < 15000) { events.push({ type: "roundStart" }); }
    }
    var receipts = game.exchangeReceipts || [];
    receipts.forEach(receipt => {
        if (memory.receipts.has(receipt.id)) { return; }
        memory.receipts.add(receipt.id);
        if (!firstView) { events.push({ type: "exchange", recipient: receipt.recipient, sender: receipt.sender, high: emoteCardsAreHigh(receipt.cards) }); }
    });
    var pause = game.turnPause;
    if (pause && pause.id != memory.pauseId) {
        memory.pauseId = pause.id;
        if (!firstView) { events.push(...readPauseEvents(memory, game, pause)); }
    }
    game.players.forEach(player => {
        var before = memory.placements.get(player.name) || 0;
        memory.placements.set(player.name, player.placement);
        if (!firstView && before == 0 && player.placement > 0) {
            events.push({ type: "finish", actor: player.name, placement: player.placement, last: player.placement == game.players.length });
        }
    });
    if (!firstView && memory.status != "F" && game.status == "F") { events.push({ type: "gameOver" }); }
    memory.status = game.status;
    return events;
}

function readPauseEvents(memory, game, pause) {
    var countPass = (actor, leader) => {
        if (actor == null) { return []; }
        var streak = (memory.passes.get(actor) || 0) + 1;
        memory.passes.set(actor, streak);
        return [{ type: "pass", actor: actor, streak: streak, leader: leader != actor ? leader : null }];
    };
    if (pause.kind == "pass") { return countPass(pause.passedBy, game.piles[game.piles.length - 1]?.name || null); }
    var cleared = pause.clearedPiles || [];
    var clearedBy = cleared[cleared.length - 1]?.nick || null;
    if (pause.kind == "clear" && !pause.playedPile) {
        return [...countPass(pause.passedBy, clearedBy), { type: "trickWon", actor: clearedBy }];
    }
    if (!pause.playedPile) { return []; }
    var actor = pause.playedPile.name;
    memory.passes.set(actor, 0);
    var beaten = pause.kind == "clear" ? cleared[cleared.length - 2]?.nick : game.piles[game.piles.length - 2]?.name;
    return [{
        type: pause.kind == "clear" ? "clear" : "play", actor: actor, beaten: beaten != actor ? beaten || null : null,
        high: emoteCardsAreHigh(pause.playedPile.cards)
    }];
}

// What the bots would like to say about an event. `table` answers isBot(name), others(name) and roll(name, chance).
// Unless `together` is set, only the first entry is meant to be said.
function planBotEmotes(event, table) {
    var one = (speaker, emote, to = null) => [{ speaker, emote, to }];
    var other = name => { var list = table.others(name); return list[Math.floor(table.random() * list.length)]; };
    var bot = name => name != null && table.isBot(name);
    var witness;
    switch (event.type) {
        case "roundStart":
            return table.others(null).filter(name => table.roll(name, EMOTE_CHANCE.roundStart))
                .map(name => ({ speaker: name, emote: "hi", to: null, together: true }));
        case "clear":
            if (bot(event.actor) && table.roll(event.actor, EMOTE_CHANCE.clearSelf)) { return one(event.actor, "excellent", event.beaten); }
            witness = other(event.actor);
            return witness && table.roll(witness, EMOTE_CHANCE.clearOther) ? one(witness, "wow", event.actor) : [];
        case "play":
            if (!event.high) { return []; }
            if (bot(event.actor) && event.beaten && !bot(event.beaten) && table.roll(event.actor, EMOTE_CHANCE.highBeatsHuman)) {
                return one(event.actor, "excellent", event.beaten);
            }
            if (bot(event.actor) && table.roll(event.actor, EMOTE_CHANCE.highSelf)) {
                return one(event.actor, "excellent", table.random() < .5 ? event.beaten : null);
            }
            witness = other(event.actor);
            return witness && table.roll(witness, EMOTE_CHANCE.highOther) ? one(witness, "wow", event.actor) : [];
        case "pass":
            if (bot(event.actor)) {
                var chance = event.streak >= 3 ? EMOTE_CHANCE.passMany : event.streak == 2 ? EMOTE_CHANCE.passTwice : EMOTE_CHANCE.passOnce;
                if (table.roll(event.actor, chance)) {
                    return one(event.actor, event.streak >= 3 && table.random() < .5 ? "wow" : "omg", event.streak >= 2 ? event.leader : null);
                }
            }
            return event.streak >= 3 && bot(event.leader) && table.roll(event.leader, EMOTE_CHANCE.passTaunt)
                ? one(event.leader, "excellent", event.actor) : [];
        case "trickWon":
            return bot(event.actor) && table.roll(event.actor, EMOTE_CHANCE.trickWon) ? one(event.actor, "excellent") : [];
        case "exchange":
            if (!event.high) { return []; }
            if (bot(event.recipient) && table.roll(event.recipient, EMOTE_CHANCE.receivedGood)) { return one(event.recipient, "ty", event.sender); }
            return bot(event.sender) && table.roll(event.sender, EMOTE_CHANCE.gaveGood) ? one(event.sender, "omg", event.recipient) : [];
        case "finish":
            if (event.placement == 1) {
                witness = other(event.actor);
                return witness && table.roll(witness, EMOTE_CHANCE.winnerPraise) ? one(witness, "gg", event.actor) : [];
            }
            if (!event.last) { return []; }
            if (bot(event.actor) && table.roll(event.actor, EMOTE_CHANCE.bomsSelf)) { return one(event.actor, "omg"); }
            var winner = table.winner();
            return bot(winner) && winner != event.actor && table.roll(winner, EMOTE_CHANCE.bomsTaunt) ? one(winner, "excellent", event.actor) : [];
        case "gameOver":
            var champion = table.winner();
            return champion == null ? [] : table.others(champion).filter(name => table.roll(name, EMOTE_CHANCE.results))
                .map(name => ({ speaker: name, emote: "gg", to: champion, together: true }));
    }
    return [];
}

// An emote aimed at a bot is answered by that bot, and one sent to the table by a random bot.
function planBotReply(speaker, emoteId, to, table) {
    var reply = EMOTE_REPLIES[emoteId] || EMOTE_REPLIES[emoteById(emoteId)?.like];
    if (!reply) { return null; }
    var replier = to;
    if (to != null && !table.isBot(to)) { return null; }
    if (to == null) {
        var list = table.others(speaker);
        replier = list[Math.floor(table.random() * list.length)];
    }
    if (replier == null || !table.roll(replier, to != null ? reply[1] : reply[2])) { return null; }
    return { speaker: replier, emote: reply[0], to: speaker };
}

// The allowance of bot emotes for one trick; the card exchange and the results screen each count as one.
function emoteTrickKey(game, event) {
    if (game.status != "S") { return `${game.status}:${game.shuffleStartedAt}`; }
    var cleared = event && (event.type == "clear" || event.type == "trickWon" || (event.type == "pass" && game.turnPause?.kind == "clear"));
    return `S:${game.shuffleStartedAt}:${Number(game.round) - (cleared ? 1 : 0)}`;
}

class GameEmotes {
    static game = null;
    static me = null;
    static layer = null;
    static announcer = null;
    static menu = null;
    static memory = createEmoteMemory();
    static coolingUntil = 0;
    static gameId = null;
    static ref = null;
    static listener = null;
    static lastSeen = new Map();
    static disconnectArmed = new Set();
    static muted = new Map();
    static botNext = new Map();
    static botSpoke = new Map();
    static tableNext = 0;
    static tauntNext = new Map();
    static chattiness = new Map();
    static replySeats = new Set();
    static trick = { key: null, used: 0 };

    // Called after each render with the state the renderer received.
    static update(game, me) {
        this.game = game;
        this.me = me || null;
        var active = game != null && ["S", "G", "F"].includes(game.status);
        this.install();
        this.connect(active ? game.id : null);
        this.syncButton(active);
        if (!active) {
            this.closeMenu();
            return;
        }
        if (game.status != "F" && document.getElementById("dialogEmotes").classList.contains("dialog-container--visible")) { showDialog("Emotes", false); }
        this.syncMutes();
        var events = readEmoteEvents(this.memory, game, GamePresence.now());
        if (game.fastForward !== true && GamePresence.canDrive(game)) {
            events.forEach(event => this.botsReact(event));
        }
    }

    static install() {
        if (this.layer != null) { return; }
        this.layer = document.createElement("div");
        this.layer.id = "emoteLayer";
        document.body.appendChild(this.layer);
        this.announcer = document.createElement("div");
        this.announcer.className = "visually-hidden";
        this.announcer.setAttribute("role", "status");
        this.announcer.setAttribute("aria-live", "polite");
        this.announcer.setAttribute("data-i18n-skip", "");
        document.body.appendChild(this.announcer);
        document.getElementById("emoteButton").addEventListener("click", event => {
            event.stopPropagation();
            if (this.menu) { this.closeMenu(); } else { this.openTray(event.detail == 0); }
        });
        document.addEventListener("pointerdown", event => {
            if (!this.menu || event.target.closest?.(".emote-panel, #emoteButton")) { return; }
            if (this.menu.dataset.seat && this.menu.dataset.seat == this.seatNameAt(event.target)) { return; }
            this.closeMenu();
        }, true);
        document.addEventListener("keydown", event => {
            if (!this.menu) { return; }
            if (event.key == "Escape") {
                event.stopImmediatePropagation();
                this.closeMenu();
                document.getElementById("emoteButton").focus();
            } else if (/^[1-6]$/.test(event.key)) {
                var chip = this.menu.querySelector(`[data-emote="${EmoteSettings.loadout()[Number(event.key) - 1]}"]`);
                if (chip) {
                    event.stopImmediatePropagation();
                    chip.click();
                }
            }
        }, true);
        // Other players' boxes open their panel. This also takes the tap that would expand the name, which the panel shows in full.
        var shell = document.getElementById("gameShell");
        shell.addEventListener("click", event => {
            if (!event.target.closest("button, a") && this.openSeatPanel(event.target)) { event.stopPropagation(); }
        }, true);
        shell.addEventListener("keydown", event => {
            if ((event.key == "Enter" || event.key == " ") && this.openSeatPanel(event.target)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
        window.addEventListener("resize", () => this.syncButton(this.game != null && ["S", "G", "F"].includes(this.game.status)));
    }

    static player(name) { return this.game?.players.find(player => player.name == name) || null; }
    static reducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    static msg(text) { return window.I18n ? window.I18n.msg(text) : text; }
    static canSend() {
        var { game, me } = this;
        return game != null && me != null && ["S", "G", "F"].includes(game.status) &&
            game.connectionOnline !== false && !GamePresence.isBot(game, me);
    }

    // Seats, and the standings rows that stand in for them on the results screen where seats are hidden.
    static seatElement(name) {
        return document.querySelector(`#playerList [data-player-name="${CSS.escape(name)}"]`);
    }
    static standingRow(name) {
        return Array.from(document.querySelectorAll(".game-over__standing"))
            .find(row => row.querySelector(".game-over__name > span")?.textContent == name) || null;
    }
    static seatOf(name) {
        var seat = this.seatElement(name);
        return seat && seat.getClientRects().length > 0 ? seat : this.standingRow(name);
    }
    static seatNameAt(target) {
        var element = target.closest?.("#playerList [data-player-name], .game-over__standing");
        if (!element) { return null; }
        return element.dataset.playerName || element.querySelector(".game-over__name > span")?.textContent || null;
    }
    static openSeatPanel(target) {
        var game = this.game;
        if (game == null || !["S", "G", "F"].includes(game.status)) { return false; }
        var name = this.seatNameAt(target);
        if (name == null || name == this.me?.name || this.player(name) == null) { return false; }
        if (this.menu?.dataset.seat == name) { this.closeMenu(); } else { this.openStrip(name); }
        return true;
    }

    // Transport: one overwritten slot per seat, so storage stays bounded.
    static connect(gameId) {
        if (gameId == this.gameId) { return; }
        if (this.ref) { this.ref.off("value", this.listener); }
        this.ref = null;
        this.gameId = gameId;
        this.lastSeen = new Map();
        this.disconnectArmed = new Set();
        this.memory = createEmoteMemory();
        this.chattiness = new Map();
        this.trick = { key: null, used: 0 };
        this.loadMutes();
        if (gameId == null) { return; }
        EmoteSettings.sync();
        this.ref = firebase.database().ref(`${EMOTE_PATH}/${gameId}`);
        // Emotes are extras: losing access to them must never disturb the game.
        this.listener = this.ref.on("value", snapshot => this.receive(snapshot.val() || {}),
            error => console.warn("Kunne ikke lese emotes.", error));
    }
    static receive(slots) {
        var game = this.game;
        if (game == null) { return; }
        game.players.forEach(player => {
            var seat = GamePresence.playerId(player);
            var slot = slots[seat];
            if (!slot || !(slot.t > (this.lastSeen.get(seat) || 0))) { return; }
            this.lastSeen.set(seat, slot.t);
            var isReply = this.replySeats.delete(seat);
            if (player === this.me || player.name == this.me?.name) { return; }
            if (GamePresence.now() - slot.t > EMOTE_MAX_AGE_MS) { return; }
            var target = game.players.find(candidate => GamePresence.playerId(candidate) == slot.to) || null;
            this.deliver(player.name, slot.e, target?.name || null);
            if (!isReply && GamePresence.canDrive(game)) { this.answer(player.name, slot.e, target?.name || null); }
        });
    }
    static write(player, id, targetName) {
        var seat = GamePresence.playerId(player);
        var slot = firebase.database().ref(`${EMOTE_PATH}/${this.gameId}/${seat}`);
        var target = targetName ? this.player(targetName) : null;
        var record = { e: id, t: firebase.database.ServerValue.TIMESTAMP };
        if (target) { record.to = GamePresence.playerId(target); }
        if (!this.disconnectArmed.has(seat)) {
            this.disconnectArmed.add(seat);
            slot.onDisconnect().remove().catch(() => {});
        }
        slot.set(record).catch(error => console.warn("Kunne ikke sende emote.", error));
    }

    // Sending shows at once; the write follows in the background.
    static send(id, targetName = null) {
        if (!this.canSend() || Date.now() < this.coolingUntil) { return false; }
        this.coolingUntil = Date.now() + EMOTE_COOLDOWN_MS;
        this.setCooling(true);
        setTimeout(() => this.setCooling(false), EMOTE_COOLDOWN_MS);
        this.deliver(this.me.name, id, targetName);
        this.write(this.me, id, targetName);
        this.closeMenu();
        if (GamePresence.canDrive(this.game)) { this.answer(this.me.name, id, targetName); }
        return true;
    }
    static setCooling(cooling) {
        document.getElementById("emoteButton").classList.toggle("is-cooling", cooling);
        this.layer.classList.toggle("is-cooling", cooling);
    }

    // Only the client that runs the bots decides for them, and everyone sees the same result.
    static botTable() {
        var game = this.game;
        var bots = game.players.filter(player => player.playerKey == "PC").map(player => player.name);
        return {
            isBot: name => bots.includes(name),
            others: name => bots.filter(bot => bot != name),
            winner: () => game.players.find(player => player.placement == 1)?.name || null,
            random: Math.random,
            roll: (name, chance) => Math.random() < chance * this.chattinessOf(name)
        };
    }
    static chattinessOf(name) {
        if (!this.chattiness.has(name)) {
            this.chattiness.set(name, EMOTE_CHATTINESS[Math.floor(Math.random() * EMOTE_CHATTINESS.length)]);
        }
        return this.chattiness.get(name);
    }
    static takeFromAllowance(key) {
        if (this.trick.key != key) { this.trick = { key: key, used: 0 }; }
        if (this.trick.used >= EMOTE_BOT_LIMIT_PER_TRICK) { return false; }
        this.trick.used++;
        return true;
    }
    static botsReact(event) {
        var plan = planBotEmotes(event, this.botTable());
        if (plan.length == 0) { return; }
        var key = emoteTrickKey(this.game, event);
        var settle = event.type == "roundStart"
            ? Math.max(0, Number(this.game.shuffleStartedAt) + SHUFFLE_DURATION_MS - GamePresence.now()) : 0;
        if (plan[0].together) {
            plan.forEach((entry, index) => this.botSpeak(entry, key, settle + 500 + index * (EMOTE_TABLE_GAP_MS + 200), true));
        } else {
            this.botSpeak(plan[0], key, settle + 500 + Math.random() * 1000);
        }
    }
    static othersAreWatching() {
        return this.game.players.some(player => player.playerKey != "PC" && player.name != this.me?.name) ||
            Object.keys(this.game.waitingSpectators || {}).length > 0;
    }
    static botSpeak(entry, key, delay, together = false, isReply = false) {
        var now = Date.now();
        var { speaker, emote, to } = entry;
        // Muting only hides things on this device. Nothing is written only when no other person is here to see it.
        if (this.isMuted(speaker) && !this.othersAreWatching()) { return; }
        if (!isReply && !together && (now < this.tableNext || now < (this.botNext.get(speaker) || 0))) { return; }
        if (now + delay < (this.botSpoke.get(speaker) || 0) + EMOTE_COOLDOWN_MS) { return; }
        var taunt = to != null && (emote == "excellent" || emote == "omg");
        if (taunt && now < (this.tauntNext.get(to) || 0)) { return; }
        if (!this.takeFromAllowance(key)) { return; }
        if (taunt) { this.tauntNext.set(to, now + EMOTE_TAUNT_GAP_MS); }
        this.botNext.set(speaker, now + EMOTE_BOT_GAP_MS);
        this.botSpoke.set(speaker, now + delay);
        this.tableNext = now + EMOTE_TABLE_GAP_MS;
        var game = this.game;
        setTimeout(() => {
            var player = this.game === game || this.game?.id == game.id ? this.player(speaker) : null;
            if (!player || this.game.fastForward === true) { return; }
            if (isReply) { this.replySeats.add(GamePresence.playerId(player)); }
            this.write(player, emote, to);
        }, delay);
    }
    static answer(speaker, id, to) {
        var reply = planBotReply(speaker, id, to, this.botTable());
        if (reply) { this.botSpeak(reply, emoteTrickKey(this.game), 700 + Math.random() * 800, false, true); }
    }

    // A choice made on a seat lasts for the game and survives a reload. Without one, the settings decide for bots.
    static muteKey() { return `boms_emote_mutes_${this.gameId}`; }
    static loadMutes() {
        this.muted = new Map();
        if (this.gameId == null) { return; }
        try { this.muted = new Map(JSON.parse(sessionStorage.getItem(this.muteKey())) || []); } catch (error) { }
    }
    static toggleMute(name) {
        this.muted.set(GamePresence.playerId(this.player(name)), !this.isMuted(name));
        try { sessionStorage.setItem(this.muteKey(), JSON.stringify([...this.muted])); } catch (error) { }
        this.syncMutes();
    }
    static botEmotesOn() { return getCookie("BotEmotes") == "true"; }
    // Bot emotes are turned on in the settings only. With them on, a single bot can still be muted.
    static isMuted(name) {
        var player = this.player(name);
        if (player == null) { return false; }
        if (player.playerKey == "PC" && !this.botEmotesOn()) { return true; }
        return this.muted.get(GamePresence.playerId(player)) === true;
    }
    static syncMutes() {
        if (this.game == null) { return; }
        this.game.players.forEach(player => {
            var seat = this.seatElement(player.name);
            if (seat) { seat.toggleAttribute("data-emote-muted", this.muted.get(GamePresence.playerId(player)) === true && this.isMuted(player.name)); }
        });
    }

    // Output. A muted speaker is not shown. The flying emoji alone shows who an emote is aimed at.
    static deliver(name, id, targetName) {
        var emote = emoteById(id);
        if (!emote || this.isMuted(name)) { return; }
        this.showBubble(name, emote);
        if (targetName) { this.throwEmoji(name, targetName, emote); }
    }
    static showBubble(name, emote) {
        var seat = this.seatOf(name);
        if (!seat) { return; }
        var layer = this.layer;
        layer.querySelectorAll(".emote-bubble").forEach(other => {
            if (other.dataset.speaker == name) { other.remove(); }
        });
        var bubble = document.createElement("div");
        bubble.className = "emote-bubble";
        bubble.dataset.speaker = name;
        var color = this.seatElement(name)?.style.getPropertyValue("--player-color");
        if (color) { bubble.style.setProperty("--player-color", color); }
        var symbol = document.createElement("span");
        symbol.className = "emote-bubble__emoji";
        symbol.textContent = emote.emoji;
        var text = document.createElement("span");
        text.textContent = emote.label;
        bubble.append(symbol, text);
        layer.appendChild(bubble);
        var seatBounds = seat.getBoundingClientRect();
        var width = bubble.offsetWidth, height = bubble.offsetHeight;
        // In the standings the tail points at the name column, and the bubble overlaps the row so it stays attached.
        var inStandings = seat.classList.contains("game-over__standing");
        var center = seatBounds.left + seatBounds.width * (inStandings ? .72 : .5);
        var x = Math.max(width / 2 + 6, Math.min(window.innerWidth - width / 2 - 6, center));
        // Bubbles from neighbouring seats drop below one another instead of overlapping.
        var y = seatBounds.bottom + (inStandings ? -4 : 9);
        var others = Array.from(layer.querySelectorAll(".emote-bubble")).filter(other => other !== bubble)
            .map(other => other.getBoundingClientRect());
        for (var guard = 0; guard < 4; guard++) {
            var hit = others.find(other => other.left < x + width / 2 + 4 && other.right > x - width / 2 - 4 &&
                other.top < y + height + 4 && other.bottom > y - 4);
            if (!hit) { break; }
            y = hit.bottom + 6;
        }
        bubble.style.left = `${x}px`;
        bubble.style.top = `${y}px`;
        bubble.style.setProperty("--tail-x", `${Math.max(-width / 2 + 16, Math.min(width / 2 - 16, center - x))}px`);
        bubble.addEventListener("animationend", event => {
            if (event.target === bubble) { bubble.remove(); }
        });
        this.announcer.textContent = `${name}: ${this.msg(emote.label)}`;
    }
    static throwEmoji(fromName, targetName, emote) {
        var from = this.seatOf(fromName), to = this.seatOf(targetName);
        if (!from || !to) { return; }
        var start = from.getBoundingClientRect(), end = to.getBoundingClientRect();
        var startX = start.left + start.width / 2, startY = start.top + start.height / 2;
        var dx = end.left + end.width / 2 - startX, dy = end.top + end.height / 2 - startY;
        var token = document.createElement("div");
        token.className = "emote-throw";
        token.textContent = emote.emoji;
        var still = this.reducedMotion();
        token.style.left = `${still ? startX + dx : startX}px`;
        token.style.top = `${still ? startY + dy : startY}px`;
        this.layer.appendChild(token);
        // Without motion, the emoji simply appears on the target.
        if (still) {
            token.animate([{ opacity: 1 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 1200, fill: "forwards" }).finished
                .then(() => token.remove()).catch(() => token.remove());
            return;
        }
        var dip = Math.max(70, Math.abs(dx) * .28);
        var flight = token.animate([
            { translate: "0 0", scale: ".6", rotate: "0deg" },
            { translate: `${dx / 2}px ${dy / 2 + dip}px`, scale: "1.7", rotate: `${dx >= 0 ? 200 : -200}deg`, offset: .5 },
            { translate: `${dx}px ${dy}px`, scale: "1.1", rotate: `${dx >= 0 ? 380 : -380}deg` }
        ], { duration: 620, easing: "cubic-bezier(.35,.1,.45,1)", fill: "forwards" });
        flight.finished.then(() => token.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 300, fill: "forwards" }).finished)
            .then(() => token.remove()).catch(() => token.remove());
    }

    // Menus.
    static syncButton(active) {
        var button = document.getElementById("emoteButton");
        if (!button) { return; }
        button.hidden = !active || !this.canSend();
        if (button.hidden && this.menu && !this.menu.dataset.seat) { this.closeMenu(); }
        // The results screen hides the action row, so there the button floats at the table's lower corner.
        var floating = active && this.game.status == "F";
        button.classList.toggle("is-floating", floating);
        if (floating) {
            if (button.parentElement !== this.layer) { this.layer.appendChild(button); }
            var table = document.getElementById("gameTable").getBoundingClientRect();
            button.style.left = `${Math.max(6, table.right - button.offsetWidth - 10)}px`;
            button.style.top = `${table.bottom - button.offsetHeight - 8}px`;
        } else if (button.parentElement !== document.getElementById("playbackControls")) {
            document.getElementById("playbackControls").appendChild(button);
            button.style.left = button.style.top = "";
        }
    }
    static chipGrid(targetName) {
        var grid = document.createElement("div");
        grid.className = "emote-grid";
        EmoteSettings.loadout().map(emoteById).forEach(emote => {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "emote-chip";
            chip.dataset.emote = emote.id;
            var symbol = document.createElement("span");
            symbol.className = "emote-chip__emoji";
            symbol.setAttribute("aria-hidden", "true");
            symbol.textContent = emote.emoji;
            var text = document.createElement("span");
            text.textContent = emote.label;
            chip.append(symbol, text);
            chip.addEventListener("click", event => {
                event.stopPropagation();
                this.send(emote.id, targetName);
            });
            grid.appendChild(chip);
        });
        return grid;
    }
    static openMenu(element, focusFirst) {
        this.closeMenu();
        this.layer.appendChild(element);
        this.menu = element;
        if (focusFirst) { element.querySelector("button")?.focus(); }
    }
    static closeMenu() {
        if (!this.menu) { return; }
        this.menu.remove();
        this.menu = null;
        document.getElementById("emoteButton").setAttribute("aria-expanded", "false");
    }
    static openTray(focusFirst) {
        if (!this.canSend()) { return; }
        var button = document.getElementById("emoteButton");
        var bounds = button.getBoundingClientRect();
        var tray = document.createElement("div");
        tray.className = "emote-panel emote-tray";
        tray.setAttribute("role", "group");
        tray.setAttribute("aria-label", "Emote");
        tray.appendChild(this.chipGrid(null));
        this.openMenu(tray, focusFirst);
        button.setAttribute("aria-expanded", "true");
        var width = tray.offsetWidth;
        tray.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width))}px`;
        tray.style.top = `${Math.max(8, bounds.top - tray.offsetHeight - 6)}px`;
    }
    static openStrip(name) {
        var seat = this.seatOf(name);
        if (!seat) { return; }
        var canMute = this.player(name).playerKey != "PC" || this.botEmotesOn();
        if (!canMute && !this.canSend()) { return; }
        var strip = document.createElement("div");
        strip.className = "emote-panel emote-strip";
        strip.setAttribute("role", "group");
        strip.dataset.seat = name;
        var head = document.createElement("div");
        head.className = "emote-strip__head";
        var title = document.createElement("span");
        title.className = "emote-strip__title";
        title.textContent = `Til ${name}`;
        var muted = this.isMuted(name);
        var mute = document.createElement("button");
        mute.type = "button";
        mute.className = "emote-strip__mute";
        mute.setAttribute("aria-pressed", String(muted));
        mute.textContent = muted ? "Opphev demping" : "Demp";
        mute.addEventListener("click", event => {
            event.stopPropagation();
            this.toggleMute(name);
            this.closeMenu();
        });
        head.appendChild(title);
        if (canMute) { head.appendChild(mute); }
        strip.appendChild(head);
        if (this.canSend()) { strip.appendChild(this.chipGrid(name)); }
        this.openMenu(strip);
        var bounds = seat.getBoundingClientRect();
        var width = strip.offsetWidth;
        strip.style.left = `${Math.max(6, Math.min(window.innerWidth - width - 6, bounds.left + bounds.width / 2 - width / 2))}px`;
        strip.style.top = `${bounds.bottom + 8}px`;
    }
}

// The player's own six emotes: chosen in the settings, kept on the device and on the player ID for other devices.
// They have their own database path, so a problem here can never touch saving the card appearance.
class EmoteSettings {
    static rounds = 0;
    static needsOwnName = false;
    static view = { arranging: false, emote: null, slot: null, placed: null };

    static loadout() { return normalizeEmoteLoadout(getCookie("EmoteLoadout")); }
    static updatedAt() { return Number(getCookie("EmoteLoadoutUpdatedAt")) || 0; }
    static store(loadout, updatedAt) {
        setCookie("EmoteLoadout", loadout.join(","), 1000);
        setCookie("EmoteLoadoutUpdatedAt", updatedAt, 1000);
        this.updateSummary();
    }
    static save(loadout) {
        this.store(loadout, Math.max(GamePresence.now(), this.updatedAt() + 1));
        this.upload();
    }
    static remoteRef() {
        var key = getPlayerKey();
        return key && key != "PC" ? firebase.database().ref(`playerEmotes/${key}`) : null;
    }
    static upload() {
        this.remoteRef()?.set({ set: this.loadout().join(","), updatedAt: this.updatedAt() })
            .catch(error => console.warn("Kunne ikke lagre emotes på spiller-IDen.", error));
    }
    // The most recent choice wins, whichever device made it.
    static sync() {
        var ref = this.remoteRef();
        if (!ref) { return; }
        ref.once("value").then(snapshot => {
            var remote = snapshot.val();
            var remoteAt = Number(remote?.updatedAt) || 0;
            if (remote && remoteAt > this.updatedAt()) {
                this.store(normalizeEmoteLoadout(remote.set), remoteAt);
                this.render();
            } else if (this.updatedAt() > remoteAt) {
                this.upload();
            }
        }).catch(error => console.warn("Kunne ikke hente emotes for spiller-IDen.", error));
    }
    static updateSummary() {
        var summary = document.getElementById("emoteSettingsSummary");
        if (summary) { summary.textContent = this.loadout().map(id => emoteById(id).emoji).join(" "); }
    }

    static open() {
        this.view = { arranging: false, emote: null, slot: null, placed: null };
        this.sync();
        this.render();
    }
    static setRounds(rounds, needsOwnName) {
        this.rounds = rounds;
        this.needsOwnName = needsOwnName;
        this.render();
    }
    static isUnlocked(id) { return this.rounds >= emoteUnlockRound(id); }
    static choose(details) {
        Object.assign(this.view, details);
        this.render();
    }
    static place(slot, id) {
        this.save(placeEmoteInLoadout(this.loadout(), slot, id));
        this.choose({ emote: null, slot: null, placed: slot });
    }
    // An emote and a box make a pair, and either can be picked first. Picking the same one again cancels it.
    static pickEmote(id) {
        if (this.view.slot != null) { this.place(this.view.slot, id); }
        else { this.choose({ emote: this.view.emote == id ? null : id, arranging: false }); }
    }
    static pickSlot(slot) {
        if (this.view.emote != null) { this.place(slot, this.view.emote); }
        else { this.choose({ slot: this.view.slot == slot ? null : slot }); }
    }
    static render() {
        var body = document.getElementById("emoteSettingsBody");
        if (!body) { return; }
        // Everything is redrawn, so the scroll position and keyboard focus are carried across.
        var dialog = body.closest(".dialog-window");
        var scroll = dialog.scrollTop;
        var focused = body.contains(document.activeElement) ? document.activeElement : null;
        var refocus = focused == null ? null : focused.id ? `#${focused.id}`
            : focused.dataset.emoteOption ? `[data-emote-option="${focused.dataset.emoteOption}"]`
            : focused.dataset.slot != null ? `.emote-slot[data-slot="${focused.dataset.slot}"]` : null;
        body.replaceChildren(this.topPanel(), this.botToggle(), this.progress(),
            ...EMOTE_GROUPS.map(group => this.emoteGroup(group)));
        this.view.placed = null;
        dialog.scrollTop = scroll;
        if (refocus) { body.querySelector(refocus)?.focus(); }
    }
    // Stays in view while the list scrolls, so a chosen emote always has its boxes on screen.
    static topPanel() {
        var view = this.view;
        var panel = document.createElement("div");
        panel.className = "emote-settings__top";
        var head = document.createElement("div");
        head.className = "emote-settings__head";
        var title = document.createElement("strong");
        title.textContent = "Dine emotes";
        var rearrange = document.createElement("button");
        rearrange.type = "button";
        rearrange.id = "emoteRearrangeButton";
        rearrange.className = "emote-settings__rearrange";
        rearrange.setAttribute("aria-pressed", String(view.arranging));
        rearrange.textContent = view.arranging ? "Ferdig" : "Bytt rekkefølge";
        rearrange.addEventListener("click", () => this.choose({ arranging: !view.arranging, emote: null, slot: null }));
        head.append(title, rearrange);
        var hint = document.createElement("p");
        hint.className = "emote-settings__hint";
        hint.setAttribute("role", "status");
        hint.textContent = view.emote != null ? "Trykk på boksen du vil bytte ut."
            : view.slot != null ? "Velg en emote fra listen til denne boksen."
            : view.arranging ? "Dra en boks for å bytte plass."
            : "Trykk på en emote i listen for å ta den i bruk.";
        panel.append(head, this.slotGrid(), hint);
        return panel;
    }
    static botToggle() {
        var enabled = GameEmotes.botEmotesOn();
        var button = document.createElement("button");
        button.type = "button";
        button.id = "botEmotesToggleButton";
        button.className = "setting-row";
        button.setAttribute("aria-pressed", String(enabled));
        var text = document.createElement("span");
        text.className = "setting-row__text";
        var title = document.createElement("strong");
        title.textContent = "Bot-emotes";
        var detail = document.createElement("small");
        detail.textContent = "Vis emotes fra boter.";
        text.append(title, detail);
        var toggle = document.createElement("span");
        toggle.className = "setting-row__switch";
        toggle.setAttribute("aria-hidden", "true");
        toggle.appendChild(document.createElement("span"));
        button.append(text, toggle);
        button.addEventListener("click", () => {
            setCookie("BotEmotes", !enabled, 1000);
            GameEmotes.syncMutes();
            this.render();
        });
        return button;
    }
    static progress() {
        var line = document.createElement("p");
        line.className = "emote-settings__hint emote-settings__progress";
        var unlocked = EMOTE_ALL.filter(emote => this.isUnlocked(emote.id)).length;
        [`Runder spilt: ${this.rounds}`, `Låst opp: ${unlocked} av ${EMOTE_ALL.length}`,
            ...(this.needsOwnName ? ["Velg et eget spillernavn for at rundene dine skal telle."] : [])].forEach(message => {
            var part = document.createElement("span");
            part.textContent = message;
            line.appendChild(part);
        });
        return line;
    }
    static face(emote) {
        var fragment = document.createDocumentFragment();
        var symbol = document.createElement("span");
        symbol.className = "emote-settings__emoji";
        symbol.setAttribute("aria-hidden", "true");
        symbol.textContent = emote.emoji;
        var label = document.createElement("span");
        label.className = "emote-settings__label";
        label.textContent = emote.label;
        fragment.append(symbol, label);
        return fragment;
    }
    static emoteGroup(group) {
        var section = document.createDocumentFragment();
        var title = document.createElement("h3");
        title.className = "settings-category";
        title.textContent = group.title;
        var list = document.createElement("div");
        list.className = "emote-settings__list";
        var loadout = this.loadout();
        EMOTE_ALL.filter(emote => group.ids.includes(emote.id)).forEach(emote => {
            var unlocked = this.isUnlocked(emote.id);
            var button = document.createElement("button");
            button.type = "button";
            button.className = "emote-option";
            button.classList.toggle("is-selected", this.view.emote == emote.id);
            button.setAttribute("aria-pressed", String(this.view.emote == emote.id));
            button.dataset.emoteOption = emote.id;
            button.disabled = !unlocked;
            button.append(this.face(emote));
            var status = document.createElement("small");
            var round = emoteUnlockRound(emote.id);
            status.textContent = !unlocked ? (round == 1 ? "Låses opp etter 1 runde" : `Låses opp etter ${round} runder`)
                : loadout.includes(emote.id) ? "I bruk" : "";
            button.append(status);
            button.addEventListener("click", () => this.pickEmote(emote.id));
            list.appendChild(button);
        });
        section.append(title, list);
        return section;
    }
    // Two rows of three, as in the game. In rearrange mode a press that moves drags the emote onto another box.
    static slotGrid() {
        var view = this.view;
        var grid = document.createElement("div");
        grid.className = "emote-settings__grid";
        grid.classList.toggle("is-arranging", view.arranging);
        this.loadout().forEach((id, slot) => {
            var box = document.createElement("button");
            box.type = "button";
            box.className = "emote-slot";
            box.classList.toggle("is-choosing", view.emote != null);
            box.classList.toggle("is-selected", view.slot == slot);
            box.classList.toggle("is-placed", view.placed == slot);
            box.dataset.slot = slot;
            box.append(this.face(emoteById(id)));
            box.addEventListener("click", () => this.pickSlot(slot));
            box.addEventListener("pointerdown", event => this.trackDrag(box, event));
            grid.appendChild(box);
        });
        return grid;
    }
    static trackDrag(box, start) {
        if (start.button != 0 || !this.view.arranging) { return; }
        var dragging = false, target = null;
        var cleanup = () => {
            box.removeEventListener("pointermove", move);
            box.removeEventListener("pointerup", up);
            box.removeEventListener("pointercancel", cancel);
        };
        var mark = next => {
            target?.classList.remove("is-target");
            target = next;
            target?.classList.add("is-target");
        };
        var move = event => {
            var x = event.clientX - start.clientX, y = event.clientY - start.clientY;
            if (!dragging && Math.hypot(x, y) < 6) { return; }
            if (!dragging) {
                dragging = true;
                box.setPointerCapture(start.pointerId);
                box.classList.add("is-dragging");
            }
            box.style.transform = `translate(${x}px, ${y}px) scale(1.06)`;
            mark(document.elementsFromPoint(event.clientX, event.clientY)
                .find(element => element !== box && element.classList.contains("emote-slot")) || null);
        };
        var up = () => {
            cleanup();
            if (!dragging) { return; }
            // The release after a drag must not also count as a click on a box.
            var swallow = click => {
                click.preventDefault();
                click.stopPropagation();
            };
            document.addEventListener("click", swallow, { capture: true, once: true });
            setTimeout(() => document.removeEventListener("click", swallow, true), 0);
            var loadout = this.loadout();
            if (target) { this.save(placeEmoteInLoadout(loadout, Number(target.dataset.slot), loadout[Number(box.dataset.slot)])); }
            this.render();
        };
        var cancel = () => {
            cleanup();
            if (dragging) { this.render(); }
        };
        box.addEventListener("pointermove", move);
        box.addEventListener("pointerup", up);
        box.addEventListener("pointercancel", cancel);
    }
}
