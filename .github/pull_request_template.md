<!--
Adding a bookmaker? Keep this template.
Fixing something in your own bookmaker's folder? Delete it and just describe the fix.
-->

## Which site

Name and address:

## What works

Tick only what you have actually seen work. An honest partial adapter is a good
pull request; a claim that turns out to be untrue costs the next person a day.

Parsing:

- [ ] Settled bets import
- [ ] Open bets appear
- [ ] Accumulators parse correctly, not just singles
- [ ] Balance reads
- [ ] Deposits and withdrawals import
- [ ] Bonuses import
- [ ] Paging reaches the end of the history, not just the first page

On screen — the part that is easy to skip, because the totals can be right while
the screens are blank:

- [ ] Overview: bet count, profit and turnover match the bookmaker's own page
- [ ] Bets: every row names a sport, a match and a selection, with no blanks
- [ ] Bets: won, lost, void and cashed-out each read as what they are
- [ ] Bets: an accumulator expands to its legs, each with its own selection and result
- [ ] Analytics: the breakdown cards have bars in them, not one "Unknown" bucket
- [ ] A second sync duplicates nothing
- [ ] Signing out at the bookmaker asks me to sign in again, rather than showing zero

Anything that does not work, and why:

## How it was tested

- [ ] `pnpm lint`, `pnpm test` and `pnpm build` all pass
- [ ] Fixtures come from a recording put through `pnpm sanitize-har`
- [ ] I loaded the built extension and synced my own real account with it

If the last box is unticked, say so plainly — an adapter proven only against a
recording is still worth merging, it just gets labelled that way. The full
walkthrough is step 6 of [docs/ADD_A_BOOKMAKER.md](../docs/ADD_A_BOOKMAKER.md).

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
