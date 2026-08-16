# Add a bookmaker

This is the whole process, start to finish. It takes an evening the first time.

You do not need to know how the extension works. You do need an account at the
bookmaker — support is written from a recording of a real signed-in session, and
there is no way to fake one.

> [!TIP]
> **Working with an AI tool?** Steps 1 and 2 are yours alone: only you can sign
> in and record. Do those, then point the tool at [AGENTS.md](../AGENTS.md) and
> tell it the filename. It writes step 3 from your recording. Steps 5 and 6 come
> back to you, because only you can look at your own figures and say whether
> they are right.

## Before you start

```bash
git clone https://github.com/Martinek16/BETtracker
cd BETtracker
corepack enable
pnpm install
pnpm build
```

If `pnpm build` finishes without errors, you are set up. (No local setup at all:
open the repository in a [Codespace](https://github.com/codespaces) instead. The
final check in step 6 still has to happen on your own machine, because you
cannot load a browser extension into a Codespace.)

## 1. Record your bet history

The extension learns a site by watching the requests the site's own pages make.
So you make those requests yourself, with the browser writing them down.

1. Open your browser and **sign in to the bookmaker** as you normally do.
2. Press **F12** to open DevTools, and go to the **Network** tab.
3. Tick **Preserve log**. Without it, every page navigation wipes what you have
   recorded so far.
4. Now **click through your account**, slowly, giving each page a second to
   finish loading:
   - your settled bet history — and **page back several pages**, this is how
     paging is discovered
   - your open bets
   - your balance, wherever it is shown
   - deposits and withdrawals
   - bonuses or free bets, if the site has them
5. Right-click anywhere in the request list → **Save all as HAR with content**,
   and let it save wherever your browser normally saves.

> **The file you just saved is dangerous.** It contains your live session
> cookies, your name, your account number and every deposit you have made.
> Anyone who gets it can sign in as you. Do not email it, do not attach it to an
> issue, and do not put it in a chat.

## 2. Strip it

```bash
pnpm sanitize-har
```

No filename. It takes the most recent recording out of your Downloads folder,
cleans it, and puts the clean copy in the project's `har/` folder, which git is
already told to ignore:

```
reading C:\Users\you\Downloads\yoursite.har
har/yoursite.sanitized.har
  kept 47 API calls, dropped 312 others, redacted 68 values
```

(Recorded more than one site in a sitting, or keep your downloads somewhere
unusual? `pnpm sanitize-har path/to/that.har` instead.)

It removes cookies and tokens, replaces your name, email and account number with
stand-ins, and throws away everything that is not an API response. Amounts and
odds stay — they are what the code has to be tested against, and on their own
they identify nobody.

It refuses to write the file at all if something in it still looks like a
credential.

**Open the sanitised file and look at it anyway.** The tool is a net, not a
guarantee. It does not know that `"nickname": "YourNickname87"` is you.

## 3. Write the folder

### First, read the recording

Before writing anything, work out these six things from the sanitised file and
write them down. Everything in the folder falls out of them.

- **Hosts.** Which host serves the API. Whether the site renumbers its domains
  (`site42.com`), because that becomes a `siteRanges` block instead of a list.
- **Authentication.** Which request headers carry the session. Cookie-only
  counts — say so, because then no header is captured. If the money history
  lives on a second host with a second credential, note both.
- **A fingerprint.** One URL pattern that appears when, and only when, you are
  on this bookmaker. It is how a page is recognised.
- **Endpoints.** Settled bets, open bets, balance, deposits and withdrawals,
  bonuses. Note which exist — several are optional.
- **Paging.** Timestamp cursor, page number, offset, or a continuation token.
  Each site pages its own way; do not force it to look like another's.
- **The bet shape.** How a selection, a market, odds, stake, return and status
  are represented, and how an accumulator differs from a single.

### Then write it

Copy `extension/src/bookmakers/stake/` to
`extension/src/bookmakers/yoursite/` and work through it. `yoursite` is the id:
lowercase, hyphens instead of spaces. It becomes the folder name, the JSON
`id`, the logo filename and the storage key, and they all have to agree.
`bet365`, `william-hill`, `bwin`.

Stake is one endpoint and one credential. If your site keeps its banking
history behind a second session, copy `bet-at-home/` instead — it does that.
Either way it is around 300 lines.

[`extension/src/bookmakers/README.md`](../extension/src/bookmakers/README.md)
is the contract: what each file owes, what `capture.ts` may import, and the
three collector lines that register the folder. Miss one of those three and
`plugin.test.ts` fails by name.

Two rules the tests enforce, worth knowing before you hit them: throw
`SessionExpiredError` on a dead token, so the user is asked to sign in rather
than shown a silent zero, and skip a bet you cannot parse rather than invent a
value to fill the gap.

You will need a logo: a PNG of the site's mark, around 128px square with the
background removed.

If the site genuinely cannot work without a change to the core, stop and open
[a Discussion](https://github.com/Martinek16/BETtracker/discussions). That is a
real conversation to have, just not one to have inside a pull request.

## 4. Check it

```bash
pnpm lint
pnpm test
pnpm build
```

All three, all green. Four tests exist specifically to catch what is easy to get
wrong here:

- **`plugin.test.ts`** — your folder is complete, and registered in all three
  collectors. Forget one and the extension does nothing, silently.
- **`manifest.test.ts`** — the addresses you declared match the ones your
  capture rule recognises. Get these out of step and the extension either is not
  injected where it should be, or is injected and then does nothing.
- **`conformance.test.ts`** — your bets obey the rules every site's bets obey.
  It reads your folder's `samples.ts`, so a folder without that file is never
  checked at all. Two of its rules exist for the failure that wastes the most
  time: the parse succeeds, the totals look right, and every breakdown on screen
  is a list of blanks, because `sport`, `event` or `selection` came through null.
- **`privacy.test.ts`** — your folder talks to the bookmaker and to nothing else.

If a test fails, fix the folder. Never the test. They are shared files, and CI
rejects a pull request that changes one.

## 5. Look at what you are about to publish

```bash
git status
git diff
```

What you are publishing is **how the site answers**, so that anyone with their
own account there can read their own history. It is not your history. Three
things to confirm with your own eyes:

- **No `.har` file.** Not the raw one, not the sanitised one.
- **Nothing personal left in the fixtures.** Open each JSON file under
  `__fixtures__/` and read it. Your name, your email, your account number, your
  address — none of it should be there.
- **No real bets either.** The stakes, odds, returns, balances and dates in the
  fixtures should be invented ones. They exist to show the shape of a response —
  which fields the site sends and in what format — and that works just as well
  with made-up figures. The site's own wording stays: its sport names, market
  names and status strings are the part the code is written against. Your actual
  numbers get checked in step 6, on your own machine, and stay there.

CI checks both, and CI will miss things. This step is the one that matters.

## 6. Prove it actually works

Everything so far only proves the code parses a recording. A green test run and
an empty dashboard are entirely compatible, and that is the most common way this
goes wrong: the sync reports success, the total is right, and half the screens
show nothing. So load it and use it.

```bash
pnpm build
```

Then `chrome://extensions` → Developer mode → **Load unpacked** →
`extension/dist`. Open the bookmaker, sign in, and say yes when the extension
asks. Wait for the sync to finish, then open the dashboard and go through every
screen with the bookmaker's own history page open beside it.

`extension/dist` is the folder `pnpm build` writes, and the browser reads it
where it lies. So from here on it is build, then **Reload** on
`chrome://extensions`, and your change is in. There is no zip to download and
nothing to copy anywhere.

> [!IMPORTANT]
> **Turn off the store copy while you do this.** A bookmaker only exists in a
> build that contains it, so the copy from Microsoft Edge Add&#8209;ons cannot see
> your new site — it gets it when the change is released. Leaving both switched
> on gives you two extensions reading the same accounts into two separate
> databases, and the figures you are trying to check come from whichever one you
> happen to have open.

**Overview**

- [ ] Bet count matches what the bookmaker says, not one page of it
- [ ] Profit and turnover match, to the cent
- [ ] The graph draws a line rather than a flat zero

**Bets**

- [ ] The oldest bet you have is there — paging reached the end, not page one
- [ ] Every row names a sport, a match and a selection. No blanks, no "—"
- [ ] Stake, odds and return match the bookmaker's own figures
- [ ] Won, lost, void and cashed-out bets each read as what they are
- [ ] Expanding an accumulator lists its legs, each with its own selection and result
- [ ] A voided leg inside a winning slip is not counted as a loss
- [ ] Dates are right, including bets placed near midnight

**Analytics**

- [ ] Every breakdown card has bars in it — by sport, by league, by market
- [ ] None of them is one big bucket named "Unknown" or empty

**Cashflow and Bonuses**

- [ ] Deposits and withdrawals appear, or the site genuinely has no endpoint for them
- [ ] Free bets and bonuses appear, or the same

**Open bets**

- [ ] A bet you have running right now shows as pending, with its potential return

**And then**

- [ ] Place or settle nothing — just sync a second time. Nothing duplicates, and
      the counts stay the same
- [ ] Sign out at the bookmaker and sync again. You are asked to sign in, rather
      than shown a silent zero

A box you cannot tick is not a reason to give up. It is a line in the pull
request: "transactions untested, my account has none" or "leagues come through
empty, the API does not send them". That is a genuinely useful contribution.
A ticked box that turns out to be wrong costs the next person a day.

## 7. Open the pull request

```bash
git checkout -b add-yoursite
git add extension/src/bookmakers/yoursite extension/src/bookmakers/capture.ts extension/src/bookmakers/registry.ts extension/src/bookmakers/catalog.ts
git commit -m "feat: add yoursite"
git push -u origin add-yoursite
```

Then open the pull request on GitHub. The template asks what works, what does
not, and how you tested it. Fill it in honestly: unticked boxes are fine, a
wrong tick is not.

CI will run and check that you only added a bookmaker and that no credential is
in the diff.

## When it breaks later

Bookmakers change their API without telling anyone. When yours does, the sync
stops and the numbers stay frozen on the last thing they knew.

Record a fresh HAR, sanitise it, compare it to the fixtures in your folder, fix
what moved, and refresh the fixtures. You are the person who will notice first,
because you are the one using it.

## Stuck

- The folder contract: [`extension/src/bookmakers/README.md`](../extension/src/bookmakers/README.md)
- A site with one endpoint and one credential: [`stake/`](../extension/src/bookmakers/stake/)
- A site with two backends and two sessions: [`bet-at-home/`](../extension/src/bookmakers/bet-at-home/)
- Anything else: [Discussions](https://github.com/Martinek16/BETtracker/discussions)

Ask early. A half-finished attempt with a question attached is easier to help
with than a finished one built on a wrong assumption.
