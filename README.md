# Boms og President (Norwegian Tycoon)

[Play at playboms.eu](https://playboms.eu/)

## Om spillet

Boms og President er et gratis kortspill for 2–4 spillere som spilles direkte i nettleseren. Bli kvitt kortene dine først for å bli President, og unngå sisteplassen – Boms. Spill med venner i offentlige eller private lobbyer, eller start et hurtigspill mot boter. Ingen installasjon er nødvendig.

## About the game

Boms og President (also known as Norwegian Tycoon) is a free card game for 2–4 players, played right in your browser. Get rid of your cards first to become President, and avoid finishing last as the Boms. Play with friends in public or private lobbies, or start a quick game against bots. No installation required.

## Features

- Public and private multiplayer lobbies, with invite links and room codes
- Quick play against bots, plus bot opponents in hosted games
- Spectator mode and reconnection to an active game
- Player profiles, optional PIN-based profile recovery, and a leaderboard
- Game log, round results, turn timers, and configurable ready/start flow
- Norwegian and English interface
- Customizable themes, card designs, foils, animation, and input controls
- Responsive layout, keyboard controls, and support for reduced-motion preferences

## Advanced concepts and technologies

- **Browser-native frontend:** The application uses HTML, CSS, and plain JavaScript without a framework or build step. JavaScript files are loaded in dependency order from `index.html`; game logic, rendering, networking, presence, bots, and localization are kept in separate modules.
- **Firebase Realtime Database:** Firebase JavaScript SDK 8.10.1 stores multiplayer game state and player statistics. Realtime listeners keep connected clients synchronized, while database transactions protect updates that can race, such as player identity allocation and shared game actions.
- **Multiplayer presence and recovery:** Presence records and Firebase's server-time offset help detect disconnects and stale sessions. Host handoff, action deadlines, and persisted turn/presentation timing allow games to recover and continue across clients.
- **Bot decision-making:** Bots use different skill profiles. Stronger strategies evaluate legal plays and sample possible unseen hands to estimate responses and future outcomes. The highest “god” profile is intentionally omniscient and can inspect opponents' cards.
- **Browser cryptography:** The Web Crypto API is used for player-name fingerprints and PBKDF2-based PIN profile credentials. PIN recovery is an optional convenience feature, not an account or authentication system.
- **Accessible interaction and motion:** The interface includes keyboard-operable controls, dialog focus management, ARIA state/status announcements, touch and pointer card interactions, and reduced-motion handling.
- **Testing:** Automated tests use Node.js's built-in test runner and cover game rules, bots, identity, presence, leaderboard behavior, themes, and card interactions.

## Running locally

The project is a static website with no build step. Serve the repository root over localhost or HTTPS, then open it in a browser. For example, with Python installed:

```sh
python -m http.server 8000
```

Open <http://localhost:8000/>. The game uses Firebase Realtime Database; to run your own deployment, configure a Firebase project and database rules for the paths used by the application.

Run the automated tests with Node.js:

```sh
node --test
```

## Search indexing

Static rules pages are available in Norwegian at [/rules/](https://playboms.eu/rules/) and English at [/en/rules/](https://playboms.eu/en/rules/). Both contain the rules as readable HTML without JavaScript, use language-specific canonical URLs and reciprocal `hreflang` links, and are listed in [sitemap.xml](sitemap.xml). The sitemap is advertised in [robots.txt](robots.txt).

These pages are intentionally not linked from the game interface. Keep both translations aligned with the in-game rules when gameplay changes. Static hosts serve each route from its directory's `index.html`; `/rules` normally redirects to `/rules/`.
