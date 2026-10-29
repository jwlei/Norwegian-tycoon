# Boms og President (Norwegian Tycoon)

[Play at playboms.eu](https://playboms.eu/)

## Om spillet

Boms og President er et gratis kortspill for 2–4 spillere som spilles direkte i nettleseren. Bli kvitt kortene dine først for å bli President, og unngå sisteplassen – Boms. Spill med venner i offentlige eller private lobbyer, eller start et hurtigspill mot boter. Ingen installasjon er nødvendig.

## About the game

Boms og President (also known as Norwegian Tycoon) is a free card game for 2–4 players, played right in your browser. Get rid of your cards first to become President, and avoid finishing last as the Boms. Play with friends in public or private lobbies, or start a quick game against bots. No installation required.

## Features

- Public and private multiplayer lobbies, with invite links and room codes
- Quick play against bots in public lobbies, plus bot opponents in hosted games
- Spectator mode and reconnection to an active game
- Player profiles, optional PIN-based profile recovery, and a leaderboard
- Game log, round results, turn timers, and configurable ready/start flow
- Optional custom rules set by the lobby host (extra exchange, unregulated), with a saved personal preset
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

## Bot tiers

The retired Bad tier is redistributed among three remaining tiers. Normal uses the former Good strategy (stored ID `good`); Good uses the former Pro strategy (stored ID `pro`); God keeps its existing omniscient strategy (`god`), including knowledge of opponents' cards. Existing version-one bot records migrate by name; newly saved records use version two. Legacy `bad` strategy values normalize to Normal.

| Tier | Bots |
| --- | --- |
| Normal (13) | Bomsen, Onkel Pass, Guest_839201, Knurt, Turbo-Tore, Boten Anna, Haakon VIII, Kurt-Josef, Kjell-Bjarne, Mathias (CEO), J21Oslo, Tante_Pose, IlIllIlIIl |
| Good (7) | Severin Suveren, H4cker-man, Steinar Storspiller, xXLegolasXx, DeepSeek, Sjefen_Over_Alle_Sjefer, Fetter Anton |
| God (6) | GPT6, RNGesus, ギフテッド, Mysil Bergsprekken, BobRoss, Jompa |

## Appearance progression

Card styles unlock through **rounds played**, while foils unlock through **President wins**.
Both selectors list rewards in milestone order, with frequent early unlocks and increasingly
spaced later rewards. The hidden Green Haze style retains its separate eligibility rules.

| Rounds played | Card style | Wins | Foil |
| ---: | --- | ---: | --- |
| 0 | Classic | 0 | None |
| 1 | Monochrome | 1 | Rings |
| 2 | Minimalist | 2 | Stripes |
| 3 | Onyx & Gold | 3 | Weave |
| 5 | Love Notes | 4 | Facets |
| 7 | Cherry Blossom | 6 | Grid |
| 9 | Origami | 9 | Waves |
| 12 | Gold | 13 | Pearlescent |
| 15 | Solar Eclipse | 17 | Prism |
| 19 | Marble Noir | 23 | Rays |
| 23 | Stained Glass | 31 | Stardust |
| 27 | Crystal | 40 | Contrast |
| 32 | Silver | 50 | Rainbow |
| 37 | Holo | 62 | Iridescent |
| 43 | Spellbook | 75 | Gold sheen |
| 50 | Cosmic | | |
| 57 | Space Explorer | | |
| 66 | Moon Tarot | | |
| 76 | Gothic | | |
| 86 | Parallax | | |
| 98 | Desert Caravan | | |
| 109 | Butterfly Garden | | |
| 119 | Pixel Art | | |
| 129 | Neon | | |
| 137 | Cyberpunk | | |
| 145 | Glitched | | |
| 150 | Astronomy Atlas | | |

## Running locally

The project is a static website with no build step. Serve the repository root over localhost or HTTPS, then open it in a browser. For example, with Python installed:

```sh
python -m http.server 8000
```

Open <http://localhost:8000/>. Run the automated tests with Node.js 20 or newer:

```sh
npm test        # same as: node --test
```

### Firebase

The game uses Firebase Realtime Database with Firebase Anonymous Authentication. To run your own deployment, create a Firebase project, enable **Authentication → Sign-in method → Anonymous**, replace `firebaseConfig` in `index.html`, and publish [database.rules.json](database.rules.json) (Realtime Database → Rules, or `firebase deploy --only database`). See [docs/firebase-security.md](docs/firebase-security.md) for what the rules enforce and the remaining roadmap.

### Project layout

| Path | Contents |
| --- | --- |
| `index.html`, `rules/`, `en/` | Pages. Scripts load in dependency order from `index.html`. |
| `js/` | Game rules (`cards.js`, `player.js`, `engine.js`), bots, presence, rendering (`layout*.js`, `card-depth.js`), networking and UI wiring (`connection.js`), localization (`i18n.js`). |
| `css/` | Base styles, themes, foils and card depth. |
| `tests/` | Automated `node --test` suites. |
| `sandbox/` | Manual preview pages and interaction labs that run without Firebase. |
| `docs/` | Implementation notes and the Firebase security model. |

Local scripts and stylesheets are referenced with a content hash (`?rev=…`) so returning players never keep a stale cached copy. After changing one, run `npm run stamp`; `npm test` fails until every reference matches its file. `GameLayout` is defined in `js/layout.js` and extended by `js/layout-animations.js`, `js/layout-table.js` and `js/layout-hand.js`, which load right after it.

### Tuning settings

Existing tuning settings live at the top of their owning file, closure or class, without changing their scope or values:
- `js/game.js`: lobby settings, presentation durations and flick thresholds (distances in pixels, velocity in pixels per millisecond).
  `CARD_DRAG_TABLE_HIGHLIGHT_ENABLED` defaults to `false`; set it to `true` to restore the table outline when dragging cards over it. Drop detection and card movement are unchanged.
- `js/connection.js`: starter flash duration and message speeds, in milliseconds.
- `js/cards.js`: English foil configuration names and approved treatments at the top of `Card`.
- `js/card-depth.js`: existing shadow thresholds at the top of `CardDepth`.
- `js/landing-geometry.js`: card dimensions, projection, light and landing constants at the top of its closure.
- `js/presence.js`, `js/player.js` and `js/bot.js` already keep their settings at the top of their owning scope.

Local calculations, lookup tables and runtime state stay near their use. This organization is for easier configuration, not a performance change; it does not alter shadow quality.

## Implementation notes

Detailed notes on card depth, landing physics, foils, themes, the neon sign and other UI decisions live in [docs/implementation-notes.md](docs/implementation-notes.md).
