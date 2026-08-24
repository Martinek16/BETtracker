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
site cannot work without a core change, stop and say so - that is a Discussion,
not a workaround.

## Read this before you write anything

**You cannot do this job alone, and the part you cannot do comes first.**

An adapter is written from a HAR recording of a real signed-in session at the
bookmaker. You cannot log in, you cannot browse an account, and you cannot
obtain that recording. Neither can you invent it: a fabricated API shape
produces an adapter that reports someone's money wrongly, which is the one
failure this project exists to prevent.

There is exactly **one** thing you must get from the person you are working with,
and you should ask for it at the very start rather than after an hour of
scaffolding: a recording (`.har`) of their signed-in account. It comes out of
that account and there is no other way to it. Where the file lands is your
problem, not theirs - see below.

Everything else, including the logo, you do yourself. Do not hand them a list of
chores. `pnpm new-bookmaker` already lifts the site's name, its brand colour and
its icon out of the recording, so look at what it wrote before you go looking:
the site published all three to their browser. If it found no icon - plenty of
sites ship only an SVG - find the mark yourself, save it as `logo.png` in the
folder, around 128px square with the background removed, and show them the
result. Ask only after you have tried.

Ask for the recording like this, in these words, because every extra
instruction is a chance to lose somebody:

> Sign in to the bookmaker in your browser. If BETtracker is installed there,
> click its icon in the toolbar and press **Record this site** - that is the
> whole of the setup. Otherwise press **F12**, open the **Network** tab and tick
> **Preserve log**.
>
> Now click slowly through your settled bet history - page back several pages -
> then your open bets, your balance, and your deposits and withdrawals. If the
> site has a casino and you play it, page back through that history too.
>
> Then save it. From the extension: its icon again, then **Save recording**.
> From DevTools: right-click the list of requests and export the log, and if
> your browser offers **Export HAR (sanitized)** and **Export HAR (with
> sensitive data)**, take the one **with** sensitive data - the other strips the
> sign-in headers, which are the part I have to read. It may ask you to turn
> that on first: Settings → Preferences → Network → **Allow to generate HAR with
> sensitive data**. Older browsers call it **Save all as HAR with content** and
> have only the one.
>
> Leave it wherever your browser saves downloads - there is nothing to move.
> Tell me when it is saved and I do the rest.

Then move it yourself, into `har/<id>/` at the top of the checkout. Never make
them find that folder: a path typed by somebody who does not know where the
checkout is, is a step this flow loses people at. `har/` is made by
`pnpm install`, so it already exists. The sanitiser reads Downloads too, but only
a recording in the site's own folder is read as that site's, and that folder is
where the scaffold takes the name, colour and icon from.

Adapt only the site-specific part - where _that_ bookmaker keeps its bet
history, if you know. Then run the sanitiser yourself:

```bash
pnpm sanitize-har
```

No filename: it takes the newest recording out of `har/` or their Downloads
folder, strips the cookies, tokens and name out of it, and writes the clean copy
beside it. Asking them to run it is one more command to mistype for nothing.

Read only that clean copy. Never read a raw `.har` into context and never write
one anywhere: it holds live session tokens and the person's financial history.
If the sanitiser finds nothing, say so and stop.

## Never make them find a folder

Any time you name a folder they have to do something with, open it for them in
the same breath. A path in a chat window is a thing to be copied wrong.

```bash
explorer .            # Windows
open .                # macOS
xdg-open .            # Linux
```

Three places this matters, and they are the three places people get stuck:

- **After cloning**, so they can see where the project landed.
- **`extension/dist`**, when they are about to drag it into `chrome://extensions`.
  Open the folder, then tell them what to click.
- **Anything you want them to look at** - a fixture you want checked, a logo you
  found, the sanitised recording.

Say what the folder is and what they do with it. Opening it silently is worse
than not opening it.

## Order of work

0. **Get the project onto their machine**, if somebody handed you a URL rather
   than a checkout. `git clone --depth 1 https://github.com/Martinek16/BETtracker`,
   then `corepack enable && pnpm install` inside it. The history behind the
   current state is not needed to build one. Clone it where they can find it
   again - they will be loading a build out of it in step 7 and it is theirs to
   keep, not a scratch folder.

   **Say at this point that they will end up with a second copy of the
   extension.** Almost anyone asking for a new site already has BETtracker
   installed, and a bookmaker only exists in a build that contains it, so the
   copy they have cannot gain this one until a release ships. They will be
   running the build from this clone alongside it, with its own separate
   database. Their existing copy and its history are not touched, and nothing
   they sync into the new one carries across. Better said now than discovered
   after an evening's work. Open the clone in their file manager when it is
   ready, so they can see where it went.

1. **Ask** for the recording, in the words above, then run `pnpm sanitize-har`
   yourself. Do not proceed without it. Get the logo yourself while you wait.

   Skip this if you were started by `pnpm add-bookmaker`: it names the
   sanitised file in the prompt, which means the recording is already made,
   cleaned and in place. Start at the next step.
2. **Read** `har/<id>/*.sanitized.har` and work out the seven things in
   [docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md#3-write-the-folder):
   hosts, authentication, fingerprint, endpoints, paging, bet shape, and whether
   the site runs a casino and hands out its rounds.
3. **Read** `extension/src/bookmakers/stake/` end to end - one endpoint, one
   session. If the site's money history sits behind a second login, read
   `bet-at-home/` instead, which does that.
4. **Scaffold** the folder and register it in one command:

   ```bash
   pnpm new-bookmaker <id> <site> "<Name>"     # bet365 bet365.com "bet365"
   ```

   It writes `extension/src/bookmakers/<id>/` as a copy of `stake/` renamed to
   its own id, writes a fresh `bookmaker.json`, and adds the three collector
   lines. Name, brand colour and `logo.png` come out of the recording in
   `har/<id>/` - the front page the browser stored carries all three - and it
   says which of them it found. Then rewrite the folder against the recording:
   the endpoints, the paging, the bet shape, the host patterns and the `stake-`
   id prefix.

5. **Run the checks** below until they pass. Never edit a test to make it pass -
   the shared tests are protected paths and CI rejects a diff that touches one.
6. **Hand it back to them to load.** Have them run `pnpm test && pnpm build`
   themselves - it is the one moment they see the site pass on their own
   machine, and the build refuses outright if the folder was never registered.
   Then open `extension/dist` in their file manager and tell them:
   `chrome://extensions` → Developer mode → **Load unpacked** → pick the folder
   you just opened. If they have loaded this project's build before, that entry
   is already there and the word is **Reload**, not Load unpacked - the build
   just rewrote the folder behind it. Tell them to switch off the Microsoft Edge
   Add-ons copy first if they have one, because two copies sync the same accounts
   into two databases. A new bookmaker only exists in a build that contains it;
   the store copy gets it when a release ships.
7. **Send them to the report.** In the extension: **Options → Accounts → Add a
   bookmaker**. A site added to a copy of the project is listed there with one
   line per thing it has to have proved - bets read, every bet naming a sport,
   a match and a selection, won/lost/void all seen, accumulators carrying their
   legs, open bets, balance, money in and out, bonuses, and a sync without an
   error. A line reading _untested_ means their account has never had one of
   those, not that it failed. Ask them for the lines that are wrong or
   untested, and fix what they name.
8. **Report** honestly: what you proved against the recording, and what is
   still unverified. You have never seen this run against a live account.

## The folder

`<id>` is lowercase and hyphenated. It is the folder name, the `id` in
`bookmaker.json`, the storage key and the logo filename, and `plugin.test.ts`
fails if any of them disagree.

| File                  | Must                                                                                                                                              |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bookmaker.json`      | `id` identical to the folder name, plus `name`, `site`, `brand`, `color`, and `sites`/`siteRanges`/`apiHosts` for every host the adapter talks to |
| `capture.ts`          | `export const rule: CaptureRule`, with `rule.bookmaker === '<id>'`                                                                                |
| `adapter.ts`          | `export const <camelCaseId>: BookmakerAdapter`, with `id: '<id>'`                                                                                 |
| `samples.ts`          | `export const samples: Samples`, built from the fixtures through your own adapter                                                                 |
| `adapter.test.ts`     | Parses the fixtures and asserts the normalised output                                                                                             |
| `__fixtures__/*.json` | The shape of the site's answers, not the contributor's history - see below                                                                        |
| `logo.png`            | The site's mark, ~128px square, transparent background. Yours to find                                                                             |
| `README.md`           | This site's quirks, and how to refresh the fixtures                                                                                               |

The three collector lines, which `pnpm new-bookmaker` writes for you and which
you should recognise when you read the diff:

```ts
// capture.ts
import { rule as mySite } from './my-site/capture';
export const CAPTURE_RULES = [betAtHome, stake, mySite];

// registry.ts
import { mySite } from './my-site/adapter';
const ADAPTERS: Record<Bookmaker, BookmakerAdapter> = {
  'bet-at-home': betAtHome,
  stake,
  'my-site': mySite,
};

// catalog.ts
import mySite from './my-site/bookmaker.json';
export const CATALOG = [betAtHome, stake, mySite];
```

Three lines, not four. `released.ts` lists the sites that have shipped to
everyone, and a site you add has not. The app draws it apart from the released
ones and says so - that is accurate, not a warning, and it is how its owner
knows nobody but them has checked its figures. Adding your site there is also a
protected path, so CI fails the pull request.

The interfaces you are implementing are `BookmakerAdapter` in
`extension/src/bookmakers/types.ts` and `CaptureRule` in
`extension/src/bookmakers/capture-rule.ts`. Read them; they are commented.
Reusable paging and dedup helpers are in `extension/src/sync/sync.ts` - use
them rather than reimplementing them in the adapter.

## The fixtures describe the site, not the person

The recording is the contributor's own betting history. What gets committed must
be the site's **answer shape** - which keys it sends, in what types, in what
formats, with which values a field can take - and none of what that particular
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
- **Keep the site's own vocabulary exactly** - its sport names, market names,
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

- `betId` unique across **every** bookmaker, not just this one - bets are keyed
  on it with no site in the key. Short integer ids need a prefix.
- `stake > 0`, `odds >= 1` (an all-void slip prices at 1.0), `actualReturn >= 0`,
  and all of `stake`, `odds`, `potentialReturn`, `actualReturn` finite numbers.
- `currency` matching `/^[A-Z]{3,5}$/`. Convert nothing yourself: the rate
  engine converts on the day the bet was placed.
- `actualReturn` is **what came back, stake included** - not the profit. 0 on a
  loss, the payout on a win, the stake on a void, the cash-out figure on a
  cash-out. A parser that reports profit here passes every test in the repo and
  then doubles every result the dashboard shows.
- `bonusStake` is the part of `stake` that came out of the bonus wallet - a free
  bet, a promotion. Leave it off where the site does not split the two; set it
  and the wallet stops counting a free bet as money out of pocket.
- Every timestamp is ISO 8601 **carrying its zone**: `2026-08-23T18:32:50Z` or
  an explicit offset. A local-time string parses without complaint and then
  files the bet under the wrong day.
- `won` pays more than 0; `lost` and `pending` pay exactly 0.
- `pending` has `settledAt === null`; a settled bet has `settledAt >= placedAt`.
- `betType: 'single'` has exactly one leg, anything else more than one.
- Open bets are `pending`; settled bets are `won`, `lost`, `void` or
  `cashed_out`.

## What the money side must satisfy

`samples.ts` hands over bets and nothing else, so no test in this repo has ever
seen a transaction, a bonus or a balance. Everything below is convention alone.
A wrong sign here reaches the dashboard unchallenged, and these are the ones
that get got wrong.

- **`Transaction.amount` is always positive.** The direction is `kind`, never
  the sign. Sites report a withdrawal as `-50` often enough that passing the
  number straight through is the natural mistake - and then the wallet adds what
  it should subtract, so the balance is out by twice the amount.
- **A bonus is not a transaction.** Bonus money is neither paid in nor taken
  out, and whatever part of it turned real is already inside the balance;
  recording a grant as a deposit counts it twice and corrupts the all-time
  result. It goes to the bonus collector instead, with `grantedAmount` as the
  face value and `currentAmount` as what is left in the bonus wallet now.
- **`product`** says whether the money moved through the casino or the
  sportsbook, where the site reports it. Left off, it counts as sportsbook.
- **Convert nothing here either.** `sourceCurrency` and `fxRate` belong to the
  rate engine and are never written by an adapter. Report the currency the money
  actually moved in.

Because none of this is tested, step 6 of
[docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md) is the only thing standing
between a sign error and somebody's totals. Read the money boxes as the work,
not as the formality.

## The casino is two separate decisions

Most sites you will be asked for run a casino as well as a sportsbook, and
getting this wrong makes the sports figures lie, so decide both deliberately.

**Does the site have a casino at all?** That is `"hasCasino": true` in
`bookmaker.json`, and it is about the site, not about what you managed to read.
Set it wherever a casino exists. The app uses it to decide what the unexplained
part of the wallet means: with it, money the bets and payments do not account
for is shown as a casino result, and without it the same gap is a discrepancy
the user is invited to worry about. A sportsbook-only site must not carry the
flag, or its rounding gets labelled as slots losses.

**Does the site hand out its rounds one at a time?** That is `syncCasino` on the
adapter, and it is optional precisely because the answer is usually no. The
scaffold copies `stake/`, which has one, so **delete `syncCasino` from the new
`adapter.ts`** unless the recording actually holds a round history - what you
inherit otherwise is Stake's endpoint under another site's name. Never derive
rounds from the balance, from payment rows, or from anything else - a casino
figure assembled out of what is left over is exactly the invented number this
project refuses.

Where you do implement it, `CasinoRound` in `shared/src/types.ts` is commented
and is the contract. Four things it is easy to get wrong:

- **`kind` is the site's own label**, never the game's name. A third-party game
  the site does not categorise is `provider`. Calling it `slots` invents a fact.
- **`id` is the site's own round id.** It is what makes a second import a no-op.
- **A round with no resolution time is dropped.** The page filters rounds by
  period and draws them on a curve; a round stamped with `now` because the site
  sent no time is a wrong figure on both. Stake sends its live-casino rounds
  that way, and `stake/` skips them - say so in the folder's README rather than
  papering over it.
- **Casino import is best-effort.** Wrap it so a failure there never costs the
  bets and payments read in the same run.

Rounds go to their own store and are never turned into `Bet`. A spin is not a
bet: fold it in and every sports figure on screen becomes a different number.

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
  a host named nowhere is a host the popup never asks the browser for, so the
  adapter reaches it on no machine. No analytics, no error reporting, no
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

What the tests are for: `plugin.test.ts` - the folder is complete and
registered. `manifest.test.ts` - the extension still ships asking for no
bookmaker, and every address your folder declares is one a capture rule
recognises. `conformance.test.ts` - your `samples.ts`
obeys the rules every site obeys. `privacy.test.ts` - the folder talks to its
bookmaker and nothing else.

## What you cannot conclude

Passing tests mean the parser agrees with a recording. They do not mean the
dashboard shows anything. Only loading the extension and syncing a real account
proves that, and only the contributor can do it - step 6 of
[docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md) is the checklist.

Say plainly which of the two you have. "Bets and balance parse from the
recording; transactions untested, the capture had no deposits in it" is a good
report. A claim of full support that has never touched a live account is not.

## Conventions

Comments explain **why**, never what. Match the surrounding style. Commits are
`feat:`, `fix:`, `refactor:`, `docs:` or `chore:` and say why in the body. Do not
commit or push on the contributor's behalf unless they ask.
