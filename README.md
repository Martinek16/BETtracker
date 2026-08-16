<div align="center">

<img src="img/screenshot.png" alt="BETtracker dashboard" width="100%">

<h1>BETtracker</h1>

<h3>All your bets. One clear view.</h3>

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

Your bookmaker shows today's balance and a list going back a few pages, one
account at a time. So the one question you actually have, **am I up or am I
down**, has no answer on the screen.

BETtracker reads your own history and answers it. On your computer, nowhere
else.

## Install

| Browser | What to do | Worth knowing |
|:--|:--|:--|
| **Edge** | [Get it from Microsoft&nbsp;Edge&nbsp;Add&#8209;ons](https://microsoftedge.microsoft.com/addons/detail/bettracker/dofgloogkcigmpnkmoaefnejeffdbcmi). One click. | Updates itself. |
| **Chrome, Brave, Opera** | [Download `bettracker.zip`](https://github.com/Martinek16/BETtracker/releases/latest/download/bettracker.zip), then unzip it into a folder you intend to keep. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder. | Unzip it properly, rather than loading it straight out of the archive viewer. Deleting the folder uninstalls the extension. |

> [!NOTE]
> There is no Chrome listing because Google removes gambling related extensions from its store, even ones that only read your own history. Edge accepted it.
>
> The green **Code** button at the top of this page, and the **Source code** files on the release, are the project's source. Chrome cannot load either of them: they have to be built first. `bettracker.zip` is the built extension.

Then sign in at a bookmaker as you always do, and say yes once when the
extension asks whether it may read that account. Your bets appear. Older
history fills in over the next few visits, a page at a time. It only looks
backwards: no tips, no predictions, no telling you what to bet.
[**How it works, screen by screen**](docs/HOW_IT_WORKS.md)

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
<summary><b>Why is an old bet missing?</b></summary><br>
Long histories are read backwards, one page at a time. Open the bookmaker and leave the tab a moment.
</details>

<details>
<summary><b>Why did an account stop updating?</b></summary><br>
The bookmaker signed you out. Open its site again and it picks up where it left off.
</details>

<details>
<summary><b>Is casino play counted?</b></summary><br>
No. Only sports bets. Casino money shows up as a smaller balance.
</details>

<details>
<summary><b>What about currencies, and crypto?</b></summary><br>
Everything is converted on the day the bet was placed, not today, so last year's profit does not move because a rate did. Crypto stakes go through the coin's own daily close.
</details>

<details>
<summary><b>Will my bookmaker mind?</b></summary><br>
It reads the same pages your browser already loaded, with your own session, slower than you clicking. That said, plenty of bookmakers write their terms broadly enough to cover anything they dislike. Your account, your call.
</details>

***

# Add your bookmaker

Missing yours? Add it yourself, in an evening. An AI tool writes the code. You
just follow the steps.

**What you need:** an account at that bookmaker, and an AI coding tool —
Claude Code, Cursor or similar.

**Where to start:** paste this into the tool, with your bookmaker's address
instead of the example.

```
Add the bookmaker https://www.yourbookmaker.com to BETtracker.

The project is https://github.com/Martinek16/BETtracker — clone it,
read AGENTS.md, and follow it.
```

It sets everything up and tells you what to do next. All five steps:

1. **You** record your bet history. Press F12, open the Network tab, click
   through your account, save the file. Ten minutes.
2. **You** run `pnpm sanitize-har`. It deletes your tokens, your name and your
   account number from that file.
3. **The tool** reads the recording, writes the code and runs the tests.
4. **You** load the extension and check the numbers against your bookmaker.
5. **The tool** opens a pull request, if you want to share the site.

Two of the five are yours: signing in, and saying whether the numbers are right.
Nobody else can do either.

It all goes into one folder. Nothing else in the project changes.

[**Every step in detail**](docs/ADD_A_BOOKMAKER.md)

## Other ways to help

- **Your site stopped working?** Bookmakers change their API without warning.
  Fix the folder you use.
- **No account at the site you want?**
  [Ask for it](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml)
  — somebody who plays there may pick it up.
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
