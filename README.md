<div align="center">

<img src="img/screenshot.png" alt="BETtracker dashboard" width="100%">

<h1>BETtracker</h1>

<h3>All your bets. One clear view.</h3>

<p>
  <b>Every bookmaker you play at, in one dashboard.</b><br>
  <sub>On your computer. Nowhere else.</sub>
</p>

<p>
  <a href="https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi">
    <img src="https://img.shields.io/badge/Install%20for%20Microsoft%20Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Install for Microsoft Edge" height="38">
  </a>
  <a href="https://github.com/Martinek16/BETtracker/releases/latest">
    <img src="https://img.shields.io/badge/Download%20for%20Chrome-1a1a1a?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Download for Chrome" height="38">
  </a>
</p>

<p>
  <img src="https://img.shields.io/github/v/release/Martinek16/BETtracker?style=flat-square&label=version" alt="Version">
  <img src="https://img.shields.io/badge/data-100%25%20local-2ea44f?style=flat-square" alt="100% local">
  <img src="https://img.shields.io/badge/accounts-none%20required-2ea44f?style=flat-square" alt="No account">
  <a href="https://github.com/Martinek16/BETtracker/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Martinek16/BETtracker/ci.yml?style=flat-square&label=tests" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

<br>

<h3>You have a bet on tonight.</h3>

You had one last Tuesday. A few in March you have stopped thinking about.

Your bookmaker shows today's balance and a list going back a few pages,<br>
one account at a time. So the one question you actually have,

<h3>am I up, or am I down?</h3>

has no answer on the screen.

<b>BETtracker reads your own history and answers it.</b>

</div>

***

## Install

| Browser | What to do | Worth knowing |
|:--|:--|:--|
| **Edge** | [Get it from Microsoft&nbsp;Edge&nbsp;Add&#8209;ons](https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi). One click. | Reviewed by Microsoft. Updates itself. |
| **Chrome, Brave, Opera** | [Download the zip](https://github.com/Martinek16/BETtracker/releases/latest) and unzip it. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder. | Two minutes, once. Keep that folder: deleting it uninstalls the extension. |

> [!NOTE]
> There is no Chrome listing because Google removes gambling related extensions from its store, even ones that only read your own history. Edge accepted it.

## Then two things happen

<table>
<tr>
<td width="50%" valign="top">

### 1. You sign in as normal

Open a bookmaker you play at. Nothing changes about how you use it.

</td>
<td width="50%" valign="top">

### 2. You say yes, once

The extension asks whether it may read that account. Your bets appear.

</td>
</tr>
</table>

<sub>Older history fills in over the next few visits, read one page at a time so the site is not hammered. Click the toolbar icon whenever you want the dashboard.</sub>

## What you see

<table>
<tr>
<td width="50%" valign="top">

### Every bet, to the cent

From stake to payout. Combos open into their legs, each with its own pick, price and result.

</td>
<td width="50%" valign="top">

### Luck, or skill

Whether the prices you take are honest ones. Whether you chase after a loss. What your worst run cost you.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Where it comes from

By sport, league, market, odds band, stake size or time. What earns, and what quietly costs.

</td>
<td width="50%" valign="top">

### Every euro in, every euro out

Deposits, withdrawals, and what a bonus turned out to be worth rather than what it promised.

</td>
</tr>
</table>

<sub>It only looks backwards. No tips, no predictions, no telling you what to bet.</sub> &nbsp;·&nbsp; [**How it works, screen by screen**](docs/HOW_IT_WORKS.md)

## Bookmakers it can read

| Bookmaker | Bets | Balance | Money in and out | Bonuses |
|:--|:-:|:-:|:-:|:-:|
| [**bet-at-home**](extension/src/bookmakers/bet-at-home/) | Yes | Yes | Yes | Yes |
| [**Stake**](extension/src/bookmakers/stake/) | Yes | Yes | Yes | Yes |

<sub>Both work on all their addresses. Country domains, numbered mirrors, and whatever they switch to next.</sub>

## Your data never leaves

<table>
<tr>
<td width="50%" valign="top">

### No account, no server

Nothing to sign up for, and nothing standing between you and your figures. There is no database of yours to breach.

</td>
<td width="50%" valign="top">

### No tracking, no password

No analytics and no ads. It reads pages you already opened, so it never sees a password and cannot place a bet, deposit or withdraw.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Yours to take, or to burn

Your bets, payments and balances stay in your browser, on your disk. Export the lot to a file whenever you like, or delete it in one click.

</td>
<td width="50%" valign="top">

### Two addresses, and no more

Besides your bookmakers: a public exchange rate feed and a public coin price feed. Neither is told anything about you, and a test in the build fails if a bookmaker ever names a third.

</td>
</tr>
</table>

<sub>Read the whole of it:</sub> [**Privacy policy**](PRIVACY.md)

## Questions people ask

<details>
<summary><b>Can it bet with my money?</b></summary><br>
No. It only reads pages you have already opened. It cannot place a bet, deposit or withdraw, and it never sees your password.
</details>

<details>
<summary><b>Why is an old bet missing?</b></summary><br>
Long histories are read backwards, one page at a time. Open the bookmaker and leave the tab a moment.
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
<summary><b>What about currencies, and crypto?</b></summary><br>
Everything is converted on the day the bet was placed, not today, so last year's profit does not move because a rate did. Crypto stakes are priced the same way, through the coin's own daily close.
</details>

<details>
<summary><b>Will my bookmaker mind?</b></summary><br>
It reads the same pages your browser already loaded, with your own session, slower than you clicking. That said, plenty of bookmakers write their terms broadly enough to cover anything they dislike. Your account, your call.
</details>

***

<div align="center">

# Join in

### Your bookmaker is missing? Add it.

<sub>Nobody can keep up with every betting site. That is why this is open.</sub>

</div>

<br>

<table>
<tr>
<td width="50%" valign="top">

### A bookmaker is one folder

Everything a site needs lives in a single directory. How it is recognised, how it is read, its logo, its recorded test data. Adding one touches nothing else in the project, which is what makes a stranger's work reviewable in an evening.

```
extension/src/bookmakers/your-site/
   bookmaker.json     what the site is called
   capture.ts         how it is recognised
   adapter.ts         how it is read
   samples.ts         proof it parsed
   logo.png           its mark
   __fixtures__/      recorded answers
```

</td>
<td width="50%" valign="top">

### Four steps, one evening

1. **Record.** Click through your own bet history with DevTools open, and save it.
2. **Strip it.** One command removes your tokens, your name and your account number.
3. **Let it write.** `/add-bookmaker yoursite` in Claude Code reads the recording and writes the folder.
4. **Prove it.** Load the extension, check your own numbers, open a pull request.

[**The whole process, step by step**](docs/ADD_A_BOOKMAKER.md)

</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">

### Your site broke

Bookmakers change their API without telling anyone. Fix the folder you use.

</td>
<td width="50%" valign="top">

### Ask for a site

No account there yourself? [Request it](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml) and somebody who plays there may pick it up.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Report a bug

A number that looks wrong is worth an [issue](https://github.com/Martinek16/BETtracker/issues/new?template=bug.yml). Wrong figures are the only real failure here.

</td>
<td width="50%" valign="top">

### Say what is missing

A figure you keep working out by hand belongs on a screen. [Say so](https://github.com/Martinek16/BETtracker/discussions).

</td>
</tr>
</table>

> [!IMPORTANT]
> **You may add a bookmaker. The shared core stays closed.** One change to how bets are stored or totalled can break every site at once, and the person who finds out is a stranger whose figures went quietly wrong. So contributions add sites, they do not change how sites work. CI checks it before a human reads the pull request, and every folder is held to the same tests: no invented ids, no money that is not a number, no site talking to a host that is not its own.

<div align="center">

[**Contributing guide**](CONTRIBUTING.md) &nbsp;·&nbsp; [**Discussions**](https://github.com/Martinek16/BETtracker/discussions) &nbsp;·&nbsp; [**Security**](https://github.com/Martinek16/BETtracker/security/advisories/new)

</div>

***

<div align="center">
<sub>
MIT licensed. For adults only.<br><br>
This tool measures losses. It does not stop them.<br>
If gambling stops being something you control,
<a href="https://www.begambleaware.org/">BeGambleAware</a> and
<a href="https://www.gamblersanonymous.org/">Gamblers Anonymous</a> are free and confidential.
</sub>
</div>
