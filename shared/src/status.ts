/**
 * How an account is doing, in one line. The popup and the settings page both
 * read it from here, so a colour means the same thing wherever it is shown and
 * a state added in one place cannot go missing in the other.
 *
 * Type-only import on purpose: this file must stay free of runtime dependencies
 * so the popup can render a state without pulling the database layer in with it.
 */

import type { SyncMeta } from './db';

export type ConnectionTone = 'ok' | 'busy' | 'stuck' | 'failed' | 'idle';

export interface Connection {
  tone: ConnectionTone;
  label: string;
}

/** Nothing read for this long and what is stored has stopped being current. */
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const connectionOf = (
  meta: SyncMeta | null | undefined,
  now: number = Date.now(),
): Connection => {
  if (meta?.lastSyncAt == null) return { tone: 'idle', label: 'Not connected' };
  if (meta.lastStatus === 'error') return { tone: 'failed', label: 'Not working - check the log' };
  if (meta.lastStatus === 'syncing') return { tone: 'busy', label: 'Connecting…' };
  // Read before, but the site stopped identifying us. Nothing is broken and the
  // history is intact - it just stops growing until the site is opened again,
  // which is a different answer from both "working" and "failed". Said as the
  // one thing that fixes it: "stopped part-way - check the log" named no cause
  // and pointed at a log that says nothing the user can act on.
  if (meta.lastStatus === 'logged_out') {
    return { tone: 'stuck', label: 'Sign in at the site to carry on reading' };
  }
  const age = now - Date.parse(meta.lastSyncAt);
  if (age > STALE_MS) {
    const weeks = Math.round(age / WEEK_MS);
    return { tone: 'idle', label: `Out of date - last read ${weeks} weeks ago` };
  }
  return { tone: 'ok', label: 'Connected' };
};
