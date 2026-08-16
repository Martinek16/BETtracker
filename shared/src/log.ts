/**
 * What the extension has been doing, kept where the user can read it. The pieces
 * that do the work run in a service worker and in the bookmaker's own page, and
 * neither has a console anyone thinks to open - so what they have to say is
 * written to the database instead and shown on a page in the app.
 */

import { openDb } from './db';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string;
  level: LogLevel;
  /** Who is speaking: a bookmaker id, or the part of the app, e.g. 'sync'. */
  scope: string;
  message: string;
}

const LOG_KEY = 'log';
const LOG_CAP = 500;

/**
 * The whole list is read, changed and written back, so two appends that overlap
 * would lose one. They are queued instead.
 *
 * ponytail: one queue per context, so the worker and the dashboard can still
 * collide. Losing one diagnostic line is not worth a lock; give the entries
 * their own store if it ever matters.
 */
let queue: Promise<void> = Promise.resolve();

export const appendLog = (entry: LogEntry): Promise<void> => {
  queue = queue
    .then(async () => {
      const db = await openDb();
      const row = await db.get('meta', LOG_KEY);
      const list: LogEntry[] = Array.isArray(row?.value) ? (row.value as LogEntry[]) : [];
      list.push(entry);
      if (list.length > LOG_CAP) list.splice(0, list.length - LOG_CAP);
      await db.put('meta', { key: LOG_KEY, value: list });
    })
    .catch(() => {
      /* the log failing must never fail what it was reporting on */
    });
  return queue;
};

/** Oldest first, as they happened. */
export const getLog = async (): Promise<LogEntry[]> => {
  const db = await openDb();
  const row = await db.get('meta', LOG_KEY);
  return Array.isArray(row?.value) ? (row.value as LogEntry[]) : [];
};

export const clearLog = async (): Promise<void> => {
  const db = await openDb();
  await db.delete('meta', LOG_KEY);
};

/**
 * Records a line and returns at once - nothing waits on the log. The console it
 * also writes to is the extension's own; the bookmaker's page is never written
 * to, because a tracker announcing itself there is the site's to read too.
 */
export const log = (level: LogLevel, scope: string, message: string): void => {
  const line = `[BetTracker] ${scope}: ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
  void appendLog({ at: new Date().toISOString(), level, scope, message });
};
