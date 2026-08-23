# Add a bookmaker

This is the whole process, start to finish. Set aside an afternoon, and more if
the site is awkward. Very little of that is typing: the tool writes most of the
code. What it is, is clicking slowly through your own bet history while the
browser writes it down, and then checking figure by figure that what appears on
screen is what the bookmaker says. The second half is the half people skip, and
it is the half that decides whether the adapter is honest.

You do not need to know how the extension works.

## Two people, one bookmaker

Somebody has to have an account at the site. That cannot be worked around:
support is written from a recording of a real signed-in session, and there is
no way to fake one. But that somebody does not have to be the person who writes
the code, and for most sites it will not be. There are two jobs here, and they
can belong to two people who never meet.

**The player** has an account and a real history at the site. They record it,
run one command that strips the tokens and their name out of the recording, and
hand the cleaned file over. No programming, no reading of this project's code,
one command in one terminal. That is **steps 1 and 2**, and then they can stop.

**The developer** takes that cleaned recording and writes the folder from it.
They need no account at the bookmaker and never see one. That is **steps 3 to
5**.

Two things stay with the player and cannot be handed over. The recording is
one. The other is **step 6**: whether the numbers on screen are the numbers the
bookmaker shows. A developer working from a recording can produce an adapter
that parses every field cleanly and is wrong about all of them - a withdrawal
counted as a deposit, a void slip read as a loss, odds off by a decimal place -
and nothing in the test suite can tell. Tests prove the code does what it did
last week. Only somebody with an account there can prove it is true.

So a split contribution is not finished when the tests pass. It is finished
when somebody with an account has looked at the screen.

One person doing both jobs is the simple case, and the rest of this document is
written that way, in the second person. If you are the developer half, read
**you** in steps 1, 2 and 6 as the person who sent you the recording.

## The whole thing, in one terminal

```bash
git clone --depth 1 https://github.com/Martinek16/BETtracker
cd BETtracker
corepack enable
pnpm install
pnpm add-bookmaker
```

That last command is the rest of this document. It asks which bookmaker you are
adding - type its address, `www.yourbookmaker.com` - and everything after that
is named after what you typed. Then it opens the folder your recording goes
into, waits while you record - however long that takes - cleans the file the
moment it lands, and starts your assistant on it with the prompt already
written.

What stays yours is step 1 and step 6: only you can sign in to the bookmaker,
and only you can tell whether the figures on the screen are the right ones.
Read the steps anyway. Knowing what the tool is doing is what lets you tell
when it has got something wrong.

The prompt is written to a file before anything is started, and the command runs
`claude` on it from the project folder. No `claude`, or a different assistant?
The command prints that file's full path - open yours **in this project folder**
(Cursor, Copilot, whatever you use) and tell it to follow that file. Steps 3 to
5 are written out below to do by hand instead.

`--depth 1` fetches the project as it stands and not the history behind it. You
are building it, not working on its past. (Drop the flag if you mean to send the
work back as a pull request.)

(No local setup at all:
open the repository in a [Codespace](https://github.com/codespaces) instead. The
final check in step 6 still has to happen on your own machine, because you
cannot load a browser extension into a Codespace.)

### You already have BETtracker installed

Then you are about to have two, once. A bookmaker only exists in a build that
contains it, so the copy you installed cannot read your new site until the change
is released - a browser will not let an extension change its own code, which is
exactly what stops a bad one rewriting itself after you trusted it. What you
build here is a second copy that can, and you run it alongside - or instead of -
the one you have.

Two, and not three: from here on the project rebuilds that same copy. A third
bookmaker is another `pnpm build` and the **Reload** button on the entry you
already added, never another extension.

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

`pnpm add-bookmaker` has opened the folder the recording goes into and is
waiting for it. Leave that window open.

**Sign in to the bookmaker** as you normally do, then record it one of two ways.

### The extension records it

If BETtracker is installed in the browser you are signed in with - the copy from
the store counts, and so does the one you are about to build - it can do this
itself, and none of DevTools comes into it.

1. On the bookmaker's page, click the **BETtracker** icon in the toolbar. It
   says the site is not one it reads yet, and offers **Record this site**.
2. Click that, and allow the access the browser then asks for. It is for that
   one site, and it is handed back the moment you save.
3. Click through your account - the list below.
4. Click the icon again and press **Save recording**. The file lands in your
   downloads, named after the site.

It never writes down the value of a single header, only which headers the site
sent, so what it saves is far less dangerous than a DevTools export. It sees
what the page's own scripts ask for, which is exactly what every adapter here is
written against. A site that draws your history inside an iframe, or fetches it
over a WebSocket, is one for the route below.

### Or DevTools records it

Any browser, any site, nothing installed.

1. Press **F12** to open DevTools, and go to the **Network** tab.
2. Tick **Preserve log**. Without it, every page navigation wipes what you have
   recorded so far.
3. Click through your account - the list below.
4. Right-click anywhere in the request list and export the log. Recent Chrome
   and Edge offer two: **Export HAR (sanitized)** and **Export HAR (with
   sensitive data)**. Take the one **with** sensitive data - the sanitized
   export strips the `Cookie` and `Authorization` headers, and which header
   carries your session is one of the six things the folder is written from.
   The first time, the browser asks you to turn it on:
   Settings (⚙) → Preferences → Network → **Allow to generate HAR with
   sensitive data**. Older browsers say **Save all as HAR with content** and
   have only the one.

### What to click through, either way

Slowly, giving each page a second to finish loading:

- your settled bet history - and **page back several pages**, this is how paging
  is discovered
- your open bets
- your balance, wherever it is shown
- deposits and withdrawals
- bonuses or free bets, if the site has them

**A thin history writes a lying adapter.** Whoever reads this recording can
only see what the site was asked for. If every bet in it is a single that won,
the folder gets written against winning singles, the tests pass on winning
singles, and the first accumulator anybody else has goes through as something
else entirely - or as a blank row. That failure is silent: no error, no zero,
just a wrong number nobody has a reason to doubt.

So page back until the recording holds at least one of each, and say in the
request which of them it has:

- a bet that **won** and a bet that **lost**
- a **void** or cancelled bet, and a **partly void** slip if you have one -
  sites disagree wildly about what a voided leg does to a winning multiple
- a **cash-out**, which most sites report as neither a win nor a loss
- an **accumulator**, so the legs and their individual results are visible
- a **free bet or bonus stake**, if the site has them - the stake is not your
  money and counting it as such moves every figure on the screen
- a **deposit and a withdrawal**, and ideally a pending one, because a site
  that reports a withdrawal as a negative number and one that reports it as a
  positive number look identical until you have both

Missing one is not a reason to stop. It is a line in the request: "no
accumulators, my account has none." Then the adapter is written honestly
without it and marked untested, instead of being written against a guess.

### Where the file goes

**Nowhere - leave it in Downloads.** There is no folder to find and no path to
type. The command goes looking there, copies it into the project itself and
keeps each bookmaker apart from the next. (Your copy stays in Downloads. It may
still hold your live session, so delete it when you are done.)

That is the end of your part. The terminal carries on by itself as soon as the
file appears.

> **The file you just saved is dangerous.** It contains your name, your account
> number and every deposit you have made - and, if DevTools wrote it, your live
> session cookies, which are enough for anyone who gets them to sign in as you.
> Do not email it, do not attach it to an issue, and do not put it in a chat.

## 2. Strip it

`pnpm add-bookmaker` has already done this - it is the next thing it prints.
By hand, if you are not using it:

```bash
pnpm sanitize-har
```

No filename. It takes the most recent recording out of `har/` or your Downloads
folder, cleans it, and writes the clean copy beside it, where git is already told
to ignore it:

```
reading har/bet365/bet365.har
har/bet365/bet365.sanitized.har
  kept 47 API calls, dropped 312 others, redacted 68 values

  The recording holds 6 endpoints:
    api.bet365.com/bets/settled  (5 calls, paged)
    api.bet365.com/bets/open  (1 call)
    api.bet365.com/account/balance  (2 calls)
    ...

  Recognised by name: Bet history, Open bets, Balance.

  Not recognised by name. Either the page was never opened, or the site
  simply does not name it in English - check the list above yourself:
    Money in and out - deposits and withdrawals
    Bonuses - bonuses and free bets, if the site has them
```

**Read that second half before going on.** It is the only point in the whole
process where a page you forgot to open is cheap to fix - after this you are
looking at a written folder, wondering why nothing parses.

Two things it says, and what to do about each:

- **"Not recognised by name."** A guess, and only ever a guess: it goes by what
  the site calls its own endpoints, so a site that does not name things in
  English matches none of them. Look at the endpoint list above it. If you can
  see the missing page in there under the site's own word for it, carry on. If
  you cannot, that page was never opened - go back and record again.
- **"No endpoint was asked twice for different pages."** Not a guess. It means
  the recording never shows how the site pages, and a folder written from it
  reads your most recent bets and stops. Record again and page back through your
  bet history.

And if it says the recording is about one page of a site, it is: `pnpm
add-bookmaker` offers to wait for another rather than hand that one to a coding
tool that has nothing to work from.

(Recorded more than one site in a sitting, or keep your downloads somewhere
unusual? `pnpm sanitize-har path/to/that.har` instead.)

It removes cookies and tokens, throws away everything that is not an API
response, and replaces the personal fields it can recognise by name - `name`,
`email`, `accountNumber` - with stand-ins. Amounts and odds stay: they are what
the code has to be tested against, and on their own they identify nobody.

**A site that does not name its fields in English defeats that entirely.** One
answering `{"r4":"MIHA MARTINEK","r5":"Martinek16","r0":220326256}` comes through
a full clean with every one of those still in it, because no shape tells a
person's name from a team's. Nothing but you knows they are yours, so `pnpm
add-bookmaker` asks before it starts waiting, and by hand it is an argument:

```bash
pnpm sanitize-har that.har --me="Your Name,yourNickname,12345678"
```

Whatever you give it is cut out wherever it appears - bodies, headers, URLs -
and replaced with something the same shape, so the file still parses.

It refuses to write the file at all if something in it still looks like a
credential, and names the line and the key it found rather than the value.

**Open the sanitised file and look at it anyway.** The tool is a net, not a
guarantee. Search it for your own name. If it is in there, run it again with
`--me=`.

### Handing it over, if somebody else is writing the code

This is where the player's part ends and the developer's begins. Attach the
`.sanitized.har` - never the raw one - to
[a bookmaker request](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml),
and say in it:

- which of the pages in the list above you actually opened, and which you did
  not
- which kinds of bet are in there - won, lost, void, cash-out, accumulator,
  free bet - and which your account has never had
- whether you are willing to come back for step 6 and check the figures once
  somebody has written it

That last one is not a formality. An adapter nobody with an account can check
gets merged as untested and stays that way, and "untested" on a money figure
means "may be quietly wrong". Say no if the answer is no; it changes how the
result is labelled, not whether it is accepted.

**Read the file once more before you attach it.** An issue is public and
permanent, and deleting it later does not unpublish it. The cleaner refuses to
write a file that still looks like it holds a credential, but it recognises a
personal field by its name, and no tool knows that `"nickname":
"YourNickname87"` is you.

## 3. Write the folder

### First, read the recording

Before writing anything, work out these six things from the sanitised file and
write them down. Everything in the folder falls out of them.

- **Hosts.** Which host serves the API. Whether the site renumbers its domains
  (`site42.com`), because that becomes a `siteRanges` block instead of a list.
- **Authentication.** Which request headers carry the session. Cookie-only
  counts - say so, because then no header is captured. If the money history
  lives on a second host with a second credential, note both.
- **A fingerprint.** One URL pattern that appears when, and only when, you are
  on this bookmaker. It is how a page is recognised.
- **Endpoints.** Settled bets, open bets, balance, deposits and withdrawals,
  bonuses. Note which exist - several are optional.
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
`id`, the logo filename and the storage key, and they all have to agree -
which is the whole reason the command writes them rather than you.
`bet365`, `william-hill`, `bwin`.

The site's name, its brand colour and its icon are taken out of your recording:
the front page your browser stored carries all three, and the command says which
of them it found. What it deliberately leaves empty is what only the recording
can fill: the fixtures, the real hosts, and the parsing itself. Work through the
folder against the sanitised recording and replace Stake's answers with your
site's.

Stake is one endpoint and one credential. If your site keeps its banking
history behind a second session, read `bet-at-home/` as well - it does that.

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
pnpm check
```

Lint, tests and build, in that order. All three, all green. Four tests exist specifically to catch what is easy to get
wrong here:

- **`plugin.test.ts`** - your folder is complete, and registered in all three
  collectors. Forget one and the extension does nothing, silently.
- **`manifest.test.ts`** - the addresses you declared match the ones your
  capture rule recognises. Get these out of step and the popup grants the site,
  puts the scripts in, and then nothing happens.
- **`conformance.test.ts`** - your bets obey the rules every site's bets obey.
  It reads your folder's `samples.ts`, so a folder without that file is never
  checked at all. Two of its rules exist for the failure that wastes the most
  time: the parse succeeds, the totals look right, and every breakdown on screen
  is a list of blanks, because `sport`, `event` or `selection` came through null.
- **`privacy.test.ts`** - your folder talks to the bookmaker and to nothing else.

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
  address - none of it should be there.
- **No real bets either.** The stakes, odds, returns, balances and dates in the
  fixtures should be invented ones. They exist to show the shape of a response -
  which fields the site sends and in what format - and that works just as well
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
`extension/dist`. If you have loaded this project's build before, it is already
listed: press **Reload** on it instead, because `pnpm build` has just rewritten
the folder it reads. Open the bookmaker, sign in, and say yes when the extension
asks. Wait for the sync to finish.

**Read the report first.** In the extension: **Options → Accounts → Add a
bookmaker**. A site added to your own copy is listed there with one line per
thing it has to have proved - bets read, every bet naming a sport, a match and
a selection, won/lost/void all seen, accumulators carrying their legs, open
bets, the balance, money in and out, bonuses, and a sync without an error. It
reads that off what was actually stored, so it finds in a second the failure
that otherwise costs a day: the sync says done, the total looks right, and
every breakdown is blank because `sport` came through null.

A line reading _untested_ is not a failure. It means your account has never had
one of those - no accumulator, no bonus - so nothing has been proved either
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
> your new site - it gets it when the change is released. Leaving both switched
> on gives you two extensions reading the same accounts into two separate
> databases, and the figures you are trying to check come from whichever one you
> happen to have open.

**Overview**

- [ ] Bet count matches what the bookmaker says, not one page of it
- [ ] Profit and turnover match, to the cent
- [ ] The graph draws a line rather than a flat zero

**Bets**

- [ ] The oldest bet you have is there - paging reached the end, not page one
- [ ] Every row names a sport, a match and a selection. No blanks, no "—"
- [ ] Stake, odds and return match the bookmaker's own figures
- [ ] Won, lost, void and cashed-out bets each read as what they are
- [ ] Expanding an accumulator lists its legs, each with its own selection and result
- [ ] A voided leg inside a winning slip is not counted as a loss
- [ ] Dates are right, including bets placed near midnight

**Analytics**

- [ ] Every breakdown card has bars in it - by sport, by league, by market
- [ ] None of them is one big bucket named "Unknown" or empty

**Cashflow and Bonuses**

- [ ] Deposits and withdrawals appear, or the site genuinely has no endpoint for them
- [ ] A deposit reads as money in and a withdrawal as money out — not the other
      way round, and not both the same way. Sites often report a withdrawal as a
      negative number, and nothing in the tests can catch it being passed
      straight through
- [ ] The balance the extension shows is the balance the bookmaker shows you,
      to the cent
- [ ] Free bets and bonuses appear, or the same
- [ ] A free bet is not also sitting in the list of deposits

**Open bets**

- [ ] A bet you have running right now shows as pending, with its potential return

**And then**

- [ ] Place or settle nothing - just sync a second time. Nothing duplicates, and
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
