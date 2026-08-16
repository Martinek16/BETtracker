# Contributing

Almost every contribution here is **one new bookmaker**, and the project is
arranged so that is the easy thing to do.

## The one rule

**You may add a bookmaker. You may not change how they all work.**

A bookmaker lives entirely in `extension/src/bookmakers/<id>/` and is registered
with one line in each of three collector files. Everything else — the sync
engine, the database, the dashboard, the shared types, the build — is closed,
and CI rejects a pull request that touches it.

That is not gatekeeping for its own sake. The core is what every site runs on,
and a change there that looks harmless can break a bookmaker nobody is testing.
The person who finds out is a stranger whose figures went quietly wrong. If your
site genuinely cannot work without a core change, open a
[Discussion](https://github.com/Martinek16/BETtracker/discussions). That is a
real conversation to have, just not one to have inside a pull request.

## Adding a bookmaker

You need an account at the site. Support is written from a recording of a real
signed-in session, and there is no way to fake one. No account there yourself?
[Request the site](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml)
and somebody who plays there may pick it up.

1. Record your own bet history with DevTools open. That gives you a `.har` file.
2. `pnpm sanitize-har har/yoursite.har` strips the tokens and your identity out.
3. Copy an existing bookmaker's folder and work through it against your
   recording. Around 300 lines.
4. Load the built extension, sync your real account, check the numbers on screen.
5. Open a pull request.

Every step spelled out, including what to check on each screen:
**[docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md)**.

## Never commit a HAR file

A raw HAR is a complete copy of your signed-in session: cookies, bearer tokens,
your name, your account number, every deposit you have ever made. Publishing one
cannot be undone by deleting it, because it is in the fork network and in
everyone's clone within minutes.

`har/` is gitignored, `pnpm sanitize-har` cleans a recording before it goes
anywhere, and CI rejects a `.har` or an added line shaped like a token. All
three can be defeated. **Read the fixtures you are committing** — no tool knows
that `"nickname": "YourNickname87"` is you.

## Getting set up

```bash
git clone https://github.com/Martinek16/BETtracker
cd BETtracker
corepack enable          # gets the right pnpm
pnpm install
pnpm build
```

Then load `extension/dist` as an unpacked extension: `chrome://extensions`,
Developer mode on, **Load unpacked**. `pnpm dev:dashboard` gives you hot reload
against whatever is already in your browser's database.

A [Codespace](https://github.com/codespaces) skips the setup, but you cannot
load an extension into one, so the final "does it actually work" check still
happens on your own machine.

## Before you open a pull request

```bash
pnpm lint
pnpm test
pnpm build
```

All three, all green. If a test fails, fix the folder, never the test — they are
shared files and CI rejects a pull request that edits one.

## What gets merged

- **An honest partial adapter.** "Bets and balance work, transactions untested
  because my account has none" is a good pull request. It gets merged and
  labelled.
- **A fix to a bookmaker you use.** Sites change their API without telling
  anyone, and the person who notices first is whoever uses it.
- **Documentation that was wrong or unclear.** Including this file.

And what does not:

- **An adapter with no fixtures.** Nothing proves it, and nothing notices when
  the site changes shape.
- **Numbers that are guessed.** If a field cannot be parsed, skip the record and
  count it. Never invent a value to fill a gap; this tool exists to tell people
  the truth about their money.
- **A core change dressed up as a bookmaker.**
- **New dependencies**, unless there is no reasonable alternative.

## Style

Match what is already there. Comments explain **why**, never what — if the code
needs a comment to say what it does, rename something instead. Commit messages
are `feat:`, `fix:`, `refactor:`, `docs:` or `chore:`, and say why in the body.

## Where everything is written down

| | |
|:--|:--|
| [docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md) | The whole process, start to finish |
| [extension/src/bookmakers/README.md](extension/src/bookmakers/README.md) | What each file in a folder owes |
| [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | How the extension reads a site and stores it |
| [SECURITY.md](SECURITY.md) | Reporting a hole, and what counts as one |
| [PRIVACY.md](PRIVACY.md) | What is stored, and what leaves the machine |
| [LEGAL.md](LEGAL.md) | No affiliation, whose logos those are, and no warranty |

MIT licensed. Contributing means you are fine with your work going out under it.
