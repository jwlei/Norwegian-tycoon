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

On mobile, the playing table gains roughly 70% of the Pass button's height from the action area's top spacing, without shrinking the button or hand. Suggest move and Auto-pass use matching on/off switches. The game log includes the cards played on finishing moves before the placement announcement, even when board messages are hidden.

Mandatory President/Boms and Vice President/Vice Boms exchanges complete independently. Each pair receives its cards and confirms its own summary without blocking the other pair's selections or delivery; normal play waits for both pairs. Concurrent confirmations are reapplied to the latest shared state to preserve both trades. Selected outgoing cards and received-card summaries use the sender's card design and foil, respecting the existing card-style visibility preference.

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

### Card depth and landing

Dragged cards, return glides, plays, exchanges, discards, and resting table cards use a 3px laminated edge following the actual SVG outline. Seven native SVG paper slices and the original artwork replace the supersampled WebGL renderer: there are no canvas copies, GPU contexts, texture caches, or render-target multipliers. Existing card designs, pixel outlines, foil overlays, and table guidance are retained.

Resting pitch/yaw comes from sampled heights of the cards beneath each footprint, with the approved gentler lean on crossed piles. A fixed top-left light projects shorter, tighter shadows onto the felt and supporting card planes. Flight, first contact, sliding/spinning momentum, and settlement share the same geometry and shadow model; the final flight pose matches the persistent table card. This is an approximate support model, not a full rigid-body simulation.

Throws smoothly approach a fitted resting position inside the table. There are no wall rebounds, impact-driven angular impulses, or post-impact group trajectories. Rotation decelerates continuously through flight and landing, without reversing to meet a fan angle. Existing release metadata remains readable for compatibility, but does not activate wall physics.

Pairs, triples and quads settle into a readable fan, normally spaced by 36% of a card's width. The lower card anchors the arrangement near the aimed landing position; upper cards slide onward to expose the cards underneath. Each card follows its own smooth, continuously slowing trajectory with the baseline 55ms stagger, rather than travelling as a rigid group.

The whole fan fits inside the visible table, accounting for the pile's projected height. The newest top card covers at least 10% of the preceding play's top face, measured as projected polygon intersection area rather than an edge distance; layout reserves extra overlap for the subsequent support-aware tilt. Final destinations are fitted before the flight starts, so no late steering, restart, or endpoint snap is needed. Lower-friction settlement retains a 1.6-times-longer animation and slide distance (bounded to 20% of the total travel to keep speed decreasing continuously). Earlier plays may be partly buried, but the latest play stays separately visible. Final poses remain identical across redraws and refreshes, including when reduced motion skips the flight.

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
