// Local-only translations. Norwegian (the source language) is the key, English is looked up per client.
(function () {
    var STORAGE_KEY = "norwegian-tycoon-language";
    var LANGUAGES = ["no", "en"];

    var EN = Object.assign({}, window.I18N_EN || {}, {
        // Static page text
        "Innstillinger": "Settings",
        "Åpne spillmeny": "Open game menu",
        "Hovedmeny": "Main menu",
        "Boms og President": "Norwegian Tycoon",
        "Lag nytt spill": "Create new game",
        "Koble til spill med kode": "Join a game with a code",
        "Koble til med kode": "Join with code",
        "Spillkontroller": "Game controls",
        "Inviter andre": "Invite others",
        "Del invitasjon": "Share invitation",
        "Gå til hovedmenyen": "Go to the main menu",
        "Bytt navn i spillet": "Change your name in the game",
        "Bytt spillernavn": "Change player name",
        "Bytt navn": "Change name",
        "Regler": "Rules",
        "Vis regler": "Show rules",
        "Vis spillogg": "Show game log",
        "Logg": "Log",
        "Spillhandlinger": "Game actions",
        "Legg til bot": "Add bot",
        "Legg til bot (ikke tillatt nå)": "Add bot (not allowed now)",
        "Bot utilgjengelig": "Bot unavailable",
        "Start spill": "Start game",
        "Start spill (ikke tillatt nå)": "Start game (not allowed now)",
        "Start spill utilgjengelig": "Start game unavailable",
        "Bli en spiller": "Become a player",
        "Bli med som spiller": "Join as a player",
        "Avslutt spill og gå til hovedmeny": "Leave the game and go to the main menu",
        "Forlat spillet og gå til hovedmenyen": "Leave the game and go to the main menu",
        "Resultater for alle rundene": "Results for all rounds",
        "Resultater": "Results",
        "Trykk for å kopiere spill-ID": "Tap to copy the game ID",
        "Pass": "Pass",
        "Pass (ikke tillatt nå)": "Pass (not allowed now)",
        "Pass utilgjengelig": "Pass unavailable",
        "Legg ut valgte kort": "Play selected cards",
        "Bytter...": "Exchanging...",
        "Start frivillig bytte": "Start optional exchange",
        "Sneaky bytte": "Sneaky exchange",
        "Trekk sneaky-samtykke": "Withdraw sneaky consent",
        "Velkommen til": "Welcome to",
        "Det er enkelt å invitere venner til spillet:": "Inviting friends to the game is easy:",
        "- Trykk på «Del invitasjon», og del invitasjonen eller kopier lenken.": "- Tap “Share invitation”, then share the invitation or copy the link.",
        "- Du kan også sende spillnummeret som står øverst på skjermen.": "- You can also send the game number shown at the top of the screen.",
        "Når vennene dine er inne, vil alle se det samme og dere kan spille sammen.": "Once your friends are in, everyone sees the same thing and you can play together.",
        "Neste tips": "Next tip",
        "Vil du spille på denne enheten, trykk på «Bli med som spiller» og velg spillernavn.": "To play on this device, tap “Join as a player” and choose a player name.",
        "Hvis du ikke spiller på denne enheten, kan den ligge på bordet og vise kortene dere legger ut.": "If you are not playing on this device, it can lie on the table and show the cards you play.",
        "Du kan legge til én eller flere boter med «Legg til bot».": "You can add one or more bots with “Add bot”.",
        "Når det er to eller flere spillere, kan dere starte med «Start spill».": "When there are two or more players, you can begin with “Start game”.",
        "Lukk tips": "Close tip",
        "Trykk på et kort for å velge det; like kort velges sammen. Sveip sidelengs for å bla i hånden. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.": "Tap a card to select it; cards of the same value are selected together. Swipe sideways to scroll your hand. Drag or flick the selection up to play it, or press Enter.",
        "Spill-ID": "Game ID",
        "Mørk modus": "Dark mode",
        "Bytt mellom mørkt og lyst tema": "Switch between dark and light theme",
        "Mørk modus. Bytt til lys modus": "Dark mode. Switch to light mode",
        "Lys modus. Bytt til mørk modus": "Light mode. Switch to dark mode",
        "Bytt til lys modus": "Switch to light mode",
        "Bytt til mørk modus": "Switch to dark mode",
        "Auto-forslag": "Auto-suggest",
        "Velger laveste lovlige kort for deg når det er din tur": "Selects the lowest legal cards for you on your turn",
        "Automatisk kortforslag er på": "Automatic card suggestion is on",
        "Automatisk kortforslag er av": "Automatic card suggestion is off",
        "Slå av automatisk kortforslag": "Turn off automatic card suggestion",
        "Slå på automatisk kortforslag": "Turn on automatic card suggestion",
        "Spillhastighet": "Game speed",
        "Meldingsvarighet": "Message duration",
        "Frivillige bytter:": "Optional exchanges:",
        "Botter kan delta i de frivillige byttene med tre spillere. Ved sneaky bytte får også botter se motspillerens kort for å velge byttekort.": "Bots can take part in optional exchanges with three players. During sneaky exchanges, bots can also see the opponent's cards to choose their outgoing card.",
        "Fortsett spillet": "Resume game",
        "Kobler til igjen …": "Reconnecting …",
        "Bot spiller for deg": "Bot is playing for you",
        "Bot spiller": "Bot is playing",
        "Utsett 120 sekunder": "Extend by 120 seconds",
        "Utsett +120 s": "Extend +120 s",
        "+120 s": "+120 s",
        "Ta tilbake plassen": "Take back your seat",
        "Du har ikke lenger en plass i dette spillet.": "You no longer have a seat in this game.",
        "Spillet finnes ikke lenger.": "The game no longer exists.",
        "Kunne ikke koble til spillet. Prøv igjen.": "Could not connect to the game. Try again.",
        "Du kan ikke avslå dette byttet.": "You cannot decline this exchange.",
        "Handlingen er ikke lenger tilgjengelig.": "This action is no longer available.",
        "Kunne ikke registrere tilkoblingen. Prøver igjen.": "Could not register the connection. Retrying.",
        "Kunne ikke oppdatere spillerstatus. Prøver igjen.": "Could not update player status. Retrying.",
        "Kunne ikke oppdatere tidsfristen. Prøv igjen.": "Could not update the deadline. Try again.",
        "Du har 120 sekunder per trekk og kan utsette én gang per runde med 120 sekunder. Ved tidsavbrudd eller 120 sekunders frakobling overtar en bot. Trykk «Ta tilbake plassen» når du er tilbake. En frakoblet vert erstattes etter 240 sekunder.": "You have 120 seconds per turn and may extend once per round by 120 seconds. After a timeout or 120 seconds disconnected, a bot takes over. Press “Take back your seat” when you return. A disconnected host is replaced after 240 seconds.",
        "Sneaky-samtykke nådd. Byttet starter med alle kort.": "Sneaky consent reached. The trade starts with all cards allowed.",
        "Sneaky-samtykke ikke nådd. Byttet starter med kort 7–J.": "Sneaky consent not reached. The trade starts with cards 7–J.",
        "Vanlig bytte: kort 7–J.": "Normal trade: cards 7–J.",
        "Hvor lenge meldinger vises": "How long messages are shown",
        "Rask": "Fast",
        "Vanlig": "Normal",
        "Sakte": "Slow",
        "Språk": "Language",
        "Kortstil": "Card style",
        "Bare for dine egne kort": "Only for your own cards",
        "Holo": "Holo",
        "Gull": "Gold",
        "Velg kortstil": "Choose card style",
        "Pixel Art": "Pixel Art",
        "Parallax": "Parallax",
        "Neon": "Neon",
        "Grønn tåke": "Green haze",
        "Velg språk for spillet": "Choose the game language",
        "Lukk": "Close",
        "Offentlig": "Public",
        "Vises i listen over åpne lobbyer": "Shown in the list of open lobbies",
        "Privat": "Private",
        "Bare med spillnummer eller invitasjon": "Only with a game number or invitation",
        "Avbryt": "Cancel",
        "Lag spill": "Create game",
        "Bli med på spill": "Join a game",
        "Skriv inn spillnummeret, eller åpne invitasjonslenken du har fått:": "Enter the game number, or open the invitation link you received:",
        "Delta": "Join",
        "Hva vil du hete?": "What do you want to be called?",
        "Skriv inn navnet ditt i spillet:": "Enter your name in the game:",
        "Bli spiller": "Become player",
        "Inviter andre spillere": "Invite other players",
        "Inviter spiller": "Invite player",
        "Del invitasjonslenken, så åpnes dette rommet direkte.": "Share the invitation link to open this room directly.",
        "Spillnummer:": "Game number:",
        "Del på Messenger": "Share on Messenger",
        "Åpner Messenger. Hvis appen ikke åpnes, bruk «Kopier lenke».": "Opening Messenger. If the app does not open, use “Copy link”.",
        "Messenger-deling støttes ikke her. Kopier lenken og lim den inn i Messenger.": "Messenger sharing is not supported here. Copy the link and paste it into Messenger.",
        "Velg Messenger i delingsmenyen.": "Choose Messenger in the share menu.",
        "Del invitasjonslenken, så åpnes dette rommet direkte. Spillnummer:": "Share the invitation link and this room opens directly. Game number:",
        "Invitasjonslenke": "Invitation link",
        "Kopier lenke": "Copy link",
        "Send på SMS": "Send by SMS",
        "Legg på kort": "Add cards",
        "Velg noe annet å legge på": "Choose something else to play",
        "Du kan ikke legge på det kortet nå.": "You can't play that card now.",
        "Legg på like mange kort med samme eller høyere verdi: singel på singel, par på par, tress på tress og fire like på fire like. Kløver 3 er jokeren og kan legges på alt. Fire like kan slås av høyere fire like; ellers ryddes bunken.": "Play the same number of cards with equal or higher value: single on single, pair on pair, triple on triple and four of a kind on four of a kind. The three of clubs is the joker and can be played on anything. Four of a kind can be beaten by higher four of a kind; otherwise the pile clears.",
        "Mål": "Goal",
        "Bli kvitt kortene først: første blir President, siste Boms.": "Get rid of your cards first: the first becomes President, the last becomes Boms.",
        "Legg ut": "Play cards",
        "Legg samme antall som øverst, med lik eller høyere verdi. Singel, par, tress og fire like må matche.": "Play the same number of cards as the top play, with equal or higher value. Single, pair, triple and four of a kind must match.",
        "Start": "Start",
        "Første runde starter spilleren med Hjerter 3. Etter bytte starter Boms.": "In the first round the player with the three of hearts starts. After the exchange, Boms starts.",
        "Tre spillere": "Three players",
        "Ruter 3 tas ut. Hjerter 3 og Spar 3 sammen øverst rydder bunken.": "The three of diamonds is removed. The three of hearts and the three of spades together on top clear the pile.",
        "Spesialkort": "Special cards",
        "Kløver 3 kan legges på alt og rydder bunken, men taper hvis det er siste kort. Fire like kan slås av høyere fire like; ellers ryddes bunken og spilleren starter igjen.": "The three of clubs can be played on anything and clears the pile, but loses if it is the last card. Four of a kind can be beaten by higher four of a kind; otherwise the pile clears and the player starts again.",
        "Pass er bare mulig når bunken ikke er tom. Når alle andre passer, ryddes bunken; siste spiller starter igjen, eller neste aktive hvis hen er ferdig.": "Passing is only possible when the pile is not empty. When everyone else passes, the pile is cleared; the last player starts again, or the next active player if they are finished.",
        "Lukk regler": "Close rules",
        "Spillogg": "Game log",
        "Antall seiere": "Wins",
        "Poeng": "Points",
        "Lukk resultater": "Close results",
        "Åpne lobbyer": "Open lobbies",
        "Spillversjon": "Game version"
    });

    Object.assign(EN, {
        "Venter på spillere": "Waiting for players",
        "Venter på flere spillere": "Waiting for more players",
        "Slik spiller du": "How to play",
        "Mål:": "Goal:",
        "Legg ut:": "Play:",
        "Kortverdi:": "Card order:",
        "Pass:": "Pass:",
        "Kløver 3:": "Three of clubs:",
        "Fire like:": "Four of a kind:",
        "Start:": "Start:",
        "Kortbytte:": "Card exchange:",
        "Avstemning:": "Voting:",
        "To:": "Two:",
        "Tre:": "Three:",
        "Mellom rundene": "Between rounds",
        "Færre spillere": "Fewer players",
        "Først ferdig: President. Sist: Boms.": "First out: President. Last: Boms.",
        "Match antall og lik/høyere verdi. Tomt bord: singel, par, tress eller fire like.": "Match the count and equal/higher value. Empty table: single, pair, triple or four of a kind.",
        "3–10, knekt, dame, konge, ess, 2. Kløver 3 er høyest.": "3–10, jack, queen, king, ace, 2. The three of clubs is highest.",
        "Kun på ikke-tomt bord. Alle andre passer: rydd bordet; siste utspiller (eller neste aktive) starter.": "Only on a non-empty table. All others pass: clear the table; the last player (or next active player) starts.",
        "Slår alt og rydder. Taper som siste kort.": "Beats anything and clears the table. Loses as your last card.",
        "Rydder hvis ingen aktive motspillere har høyere fire like.": "Clears if no active opponent holds higher four of a kind.",
        "Hjerter 3 først, deretter Boms.": "Three of hearts first, then Boms.",
        "Boms gir to beste; Presidenten gir to valgfrie. Aldri Kløver 3.": "Boms gives two best; President gives any two. Never the three of clubs.",
        "Lobby/neste runde; verten avgjør uavgjort.": "Lobby/next round; the host breaks ties.",
        "Fjern 12 tilfeldige kort. Uten Hjerter 3: tilfeldig start. Treerne uten kløver rydder sammen.": "Remove 12 random cards. No three of hearts: random starter. The non-club threes together clear the table.",
        "Fjern Ruter 3. Hjerter 3 + Spar 3 rydder sammen.": "Remove the three of diamonds. Threes of hearts + spades clear together.",
        "Alle klare før verten starter. Verten styrer bots; neste menneske overtar hvis verten går. Nye spillere erstatter bots i full lobby.": "Everyone ready before the host starts. Host controls bots; next human takes over if the host leaves. New players replace bots in full lobbies.",
        "Maks antall spillere nådd": "Maximum number of players reached",
        "Avstemning pågår": "Voting in progress",
        "Start ny runde": "Start new round",
        "Forlater etter bytte": "Leaving after exchange",
        "Venter": "Waiting",
        "Din tur": "Your turn",
        "Tur": "Turn",
        "Du har tur": "It's your turn",
        "Denne spilleren har tur": "It's this player's turn",
        "Fjern": "Remove",
        "Åpne/Lukk spillmeny": "Open/close game menu",
        "Du": "You",
        "Rundens resultater": "Round results",
        "Du mottok": "You received",
        "Du ble": "You became",
        ". Venter på at de andre skal spille ferdig.": ". Waiting for the others to finish playing.",
        "Visepresident": "Vice President",
        "Viseboms": "Vice Boms",
        "Nøytral": "Neutral",
        "Stokker kortene …": "Shuffling the cards …",
        "Ingen hendelser ennå.": "No events yet.",
        "Spillet pågår. Du ser på til neste runde.": "The game is in progress. You are watching until the next round.",
        "Du begynner": "You start",
        "Oi, oi.. gavepakke!": "Oh, wow.. a gift!",
        "ett kort": "one card",
        "1 kort": "1 card",
        "1 bytte gjenstår": "1 exchange remaining",
        "Valgfrie bytter gjenstår": "Optional exchanges remaining",
        "Venter på at byttene fullføres": "Waiting for the exchanges to finish",
        "Motta kortene som venter": "Receive the waiting cards",
        "ditt beste kort": "your best card",
        "dine beste kort": "your best cards",
        "sitt beste kort": "their best card",
        "sine beste kort": "their best cards",
        "Kortene er valgt automatisk.": "The cards were chosen automatically.",
        "Venter på at byttet fullføres.": "Waiting for the exchange to finish.",
        "Kortene er klare til å mottas.": "The cards are ready to be received.",
        "Begge har samtykket til sneaky bytte.": "Both have agreed to a sneaky exchange.",
        "Trekk sneaky-samtykke": "Withdraw sneaky consent",
        "Sneaky bytte": "Sneaky exchange",
        "Start frivillig bytte": "Start optional exchange",
        "Ingen bytte": "No exchange",
        "Begge spillerne trenger minst ett ledig kort fra 7 til J.": "Both players need at least one free card from 7 to J.",
        "Sneaky bytte: alle kort kan brukes.": "Sneaky exchange: all cards can be used.",
        "Velg hvilket bytte du vil gjøre": "Choose which exchange to make",
        "Trykk på bytteblokken over for å velge mottaker.": "Tap the exchange block above to choose a recipient.",
        "Byttene gjenstår": "Exchanges remaining",
        "Gir sitt dårligste kort til visepresidenten.": "Gives their worst card to the vice president.",
        "Gir sine to dårligste kort til presidenten.": "Gives their two worst cards to the president.",
        "Boms må gi sine to beste kort til Presidenten:": "Boms must give their two best cards to the President:",
        "Presidenten kan starte et tvunget bytte med Nøytral:": "The President can start a forced exchange with Neutral:",
        "Nøytral kan starte et tvunget bytte med Boms:": "Neutral can start a forced exchange with Boms:",
        "Presidenten skal gi bomsen to kort:": "The President must give Boms two cards:",
        "Denne bytteregelen gjelder bare President, Nøytral og Boms i et tre-spillers spill.": "This exchange rule only applies to President, Neutral and Boms in a three-player game.",
        "Begge spillerne må samtykke til sneaky bytte.": "Both players must consent to a sneaky exchange.",
        "Begge spillerne må ha et ledig kort fra 7 til J.": "Both players must have a free card from 7 to J.",
        "Sneaky-samtykke kan ikke endres nå.": "Sneaky consent can't be changed now.",
        "Hva vil dere gjøre videre?": "What do you want to do next?",
        "Gå til lobby": "Go to lobby",
        "Start neste runde": "Start next round",
        "Flertallet valgte lobbyen.": "The majority chose the lobby.",
        "Flertallet valgte neste runde.": "The majority chose the next round.",
        "Flertall regnes av alle menneskespillere. Manglende stemmer teller ikke; uten flertall ved fristen går rommet til lobbyen.": "The majority is counted among all human players. Missing votes don't count; without a majority at the deadline the room goes to the lobby.",
        "Skal neste runde starte med alle Nøytrale?": "Should the next round start with everyone Neutral?",
        "Vanlig plassering": "Normal placement",
        "Alle Nøytrale": "Everyone Neutral",
        "Flertallet valgte at alle starter Nøytrale.": "The majority chose for everyone to start Neutral.",
        "Flertallet valgte vanlig plassering.": "The majority chose normal placement.",
        "Boter stemmer ikke. Manglende stemme teller som vanlig plassering; uavgjort gir Nøytral start.": "Bots don't vote. A missing vote counts as normal placement; a tie gives a Neutral start.",
        "Starter valgt neste steg …": "Starting the chosen next step …",
        "Klargjør avstemning …": "Preparing the vote …",
        "Vert": "Host",
        "1–28 tegn: bokstaver (også japanske), tall, mellomrom, - / og emojier. Like navn får -1, -2 osv.": "1–28 characters: letters (including Japanese), numbers, spaces, - / and emojis. Duplicate names get -1, -2, etc.",
        "Kunne ikke endre spillernavnet. Prøv igjen.": "Could not change the player name. Please try again.",
        "Bare verten kan legge til bots.": "Only the host can add bots.",
        "Kunne ikke legge til spilleren. Prøv igjen.": "Could not add the player. Please try again.",
        "Plass i lobbyen": "Lobby capacity",
        "Ledig plass": "Empty seat",
        "Menneskespillere erstatter en bot hvis lobbyen er full. Boter erstatter aldri menneskespillere.": "Human players replace a bot if the lobby is full. Bots never replace human players.",
        "Klar": "Ready",
        "Ikke klar": "Not ready",
        "Fjern klar": "Unready",
        "Venter på klare spillere": "Waiting for players to be ready",
        "Bare verten kan starte spillet.": "Only the host can start the game.",
        "Alle menneskespillere må være klare.": "All human players must be ready.",
        "Kan ikke endre klar-status nå.": "Cannot change ready status now.",
        "Kunne ikke lagre klar-status.": "Could not save ready status.",
        "Uavgjort – stem på nytt.": "Tie – vote again.",
        "Bare menneskespillere stemmer. Ved uavgjort stemmer dere på nytt.": "Only human players vote. If tied, vote again.",
        "To spillere": "Two players",
        "12 tilfeldige kort tas ut før utdeling. Hvis Hjerter 3 mangler i første runde, starter en tilfeldig spiller.": "12 random cards are removed before dealing. If the three of hearts is missing in the first round, a random player starts.",
        "1 spiller venter på å bli med...": "1 player is waiting to join...",
        "Kunne ikke registrere deg som ventende spiller.": "Could not register you as a waiting player.",
        "Kan ikke fjerne spilleren nå.": "Cannot remove the player now.",
        "Kan ikke endre navn under spill.": "Cannot change your name during a game.",
        "Bare verten kan fjerne spillere.": "Only the host can remove players.",
        "Kunne ikke fjerne spilleren. Prøv igjen.": "Could not remove the player. Try again.",
        "Lobby": "Lobby",
        "Neste runde": "Next round",
        "Ved uavgjort venter vi på vertens stemme.": "In a tie, we wait for the host's vote.",
        "Etter spillet stemmer dere på lobby eller neste runde. Ved uavgjort avgjør vertens stemme.": "After the game, vote for the lobby or the next round. If tied, the host's vote decides.",
        "Avstemning": "Voting",
        "Hjerter 3, Spar 3 og Ruter 3": "Three of hearts, three of spades and three of diamonds",
        "Hjerter 3, Spar 3 og Ruter 3 sammen øverst rydder bunken.": "The three of hearts, three of spades and three of diamonds together on top clear the pile.",
        "Alle menneskespillere trykker Klar. Verten starter spillet og styrer botene. Når verten forlater rommet, overtar neste menneskespiller.": "All human players press Ready. The host starts the game and controls the bots. When the host leaves the room, the next human player takes over.",
        "Etter spillet stemmer dere på lobby eller neste runde. Ved uavgjort stemmer dere på nytt.": "After the game, vote for the lobby or the next round. If tied, vote again.",
        "Stem på lobby": "Vote for lobby",
        "Stem på neste runde": "Vote for next round",
        "Stemt på lobby": "Voted for lobby",
        "Stemt på neste runde": "Voted for next round",
        "Har ikke stemt": "Has not voted",
        "Lobbyen er spillerrommet før start. Alle blir i rommet. Hovedmenyen er startsiden.": "The lobby is the room before a game starts. Everyone stays in the room. The main menu is the start page.",
        "Du skal gi kort.": "You must give cards.",
        "Det er din tur å legge ut": "It's your turn to play",
        "Klikk for å velge. Trykk Enter eller mellomrom for å legge ut; på mobil kan du flicke kortet opp.": "Click to select. Press Enter or Space to play; on mobile you can flick the card up.",
        "Dette kortet kan ikke spilles nå": "This card can't be played now",
        "Vent litt før neste trekk": "Wait a moment before the next move",
        "Venter i lobby": "Waiting in lobby",
        "Spill pågår": "Game in progress",
        "Bli med i en tilfeldig åpen lobby": "Join a random open lobby",
        "Ingen åpne lobbyer akkurat nå": "No open lobbies right now",
        "Ingen åpne lobbyer akkurat nå.": "No open lobbies right now.",
        "Skriv inn et spill-nummer.": "Enter a game number.",
        "Kunne ikke koble til. Er spill-nummeret riktig?": "Couldn't connect. Is the game number correct?",
        "Kunne ikke koble til. Prøv igjen.": "Couldn't connect. Try again.",
        "Må lage spill før du inviterer.": "You must create a game before inviting.",
        "Kunne ikke kopiere": "Couldn't copy",
        "Navnet kan ha maks 28 tegn.": "The name can have at most 28 characters.",
        "Spillet er ikke tilkoblet.": "The game is not connected.",
        "Spilleren finnes ikke lenger.": "The player no longer exists.",
        "Navnet er allerede i bruk.": "The name is already in use.",
        "Nick er allerede i bruk av annen spiller.": "The nickname is already used by another player.",
        "Lagre navn": "Save name",
        "Vil du avslutte spillet?": "Do you want to leave the game?",
        "Ja, gå til hovedmenyen": "Yes, go to the main menu",
        "Nei, fortsett spillet": "No, continue the game",
        "Vil du forlate runden og gå til hovedmenyen? De andre spillerne fortsetter.": "Do you want to leave the round and go to the main menu? The other players will continue.",
        "Fortsett spillet": "Continue the game",
        "Lenken er kopiert.": "The link was copied.",
        "Kunne ikke kopiere automatisk. Marker og kopier lenken manuelt.": "Couldn't copy automatically. Select and copy the link manually.",
        "Invitasjonen er delt.": "The invitation was shared.",
        "Kunne ikke dele invitasjonen. Prøv «Kopier lenke».": "Couldn't share the invitation. Try “Copy link”.",
        "Bli med i spillet mitt:": "Join my game:",
        "Vent til bunken er ryddet.": "Wait until the pile is cleared.",
        "Spillet har ikke startet.": "The game has not started.",
        "Ikke din tur.": "Not your turn.",
        "Kan ikke legge dette nå!": "Can't play this now!",
        "Kan ikke passe nå.": "Can't pass now.",
        "Kan ikke legge på forskjellige kort.": "Can't play different cards.",
        "Gir opp!": "Giving up!",
        "Kan ikke gi opp nå.": "Can't give up now.",
        "Kan ikke gå til oppsett før spillet er ferdig.": "Can't go to setup before the game is finished.",
        "Ingen nye spillere når spillet pågår.": "No new players while the game is in progress.",
        "Vent til avstemningen er ferdig før du blir med i neste runde.": "Wait until the vote is finished before joining the next round.",
        "Sluttavstemningen må være ferdig før neste runde starter.": "The final vote must be finished before the next round starts.",
        "Kunne ikke fjerne avstemningen om nøytral runde.": "Couldn't remove the neutral round vote.",
        "Spillet må være ferdig før sluttavstemningen starter.": "The game must be finished before the final vote starts.",
        "Kunne ikke fullføre sluttavstemningen.": "Couldn't complete the final vote.",
        "Bare et ferdig spill kan gå tilbake til lobbyen.": "Only a finished game can return to the lobby.",
        "Det er ikke grunnlag for en nøytralrunde-avstemning.": "There is no basis for a neutral round vote.",
        "Kunne ikke starte avstemning om nøytral runde.": "Couldn't start the neutral round vote.",
        "Kunne ikke lagre stemmen om nøytral runde.": "Couldn't save the neutral round vote.",
        "Kunne ikke fullføre avstemning om nøytral runde.": "Couldn't complete the neutral round vote.",
        "Spillere kan ikke fjernes mens sluttavstemningen pågår.": "Players can't be removed while the final vote is in progress.",
        "Skal ikke lage ny spiller når man allerede har en spiller.": "Can't create a new player when you already have one.",
        "Spillet er ikke i bytte-modus.": "The game is not in exchange mode.",
        "Visepresidenten skal gi visebomsen ett kort:": "The Vice President must give the Vice Boms one card:",
        "Visebomsen skal gi visepresidenten sitt beste kort:": "The Vice Boms must give the Vice President their best card:",
        "Bomsen skal gi presidenten sine to beste kort:": "Boms must give the President their two best cards:",
        "Presidenten skal velge to kort til Boms:": "The President must choose two cards for Boms:",
        "Dette byttet er ikke lenger tilgjengelig.": "This exchange is no longer available.",
        "Bare spilleren som kan starte byttet, kan velge Ingen bytte.": "Only the player who can start the exchange can choose No exchange.",
        "Bare deltakerne i byttet kan gi sneaky-samtykke.": "Only the participants in the exchange can give sneaky consent.",
        "Sneaky-samtykke kan ikke trekkes tilbake etter at kort er valgt.": "Sneaky consent can't be withdrawn after cards are chosen.",
        "Feil antall kort som byttes.": "Wrong number of cards to exchange.",
        "Kortene er ikke gyldige for dette byttet.": "The cards are not valid for this exchange.",
        "Datamaskinen har ikke nok gyldige kort til byttet.": "The computer doesn't have enough valid cards for the exchange.",
        "Spilleren finnes ikke i dette spillet.": "The player is not in this game.",
        "Forrige rundes President eller Boms mangler.": "The previous round's President or Boms is missing.",
        "Forrige rundes visepresident eller viseboms mangler.": "The previous round's Vice President or Vice Boms is missing.",
        "Ukjent argument.": "Unknown argument.",
        "Ukent status.": "Unknown status.",
        "Stokker kortene": "Shuffling the cards",
        "Kløver 3": "3 of Clubs",
        "kløver 3": "3 of clubs",
        "Fire like": "Four of a kind",
        "Hjerter 3 og Spar 3": "3 of Hearts and 3 of Spades",
        "Alle spillere sa pass": "All players passed",
        "ingen kort": "no cards",
        "Mørk": "Dark",
        "Lys": "Light",
        "Språk valgt": "Language selected",
        "Neste runde": "Next round"
    });

    var RANKS = {
        ess: "ace", toer: "two", to: "two", treer: "three", tre: "three", firer: "four", fire: "four",
        femmer: "five", fem: "five", sekser: "six", seks: "six", syver: "seven", syv: "seven",
        "åtter": "eight", "åtte": "eight", nier: "nine", ni: "nine", tier: "ten", ti: "ten",
        knekt: "jack", dame: "queen", konge: "king"
    };
    var SUITS = { Spar: "Spades", Hjerter: "Hearts", "Kløver": "Clubs", Ruter: "Diamonds" };
    var FACES = { Ess: "Ace", Knekt: "Jack", Dame: "Queen", Konge: "King" };
    // Placeholders that hold names or numbers are copied unchanged; the rest are translated.
    var LITERAL_PARAM = /^(name\d?|host|n|m|k|id|time)$/;

    // [Norwegian template, English template]. Specific rules come before generic ones.
    var RULE_SOURCE = [
        ["Tid igjen: {n} s", "Time left: {n} s"],
        ["{name} ble frakoblet. En bot overtar.", "{name} disconnected. A bot takes over."],
        ["{name} brukte opp tiden. En bot overtar.", "{name} ran out of time. A bot takes over."],
        ["{n}/{m} plasser fylt", "{n}/{m} seats filled"],
        ["{name} ble President!", "{name} became President!"],
        ["{name} ble Boms!", "{name} became Boms!"],
        ["{name} gikk ut som Nøytral.", "{name} went out as Neutral."],
        ["Alle passet. {name} starter.", "Everyone passed. {name} starts."],
        ["{name}: {x}! Starter igjen.", "{name}: {x}! Starts again."],
        ["{name}: {x}! {name2} starter.", "{name}: {x}! {name2} starts."],
        ["La på {x}, bunken går ut. ({y})", "Played {x}; the pile is cleared. ({y})"],
        ["Bunken gikk ut og ferdig. ({x})", "The pile was cleared and finished. ({x})"],
        ["{name} begynner", "{name} starts"],
        ["{name} er Boms og starter.", "{name} is Boms and starts."],
        ["{name} har passet", "{name} has passed"],
        ["Fjern {name}", "Remove {name}"],
        ["{n} bytter gjenstår", "{n} exchanges remaining"],
        ["Kortbytte før runde {n}", "Card exchange before round {n}"],
        ["{name} velger {x} automatisk til {name2}.", "{name} automatically chooses {x} for {name2}."],
        ["Velg {x} du vil gi til {name}.", "Choose {x} to give to {name}."],
        ["{name} velger {x} til {name2}.", "{name} is choosing {x} for {name2}."],
        ["{name} gir {x} automatisk til {name2}.", "{name} automatically gives {x} to {name2}."],
        ["Du må gi {x} til {name}.", "You must give {x} to {name}."],
        ["{name} må gi {x} til {name2}.", "{name} must give {x} to {name2}."],
        ["{name} har valgt kort automatisk. Venter på {name2}.", "{name} has chosen cards automatically. Waiting for {name2}."],
        ["Kortvalget er bekreftet. Venter på {name}.", "The card choice is confirmed. Waiting for {name}."],
        ["{name} har bekreftet kortvalget.", "{name} has confirmed the card choice."],
        ["{name} mottar kort automatisk fra {name2}.", "{name} automatically receives cards from {name2}."],
        ["Motta {x} fra {name}.", "Receive {x} from {name}."],
        ["Venter på at {name} mottar kort fra {name2}.", "Waiting for {name} to receive cards from {name2}."],
        ["Venter på at {name} mottar kortene.", "Waiting for {name} to receive the cards."],
        ["{name} kan starte et frivillig bytte med {name2}.", "{name} can start a voluntary exchange with {name2}."],
        ["{n} av {m} kort valgt.", "{n} of {m} cards selected."],
        ["Valget er sendt til {name}.", "The choice was sent to {name}."],
        ["Vanlig bytte bruker kort 7–J. Sneaky-samtykke: {n}/2.", "Regular exchange uses cards 7–J. Sneaky consent: {n}/2."],
        ["Vanlig bytte: kort 7–J. Sneaky-samtykke: {n}/2.", "Regular exchange: cards 7–J. Sneaky consent: {n}/2."],
        ["Valgt: til {name}", "Selected: to {name}"],
        ["Velg bytte til {name}", "Choose exchange to {name}"],
        ["Motta fra {name}", "Receive from {name}"],
        ["Dine beste kort til {name}", "Your best cards to {name}"],
        ["Kort til {name} ({n}/{m})", "Cards to {name} ({n}/{m})"],
        ["Velg {n} kort i hånden, eller flick dem opp hit.", "Choose {n} cards in your hand, or flick them up here."],
        ["Bekreft kort til {name}", "Confirm cards to {name}"],
        ["{name} gir ett kort til {name2}:", "{name} gives one card to {name2}:"],
        ["{n} av {m} menneskespillere har stemt.", "{n} of {m} human players have voted."],
        ["{n} av {m} har stemt. {k} sekunder igjen.", "{n} of {m} have voted. {k} seconds left."],
        ["{n} av {m} har stemt.", "{n} of {m} have voted."],
        ["{k} sekunder igjen.", "{k} seconds left."],
        ["{n} kort valgt. Sveip sidelengs for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.", "{n} cards selected. Swipe sideways to scroll. Drag or flick the selection up to play it, or press Enter."],
        ["{n} av {m} kort valgt. Sveip sidelengs for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.", "{n} of {m} cards selected. Swipe sideways to scroll. Drag or flick the selection up to play it, or press Enter."],
        ["{x}, valgt for bytte", "{x}, selected for exchange"],
        ["{x}, velg for bytte", "{x}, select for exchange"],
        ["{x}, kan spilles", "{x}, can be played"],
        ["{x}, kan ikke spilles nå", "{x}, can't be played now"],
        ["{x}, vent før neste trekk", "{x}, wait before the next move"],
        ["På bordet ligger {n} singlekort med verdien {x}.", "There are {n} single cards of value {x} on the table."],
        ["På bordet ligger: {x}", "On the table:\n{x}"],
        ["Du må slå: {x}", "You must beat:\n{x}"],
        ["På bordet ligger {x}.", "On the table: {x}."],
        ["Må legge på samme eller høyere enn {n}.", "Must play the same or higher than {n}."],
        ["Du må ha {n} like kort.", "You must have {n} cards of the same value."],
        ["Spillet har plass til maks {n} spillere.", "The game has room for at most {n} players."],
        ["{n} spillere venter på å bli med...", "{n} players are waiting to join..."],
        ["Kan ikke gi kort når modus er {x} (må være Velg eller Best).", "Can't give cards when the mode is {x} (must be Choose or Best)."],
        ["Kan ikke gi kort når modus er {x} (må være Kan se).", "Can't give cards when the mode is {x} (must be Can see)."],
        ["Innstillinger · Spill-ID {id}", "Settings · Game ID {id}"],
        ["Spill-ID {id} kopiert", "Game ID {id} copied"],
        ["Runde {n} - {time}", "Round {n} - {time}"],
        ["Stikk {n}", "Trick {n}"],
        ["singel {r}", "single {r}"],
        ["par i {r}", "pair of {r+}"],
        ["tress i {r}", "triple {r+}"],
        ["fire like i {r}", "four {r+}"],
        ["{n} kort", "{n} cards"],
        ["{name}: {x}.", "{name}: {x}."]
    ].map(function (pair) {
        var names = [];
        var source = pair[0].split(/(\{\w+\})/).map(function (part) {
            var match = /^\{(\w+)\}$/.exec(part);
            if (match == null) { return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
            names.push(match[1]);
            return /^[nmk]$/.test(match[1]) ? "(\\d+)" : "(.+?)";
        }).join("");
        return { re: new RegExp("^" + source + "$"), names: names, en: pair[1] };
    });

    var language = detectLanguage();
    var SKIP = "script, style, [data-i18n-skip], .player-summary__name, .game-over__name, .game-toast__player";
    var attributeNames = ["title", "aria-label", "placeholder", "alt"];
    var textState = new WeakMap();
    var textNodes = new Set();
    var attributeState = new WeakMap();
    var attributeElements = new Set();
    var titleOriginal = document.title;
    var observer = null;

    function detectLanguage() {
        var stored = null;
        try { stored = localStorage.getItem(STORAGE_KEY); } catch (error) { }
        if (LANGUAGES.indexOf(stored) >= 0) { return stored; }
        var browser = String(navigator.language || "").toLowerCase();
        return /^(nb|nn|no)(-|$)/.test(browser) ? "no" : "en";
    }

    function normalize(text) {
        return String(text).replace(/\s+/g, " ").trim();
    }

    function translateCards(text) {
        return text.replace(/(Spar|Hjerter|Kløver|Ruter) (Ess|Knekt|Dame|Konge|10|[2-9])(?![\wæøå])/g, function (match, suit, rank) {
            return (FACES[rank] || rank) + " of " + SUITS[suit];
        });
    }

    function pluralRank(rank) {
        return /x$/.test(rank) ? rank + "es" : rank + "s";
    }

    function translateCore(key, depth) {
        if (EN[key] != null) { return EN[key]; }
        if (depth < 4) {
            for (var index = 0; index < RULE_SOURCE.length; index++) {
                var rule = RULE_SOURCE[index];
                var match = rule.re.exec(key);
                if (match == null) { continue; }
                var params = {};
                rule.names.forEach(function (name, position) {
                    var value = match[position + 1];
                    if (name == "r") { params[name] = RANKS[value] || value; }
                    else { params[name] = LITERAL_PARAM.test(name) ? value : translateCore(value, depth + 1); }
                });
                return rule.en.replace(/\{(\w+)(\+?)\}/g, function (token, name, plural) {
                    if (params[name] == null) { return token; }
                    return plural ? pluralRank(params[name]) : params[name];
                });
            }
        }
        return translateCards(key);
    }

    function translateText(text) {
        if (language != "en") { return text; }
        var parts = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        if (parts[2] == "") { return text; }
        return parts[1] + translateCore(parts[2].replace(/\s+/g, " "), 0) + parts[3];
    }

    function translate(key, params) {
        var text = translateText(key);
        if (params != null) {
            text = text.replace(/\{(\w+)\}/g, function (match, name) {
                return params[name] != null ? String(params[name]) : match;
            });
        }
        return text;
    }

    function isSkipped(node) {
        var element = node.nodeType == 1 ? node : node.parentElement;
        return element == null || element.closest(SKIP) != null;
    }

    function processText(node) {
        if (isSkipped(node)) { return; }
        var state = textState.get(node);
        var current = node.data;
        if (state != null && current === state.shown) { return; }
        var next = translateText(current);
        textState.set(node, { original: current, shown: next });
        textNodes.add(node);
        if (next !== current) { node.data = next; }
    }

    function processAttributes(element) {
        if (isSkipped(element)) { return; }
        attributeNames.forEach(function (name) {
            if (element.hasAttribute(name)) { processAttribute(element, name); }
        });
    }

    function processAttribute(element, name) {
        if (attributeNames.indexOf(name) < 0 || isSkipped(element)) { return; }
        var states = attributeState.get(element);
        if (states == null) { states = {}; attributeState.set(element, states); }
        var current = element.getAttribute(name);
        if (current == null) { delete states[name]; return; }
        if (states[name] != null && current === states[name].shown) { return; }
        var next = translateText(current);
        states[name] = { original: current, shown: next };
        attributeElements.add(element);
        if (next !== current) { element.setAttribute(name, next); }
    }

    function walk(root) {
        if (root.nodeType == 3) { processText(root); return; }
        if (root.nodeType != 1 || root.matches(SKIP)) { return; }
        processAttributes(root);
        root.childNodes.forEach(walk);
    }

    function onMutations(records) {
        records.forEach(function (record) {
            if (record.type == "characterData") { processText(record.target); }
            else if (record.type == "attributes") { processAttribute(record.target, record.attributeName); }
            else { record.addedNodes.forEach(walk); }
        });
        if (textNodes.size > 4000) {
            textNodes.forEach(function (node) { if (!node.isConnected) { textNodes.delete(node); } });
            attributeElements.forEach(function (element) { if (!element.isConnected) { attributeElements.delete(element); } });
        }
    }

    function revertAll() {
        textNodes.forEach(function (node) {
            var state = textState.get(node);
            if (state != null && node.data === state.shown) { node.data = state.original; }
            textState.delete(node);
        });
        textNodes.clear();
        attributeElements.forEach(function (element) {
            var states = attributeState.get(element) || {};
            Object.keys(states).forEach(function (name) {
                if (element.getAttribute(name) === states[name].shown) { element.setAttribute(name, states[name].original); }
            });
            attributeState.delete(element);
        });
        attributeElements.clear();
    }

    function applyLanguage() {
        document.documentElement.lang = language == "en" ? "en" : "nb";
        if (observer != null) { observer.disconnect(); }
        if (language == "en") {
            document.title = translateText(titleOriginal);
            walk(document.body);
            observer = observer || new MutationObserver(onMutations);
            observer.observe(document.body, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeFilter: attributeNames
            });
        } else {
            revertAll();
            document.title = titleOriginal;
        }
        document.querySelectorAll("img[data-logo]").forEach(function (logo) {
            logo.setAttribute("src", language == "en" ? "icons/logo-en.svg" : "icons/logo.svg");
        });
        document.querySelectorAll(".language-option[data-lang]").forEach(function (button) {
            button.setAttribute("aria-pressed", String(button.dataset.lang == language));
        });
    }

    function setLanguage(next) {
        if (LANGUAGES.indexOf(next) < 0 || next == language) { return; }
        language = next;
        try { localStorage.setItem(STORAGE_KEY, next); } catch (error) { }
        applyLanguage();
        document.dispatchEvent(new CustomEvent("languagechange"));
    }

    document.querySelectorAll(".language-option[data-lang]").forEach(function (button) {
        button.addEventListener("click", function () { setLanguage(button.dataset.lang); });
    });

    function extend(dictionary) {
        Object.assign(EN, dictionary);
    }

    window.t = translate;
    window.I18n = {
        t: translate,
        msg: translateText,
        extend: extend,
        getLanguage: function () { return language; },
        setLanguage: setLanguage,
        isEnglish: function () { return language == "en"; }
    };

    applyLanguage();
})();
