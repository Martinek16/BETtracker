<!--
Adding a bookmaker? Keep this template.
Fixing something in your own bookmaker's folder? Delete it and just describe the fix.
-->

## Which site

Name and address:

## What works

Tick only what you have actually seen work. An honest partial adapter is a good
pull request; a claim that turns out to be untrue costs the next person a day.

- [ ] Settled bets import
- [ ] Open bets appear
- [ ] Accumulators parse correctly, not just singles
- [ ] Balance reads
- [ ] Deposits and withdrawals import
- [ ] Bonuses import
- [ ] Paging reaches the end of the history, not just the first page

Anything that does not work, and why:

## How it was tested

- [ ] `pnpm lint`, `pnpm test` and `pnpm build` all pass
- [ ] Fixtures come from a recording put through `pnpm sanitize-har`
- [ ] I loaded the built extension and synced my own real account with it

If the last box is unticked, say so plainly — an adapter proven only against a
recording is still worth merging, it just gets labelled that way.

## Safety

- [ ] No `.har` file is in this diff
- [ ] I read the fixtures I am committing and there is no token, name, email,
      account number or address left in them

## Scope

- [ ] Everything I changed is inside `extension/src/bookmakers/<my-site>/`, plus
      one line each in `capture.ts`, `registry.ts` and `catalog.ts`

The core is closed to changes on purpose — one edit there can break every
bookmaker at once, and the person who notices is a stranger whose figures went
wrong. If your site genuinely cannot work without one, open a Discussion and it
will get sorted out properly rather than in a pull request.

## Anything else

Quirks worth knowing, decisions you were unsure about, questions for review.
