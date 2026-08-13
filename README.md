<p align="center">
  <img src="img/screenshot.png" alt="BETtracker dashboard" width="100%">
</p>

<h1 align="center">BETtracker</h1>

<p align="center">
  <b>All your bets. One clear view.</b><br>
  Your betting history from every bookmaker you play at, in one dashboard — on your computer only.
</p>

<p align="center">
  <a href="https://github.com/Martinek16/BETtracker/actions/workflows/ci.yml"><img src="https://github.com/Martinek16/BETtracker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Martinek16/BETtracker/releases/latest"><img src="https://img.shields.io/github/v/release/Martinek16/BETtracker" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/data-100%25%20local-2ea44f" alt="100% local">
  <img src="https://img.shields.io/badge/tracking-none-2ea44f" alt="No tracking">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue" alt="MIT"></a>
  <img src="https://img.shields.io/badge/age-18%2B-orange" alt="18+">
</p>

---

## Why

A bookmaker shows you today's balance and a list going back a few pages, one account at a time.
Whether you are up or down over a year has no answer on the screen. **BETtracker gives it.**

You do not type anything in. You do not sign up. Nothing is uploaded.

---

## What you get

| | |
| --- | --- |
| **Your real result** | Profit, ROI, turnover, average stake and win rate — every account at once, in one currency |
| **Profit over time** | How you got here, by day, week, month or a period you pick |
| **What is working** | Which sports, leagues, odds and stake sizes earned you money, and which quietly cost you |
| **Running bets** | The slips still open, with the live score |
| **Money and bonuses** | Deposits, withdrawals, and what a bonus is really worth |
| **Your own backup** | One file with everything, saved to your computer |

It only looks backwards. No tips, no predictions, no telling you what to bet.

---

## Install

There is no store listing. The extension stores remove anything to do with
gambling, whether or not it takes your money — so it is published here instead,
in the open, where you can also read every line of what you are installing.

### Chrome, Edge, Brave, Opera, Vivaldi

1. Download **`bettracker.zip`** from the [latest release](https://github.com/Martinek16/BETtracker/releases/latest) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and choose the folder you unzipped.

Keep the folder — deleting it uninstalls the extension. To update, download the
new release, replace the folder's contents, and hit reload on the extensions
page. Your data stays where it is.

Chrome will show a "developer mode extensions" warning on startup. That is
Chrome telling you it did not review this, which is accurate.

<a id="firefox"></a>
### Firefox

**Not supported yet.** The background script is a service worker, which Firefox
still does not run under Manifest V3. Everything else is compatible, so this is
one build change away — [#1](https://github.com/Martinek16/BETtracker/issues)
if you want to pick it up.

### Or build it yourself

```bash
git clone https://github.com/Martinek16/BETtracker
cd BETtracker
corepack enable
pnpm install
pnpm build
```

Then **Load unpacked** and pick `extension/dist`.

---

## Then

**1. Open a bookmaker** you play at and sign in as you always do.

**2. Answer yes** when the extension asks whether it may read that account.

Your bets appear in the dashboard, and older history fills in over the next few
visits — it is read a page at a time so the site is not hammered. Click the
toolbar icon to open the dashboard any time.

---

## Supported bookmakers

| Bookmaker | Bets | Balance | Money | Bonuses |
| --- | :-: | :-: | :-: | :-: |
| [bet-at-home](extension/src/bookmakers/bet-at-home/) | ✅ | ✅ | ✅ | ✅ |
| [Stake](extension/src/bookmakers/stake/) | ✅ | ✅ | ✅ | ✅ |

Both work on all their addresses — country domains, numbered mirrors and
whatever they switch to next.

### Yours is not on the list

Add it. A bookmaker is one folder, and the project is built so that adding one
touches nothing else:

```
extension/src/bookmakers/your-site/
  bookmaker.json    capture.ts    adapter.ts
  adapter.test.ts   logo.png      __fixtures__/
```

You record your own bet history with DevTools open, run the recording through
`pnpm sanitize-har` to strip the tokens out of it, and `/add-bookmaker` in
Claude Code reads it and writes the folder.

**→ [docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md)**

You need an account at the site — support is written from a real session, and
there is no way around that. If you want one added and cannot do it yourself,
[open a request](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml).

---

## Contributing

**You may add a bookmaker. The shared core is closed.** One change there can
break every site at once, and the person who finds out is a stranger whose
figures went quietly wrong. CI enforces it.

Everything else is welcome: fixes to a bookmaker you use, tests, documentation.

**→ [CONTRIBUTING.md](CONTRIBUTING.md)**

---

## Common questions

<details>
<summary><b>Do I need an account?</b></summary><br>
No. There is no sign-up, no login and no server behind the extension.
</details>

<details>
<summary><b>Where is my data kept?</b></summary><br>
In your browser, on your computer. It is never uploaded, sold or shared. Export it to a file whenever you want.
</details>

<details>
<summary><b>Can it place bets with my money?</b></summary><br>
No. It only reads pages you have already opened. It cannot bet, deposit or withdraw, and it never
sees your password.
</details>

<details>
<summary><b>Why is an old bet missing?</b></summary><br>
Long histories are read backwards a page at a time. Open the bookmaker and leave the tab a moment.
</details>

<details>
<summary><b>Why did an account stop updating?</b></summary><br>
The bookmaker signed you out. Open its site again and the extension picks up where it left off.
</details>

<details>
<summary><b>Is casino play counted?</b></summary><br>
No. Only sports bets are read. Casino money shows up only as a smaller balance.
</details>

<details>
<summary><b>Will my bookmaker mind?</b></summary><br>
It reads the same pages your browser already loaded, using your own session, at a slower rate than
you clicking. That said, plenty of bookmakers' terms are written broadly enough to cover anything
they dislike. Your account, your call.
</details>

<details>
<summary><b>Why not on the Chrome Web Store?</b></summary><br>
Gambling-related extensions get removed, including ones that only read your own history. Publishing
here means it cannot be taken down, and you can read the source before you install it.
</details>

---

## Privacy

Your bets, payments and balances never leave your computer. No account, no
server, no tracking, no ads. The only addresses the extension calls on its own
are a public exchange-rate feed and a public coin-price feed, and neither is
told anything about you.

Full policy: **[PRIVACY.md](PRIVACY.md)** · Security: **[SECURITY.md](SECURITY.md)**

---

## Help

- **Something is broken** → [open an issue](https://github.com/Martinek16/BETtracker/issues/new?template=bug.yml)
- **A question or an idea** → [Discussions](https://github.com/Martinek16/BETtracker/discussions)
- **A security problem** → [report it privately](https://github.com/Martinek16/BETtracker/security/advisories/new), not in an issue

---

<p align="center">
  <sub>MIT licensed. For adults only.<br>
  This tool measures losses. It does not stop them. If gambling stops being something you control,
  <a href="https://www.begambleaware.org/">BeGambleAware</a> and
  <a href="https://www.gamblersanonymous.org/">Gamblers Anonymous</a> are free and confidential.</sub>
</p>
