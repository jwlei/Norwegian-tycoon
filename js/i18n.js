// Local-only translations. Norwegian (the source language) is the key, English is looked up per client.
(function () {
    var STORAGE_KEY = "norwegian-tycoon-language";
    var LANGUAGES = ["no", "en"];

    var EN = Object.assign({}, window.I18N_EN || {}, {
        // Static page text
        "Innstillinger": "Settings",
        "Ytelse": "Performance",
        "Bots": "Bots",
        "Tidslinje for meldinger": "Message timer bar",
        "Vis nedtellingslinjen under meldinger.": "Show the countdown bar below messages.",
        "Du blir med i et spill som pågår": "You are joining a game in progress",
        "Du blir med i et spill som pågår. Du venter på plass til neste runde.": "You are joining a game in progress. You are waiting for a seat in the next round.",
        "En spiller har blitt med og venter på plass. Gå til lobbyen for å ta spilleren med.": "A player has joined and is waiting for a seat. Go to the lobby to include them.",
        "Klassisk": "Classic",
        "Klassisk kortbord": "Classic card table",
        "Mørke temaer": "Dark themes",
        "Mellomtoner": "Mid-tones",
        "Lyse temaer": "Light themes",
        "Sandstein": "Sandstone",
        "Salvie": "Sage",
        "Skifer": "Slate",
        "Lavendel": "Lavender",
        "Kortutseende kan bare endres mellom spill.": "Card appearance can only be changed between games.",
        "Kan ikke flytte spillere uten tilkobling.": "Cannot move players while disconnected.",
        "Bare verten kan flytte spillere i en åpen lobby. Prøv igjen.": "Only the host can move players in an open lobby. Please try again.",
        "Dra for å flytte. Bruk piltastene med tastatur.": "Drag to move. Use the arrow keys with a keyboard.",
        "Visuell spillguide": "Visual play guide",
        "Tilbake til reglene": "Back to the rules",
        "1. Bli kvitt kortene": "1. Get rid of your cards",
        "2. Velg og spill": "2. Select and play",
        "3. Pass og nytt bord": "3. Pass and a fresh table",
        "4. Spesialkort": "4. Special cards",
        "5. Plassering og bytte": "5. Ranking and trading",
        "Match antallet kort på bordet og legg lik eller høyere verdi. På tomt bord velger du singel, par, tress eller fire like.": "Match the number of cards on the table and play an equal or higher rank. On an empty table, choose a single, pair, triple or four of a kind.",
        "Trykk på kort for å velge. Sveip sidelengs for å bla i hånden. Dra kortene til bordet, flick opp eller bruk Legg ut.": "Tap cards to select them. Swipe sideways to scroll your hand. Drag cards to the table, flick upward or use Play cards.",
        "Når alle andre passer, ryddes bordet. Siste utspiller starter igjen. Er spilleren ferdig, starter neste aktive spiller i turrekkefølgen.": "When everyone else passes, the table clears. The last player to play leads again. If they have finished, the next active player in turn order leads.",
        "Kløver 3 rydder bordet, men slår ikke fire like og taper hvis det er ditt siste kort. Fire like fra hånden kan slås av høyere fire like. Fire like samlet fra singler eller par rydder bordet.": "The three of clubs clears the table, but cannot beat four of a kind and loses if it is your last card. Four of a kind from the hand can be beaten by a higher four of a kind. Four of a kind built from singles or pairs clears the table.",
        "Første ut blir President, siste blir Boms. Før neste runde byttes kort etter plassering. Se reglene for ditt spillerantall.": "First out becomes President, last becomes Bum. Before the next round, trade cards according to rank. See the rules for your player count.",
        "Behold fremgangen din": "Keep your progress",
        "Gå til Innstillinger → Bytt navn og slå på Bruk PIN for å lagre spiller-IDen din. Bruk samme navn og PIN på andre enheter for å beholde statistikk og opplåsinger.": "Go to Settings → Change name and enable Use PIN to save your player ID. Use the same name and PIN on other devices to retain your statistics and unlocks.",
        "Åpne innstillinger": "Open settings",
        "Åpne spillmeny": "Open game menu",
        "Hovedmeny": "Main menu",
        "Boms og President": "Norwegian Tycoon",
        "Lag nytt spill": "Create new game",
        "Koble til spill med kode": "Join a game with a code",
        "Koble til med kode": "Join with code",
        "Hurtigspill med bots": "Quick play with bots",
        "Antall spillere inkludert deg": "Number of players including you",
        "2 spillere": "2 players",
        "3 spillere": "3 players",
        "4 spillere": "4 players",
        "Start hurtigspill": "Start quick play",
        "Spiller": "Player",
        "Kunne ikke starte hurtigspill. Prøv igjen.": "Could not start quick play. Try again.",
        "Spillkontroller": "Game controls",
        "Inviter andre": "Invite others",
        "Del invitasjon": "Share invitation",
        "Gå til hovedmenyen": "Go to the main menu",
        "Bytt navn i spillet": "Change your name in the game",
        "Bytt spillernavn": "Change player name",
        "Bytt navn": "Change name",
        "Bruk PIN": "Use PIN",
        "PIN (6 sifre)": "PIN (6 digits)",
        "Nettleseren gir ikke tilgang til Web Crypto. Åpne https://playboms.eu direkte i en oppdatert nettleser og prøv igjen.": "The browser does not provide Web Crypto access. Open https://playboms.eu directly in an up-to-date browser and try again.",
        "Ikke gjenbruk en viktig PIN fra andre steder, dette er enkel spillgjenoppretting.": "Do not reuse an important PIN from elsewhere, this is simple game recovery.",
        "Bruk PIN for å hente tilbake opplåsinger og statistikk.": "Use PIN to restore your unlocks and statistics.",
        "Uten PIN lagres profilen på denne enheten. Flere spillere kan bruke samme navn.": "Without a PIN, your profile stays on this device. Multiple players can use the same name.",
        "Bruk navn og PIN for å hente profilen på en annen enhet.": "Use your name and PIN to restore your profile on another device.",
        "PIN må ha 6 sifre. Eldre PIN kan fortsatt brukes til gjenoppretting.": "The PIN must have 6 digits. Older PINs can still be used for recovery.",
        "Nye PIN må ha 6 sifre. Eldre PIN virker bare for eksisterende profiler.": "New PINs must have 6 digits. Older PINs only work for existing profiles.",
        "Ugyldig lagret PIN-profil. Logg inn med navn og PIN på nytt.": "Invalid saved PIN profile. Sign in with your name and PIN again.",
        "Navnet og PIN tilhører en annen spiller-ID. Velg et annet navn.": "This name and PIN belong to another player ID. Choose another name.",
        "Navnet har en eldre PIN-profil. Skriv inn PIN for å registrere navnebyttet.": "This name has an older PIN profile. Enter your PIN to register the name change.",
        "Velg et eget spillernavn før du bruker PIN.": "Choose a custom player name before using a PIN.",
        "Profilen ble endret samtidig. Prøv igjen.": "The profile changed at the same time. Please try again.",
        "Kunne ikke opprette en unik spiller-ID. Prøv igjen.": "Could not create a unique player ID. Please try again.",
        "Flere gamle profiler har dette navnet. Bruk enheten du spilte med, eller kontakt administrator.": "Several old profiles have this name. Use your original device or contact the administrator.",
        "Dette navnet tilhører en annen spiller-ID. Gå til hovedmenyen før du henter profilen.": "This name belongs to another player ID. Go to the main menu before restoring the profile.",
        "Spillet ble endret. Åpne navnevalget på nytt.": "The game changed. Open the name dialog again.",
        "Lobbyen ble endret. Opprett et nytt spill fra hovedmenyen.": "The lobby changed. Create a new game from the main menu.",
        "Henter seire…": "Loading wins…",
        "Henter runder…": "Loading rounds…",
        "Kunne ikke hente runder. Åpne menyen igjen for å prøve på nytt.": "Could not load rounds. Reopen the menu to retry.",
        "Henter leaderboard…": "Loading leaderboard…",
        "Sekstegns-ID utilgjengelig": "Six-character ID unavailable",
        "Ingen registrerte runder ennå.": "No rounds recorded yet.",
        "Kunne ikke hente leaderboard. Lukk og åpne igjen for å prøve på nytt.": "Could not load the leaderboard. Close and reopen it to retry.",
        "Sorterbart leaderboard": "Sortable leaderboard",
        "Runder": "Rounds",
        "Score": "Score",
        "Antall runder spilt": "Rounds played",
        "Antall ganger president": "Times president",
        "Antall ganger boms": "Times bum",
        "Normalisert plasseringsscore": "Normalized placement score",
        "Lengste presidentrekke": "Longest president streak",
        "Lengste bomsrekke": "Longest bum streak",
        "Kunne ikke hente seire. Åpne menyen igjen for å prøve på nytt.": "Could not load wins. Reopen the menu to try again.",
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
        "Spol frem": "Fast forward",
        "Vanlig avspilling": "Normal playback",
        "Pass (ikke tillatt nå)": "Pass (not allowed now)",
        "Pass utilgjengelig": "Pass unavailable",
        "Legg ut valgte kort": "Play selected cards",
        "Bytter...": "Exchanging...",
        "Start frivillig bytte": "Start optional exchange",
        "Ureglementert bytte": "Unregulated exchange",
        "Ureglementert samtykke": "Unregulated consent",
        "Egne regler": "Custom rules",
        "Ingen egne regler.": "No custom rules.",
        "Endre": "Edit",
        "Endre regler": "Edit rules",
        "Mine regler": "My rules",
        "Dine lagrede regler.": "Your saved rules.",
        "Trykk igjen for nye regler.": "Tap again for new rules.",
        "Endret. Lagre som Mine regler for å bruke dem senere.": "Edited. Save as My rules to use them later.",
        "Du har ikke lagret Mine regler ennå.": "You haven't saved My rules yet.",
        "Lagre som Mine regler": "Save as My rules",
        "Erstatt Mine regler": "Replace My rules",
        "Etter vanlig kortbytte kan hver rolle tvinge rollen rett under til å bytte ett kort fra 7 til knekt.": "After the regular card exchange, each role may force the role directly below to trade one card from 7 to J.",
        "Etter vanlig kortbytte kan hver rolle, fra Presidenten og nedover, tvinge rollen rett under til å bytte ett kort fra 7 til knekt. Mottakeren kan ikke avslå.": "After the regular card exchange, each role from the President down may force the role directly below to trade one card from 7 to J. The receiver can't refuse.",
        "Trykk på en regel for å lese mer.": "Tap a rule to read more.",
        "Egne regler i dette spillet": "Custom rules in this game",
        "Forhåndsvalg": "Preset",
        "Tilfeldig": "Random",
        "Lagret. Brukes i alle lobbyer du lager.": "Saved. Available in every lobby you host.",
        "Lagre": "Save",
        "Bli med": "Join",
        "Spill": "Play",
        "Bytte": "Trade",
        "Avslutning": "Finishing",
        "1 egen regel": "1 custom rule",
        "Alt annet følger standardreglene. Verten kan endre reglene før spillet starter.": "Everything else follows the standard rules. The host can change the rules before the game starts.",
        "Bare verten kan endre reglene.": "Only the host can change the rules.",
        "Reglene kan bare endres i lobbyen.": "The rules can only be changed in the lobby.",
        "Tilleggsbytte": "Extra exchange",
        "Tilleggsbytte:": "Extra exchange:",
        "Ureglementert": "Unregulated",
        "Ureglementert:": "Unregulated:",
        "Samtykker begge i et tilleggsbytte, kan alle kort byttes.": "If both players in an extra exchange agree, any card can be traded.",
        "Den som tvinger et tilleggsbytte, kan krysse av for ureglementert samtykke, og mottakeren kan godta med ureglementert samtykke. Samtykker begge, kan alle kort byttes, ikke bare 7 til knekt. Botter ser motspillerens kort når de velger hva de gir.": "The player who forces an extra exchange can tick unregulated consent, and the receiver can accept with unregulated consent. If both agree, any card can be traded, not just 7 to J. Bots see the other player's cards when choosing what to give.",
        "Like kort hopper over": "Equal cards skip",
        "Like kort hopper over:": "Equal cards skip:",
        "Velg én": "Choose one",
        "Velg én av disse": "Choose one of these",
        "Legger du samme verdi som ligger øverst, må neste spiller stå over.": "Play the same value as the top of the pile and the next player must sit out.",
        "Legger du samme verdi som ligger øverst, må neste spiller stå over. Det hopper over én spiller uansett hvor mange kort du legger. Er dere bare to igjen, får du turen på nytt.": "Play the same value as the top of the pile and the next player must sit out. It skips one player however many cards you play. With only two of you left, you get the turn again.",
        "Bare høyere valør": "Higher value only",
        "Bare høyere valør:": "Higher value only:",
        "Du må legge høyere verdi enn det som ligger øverst.": "You must play a higher value than the top of the pile.",
        "Du må legge høyere verdi enn det som ligger øverst, så lik verdi er ikke lov. Fire like kan derfor ikke bygges opp på bordet.": "You must play a higher value than the top of the pile, so equal values aren't allowed. Four of a kind therefore can't be built up on the table.",
        "Fire like rydder alltid": "Four of a kind always clears",
        "Fire like rydder alltid:": "Four of a kind always clears:",
        "Fire like fra hånden rydder bunken og kan ikke slås.": "Four of a kind from hand clears the pile and can't be beaten.",
        "Fire like fra hånden rydder bunken med en gang og kan ikke slås, verken av høyere fire like eller av kløver 3.": "Four of a kind from hand clears the pile at once and can't be beaten, either by a higher four of a kind or by the three of clubs.",
        "Åpent pass": "Open pass",
        "Åpent pass:": "Open pass:",
        "Når noen legger nye kort, kan de som har passet spille igjen.": "When someone plays new cards, players who passed can play again.",
        "Pass gjelder bare kortene som ligger øverst. Når noen legger nye kort, kan de som har passet spille igjen. Bunken ryddes når alle andre har passet på de samme kortene.": "A pass only applies to the cards on top. When someone plays new cards, players who passed can play again. The pile clears when everyone else has passed on the same cards.",
        "Toer som kuppkort": "Clearing two",
        "Toer som kuppkort:": "Clearing two:",
        "En enkelt toer kan legges på alt unntatt fire like, og rydder bunken.": "A single two can be played on anything except four of a kind, and clears the pile.",
        "En enkelt toer kan legges på alt unntatt fire like, og rydder bunken. Flere toere følger vanlige regler og rydder ikke.": "A single two can be played on anything except four of a kind, and clears the pile. Several twos follow the normal rules and don't clear.",
        "Tier brenner bunken": "Ten burns the pile",
        "Tier brenner bunken:": "Ten burns the pile:",
        "Tiere legges etter vanlige regler og rydder bunken.": "Tens are played by the normal rules and clear the pile.",
        "Tiere legges etter vanlige regler, med riktig antall og på lik eller lavere verdi. Da rydder de bunken.": "Tens are played by the normal rules, with the right count and on an equal or lower value. They then clear the pile.",
        "Niere snur retningen": "Nines reverse direction",
        "Niere snur retningen:": "Nines reverse direction:",
        "Hver gang noen legger niere, snur spillretningen ut runden.": "Each time someone plays nines, the direction of play reverses for the rest of the round.",
        "Hver gang noen legger en eller flere niere, snur spillretningen. Den gjelder ut runden eller til neste nier, og neste runde starter i vanlig retning.": "Each time someone plays one or more nines, the direction of play reverses. It lasts for the rest of the round or until the next nine, and the next round starts in the normal direction.",
        "Kløver 3 slår fire like": "Three of clubs beats four of a kind",
        "Kløver 3 slår fire like:": "Three of clubs beats four of a kind:",
        "Kløver 3 kan også rydde fire like fra hånden.": "The three of clubs can also clear four of a kind from hand.",
        "Kløver 3 kan også legges på fire like fra hånden, og rydder bunken.": "The three of clubs can also be played on four of a kind from hand, and clears the pile.",
        "Kløver 3 må gis bort": "Three of clubs must be given",
        "Kløver 3 må gis bort:": "Three of clubs must be given:",
        "Har Boms eller Viseboms kløver 3, regnes den som beste kort og må gis oppover.": "If the Bum or Vice Bum holds the three of clubs, it counts as their best card and must be handed up.",
        "Kløver 3 er ikke unntatt fra kortbyttet. Har Boms eller Viseboms den, regnes den som beste kort og må gis til Presidenten eller Visepresidenten.": "The three of clubs isn't exempt from the card exchange. If the Bum or Vice Bum holds it, it counts as their best card and must be given to the President or Vice President.",
        "Bytt ett kort": "Trade one card",
        "Bytt ett kort:": "Trade one card:",
        "President og Boms bytter ett kort i stedet for to.": "The President and Bum trade one card instead of two.",
        "President og Boms bytter ett kort i stedet for to. Med to spillere er ett kort allerede standard. Visepresident og Viseboms bytter fortsatt ett kort.": "The President and Bum trade one card instead of two. With two players, one card is already the standard. The Vice President and Vice Bum still trade one card.",
        "Bytt tre kort": "Trade three cards",
        "Bytt tre kort:": "Trade three cards:",
        "President og Boms bytter tre kort i stedet for to.": "The President and Bum trade three cards instead of two.",
        "President og Boms bytter tre kort. Visepresident og Viseboms bytter fortsatt ett kort.": "The President and Bum trade three cards. The Vice President and Vice Bum still trade one card.",
        "Presidenten starter": "The President starts",
        "Presidenten starter:": "The President starts:",
        "Presidenten åpner nye runder i stedet for Boms.": "The President opens new rounds instead of the Bum.",
        "Etter kortbyttet er det Presidenten som åpner runden i stedet for Boms.": "After the card exchange, the President opens the round instead of the Bum.",
        "Maktfall": "Downfall",
        "Maktfall:": "Downfall:",
        "Går en annen enn Presidenten ut først, er Presidenten straks ute og havner nederst.": "If anyone but the President goes out first, the President is out at once and finishes at the bottom.",
        "Går en annen enn forrige rundes President ut først, er Presidenten straks ute og havner på den dårligste ledige plassen. Regelen har ingen virkning i første runde eller med to spillere.": "If anyone but last round's President goes out first, the President is out at once and takes the worst free place. The rule has no effect in the first round or with two players.",
        "Spillretningen snus!": "The direction of play reverses!",
        "Toer": "Two",
        "Tier": "Ten",
        "Skal gi ett kort til bomsen.": "Must give one card to the Bum.",
        "Skal gi tre kort til bomsen.": "Must give three cards to the Bum.",
        "Gir sitt beste kort til presidenten.": "Gives their best card to the President.",
        "Gir sine tre beste kort til presidenten.": "Gives their three best cards to the President.",
        "Presidenten skal gi bomsen ett kort:": "The President must give Bum one card:",
        "Presidenten skal gi bomsen tre kort:": "The President must give Bum three cards:",
        "Bomsen skal gi presidenten sitt beste kort:": "Bum must give the President their best card:",
        "Bomsen skal gi presidenten sine tre beste kort:": "Bum must give the President their three best cards:",
        "Presidenten skal velge tre kort til Boms:": "The President must choose three cards for Bum:",
        "Boms må gi sine tre beste kort til Presidenten:": "Bum must give their three best cards to the President:",
        "Godta bytte": "Accept exchange",
        "Godta med ureglementert samtykke": "Accept with unregulated consent",
        "Vanlig bytte": "Normal exchange",
        "Trekk ureglementert samtykke": "Withdraw unregulated consent",
        "Ureglementert bytte: alle kort kan brukes.": "Unregulated exchange: all cards can be used.",
        "Vent til mottatte kort er bekreftet.": "Wait until the received cards have been acknowledged.",
        "Venter på mottakerens valg av bytte.": "Waiting for the recipient's exchange choice.",
        "Dette byttevalget er ikke lenger tilgjengelig.": "This exchange choice is no longer available.",
        "Ureglementert bytte er ikke tilgjengelig i dette spillet.": "Unregulated exchanges are not available in this game.",
        "Ureglementert samtykke kan ikke endres nå.": "Unregulated consent cannot be changed now.",
        "Bare deltakerne i byttet kan gi ureglementert samtykke.": "Only exchange participants can give unregulated consent.",
        "Ureglementert samtykke kan ikke endres etter at kort er valgt.": "Unregulated consent cannot be changed after cards have been selected.",
        "Vanlig bytte: kort 7–J.": "Normal exchange: cards 7–J.",
        "Venter på at spillerne bekrefter mottatte kort …": "Waiting for players to acknowledge their received cards …",
        "Trekk sneaky-samtykke": "Withdraw unregulated consent",
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
        "Trykk på et kort for å velge det; like kort velges sammen. Trykk på et valgt sett for å beholde bare kortet du trykker på, og legg til flere kort ett om gangen. Sveip vannrett over kortene for å bla. Dra eller flick opp innenfor en 130-graders vinkel fra berøringspunktet for å løfte kortene. Slipp på bordet eller avslutt med en flick innenfor en 130-graders vinkel oppover for å spille, eller bruk Legg ut eller Enter. Under bytte velger du kort ved å trykke på dem.": "Tap a card to select it; cards of the same value are selected together. Tap a selected group to keep only the card you tap, then add more cards one at a time. Swipe horizontally over the cards to scroll. Drag or flick within a 130-degree upward cone from your touch point to pick up cards. Release on the board or finish with a flick within a 130-degree upward cone to play, or use Play cards or Enter. During exchanges, select cards by tapping them.",
        "Spill-ID": "Game ID",
        "Foreslå trekk": "Suggest move",
        "Auto-pass": "Auto pass",
        "Automatisk pass er på": "Auto pass is on",
        "Automatisk pass er av": "Auto pass is off",
        "Slå av automatisk pass": "Turn off auto pass",
        "Slå på automatisk pass": "Turn on auto pass",
        "Foreslår lovlige kort. Kløver 3 prioriteres når resten av hånden er én kombinasjon.": "Suggests legal cards. Club three takes priority when the rest of your hand is one combination.",
        "Automatisk kortforslag er på": "Automatic card suggestion is on",
        "Automatisk kortforslag er av": "Automatic card suggestion is off",
        "Slå av automatisk kortforslag": "Turn off automatic card suggestion",
        "Slå på automatisk kortforslag": "Turn on automatic card suggestion",
        "Spillhastighet": "Game speed",
        "Viser meldinger på spillbrettet for deg. Hendelser vises alltid i spilloggen.": "Shows board messages for you. Events always appear in the game log.",
        "Animasjonshastighet": "Animation speed",
        "Kortskygger": "Card shadows",
        "Folieanimasjon i hvile": "Idle foil animation",
        "Slå av for bedre ytelse. Folie vises fortsatt på kortene.": "Turn off for better performance. Foil remains visible on cards.",
        "Detaljerte": "Fancy",
        "Enkle": "Simple",
        "Enkle skygger gir bedre ytelse. Kortutseende og bevegelser er uendret.": "Simple shadows improve performance. Card artwork and motion are unchanged.",
        "Varighet på meldinger om spillhendelser": "Duration of game event messages",
        "Rask bruker 50 % kortere tid, Sakte 50 % lengre tid enn Vanlig. Botene venter 1 / 2 / 3 sekunder, og alltid til kortanimasjonene er ferdige. I nettspill bestemmes bottempoet av den som styrer botene.": "Fast takes 50% less time, Slow 50% more time than Normal. Bots wait 1 / 2 / 3 seconds, and always until card animations finish. In online games, bot pace follows the client controlling the bots.",
        "Kunne ikke oppdatere turen. Prøver igjen.": "Could not update the turn. Retrying.",
        "Venter på at handlingen lagres.": "Waiting for the action to be saved.",
        "Kunne ikke lagre handlingen. Henter spillet på nytt.": "Could not save the action. Reloading the game.",
        "Kunne ikke hente spillet. Koble til på nytt.": "Could not reload the game. Please reconnect.",
        "Visning av kortutseende": "Card appearance display",
        "Min stil og folie på alle kort": "My style and foil on all cards",
        "Spillerspesifikke stiler og folier": "Player-specific styles and foils",
        "Bruk valgt stil og folie på alle kort, eller vis andre spilleres valgte stil og folie.": "Use the selected style and foil on all cards, or show each player's chosen style and foil.",
        "Kan ikke lagre kortstilen nå.": "Cannot save the card style right now.",
        "Kunne ikke lagre kortstilen.": "Could not save the card style.",
        "Tving bytte": "Force exchange",
        "Tving bytte:": "Force exchange:",
        "Sneaky?": "Unregulated?",
        "Tving bytte eller velg Ingen bytte": "Force an exchange or choose No exchange",
        "Tiden for å tvinge bytte er ute.": "The time to force an exchange has expired.",
        "Med tre spillere kan President tvinge bytte med Nøytral, og Nøytral med Boms. Boms/President-byttet fullføres først, deretter President/Nøytral og til slutt Nøytral/Boms. Bare den som starter byttet kan velge Ingen bytte; mottakeren kan ikke avslå. Bytt ett kort mellom 7–J, eller alle kortverdier om begge velger Sneaky. Nøytral kan ikke gi kortet fra President videre til Boms, med mindre begge velger Sneaky i det byttet. Hvert tilbud har 120 sekunder, ellers blir det ingen bytte. Botter kan også delta.": "With three players, the President can force an exchange with Neutral, and Neutral with Bum. The Bum/President exchange completes first, followed by President/Neutral and finally Neutral/Bum. Only the initiator can choose No exchange; the recipient cannot decline. Exchange one card from 7–J, or any card rank if both choose Unregulated. Neutral cannot pass the card received from the President on to Bum unless both choose Unregulated in that exchange. Each offer has 120 seconds or there is no exchange. Bots can also participate.",
        "Profil og språk": "Profile and language",
        "Utseende": "Appearance",
        "Spill og styring": "Gameplay and controls",
        "Kortstyring": "Card controls",
        "Flick": "Flick",
        "Flick/Drag": "Flick/Drag",
        "Knapp": "Button",
        "Begge": "Both",
        "Dra kort og slipp på brettet, eller flick dem opp.": "Drag cards and release on the board or flick them up.",
        "Velg kort og bekreft med spillknappen": "Choose cards and confirm with the play button",
        "Kortene reagerer med en gang. Verten velger observasjonspausen for hele rommet, ikke tiden du har til å spille.": "Cards respond immediately. The host chooses the observation pause for the whole room, not your turn time limit.",
        "På PC brukes Legg ut. På mobil kan du velge Flick eller Legg ut.": "Desktop uses the Play button. On mobile you can choose Flick or the Play button.",
        "Velg 1, 2 eller 3 sekunder.": "Choose 1, 2 or 3 seconds.",
        "Bare verten kan endre spillhastigheten.": "Only the host can change the game speed.",
        "Kunne ikke endre spillhastigheten.": "Could not change the game speed.",
        "Klikk for å velge. Trykk Legg ut, Enter eller mellomrom for å spille.": "Click to select. Press Play, Enter or Space to play.",
        "Klikk for å velge. Dra til brettet, flick opp eller trykk Legg ut, Enter eller mellomrom for å spille.": "Click to select. Drag onto the board, flick up or press Play, Enter or Space to play.",
        "Fire like fra singler eller to par rydder bunken og kan ikke slås.": "Four equal cards built from singles or two pairs clear the pile and cannot be beaten.",
        "Fire like lagt samlet kan slås av høyere fire like. Fire like fra singler eller to par rydder bunken og kan ikke slås.": "Four of a kind played together can be beaten by higher four of a kind. Four equal cards built from singles or two pairs clear the pile and cannot be beaten.",
        "Meldinger": "Messages",
        "Maks synlige meldinger": "Max visible messages",
        "Frivillige bytter:": "Optional exchanges:",
        "Botter kan delta i de frivillige byttene med tre spillere. Ved sneaky bytte får også botter se motspillerens kort for å velge byttekort.": "Bots can take part in optional exchanges with three players. During unregulated exchanges, bots can also see the opponent's cards to choose their outgoing card.",
        "Fortsett spillet": "Resume game",
        "Kobler til igjen …": "Reconnecting …",
        "Bot spiller for deg": "Bot is playing for you",
        "Bot spiller": "Bot is playing",
        "Utsett 120 sekunder": "Extend by 120 seconds",
        "Nedtellingen starter først når du kan spille. Pauser mellom trekk, rydding av bunken og stokking bruker ikke av tiden din.": "The countdown only starts when you can play. Pauses between turns, clearing the pile and shuffling do not use your time.",
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
        "Med minst to aktive menneskespillere vises nedtellingen for alle. Du har 120 sekunder per trekk og kan utsette én gang per runde med 120 sekunder. Ved tidsavbrudd eller 120 sekunders frakobling overtar en bot. Trykk «Ta tilbake plassen» når du er tilbake. En frakoblet vert erstattes etter 240 sekunder.": "With at least two active human players, everyone can see the countdown. You have 120 seconds per turn and may extend once per round by 120 seconds. After a timeout or 120 seconds disconnected, a bot takes over. Press “Take back your seat” when you return. A disconnected host is replaced after 240 seconds.",
        "Sneaky-samtykke ikke nådd. Byttet starter med kort 7–J.": "Unregulated consent not reached. The trade starts with cards 7–J.",
        "Vanlig bytte: kort 7–J.": "Normal trade: cards 7–J.",
        "Hvor lenge meldinger vises": "How long messages are shown",
        "Rask": "Fast",
        "Vanlig": "Normal",
        "Sakte": "Slow",
        "Språk": "Language",
        "Kortstil": "Card style",
        "Fargetema": "Color theme",
        "Velg fargetema": "Choose color theme",
        "AMOLED Black": "AMOLED Black",
        "Glød": "Ember",
        "Skumring": "Dusk",
        "Høstløv": "Autumn leaves",
        "Kobolt": "Cobalt",
        "Furu": "Pine",
        "Solarisert": "Solarized",
        "Fjord": "Fjord",
        "Moderne mørk": "Modern dark",
        "Atom": "Atom",
        "Nattugle": "Night owl",
        "Mokka": "Mocha",
        "Vampyr": "Vampire",
        "Synthwave": "Synthwave",
        "Rosé": "Rosé",
        "Høy kontrast": "High contrast",
        "Sol": "Sun",
        "Papir": "Paper",
        "Studio Blå": "Studio blue",
        "Bare for dine egne kort": "Only for your own cards",
        "Holo": "Holo",
        "Folie": "Foil",
        "Velg folie": "Choose foil",
        "Ingen folie": "No foil",
        "Stripet": "Stripes",
        "Stjernestøv": "Stardust",
        "Prisme": "Prism",
        "Bølger": "Waves",
        "Fasetter": "Facets",
        "Ringer": "Rings",
        "Vev": "Weave",
        "Regnbue": "Rainbow",
        "Kontrast": "Contrast",
        "Gullglans": "Gold sheen",
        "Rutenett": "Grid",
        "Fargespill": "Iridescent",
        "Perlemor": "Pearlescent",
        "Stråler": "Rays",
        "Folie legges over kortstilen": "Foil overlays the card style",
        "Dra valgte kort til spillbrettet og slipp for å spille. Flick opp fungerer fortsatt med Flick-styring. Sveip sidelengs på mobil for å bla.": "Drag selected cards onto the board and release to play. Flick up still works with Flick controls. Swipe sideways on mobile to scroll.",
        "Velg Flick eller Legg ut på både PC og mobil.": "Choose Flick or Play on both desktop and mobile.",
        "Dra kort og slipp inne på spillbrettet for å spille. Med Flick-styring kan du også flicke opp i en 130-graders vinkel, uansett hvor du slipper. Sveip på tom plass i hånden for å bla.": "Drag cards and release inside the board to play. With Flick controls, you can also flick within a 130-degree upward cone, regardless of where you release. Swipe on empty space in your hand to scroll.",
        "Gull": "Gold",
        "Velg kortstil": "Choose card style",
        "Pixel Art": "Pixel Art",
        "Parallax": "Parallax",
        "Neon": "Neon",
        "Monochrome": "Monochrome",
        "Minimalistisk": "Minimalist",
        "Cyberpunk": "Cyberpunk",
        "Glitched": "Glitched",
        "Kosmisk": "Cosmic",
        "Origami": "Origami",
        "Gotisk": "Gothic",
        "Sølv": "Silver",
        "Krystall": "Crystal",
        "Klassisk": "Classic",
        "Onyx og gull": "Onyx & Gold",
        "Kjærlighetsbrev": "Love Notes",
        "Kirsebærblomst": "Cherry Blossom",
        "Solformørkelse": "Solar Eclipse",
        "Svart marmor": "Marble Noir",
        "Glassmaleri": "Stained Glass",
        "Trolldomsbok": "Spellbook",
        "Romfarer": "Space Explorer",
        "Månetarot": "Moon Tarot",
        "Ørkenkaravane": "Desert Caravan",
        "Sommerfuglhage": "Butterfly Garden",
        "Stjerneatlas": "Astronomy Atlas",
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
        "Skriv inn navnet ditt, maks 24 tegn": "Enter your name, Max 24 characters",
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
        "Legg på like mange kort med samme eller høyere verdi: singel på singel, par på par, tress på tress og fire like på fire like. Kløver 3 er jokeren og kan legges på alt unntatt fire like. Fire like lagt samlet kan slås av høyere fire like; ellers ryddes bunken.": "Play the same number of cards with equal or higher value: single on single, pair on pair, triple on triple and four of a kind on four of a kind. The three of clubs is the joker and can be played on anything except four of a kind. Four of a kind played together can be beaten by higher four of a kind; otherwise the pile clears.",
        "Kløver 3 kan ikke slå fire like.": "The three of clubs cannot beat four of a kind.",
        "Mål": "Goal",
        "Bli kvitt kortene først: første blir President, siste Boms.": "Get rid of your cards first: the first becomes President, the last becomes Bum.",
        "Legg ut": "Play cards",
        "Legg samme antall som øverst, med lik eller høyere verdi. Singel, par, tress og fire like må matche.": "Play the same number of cards as the top play, with equal or higher value. Single, pair, triple and four of a kind must match.",
        "Start": "Start",
        "Første runde starter spilleren med Hjerter 3. Etter bytte starter Boms.": "In the first round the player with the three of hearts starts. After the exchange, Bum starts.",
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
        "Spill alle kortene dine.": "Play all your cards.",
        "Hvem starter:": "Who starts:",
        "Hjerter 3 starter første runde, eller en tilfeldig spiller med to spillere. Deretter starter Boms.": "The three of hearts starts the first round, or a random player in a two-player game. The Bum starts subsequent rounds.",
        "Kortbytte og spillerantall": "Card exchange and player counts",
        "12 tilfeldige kort fjernes.": "12 random cards are removed.",
        "Ruter 3 fjernes. Hjerter 3 og Spar 3 sammen øverst rydder bordet.": "The three of diamonds is removed. The three of hearts and spades together on top clear the table.",
        "Kortstyrke:": "Card strength:",
        "3–10, knekt, dame, konge, ess, 2.": "3–10, jack, queen, king, ace, 2.",
        "Du kan passe på enhver hånd, også når bordet er tomt. Når alle andre passer på en bunke, ryddes bordet; siste utspiller starter igjen, eller neste aktive spiller hvis hen er ferdig.": "You can pass on any hand, even when the table is empty. When all other players pass on a pile, the table clears; the last player starts again, or the next active player if they have finished.",
        "Spesialregler": "Special rules",
        "Slår alt unntatt fire like og rydder bordet. Du taper hvis dette er ditt siste kort.": "Beats anything except four of a kind and clears the table. You lose if this is your final card.",
        "Fire like spilt fra hånden kan slås av høyere fire like. Fire like samlet fra singler eller to par rydder bordet og kan ikke slås.": "Four of a kind played from hand can be beaten by a higher one. Four of a kind accumulated from singles or two pairs clears the table and cannot be beaten.",
        "Kortbytte og rundestart": "Card exchange and round start",
        "Antall spillere i reglene": "Player count for rules",
        "12 tilfeldige kort fjernes. En tilfeldig spiller starter første runde; deretter starter Boms.": "12 random cards are removed. A random player starts the first round; the Bum starts subsequent rounds.",
        "Presidenten får Boms sitt beste kort, unntatt Kløver 3, og velger ett kort å gi tilbake.": "The President receives the Bum's best card, except the three of clubs, and chooses one card to give back.",
        "Treerne uten kløver rydder bordet når de samles øverst.": "The non-club threes clear the table when they accumulate on top.",
        "Ruter 3 fjernes. Hjerter 3 starter første runde; deretter starter Boms. Hjerter 3 og Spar 3 sammen øverst rydder bordet.": "The three of diamonds is removed. The three of hearts starts the first round; the Bum starts subsequent rounds. The three of hearts and spades together on top clear the table.",
        "Presidenten får Boms sine to beste kort, unntatt Kløver 3, og velger to kort å gi tilbake.": "The President receives the Bum's two best cards, except the three of clubs, and chooses two cards to give back.",
        "Hjerter 3 starter første runde; deretter starter Boms.": "The three of hearts starts the first round; the Bum starts subsequent rounds.",
        "Presidenten får Boms sine to beste kort, unntatt Kløver 3, og velger to kort å gi tilbake. Visepresidenten får Viseboms sitt beste kort, unntatt Kløver 3, og velger ett kort å gi tilbake.": "The President receives the Bum's two best cards, except the three of clubs, and chooses two cards to give back. The Vice President receives the Vice Bum's best card, except the three of clubs, and chooses one card to give back.",
        "Tid og frakobling": "Turn timer and disconnection",
        "Du har 120 sekunder per tur, med én utsettelse på 120 sekunder per runde.": "You have 120 seconds per turn, with one 120-second extension per round.",
        "Ved tidsavbrudd eller frakobling kan en bot fortsette for deg. Ta tilbake plassen når du er tilbake.": "After a timeout or disconnection, a bot can continue for you. Take back your seat when you return.",
        "Flertallet bestemmer. Verten avgjør ved uavgjort.": "The majority decides. The host breaks ties.",
        "Boms": "Bum",
        "Venter på 1 spiller …": "Waiting for 1 player …",
        "Starter runden …": "Starting the round …",
        "Fortsett": "Continue",
        "Etter hvert fullførte bytte vises mottatte kort i 3, 5 eller 7 sekunder etter valgt meldingshastighet. Trykk Fortsett for å bli klar tidligere. Neste bytte eller runden starter når alle er klare. Botene bruker 5–10 sekunder på hvert byttesteg.": "After each completed exchange, received cards are shown for 3, 5 or 7 seconds according to your message speed. Press Continue to be ready sooner. The next exchange or the round starts when everyone is ready. Bots take 5–10 seconds per exchange step.",
        "Byttet ble avbrutt fordi vanlig bytte krever at begge har kort fra 7 til J.": "The exchange was cancelled because a normal exchange requires both players to have cards from 7 through jack.",
        "Kunne ikke lagre klar-status. Prøver igjen.": "Could not save ready status. Retrying.",
        "Presidenten skal velge ett kort til Boms:": "The President must choose one card for the Bum:",
        "Boms må gi sitt beste kort til Presidenten:": "The Bum must give their best card to the President:",
        "Gir sitt beste kort til visepresidenten.": "Gives their best card to the Vice President.",
        "Gir sine to beste kort til presidenten.": "Gives their two best cards to the President.",
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
        "Først ferdig: President. Sist: Boms.": "First out: President. Last: Bum.",
        "Match antall og lik/høyere verdi. Tomt bord: singel, par, tress eller fire like.": "Match the count and equal/higher value. Empty table: single, pair, triple or four of a kind.",
        "3–10, knekt, dame, konge, ess, 2. Kløver 3 er høyest.": "3–10, jack, queen, king, ace, 2. The three of clubs is highest.",
        "Kun på ikke-tomt bord. Alle andre passer: rydd bordet; siste utspiller (eller neste aktive) starter.": "Only on a non-empty table. All others pass: clear the table; the last player (or next active player) starts.",
        "Slår alt og rydder. Taper som siste kort.": "Beats anything and clears the table. Loses as your last card.",
        "Rydder hvis ingen aktive motspillere har høyere fire like.": "Clears if no active opponent holds higher four of a kind.",
        "Hjerter 3 først, deretter Boms.": "Three of hearts first, then Bum.",
        "Boms gir to beste; Presidenten gir to valgfrie. Aldri Kløver 3.": "Bum gives two best; President gives any two. Never the three of clubs.",
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
        "Viseboms": "Vice Bum",
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
        "Begge har samtykket til sneaky bytte.": "Both have agreed to an unregulated exchange.",
        "Trekk sneaky-samtykke": "Withdraw unregulated consent",
        "Sneaky bytte": "Unregulated exchange",
        "Start frivillig bytte": "Start optional exchange",
        "Ingen bytte": "No exchange",
        "Begge spillerne trenger minst ett ledig kort fra 7 til J.": "Both players need at least one free card from 7 to J.",
        "Sneaky bytte: alle kort kan brukes.": "Unregulated exchange: all cards can be used.",
        "Velg hvilket bytte du vil gjøre": "Choose which exchange to make",
        "Trykk på bytteblokken over for å velge mottaker.": "Tap the exchange block above to choose a recipient.",
        "Byttene gjenstår": "Exchanges remaining",
        "Gir sitt dårligste kort til visepresidenten.": "Gives their worst card to the vice president.",
        "Gir sine to dårligste kort til presidenten.": "Gives their two worst cards to the president.",
        "Boms må gi sine to beste kort til Presidenten:": "Bum must give their two best cards to the President:",
        "Presidenten skal gi bomsen to kort:": "The President must give Bum two cards:",
        "Mottakeren velger ureglementert bytte når byttet er tvunget.": "The receiver chooses an unregulated trade once the trade is forced.",
        "Tilleggsbytte gjelder bare mellom en rolle og rollen rett under, når regelen er på.": "An extra exchange only applies between a role and the role directly below it, when the rule is on.",
        "Begge spillerne må samtykke til sneaky bytte.": "Both players must consent to an unregulated exchange.",
        "Begge spillerne må ha et ledig kort fra 7 til J.": "Both players must have a free card from 7 to J.",
        "Sneaky-samtykke kan ikke endres nå.": "Unregulated consent can't be changed now.",
        "Hva vil dere gjøre videre?": "What do you want to do next?",
        "Gå til lobby": "Go to lobby",
        "Start neste runde": "Start next round",
        "Flertallet valgte lobbyen.": "The majority chose the lobby.",
        "Flertallet valgte neste runde.": "The majority chose the next round.",
        "Flertall regnes av alle menneskespillere. Manglende stemmer teller ikke; uten flertall ved fristen går rommet til lobbyen.": "The majority is counted among all human players. Missing votes don't count; without a majority at the deadline the room goes to the lobby.",
        "Skal neste runde starte med alle Nøytrale?": "Should the next round start with everyone Neutral?",
        "Vanlig plassering": "Normal placement",
        "Alle nøytrale": "All neutral",
        "Flertallet valgte at alle starter Nøytrale.": "The majority chose for everyone to start Neutral.",
        "Flertallet valgte vanlig plassering.": "The majority chose normal placement.",
        "Boter stemmer ikke. Manglende stemme teller som vanlig plassering; uavgjort gir Nøytral start.": "Bots don't vote. A missing vote counts as normal placement; a tie gives a Neutral start.",
        "Starter valgt neste steg …": "Starting the chosen next step …",
        "Klargjør avstemning …": "Preparing the vote …",
        "Vert": "Host",
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
        "Navnet kan ha maks 24 tegn.": "The name can have at most 24 characters.",
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
        "Visepresidenten skal gi visebomsen ett kort:": "The Vice President must give the Vice Bum one card:",
        "Visebomsen skal gi visepresidenten sitt beste kort:": "The Vice Bum must give the Vice President their best card:",
        "Bomsen skal gi presidenten sine to beste kort:": "Bum must give the President their two best cards:",
        "Presidenten skal velge to kort til Boms:": "The President must choose two cards for Bum:",
        "Dette byttet er ikke lenger tilgjengelig.": "This exchange is no longer available.",
        "Bare spilleren som kan starte byttet, kan velge Ingen bytte.": "Only the player who can start the exchange can choose No exchange.",
        "Bare deltakerne i byttet kan gi sneaky-samtykke.": "Only the participants in the exchange can give unregulated consent.",
        "Sneaky-samtykke kan ikke trekkes tilbake etter at kort er valgt.": "Unregulated consent can't be withdrawn after cards are chosen.",
        "Feil antall kort som byttes.": "Wrong number of cards to exchange.",
        "Kortene er ikke gyldige for dette byttet.": "The cards are not valid for this exchange.",
        "Datamaskinen har ikke nok gyldige kort til byttet.": "The computer doesn't have enough valid cards for the exchange.",
        "Spilleren finnes ikke i dette spillet.": "The player is not in this game.",
        "Forrige rundes President eller Boms mangler.": "The previous round's President or Bum is missing.",
        "Forrige rundes visepresident eller viseboms mangler.": "The previous round's Vice President or Vice Bum is missing.",
        "Ukjent argument.": "Unknown argument.",
        "Ukent status.": "Unknown status.",
        "Stokker kortene": "Shuffling the cards",
        "Kløver 3": "3 of Clubs",
        "kløver 3": "3 of clubs",
        "Ess": "Ace",
        "Knekt": "Jack",
        "Dame": "Queen",
        "Konge": "King",
        "Treere": "Threes",
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
        ["Egne regler · {n}", "Custom rules · {n}"],
        ["{n} egne regler", "{n} custom rules"],
        ["Bli med i spillet til {name}?", "Join {name}'s game?"],
        ["Denne lobbyen spiller med {x}:", "This lobby plays with {x}:"],
        ["Du som {role} kan tvinge bytte av kort mellom 7–J med {role2}.", "As {role}, you can force an exchange of cards from 7–J with {role2}."],
        ["{name} som {role} bestemmer om det blir bytte med {name2}.", "{name} as {role} decides whether to exchange with {name2}."],
        ["Dine runder: {n}", "Your rounds: {n}"],
        ["Krever {n} runder", "Requires {n} rounds"],
        ["Krever {n} seire", "Requires {n} wins"],
        ["Tid igjen: {n} s", "Time left: {n} s"],
        ["{name} ble frakoblet. En bot overtar.", "{name} disconnected. A bot takes over."],
        ["{name} brukte opp tiden. En bot overtar.", "{name} ran out of time. A bot takes over."],
        ["{n}/{m} plasser fylt", "{n}/{m} seats filled"],
        ["{n}/{m} plasser fylt · {k} s turpause (verten styrer)", "{n}/{m} seats filled · {k} s turn pause (host-controlled)"],
        ["{n} s turpause (verten styrer)", "{n} s turn pause (host-controlled)"],
        ["{name} ble President!", "{name} became President!"],
        ["{name} ble Boms!", "{name} became Bum!"],
        ["{name} gikk ut som Nøytral.", "{name} went out as Neutral."],
        ["{name} gikk ut som {role}.", "{name} went out as {role}."],
        ["Venter på {count} spillere …", "Waiting for {count} players …"],
        ["Alle passet. {name} starter.", "Everyone passed. {name} starts."],
        ["{name}: {x}! Starter igjen.", "{name}: {x}! Starts again."],
        ["{name}: {x}! {name2} starter.", "{name}: {x}! {name2} starts."],
        ["La på {x}, bunken går ut. ({y})", "Played {x}; the pile is cleared. ({y})"],
        ["Bunken gikk ut og ferdig. ({x})", "The pile was cleared and finished. ({x})"],
        ["{name} begynner", "{name} starts"],
        ["{name} er Boms og starter.", "{name} is Bum and starts."],
        ["{name} har passet", "{name} has passed"],
        ["Fjern {name}", "Remove {name}"],
        ["Flytt {name}", "Move {name}"],
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
        ["{name} valgte å ikke gjennomføre ekstra bytte med deg.", "{name} chose not to make an extra exchange with you."],
        ["Du som {role} kan tvinge bytte av kort mellom 7–J med {role2}. Om begge velger ureglementert bytte, kan alle kort byttes.", "As {role}, you can force an exchange of cards from 7–J with {role2}. If both choose unregulated exchange, any card rank can be exchanged."],
        ["{name} som {role} bestemmer om det blir bytte med {name2}. Om begge velger ureglementert bytte, kan alle kort byttes.", "{name} as {role} decides whether to exchange with {name2}. If both choose unregulated exchange, any card rank can be exchanged."],
        ["{name} har tvunget et bytte. Godta vanlig bytte, eller godta med ureglementert samtykke.", "{name} has forced an exchange. Accept a normal exchange, or accept with unregulated consent."],
        ["{name} har tvunget et bytte med {name2}.", "{name} has forced an exchange with {name2}."],
        ["Venter på at {name} godtar byttet.", "Waiting for {name} to accept the exchange."],
        ["{name} har tvunget et bytte. Godta vanlig bytte med kort 7–J.", "{name} has forced an exchange. Accept a normal exchange with cards 7–J."],
        ["{n} av {m} kort valgt.", "{n} of {m} cards selected."],
        ["Valget er sendt til {name}.", "The choice was sent to {name}."],
        ["Vanlig bytte bruker kort 7–J. Sneaky-samtykke: {n}/2.", "Regular exchange uses cards 7–J. Unregulated consent: {n}/2."],
        ["Vanlig bytte: kort 7–J. Sneaky-samtykke: {n}/2.", "Regular exchange: cards 7–J. Unregulated consent: {n}/2."],
        ["Valgt: til {name}", "Selected: to {name}"],
        ["Velg bytte til {name}", "Choose exchange to {name}"],
        ["Motta fra {name}", "Receive from {name}"],
        ["Du må gi ditt beste kort til {name}", "You must give your best card to {name}"],
        ["Du må gi dine to beste kort til {name}", "You must give your two best cards to {name}"],
        ["Du må gi dine tre beste kort til {name}", "You must give your three best cards to {name}"],
        ["{name} står over.", "{name} sits out."],
        ["{name} mister makten!", "{name} loses power!"],
        ["Må legge høyere enn {n}.", "Must play higher than {n}."],
        ["Gi kort", "Give cards"],
        ["Kort til {name} ({n}/{m})", "Cards to {name} ({n}/{m})"],
        ["Velg {n} kort i hånden, eller flick dem opp hit.", "Choose {n} cards in your hand, or flick them up here."],
        ["Velg {n} kort i hånden.", "Choose {n} cards in your hand."],
        ["Gi kort til {name}", "Give cards to {name}"],
        ["{name} gir ett kort til {name2}:", "{name} gives one card to {name2}:"],
        ["{n} av {m} menneskespillere har stemt.", "{n} of {m} human players have voted."],
        ["{n} av {m} har stemt. {k} sekunder igjen.", "{n} of {m} have voted. {k} seconds left."],
        ["{n} av {m} har stemt.", "{n} of {m} have voted."],
        ["{k} sekunder igjen.", "{k} seconds left."],
        ["{n} kort valgt. Sveip vannrett over kortene for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.", "{n} cards selected. Swipe horizontally over the cards to scroll. Drag or flick the selection up to play it, or press Enter."],
        ["{n} kort valgt. Trykk Legg ut eller Enter for å spille.", "{n} cards selected. Press Play cards or Enter to play."],
        ["{n} av {m} kort valgt. Trykk Legg ut eller Enter for å spille.", "{n} of {m} cards selected. Press Play cards or Enter to play."],
        ["{n} av {m} kort valgt. Sveip vannrett over kortene for å bla. Dra eller flick utvalget opp for å legge det ut, eller trykk Enter.", "{n} of {m} cards selected. Swipe horizontally over the cards to scroll. Drag or flick the selection up to play it, or press Enter."],
        ["{x}, valgt for bytte", "{x}, selected for exchange"],
        ["{x}, velg for bytte", "{x}, select for exchange"],
        ["{x}, kan spilles", "{x}, can be played"],
        ["{x}, kan ikke spilles nå", "{x}, can't be played now"],
        ["{x}, vent før neste trekk", "{x}, wait before the next move"],
        ["På bordet ligger {n} singlekort med verdien {x}.", "There are {n} single cards of value {x} on the table."],
        ["På bordet ligger: {x}", "On the table: {x}"],
        ["Du må slå: {x}", "You must beat: {x}"],
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
        if (window.NeonLogo) { window.NeonLogo.render(language); }
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
