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

Settings include a local, saved **Card shadows** choice. **Fancy** (the default) keeps the
existing projected, blurred shadows and card-to-card shadowing. **Simple** uses one unblurred,
offset silhouette per card, skipping shadow projection, occlusion tests and receiver shadows.
It applies immediately to table cards, drags and flights, including prepared drag previews when
next used. Card artwork, seven-layer edges, foil treatments, landing physics and motion are unchanged.

Fancy-mode optimizations keep all 81 flight foil keyframes but calculate their exact pitch/yaw
without solving unused clearance heights. Full physics still drives every displayed flight pose.
Support and shadow tests reuse each plane's exact local axes; shadow bounds reject unreachable
receivers before calculating exposed samples, without changing the remaining visibility tests.

Unchanged table updates keep their connected card DOM, depth state and foil clocks. Appending a play
retains the existing cards while recalculating support-aware placement for the complete pile.
Changes to the game/round, seating, artwork, foil, motion or layout-size class invalidate reuse.
Resizing still remeasures the pile; translated base bounds avoid accumulating subpixel offset errors.
New table cards collect animation references in one read batch before synchronizing their idle phase.
Flight reveal sampling likewise advances all destination foil clocks, reads their styles together,
then restores all clocks before constructing any flights.

Where IntersectionObserver is available, hand and table foil animations pause outside the
visible/clipped area, with a 128px viewport margin. On return their clocks advance by the time spent
offscreen, preserving the shimmer phase rather than restarting it. Observers disconnect when a hand
or pile is replaced. The idle glare layer is static, so only the foil color layer animates.

Multi-card pickup prepares the unchanged SVG drag previews during idle time, selected cards first.
Preparation stops during active gestures; an unprepared pickup still builds synchronously without
waiting for an idle callback. Preview dimensions and positions are remeasured at pickup, and artwork,
style or foil changes invalidate prepared previews. Drag translation, tilt and foil coordinates share
one display-frame update; release flushes the latest position before play or return. All pointer
samples still reach flick detection. SVG border metadata and the original full-resolution outline
samples are bounded caches; seven-layer edges, shadows, foil treatments and motion are unchanged.

Suggested-card auto-scroll keeps its original distance-based duration, easing and comfort margins.
Preview preparation waits until auto-scroll or hand inertia finishes instead of competing with it.
Hand scroll events no longer measure or reposition unrelated landing flights; page or table-ancestor
scrolls still update every flight immediately, with one table measurement before all position writes.

Idle foils use one six-second light drift and gentle intensity pulse, without moving the card or changing its tuned colors. The glare layer stays static at rest, reducing each foil from two animated layers to one; dragging, flights, hidden drag sources and reduced-motion preferences disable idle motion. The foil palette and full-resolution artwork remain unchanged.

The saved **Idle foil animation** switch under Appearance defaults to on. Turning it off stops idle motion across hand, table and settings-preview cards while keeping static foil visible and retaining drag/flight reflections. It applies immediately, synchronizes across tabs and still respects reduced-motion preferences.

Played cards carry their visible foil light position, eased pattern position and intensity from the hand or drag preview into flight. The light follows the same tilt/settling poses as the card face and blends into the destination's idle phase at the whole play's reveal, including staggered groups. Recreated native table cards share the document's six-second phase so a table refresh does not restart their shimmer. Flight foil keyframes are computed once; no additional frame loop is introduced.

The seven laminated depth sheets derive their color from the card artwork's border, retaining subtle darker layers instead of using the same beige edge for every style.

Open [the theme, neon sign and UI preview](tests/theme-neon-preview.html) to compare 20 proposed dark, high-contrast and light themes spanning the colour spectrum, with palettes inspired by popular VS Code, IntelliJ and Visual Studio themes. Each theme reports WCAG contrast checks and recolours a layered SVG neon-sign logo whose glow pulses using opacity only. Switches compare the current UI and logo with proposed panels, felt, buttons, seats and settings.

Production now ships 21 colour themes in [color-themes.css](css/color-themes.css): 16 dark themes ordered by accent hue, High contrast, AMOLED Black and three light themes. Each theme decides dark or light mode, so the separate mode switch is gone; previously saved themes migrate to the closest new theme (light-mode users get a light theme). An inline script applies the saved theme before first paint. Every theme is tested for 7:1 primary text, 4.5:1 secondary and button text, 3:1 borders and focus, and readable status tints.

AMOLED Black uses flat, solid-colour controls and panels, a true-black table without felt texture or vignette, and no raised UI shadows or hover lifts. Focus outlines and selected/turn/pass colours remain visible; card depth, foil and the neon sign keep their effects.

Buttons across all themes use flat colours without glass highlights, gradients, shadows or glow. Primary actions retain their filled accent colour; secondary actions retain quieter theme-coloured fills and semantic action colours. Auto-pass, automatic suggestions and fast-forward remain discreet, borderless controls on a transparent background, with their original icons, state colours and hover opacity. Keyboard focus outlines remain visible.

The splash logo is a theme-coloured neon sign drawn by [neon-logo.js](js/neon-logo.js): the original two cards and wordmark layout, tubes straight on the page with a soft shadow, and Norwegian or English text. Its SVG layers fit the actual artwork with equal glow padding, centring the visible sign in either language rather than the original canvas's empty space. On the first visit the tubes flicker on and the menu rises in quickly behind them; afterwards the glow pulses, the lower line flickers and the whole sign occasionally flashes. Only opacity and transforms animate, and reduced motion keeps the sign lit and still. [ui-refresh.css](css/ui-refresh.css) restyles the existing top-bar buttons, primary and secondary actions, panels, felt table, segmented choices, switches, tabular numbers and theme-aware focus rings; player seats keep their green turn and yellow pass colours.

Open [the idle foil timing preview](tests/foil-idle-preview.html) to compare subtle 4, 6, 8, 12 and 16-second light-drift/pulse cycles on light and dark cards using the approved foil treatments. Pause/restart controls, offscreen/hidden-page pausing and reduced-motion handling are included. This is a preview only, not a production idle-animation or GPU performance change.

Open [the five-renderer performance comparison](tests/foil-performance-preview.html) to compare cached static cards, static full CSS, cached cards with a lightweight reflection, simpler CSS and the current animated renderer. Light/dark samples share pointer coordinates; a separate scrolling hand tests one renderer at a time, with configurable card count, idle motion and a live frame-interval results table. Recorded desktop CPU measurements and their limitations are included, with [raw measurements](tests/foil-performance-results.json). Cached cards are self-contained static SVG images for browser raster caching, not PNGs; their foil pattern stays fixed. No production rendering or saved preferences change.

The comparison also includes an [iPhone 13-sized stress profile](tests/foil-performance-mobile-results.json): 390 x 844 CSS pixels, DPR 3 and uncalibrated 4x CPU slowdown. This is desktop Chromium, not A15/Safari emulation or a phone FPS measurement; real-device GPU, touch/momentum scrolling and cached-image compatibility still need physical iPhone validation.

Use [per-foil settings](tests/foil-settings-preview.html) to choose one shared treatment per foil while comparing Normal (light) and Cosmic (dark) cards against unfoiled references. Choices auto-save in browser-local storage and can be exported as JSON for later production integration; changing preview controls does not change production rendering.

Production foil treatments now use the approved per-foil opacity, saturation, blend and printed-layer choices in `Card.foilTreatments`, keyed by English foil names (stripes, stardust, prism, waves, facets, rings, weave, rainbow, contrast, gold-sheen, grid, iridescent, pearlescent, rays). Existing saved IDs remain compatible. CSS reflections apply the same reductions at rest, during dragging and in flight; printed SVG foil is disabled for prism, waves, contrast, grid and rays. The settings preview starts from these production choices when no local choices exist and exports English-named version-2 configuration. Preview images request untreated artwork so adjustments are not applied twice.

Production uses the full CSS foil with idle animation on by default. Idle foil animates only an opacity pulse and a translated glare layer inset by its travel distance, avoiding per-frame gradient recalculation; table cards, hand cards and flights share the same phase. Dragged cards ease their foil pattern in JavaScript rather than restarting CSS transitions each frame. Foil stays visible while scrolling, and pointer, drag and flight reflections remain. The Appearance idle-animation toggle still saves and synchronizes across tabs; an explicitly saved disabled preference is honored.

The Messages setting is off by default and controls board messages, not the game log. Its switch is on when messages are enabled; message timing settings appear only while enabled. Existing saved visibility preferences are preserved.

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
