<p align="center">
  <img src="img/screenshot.png" alt="BETtracker dashboard" width="100%">
</p>

<h1 align="center">BETtracker</h1>

<p align="center">
  <b>All your bets. One clear view.</b><br>
  Your betting history from every bookmaker you play at, in one dashboard — on your computer only.
</p>

<p align="center">
  <a href="https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi"><img src="https://img.shields.io/badge/Microsoft%20Edge-Install-0078D7?logo=microsoftedge&logoColor=white" alt="Install from Microsoft Edge Add-ons"></a>
  <a href="https://github.com/Martinek16/BETtracker/releases/latest"><img src="https://img.shields.io/github/v/release/Martinek16/BETtracker" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/data-100%25%20local-2ea44f" alt="100% local">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue" alt="MIT"></a>
</p>

---

You have a bet on tonight. You had one last Tuesday, and a few in March you have
stopped thinking about. The bookmaker shows you today's balance and a list going
back a few pages, one account at a time.

So the one question you actually have — **am I up or down?** — has no answer on
the screen.

BETtracker reads your own history, from every bookmaker you use, and answers it.
Profit, ROI, win rate, what you are good at and what quietly costs you. You type
nothing in. You sign up for nothing. Nothing is uploaded.

It only looks backwards. No tips, no predictions, no telling you what to bet.

---

## Install

### Edge — one click

**[→ Get it from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi)**

Reviewed by Microsoft, and it updates itself.

### Chrome, Brave, Opera, Vivaldi

Google does not allow gambling-related extensions in its store, so there is no
Chrome listing. It still runs on Chrome — you just add it by hand, once:

1. Download **`bettracker.zip`** from the [latest release](https://github.com/Martinek16/BETtracker/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**, top right.
3. Click **Load unpacked** and choose the folder you unzipped.

Keep that folder — deleting it uninstalls the extension.

### Firefox

Not yet. Firefox does not run Manifest V3 background workers, and that is what
this is built on.

---

## Then

1. **Open a bookmaker** you play at and sign in as you always do.
2. **Say yes** when the extension asks whether it may read that account.

That is it. Your bets appear, and older history fills in over the next few
visits — it is read a page at a time so the site is not hammered. Click the
toolbar icon whenever you want the dashboard.

---

## Bookmakers it can read

| | Bets | Balance | Money in and out | Bonuses |
| --- | :-: | :-: | :-: | :-: |
| [bet-at-home](extension/src/bookmakers/bet-at-home/) | ✅ | ✅ | ✅ | ✅ |
| [Stake](extension/src/bookmakers/stake/) | ✅ | ✅ | ✅ | ✅ |

Both work on all their addresses — country domains, numbered mirrors, and
whatever they switch to next.

**Yours is missing?** Add it. A bookmaker is one folder and nothing else in the
project moves. You record your own history with DevTools open, strip the tokens
out of the recording with one command, and Claude Code writes the folder from it.

**→ [Add a bookmaker](docs/ADD_A_BOOKMAKER.md)** · or
[ask for one](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml)

---

## Questions people ask

<details>
<summary><b>Can it bet with my money?</b></summary><br>
No. It only reads pages you have already opened. It cannot bet, deposit or withdraw, and it never
sees your password.
</details>

<details>
<summary><b>Where does my data go?</b></summary><br>
Nowhere. It stays in your browser, on your computer. No account, no server, no tracking, no ads.
The only two addresses the extension calls on its own are a public exchange-rate feed and a public
coin-price feed, and neither is told anything about you. Export the lot to a file whenever you like.
</details>

<details>
<summary><b>Why is an old bet missing?</b></summary><br>
Long histories are read backwards, a page at a time. Open the bookmaker and leave the tab a moment.
</details>

<details>
<summary><b>Why did an account stop updating?</b></summary><br>
The bookmaker signed you out. Open its site again and it picks up where it left off.
</details>

<details>
<summary><b>Is casino play counted?</b></summary><br>
No. Only sports bets. Casino money shows up only as a smaller balance.
</details>

<details>
<summary><b>Will my bookmaker mind?</b></summary><br>
It reads the same pages your browser already loaded, with your own session, slower than you clicking.
That said, plenty of bookmakers' terms are written broadly enough to cover anything they dislike.
Your account, your call.
</details>

---

## More

- **[How it works](docs/HOW_IT_WORKS.md)** — every screen, what happens between signing in and a number appearing, and why it is built this way
- **[Add a bookmaker](docs/ADD_A_BOOKMAKER.md)** — the whole process, an evening the first time
- **[Contributing](CONTRIBUTING.md)** — you may add a bookmaker; the shared core is closed, and CI enforces it
- **[Privacy](PRIVACY.md)** · **[Security](SECURITY.md)** — report a security problem [privately](https://github.com/Martinek16/BETtracker/security/advisories/new), not in an issue
- **Something broken?** [Open an issue](https://github.com/Martinek16/BETtracker/issues/new?template=bug.yml). **An idea?** [Discussions](https://github.com/Martinek16/BETtracker/discussions)

---

<p align="center">
  <sub>MIT licensed. For adults only.<br>
  This tool measures losses. It does not stop them. If gambling stops being something you control,
  <a href="https://www.begambleaware.org/">BeGambleAware</a> and
  <a href="https://www.gamblersanonymous.org/">Gamblers Anonymous</a> are free and confidential.</sub>
</p>
