---
description: Turn a captured HAR recording into a working bookmaker folder
argument-hint: [bookmaker-id] (lowercase, hyphenated, e.g. bet365)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(pnpm *), Bash(node *), Bash(git status), Bash(git diff *), Bash(ls *)
---

# Add a bookmaker

You are adding support for a new bookmaker to BETtracker from a HAR recording
the contributor captured on their own account.

The bookmaker id is `$1`. If that is empty, ask for it before doing anything
else. It must be lowercase and hyphenated, and it becomes the folder name, the
JSON `id`, the logo filename and the storage key — they all have to agree.

## Rule zero: you may only add

The core is closed to changes. You may create `extension/src/bookmakers/$1/`
and add exactly one line to each of the three collectors. You may **not** edit
anything else — not the sync engine, not the shared types, not the database,
not the dashboard, not the build scripts, not another bookmaker's folder.

If the site genuinely cannot be supported without a core change, stop and write
up what is missing and why. That is a discussion to open, not a change to make.
A pull request that touches protected paths is rejected by CI anyway.

## Step 1 — find the recording

Look for a `.sanitized.har` in `har/`. If you only find a raw `.har`, run
`pnpm sanitize-har har/<file>.har` first and use its output.

**Never read a raw `.har` into context and never write one anywhere.** It holds
live session tokens and the contributor's financial history. If the sanitised
file still contains something that looks like a credential, say so and stop.

## Step 2 — read how the site works

From the sanitised recording, work out and write down:

- **Hosts.** Which host serves the API. Whether the site renumbers its domains
  (`site42.com`), because that becomes a `siteRanges` block instead of a list.
- **Authentication.** Which request headers carry the session. Cookie-only
  counts — say so, because then no header is captured. If the money history
  lives on a second host with a second credential, note both; see
  `bet-at-home/README.md` for a site that does this.
- **A fingerprint.** One URL pattern that appears when, and only when, the user
  is on this bookmaker. It is how a page is recognised.
- **Endpoints.** Settled bets, open bets, balance, deposits and withdrawals,
  bonuses. Note which exist — several are optional in the adapter interface.
- **Paging.** Timestamp cursor, page number, offset, or a continuation token.
  Adapters own their own paging; do not try to make it look like another site's.
- **The bet shape.** How a selection, a market, odds, stake, return and status
  are represented, and how an accumulator differs from a single.

## Step 3 — read the code you are matching

Do not write anything yet. Read, in this order:

1. `extension/src/bookmakers/README.md` — the folder contract.
2. `extension/src/bookmakers/types.ts` — the `BookmakerAdapter` interface.
3. `extension/src/bookmakers/capture-rule.ts` — the `CaptureRule` interface.
4. `extension/src/bookmakers/stake/` — a whole site, end to end. If the new site
   has a second banking session, read `bet-at-home/` instead.
5. `shared/src/types.ts` — the `Bet` shape everything is normalised into.
6. `extension/src/sync/sync.ts` — the reusable paging and dedup helpers. Use
   them. Do not reimplement them inside the adapter.

Match the existing style exactly: the same naming, the same error handling, the
same comment voice. Comments explain **why**, never what.

## Step 4 — write the folder

Create `extension/src/bookmakers/$1/` containing:

- **`bookmaker.json`** — `id` (identical to the folder name), `name`, `site`,
  `brand` and `color` hex values taken from the site's own branding, `mirrors`,
  `sites` and/or `siteRanges`, `apiHosts` for any API on a different origin than
  the site itself, and `betsPath` if there is a sensible page to link to.
- **`capture.ts`** — exports `rule` typed as `CaptureRule`. It must import
  **only** from `../capture-rule`. It is loaded by the MAIN-world inject script,
  which runs inside the page's own JavaScript; an import that reaches an adapter
  drags the sync engine into every page the user visits.
- **`adapter.ts`** — exports the `BookmakerAdapter`. Throw
  `SessionExpiredError` on a dead token so the user is prompted to sign in
  rather than shown a silent zero. Skip a bet you cannot parse and count it;
  never invent a value to fill a gap.
- **`__fixtures__/`** — the response bodies you lifted out of the sanitised HAR.
  Trim them to a few representative records: one single, one accumulator, one
  open, one settled loss, one settled win, one void if the site has them.
- **`adapter.test.ts`** — parses those fixtures and asserts the normalised
  output. Cover at minimum: a single, an accumulator, each status the site
  reports, and a malformed record being skipped rather than crashing the sync.
- **`README.md`** — this site's quirks. What is strange about it, what would
  surprise the next person, and how to refresh the fixtures.
- **`logo.png`** — ask the contributor for it. Around 128px, square, background
  removed. Do not fetch one from the site; you cannot check its licence.

## Step 5 — register it, three lines

- `extension/src/bookmakers/capture.ts` — import the rule, append to
  `CAPTURE_RULES`.
- `extension/src/bookmakers/registry.ts` — import the adapter, add to `ADAPTERS`.
- `extension/src/bookmakers/catalog.ts` — import the JSON, append to `CATALOG`.

Miss one and `plugin.test.ts` fails by name. That is what it is for.

## Step 6 — prove it

```bash
pnpm lint
pnpm test
pnpm build
```

All three must pass before you report back. `plugin.test.ts` checks the folder
is complete and registered; `manifest.test.ts` checks every site the extension
asks to be injected into is one the capture rule recognises. If either fails,
fix the folder — never the test.

Then confirm with `git status` that you changed nothing outside
`extension/src/bookmakers/$1/` and the three collector files.

## Step 7 — hand back

Tell the contributor, briefly:

- what works and what does not, honestly — "transactions untested, the recording
  had no deposits in it" is a useful pull request; a claim of full support that
  is not true is not;
- that the adapter has only ever been run against a recording, never against a
  live account, unless they have loaded the extension and confirmed otherwise;
- to open a pull request using the template, which asks for exactly this.

Do not commit or push on their behalf unless they ask.
