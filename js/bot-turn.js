function playBotTurn(game, player, random = Math.random) {
    if (game.status == "S" && game.isTurnPaused()) { return; }
    if (game.status == "G") {
        game.piles.slice().filter(exchange =>
            exchange.mode == "Kan se" && game.players[exchange.to] == player
        ).forEach(exchange => {
            game.receiveExchangeCards(exchange);
        });
        if (game.status == "G") {
            var seat = game.players.indexOf(player);
            game.piles.slice().filter(exchange =>
                exchange.mode == "Tilbud" && (exchange.from == seat || exchange.to == seat)
            ).forEach(exchange => {
                if (!game.piles.includes(exchange) || exchange.mode != "Tilbud") { return; }
                if (!exchange.botDecisions) { exchange.botDecisions = {}; }
                var decision = exchange.botDecisions[seat];
                if (!decision) {
                    decision = BotAI.chooseOptionalTrade(game, player, exchange, random);
                    exchange.botDecisions[seat] = decision;
                    game.save();
                }
                if (decision == "sneaky" && !(exchange.sneakyVotes || []).includes(seat)) {
                    game.toggleSneakyTrade(exchange, seat);
                    if (!game.piles.includes(exchange)) { return; }
                }
                if (exchange.from != seat) { return; }
                if ((decision == "sneaky" && hasSneakyConsent(exchange)) ||
                    (decision == "normal" && hasLegalTradeCard(game, exchange.from, exchange) &&
                        hasLegalTradeCard(game, exchange.to, exchange))) {
                    game.startOptionalTrade(exchange);
                } else if (decision == "skip" || decision == "normal" ||
                    exchange.botDecisions[exchange.to] == "skip") {
                    game.skipOptionalTrade(exchange, seat);
                }
            });
        }
        if (game.status == "G") {
            game.piles.slice().filter(exchange =>
                exchange.kind == "playerTrade" && exchange.mode == "Velg" &&
                GamePresence.isBot(game, game.players[exchange.from]) &&
                !exchange.sneakyLocked
            ).forEach(exchange => {
                var participants = game.piles.filter(candidate =>
                    candidate.tradeId == exchange.tradeId
                );
                if (participants.some(candidate =>
                    candidate.sneakyLocked || (candidate.cards || []).length > 0
                )) { return; }
                var botSeat = exchange.from;
                var decisionKey = `sneaky:${botSeat}`;
                var decision = exchange.botDecisions && exchange.botDecisions[decisionKey];
                if (decision == null) {
                    decision = BotAI.chooseSneakyConsent(game.players[botSeat], random)
                        ? "sneaky"
                        : "skip";
                    participants.forEach(candidate => {
                        if (!candidate.botDecisions) { candidate.botDecisions = {}; }
                        candidate.botDecisions[decisionKey] = decision;
                    });
                    game.save();
                }
                if (decision == "sneaky" &&
                    !(exchange.sneakyVotes || []).includes(botSeat)) {
                    game.toggleSneakyTrade(exchange, botSeat);
                }
            });
        }
        if (game.status == "G") {
            game.piles.slice().filter(exchange =>
                exchange.mode == "Velg" && game.players[exchange.from] == player
            ).forEach(exchange => {
                var availableCards = getAvailableExchangeCards(
                    game,
                    game.players.indexOf(player),
                    exchange
                );
                if (exchange.kind == "playerTrade") {
                    availableCards = availableCards.filter(card =>
                        isCardAllowedForExchange(exchange, card)
                    );
                } else {
                    availableCards = availableCards.filter(card => !card.isClubThree());
                }
                exchange.cards = hasSneakyConsent(exchange)
                    ? BotAI.chooseSneakyExchange(game, player, exchange, availableCards, random)
                    : BotAI.chooseExchange(player.cards, availableCards, exchange.count, player.botSkill, random);
                game.giveExchangeCards(exchange);
            });
        }
        if (game.status == "G") {
            game.piles.slice().filter(exchange =>
                exchange.mode == "Best" && game.players[exchange.from] == player
            ).forEach(exchange => {
                game.giveExchangeCards(exchange);
            });
        }
    }
    if (game.status == "S" && player.turn == 1 && player.placement == 0) {
        var cards = BotAI.chooseMove(BotAI.observe(game, player), player.botSkill, random);
        if (cards != null) {
            var pile = new CardPile(player.name);
            cards.forEach(card => pile.push(card));
            game.playCards(player, pile);
        } else {
            game.passTurn(player);
        }
    }
}
