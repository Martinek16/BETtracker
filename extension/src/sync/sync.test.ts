import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackfillState } from '@betanal/shared';

vi.mock('@betanal/shared', () => ({
  getBackfillState: vi.fn(),
  getLatestPlacedAt: vi.fn(),
  getPendingBets: vi.fn(),
  putBets: vi.fn(),
  setBackfillState: vi.fn(),
  putTransaction: vi.fn(),
  putBonus: vi.fn(),
}));

const { authedJson, disappearedBetIds, RateLimitedError, RelayUnavailableError, runCursorSync } =
  await import('./sync');
const shared = await import('@betanal/shared');
const { syncBonuses, syncTransactions } = await import('../bookmakers/bet-at-home/adapter');

const creds = {
  bookmaker: 'bet-at-home',
  fields: { sessionId: 's', playerId: '18988117', apiBase: 'https://x' },
} as const;

const account = { bookmaker: 'bet-at-home', accountId: '18988117' } as const;

describe('disappearedBetIds', () => {
  const open = (...ids: string[]) => ids.map((betId) => ({ betId }) as never);

  it('reports an id that was open last poll and is gone now', () => {
    expect(disappearedBetIds(['a', 'b'], open('a'))).toEqual(['b']);
  });

  it('reports nothing when the open set is unchanged', () => {
    expect(disappearedBetIds(['a', 'b'], open('b', 'a'))).toEqual([]);
  });

  it('never reports an id it has not seen open before', () => {
    // Guards against diffing old local pendings, which would fire a sync every poll.
    expect(disappearedBetIds([], open('a'))).toEqual([]);
  });
});

describe('runCursorSync account scope', () => {
  it('never resumes a second login from the first login backfill cursor', async () => {
    // The first login is half-way through its history; the second has never been
    // read. Scoping this by site instead of by login would make the second one
    // start at the first one's cursor and silently skip everything newer.
    const stored: Record<string, BackfillState> = {
      'bet-at-home:first': {
        oldestFetchedAt: '2020-01-01T00:00:00Z',
        historyComplete: false,
        betOffset: 0,
        moneyComplete: false,
        openBetsSeen: false,
      },
    };
    const key = (a: { bookmaker: string; accountId: string }): string =>
      `${a.bookmaker}:${a.accountId}`;
    vi.mocked(shared.getBackfillState).mockImplementation(
      async (a) =>
        stored[key(a)] ?? {
          oldestFetchedAt: null,
          historyComplete: false,
          betOffset: 0,
          moneyComplete: false,
          openBetsSeen: false,
        },
    );
    vi.mocked(shared.getLatestPlacedAt).mockResolvedValue(null);
    vi.mocked(shared.getPendingBets).mockResolvedValue([]);
    vi.mocked(shared.putBets).mockResolvedValue(0);
    vi.mocked(shared.setBackfillState).mockResolvedValue(undefined);

    const fetchPage = vi.fn(async (_placedBefore: string) => ({
      bets: [],
      skipped: 0,
      nextCursor: null,
    }));
    await runCursorSync(
      { account: { bookmaker: 'bet-at-home', accountId: 'second' }, fetchPage },
      'incremental',
      () => {},
    );

    const cursor = String(fetchPage.mock.calls[0]?.[0]);
    expect(Date.parse(`${cursor}Z`)).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe('syncTransactions window walk', () => {
  beforeEach(() => vi.restoreAllMocks());

  const row = {
    transIdStr: '1',
    completed: '2026-08-01T00:00:00.000Z',
    status: 'Success',
    type: 0,
    currency: 'EUR',
    realAmount: 10,
  };

  const stubFetch = (transactions: unknown[] = []): ReturnType<typeof vi.fn> => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ transactions, pagination: { next: null } }),
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('asks for a year at a time, as the site itself does', async () => {
    const fetchMock = stubFetch();
    await syncTransactions(creds, account, 12);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const from = new Date(url.searchParams.get('startDate') ?? '');
    const to = new Date(url.searchParams.get('endDate') ?? '');
    // A month at a time made a first import hundreds of sequential requests,
    // which outlived both the worker and the session.
    expect(to.getTime() - from.getTime()).toBeGreaterThan(360 * 86_400_000);
    expect(to.getTime()).toBeGreaterThan(Date.now());
  });

  it('walks both deposits and withdrawals, bounded by maxMonths', async () => {
    const fetchMock = stubFetch([row]);
    await syncTransactions(creds, account, 24);

    const types = fetchMock.mock.calls.map((c) => new URL(String(c[0])).searchParams.get('types'));
    expect(types).toEqual(['0', '0', '1', '1']);
  });

  it('stops a walk early after an empty year', async () => {
    const fetchMock = stubFetch();
    await syncTransactions(creds, account, 240);

    // One empty year per type, then give up - not a grind back to 2005.
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});

describe('syncBonuses page walk', () => {
  beforeEach(() => vi.restoreAllMocks());

  /** A full page of grants, so the walk has a reason to ask for the next one. */
  const stubWallet = (): ReturnType<typeof vi.fn> => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      walletId: i,
      granted: '2026-01-01T00:00:00Z',
    }));
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items, total: 1000 }),
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('stops at the first page holding nothing new on a routine sync', async () => {
    const fetchMock = stubWallet();
    vi.mocked(shared.putBonus).mockResolvedValue(false);

    // Only what changed: re-reading all 541 stored grants on every sync is what
    // filled the log with the same line all evening.
    expect(await syncBonuses(creds, account, false)).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it('keeps walking past a known page when asked for the whole history', async () => {
    const fetchMock = stubWallet();
    vi.mocked(shared.putBonus).mockResolvedValue(false);

    await syncBonuses(creds, account, true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('authedJson relayed through a page', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('separates having no tab to ask from a refused session', async () => {
    // Dropping the token for this reloaded the site to get a new one, which was
    // refused the same way on the next run - the reconnect loop.
    vi.stubGlobal('chrome', { tabs: { query: () => Promise.resolve([]) } });
    await expect(authedJson('https://stake.com/_api/graphql', {}, true)).rejects.toBeInstanceOf(
      RelayUnavailableError,
    );
  });
});

describe('authedJson on a refused request', () => {
  const MAINTENANCE =
    '<!doctype html><html><head><title>Maintenance</title>' +
    `<style>@font-face{src:url(data:font/woff2;base64,${'d09GMk9UVE8'.repeat(200)})}</style>` +
    '</head><body>back soon</body></html>';

  beforeEach(() => vi.restoreAllMocks());

  it('backs the bookmaker off on a gateway failure instead of retrying it', async () => {
    // 504 means the site cannot answer at all, so the next request is no more
    // likely to work - retrying at poll speed only deepened the hole.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 504, text: async () => MAINTENANCE }),
    );
    const err = await authedJson('https://stake.com/_api/graphql', {}).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(RateLimitedError);
    // The page's title, not the first 300 characters of its embedded base64
    // font: that was unreadable, and slightly different every time, which also
    // stopped the log folding the repeats into one line.
    expect((err as Error).message).toBe('HTTP 504 for https://stake.com/_api/graphql: Maintenance');
  });
});
