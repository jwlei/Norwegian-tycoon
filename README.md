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

### Card depth and anti-aliasing

Dragged cards, return glides, plays, exchanges, and discard flights use a 3px laminated edge following the actual SVG outline, with soft shadows projected from a fixed top-left light. The complete rotated card is rendered at 2x output resolution and downsampled before display (Study 4), rather than supersampling only the source artwork. Existing card designs and foil overlays are retained.

Moving cards share one WebGL renderer. Render targets are capped at 1536 pixels per side, effective pixel density at 2, the texture cache at eight appearances, and simultaneous GPU previews at eight cards. Additional cards in large clears keep their native image animation. Unchanged poses are not redrawn; animation frames and per-preview resources are released on cleanup. If WebGL is unavailable or lost, or the preview budget is reached, the original image rendering is retained and a warning is logged. Reduced-motion preferences still disable tilt and flight animations.

Serve the repository as above and open [card drag and landing](tests/card-tilt-sandbox.html) or [mouse drag and flick](tests/mouse-drag-sandbox.html) to exercise the production interactions without Firebase.
