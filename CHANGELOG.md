# Changelog

## 1.1.0 — August 2026

The casino gets a page. Until now this app had one honest thing to say about
slots: your balance is lower than your bets explain, and the difference went
somewhere. That is still all most bookmakers will tell anyone. Stake is
different — it hands out its casino rounds one at a time, the same way it hands
out bets — so where the site keeps that history, it is now read and read
properly.

### The casino

- **A page of its own, built out of rounds.** What the casino cost you, what
  came back for every unit staked, how many rounds paid more than they took, and
  your best round beside your worst. The period picker cuts it the way it cuts
  bets, because every figure on it is counted from individual rounds rather than
  from a balance.
- **None of it touches your sports figures.** A spin is not a bet. Profit, ROI,
  win rate and every breakdown under Analytics read exactly as they did before,
  whatever happened at the tables. The two are added up in one place only — the
  account card, which is where the question "am I up" actually lives.
- **Which games took the money.** One row per game with rounds, stake, payout
  and what came back per unit, sortable on any column. Blackjack, roulette,
  mines, plinko and the rest carry their own mark; anything else carries the mark
  of the part of the casino it was played in.
- **What a round cost, and what it paid.** Two ladders on one switch. By stake,
  the rungs are cut from the play itself — round prices, only the ones your
  rounds actually cross, and no band left holding a quarter of the turnover. By
  payout, they are multiples of the stake, from nothing back to a hundred times.
- **Your evenings, read back as evenings.** Rounds fall into sittings — half an
  hour without a round ends one — newest first, each with its own result. No site
  records a sitting; it is inferred, because "1,400 rounds this month" is not
  something anybody can act on and "that Friday cost you 180" is.
- **Click a game or a sitting and the chart narrows to it**, with its name over
  the top and one click back out. Hovering a round in the list marks it on the
  curve.
- **The chart draws rounds evenly, not by the clock.** An evening puts hundreds
  of spins inside an hour, and a time axis draws that as a vertical wall.
- **The account's casino result is Stake's own figure now**, where the site
  states one, instead of being inferred from the gap in the wallet.
- **The page can be switched off** under Settings, Appearance, and it only
  appears at all if one of your accounts is at a site with a casino.

Two honest limits. **Live-casino tables are missing from the page**: Stake sends
those rounds without a time, and a round with no time cannot be put on a period
or on a curve, so it is dropped rather than stamped with a guess. And the
history reaches back only as far as the site still hands out, so the page's
total can be smaller than the lifetime casino result on the account card. Both
of those are the site's limit, not a setting.

### Analytics

- **"Did your picks beat the price?" answers with the whole curve now.** It used
  to be one bar and a sentence, with a separate card underneath listing the odds
  bands. They are one thing: every band drawn, your hit rate against what the
  price promised, and the gap named in the tooltip. One card fewer, and the
  reading is no longer split across two of them.
- **A middle answer exists.** The verdict was Yes, No, or too close to call, and
  "No" fired at anyone whose gap was negative by any amount at all — which is
  nearly everyone, because the price already carries the bookmaker's cut of
  about 5%. It now reads **Level** where you are doing what a fair bettor should
  expect to do, and **No** is kept for actually losing to the price.
- **The threshold for trusting a row follows Settings.** The cards had ten picks
  hardcoded while Settings offered 20, 50, 100 or off. It is one number now, and
  the text on screen quotes the one you chose.
- **The breakdowns lead with the answer.** "Which sports?" is now "Which sports
  beat their price?", and the rows are ordered by how far above or below their
  price they came in rather than by how often you backed them. Rows too thin to
  trust sit under the ones that are not, drawn faint. Where nothing clears your
  threshold the card names the front-runner in grey instead of showing nothing.
- **Leagues carry their country's flag and teams their sport's mark**, the lists
  are as long as the page can hold rather than cut at four, and their column
  headings stay put while you scroll them.

### The rest

- **The privacy policy moves to 1.1.0** and says what is now true: casino rounds
  are read at a site that records them one by one, and nothing about the casino
  is stored anywhere else. It is the one document in the project that has to be
  right about this, so it names what changed since 1.0.0 rather than quietly
  reading differently.
- **A copy installed by hand now says when a new version is out.** Chrome will
  not carry a betting extension, so outside Edge this is loaded from a folder
  and no browser will ever update it. When your browser opens it reads the
  project's newest release number and, if that release is a version ahead — 1.2
  to 1.3, not 1.2 to 1.2.1 — the header carries a link to it. The Edge copy
  updates itself and is left alone.
- **Bonus codes claimed at Stake arrive now.** They were read off the list of
  codes rather than off the payments, and a code the site no longer resolves
  left nothing to read them by — so a coupon that had paid out simply never
  appeared. They come out of the wallet ledger, the same place the site itself
  reads them, and the bonus drops handed out in chat come with them.
- **A bookmaker that moves its API is an error, not an empty history.** The
  account card says the site has changed and the adapter needs an update, and
  the figures stay where they were instead of quietly reading as "no more bets".
- **A blocked database upgrade no longer stalls the dashboard** on "Loading…"
  when the app is open in a second tab.
- **The sidebar reads in the order the questions come** — Overview, Analytics,
  Bets, Casino, Cashflow, Bonuses — with the groups ruled apart.
- **The break-even line is visible again** on the profit charts, instead of
  blending into the grid behind it.
- **A sideways flick of a mouse wheel no longer outlines the table in white.**
  Chrome treats every scrolling box as something you can tab to, and draws its
  own heavy ring around one the moment a wheel touches it. A thin line in the
  theme's own colour does that job now, so a keyboard can still find its way
  without a table lighting up every time the wheel moves.
- **Bonuses only turn green when they are actually finished.** A bonus still
  being wagered was badged the same as one you had cleared, and a bonus the
  extension never watched being played through showed its face value in profit
  colours as though it were money you had won. Both read plainly now, and the
  description column has the room it needed.
- **The Firefox target is gone from the build.** There was never a Firefox
  listing to install from, so it was a target nobody could ever have used.
  Chromium is what this ships to.

## 1.0.2 — August 2026

Nothing to click, money that shows up when it happens, and analytics you can
trust to say the same thing twice.

### Analytics

- **A league keeps its name and its flag whichever bookmaker you filter to.** The
  row's name and country were read off the bets on screen, so narrowing to one
  book could rename a competition or take its flag away. They are read off every
  bet now. A country your books spell their own way is recognised too.
- **A one-off group no longer tops the table.** Settings has a threshold — 20
  picks by default, or 50, 100, or off. Below it a group is sorted under the
  ranked ones, behind a line saying why, rather than heading a profit sort on a
  single lucky bet. It applies to any breakdown with more than 15 rows.
- **The Odds column is the price in the middle, not the average.** One 50.00 punt
  used to make a group of evens bets read as long odds.
- **"Did the prices hold up?" was reading the promise wrong.** It measured what
  the average price promises instead of what the prices promised on average —
  which flattered every band holding one long shot.
- **Stake bands are cut where your bets actually sit.** A band holding most of
  the period is split at a round number near the middle of it, so it stops being
  one row you cannot act on.
- **Slips open in their own order** — single before combo, small stake before
  large — instead of most-backed first. Any other order is one click on a column
  away.
- **The wide column switches between money and hit rate** when you click its
  heading, and a record a run of luck would explain just as well is drawn faint.

### The rest

- **Settings, About and Privacy read tighter**, and the guided tour sits with
  Appearance where it belongs.
- **The bonus expiry notice is gone.** It fired on a date the site rarely gives
  and told you nothing you could act on.

### Reading your accounts

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
