# bet-at-home

Sportsbook served through EveryMatrix. Banking lives on a second host entirely.

## Two sessions, not one

The site hands out two unrelated credentials and neither one works on the other
host:

| What          | Host                            | Credential                                          |
| ------------- | ------------------------------- | --------------------------------------------------- |
| Bets, balance | `sports-api.everymatrix.com`    | `x-session-token`, `x-user-id`, `x-operator-id`      |
| Banking       | `*.nwacdn.com`                  | `x-sessionid` + the player id read out of the URL    |

`capture.ts` therefore fills two independent slots. An account that captured the
sportsbook session but never opened the banking page still syncs bets — it just
reports no transactions.

## Mirrors

The domain is renumbered periodically (`bah24.si`, `bah31.com`, …), so
`bookmaker.json` declares a `siteRanges` block rather than listing each one. The
build expands it into the manifest's match patterns.

## Fixtures

`__fixtures__/settled-bets.json` and `open-bets.json` are sanitised recordings of
the real endpoints. `adapter.test.ts` parses them, so a change to the parser that
breaks the real shape fails the suite.

To refresh them, capture a HAR while browsing your own bet history, then run:

```bash
pnpm sanitize-har har/bet-at-home.har
```

That writes `har/bet-at-home.sanitized.har`. Copy the response bodies you need
out of it and into `__fixtures__/`.

Never commit the raw `.har` — it carries live session tokens.
