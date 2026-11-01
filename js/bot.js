class BotAI {
    // Stored IDs good/pro retain the Normal/Good strategies for existing games.
    static skills = ["good", "pro", "god"];

    static buckets = {
        good: [
            "Bomsen", 
            "Onkel Pass", 
            "Guest_839201", 
            "Knurt", 
            "Turbo-Tore",
            "Boten Anna", 
            "Haakon VIII", 
            "Kurt-Josef", 
            "Kjell-Bjarne", 
            "Mathias (CEO)",
            "J21Oslo", 
            "Tante_Pose", 
            "IlIllIlIIl"
        ],
        pro: [
            "Severin Suveren", 
            "H4cker-man", 
            "Steinar Storspiller", 
            "xXLegolasXx",
            "DeepSeek", 
            "Sjefen_Over_Alle_Sjefer", 
            "Fetter Anton"
        ],
        god: [
            "GPT6", 
            "RNGesus", 
            "ギフテッド", 
            "Mysil Bergsprekken", 
            "BobRoss", 
            "Jompa"
        ]
    };

    // Exact endings: total cards in play before searching, and the node budget per decision (about 8µs a node on a desktop).
    static searchLimits = {
        pro: { cards: 12, nodes: 3000, samples: 8 },
        god: { cards: 18, nodes: 5000 }
    };

    // How much worse than passing a play may look before Normal passes. A pass locks the bot out of the whole
    // pile, so it is rarely worth it: tuned in paired games, where 10 clearly beats both 2 and never passing.
    static passMargin = 10;

    // Good departs from Normal's move only when rollouts show at least `margin` more placement value.
    // Scoring the winning margin in rollouts (`marginWeight`) separates moves that placement alone rates equal.
    static proRollouts = { finalists: 4, samples: 8, margin: 0.3, marginWeight: 0.5 };

    static skillForName(name) {
        var normalized = (name || "").trim().toLocaleLowerCase();
        return BotAI.skills.find(skill =>
            BotAI.buckets[skill].some(candidate => candidate.toLocaleLowerCase() == normalized)) || "good";
    }

    static skill(value) {
        if (value == null || value == "bad") { return "good"; }
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
        if (game.turnDirection === -1) { clockwise.reverse(); }
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
            playerCount: game.players.length,
            // Public facts the rollout needs: who loses power to Maktfall, and who leads after a finished player's pile.
            president: (game.players.some(other => other.placement == 1) ? null :
                game.players.find(other => other.placement == 0 && other.lastPlacement == 1)?.name) ?? null,
            nextAfterTop: top == null ? null : BotAI.nextActiveName(game, top.name),
            ...BotAI.exchangeMemory(game, player),
            rules: normalizeCustomRules(game.rules)
        };
    }

    // What this bot's own exchange receipts prove: cards it gave are held until played, and whoever
    // handed over their best cards holds nothing above the lowest of them, apart from club three.
    static exchangeMemory(game, player) {
        var played = new Set((game.playedCards || []).map(card => `${card.suit}:${card.rank}`));
        var held = {};
        var capped = {};
        (game.exchangeReceipts || []).forEach(receipt => {
            if (receipt.sender == player.name) {
                held[receipt.recipient] = (held[receipt.recipient] || []).concat(receipt.cards
                    .filter(card => !played.has(`${card.suit}:${card.rank}`))
                    .map(card => ({ suit: card.suit, rank: card.rank })));
            } else if (receipt.recipient == player.name && !String(receipt.id).includes(":trade:") &&
                game.players.some(other => other.name == receipt.sender && other.lastPlacement > player.lastPlacement)) {
                capped[receipt.sender] = Math.min(...receipt.cards.map(BotAI.strengthOf));
            }
        });
        return { held, capped };
    }

    static nextActiveName(game, name) {
        var count = game.players.length;
        var direction = game.turnDirection === -1 ? -1 : 1;
        var seat = game.players.findIndex(other => other.name == name);
        for (var step = 1; seat >= 0 && step < count; step++) {
            var next = game.players[(seat + direction * step + count * 2) % count];
            if (next.placement == 0) { return next.name; }
        }
        return null;
    }

    static strengthOf(card) {
        if (card.rank == 3) { return card.suit == 3 ? 16 : 3; }
        return card.rank < 3 ? card.rank + 13 : card.rank;
    }

    // How many cards of this strength lie unbroken on top of the table.
    static trailing(tableCards, rank) {
        var count = 0;
        for (var index = tableCards.length - 1; index >= 0; index--) {
            if (BotAI.strengthOf(tableCards[index]) != rank) { break; }
            count++;
        }
        return count;
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
        var rules = view.rules || {};
        BotAI.groups(view.cards).forEach(group => {
            var rank = group[0].strengthRank;
            // A single clearing two is legal on anything but four of a kind, whatever else the rules say.
            if (rules.twoClears && rank == 15 && view.top != null && view.top.count < 4) {
                moves.push(group.slice(0, 1));
                if (view.top.count == 1) { return; }
            }
            if (view.top != null && view.top.count >= 4 && rank == 16 && !rules.clubThreeBeatsFour) { return; }
            if (view.top != null && rank != 16 && rank < view.top.rank) { return; }
            if (view.top != null && rank != 16 && rank == view.top.rank && rules.higherOnly) { return; }
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
        // Leading club three clears nothing and hands the lead straight back, so it only spends the card.
        // Held, it can still be played just before the last combination, so it is kept unless that time is now.
        if (view.top == null && BotAI.groups(view.cards).length > 2) {
            moves = moves.filter(move => move[0].strengthRank != 16);
        }
        return moves;
    }

    // Club three followed by a lead of the only remaining combination cannot be stopped.
    static clubThreeWins(view, move) {
        return move[0].strengthRank == 16 && BotAI.groups(BotAI.remaining(view.cards, move)).length == 1;
    }

    static unseenCounts(view) {
        var seen = new Array(53).fill(false);
        var mark = card => { seen[(card.suit - 1) * 13 + card.rank - 1] = true; };
        view.cards.forEach(mark);
        view.playedCards.forEach(mark);
        view.tableCards.forEach(mark);
        var counts = new Array(17).fill(0);
        for (var suit = 1; suit <= 4; suit++) {
            for (var rank = 1; rank <= 13; rank++) {
                if (seen[(suit - 1) * 13 + rank - 1] || (view.playerCount == 3 && suit == 4 && rank == 3)) { continue; }
                counts[BotAI.strengthOf({ suit, rank })]++;
            }
        }
        return counts;
    }

    // True when the unseen cards prove that nobody among these opponents can answer the combination.
    static unbeatable(view, rank, count, counts, opponents) {
        var rules = view.rules || {};
        if ((rank == 10 && rules.tenClears) || (rank == 15 && count == 1 && rules.twoClears) ||
            (count == 4 && rules.fourAlwaysClears)) { return true; }
        if (opponents.length == 0) { return true; }
        if (counts[16] > 0 && (count < 4 || rules.clubThreeBeatsFour)) { return false; }
        if (rules.twoClears && counts[15] > 0 && count < 4) { return false; }
        if (!opponents.some(other => other.count >= count)) { return true; }
        for (var strength = rules.higherOnly ? rank + 1 : rank; strength <= 15; strength++) {
            if (counts[strength] >= count) { return false; }
        }
        return true;
    }

    // A line nothing can stop: every combination but the last is unbeatable, so the bot keeps the lead to the end.
    static certainMove(view, moves) {
        var groups = BotAI.groups(view.cards).filter(group => group[0].strengthRank != 16);
        if (groups.length > 6) { return null; }
        var counts = BotAI.unseenCounts(view);
        var isSafe = group => BotAI.unbeatable(view, group[0].strengthRank, group.length, counts, view.opponents);
        var runsOut = cards => BotAI.groups(cards).filter(group =>
            group[0].strengthRank != 16 && !isSafe(group)).length <= 1;
        if (view.top == null) {
            var safe = groups.filter(isSafe);
            // With club three held, the last combination must wait for it: playing it now would strand club three.
            var strands = groups.length == 1 && view.cards.length > groups[0].length;
            return safe.length > 0 && !strands && groups.length - safe.length <= 1 ? safe[0] : null;
        }
        var rules = view.rules || {};
        var responders = rules.openPass ? view.opponents : view.opponents.filter(other => !other.passed);
        var plain = moves.find(move => move[0].strengthRank != 16 &&
            (BotAI.clears(view, move) || BotAI.unbeatable(view, move[0].strengthRank, move.length, counts, responders)) &&
            runsOut(BotAI.remaining(view.cards, move)));
        if (plain != null) { return plain; }
        return moves.find(move => move[0].strengthRank == 16 && runsOut(BotAI.remaining(view.cards, move))) || null;
    }

    static remaining(cards, move) {
        return cards.filter(card => !move.includes(card));
    }

    static handCost(cards) {
        if (cards.length == 0) { return 0; }
        var cost = 0;
        BotAI.groups(cards).forEach(group => {
            var rank = group[0].strengthRank;
            // Club three wins back the lead whenever it is needed, so holding it makes a hand cheaper.
            if (rank == 16) { cost -= 4; return; }
            cost += 12 + (group.length == 1 && rank < 11 ? 5 : 0);
            cost -= Math.max(0, rank - 10) * 1.4;
        });
        if (cards.length == 1 && cards[0].strengthRank == 16) { cost += 100; }
        return cost;
    }

    static clears(view, move) {
        var rules = view.rules || {};
        var rank = move[0].strengthRank;
        if (rank == 16 || (rank == 10 && rules.tenClears) || (rank == 15 && move.length == 1 && rules.twoClears) ||
            (move.length == 4 && rules.fourAlwaysClears)) { return true; }
        // Four of a kind built from smaller plays clears at once; only four from the hand can be answered.
        if (move.length < 4 && BotAI.trailing(view.tableCards, rank) + move.length >= 4) { return true; }
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
            // The lead it wins is worth less the more combinations are still left to shed.
            score -= 5 * (BotAI.groups(rest).length - 1);
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
        var held = view.held || {};
        var capped = view.capped || {};
        var heldCards = other => (held[other.name] || []).slice(0, other.count)
            .map(card => new PresidentCard(card.suit, card.rank));
        var known = new Set(view.cards.concat(view.playedCards, view.tableCards, Object.values(held).flat())
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
            var hands = view.opponents.map(heldCards);
            // Capped hands choose first; if a cap cannot be met the deal fills up from what is left.
            view.opponents.map((other, seat) => seat)
                .filter(seat => capped[view.opponents[seat].name] != null).forEach(seat => {
                    var cap = capped[view.opponents[seat].name];
                    for (var index = deck.length - 1; index >= 0 && hands[seat].length < view.opponents[seat].count; index--) {
                        if (deck[index].strengthRank <= cap || deck[index].strengthRank == 16) {
                            hands[seat].push(deck.splice(index, 1)[0]);
                        }
                    }
                });
            hands.forEach((hand, seat) => {
                hand.push(...deck.splice(0, Math.max(0, view.opponents[seat].count - hand.length)));
            });
            samples.push(hands);
        }
        return samples;
    }

    static responseRisk(view, move, samples) {
        if (BotAI.clears(view, move)) { return { control: 1, finish: 0 }; }
        var rules = view.rules || {};
        var rank = move[0].strengthRank;
        var required = move.length;
        var control = 0;
        var finish = 0;
        samples.forEach(hands => {
            var overtaken = false;
            var finishing = false;
            var fourCanBeBeaten = required != 4 || hands.some(hand =>
                BotAI.groups(hand).some(group => (group.length >= 4 && group[0].strengthRank > rank) ||
                    (group[0].strengthRank == 16 && rules.clubThreeBeatsFour)));
            if (!fourCanBeBeaten) {
                control++;
                return;
            }
            hands.forEach((hand, index) => {
                // A pass locks the player out until the pile clears, unless Åpent pass reopens it on new cards.
                if (view.opponents[index].passed && !rules.openPass) { return; }
                var responses = BotAI.groups(hand).filter(group =>
                    (group[0].strengthRank == 16 && (required < 4 || rules.clubThreeBeatsFour)) ||
                    (group[0].strengthRank == 15 && required < 4 && rules.twoClears) ||
                    (group.length >= required && (rules.higherOnly
                        ? group[0].strengthRank > rank
                        : group[0].strengthRank >= rank)));
                var hasResponse = responses.some(group =>
                    group[0].strengthRank != 16 || hand.length > 1);
                if (hasResponse) { overtaken = true; }
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

    // A running copy of the round. Seat 0 is the bot; the other seats follow in playing order.
    static simulation(view, hands) {
        var seatForName = name => name == null ? -1 : (name == view.name ? 0 :
            view.opponents.findIndex(other => other.name == name) + 1 || -1);
        return {
            rules: view.rules || {},
            playerCount: view.playerCount,
            players: [{ cards: view.cards.slice(), passed: false, place: 0 }].concat(hands.map((hand, index) => ({
                cards: hand.slice(), passed: view.opponents[index].passed, place: 0
            }))),
            table: view.tableCards.slice(),
            owners: (view.tableOwners || []).map(seatForName),
            top: view.top == null ? null : {
                rank: view.top.rank, count: view.top.count,
                owner: view.top.own ? 0 : seatForName(view.top.name)
            },
            nextAfterTop: seatForName(view.nextAfterTop),
            president: seatForName(view.president),
            turn: 0, direction: 1, winners: 0, losers: 0
        };
    }

    static simulationView(sim, index) {
        var top = sim.top;
        return {
            cards: sim.players[index].cards,
            opponents: sim.players.filter((other, seat) => seat != index && other.place == 0)
                .map(other => ({ count: other.cards.length, passed: other.passed })),
            top: top == null ? null : { rank: top.rank, count: top.count, own: top.owner == index },
            tableCards: sim.table, playedCards: [], playerCount: sim.playerCount, rules: sim.rules
        };
    }

    static simulationPlace(sim, seat, won) {
        var count = sim.players.length;
        sim.players[seat].place = won ? ++sim.winners : count - sim.losers++;
    }

    static simulationNext(sim, seat, direction, skipOne) {
        var count = sim.players.length;
        for (var step = 0; step < count * 2; step++) {
            seat = (seat + direction + count) % count;
            var player = sim.players[seat];
            if (player.place != 0 || player.passed) { continue; }
            if (skipOne) { skipOne = false; continue; }
            return seat;
        }
        return seat;
    }

    // Plays or passes for the seat in turn, in the same order of checks as the engine's playCards and nextTurnIndex.
    static simulationStep(sim, move) {
        var rules = sim.rules;
        var seat = sim.turn;
        var current = sim.players[seat];
        var clear = false;
        var skipOne = false;
        if (move == null) {
            current.passed = true;
        } else {
            clear = BotAI.clears(BotAI.simulationView(sim, seat), move);
            var rank = move[0].strengthRank;
            skipOne = rules.sameRankSkip === true && sim.top != null && sim.top.rank == rank;
            current.cards = BotAI.remaining(current.cards, move);
            if (rules.openPass) { sim.players.forEach(other => { other.passed = false; }); }
            current.passed = false;
            sim.table = sim.table.concat(move.map(card => ({ suit: card.suit, rank: card.rank })));
            sim.owners = sim.owners.concat(seat);
            sim.top = { owner: seat, rank, count: move.length };
            if (rank == 9 && rules.reversingNine) { sim.direction = -sim.direction; }
            if (current.cards.length == 0) {
                BotAI.simulationPlace(sim, seat, rank != 16);
                if (current.place == 1 && rules.downfall && sim.playerCount > 2 &&
                    sim.president >= 0 && sim.president != seat && sim.players[sim.president].place == 0) {
                    BotAI.simulationPlace(sim, sim.president, false);
                }
            }
        }
        var active = sim.players.filter(other => other.place == 0);
        if (active.length <= 1) {
            if (active.length == 1) { BotAI.simulationPlace(sim, sim.players.indexOf(active[0]), true); }
            return;
        }
        var top = sim.top;
        if (top != null && !clear && BotAI.trailing(sim.table, top.rank) >= 4) {
            top.count = 4;
            clear = !sim.players.some((other, index) => index != top.owner && other.place == 0 && !other.passed &&
                ((rules.clubThreeBeatsFour && other.cards.some(card => card.strengthRank == 16)) ||
                    BotAI.groups(other.cards).some(group => group.length >= 4 && group[0].strengthRank > top.rank)));
        }
        var ownerFinished = top != null && (top.owner < 0 || sim.players[top.owner].place != 0);
        var allPassed = !clear && top != null && sim.players.every((other, index) =>
            index == top.owner || other.place != 0 || other.passed);
        if (!clear && !allPassed) {
            sim.turn = BotAI.simulationNext(sim, seat, sim.direction, skipOne);
            return;
        }
        sim.players.forEach(other => { other.passed = false; });
        var owners = sim.owners.filter(owner => owner >= 0 && sim.players[owner].place == 0);
        if (allPassed && ownerFinished) {
            // Only a pile from a player who finished before the simulation has no seat to count from.
            sim.turn = top.owner < 0 && sim.nextAfterTop >= 0 && sim.players[sim.nextAfterTop].place == 0
                ? sim.nextAfterTop
                : BotAI.simulationNext(sim, top.owner < 0 ? seat : top.owner, sim.direction, false);
        } else if (owners.length > 0) {
            sim.turn = owners[owners.length - 1];
        } else {
            sim.turn = BotAI.simulationNext(sim, top.owner < 0 ? seat : top.owner, -sim.direction, false);
        }
        sim.top = null;
        sim.table = [];
        sim.owners = [];
    }

    static rollout(view, firstMove, hands, marginWeight = 0) {
        var sim = BotAI.simulation(view, hands);
        var count = sim.players.length;
        var worth = place => (count - place) / (count - 1);
        var behind = null;
        for (var step = 0; step < 200; step++) {
            var move = step == 0 ? firstMove : BotAI.chooseMove(BotAI.simulationView(sim, sim.turn), "good");
            BotAI.simulationStep(sim, move);
            if (behind == null && sim.players[0].place == 0 && sim.players.some(other => other.place != 0)) {
                behind = sim.players[0].cards.length;
            }
            if (sim.players[0].place != 0) {
                var left = sim.players.slice(1).filter(other => other.place == 0);
                var margin = behind != null ? -behind :
                    (left.length ? left.reduce((sum, other) => sum + other.cards.length, 0) / left.length : 0);
                return worth(sim.players[0].place) + marginWeight * margin / 20;
            }
        }
        return 0.5 + (sim.players.reduce((sum, other) => sum + BotAI.handCost(other.cards), 0) /
            count - BotAI.handCost(sim.players[0].cards)) / 200;
    }

    static searchOptions(view) {
        if (view.top != null && view.top.own && !(view.rules || {}).sameRankSkip) { return [null]; }
        var moves = BotAI.moves(view);
        var winning = moves.find(move => move.length == view.cards.length && move[0].strengthRank != 16) ||
            moves.find(move => BotAI.clubThreeWins(view, move));
        if (winning != null) { return [winning]; }
        return view.top == null ? moves : moves.concat([null]);
    }

    static searchKey(sim) {
        var key = "";
        sim.players.forEach(player => {
            if (player.place != 0) {
                key += `#${player.place}`;
            } else {
                key += player.passed ? "!" : "/";
                player.cards.forEach(card => { key += String.fromCharCode(97 + card.strengthRank); });
            }
        });
        var top = sim.top;
        if (top != null) {
            var leader = -1;
            for (var index = sim.owners.length - 1; index >= 0 && leader < 0; index--) {
                var owner = sim.owners[index];
                if (owner >= 0 && sim.players[owner].place == 0) { leader = owner; }
            }
            key += `|${top.rank},${top.count},${top.owner},${BotAI.trailing(sim.table, top.rank)},${leader}`;
        }
        return `${key}|${sim.turn},${sim.direction}`;
    }

    static searchStep(sim, move) {
        var next = Object.assign({}, sim);
        next.players = sim.players.map(player => Object.assign({}, player));
        next.top = sim.top == null ? null : Object.assign({}, sim.top);
        BotAI.simulationStep(next, move);
        return next;
    }

    // Exact search of the rest of the round: every player picks the move that places them best.
    // Returns each seat's placement, or null when the search runs out of nodes.
    static search(sim, memo, budget) {
        if (sim.players.every(player => player.place != 0)) { return sim.players.map(player => player.place); }
        var key = BotAI.searchKey(sim);
        var known = memo.get(key);
        if (known != null) { return known; }
        if (--budget.nodes < 0) { return null; }
        var seat = sim.turn;
        var best = null;
        var options = BotAI.searchOptions(BotAI.simulationView(sim, seat));
        for (var index = 0; index < options.length; index++) {
            var places = BotAI.search(BotAI.searchStep(sim, options[index]), memo, budget);
            if (places == null) { return null; }
            if (best == null || places[seat] < best[seat]) { best = places; }
            if (best[seat] == sim.winners + 1) { break; }
        }
        memo.set(key, best);
        return best;
    }

    // Each option's placement for this bot against the given hands, or null when out of nodes.
    static searchRoot(view, hands, budget) {
        var sim = BotAI.simulation(view, hands);
        var memo = new Map();
        var results = [];
        var options = BotAI.searchOptions(view);
        for (var index = 0; index < options.length; index++) {
            var places = BotAI.search(BotAI.searchStep(sim, options[index]), memo, budget);
            if (places == null) { return null; }
            results.push({ move: options[index], place: places[0] });
        }
        return results;
    }

    // Averages exact searches over the given hands. Undefined when the ending is still too big to search.
    static searchedMove(view, samples, limit) {
        var cards = view.opponents.reduce((sum, other) => sum + other.count, view.cards.length);
        if (cards > limit.cards) { return undefined; }
        var budget = { nodes: limit.nodes };
        var totals = [];
        for (var index = 0; index < samples.length; index++) {
            var results = BotAI.searchRoot(view, samples[index], budget);
            if (results == null) { return undefined; }
            results.forEach((result, option) => { totals[option] = (totals[option] || 0) + result.place; });
        }
        var best = Math.min(...totals);
        return BotAI.searchOptions(view).filter((option, index) => totals[index] - best < 1e-9)
            .map(option => ({
                option, score: option == null ? -BotAI.handCost(view.cards) : BotAI.proScore(view, option, samples)
            }))
            .sort((a, b) => b.score - a.score)[0].option;
    }

    // Normal's move, unless rollouts over the sampled hands show clearly better. Small differences are mostly
    // sampling noise, and acting on them made Good pass far too often.
    static improvedMove(view, moves, samples) {
        var normal = BotAI.chooseMove(view, "good");
        var options = moves.map(move => ({ move, score: BotAI.basicScore(view, move) }))
            .sort((a, b) => b.score - a.score).slice(0, BotAI.proRollouts.finalists).map(entry => entry.move);
        if (view.top != null) { options.push(null); }
        var isNormal = move => normal == null ? move == null :
            move != null && move.length == normal.length && move[0].strengthRank == normal[0].strengthRank;
        if (!options.some(isNormal)) { options.push(normal); }
        var rated = options.map(move => ({
            move, value: samples.reduce((sum, hands) =>
                sum + BotAI.rollout(view, move, hands, BotAI.proRollouts.marginWeight), 0) / samples.length
        }));
        var base = rated.find(entry => isNormal(entry.move));
        var best = rated.reduce((a, b) => b.value > a.value ? b : a);
        return best.value - base.value >= BotAI.proRollouts.margin ? best.move : normal;
    }

    static chooseMove(view, skill = "good", random = Math.random) {
        skill = BotAI.skill(skill);
        var moves = BotAI.moves(view);
        if (moves.length == 0) { return null; }
        var winning = moves.find(move => move.length == view.cards.length && move[0].strengthRank != 16);
        if (winning != null) { return winning; }
        var clubThree = moves.find(move => BotAI.clubThreeWins(view, move));
        if (clubThree != null) { return clubThree; }
        // Skipping the only opponent hands the turn back on your own cards; only then is it a free play.
        if (view.top != null && view.top.own && !(view.rules || {}).sameRankSkip) { return null; }
        // Counting played cards is what separates Good from Normal.
        var certain = skill == "good" ? null : BotAI.certainMove(view, moves);
        if (certain != null) { return certain; }
        if (skill == "god") {
            if (view.opponents.some(other => !Array.isArray(other.cards) || other.cards.length != other.count)) {
                throw new Error("Gud-nivået krever motspillernes faktiske kort.");
            }
            var hands = view.opponents.map(other => other.cards);
            var solved = BotAI.searchedMove(view, [hands], BotAI.searchLimits.god);
            if (solved !== undefined) { return solved; }
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
        if (skill == "pro") {
            var samples = BotAI.samples(view, random);
            var searched = BotAI.searchedMove(view, samples.slice(0, BotAI.searchLimits.pro.samples), BotAI.searchLimits.pro);
            if (searched !== undefined) { return searched; }
            return BotAI.improvedMove(view, moves, samples.slice(0, BotAI.proRollouts.samples));
        }
        var best = moves.map(move => ({ move, score: BotAI.basicScore(view, move) }))
            .sort((a, b) => b.score - a.score)[0];
        if (view.top != null && !view.opponents.some(other => other.count <= 2) &&
            best.score < -BotAI.handCost(view.cards) - BotAI.passMargin) { return null; }
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
    static sneakyTradeChance(skill) {
        return { good: 0.18, pro: 0.32, god: 0.48 }[BotAI.skill(skill)];
    }

    static chooseSneakyConsent(player, random = Math.random) {
        return random() < BotAI.sneakyTradeChance(player.botSkill);
    }

    static chooseOptionalTrade(game, player, offer, random = Math.random) {
        var seat = game.players.indexOf(player);
        if (game.status != "G" || !isSevenJackTradeEnabled(game) ||
            offer.kind != "playerTrade" || offer.mode != "Tilbud" ||
            seat < 0 || (seat != offer.from && seat != offer.to)) { return "skip"; }
        var skill = BotAI.skill(player.botSkill || "good");
        var available = BotAI.tradeCards(game, player, offer);
        if (available.length == 0) { return "skip"; }
        var sneakyChance = BotAI.sneakyTradeChance(skill);
        var normalChance = { good: 0.65, pro: 0.82, god: 0.96 }[skill];
        var roll = random();
        if (roll < sneakyChance) { return "sneaky"; }
        if (seat != offer.from || roll >= normalChance) { return "skip"; }
        var legal = available.filter(card => card.strengthRank >= 7 && card.strengthRank <= 11);
        if (legal.length == 0) { return "skip"; }
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
