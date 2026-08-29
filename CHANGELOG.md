# Changelog

All notable changes to BETtracker are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] — August 2026

### Added

- Rakeback tracking for bookmakers that pay it (currently Stake): the amount waiting to be claimed appears in the balance breakdown and on the account page, stated apart from the balance, since the bookmaker holds it until it is asked for.
- Notice when uncollected rakeback grows beyond the amount last reported, so a reward left sitting is noticed. It repeats only on growth, names no deadline, and can be switched off in **Settings**.
- Bookmaker capability flags for a bonus wallet and for rakeback. Settings and balance rows that depend on either are shown only for accounts that have them.

### Changed

- Casino return is stated as a result against stake (−3%) rather than as a share of it (97%), on both the metric card and the per-game column, and is coloured like every other result on the page.
- Bet history layout: **Bet** follows the date at the size of the surrounding columns and **Type** follows it; combinations of two to four selections are named Double, Triple and Quadruple; columns and headings are centred, except fixture names, which keep a left edge; the profit colour is carried by **Return** rather than by **P/L**.
- An expanded slip reads as a sequence of fixtures rather than a list of dates: the date is written once per day, each fixture carries its kickoff time, the result is carried by the colour of the sport icon, and a rule appears only where the day changes. A bet builder's combined price is shown beside the fixture it was struck for instead of in the **Odds** column.
- An expanded slip and an expanded bonus are marked with a left rule and a faint accent tint in place of a grey block. Hovering any selection highlights the whole fixture, so a bet builder is not split into separate lines under the pointer.
- Cashflow and bonuses tables use the same row height as the bet history.
- Balance breakdown lists a holding on the coin's own amount rather than on its converted value, so a wallet spread across several coins is no longer reduced to one line.
- Settings labels name what each control changes and state the result, instead of naming the mechanism behind it.

### Fixed

- The Stake rewards query requested the rakeback rate, which some accounts may not read. The refusal returns the entire user object as null, so every reward went missing and nothing was reported as waiting while the site showed money available. The query now asks for no more than Stake's own page does.
- Rakeback begins accruing again the moment it is claimed, so an emptied account still reported a fraction of a coin and was offered as a claim that had already been made. Amounts below what the display currency can express are ignored.
- Values under one cent are omitted rather than printed as `0,00` or `< 0,01`, which put a line on screen for money that cannot be acted on.
- Whether a balance holds non-withdrawable bonus money was inferred from the presence of coin holdings, a different question that happened to give the right answer. It is now declared per bookmaker.
- Sort headings sat slightly left of the columns they name, because the sort arrow shared the label's box.

### Removed

- Rakeback figure in the navigation bar. Placed next to the balance it read as money in the account; it now appears under the account it is waiting at.

## [1.1.2] — August 2026

### Added

- Casino stops in the guided tour; they are skipped for accounts whose bookmaker has no casino.

### Changed

- Consolidated duplicate UI components: the collapsible search control (three implementations) and the sortable table header (two implementations) are now shared, so they behave identically on every page.
- An empty bonuses page shows an explanatory message instead of blank space.
- Monetary values in the bet table are right-aligned, consistent with other tables.

### Fixed

- Open-bets cards were drawn on the page background instead of the card surface in dark theme.
- Clickable figures on the Overview page showed no focus ring when reached by keyboard.

## [1.1.1] — August 2026

### Added

- **Open bets page** (Bets → Open bets): every undecided slip as a card grid instead of a scrolling drawer.
- Live/Open toggle with separate counts, plus total stake and total potential return, all responding to the active filter, sort and search.
- Sorting by start time, stake or potential return; filtering by account; search across teams, leagues, markets and picks.
- Collapsed cards show one line per fixture with either the current score or the scheduled start time; expanded cards show every pick, its price and the current cash-out value.
- Expand-all / collapse-all control; columns re-pack to roughly equal heights while preserving sort order.

### Changed

- Singles use the same card layout as multiples and no longer show price and market on the collapsed card.
- Start time is displayed before score wherever both appear.
- A cancelled fixture keeps its row in the bet table, struck through.

### Fixed

- Sports played sequentially on the same court or table (tennis, darts, snooker, boxing, chess) were marked live from their scheduled start time, which the bookmaker does not update when an earlier match overruns. Such slips now move to Live only when the bookmaker reports the match as in play.
- A scoreline sent without a clock was not recognised as an in-play match.
- The statuses "Scheduled" and "Start delayed" were not recognised as not-yet-started.
- Stake's cash-out value was left blank instead of being read from the site; it is now also cleared as soon as cash-out is withdrawn.
- Crypto holdings worth less than one cent were listed as zero-value rows in the balance breakdown, pushing meaningful lines out of view.

## [1.1.0] — August 2026

### Added

- **Casino page** built from individual rounds, available where the bookmaker records them (currently Stake): total cost, return per unit staked, share of winning rounds, and best round against worst. The period picker applies as it does to bets.
- Per-game breakdown with rounds, stake, payout and return per unit, sortable on any column. Known games (blackjack, roulette, mines, plinko and others) carry their own icon; the rest are marked by casino section.
- Two distribution views on one toggle: by stake, with buckets derived from the round prices actually played, and by payout multiple, from 0x to 100x.
- Session grouping: 30 minutes without a round starts a new session. Sessions are listed newest first, each with its own result.
- Filtering the chart by game or session with one click, and highlighting a round on the curve on hover.
- Option to disable the Casino page in **Settings → Appearance**. The page appears only if at least one account is at a site with a casino.
- Update check for manually installed copies: on browser start the extension reads the latest release number and links to it when a new minor version is available (1.2 → 1.3, not 1.2 → 1.2.1). Store-installed copies update themselves and are unaffected.

### Changed

- Casino results are excluded from all sports figures — profit, ROI, win rate and every Analytics breakdown are unchanged by casino activity. The two are combined only on the account card.
- The casino chart plots rounds evenly rather than on a time axis, so a single evening does not collapse into a vertical line.
- The account casino result uses Stake's own reported figure where the site states one, instead of being inferred from wallet movements.
- "Did your picks beat the price?" combines the former summary card and odds-band card into one chart: every band, hit rate against implied probability, and the gap named in the tooltip.
- Added a **Level** verdict for results within the bookmaker margin (approximately 5%). **No** is reserved for genuine underperformance against the price, rather than firing on any negative gap.
- The minimum-sample threshold on the Analytics cards follows the Settings value (20 / 50 / 100 / off) instead of a hardcoded 10, and the on-screen text quotes the selected value.
- Analytics breakdowns are ordered by performance against price rather than by bet count. Low-sample rows are drawn faint below the ranked ones; where nothing clears the threshold, the leading row is named in grey.
- League rows carry their country flag and team rows their sport icon. Lists run as long as the page allows instead of being cut at four, and column headings stay fixed while scrolling.
- Sidebar order follows the reading order: Overview, Analytics, Bets, Casino, Cashflow, Bonuses, with groups separated by rules.
- Privacy policy updated to 1.1.0: it documents that casino rounds are read where the site records them individually, that no casino data is stored elsewhere, and what changed since 1.0.0.

### Fixed

- Bonus codes claimed at Stake were read from the promo-code list instead of the wallet ledger, so a code the site no longer resolved never appeared. They are read from the ledger, together with bonus drops handed out in chat.
- A bookmaker changing its API is reported as an error on the account card ("site changed, adapter needs an update") instead of reading as an empty history. Existing figures are retained.
- A blocked IndexedDB upgrade left the dashboard on "Loading…" when the app was open in a second tab.
- The break-even line was not distinguishable from the grid on profit charts.
- Horizontal wheel scrolling triggered Chrome's default focus ring around scrollable tables; it is replaced by a thin themed outline that keeps the element keyboard-reachable.
- Bonuses still being wagered were badged as completed, and bonuses the extension had not tracked showed their face value in profit colours. Both now display accurately, and the description column was widened.

### Removed

- The Firefox build target. No Firefox listing existed, so the build could not be installed from anywhere. Chromium is the only target.

### Known limitations

- Live-casino rounds are excluded: Stake reports them without a timestamp, and an untimed round cannot be assigned to a period or plotted on a curve.
- Casino history reaches back only as far as the site still serves it, so the page total can be lower than the lifetime casino result on the account card.

## [1.0.2] — August 2026

### Changed

- League name and country are resolved from all bets rather than from the bets currently on screen, so filtering to one bookmaker no longer renames a competition or removes its flag. Bookmaker-specific country spellings are recognised.
- Groups below the Settings sample threshold (default 20; also 50, 100 or off) are sorted below the ranked ones behind an explanatory divider, instead of topping a profit sort on a single lucky bet. Applies to any breakdown with more than 15 rows.
- The Odds column shows the median price instead of the mean, so one 50.00 outsider no longer makes a group of even-money bets read as long odds.
- A stake band holding most of the period is split at a round number near its middle.
- Bet slips expand in a fixed order — single before combo, smaller stake before larger — instead of most-backed first. Any other order is one column click away.
- The wide Analytics column toggles between money and hit rate on heading click, and a record that variance would equally explain is drawn faint.
- Settings, About and Privacy pages were shortened, and the guided tour moved to Appearance.
- A supported site is read as soon as it is opened; 1.0.1 required opening the popup and granting the site first.

### Fixed

- "Did the prices hold up?" measured the implied probability of the average price instead of the average implied probability, which flattered every band holding a long shot.
- bet-at-home deposits were detected only through the header balance, which the cashier does not always redraw, so a deposit waited for the next scheduled read.
- bet-at-home deposits and bonuses required a visit to the payments page. The site offers its session on every page, but before the extension has asked for site permission, so the session was discarded. It is now held until permission is answered, and dropped on refusal.
- The extension reported a signed-out state when no session had been captured yet, although a session is not exposed on every page — and on none of the cashier pages. The page is queried directly and re-queried on change, so signing in without reloading is detected.
- A page that had not yet made the site's authenticated call covered known account data with a session warning. That warning now appears only for sites nothing has ever been read from.
- Hourly token expiry was logged as a fault and marked healthy accounts as stuck, although the extension recovered from it automatically. Only a failed recovery is reported.
- After one reload that returned no session, the site was never reloaded again for the rest of the browser session: "Read again" ran, found nothing to work with, and reported nothing until the popup timed out after 45 seconds. The reload is deferred for one minute, and a run with no usable session reports it immediately.
- A lost session reported "Stopped part-way — check the log", which named no cause and pointed at a log with nothing actionable in it.

### Removed

- The bonus expiry notice, which fired on a date the site rarely provides.
- A dead address and a duplicate entry in the supported-site list.

## [1.0.1] — August 2026

### Fixed

- A newly added bookmaker appeared in the popup under the name of the template it was copied from.
- A recording started on an already-loaded page captured nothing; the page is reloaded and re-recorded.
- Personal names were not removed from recordings at sites that do not label their fields in English. The tool now asks which values belong to the user.
- The recorder rewrote long endpoint names and double-encoded addresses, corrupting recordings it had just sanitised.

## [1.0.0] — August 2026

### Added

- Unified dashboard for every bookmaker account in use.
- Profit, ROI, turnover and win rate, converted to a single currency.
- Profit over time by day, week, month or a custom period.
- Breakdowns by sport, league, odds range and stake size.
- Open bets with live scores.
- Deposits, withdrawals and bonuses.
- Backup export to a local file.
- Fully local processing: no account, no server, no tracking.

[1.1.3]: https://github.com/Martinek16/BETtracker/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/Martinek16/BETtracker/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/Martinek16/BETtracker/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Martinek16/BETtracker/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/Martinek16/BETtracker/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Martinek16/BETtracker/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Martinek16/BETtracker/releases/tag/v1.0.0
