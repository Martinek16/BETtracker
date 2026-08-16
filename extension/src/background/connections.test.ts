import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('chrome', { storage: { session: { set: vi.fn(), get: vi.fn() } } });

const { putBanking, putCredentials, connectionAt, dropConnection, dropBookmaker } = await import(
  './connections'
);

const creds = { bookmaker: 'bet-at-home', fields: { sessionToken: 't' } } as never;
const banking = {
  bookmaker: 'bet-at-home',
  fields: { sessionId: 's', playerId: '1', apiBase: 'https://b' },
} as never;

describe('a banking session that arrives first', () => {
  beforeEach(() => {
    dropBookmaker('bet-at-home');
  });

  it('is kept until the sportsbook session it belongs to shows up', () => {
    // The site calls its account backend before the sportsbook on every page,
    // and offers each session only once, so dropping this one lost the balance
    // and the deposits until the tab was reloaded.
    expect(putBanking('bet-at-home', 'https://www.bah26.com', banking)).toBeNull();
    const { connection } = putCredentials('bet-at-home', 'https://www.bah26.com', creds);
    expect(connection.banking).toStrictEqual(banking);
  });

  it('outlives the sportsbook token, which expires on its own clock', () => {
    putBanking('bet-at-home', 'https://www.bah26.com', banking);
    const { connection } = putCredentials('bet-at-home', 'https://www.bah26.com', creds);
    dropConnection(connection.key);
    const revived = putCredentials('bet-at-home', 'https://www.bah26.com', creds);
    expect(revived.connection.banking).toStrictEqual(banking);
  });

  it('goes with the bookmaker when the user forgets it', () => {
    putBanking('bet-at-home', 'https://www.bah26.com', banking);
    dropBookmaker('bet-at-home');
    const { connection } = putCredentials('bet-at-home', 'https://www.bah26.com', creds);
    expect(connection.banking).toBeNull();
    expect(connectionAt('bet-at-home', 'https://www.bah26.com')).not.toBeNull();
  });
});
