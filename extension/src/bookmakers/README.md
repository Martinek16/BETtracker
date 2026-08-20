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
| `bookmaker.json` | `id` identical to the folder name. Everything keys off it.                 |
| `capture.ts`     | Export `rule: CaptureRule`. Match hosts and fingerprint the API calls.     |
| `adapter.ts`     | Export a `BookmakerAdapter`. See `../types.ts` for the interface.          |
| `samples.ts`     | Export `samples: Samples` - the folder's own parsed bets. See `../samples.ts`.|
| `__fixtures__/`  | At least one sanitised `.json`, so the parser has something to be proven on.|
| `logo.png`       | Served at `logos/<id>.png` by the Vite plugin. No path to register.         |

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
