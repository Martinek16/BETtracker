/**
 * The recorder writes the file the sanitiser reads. Nothing else checks that the
 * two agree, and a mismatch shows up as an empty sanitised recording - which
 * reads as "this site renders on the server", the one answer that ends the
 * contribution rather than continuing it.
 */

import { describe, expect, it } from 'vitest';
import { harOf, looksLikeBetting, withoutInlineScripts } from './recorder';
import type { RecordedEntry } from './recorder';
import { findLeaks, sanitizeHar } from '../../scripts/sanitize-har.mjs';

const apiCall: RecordedEntry = {
  startedDateTime: '2026-01-01T00:00:00.000Z',
  time: 12,
  request: {
    method: 'GET',
    url: 'https://api.example.com/bets?pageNumber=2',
    httpVersion: 'HTTP/1.1',
    headers: [{ name: 'x-access-token', value: 'REDACTED' }],
    queryString: [{ name: 'pageNumber', value: '2' }],
  },
  response: {
    status: 200,
    statusText: 'OK',
    headers: [{ name: 'content-type', value: 'application/json' }],
    content: {
      mimeType: 'application/json',
      text: JSON.stringify({ bets: [{ id: 774411, stake: 12.5, settledAt: 1723952800000 }] }),
    },
  },
};

const renderedPage: RecordedEntry = {
  ...apiCall,
  response: {
    ...apiCall.response,
    headers: [{ name: 'content-type', value: 'text/html' }],
    content: { mimeType: 'text/html', text: '<table><tr><td>12.50</td></tr></table>' },
  },
};

describe('harOf', () => {
  it('writes a recording the sanitiser keeps rather than throws away', () => {
    const result = sanitizeHar(harOf([apiCall, renderedPage]));
    expect(result).toMatchObject({ kept: 1, rendered: 1 });
    const [entry] = (result.har as { log: { entries: RecordedEntry[] } }).log.entries;
    expect(entry?.request.url).toContain('pageNumber=2');
    expect(JSON.parse(entry?.response.content.text ?? '{}')).toMatchObject({
      bets: [{ id: 774411, stake: 12.5, settledAt: 1723952800000 }],
    });
    expect(findLeaks(JSON.stringify(result.har, null, 2))).toEqual([]);
  });
});

describe('looksLikeBetting', () => {
  it('knows an account of your own from a site that only prints odds', () => {
    const scores: RecordedEntry = {
      ...apiCall,
      response: {
        ...apiCall.response,
        content: {
          mimeType: 'application/json',
          text: JSON.stringify({ events: [{ id: 1, odds: { home: 1.8, away: 2.1 } }] }),
        },
      },
    };
    expect(looksLikeBetting([apiCall])).toBe(true);
    expect(looksLikeBetting([scores])).toBe(false);
  });
});

describe('the page kept alongside the calls', () => {
  it('drops what an inline script says, and keeps the markup around it', () => {
    const html =
      '<body><table><tr><td>12.50</td></tr></table>' +
      '<script>window.__STATE__={token:"secret-value"}</script></body>';
    const kept = withoutInlineScripts(html);
    expect(kept).not.toContain('secret-value');
    expect(kept).toContain('<td>12.50</td>');
  });

  it('keeps a JSON block, which is where a server-rendered history lives', () => {
    const html = '<script type="application/json">{"bets":[{"id":1}]}</script>';
    expect(withoutInlineScripts(html)).toContain('"bets"');
  });
});
