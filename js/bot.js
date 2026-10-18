class BotAI {
    static skills = ["bad", "good", "pro", "god"];

    static buckets = {
        bad: ["Bomsen", "Onkel Pass", "Guest_839201", "Knurt", "Turbo-Tore", "Jompa", "RNGesus"],
        good: ["Boten Anna", "Haakon VIII", "Kurt-Josef", "Kjell-Bjarne", "Mathias (CEO)",
            "J21Oslo", "Fetter Anton", "Tante_Pose", "BobRoss", "IlIllIlIIl"],
        pro: ["Severin Suveren", "H4cker-man", "Steinar Storspiller", "xXLegolasXx",
            "DeepSeek", "GPT6", "Sjefen_Over_Alle_Sjefer"],
        god: ["Mysil Bergsprekken", "ギフテッド"]
    };

    static skillForName(name) {
        var normalized = (name || "").trim().toLocaleLowerCase();
        return BotAI.skills.find(skill =>
            BotAI.buckets[skill].some(candidate => candidate.toLocaleLowerCase() == normalized)) || "good";
    }

    static skill(value) {
        if (value == null) { return "good"; }
        if (!BotAI.skills.includes(value)) {
            throw new Error(`Ukjent botnivå: ${value}`);
        }
        return value;
    }

    static observe(game, player) {
        var top = game.topPile();
        var seat = game.players.indexOf(player);
        if (seat < 0) { throw new Error("Botspilleren finnes ikke i spillet."); }
        var clockwise = game.players.slice(seat + 1).concat(game.players.slice(0, seat));
        var omniscient = player.playerKey == "PC" && BotAI.skill(player.botSkill) == "god";
        // Only the explicitly cheating God level may read opponents' card identities.
        return {
            cards: player.cards.slice(),
            name: player.name,
            opponents: clockwise.filter(other => other.placement == 0)
                .map(other => ({
                    name: other.name, count: other.cards.length, passed: other.lastPlay === "Pass",
                    ...(omniscient ? { cards: other.cards.slice() } : {})
                })),
            top: top == null ? null : {
                rank: top.strengthRank,
                name: top.name,
                count: hasFourOfKindOnTop(game) ? 4 : top.length,
                own: top.name == player.name
            },
            tableCards: game.piles.flatMap(pile => pile.map(card => ({ suit: card.suit, rank: card.rank }))),
            tableOwners: game.piles.map(pile => pile.name),
            playedCards: (game.playedCards || []).map(card => ({ suit: card.suit, rank: card.rank })),
            playerCount: game.players.length
        };
    }

    static groups(cards) {
        var groups = new Map();
        cards.forEach(card => {
            if (!groups.has(card.strengthRank)) { groups.set(card.strengthRank, []); }
            groups.get(card.strengthRank).push(card);
        });
        return Array.from(groups.values()).sort((a, b) => a[0].strengthRank - b[0].strengthRank);
    }

    static moves(view) {
        var moves = [];
        BotAI.groups(view.cards).forEach(group => {
            var rank = group[0].strengthRank;
            if (view.top != null && rank != 16 && rank < view.top.rank) { return; }
            var min = view.top == null ? 1 : (rank == 16 ? 1 : view.top.count);
            var max = view.top == null ? group.length : min;
            for (var count = min; count <= Math.min(max, group.length); count++) {
                moves.push(group.slice(0, count));
            }
        });
        // Never leave only club three behind when a safe alternative exists.
        var safe = moves.filter(move => {
            var rest = BotAI.remaining(view.cards, move);
            return !(rest.length == 1 && rest[0].strengthRank == 16);
        });
        if (safe.length > 0) { moves = safe; }
        return moves;
    }

    static remaining(cards, move) {
        return cards.filter(card => !move.includes(card));
    }

    static handCost(cards) {
        if (cards.length == 0) { return 0; }
        var cost = 0;
        BotAI.groups(cards).forEach(group => {
            var rank = group[0].strengthRank;
            cost += 12 + (group.length == 1 && rank < 11 ? 5 : 0);
            cost -= Math.max(0, rank - 10) * 1.4;
        });
        if (cards.length == 1 && cards[0].strengthRank == 16) { cost += 100; }
        return cost;
    }

    static clears(view, move) {
        if (move[0].strengthRank == 16) { return true; }
        var naturalThrees = new Set();
        for (var index = view.tableCards.length - 1; index >= 0; index--) {
            var card = view.tableCards[index];
            if (card.rank != 3 || card.suit == 3) { break; }
            naturalThrees.add(card.suit);
        }
        move.filter(card => card.rank == 3 && card.suit != 3).forEach(card => naturalThrees.add(card.suit));
        return view.playerCount == 2 ? [1, 2, 4].every(suit => naturalThrees.has(suit)) :
            view.playerCount == 3 && [1, 2].every(suit => naturalThrees.has(suit));
    }

    static basicScore(view, move) {
        var rest = BotAI.remaining(view.cards, move);
        var rank = move[0].strengthRank;
        if (rest.length == 0) { return rank == 16 ? -10000 : 10000; }
        var score = -BotAI.handCost(rest) - rank * 0.65 + move.length * 2;
        if (rank == 16) {
            score -= rest.length > 5 ? 14 : -6;
        }
        var threatened = view.opponents.some(other => other.count <= 2);
        if (threatened) {
            if (view.top == null) {
                score += view.opponents.filter(other => other.count < move.length).length * 15;
            } else {
                score += rank * 0.8;
            }
        }
        if (BotAI.clears(view, move)) { score += 7; }
        return score;
    }

    static samples(view, random) {
        var known = new Set(view.cards.concat(view.playedCards, view.tableCards)
            .map(card => `${card.suit}:${card.rank}`));
        var unseen = [];
        for (var suit = 1; suit <= 4; suit++) {
            for (var rank = 1; rank <= 13; rank++) {
                if (view.playerCount == 3 && suit == 4 && rank == 3) { continue; }
                if (!known.has(`${suit}:${rank}`)) { unseen.push(new PresidentCard(suit, rank)); }
            }
        }
        var samples = [];
        for (var sample = 0; sample < 16; sample++) {
            var deck = unseen.slice();
            for (var index = deck.length - 1; index > 0; index--) {
                var swap = Math.floor(random() * (index + 1));
                [deck[index], deck[swap]] = [deck[swap], deck[index]];
            }
            samples.push(view.opponents.map(other => deck.splice(0, other.count)));
        }
        return samples;
    }

    static responseRisk(view, move, samples) {
        if (BotAI.clears(view, move)) { return { control: 1, finish: 0 }; }
        var rank = move[0].strengthRank;
        var trailing = 0;
        for (var index = view.tableCards.length - 1; index >= 0; index--) {
            var card = view.tableCards[index];
            if (new PresidentCard(card.suit, card.rank).strengthRank != rank) { break; }
            trailing++;
        }
        var required = trailing + move.length >= 4 ? 4 : move.length;
        var control = 0;
        var finish = 0;
        samples.forEach(hands => {
            var overtaken = false;
            var finishing = false;
            var fourCanBeBeaten = required != 4 || hands.some(hand =>
                BotAI.groups(hand).some(group => group.length >= 4 && group[0].strengthRank > rank));
            if (!fourCanBeBeaten) {
                control++;
                return;
            }
            hands.forEach((hand, index) => {
                var responses = BotAI.groups(hand).filter(group =>
                    group[0].strengthRank == 16 ||
                    (group.length >= required && group[0].strengthRank >= rank));
                var hasResponse = responses.some(group =>
                    group[0].strengthRank != 16 || hand.length > 1);
                // A voluntary pass is evidence, not proof that the player cannot respond.
                if (hasResponse && !view.opponents[index].passed) { overtaken = true; }
                if (hasResponse && view.opponents[index].passed) { control -= 0.25; }
                if (responses.some(group => group[0].strengthRank != 16 && group.length == hand.length &&
                    hand.length == required)) { finishing = true; }
            });
            if (!overtaken) { control++; }
            if (finishing) { finish++; }
        });
        return { control: Math.max(0, control / samples.length), finish: finish / samples.length };
    }

    static proScore(view, move, samples) {
        var rest = BotAI.remaining(view.cards, move);
        var score = BotAI.basicScore(view, move);
        if (rest.length == 0) { return score; }
        var risk = BotAI.responseRisk(view, move, samples);
        // Look one lead ahead: gaining control matters most when the rest is easy to shed.
        var future = BotAI.groups(rest).map(group => BotAI.handCost(BotAI.remaining(rest, group)));
        var nextCost = Math.min(...future);
        score += risk.control * 2;
        score -= risk.finish * 55;
        if (rest.length <= 6) {
            score += risk.control * Math.max(0, 20 - nextCost * 0.5);
        }
        return score;
    }

    static rollout(view, firstMove, hands) {
        var players = [{ cards: view.cards.slice(), passed: false }].concat(hands.map((hand, index) => ({
            cards: hand.slice(), passed: view.opponents[index].passed
        })));
        var table = view.tableCards.slice();
        var seatForName = name => name == null ? -1 : (name == view.name ? 0 :
            (view.opponents.some(other => other.name == name)
                ? view.opponents.findIndex(other => other.name == name) + 1 : -1));
        var owners = (view.tableOwners || []).map(seatForName);
        var top = view.top == null ? null : {
            rank: view.top.rank, count: view.top.count,
            owner: view.top.own ? 0 : seatForName(view.top.name)
        };
        var finished = 0;
        var turn = 0;
        var makeView = index => ({
            cards: players[index].cards,
            opponents: players.filter((other, seat) => seat != index && !other.finished)
                .map(other => ({ count: other.cards.length, passed: other.passed })),
            top: top == null ? null : { rank: top.rank, count: top.count, own: top.owner == index },
            tableCards: table, playedCards: [], playerCount: view.playerCount
        });
        for (var step = 0; step < 100; step++) {
            var current = players[turn];
            var state = makeView(turn);
            var move = step == 0 ? firstMove : BotAI.chooseMove(state, "good");
            if (move == null) {
                current.passed = true;
            } else {
                current.cards = BotAI.remaining(current.cards, move);
                current.passed = false;
                table = table.concat(move.map(card => ({ suit: card.suit, rank: card.rank })));
                owners.push(turn);
                top = { owner: turn, rank: move[0].strengthRank, count: move.length };
                if (current.cards.length == 0) {
                    if (move[0].strengthRank == 16) {
                        current.finished = true;
                        if (turn == 0) { return 0; }
                    } else {
                        current.finished = true;
                        finished++;
                        if (turn == 0) { return (players.length - finished) / (players.length - 1); }
                    }
                }
            }
            var active = players.filter(other => !other.finished);
            if (active.length <= 1) {
                return (players.length - finished - 1) / (players.length - 1);
            }
            var clear = move != null && BotAI.clears(state, move);
            var trailing = 0;
            if (top != null) {
                for (var index = table.length - 1; index >= 0; index--) {
                    var card = table[index];
                    if (new PresidentCard(card.suit, card.rank).strengthRank != top.rank) { break; }
                    trailing++;
                }
                if (trailing >= 4) {
                    top.count = 4;
                    clear = !players.some((other, seat) => seat != top.owner && !other.finished && !other.passed &&
                        BotAI.groups(other.cards).some(group => group.length >= 4 && group[0].strengthRank > top.rank));
                }
                if (players.every((other, seat) => seat == top.owner || other.finished || other.passed)) {
                    clear = true;
                }
            }
            if (clear) {
                var owner = top.owner;
                var activeOwners = owners.filter(seat => seat >= 0 && !players[seat].finished);
                var finishedOwnerWithTwoRemaining = move == null && owner >= 0 &&
                    players[owner].finished && active.length == 2;
                if (finishedOwnerWithTwoRemaining) {
                    turn = owner;
                    do { turn = (turn + 1) % players.length; } while (players[turn].finished);
                } else if (activeOwners.length > 0) {
                    turn = activeOwners[activeOwners.length - 1];
                } else {
                    turn = owner < 0 ? 0 : owner;
                    do { turn = (turn + players.length - 1) % players.length; } while (players[turn].finished);
                }
                top = null;
                table = [];
                owners = [];
                players.forEach(other => { other.passed = false; });
            } else {
                do { turn = (turn + 1) % players.length; } while (players[turn].finished);
                players[turn].passed = false;
            }
        }
        return 0.5 + (players.reduce((sum, other) => sum + BotAI.handCost(other.cards), 0) /
            players.length - BotAI.handCost(players[0].cards)) / 200;
    }

    static chooseMove(view, skill = "good", random = Math.random) {
        skill = BotAI.skill(skill);
        var moves = BotAI.moves(view);
        if (moves.length == 0) { return null; }
        var winning = moves.find(move => move.length == view.cards.length && move[0].strengthRank != 16);
        if (winning != null) { return winning; }
        if (skill == "bad") {
            if (view.top != null && random() < 0.15) { return null; }
            return moves[Math.floor(random() * moves.length)];
        }
        if (view.top != null && view.top.own) { return null; }
        if (skill == "god") {
            if (view.opponents.some(other => !Array.isArray(other.cards) || other.cards.length != other.count)) {
                throw new Error("Gud-nivået krever motspillernes faktiske kort.");
            }
            var hands = view.opponents.map(other => other.cards);
            var candidates = moves.map(move => ({
                move, score: BotAI.proScore(view, move, [hands]),
                outcome: BotAI.rollout(view, move, hands)
            }));
            if (view.top != null) {
                candidates.push({
                    move: null, score: -BotAI.handCost(view.cards),
                    outcome: BotAI.rollout(view, null, hands)
                });
            }
            candidates.sort((a, b) => (b.outcome * 100 + b.score) - (a.outcome * 100 + a.score));
            return candidates[0].move;
        }
        var samples = skill == "pro" ? BotAI.samples(view, random) : null;
        var scored = moves.map(move => ({
            move,
            score: skill == "pro" ? BotAI.proScore(view, move, samples) : BotAI.basicScore(view, move)
        }));
        scored.sort((a, b) => b.score - a.score);
        if (skill == "pro") {
            var finalists = scored.slice(0, 4);
            if (view.top != null) { finalists.push({ move: null, score: -BotAI.handCost(view.cards) }); }
            finalists.forEach(candidate => {
                candidate.rollout = samples.slice(0, 8).reduce((sum, hands) =>
                    sum + BotAI.rollout(view, candidate.move, hands), 0) / 8;
                candidate.value = candidate.score + candidate.rollout * 35;
            });
            finalists.sort((a, b) => b.value - a.value);
            return finalists[0].move;
        }
        var best = scored[0];
        if (view.top != null && !view.opponents.some(other => other.count <= 2) &&
            best.score < -BotAI.handCost(view.cards) - 2) { return null; }
        return best.move;
    }

    static tradeCards(game, player, exchange) {
        var seat = game.players.indexOf(player);
        var reserved = new Set();
        (game.piles || []).filter(other =>
            other.from == seat && other !== exchange &&
            !(other.id != null && other.id == exchange.id) &&
            !(other.tradeId != null && other.tradeId == exchange.tradeId &&
                other.from == exchange.from && other.to == exchange.to) &&
            (other.mode == "Velg" || other.mode == "Best")
        ).forEach(other => (other.cards || []).forEach(card =>
            reserved.add(`${card.suit}:${card.rank}`)));
        return player.cards.filter(card => !reserved.has(`${card.suit}:${card.rank}`));
    }

    // Call once per offer/participant; "sneaky" is a consent vote, not permission to start alone.
    static chooseOptionalTrade(game, player, offer, random = Math.random) {
        var seat = game.players.indexOf(player);
        if (game.status != "G" || game.players.length != 3 ||
            offer.kind != "playerTrade" || offer.mode != "Tilbud" ||
            seat < 0 || (seat != offer.from && seat != offer.to)) { return "skip"; }
        var skill = BotAI.skill(player.botSkill || "good");
        var available = BotAI.tradeCards(game, player, offer);
        if (available.length == 0) { return "skip"; }
        var chances = {
            bad: [0.08, 0.45], good: [0.18, 0.65], pro: [0.32, 0.82], god: [0.48, 0.96]
        }[skill];
        var roll = random();
        if (roll < chances[0]) { return "sneaky"; }
        if (seat != offer.from || roll >= chances[1]) { return "skip"; }
        var legal = available.filter(card => card.strengthRank >= 7 && card.strengthRank <= 11);
        if (legal.length == 0) { return "skip"; }
        if (skill == "bad") { return "normal"; }
        var outgoing = BotAI.chooseExchange(player.cards, legal, 1, "good");
        var rest = BotAI.remaining(player.cards, outgoing);
        // Normal trades reveal no opponent identities, even for God: estimate a public 7–J return.
        var expectedCost = [7, 8, 9, 10, 11].reduce((sum, rank) =>
            sum + BotAI.handCost(rest.concat(new PresidentCard(1, rank))), 0) / 5;
        return expectedCost < BotAI.handCost(player.cards) ? "normal" : "skip";
    }

    // Unlike ordinary play, every skill may inspect hidden cards after mutual sneaky consent.
    static chooseSneakyExchange(game, player, exchange, available, random = Math.random) {
        var seat = game.players.indexOf(player);
        var votes = exchange.sneakyVotes || [];
        if (exchange.kind != "playerTrade" || seat < 0 || exchange.from != seat ||
            exchange.from == exchange.to || !votes.includes(exchange.from) ||
            !votes.includes(exchange.to)) {
            throw new Error("Sneaky bytte krever samtykke fra begge deltakerne.");
        }
        var count = exchange.count;
        var ownAvailable = BotAI.tradeCards(game, player, exchange);
        var keys = new Set();
        var legal = available.filter(card => {
            var key = `${card.suit}:${card.rank}`;
            if (!ownAvailable.includes(card) || keys.has(key)) { return false; }
            keys.add(key);
            return true;
        });
        if (!Number.isInteger(count) || count < 0 || legal.length < count) {
            throw new Error("Botten har ikke nok gyldige byttekort.");
        }
        var opponent = game.players[exchange.to];
        if (!opponent) { throw new Error("Motspilleren finnes ikke i spillet."); }
        var reciprocal = (game.piles || []).find(other =>
            other.kind == "playerTrade" && other.tradeId == exchange.tradeId &&
            other.from == exchange.to && other.to == seat);
        var offered = reciprocal && reciprocal.cards || [];
        // Given cards have already left the sender's hand; selected cards may still be in it.
        var opponentCards = Array.from(opponent.cards);
        var incoming = offered.length == count ? Array.from(offered, card =>
            new PresidentCard(card.suit, card.rank)) : [];
        if (incoming.length != count) {
            var opponentAvailable = BotAI.tradeCards(game, opponent, reciprocal || {
                from: exchange.to, to: seat, tradeId: exchange.tradeId
            });
            incoming = BotAI.chooseExchange(opponentCards, opponentAvailable, count, "good");
        }
        var opponentRest = opponentCards.filter(card => !incoming.some(other =>
            card.suit == other.suit && card.rank == other.rank));
        var ownRole = player.lastPlacement || 2;
        var opponentRole = opponent.lastPlacement || 2;
        var pressure = opponentRole < ownRole ? 0.7 : 0.4;
        var best = [];
        var bestScore = Infinity;
        var visit = (start, chosen) => {
            if (chosen.length == count) {
                var after = BotAI.remaining(player.cards, chosen).concat(incoming);
                var cost = BotAI.handCost(after) +
                    chosen.reduce((sum, card) => sum + card.strengthRank, 0) * 0.8;
                // Avoid completing the rival's combinations, especially a higher-ranked rival's.
                cost -= pressure * BotAI.handCost(opponentRest.concat(chosen));
                if (cost < bestScore || (cost == bestScore && random() < 0.5)) {
                    best = chosen.slice();
                    bestScore = cost;
                }
                return;
            }
            for (var index = start; index <= legal.length - (count - chosen.length); index++) {
                visit(index + 1, chosen.concat(legal[index]));
            }
        };
        visit(0, []);
        return best;
    }

    static chooseExchange(cards, available, count, skill = "good", random = Math.random) {
        skill = BotAI.skill(skill);
        if (available.length < count) { throw new Error("Botten har ikke nok gyldige byttekort."); }
        if (skill == "bad") {
            var shuffled = available.slice();
            for (var i = shuffled.length - 1; i > 0; i--) {
                var j = Math.floor(random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, count);
        }
        var best;
        var bestScore = Infinity;
        var visit = (start, chosen) => {
            if (chosen.length == count) {
                var score = BotAI.handCost(BotAI.remaining(cards, chosen)) +
                    chosen.reduce((sum, card) => sum + card.strengthRank, 0) *
                    (skill == "pro" || skill == "god" ? 1.2 : 0.8);
                if (score < bestScore) {
                    best = chosen.slice();
                    bestScore = score;
                }
                return;
            }
            for (var index = start; index <= available.length - (count - chosen.length); index++) {
                visit(index + 1, chosen.concat(available[index]));
            }
        };
        visit(0, []);
        return best;
    }
}
