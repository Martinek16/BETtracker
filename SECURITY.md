# Security

## Reporting

Use [private reporting](https://github.com/Martinek16/BETtracker/security/advisories/new).
Not a public issue — this project handles session tokens, and a public report is
a working exploit until it is fixed.

You will get a reply. There is no bounty; this is one person's side project.

## What this extension actually does with your data

Worth knowing before you audit it, and worth knowing before you install it:

- Everything is stored in your own browser, in IndexedDB. There is no server,
  no account, and nothing is uploaded anywhere.
- Session tokens are read out of the requests the bookmaker's own page makes,
  kept in `chrome.storage.local`, and sent back to that same bookmaker. Nowhere
  else.
- The only outbound calls to a third party are exchange rates, from
  `api.frankfurter.dev` and `api.binance.com`. They are told a currency pair and
  a date. They are not told anything about you.
- The extension asks for access to the bookmaker sites it supports and nothing
  wider. `manifest.test.ts` fails the build if a permission over the whole web
  is ever added.

Anything that contradicts the above is a security bug, including by accident.

## HAR recordings

Contributions are written from HAR recordings of a real signed-in session. A raw
HAR contains, verbatim: session cookies, bearer tokens, your name, your account
number, and every deposit and withdrawal you have made.

- `har/` and `*.har` are gitignored.
- `pnpm sanitize-har` strips credentials and pseudonymises identity before a
  recording is shared, and refuses to write a file that still looks like it
  holds a secret.
- CI rejects a pull request containing a `.har` file, or added lines shaped like
  a token.

All three can be defeated by someone determined enough. **Read what you are
about to publish.** Nothing here is a substitute for that.

## Scope

In scope: anything that leaks stored data off the machine, exposes a token to a
site that should not see it, widens the requested permissions, or lets a page
the extension is injected into reach the extension's own storage.

Out of scope: that the tool works at all with a bookmaker that would rather it
did not, and anything that requires an attacker who already controls your
browser.

## Supported versions

The latest release. This is a side project — there are no backports.
