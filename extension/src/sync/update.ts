/**
 * Whether a newer release is out, for the copy that cannot fetch one itself.
 *
 * Chrome removes gambling-related extensions, so everywhere but Edge this is
 * installed from a folder - and a folder never updates. The store copy is left
 * alone: the browser writes `update_url` into the manifest it serves, and that
 * copy is already being kept current for the reader.
 *
 * Only a minor bump is worth saying anything about. A patch release is picked
 * up on the next download either way, and unzipping a folder by hand for one is
 * more work than the fix is worth.
 */

import { log } from '@betanal/shared';

const REPO = 'Martinek16/BETtracker';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Where the dashboard reads what was found. Absent means nothing to say. */
export const UPDATE_NOTICE = 'updateNotice';

export interface UpdateNotice {
  /** Without the tag's `v`, so it reads like the version in About does. */
  version: string;
  url: string;
}

const parse = (version: string): number[] => version.replace(/^v/, '').split('.').map(Number);

/**
 * A tag that is at least one minor version ahead. Anything unparseable lands as
 * `NaN`, which loses every comparison below - a release named in some way this
 * does not expect is silently no news, rather than news that cannot be trusted.
 */
export const isMinorNewer = (current: string, latest: string): boolean => {
  const [currentMajor = 0, currentMinor = 0] = parse(current);
  const [latestMajor = 0, latestMinor = 0] = parse(latest);
  return latestMajor > currentMajor || (latestMajor === currentMajor && latestMinor > currentMinor);
};

/** The store copy updates itself; a build loaded from a folder has no `update_url`. */
const isUnpacked = (): boolean => chrome.runtime.getManifest().update_url === undefined;

/**
 * Ask GitHub once and leave the answer in storage for the dashboard to read.
 *
 * A stale notice is cleared on the way through, so the copy that has since been
 * updated stops being told to update. GitHub allows sixty unauthenticated
 * requests an hour per address; this runs when the browser opens, which is
 * nowhere near it.
 */
export const checkForUpdate = async (): Promise<void> => {
  if (!isUnpacked()) return;

  let release: { tag_name?: unknown; html_url?: unknown };
  try {
    const res = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    release = (await res.json()) as typeof release;
  } catch (error) {
    // Offline, rate-limited, or no release yet. None of it is the user's problem.
    log('warn', 'update', `could not ask GitHub for the latest release: ${String(error)}`);
    return;
  }

  const current = chrome.runtime.getManifest().version;
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  // A release page nobody can be sent to is not a notice worth showing.
  if (typeof release.html_url !== 'string' || !isMinorNewer(current, tag)) {
    await chrome.storage.local.remove(UPDATE_NOTICE);
    return;
  }

  const notice: UpdateNotice = { version: tag.replace(/^v/, ''), url: release.html_url };
  log('info', 'update', `${notice.version} is out; this copy is ${current}`);
  await chrome.storage.local.set({ [UPDATE_NOTICE]: notice });
};
