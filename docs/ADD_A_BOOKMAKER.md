# Add a bookmaker

This is the whole process, start to finish. It takes an evening the first time.

You do not need to know how the extension works. You do need an account at the
bookmaker — support is written from a recording of a real signed-in session, and
there is no way to fake one.

---

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

---

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
5. Right-click anywhere in the request list → **Save all as HAR with content**.
6. Save it into the `har/` folder in the project. Create it if it is not there.

> **The file you just saved is dangerous.** It contains your live session
> cookies, your name, your account number and every deposit you have made.
> Anyone who gets it can sign in as you. `har/` is gitignored, so git will not
> pick it up by accident — but do not email it, do not attach it to an issue,
> and do not put it in a chat.

---

## 2. Strip it

```bash
pnpm sanitize-har har/yoursite.har
```

This writes `har/yoursite.sanitized.har` and tells you what it did:

```
har/yoursite.sanitized.har
  kept 47 API calls, dropped 312 others, redacted 68 values
```

It removes cookies and tokens, replaces your name, email and account number with
stand-ins, and throws away everything that is not an API response. Amounts and
odds stay — they are what the code has to be tested against, and on their own
they identify nobody.

It refuses to write the file at all if something in it still looks like a
credential.

**Open the sanitised file and look at it anyway.** The tool is a net, not a
guarantee. It does not know that `"nickname": "YourNickname87"` is you.

---

## 3. Let Claude Code write it

In the project folder:

```
claude
```

then:

```
/add-bookmaker yoursite
```

`yoursite` is the id: lowercase, hyphens instead of spaces, and it becomes the
folder name. `bet365`, `william-hill`, `bwin`.

It will read your sanitised recording, read how the two existing bookmakers are
written, and produce the folder. It will ask you for a logo — a PNG of the
site's mark, around 128px square with the background removed.

It is told, in the command itself, that it may only add a folder and three
lines. If it reports that the site cannot work without changing the core, that
is worth
[a Discussion](https://github.com/Martinek16/BETtracker/discussions) rather than
a workaround.

### Writing it by hand instead

Perfectly reasonable. Read
[`extension/src/bookmakers/README.md`](../extension/src/bookmakers/README.md)
for the folder contract, then copy `extension/src/bookmakers/stake/` and work
through it. It is about 300 lines for a straightforward site.

---

## 4. Check it

```bash
pnpm lint
pnpm test
pnpm build
```

All three, all green. Two tests exist specifically to catch what is easy to get
wrong here:

- **`plugin.test.ts`** — your folder is complete, and registered in all three
  collectors. Forget one and the extension does nothing, silently.
- **`manifest.test.ts`** — the addresses you declared match the ones your
  capture rule recognises. Get these out of step and the extension either is not
  injected where it should be, or is injected and then does nothing.

If a test fails, fix the folder. Never the test.

---

## 5. Look at what you are about to publish

```bash
git status
git diff
```

Two things to confirm with your own eyes:

- **No `.har` file.** Not the raw one, not the sanitised one.
- **Nothing personal left in the fixtures.** Open each JSON file under
  `__fixtures__/` and read it. Your name, your email, your account number, your
  address — none of it should be there.

CI checks both, and CI will miss things. This step is the one that matters.

---

## 6. Prove it actually works

Everything so far only proves the code parses a recording. Load it and use it:

1. `pnpm build`
2. `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`
3. Open the bookmaker, sign in, and say yes when asked.
4. Wait for the sync, then open the dashboard and **check the numbers against
   what the bookmaker's own page says.**

Do they match? Does an accumulator show its legs? Is a voided bet counted as
void rather than a loss? Does paging reach the end of your history or stop after
one page?

If you skip this step, say so in the pull request. An adapter tested only
against a recording is still worth merging — it just gets labelled honestly.

---

## 7. Open the pull request

```bash
git checkout -b add-yoursite
git add extension/src/bookmakers/yoursite extension/src/bookmakers/capture.ts extension/src/bookmakers/registry.ts extension/src/bookmakers/catalog.ts
git commit -m "feat: add yoursite"
git push -u origin add-yoursite
```

Then open the pull request on GitHub. The template asks what works, what does
not, and how you tested it. **Fill it in honestly.** "Bets and balance work,
transactions untested because my account has none" is a genuinely useful pull
request. A tick-everything one that turns out to be wrong costs the next person
a day of their life.

CI will run and check that you only added a bookmaker and that no credential is
in the diff.

---

## When it breaks later

Bookmakers change their API without telling anyone. When yours does, the sync
stops and the numbers stay frozen on the last thing they knew.

Record a fresh HAR, sanitise it, compare it to the fixtures in your folder, fix
what moved, and refresh the fixtures. You are the person who will notice first,
because you are the one using it.

---

## Stuck

- The folder contract: [`extension/src/bookmakers/README.md`](../extension/src/bookmakers/README.md)
- A site with one endpoint and one credential: [`stake/`](../extension/src/bookmakers/stake/)
- A site with two backends and two sessions: [`bet-at-home/`](../extension/src/bookmakers/bet-at-home/)
- Anything else: [Discussions](https://github.com/Martinek16/BETtracker/discussions)

Ask early. A half-finished attempt with a question attached is easier to help
with than a finished one built on a wrong assumption.
