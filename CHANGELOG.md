# Changelog

## 1.0.2 — August 2026

Nothing to click, and money that shows up when it happens.

- **A supported site is read the moment you open it.** 1.0.1 asked you to open
  the popup and grant the site first, on a page the extension already knew.
- **A deposit is in the app before you leave the page.** bet-at-home was watched
  only through the figure in its header, and the cashier does not always redraw
  it - so the deposit waited for the next scheduled read.
- **Deposits and bonuses no longer need a trip to the payments page.**
  bet-at-home keeps them on a session of its own, which it offers on every page
  it loads - but it offers it before the extension has asked whether you want
  this site read at all, and the answer arriving second meant the session had
  already been thrown away. It is held until you answer now, and dropped if you
  say no.
- **No more being told to sign in while you are signed in.** The extension read
  "no session captured yet" as "signed out", and the session is not on every
  page of a site - on the cashier it is on none of them. The page is asked now,
  and asked again when it changes, so signing in without reloading is noticed.
- **An account already read stays on screen.** A page that had not yet made the
  site's authenticated call put a line about your session over everything the
  extension already knew about the account. That line is now only for a site
  nothing has ever been read from.
- **A session running out is no longer reported as a fault.** These sites hand
  out tokens that expire roughly hourly whether or not anyone signed out, and
  each one marked a healthy account as stuck and put a warning in the log - over
  something the extension repaired by itself seconds later. Only a revival that
  comes back empty is reported now.
- **Read again always reads again.** After one reload that came back without a
  session, the site was never reloaded again for the rest of the browser
  session: the button ran, found nothing to work with, and said nothing at all
  until the popup gave up 45 seconds later with "No answer from the site". The
  reload is now held off for a minute rather than for good, and a run with no
  session to use says so at once.
- **A lost session says what to do about it.** It used to read "Stopped part-way
  - check the log", which named no cause and pointed at a log that had nothing
  actionable in it.
- **The site list is only sites that exist.** A dead address and a duplicate came
  out of it.

## 1.0.1 — August 2026

Fixes to the part where you add a bookmaker of your own.

- **The right name on the popup.** A newly added bookmaker introduced itself
  under the name of the one its folder was copied from.
- **Recording a site now records it.** A recording started on a page that had
  already loaded caught nothing, so the page is reloaded and asks again.
- **Your name comes off the recording**, including at sites that do not label
  their fields in English - the tool asks which words are yours.
- **And nothing else does.** It had been rewriting long endpoint names and
  double-encoding addresses, breaking recordings it had just cleaned.

## 1.0.0 — August 2026

The first release. Everything you need to see how your betting is really going.

- **One dashboard** for every bookmaker account you play at.
- **Your real result** — profit, ROI, turnover and win rate, in one currency.
- **Profit over time**, by day, week, month or a period you pick.
- **What is working** — sports, leagues, odds and stake sizes, ranked by what they earned you.
- **Running bets** with live scores.
- **Deposits, withdrawals and bonuses**, counted properly.
- **A backup file** of everything, saved to your computer.
- **All of it local.** No account, no server, no tracking.
