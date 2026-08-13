# Contributing

Almost every contribution to this project is **one new bookmaker**, and the
project is arranged so that is the easy thing to do.

## The one rule

**You may add a bookmaker. You may not change how they all work.**

A bookmaker lives entirely in `extension/src/bookmakers/<id>/` and is registered
with one line in each of three files. Everything else — the sync engine, the
database, the dashboard, the shared types, the build — is closed.

This is not gatekeeping for its own sake. The core is what every site runs on,
and a change there that looks harmless can break a bookmaker nobody is testing.
The person who finds out is a stranger whose figures have gone quietly wrong.

CI enforces it, and pull requests touching protected paths are rejected
automatically. If your site genuinely cannot work without a core change, open a
[Discussion](https://github.com/Martinek16/BETtracker/discussions) — that is a
real conversation to have, just not one to have inside a pull request.

## Adding a bookmaker

Full walkthrough: **[docs/ADD_A_BOOKMAKER.md](docs/ADD_A_BOOKMAKER.md)**.

The shape of it:

1. Sign in to the bookmaker in your own browser and record your bet history with
   DevTools open. That produces a `.har` file.
2. `pnpm sanitize-har har/yoursite.har` — strips the tokens and your identity
   out of it.
3. Run `/add-bookmaker yoursite` in Claude Code. It reads the sanitised
   recording and the existing bookmakers, then writes the folder.
4. Load the built extension, sync your real account, check the numbers.
5. Open a pull request.

You can of course write it by hand. Read
[`extension/src/bookmakers/README.md`](extension/src/bookmakers/README.md) —
it is the folder contract, and it is short.

### You need an account

Support is written from a recording of a real signed-in session. There is no way
around this and no way to fake it. If you want a site supported and do not have
an account there, open a
[bookmaker request](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml)
and hope someone who does have one picks it up.

## Never commit a HAR file

A raw HAR is a complete copy of your signed-in session: cookies, bearer tokens,
your name, your account number, every deposit you have ever made. Publishing one
to a public repository cannot be undone by deleting it — it is in the fork
network and in everyone's clone within minutes.

- Keep recordings in `har/`. The whole folder is gitignored.
- Run everything through `pnpm sanitize-har` before it goes anywhere.
- CI rejects a pull request with a `.har` in it, or with added lines shaped like
  a token.

**Read the fixtures you are committing.** The sanitiser is a net, not a
guarantee — no automatic tool knows that `"nickname": "YourNickname87"` is you.

## Getting set up

```bash
git clone https://github.com/Martinek16/BETtracker
cd BETtracker
corepack enable          # gets the right pnpm
pnpm install
pnpm build
```

Then load `extension/dist` as an unpacked extension — `chrome://extensions`,
Developer mode on, **Load unpacked**.

Or open the repository in a [Codespace](https://github.com/codespaces) and skip
all of that; the container installs everything on first boot. You cannot load a
browser extension from a Codespace, so the final "does it actually work" check
still happens on your own machine.

Working on the dashboard: `pnpm dev:dashboard` gives you hot reload against
whatever is in your browser's database.

## Before you open a pull request

```bash
pnpm lint
pnpm test
pnpm build
```

All three, all green. `plugin.test.ts` checks your folder is complete and
registered in all three collectors; `manifest.test.ts` checks the sites you
declared are the ones your capture rule actually recognises. Both of those
failures are silent at runtime, which is exactly why they are tests.

If a test fails, fix the folder. Never the test.

## What gets merged

- **An honest partial adapter.** "Bets and balance work, transactions untested
  because my account has none" is a good pull request. It gets merged and
  labelled.
- **A fix to a bookmaker you use.** Sites change their API without telling
  anyone; the person who notices first is whoever uses it.
- **Documentation that was wrong or unclear.** Including this file.

## What does not

- An adapter with no fixtures. There is nothing to prove it against, and nothing
  to notice when the site changes shape.
- Numbers that are guessed. If a field cannot be parsed, skip the record and
  count it. Never invent a value to fill a gap — this tool exists to tell people
  the truth about their money.
- A core change dressed up as a bookmaker.
- New dependencies, unless there is no reasonable alternative.

## Style

Match what is already there. Comments explain **why**, never what — if the code
needs a comment to say what it does, rename something instead.

Commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`. Say why in the
body, not what — the diff already says what.

## Licence

MIT. Contributing means you are fine with your work going out under it.
