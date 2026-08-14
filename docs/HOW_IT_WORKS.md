# How it works

## Screen by screen

**Overview** — profit, ROI, turnover, average bet, win rate and your current
run, across every account at once. A chart of how you got here, bet by bet or
account by account. Your biggest win and worst loss, your best and worst day,
and where the money is quietly leaking.

**Bets** — every slip you have ever placed, sortable and searchable. Open bets
pinned at the top. Filter by won, lost, or void and cashed out. An accumulator
opens up into its legs, each with its own selection, price and result.

**Analytics** — the same history cut two ways: by slip, and by individual pick,
because a combo that lost on one leg says something different about the other
nine. Breakdowns by sport, league, market, odds band and stake size. Whether the
prices you take are honest ones. Whether you chase after a loss, and what your
worst run cost you.

**Cashflow** — every deposit and withdrawal, what you are net down or up, and
which of them came with a bonus attached.

**Bonuses** — what is still active, what the rollover is, how far through it you
are, when it expires — and afterwards, what the bonus was actually worth rather
than what it was advertised as.

**Options** — your currency (EUR, USD or GBP), odds as decimal, fractional or
American, number format, theme, whether the balance shown is the bookmaker's own
or your deposits minus withdrawals, and whether bonus money counts towards it.
Rename an account, hide one, back everything up to a file, or delete the lot.

---

## What happens between signing in and a number appearing

There is no server and no API key, because bookmakers do not offer one. What
they do offer is the same interface their own website uses, and you are already
signed in to it.

1. **A content script watches the page** you have open at the bookmaker. It reads
   which requests the site's own JavaScript makes, and when one matches that
   bookmaker's capture rule it takes the session header out of it. Only the
   header. Never your password, which the page never has either.
2. **The background worker asks for your history** using that session, the same
   way the site's own history page does — a page at a time, slower than you
   clicking, backwards through your history until it reaches the end. If the
   session is not usable from the worker, the request is made from the tab
   itself instead.
3. **Everything is normalised into one shape.** Every bookmaker describes a bet
   differently; each adapter folds its site's answer into the same record, so a
   Stake accumulator and a bet-at-home one are counted the same way.
4. **It is stored in IndexedDB**, in your browser profile on your disk. Bets,
   payments, bonuses, balances and your settings. Nothing else, nowhere else.
5. **The dashboard reads that database** and nothing but. It is a page inside the
   extension, so it works offline and keeps working when a bookmaker changes.

A sync runs when you open the bookmaker, when you place or settle something, or
when you ask for one. It waits at least five minutes between runs for the same
account, and backs off further if the site throttles it. If the bookmaker signs
you out, it stops and says so rather than showing you a zero.

**Currencies** are converted on the day the bet was placed, not today — so last
year's profit does not move because a rate did. Crypto stakes are priced the same
way, through the coin's own daily close.

---

## Why it is built this way

**Local only, because there is no version of this worth a data breach.** A file
holding what you bet, when, and how much you lost is not something to keep on
somebody else's computer. There is no account to create, so there is nothing to
leak, and no business model that could later depend on the data.

**A browser extension, because the session lives in the browser.** A website or a
phone app would have to hold your bookmaker password to do this. An extension
does not: it reads pages you already opened, using the session you already have.
It cannot place a bet, deposit, or withdraw.

**A bookmaker is a folder.** Everything one site needs — how it is recognised,
how it is read, its logo, its recorded test payloads — lives in one directory,
and adding a site touches nothing else. That is what makes a stranger's pull
request reviewable in an evening rather than a week.

**The shared core is closed on purpose.** One change to how bets are stored or
totalled can break every bookmaker at once, and the person who finds out is a
stranger whose figures went quietly wrong. So contributions add sites; they do
not change how sites work. CI enforces it rather than a reviewer having to.

**Every folder is held to the same tests.** They are found on disk, not listed
anywhere, so a new site cannot ship without being checked: no bet may claim an id
another site uses, money must be a number, a status must agree with its payout,
and the fields the dashboard groups by must actually be filled — otherwise the
totals come out right beside an empty screen, which is the failure that wastes
the most time. A separate test reads every folder's code and fails it if it names
any host but the bookmaker's own.

---

## What it calls, and what it tells them

Besides your bookmakers, exactly two addresses:

| | |
| --- | --- |
| `api.frankfurter.dev` | Published daily exchange rates. Asked for a date range and a list of currency codes. |
| `api.binance.com` | Published daily coin prices. Asked for a coin pair and a date. |

Neither request carries anything about you — no id, no amount, no account.
Nothing is sent anywhere else, and `privacy.test.ts` fails the build if a
bookmaker folder ever names a host that is not its own bookmaker's.

Full policy: [PRIVACY.md](../PRIVACY.md)
