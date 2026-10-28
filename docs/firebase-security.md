# Firebase security

The game is a static site that talks directly to Firebase Realtime Database. There is no game server: every client reads the shared game state and writes its own moves. This document describes what [database.rules.json](../database.rules.json) enforces today, what it cannot enforce, and the path to a server-authoritative game.

## Rollout

Each step is safe on its own, in this order:

1. **Deploy the site.** [js/firebase-init.js](../js/firebase-init.js) keeps the database offline until an anonymous sign-in completes, then connects. If Anonymous Authentication is not enabled yet, it logs a warning and connects anyway, so the current open rules keep working.
2. **Enable Anonymous Authentication.** Firebase console → Authentication → Sign-in method → Anonymous → Enable. Reload the game and check the browser console: the "Anonym innlogging feilet" warning should be gone, and Authentication → Users lists anonymous users.
3. **Publish the rules.** Firebase console → Realtime Database → Rules, paste [database.rules.json](../database.rules.json) and publish. Or, with the Firebase CLI: `firebase deploy --only database`.
4. **Smoke test.** Create a lobby, add a bot, play a round, open the leaderboard, set a name with a PIN, and join from a second browser. Permission errors appear in the console as `PERMISSION_DENIED`; to roll back, republish the previous rules.

Before step 3, use the Rules Playground in the console to simulate a read of `/playerStats` with and without authentication.

## What the rules enforce

| Path | Rule |
| --- | --- |
| everything | Denied unless listed below. Every listed path requires a signed-in (anonymous) user, which blocks scripted access that has not gone through Firebase Auth. |
| `boms_1/$gameId` | Readable and writable by any signed-in user. IDs must be 1–999999. |
| `boms_public/$gameId` | The public lobby listing. Fields and types are fixed; unknown fields are rejected. |
| `playerStats/$playerKey` | Readable for the leaderboard (indexed on `lastActiveAt`). Records cannot be deleted. `presidentWins`, `roundsPlayed` and `bomsCount` can only grow, and by at most 1 per write. |
| `playerIds/$playerKey` | Write-once: a player ID's ownership token cannot be replaced. |
| `playerNames/$nameKey` | PIN profiles cannot be moved to another player ID, and legacy PIN fields cannot be changed or removed. |
| `playerAppearance/$playerKey` | Only `style`, `foil` and `updatedAt`, with bounded string lengths. |

## What the rules cannot enforce yet

The data model limits what rules can check:

- **Hands are visible.** The whole game, including every player's cards, is one document at `boms_1/$gameId` that every participant reads. Anyone can see opponents' cards in the browser's developer tools.
- **Any signed-in user can change any game.** Players are identified by a 6-character key in a cookie, not by their Firebase user, so the rules cannot tell a seated player from anyone else.
- **Stats are written by other players.** When a game ends, one client records results for every seat, bots included. The rules can only stop counters from shrinking or jumping, not prove that a win happened.
- **PIN profiles can be removed.** A client could rewrite a `playerNames` record without some of its PIN profiles; the rules can stop a profile from being reassigned, not from being deleted.
- **PIN credentials are guessable offline.** `pinProfiles` keys are PBKDF2 hashes of a 6-digit PIN with one fixed salt, and the records are readable. One precomputation over all 1,000,000 PINs maps every credential back to its PIN. Profile recovery is a convenience feature, not an account system, but this should be fixed before it protects anything valuable.

## Roadmap

1. **Bind seats to Firebase users.** Store `auth.uid` with each seat (for example `boms_1/$gameId/members/$uid: playerKey`) and require membership for writes to an active game. Joining becomes a separate, rule-checked write to `members/$uid`.
2. **Bind player IDs to users.** Store the owner's `uid` in `playerIds/$playerKey` instead of a random token, and only let that user write their own `playerAppearance`. Linking an anonymous user to a provider (Google, email link) would also replace PIN recovery.
3. **Move results and hands to a server.** A Cloud Function (or another trusted backend) deals the cards, validates each move, records stats and writes each hand to `hands/$gameId/$uid`, readable only by its owner. The shared game document then holds only public state: card counts, the table and turn order. Bots, including the omniscient "god" tier, run on the server.
4. **Fix PIN credentials.** Give each name its own random salt, and look up one credential at a time instead of reading the whole `playerNames` record. Better, retire PINs in favour of step 2's account linking.
