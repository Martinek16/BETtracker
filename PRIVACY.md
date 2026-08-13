# BETtracker Privacy Policy

**Version 1.0.0 — in force from 12 August 2026**
Contact: info.m04studio@gmail.com

## The short version

BETtracker keeps your betting history in your own browser and sends it nowhere. There is no
account, no server behind it, and no company collecting anything. Whoever installed the extension
is the only person with access to the data, because the data never leaves their machine.

This policy is written from what the code does. Every claim in it can be checked against the
permissions the extension asks the browser for, listed at the bottom of this page.

## Only when you say so

Each bookmaker is asked about separately, and nothing is read or stored for a site until you answer
yes. Saying no leaves that site untouched.

Say yes and the extension reads that account on its own from then on: while you have the site open,
and every ten minutes in the background.

## What is stored

- **Your bets** — date, sport, league, teams, your pick, the odds, the stake and how it finished.
- **Money in and out** — deposits and withdrawals, so your betting result can be told apart from
  your balance.
- **Bonuses** — bonuses your account was already granted, what is left of one, and when it runs out.
- **Your balance** — the figure shown on the site, and a note of it each time it changes.
- **Which account it belongs to** — the account number or username the site itself reports, so two
  logins at one bookmaker stay apart.
- **An activity log** — the last 500 lines of what the extension did, so you can see why something
  is missing.
- **Your settings** — currency, theme, accounts you renamed or hid, and which messages you want.

## What is never stored

- **Passwords and card details.** The extension reads pages you are already signed in to. It never
  asks for a login, never fills one in, and never sees a payment detail.
- **Casino and slots play.** Only sports bets are read. Casino money shows up only as a smaller
  balance.
- **Anything about you as a person.** No name, no email, no address, no device fingerprint, no
  advertising identifier.
- **Anything from other sites.** The extension only runs on the bookmakers you switched on.

## Your login session

To read your history the extension needs the same sign-in the site is already using. It takes it
from the requests the site itself makes — it never asks for a password, never fills a login form in,
and never signs in on your behalf.

The session is held in memory for as long as the browser is running and is never written to disk.
Closing the browser drops it. It is sent back to the bookmaker it came from, and nowhere else.

## What leaves your computer

- **The bookmaker's own site** — requests carrying the session you are already signed in with, the
  same calls the site makes when you open your bet history. For bet-at-home those run through its
  own backends, `sports-api.everymatrix.com` and `betathomecom.nwacdn.com`.
- **A public exchange-rate feed** — for an account in another currency, a date and a currency code
  are sent to `api.frankfurter.dev`, which serves European Central Bank rates. Nothing about you.
- **A public crypto price feed** — for a wallet held in coin, the coin's symbol and a date range are
  sent to `api.binance.com`. No account, no wallet, no amount.
- **A live score feed** — while a bet of yours is running, the bookmaker's public score feed is
  opened to show the score. It carries no sign-in and says nothing about your bet.
- **Nothing else, ever.** No analytics, no crash reports, no telemetry, no ads. Your bets, your
  balance and your payments are sent to no one.

## Sites you add yourself

Bookmakers change the address of their site often. On an address the extension does not recognise it
asks first, and the browser asks you to grant that address separately. Nothing is read on an address
you did not grant. Removing a site in Settings ends it.

## Where it is kept, and how safe it is

In the browser profile you installed the extension in. Another browser, machine or profile starts
empty.

It is stored the way a browser stores any site's data: unencrypted, protected by your computer's own
user account. Anyone who can use your profile can read it, the same as your browsing history. Keep
your browser and operating system up to date, and lock the account you use.

## Keeping it, or ending it

- **Until you delete it.** Records stay until you remove them. Nothing expires.
- **Delete one bookmaker.** Settings → the account → Forget. Its data goes, and the site is treated
  as never answered for again.
- **Delete everything.** Settings → Your data → Delete. Clears every bet, payment and setting — it
  cannot be undone.
- **Uninstalling.** Removing the extension or clearing site data wipes the store with it.
- **Your backup file.** Written to your computer and yours alone. It cannot be loaded back in.

## What each permission is for

| Permission | Why it is needed |
| --- | --- |
| The bookmaker sites you grant | Reading your bets, payments and bonuses off pages you have open |
| `storage` | Keeping those records in this browser |
| `alarms` | Looking for new records every ten minutes |
| `scripting`, `activeTab` | Running the reader inside the bookmaker page you are on |
| `https://api.frankfurter.dev/*` | Exchange rates for accounts in another currency |
| `https://api.binance.com/*` | Coin prices for a wallet held in crypto |
| `https://sports-api.everymatrix.com/*`, `https://*.nwacdn.com/*` | bet-at-home's own sportsbook and banking backends |
| Optional access to other addresses | Only for a bookmaker address you add yourself, and only after the browser asks you |

## Limited use

Your data is never sold, never shared, never used for advertising, and never used to train anything.
It is used for one purpose: showing you your own betting history inside this extension.

## Your rights

There is no controller holding your data, because it never leaves your device — there is nobody to
send an access or erasure request to. Everything the extension knows is in your browser, readable
under Settings and removable with the buttons there.

## Age

For adults only. The extension is not intended for anyone under 18. If gambling stops being
something you control, your national helpline is free and confidential.

## Changes

If a later version ever collects more than this, the policy changes with it and the new version asks
before it starts. The version and date at the top of this page say which policy is in force.

Questions: info.m04studio@gmail.com
