# stake

Everything comes through one GraphQL endpoint: `POST /_api/graphql`.

## One endpoint, many operations

There are no REST paths to match on, so `capture.ts` keys off the operation name
in the request body instead of the URL. `observe()` names the operation it saw;
`activity()` reports a mutation, which is how a placed bet or a settled one is
noticed while the tab is open.

The `x-access-token` header is optional — a signed-in browser session
authenticates by cookie alone. It is captured when present because API-token
users send it instead.

## Casino

`hasCasino: true` in `bookmaker.json`. Casino rounds are not bets and are not
imported; the flag only tells the dashboard that a wallet movement here need not
have a bet behind it.

## Mirrors

`stake1000.com` … `stake1080.com` plus the country domains, declared as a
`siteRanges` block in `bookmaker.json` and expanded into the manifest at build
time.

## Fixtures

`__fixtures__/bets.json` and `wallet.json` are sanitised GraphQL responses that
`adapter.test.ts` parses. Partial failure is part of the contract: Stake answers
`200` with a `data` object *and* an `errors` array, and the adapter keeps the
fields that resolved. There is a test for exactly that.

To refresh them, capture a HAR of your own bet history, then run:

```bash
pnpm sanitize-har har/stake.har
```

That writes `har/stake.sanitized.har`. Copy the response bodies you need out of
it and into `__fixtures__/`.

Never commit the raw `.har` — it carries live session tokens.
