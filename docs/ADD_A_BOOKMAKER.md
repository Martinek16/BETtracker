# Add a bookmaker

This is the whole process, start to finish. It takes a few minutes, most of them
spent waiting on the tool rather than on you.

You do not need to know how the extension works. You do need an account at the
bookmaker — support is written from a recording of a real signed-in session, and
there is no way to fake one.

> [!TIP]
> **Working with an AI tool?** Paste this into it, with your bookmaker's address
> in place of the example, and it will take you through the rest:
>
> ```
> Add the bookmaker https://www.yourbookmaker.com to BETtracker.
>
> The project is https://github.com/Martinek16/BETtracker — clone it,
> read AGENTS.md, and follow it. Ask me for whatever you cannot get
> yourself.
> ```
>
> It will set the project up and then stop and ask you to record your history,
> because only you can sign in. Steps 1, 2 and 6 below stay yours; it does the
> rest. Read them anyway — knowing what it is doing is what lets you tell when
> it has got something wrong.

## Before you start

Skip this if you pasted the prompt above; the tool does it for you.

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

### You already have BETtracker installed

Then you are about to have two. A bookmaker only exists in a build that contains
it, so the copy you installed cannot read your new site until the change is
released. What you build here is a second copy that can, and you run it
alongside — or instead of — the one you have.

They do not share anything. Your existing copy keeps its history and is not
touched, and whatever the new one syncs while you are testing stays in the new
one. Nothing is lost either way; it just does not carry across, so do not sit
waiting for it to.

Run one at a time. Two copies both signed in to the same bookmaker sync the same
account into two separate databases, and the figures you are checking in step 6
then depend on which of them you happened to open.

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
   and save it into the project's `har/` folder, which `pnpm install` made for
   you. (Downloads works too, but the folder is where the next steps look
   first — and where the site's own name, colour and icon are read from.)

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

```bash
pnpm new-bookmaker yoursite yoursite.com "Your Site"
```

That writes `extension/src/bookmakers/yoursite/` as a copy of `stake/` under
its own name, and adds the three lines that register it. `yoursite` is the id:
lowercase, hyphens instead of spaces. It becomes the folder name, the JSON
`id`, the logo filename and the storage key, and they all have to agree —
which is the whole reason the command writes them rather than you.
`bet365`, `william-hill`, `bwin`.

The site's name, its brand colour and its icon are taken out of your recording:
the front page your browser stored carries all three, and the command says which
of them it found. What it deliberately leaves empty is what only the recording
can fill: the fixtures, the real hosts, and the parsing itself. Work through the
folder against the sanitised recording and replace Stake's answers with your
site's.

Stake is one endpoint and one credential. If your site keeps its banking
history behind a second session, read `bet-at-home/` as well — it does that.

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
asks. Wait for the sync to finish.

**Read the report first.** In the extension: **Options → Accounts → Add a
bookmaker**. A site added to your own copy is listed there with one line per
thing it has to have proved — bets read, every bet naming a sport, a match and
a selection, won/lost/void all seen, accumulators carrying their legs, open
bets, the balance, money in and out, bonuses, and a sync without an error. It
reads that off what was actually stored, so it finds in a second the failure
that otherwise costs a day: the sync says done, the total looks right, and
every breakdown is blank because `sport` came through null.

A line reading *untested* is not a failure. It means your account has never had
one of those — no accumulator, no bonus — so nothing has been proved either
way. Send the wrong and untested lines to the tool; that is the whole of the
bug report it needs.

Then go through every screen yourself, with the bookmaker's own history page
open beside it. The report can only say a figure arrived, never that it is the
right one.

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
