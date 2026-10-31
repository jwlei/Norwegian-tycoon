// Page-side fixture. Builds a real PresidentGame and drives the same GameLayout entry points the connection layer
// uses, so every benchmark exercises production rendering code against the production DOM and CSS.
"use strict";
(function () {
    const SEATS = ["Perf", "Bomsen", "Onkel Pass", "Knurt"];
    const state = { game: null, me: null, foil: "rainbow", style: "normal" };

    function refresh() {
        GameLayout.updateSharedView(state.game, state.me);
        GameLayout.updatePlayerView(state.game, state.me);
    }

    function deck() {
        const cards = [];
        for (let rank = 3; rank <= 15; rank++) {
            const face = rank > 13 ? rank - 13 : rank;
            for (let suit = 1; suit <= 4; suit++) { cards.push(new PresidentCard(suit, face)); }
        }
        return cards;
    }

    function pileOf(name, cards, motion = null) {
        const pile = new CardPile(name, ...cards);
        if (motion) { pile.motion = CardPile.normalizeMotion(motion); }
        return pile;
    }

    // Plays of ascending rank, as a real trick builds, drawn from cards not dealt to the hand.
    function tablePlays(pool, count, perPlay) {
        const byRank = new Map();
        pool.forEach(card => {
            if (!byRank.has(card.strengthRank)) { byRank.set(card.strengthRank, []); }
            byRank.get(card.strengthRank).push(card);
        });
        const piles = [];
        let remaining = count, seat = 1;
        for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
            const cards = byRank.get(rank);
            while (remaining > 0 && cards.length) {
                const take = cards.splice(0, Math.min(perPlay, remaining, cards.length));
                piles.push(pileOf(SEATS[seat], take, { x: Math.sin(piles.length * 1.7) * .35, y: Math.cos(piles.length * 2.3) * .3,
                    power: .5, spin: 2, pitch: 4, yaw: -3 }));
                seat = seat % 3 + 1;
                remaining -= take.length;
            }
        }
        return piles;
    }

    const api = {
        // Options: hand, table (card counts), perPlay, foil, style, shadows, idleFoil, myTurn, theme.
        setup(options = {}) {
            const { hand = 13, table = 0, perPlay = 1, foil = "rainbow", style = "normal", shadows = "fancy",
                idleFoil = true, myTurn = true, theme = null } = options;
            state.foil = foil;
            state.style = style;
            GameLayout.cardFoil = () => foil;
            GameLayout.cardStyle = () => style;
            GameLayout.foilForPlayer = () => foil;
            GameLayout.styleForPlayer = () => style;
            document.body.dataset.idleFoilAnimation = idleFoil ? "on" : "off";
            CardDepth.setShadowStyle(shadows);
            if (theme) { document.documentElement.dataset.colorTheme = theme; }

            const all = deck();
            // Keep the top ranks in the hand so table plays never need them, and every hand card stays playable.
            const handCards = all.slice(-hand).reverse();
            const rest = all.slice(0, Math.max(0, all.length - hand));
            const game = new PresidentGame("424242");
            game.status = "S";
            game.round = 1;
            game.rules = Object.assign({ showCardsOnly: false }, normalizeCustomRules({}));
            game.turn = myTurn ? 0 : 1;
            game.shuffleStartedAt = 1;
            game.startTime = Date.now();
            game.localPlayerName = SEATS[0];
            game.lastHumanActionAt = Date.now();
            game.connectionOnline = true;
            game.save = () => Promise.resolve();
            game.players = SEATS.map((name, index) => {
                const player = new PresidentPlayer(name, index == 0 ? getPlayerKey() : "PC");
                player.cards = index == 0 ? handCards : [];
                player.turn = (myTurn ? index == 0 : index == 1) ? 1 : 0;
                player.placement = 0;
                return player;
            });
            game.piles = tablePlays(rest, table, perPlay);
            state.game = game;
            state.me = game.players[0];
            state.pool = rest;
            refresh();
            // A first update records the table identity; this second one is how later snapshots arrive.
            refresh();
            return api.stats();
        },
        stats() {
            return {
                nodes: document.getElementsByTagName("*").length,
                handCards: document.querySelectorAll("#playerHand .game-card").length,
                tableCards: document.querySelectorAll(".table-play__card").length,
                canvases: document.querySelectorAll("canvas").length,
                filters: document.querySelectorAll("filter").length,
                shadowPaths: document.querySelectorAll(".card-depth-floor path, .card-depth-svg path[fill='#020b05']").length,
                animations: document.getAnimations().length,
                runningFoil: document.getAnimations().filter(animation => animation.playState == "running" &&
                    /^foil-idle/.test(animation.animationName || "")).length,
                supersampling: CardDepth.useSupersampling(),
                canvasMegabytes: Math.round([...document.querySelectorAll("canvas")]
                    .reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0) / 1048576 * 10) / 10,
                dpr: window.devicePixelRatio
            };
        },
        // Resolves after two rendered frames, or `delay` milliseconds on top of that.
        settle(delay = 0) {
            return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, delay))));
        },
        waitForFlights() {
            return new Promise(resolve => {
                const check = () => document.querySelector(".card-flight, .card-discard-flight")
                    ? requestAnimationFrame(check) : resolve();
                requestAnimationFrame(() => requestAnimationFrame(check));
            });
        },
        // Waits until artwork used by the depth renderer has been decoded and drawn.
        async ready() {
            await Promise.all([...document.images].map(image => image.decode().catch(() => { })));
            await Promise.all([...CardDepth.supersampledArtwork.values()].map(pending => pending.catch(() => { })));
            await api.settle(200);
        },
        // The local player plays `count` same-rank cards with a thrown motion. Returns the synchronous update cost.
        play(count = 1) {
            const me = state.me, game = state.game;
            const sameRank = me.cards.reduce((groups, card) => {
                (groups[card.strengthRank] = groups[card.strengthRank] || []).push(card);
                return groups;
            }, {});
            const group = Object.values(sameRank).find(cards => cards.length >= count);
            const cards = (group || me.cards).slice(0, count);
            const pile = pileOf(me.name, cards.length > 1 && !group ? [cards[0]] : cards,
                { x: .12, y: -.1, power: .7, spin: 3, pitch: 9, yaw: -6 });
            me.cards = me.cards.filter(card => !pile.includes(card));
            game.piles = [...game.piles, pile];
            const start = performance.now();
            refresh();
            return performance.now() - start;
        },
        // An opponent's move arriving as a snapshot: no hand card leaves, but the signature changes.
        opponentPlays() {
            const game = state.game;
            const card = state.pool.find(candidate => !game.piles.some(pile => pile.includes(candidate)));
            game.piles = [...game.piles, pileOf(SEATS[1], [card], { x: -.1, y: .08, power: .5, spin: -2, pitch: 3, yaw: 4 })];
            const start = performance.now();
            refresh();
            return performance.now() - start;
        },
        // A snapshot with no visual change, such as a presence or timer write.
        noOpSnapshot() {
            const start = performance.now();
            refresh();
            return performance.now() - start;
        },
        // Selecting a hand card: the click handler rebuilds the hand.
        selectCard(index = 4) {
            const card = document.querySelectorAll("#playerHand .game-card")[index];
            const start = performance.now();
            card.click();
            return performance.now() - start;
        },
        // Clears the table through the real discard animation.
        clearTable() {
            const table = document.getElementById("gameTable");
            return new Promise(resolve => GameLayout.animateDiscardedCards(table, () => resolve()));
        },
        // Scrolls the hand through two out-and-back sweeps, returning frame intervals.
        scrollHand(duration = 3000) {
            const hand = document.getElementById("playerHand");
            const max = hand.scrollWidth - hand.clientWidth;
            return new Promise(resolve => {
                let start = null, previous = null;
                const intervals = [];
                const step = time => {
                    if (start == null) { start = previous = time; }
                    else { intervals.push(time - previous); previous = time; }
                    const progress = Math.min(1, (time - start) / duration);
                    hand.scrollLeft = max * (1 - Math.cos(progress * Math.PI * 4)) / 2;
                    if (progress < 1) { requestAnimationFrame(step); }
                    else { resolve({ intervals, max }); }
                };
                requestAnimationFrame(step);
            });
        },
        frameIntervals(duration = 3000) {
            return new Promise(resolve => {
                const intervals = [];
                let start = null, previous = null;
                const step = time => {
                    if (start == null) { start = previous = time; }
                    else { intervals.push(time - previous); previous = time; }
                    if (time - start < duration) { requestAnimationFrame(step); }
                    else { resolve(intervals); }
                };
                requestAnimationFrame(step);
            });
        },
        openDialog(id = "Settings") {
            showDialog(id, true);
        },
        // Screen positions of real hand cards, for dispatching trusted pointer input from the runner.
        cardPoint(index = 4) {
            const hand = document.getElementById("playerHand");
            const card = hand.querySelectorAll(".game-card")[index];
            card.scrollIntoView({ block: "nearest", inline: "center" });
            const bounds = card.getBoundingClientRect();
            const table = document.getElementById("gameTable").getBoundingClientRect();
            return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
                tableX: table.left + table.width / 2, tableY: table.top + table.height / 2 };
        },
        cardFace(index = 0) {
            const hand = document.getElementById("playerHand");
            return hand.querySelectorAll(".game-card")[index].querySelector("img").src;
        },
        // Stops every animation at a fixed time so screenshots of two builds can be compared pixel by pixel.
        freeze(time = 1500) {
            document.getAnimations().forEach(animation => {
                animation.pause();
                animation.currentTime = time;
            });
            return api.settle(100);
        },
        // Raster cost of one artwork when drawn repeatedly to a canvas: the depth renderer's per-frame draw.
        async drawCost(source, width, height, iterations = 40, viaBitmap = false) {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            context.imageSmoothingQuality = "high";
            let drawable = image, prepareMs = 0;
            if (viaBitmap) {
                const start = performance.now();
                drawable = await createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
                prepareMs = performance.now() - start;
            }
            const start = performance.now();
            for (let index = 0; index < iterations; index++) {
                context.setTransform(1, .02 * (index % 5), -.02 * (index % 3), 1, 0, 0);
                context.drawImage(drawable, 0, 0, width, height);
            }
            context.getImageData(0, 0, 1, 1);
            return { perDrawMs: (performance.now() - start) / iterations, prepareMs };
        },
        cardSource(style, foil, rank = 13, suit = 1) {
            return new PresidentCard(suit, rank).toImageDataUri(style, foil);
        },
        styles() { return [...new Set([...document.querySelectorAll("[data-card-style]")].map(option => option.dataset.cardStyle))]; },
        foils() { return Card.foilOptions().map(option => option.id); },
        get game() { return state.game; }
    };
    window.Perf = api;
})();
