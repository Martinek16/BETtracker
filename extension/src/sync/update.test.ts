import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@betanal/shared', () => ({ log: () => undefined }));

const store = new Map<string, unknown>();

const manifest = { version: '1.0.2', update_url: undefined as string | undefined };

vi.stubGlobal('chrome', {
  runtime: { getManifest: () => manifest },
  storage: {
    local: {
      set: (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) store.set(key, value);
        return Promise.resolve();
      },
      remove: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
    },
  },
});

const { UPDATE_NOTICE, checkForUpdate, isMinorNewer } = await import('./update');

const answer = (body: unknown, ok = true): void => {
  vi.stubGlobal('fetch', () => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
};

beforeEach(() => {
  store.clear();
  manifest.version = '1.0.2';
  manifest.update_url = undefined;
});

describe('which releases are worth a word', () => {
  it('speaks up for a minor bump', () => {
    expect(isMinorNewer('1.2.0', 'v1.3.0')).toBe(true);
    expect(isMinorNewer('1.9.3', 'v2.0.0')).toBe(true);
  });

  it('stays quiet for a patch, the same version, or an older one', () => {
    expect(isMinorNewer('1.2.0', 'v1.2.1')).toBe(false);
    expect(isMinorNewer('1.2.0', 'v1.2.0')).toBe(false);
    expect(isMinorNewer('1.3.0', 'v1.2.9')).toBe(false);
  });

  /** A tag this does not understand is no news, rather than news to distrust. */
  it('stays quiet for a tag it cannot read', () => {
    expect(isMinorNewer('1.2.0', 'nightly')).toBe(false);
    expect(isMinorNewer('1.2.0', '')).toBe(false);
  });
});

describe('asking GitHub', () => {
  it('leaves the release for the dashboard to find', async () => {
    answer({ tag_name: 'v1.1.0', html_url: 'https://example.test/releases/v1.1.0' });
    await checkForUpdate();
    expect(store.get(UPDATE_NOTICE)).toEqual({
      version: '1.1.0',
      url: 'https://example.test/releases/v1.1.0',
    });
  });

  it('clears a notice the copy has caught up with', async () => {
    store.set(UPDATE_NOTICE, { version: '1.1.0', url: 'https://example.test' });
    manifest.version = '1.1.0';
    answer({ tag_name: 'v1.1.0', html_url: 'https://example.test' });
    await checkForUpdate();
    expect(store.has(UPDATE_NOTICE)).toBe(false);
  });

  it('says nothing to a copy the store keeps current', async () => {
    manifest.update_url = 'https://edge.microsoft.com/extensionwebstorebase/v1/crx';
    answer({ tag_name: 'v9.0.0', html_url: 'https://example.test' });
    await checkForUpdate();
    expect(store.has(UPDATE_NOTICE)).toBe(false);
  });

  it('says nothing when GitHub does not answer', async () => {
    answer({}, false);
    await checkForUpdate();
    expect(store.has(UPDATE_NOTICE)).toBe(false);
  });
});
