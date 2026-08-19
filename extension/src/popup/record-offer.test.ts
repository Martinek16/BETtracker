/**
 * The offer used to appear on every site the app cannot read, which is most of
 * the web. It is worth a test that it now appears on one.
 */

import { describe, expect, it } from 'vitest';
import { recordOffer } from './record-offer';

const eStave = { host: 'www.e-stave.com', id: 'e-stave' };

describe('the offer to record a site', () => {
  it('is made on the site the reader said they are adding', () => {
    expect(recordOffer('www.e-stave.com', eStave, false)).toEqual({ offer: true });
  });

  it('is made on that site s other mirrors too', () => {
    expect(recordOffer('m.e-stave.com', eStave, false)).toEqual({ offer: true });
  });

  it('is not made on any other site', () => {
    expect(recordOffer('www.some-other-book.com', eStave, false)).toEqual({
      offer: false,
      because: 'another-site',
    });
  });

  it('is not made at all until a site has been named', () => {
    expect(recordOffer('www.e-stave.com', null, false)).toEqual({
      offer: false,
      because: 'nothing-named',
    });
  });

  it('is never made by a store copy, which ships without the recorder', () => {
    expect(recordOffer('www.e-stave.com', eStave, true)).toEqual({
      offer: false,
      because: 'store-copy',
    });
  });
});
