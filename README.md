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

</div>

***

<div align="center">

### You have a bet on tonight.

You had one last Tuesday. A few in March you have stopped thinking about.

Your bookmaker shows today's balance and a list going back a few pages,<br>
one account at a time. So the one question you actually have,

<h3>am I up, or am I down?</h3>

has no answer on the screen.

<b>BETtracker reads your own history and answers it.</b>

</div>

***

## Install

<table>
<tr>
<td width="34%" valign="top">

### Edge
**One click.**

<a href="https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi">Get it from Microsoft&nbsp;Edge&nbsp;Add&#8209;ons</a>

<sub>Reviewed by Microsoft. Updates itself.</sub>

</td>
<td width="33%" valign="top">

### Chrome, Brave, Opera
**Two minutes, once.**

1. [Download the zip](https://github.com/Martinek16/BETtracker/releases/latest) and unzip it
2. Open `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked**, pick the folder

<sub>Keep that folder. Deleting it uninstalls the extension.</sub>

</td>
<td width="33%" valign="top">

### Firefox
**Not yet.**

Firefox does not run Manifest&nbsp;V3 background workers, which is what this is built on.

<sub>One build change away. Help welcome.</sub>

</td>
</tr>
</table>

> [!NOTE]
> There is no Chrome listing because Google removes gambling related extensions from its store, even ones that only read your own history. Edge accepted it.

***

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

<div align="center">
<sub>Older history fills in over the next few visits, read one page at a time so the site is not hammered.<br>
Click the toolbar icon whenever you want the dashboard.</sub>
</div>

***

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
<td valign="top">

### Where it comes from
By sport, league, market, odds band, stake size or time. What earns, and what quietly costs.

</td>
<td valign="top">

### Every euro in, every euro out
Deposits, withdrawals, and what a bonus turned out to be worth rather than what it promised.

</td>
</tr>
</table>

<div align="center">
<sub>It only looks backwards. No tips, no predictions, no telling you what to bet.</sub><br><br>
<a href="docs/HOW_IT_WORKS.md"><b>How it works, screen by screen</b></a>
</div>

***

## Bookmakers it can read

<div align="center">

| Bookmaker | Bets | Balance | Money in and out | Bonuses |
|:--|:-:|:-:|:-:|:-:|
| [**bet-at-home**](extension/src/bookmakers/bet-at-home/) | Yes | Yes | Yes | Yes |
| [**Stake**](extension/src/bookmakers/stake/) | Yes | Yes | Yes | Yes |

<sub>Both work on all their addresses. Country domains, numbered mirrors, and whatever they switch to next.</sub>

</div>

***

## Your data never leaves

<table>
<tr>
<td width="25%" align="center"><b>No account</b><br><sub>Nothing to sign up for</sub></td>
<td width="25%" align="center"><b>No server</b><br><sub>There is nothing to breach</sub></td>
<td width="25%" align="center"><b>No tracking</b><br><sub>No analytics, no ads</sub></td>
<td width="25%" align="center"><b>No password</b><br><sub>It never sees one</sub></td>
</tr>
</table>

Your bets, payments and balances stay in your browser, on your disk. It reads pages you already opened, so it cannot place a bet, deposit or withdraw. Export everything to a file whenever you like, or delete the lot in one click.

Besides your bookmakers, the extension calls exactly two addresses: a public exchange rate feed and a public coin price feed. Neither is told anything about you. A test in the build fails if any bookmaker ever names a third.

<div align="center"><a href="PRIVACY.md"><b>Full privacy policy</b></a></div>

***

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

<br>

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

## A bookmaker is one folder

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

## Four steps, one evening

1. **Record.** Click through your own bet history with DevTools open, and save it.
2. **Strip it.** One command removes your tokens, your name and your account number.
3. **Let it write.** `/add-bookmaker yoursite` in Claude Code reads the recording and writes the folder.
4. **Prove it.** Load the extension, check your own numbers, open a pull request.

<a href="docs/ADD_A_BOOKMAKER.md"><b>The whole process, step by step</b></a>

</td>
</tr>
</table>

<br>

<div align="center">

### Other ways to help

</div>

<table>
<tr>
<td width="25%" valign="top" align="center">

**Your site broke**

Bookmakers change their API without telling anyone. Fix the folder you use.

</td>
<td width="25%" valign="top" align="center">

**Ask for a site**

No account there yourself? [Request it](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml) and somebody who plays there may pick it up.

</td>
<td width="25%" valign="top" align="center">

**Report a bug**

A number that looks wrong is worth an [issue](https://github.com/Martinek16/BETtracker/issues/new?template=bug.yml). Wrong figures are the only real failure here.

</td>
<td width="25%" valign="top" align="center">

**Bring Firefox**

Manifest V3 background workers are the one thing in the way. [Say hello](https://github.com/Martinek16/BETtracker/discussions) if you know that ground.

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
