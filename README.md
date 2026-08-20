<div align="center">

<img src="img/screenshot.png" alt="BETtracker dashboard" width="100%">

<h1>BETtracker</h1>

<h3>Every bookmaker you play at, in one view. On your own computer.</h3>

<p>
  <a href="https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi">
    <img src="https://img.shields.io/badge/Install%20for%20Microsoft%20Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Install for Microsoft Edge" height="38">
  </a>
  <a href="https://github.com/Martinek16/BETtracker/releases/latest/download/bettracker.zip">
    <img src="https://img.shields.io/badge/%E2%AC%87%20Download%20.zip-2ea44f?style=for-the-badge&logoColor=white" alt="Download the zip for Chrome, Brave and Opera" height="38">
  </a>
</p>

<sub>Edge installs itself · the zip is for Chrome, Brave and Opera, and takes <a href="#install">three steps</a></sub>

<p>
  <img src="https://img.shields.io/github/v/release/Martinek16/BETtracker?style=flat-square&label=version" alt="Version">
  <img src="https://img.shields.io/badge/data-100%25%20local-2ea44f?style=flat-square" alt="100% local">
  <img src="https://img.shields.io/badge/accounts-none%20required-2ea44f?style=flat-square" alt="No account">
  <a href="https://github.com/Martinek16/BETtracker/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Martinek16/BETtracker/ci.yml?style=flat-square&label=tests" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

</div>

***

Every bookmaker shows you its own balance and its own last few pages. None of
them shows the rest. So the one question you actually have, **am I up or am I
down**, has no answer on any screen.

BETtracker answers it. Sign in at each bookmaker as you always do, and it reads
the history that is already yours: bets, balances, deposits and withdrawals,
from as many accounts as you play at, added up together across currencies.

It lives in your browser and writes to your own disk. No account to make, no
server, no subscription, nothing to switch on.

## Install

| Browser | What to do | Worth knowing |
|:--|:--|:--|
| **Edge** | [Get it from Microsoft&nbsp;Edge&nbsp;Add&#8209;ons](https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi). One click. | Updates itself, and gains each new bookmaker as it lands. Adding one yourself is the download below. |
| **Chrome, Brave, Opera** | [Download `bettracker.zip`](https://github.com/Martinek16/BETtracker/releases/latest/download/bettracker.zip), then unzip it into a folder you intend to keep. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder. | Unzip it properly, rather than loading it straight out of the archive viewer. Deleting the folder uninstalls the extension. |

> [!NOTE]
> There is no Chrome listing because Google removes gambling related extensions from its store, even ones that only read your own history. Edge accepted it. Download `bettracker.zip`, not **Source code**: the source has to be built first, and Chrome refuses it.

Then open a bookmaker and say yes once when the extension asks whether it may
read that account. Your bets appear. Repeat at the next bookmaker, and the two
sit side by side. Older history fills in over the following visits, a page at a
time. It only looks backwards: no tips, no predictions, no telling you what to
bet. [**How it works, screen by screen**](docs/HOW_IT_WORKS.md)

## Bookmakers it can read

| Bookmaker | Bets | Balance | Money in and out | Bonuses |
|:--|:-:|:-:|:-:|:-:|
| <img src="extension/src/bookmakers/bet-at-home/logo.png" width="20" align="top"> [**bet-at-home**](extension/src/bookmakers/bet-at-home/) | Yes | Yes | Yes | Yes |
| <img src="extension/src/bookmakers/stake/logo.png" width="20" align="top"> [**Stake**](extension/src/bookmakers/stake/) | Yes | Yes | Yes | Yes |

Both work on all their addresses: country domains, numbered mirrors, and
whatever they switch to next.

## Your data never leaves

No account, no server, no analytics. Your bets, payments and balances stay in
your browser, on your disk. It reads pages you already opened, so it never
sees a password and cannot place a bet, deposit or withdraw. Export the lot to
a file whenever you like, or delete it in one click.

Besides your bookmakers it calls two addresses: a public exchange rate feed
and a public coin price feed. Neither is told anything about you, and a test
in the build fails if a bookmaker ever names a third.
[**Privacy policy**](PRIVACY.md)

## Questions people ask

<details>
<summary><b>Can it bet with my money?</b></summary><br>
No. It only reads pages you have already opened, and never sees your password.
</details>

<details>
<summary><b>How many bookmakers can I have at once?</b></summary><br>
As many as it can read. They are added up together, and any one of them can be renamed, hidden or deleted on its own.
</details>

<details>
<summary><b>Why is an old bet missing?</b></summary><br>
Long histories are read backwards, one page at a time. Open the bookmaker and leave the tab a moment.
</details>

<details>
<summary><b>Is casino play counted?</b></summary><br>
No. Only sports bets. Casino money shows up as a smaller balance.
</details>

[**The rest of the questions**](docs/FAQ.md) - currencies and crypto, accounts
that stop updating, what your bookmaker may think of it.

***

# Add your bookmaker

Missing yours? Add it yourself, in a few minutes. An AI coding tool - Claude
Code, Cursor or similar - writes the code. You need an account at that
bookmaker, and a terminal:

```bash
git clone --depth 1 https://github.com/Martinek16/BETtracker
cd BETtracker
corepack enable
pnpm install
pnpm add-bookmaker
```

Nothing to fill in. The last line asks which bookmaker you are adding, then
runs the rest of it:

1. **You** record your bet history. BETtracker's own popup does it - **Record
   this site**, click through your account, **Save recording**. Without it,
   DevTools does the same: F12, Network tab, export the log with sensitive
   data.
2. **The tool** strips your tokens and your name out of that recording, writes
   the folder, runs the tests and builds.
3. **You** load the extension and check the figures against the site. It lists
   what the new bookmaker has proved and what is still untested, under
   Options → Accounts → Add a bookmaker.

Signing in and saying whether the numbers are right are yours; nobody else can
do either. It all goes into one folder, and nothing else in the project
changes.

[**Every step in detail**](docs/ADD_A_BOOKMAKER.md)

## Other ways to help

- **Your site stopped working?** Bookmakers change their API without warning.
  Fix the folder you use.
- **No account at the site you want?**
  [Ask for it](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml)
  - somebody who plays there may pick it up.
- **A number looks wrong?** Open an
  [issue](https://github.com/Martinek16/BETtracker/issues/new?template=bug.yml).
  Wrong numbers are the only real failure here.
- **Missing something you keep working out by hand?**
  [Say so](https://github.com/Martinek16/BETtracker/discussions).

> [!IMPORTANT]
> **You can add a bookmaker. You cannot change the shared core.** One change to
> how bets are stored or added up can break every site at once, and the person
> who finds out is a stranger whose numbers went quietly wrong. CI checks this
> before anyone reads your pull request.

[**Contributing guide**](CONTRIBUTING.md) &nbsp;·&nbsp;
[**Discussions**](https://github.com/Martinek16/BETtracker/discussions) &nbsp;·&nbsp;
[**Security**](https://github.com/Martinek16/BETtracker/security/advisories/new)

***

<sub>
MIT licensed, and not affiliated with any bookmaker: names and logos identify
whose site a folder reads, nothing more, and any of them is removed on the
owner's word. <a href="LEGAL.md">Legal notice</a>.
<br><br>
For adults only. This tool measures losses, it does not stop
them. If gambling stops being something you control,
<a href="https://www.begambleaware.org/">BeGambleAware</a> and
<a href="https://www.gamblersanonymous.org/">Gamblers Anonymous</a> are free
and confidential.
</sub>
