/**
 * The sanitiser is the one tool in this repo whose failure is irreversible: a
 * token published in a pull request is public before anyone reads the diff.
 * So it is tested against a recording that carries one of everything.
 */

import { describe, expect, it } from 'vitest';
import { coverage, findLeaks, recordingReport, sanitizeHar, tooThin } from './sanitize-har.mjs';

const har = {
  log: {
    entries: [
      {
        startedDateTime: '2026-01-01T00:00:00.000Z',
        time: 12,
        request: {
          method: 'GET',
          url: 'https://sports-api.example.com/bets?playerId=99887766&sessionToken=abcdef0123456789abcdef0123456789',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'x-session-token', value: 'abcdef0123456789abcdef0123456789' },
            { name: 'cookie', value: 'sid=deadbeefdeadbeefdeadbeefdeadbeef' },
            { name: 'accept', value: 'application/json' },
          ],
          queryString: [
            { name: 'playerId', value: '99887766' },
            { name: 'sessionToken', value: 'abcdef0123456789abcdef0123456789' },
          ],
        },
        response: {
          status: 200,
          statusText: 'OK',
          headers: [
            { name: 'content-type', value: 'application/json' },
            { name: 'set-cookie', value: 'sid=deadbeefdeadbeefdeadbeefdeadbeef; Path=/' },
          ],
          cookies: [{ name: 'sid', value: 'deadbeefdeadbeefdeadbeefdeadbeef' }],
          content: {
            mimeType: 'application/json',
            text: JSON.stringify({
              userId: 99887766,
              firstName: 'Miha',
              email: 'miha@example.com',
              iban: 'SI56191000000123438',
              accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop',
              bets: [{ id: 1, userId: 99887766, stake: 12.5, odds: 2.35, sport: 'Football' }],
            }),
          },
        },
      },
      {
        startedDateTime: '2026-01-01T00:00:01.000Z',
        time: 3,
        request: {
          method: 'GET',
          url: 'https://cdn.example.com/logo.png',
          headers: [],
          queryString: [],
        },
        response: {
          status: 200,
          headers: [],
          content: { mimeType: 'image/png', text: 'binary' },
        },
      },
    ],
  },
};

const run = () => {
  const result = sanitizeHar(structuredClone(har));
  return { ...result, text: JSON.stringify(result.har), entry: result.har.log.entries[0] };
};

describe('sanitizeHar', () => {
  it('keeps the API call and throws the image away', () => {
    const { kept, dropped } = run();
    expect(kept).toBe(1);
    expect(dropped).toBe(1);
  });

  it('lets no credential through, in any position', () => {
    const { text } = run();
    for (const secret of [
      'abcdef0123456789abcdef0123456789',
      'deadbeefdeadbeefdeadbeefdeadbeef',
      'miha@example.com',
      'SI56191000000123438',
      'eyJhbGciOiJIUzI1NiJ9',
      'Miha',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(findLeaks(text)).toEqual([]);
  });

  it('drops cookies whole rather than trusting a rule to catch them', () => {
    const { entry } = run();
    expect(entry.request.cookies).toEqual([]);
    expect(entry.response.cookies).toEqual([]);
    expect(entry.request.headers.map((h) => h.name)).not.toContain('cookie');
    expect(entry.response.headers.map((h) => h.name)).not.toContain('set-cookie');
  });

  it('keeps which header carried the session, because that is the thing being documented', () => {
    const { entry } = run();
    const auth = entry.request.headers.find((h) => h.name === 'x-session-token');
    expect(auth).toBeDefined();
    expect(auth.value).toBe('REDACTED');
  });

  it('keeps the amounts an adapter has to be proven against', () => {
    const { entry } = run();
    const body = JSON.parse(entry.response.content.text);
    expect(body.bets[0].stake).toBe(12.5);
    expect(body.bets[0].odds).toBe(2.35);
    expect(body.bets[0].sport).toBe('Football');
  });

  it('replaces an id with the same stand-in everywhere it appeared', () => {
    const { entry } = run();
    const body = JSON.parse(entry.response.content.text);
    expect(body.userId).not.toBe(99887766);
    expect(body.bets[0].userId).toBe(body.userId);
  });

  it('leaves the url agreeing with the query it rewrote', () => {
    const { entry } = run();
    expect(entry.request.url).not.toContain('99887766');
    expect(entry.request.url).toContain('playerId=');
    for (const { name, value } of entry.request.queryString) {
      expect(entry.request.url).toContain(`${name}=${encodeURIComponent(value)}`);
    }
  });

  /**
   * The sanitiser destroying an ordinary field is not a smaller failure than
   * leaking one: paging and dates are two of the things the recording exists to
   * show, and a card-shaped timestamp used to stop the file being written at
   * all. So the ordinary record is asserted as loudly as the dangerous one.
   */
  it('leaves an ordinary bet record alone and still takes the name off it', () => {
    const ordinary = {
      log: {
        entries: [
          {
            startedDateTime: '2026-01-01T00:00:00.000Z',
            time: 5,
            request: {
              method: 'GET',
              url: 'https://api.example.com/bets',
              headers: [{ name: 'x-access-token', value: 'abcdef0123456789abcdef0123456789' }],
              queryString: [{ name: 'pageNumber', value: '2' }],
            },
            response: {
              status: 200,
              headers: [{ name: 'content-type', value: 'application/json' }],
              content: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  pageNumber: 1,
                  nextPageNo: 2,
                  design: 'classic',
                  spin: 0,
                  name: 'Miha Martinek',
                  card: '4111 1111 1111 1111',
                  bets: [
                    {
                      id: 774411,
                      settledAt: 1723952800000,
                      placedAt: '1723852800000',
                      sport: 'Football',
                      stake: 12.5,
                    },
                  ],
                }),
              },
            },
          },
        ],
      },
    };

    const result = sanitizeHar(structuredClone(ordinary));
    const entry = result.har.log.entries[0];
    const body = JSON.parse(entry.response.content.text);

    // What the adapter is written against survives.
    expect(body.pageNumber).toBe(1);
    expect(body.nextPageNo).toBe(2);
    expect(body.design).toBe('classic');
    expect(body.spin).toBe(0);
    expect(body.bets[0].id).toBe(774411);
    expect(body.bets[0].settledAt).toBe(1723952800000);
    expect(body.bets[0].placedAt).toBe('1723852800000');
    expect(entry.request.queryString[0].value).toBe('2');

    // What is the contributor's own does not.
    expect(body.name).not.toBe('Miha Martinek');
    expect(body.card).not.toContain('4111');
    expect(entry.request.headers[0].value).toBe('REDACTED');

    // And a file this ordinary is one the command will actually write.
    expect(findLeaks(JSON.stringify(result.har, null, 2))).toEqual([]);
  });

  /**
   * The refusal is the last line of defence and the one path nothing else
   * exercises: what it prints ends up in a terminal, and often in a screenshot
   * attached to an issue. So it says where, and never what.
   */
  it('reports a leak by position, not by value', () => {
    const found = findLeaks(JSON.stringify({ iban: 'SI56191000000123438' }, null, 2));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('key "iban"');
    expect(found[0]).not.toContain('SI56191000000123438');
  });

  /**
   * A server-rendered site sanitises down to nothing, and the count of what
   * survived cannot say why. Counting the pages separately is what lets the
   * command tell a contributor the site is the obstacle, not their capture.
   */
  it('counts the pages a site rendered on the server', () => {
    const page = {
      startedDateTime: '2026-01-01T00:00:02.000Z',
      time: 8,
      request: {
        method: 'GET',
        url: 'https://www.example.com/history',
        headers: [],
        queryString: [],
      },
      response: {
        status: 200,
        headers: [],
        content: {
          mimeType: 'text/html; charset=utf-8',
          text: '<table><tr><td>12.50</td></tr></table>',
        },
      },
    };
    const onlyPages = { log: { entries: [page] } };

    expect(sanitizeHar(structuredClone(onlyPages))).toMatchObject({ kept: 0, rendered: 1 });
    // The image is not a rendered page, so a normal recording reports none.
    expect(run().rendered).toBe(0);
  });
});

const call = (url) => ({ request: { url } });

/**
 * The check exists because of a real attempt that got as far as a written
 * folder before anyone noticed the recording behind it held one page. So the
 * cases asserted here are that failure and the two ways it disguises itself:
 * one page fetched under many numbers, and a site that names nothing in
 * English.
 */
describe('coverage', () => {
  const thorough = [
    call('https://api.example.com/bets/history?page=1'),
    call('https://api.example.com/bets/history?page=2'),
    call('https://api.example.com/bets/history?page=3'),
    call('https://api.example.com/bets/open'),
    call('https://api.example.com/account/balance'),
    call('https://api.example.com/transactions?page=1'),
    call('https://api.example.com/bonuses'),
  ];

  it('counts one endpoint fetched many ways as one endpoint', () => {
    const found = coverage([
      call('https://api.example.com/bets/1'),
      call('https://api.example.com/bets/2'),
      call('https://api.example.com/bets/3'),
    ]);
    expect(found.endpoints).toHaveLength(1);
    expect(found.endpoints[0].calls).toBe(3);
    expect(tooThin(found)).toBe(true);
  });

  it('reads paging off the same endpoint asked three different ways', () => {
    expect(coverage(thorough).paged).toEqual(['api.example.com/bets/history']);
  });

  it('names what it could not recognise, and where the contributor gets it', () => {
    const found = coverage([
      call('https://api.example.com/bets/history?page=1'),
      call('https://api.example.com/bets/history?page=2'),
      call('https://api.example.com/bets/history?page=3'),
      call('https://api.example.com/account/balance'),
    ]);
    expect(found.recognised).toContain('Bet history');
    expect(found.unrecognised.map((need) => need.name)).toContain('Money in and out');
    expect(recordingReport(found).join('\n')).toContain('deposits and withdrawals');
  });

  /**
   * A Slovenian site names none of this in English, and telling its contributor
   * that their history was "not recorded" would send them back to record pages
   * they already had.
   */
  it('does not call a site that names nothing in English a thin recording', () => {
    const found = coverage([
      call('https://api.e-stave.com/zgodovina?stran=1'),
      call('https://api.e-stave.com/zgodovina?stran=2'),
      call('https://api.e-stave.com/zgodovina?stran=3'),
      call('https://api.e-stave.com/stanje'),
      call('https://api.e-stave.com/vplacila'),
    ]);
    expect(tooThin(found)).toBe(false);
    const report = recordingReport(found).join('\n');
    expect(report).toContain('does not name it in English');
    expect(report).not.toContain('cannot be written from it');
  });

  it('says to page back when nothing in the recording pages', () => {
    const report = recordingReport(
      coverage([
        call('https://api.example.com/bets/history'),
        call('https://api.example.com/bets/open'),
        call('https://api.example.com/account/balance'),
      ]),
    ).join('\n');
    expect(report).toContain('page back through your bet history');
  });

  it('says nothing about paging when the recording has it', () => {
    expect(recordingReport(coverage(thorough)).join('\n')).not.toContain('page back through');
  });
});
