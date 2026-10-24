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

On mobile, the playing table gains roughly 70% of the Pass button's height from the action area's top spacing, without shrinking the button or hand. Suggest move and Auto-pass use matching on/off switches. The game log includes the cards played on finishing moves before the placement announcement, even when board messages are hidden.

Mandatory President/Boms and Vice President/Vice Boms exchanges complete independently. Each pair receives its cards and confirms its own summary without blocking the other pair's selections or delivery; normal play waits for both pairs. Concurrent confirmations are reapplied to the latest shared state to preserve both trades. Selected outgoing cards and received-card summaries use the sender's card design and foil, respecting the existing card-style visibility preference.

## Running locally

### Appearance progression

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

### Local server

The project is a static website with no build step. Serve the repository root over localhost or HTTPS, then open it in a browser. For example, with Python installed:

```sh
python -m http.server 8000
```

Open <http://localhost:8000/>. The game uses Firebase Realtime Database; to run your own deployment, configure a Firebase project and database rules for the paths used by the application.

Run the automated tests with Node.js:

```sh
node --test
```

### Card depth and landing

Idle foils use the approved six-second light drift and gentle intensity pulse, without moving the card or changing its tuned colors. Only the foil pseudo-elements animate; dragging, flights, hidden drag sources and reduced-motion preferences disable the idle effect. This uses CSS animation rather than a JavaScript frame loop, but animated gradients still have a repaint cost.

Played cards carry their visible foil light position, eased pattern position and intensity from the hand or drag preview into flight. The light follows the same tilt/settling poses as the card face and blends into the destination's idle phase at the whole play's reveal, including staggered groups. Recreated native table cards share the document's six-second phase so a table refresh does not restart their shimmer. Flight foil keyframes are computed once; no additional frame loop is introduced.

The seven laminated depth sheets derive their color from the card artwork's border, retaining subtle darker layers instead of using the same beige edge for every style.

Open [the idle foil timing preview](tests/foil-idle-preview.html) to compare subtle 4, 6, 8, 12 and 16-second light-drift/pulse cycles on light and dark cards using the approved foil treatments. Pause/restart controls, offscreen/hidden-page pausing and reduced-motion handling are included. This is a preview only, not a production idle-animation or GPU performance change.

Use [per-foil settings](tests/foil-settings-preview.html) to choose one shared treatment per foil while comparing Normal (light) and Cosmic (dark) cards against unfoiled references. Choices auto-save in browser-local storage and can be exported as JSON for later production integration; changing preview controls does not change production rendering.

Production foil treatments now use the approved per-foil opacity, saturation, blend and printed-layer choices in `Card.foilTreatments`, keyed by English foil names (stripes, stardust, prism, waves, facets, rings, weave, rainbow, contrast, gold-sheen, grid, iridescent, pearlescent, rays). Existing saved IDs remain compatible. CSS reflections apply the same reductions at rest, during dragging and in flight; printed SVG foil is disabled for prism, waves, contrast, grid and rays. The settings preview starts from these production choices when no local choices exist and exports English-named version-2 configuration. Preview images request untreated artwork so adjustments are not applied twice.

Open [the foil transparency preview](tests/foil-opacity-preview.html) to compare unfoiled designs and original untuned foils with 10-90% less opacity. It scales both the printed SVG foil and reflective CSS layers, offers saturation, blend-mode, static-foil, neutral-reflection, card-design and active-intensity controls, and does not alter production foil settings. Reduced-opacity examples use the selected treatment; unfoiled/untuned references remain unchanged.

Dragged cards, return glides, plays, exchanges, discards, and resting table cards use a 3px laminated edge following the actual SVG outline. Seven native SVG paper slices and the original artwork replace the supersampled WebGL renderer: there are no canvas copies, GPU contexts, texture caches, or render-target multipliers. Existing card designs, pixel outlines, foil overlays, and table guidance are retained.

Card movement retains the timing and individual card splay from `1797a9b1dc07f8ae3a2737aff5b726937134af59`, without table-edge rebounds or shared fan trajectories. Slightly lower landing friction extends normal post-contact slides by 12%; short throws are capped to avoid acceleration. The central landing area is wider, and each new play's top card covers at least 10% of the previous top card's projected face. Whole-play translations preserve individual fan offsets and rotations; only edge-constrained fans tighten their horizontal spacing, retaining at least 18% of a card width between adjacent centers. Support-aware endpoints are fitted before flights start, without an endpoint snap. Landing offsets remain stable across refreshes and resizing.

Native rendering caches unchanged card geometry separately from shadow dependencies and avoids redundant shadow path, opacity, visibility, and blur writes. All seven paper layers, exact geometry, shadow softness, and foil transforms are preserved. Trading and other unrelated features retain their newer behavior.

Multi-card pickup and return measure all selected cards before making visual changes, avoiding interleaved layout reads/writes. Each drag card renders its initial depth pose once and skips redundant scale writes during pointer movement. Native drag cards suppress the generic button's duplicate rectangular shadow and request compositor layers only while their temporary previews exist. The tilt sandbox includes a four-card selection for checking this path; these optimizations do not reduce artwork, foil or shadow quality.

### Tuning settings

Existing tuning settings live at the top of their owning file, closure or class, without changing their scope or values:
- `js/game.js`: lobby settings, presentation durations and flick thresholds (distances in pixels, velocity in pixels per millisecond).
- `js/connection.js`: starter flash duration and message speeds, in milliseconds.
- `js/cards.js`: English foil configuration names and approved treatments at the top of `Card`.
- `js/card-depth.js`: existing shadow thresholds at the top of `CardDepth`.
- `js/landing-geometry.js`: card dimensions, projection, light and landing constants at the top of its closure.
- `js/presence.js`, `js/player.js` and `js/bot.js` already keep their settings at the top of their owning scope.

Local calculations, lookup tables and runtime state stay near their use. This organization is for easier configuration, not a performance change; it does not alter shadow quality.

Resting pitch/yaw comes from sampled heights of the cards beneath each footprint, with the approved gentler lean on crossed piles. A fixed top-left light projects shorter, tighter shadows onto the felt and supporting card planes. Flight, first contact, sliding/spinning momentum, diminishing rebounds, and settlement share the same geometry and shadow model; the final flight pose matches the persistent table card. Thrown cards decelerate at one constant rate from release, through touchdown at 64% of the animation, to rest: they carry about a third of their launch speed into a slide of roughly 13% of the throw distance (capped at 45% of a card height) instead of braking in the air. This is an approximate support model, not a full rigid-body simulation.

Pairs, triples and quads keep their readable fan but add a stable, random-looking per-card splay: up to 3px sideways, 5px along the table and 2 degrees of extra rotation. Each card still slides along its incoming throw direction into its own final pose, rather than skidding sideways. The splay is derived from the deal, play and card identity so refreshes and other clients keep the same layout; single cards are unchanged.

Unchanged poses are not redrawn, static table cards have no animation loop, and flight work is cancelled on cleanup. Invalid artwork retains the original image and logs a warning. Reduced-motion preferences skip flights and rebounds while retaining resting depth and contact shadows. Native SVG filters still have a rendering cost; this is not a phone benchmark.

Shadow rendering is bounded on large tables:

- A shadow is only drawn where some of it can be seen: receivers whose visible area (including the blur halo, and treating each card's 3px edge as cover) misses the shadow are skipped entirely. Partly covered shadows rely on normal paint order, so no masks are needed.
- Shadows sharper than 1.25px skip the blur filter.
- Tables with more than 12 cards keep full shadows on the top 8 cards only. Lower cards cast just a felt shadow, and those felt shadows share one blur filter. Landing cards only shadow the top cards, and cleared cards from deep in the pile fade out without a shadow.
- While cards land, the top cards and the felt shadows are cached as compositor layers, so the moving shadow does not repaint the whole pile.
- Cleared cards cast only their own felt shadow.
- Table layout measures every card before writing, so the browser lays out the pile once.

In a pair, triple or quad, later cards cast shadows onto the earlier cards while they are still flying. All animated cards update in one frame loop, in start order. If the page scrolls during a landing, the flying cards move with the table, so they and their shadows stay aligned.

Serve the repository as above and open [card drag and landing](tests/card-tilt-sandbox.html) or [mouse drag and flick](tests/mouse-drag-sandbox.html) to exercise the production interactions without Firebase.

The [contact and landing lab](tests/landing-sandbox.html) uses the same support geometry in an isolated, inspectable scene. Try bare felt, a pile edge, or crossed cards; drag to choose a landing position, add cards, or scrub through first contact and rebound. The two interaction sandboxes above exercise the production renderer and game lifecycle.
