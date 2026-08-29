/**
 * Whether the dashboard is showing the made-up history instead of the stored one.
 *
 * Kept in `localStorage` rather than in the URL: the link used to have to carry
 * `demo=1`, and every navigation that dropped it dropped the demo with it, so
 * only the page it was typed on could be looked at. Once switched on it stays on
 * across pages and reloads, until it is switched off again.
 *
 * Not an app setting: settings are read out of the database, asynchronously, and
 * this answer is needed by the reads themselves, before anything is loaded.
 */

const KEY = 'bettracker.demo';

/** The tests import the demo history through this module, and run without a DOM. */
const browser = typeof window !== 'undefined';

/** The old link still works, and now turns the switch on rather than the page. */
if (browser && /[?&#]demo=(1|live)(&|#|$)/.test(window.location.href)) {
  localStorage.setItem(KEY, '1');
}

export const isDemoMode = (): boolean => browser && localStorage.getItem(KEY) === '1';

/**
 * Reloads, because the demo replaces every read the pages have already made and
 * there is no cheaper way to make them all take the other answer.
 */
export const setDemoMode = (on: boolean): void => {
  if (on) localStorage.setItem(KEY, '1');
  else localStorage.removeItem(KEY);
  window.location.reload();
};
