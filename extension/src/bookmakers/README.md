# Bookmakers

**A bookmaker is a folder.** Everything one site needs lives in its own directory
here, and adding a site means adding a folder plus three one-line imports.
Nothing else in the codebase moves.

```
bookmakers/
  bet-at-home/          <- one folder per site
    bookmaker.json        metadata: id, name, mirrors, colours, API hosts
    capture.ts            how credentials are recognised on the page
    adapter.ts            how the site's API is read and normalised
    adapter.test.ts       proves the parser against the fixtures
    samples.ts            hands the parsed bets to the shared conformance suite
    logo.png              the site's mark, background removed
    README.md             this site's quirks
    __fixtures__/         sanitised recordings of real responses
  capture.ts            <- collector 1: capture rules
  registry.ts           <- collector 2: adapters
  catalog.ts            <- collector 3: metadata for the dashboard
  samples.ts            <- the contract every folder's samples.ts implements
  shape.ts              <- refuses an answer the folder no longer recognises
  conformance.test.ts   <- the rules every folder is held to
  privacy.test.ts       <- proves no folder sends anything anywhere
```

## Nothing leaves the machine

`privacy.test.ts` reads every folder's own source and fails if it names a host
the folder did not declare in its `bookmaker.json`, or if it uses one of the
calls that can move data without showing a request: `sendBeacon`, `WebSocket`,
`XMLHttpRequest`, `new Image`, `eval`, an injected `<script>`, or
`chrome.storage.sync` - which is not local storage, it copies to the browser
account.

The declared hosts are the whole of what a folder is allowed to name. An adapter
talks to the bookmaker it is for, and to nothing else.

## The three collectors

They are plain, explicit import lists rather than auto-discovery. esbuild cannot
resolve a glob into the extension bundle, and an explicit list is type-checked
and greppable. Adding a site is three lines:

```ts
// capture.ts
import { rule as myBookie } from './my-bookie/capture';
export const CAPTURE_RULES = [betAtHome, stake, myBookie];

// registry.ts
import { myBookie } from './my-bookie/adapter';
const ADAPTERS = { 'bet-at-home': betAtHome, stake, 'my-bookie': myBookie };

// catalog.ts
import myBookie from './my-bookie/bookmaker.json';
export const CATALOG = [betAtHome, stake, myBookie];
```

`released.ts` is a fourth list and is **not** one of them. It names the sites
that have gone out to everyone, so the app can draw a site somebody added to
their own copy apart from one that has been through review. A contribution never
touches it; a release does.

Forget one and `plugin.test.ts` fails by name - which is the point. An
unregistered capture rule means the page is read and nothing happens; a missing
catalogue entry means a bookmaker with no name and no colour on screen. Both are
silent at runtime, so they are caught in CI instead.

## Why `capture.ts` is separate from `adapter.ts`

The capture rules are loaded by the **MAIN-world inject script**, which runs
inside the page's own JavaScript context. It must never transitively import an
adapter - that would drag the whole sync engine into every page you visit.

`capture-rule.ts` holds the contract both sides agree on and imports nothing.
Keep it that way.

## What each file owes

| File             | Must                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `bookmaker.json` | `id` identical to the folder name. Everything keys off it. `hasCasino` only if the site runs one. |
| `capture.ts`     | Export `rule: CaptureRule`. Match hosts and fingerprint the API calls.     |
| `adapter.ts`     | Export a `BookmakerAdapter`. See `../types.ts` for the interface.          |
| `samples.ts`     | Export `samples: Samples` - the folder's own parsed bets. See `../samples.ts`.|
| `__fixtures__/`  | At least one sanitised `.json`, so the parser has something to be proven on.|
| `logo.png`       | Served at `logos/<id>.png` by the Vite plugin. No path to register.         |

## Read every list through `readList`

The one failure this project cannot otherwise see is a wrong number nobody has a
reason to doubt. A site renames the list its bets live in; the adapter looks
where it always looked, finds nothing, and reports a page of no bets - which is
exactly what the end of a history looks like. The walk stops, the run reports
success, and the totals stay frozen at whatever they last were.

The fixtures cannot catch that. They are a copy of how the site answered on the
day the folder was written, so they go on passing long after the site has moved
on. Only the live answer knows.

So the list is read through `readList` from `../shape.ts`, which throws a
`ShapeChangedError` for an answer that is not a list at all, and for a full page
it could not read one field out of. An **empty** list still passes, because that
is the end of a history and every paging loop reads it that way.

```ts
const { parsed, skipped } = readList(BOOKMAKER, 'bet list', json?.bets, (item) =>
  normalizeBet(item as RawBet, accountId),
);
```

The error carries a marker the dashboard looks for, so the account card can say
the site has changed and the folder needs an update, rather than lumping it in
with a dead session. The background run leaves `lastSyncAt` where it was: the
app says the figures are old rather than presenting stale ones as current.

Two things stay outside it. A list a `parseOne` legitimately filters - money
movements drop the pending and cancelled ones, so a page of ten of those is
normal - would trip the "read nothing out of it" rule for a healthy answer. And
`parseOpen`, which is handed whatever body the page fetched for its own reasons,
means only that the bridge caught a different request. Both return nothing and
let the next relay try.

## The casino, where the site records it

Two separate things, and a folder can do the first without the second.

`"hasCasino": true` in `bookmaker.json` says the site runs a casino at all. That
alone changes what the account card claims: the sportsbook figures no longer
account for the whole wallet, so the gap between them and the balance is
attributed to the casino instead of read as an error. Set it on any site with a
casino, whether or not you can read a single round from it. Leave it off a
sportsbook-only site, or its rounding errors get reported as slots losses.

`syncCasino` on the adapter is the second, and it is optional because most sites
make it impossible. It is implemented only where the site hands out its rounds
one at a time, and it returns one `CasinoRound` per round: the site's own id for
the round, when it resolved, the game and its slug, the stake, the payout, the
multiplier the site itself states, and the currency. `deep` walks the whole
history; a shallow run stops at the first page holding nothing new. Today only
`stake/` has it.

Three rules, all of which exist because the alternative is an invented figure:

- **`kind` comes off the site's own label**, never off the game's name. A game an
  outside studio supplied and the site does not categorise is `provider`, not a
  guess at `slots`.
- **A round with no timestamp is dropped, not dated.** The page puts rounds on a
  period and on a curve, and both need a real time. Stake sends its live-casino
  rounds without one, so they are skipped rather than stamped with now.
- **The import is best-effort.** A casino read that fails must never cost the
  bets or the payments in the same run - the sportsbook history is the thing
  people came for.

The rounds are stored on their own, in the `casinoRounds` store, and never
folded into `Bet`. A spin is not a bet, and the moment the two are mixed every
figure on the sports side becomes a different number.

## Mirrors

Sites that renumber their domains (`bah24.si`, `stake1042.com`) declare a
`siteRanges` block instead of listing each one:

```json
"siteRanges": [{ "prefix": "bah", "from": 20, "to": 45, "suffixes": ["com", "si"] }]
```

No site reaches the manifest. Permission is asked for one origin at a time, from
the popup, on the page the user is standing on, and the scripts are registered
at that moment. What the ranges are for is the popup knowing the page it is
looking at belongs to you before it offers to read it - and
`manifest.test.ts` checks that every host a folder names is one a capture rule
actually recognises, since otherwise the grant lands on a site nothing claims.

## Adding one

Capture a HAR of your own bet history, sanitise it, then copy `stake/` and work
through it against the recording - see
[docs/ADD_A_BOOKMAKER.md](../../../docs/ADD_A_BOOKMAKER.md).

**Never commit a raw `.har` file.** It contains live session tokens and your own
financial history. `pnpm sanitize-har` strips both, and CI rejects the commit if
one slips through.
