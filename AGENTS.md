# Working on BETtracker

BETtracker reads a person's own betting history from bookmaker sites and shows
it on a local dashboard. Nothing is uploaded anywhere, and the figures on screen
are the point of the whole project: a wrong number is worse than a missing one.

This file is for a coding agent. The narrative version for a person is
[docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md).

## The one thing this project accepts

**A new bookmaker, and nothing else.** A bookmaker lives entirely in
`extension/src/bookmakers/<id>/` plus one line in each of three collector files.
The sync engine, the database, the dashboard, the shared types and the build are
closed, and CI rejects a pull request that touches them.

You may change:

```
extension/src/bookmakers/<id>/**
extension/src/bookmakers/capture.ts
extension/src/bookmakers/registry.ts
extension/src/bookmakers/catalog.ts
docs/**  *.md
```

Anything else fails `.github/workflows/guard.yml` before a human reads it. If the
site cannot work without a core change, stop and say so — that is a Discussion,
not a workaround.

## Read this before you write anything

**You cannot do this job alone, and the part you cannot do comes first.**

An adapter is written from a HAR recording of a real signed-in session at the
bookmaker. You cannot log in, you cannot browse an account, and you cannot
obtain that recording. Neither can you invent it: a fabricated API shape
produces an adapter that reports someone's money wrongly, which is the one
failure this project exists to prevent.

So there are exactly two things you must get from the person you are working
with, and you should ask for both at the very start rather than after an hour of
scaffolding:

| You need | Why you cannot get it | What to ask for |
|:--|:--|:--|
| `har/<site>.sanitized.har` | It comes from their signed-in account | "Follow steps 1 and 2 of docs/ADD_A_BOOKMAKER.md and tell me the filename" |
| `logo.png` | You cannot verify the licence of an image you scrape | "A PNG of the site's mark, ~128px square, background removed" |

Everything else in this list you can do yourself.

If there is no sanitised recording in `har/`, say so and stop. Do not read a raw
`.har` into context and never write one anywhere: it holds live session tokens
and the person's financial history.

## Order of work

1. **Ask** for the recording and the logo. Do not proceed without the recording.
2. **Read** `har/<site>.sanitized.har` and work out the six things in
   [docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md#3-write-the-folder):
   hosts, authentication, fingerprint, endpoints, paging, bet shape.
3. **Read** `extension/src/bookmakers/stake/` end to end — one endpoint, one
   session. If the site's money history sits behind a second login, read
   `bet-at-home/` instead, which does that.
4. **Copy** the closer of those two folders to `extension/src/bookmakers/<id>/`
   and rewrite it against the recording.
5. **Register** it in the three collectors.
6. **Run the checks** below until they pass. Never edit a test to make it pass —
   the shared tests are protected paths and CI rejects a diff that touches one.
7. **Hand back** honestly: what you proved against the recording, and what is
   still unverified. You have never seen this run against a live account.

## The folder

`<id>` is lowercase and hyphenated. It is the folder name, the `id` in
`bookmaker.json`, the storage key and the logo filename, and `plugin.test.ts`
fails if any of them disagree.

| File | Must |
|:--|:--|
| `bookmaker.json` | `id` identical to the folder name, plus `name`, `site`, `brand`, `color`, and `sites`/`siteRanges`/`apiHosts` for every host the adapter talks to |
| `capture.ts` | `export const rule: CaptureRule`, with `rule.bookmaker === '<id>'` |
| `adapter.ts` | `export const <camelCaseId>: BookmakerAdapter`, with `id: '<id>'` |
| `samples.ts` | `export const samples: Samples`, built from the fixtures through your own adapter |
| `adapter.test.ts` | Parses the fixtures and asserts the normalised output |
| `__fixtures__/*.json` | The shape of the site's answers, not the contributor's history — see below |
| `logo.png` | From the contributor, not from the site |
| `README.md` | This site's quirks, and how to refresh the fixtures |

The three collector lines:

```ts
// capture.ts
import { rule as mySite } from './my-site/capture';
export const CAPTURE_RULES = [betAtHome, stake, mySite];

// registry.ts
import { mySite } from './my-site/adapter';
const ADAPTERS: Record<Bookmaker, BookmakerAdapter> = { 'bet-at-home': betAtHome, stake, 'my-site': mySite };

// catalog.ts
import mySite from './my-site/bookmaker.json';
export const CATALOG = [betAtHome, stake, mySite];
```

The interfaces you are implementing are `BookmakerAdapter` in
`extension/src/bookmakers/types.ts` and `CaptureRule` in
`extension/src/bookmakers/capture-rule.ts`. Read them; they are commented.
Reusable paging and dedup helpers are in `extension/src/sync/sync.ts` — use
them rather than reimplementing them in the adapter.

## The fixtures describe the site, not the person

The recording is the contributor's own betting history. What gets committed must
be the site's **answer shape** — which keys it sends, in what types, in what
formats, with which values a field can take — and none of what that particular
account did.

So when you lift a record out of the recording, rewrite its content:

- **Replace every amount, odd, return and balance** with a made-up figure. Keep
  the same type and the same number of decimals, and keep the arithmetic
  consistent: if the site sends `stake * odds === potentialReturn`, your invented
  numbers must satisfy it too, or `adapter.test.ts` asserts a lie.
- **Replace every date** with a date in a fixed, obviously artificial range.
- **Replace every id** with a short sequential one. Keep two records pointing at
  the same account pointing at the same stand-in, because that link is a thing
  the adapter reads.
- **Keep the site's own vocabulary exactly** — its sport names, market names,
  status strings, currency codes, error codes. That is the part an adapter is
  written against, and changing it breaks the fixture's whole purpose.
- **Cut the volume.** Three or four records per endpoint, chosen to cover the
  cases that differ: a single and an accumulator, a win and a loss, a void, a
  cash-out, a pending bet, the last page of a paged response.

The sanitiser is not enough on its own. It strips credentials and identity, and
it deliberately keeps amounts, because a parser has to be proven against real
figures. That is right for the file on the contributor's disk and wrong for a
file in a public repository, and closing that gap is your job, not the tool's.

This costs nothing in proof. A fixture proves the parser walks the right paths
and reads the right types; whether the stake was 12.50 or 4.20 is not what it
tests. The real figures are checked in step 6, by the contributor, against their
own live account, and never leave their machine.

The same goes for the folder's `README.md`: it says how the site answers and how
to refresh the fixtures. It does not say what the contributor bet on.

## What every normalised bet must satisfy

`conformance.test.ts` holds all of these, for every site. They are the
assumptions the totals, the graphs and the database already make.

- `betId` unique across **every** bookmaker, not just this one — bets are keyed
  on it with no site in the key. Short integer ids need a prefix.
- `stake > 0`, `odds >= 1` (an all-void slip prices at 1.0), `actualReturn >= 0`,
  and all of `stake`, `odds`, `potentialReturn`, `actualReturn` finite numbers.
- `currency` matching `/^[A-Z]{3,5}$/`. Convert nothing yourself: the rate
  engine converts on the day the bet was placed.
- `won` pays more than 0; `lost` and `pending` pay exactly 0.
- `pending` has `settledAt === null`; a settled bet has `settledAt >= placedAt`.
- `betType: 'single'` has exactly one leg, anything else more than one.
- Open bets are `pending`; settled bets are `won`, `lost`, `void` or
  `cashed_out`.

## Where an adapter goes wrong quietly

Loud failures are fine: `plugin.test.ts` names the collector you forgot. These
are the ones that pass a typecheck and then misinform somebody.

- **Null grouping fields.** `sport`, `event` and `selection` are nullable on
  `Bet`, so an adapter that never fills them parses cleanly, totals correctly,
  and renders every breakdown card as a list of blanks. `conformance.test.ts`
  requires each of them on at least one bet, plus `league` or `marketType`
  somewhere, and both `leg.selection` and `leg.event` on **every** leg.
- **A dead session read as zero.** Throw `SessionExpiredError` (from
  `../../sync/sync`) on a refused request, so the user is asked to sign in.
  Return an empty result instead and the dashboard shows a confident zero.
- **A second session not declared.** If the money history needs its own login,
  implement `banking()` in the capture rule and set `needsBankingSession: true`
  on the adapter. Without the flag the
  background worker runs `syncMoney` with `null` and the money history silently
  never arrives. See `bet-at-home/` for a site that does this.
- **An undeclared host.** Every host the adapter names must appear in
  `bookmaker.json`. `privacy.test.ts` reads your source and fails otherwise, and
  the manifest grants permission from the same file, so an undeclared host is
  also one the extension cannot reach. No analytics, no error reporting, no
  `sendBeacon`, `WebSocket`, `XMLHttpRequest`, `new Image`, `eval`, injected
  `<script>` or `chrome.storage.sync`.
- **`capture.ts` importing an adapter.** It is loaded by the MAIN-world inject
  script that runs inside the page's own JavaScript. It may import only from
  `../capture-rule`. Anything else drags the sync engine into every page.
- **Invented values.** Skip a record you cannot parse and count it in
  `skipped`. Never fill a gap with a guess or a zero.
- **A borrowed bet id.** Bets are keyed on `betId` alone, with no bookmaker in
  the key. If the site's ids are short integers, prefix them.

## Checks

```bash
pnpm lint
pnpm test
pnpm build
```

Then confirm with `git status` that nothing outside the folder and the three
collectors changed.

What the tests are for: `plugin.test.ts` — the folder is complete and
registered. `manifest.test.ts` — every address the extension asks to be injected
into is one a capture rule recognises. `conformance.test.ts` — your `samples.ts`
obeys the rules every site obeys. `privacy.test.ts` — the folder talks to its
bookmaker and nothing else.

## What you cannot conclude

Passing tests mean the parser agrees with a recording. They do not mean the
dashboard shows anything. Only loading the extension and syncing a real account
proves that, and only the contributor can do it — step 6 of
[docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md) is the checklist.

Say plainly which of the two you have. "Bets and balance parse from the
recording; transactions untested, the capture had no deposits in it" is a good
report. A claim of full support that has never touched a live account is not.

## Conventions

Comments explain **why**, never what. Match the surrounding style. Commits are
`feat:`, `fix:`, `refactor:`, `docs:` or `chore:` and say why in the body. Do not
commit or push on the contributor's behalf unless they ask.
