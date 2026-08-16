/**
 * The sanitiser is the one tool in this repo whose failure is irreversible: a
 * token published in a pull request is public before anyone reads the diff.
 * So it is tested against a recording that carries one of everything.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeHar, findLeaks } from './sanitize-har.mjs';

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
              bets: [
                { id: 1, userId: 99887766, stake: 12.5, odds: 2.35, sport: 'Football' },
              ],
            }),
          },
        },
      },
      {
        startedDateTime: '2026-01-01T00:00:01.000Z',
        time: 3,
        request: { method: 'GET', url: 'https://cdn.example.com/logo.png', headers: [], queryString: [] },
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
   * A server-rendered site sanitises down to nothing, and the count of what
   * survived cannot say why. Counting the pages separately is what lets the
   * command tell a contributor the site is the obstacle, not their capture.
   */
  it('counts the pages a site rendered on the server', () => {
    const page = {
      startedDateTime: '2026-01-01T00:00:02.000Z',
      time: 8,
      request: { method: 'GET', url: 'https://www.example.com/history', headers: [], queryString: [] },
      response: {
        status: 200,
        headers: [],
        content: { mimeType: 'text/html; charset=utf-8', text: '<table><tr><td>12.50</td></tr></table>' },
      },
    };
    const onlyPages = { log: { entries: [page] } };

    expect(sanitizeHar(structuredClone(onlyPages))).toMatchObject({ kept: 0, rendered: 1 });
    // The image is not a rendered page, so a normal recording reports none.
    expect(run().rendered).toBe(0);
  });
});
