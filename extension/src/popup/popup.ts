import type { Bookmaker, ConnectionTone } from '@betanal/shared';
import { bookmakerForHost, bookmakerForRequests, PANEL_MESSAGE } from '../messaging';
import { recordOffer, type AddingSite } from './record-offer';
import type { SaveResult } from '../inject/recorder';
import type {
  AccountStatus,
  FromBackground,
  PanelMessage,
  SyncProgress,
  ToBackground,
} from '../messaging';

/** Substituted by the bundler; see the `--store` flag in `build.mjs`. */
declare const __STORE_BUILD__: boolean;

/**
 * The same document serves the toolbar popup and the panel drawn inside the
 * site's page. In the page it is a frame with no window around it, so it has to
 * say how tall it wants to be - and it is told which site it was opened over,
 * rather than working it out from the active tab.
 */
const panel = window.parent !== window ? new URLSearchParams(location.search) : null;

const reportHeight = (): void => {
  if (panel === null) return;
  const message: PanelMessage = { tag: PANEL_MESSAGE, height: document.body.scrollHeight };
  window.parent.postMessage(message, '*');
};

const closePanel = (): void => {
  if (panel === null) return;
  const message: PanelMessage = { tag: PANEL_MESSAGE, close: true };
  window.parent.postMessage(message, '*');
};

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const send = (message: ToBackground): Promise<unknown> => chrome.runtime.sendMessage(message);

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * `busy` is what the popup says about itself while the background works, and
 * `settled` is the answer for a click that finishes on its own - without it the
 * wait ends only when the sync run reports how it went.
 */
type Action = {
  label: string;
  busy: string;
  settled?: string;
  run: () => Promise<unknown>;
} | null;

interface View {
  tone: ConnectionTone;
  state: string;
  primary: Action;
  secondary: Action;
  /** Nothing but the mark, the name and this one line - see the signed-out case. */
  quiet?: true;
}

/**
 * One ink per state, the same four the settings page uses. Green is a word here
 * rather than a light: "Connected" says what a coloured dot only hinted at.
 */
const TONE: Record<ConnectionTone, string> = {
  ok: 'var(--profit)',
  busy: 'var(--pending)',
  stuck: 'var(--pending)',
  failed: 'var(--loss)',
  idle: 'var(--muted)',
};

const setConsent = (bookmaker: Bookmaker, enabled: boolean): Promise<unknown> =>
  send({ type: 'SET_CONSENT', bookmaker, enabled });

/**
 * What the popup has to say about one account, and the single thing the user can
 * do about it. Three answers only: we have the bets, we are getting them, or
 * here is what stands in the way.
 */
const viewFor = (account: AccountStatus, pending: Bookmaker | null): View => {
  const { bookmaker, bets, connection, name } = account;

  // Nobody is signed in at this site, so there is nothing to say about an account
  // yet - not whether to add it, not how much of it is stored, and not how its
  // reading is going. The mark, the name and the one thing that has to happen
  // first. Asked before the consent question on purpose: that question is raised
  // by a session arriving, and putting it on a login form is asking about
  // nothing. `pending` is the exception, because the background only sets it
  // once a session is in hand. Declined sites are answered further down.
  if (!account.signedIn && account.consent !== false && pending !== bookmaker) {
    return {
      tone: 'idle',
      state: `Sign in to ${name} to read your bets.`,
      primary: null,
      secondary: null,
      quiet: true,
    };
  }

  // A question, not a state: nothing is being read yet and nothing is wrong, so
  // it is asked in the ordinary ink and without the turning ring that means work
  // is under way.
  if (account.consent === undefined || pending === bookmaker) {
    return {
      tone: 'idle',
      state: 'Add this account to your analysis?',
      primary: {
        label: 'Connect',
        busy: 'Connecting to your account…',
        run: () => setConsent(bookmaker, true),
      },
      secondary: {
        label: 'No thanks',
        busy: 'Leaving this site alone…',
        settled: 'Not tracked.',
        run: () => setConsent(bookmaker, false),
      },
    };
  }

  if (account.consent === false) {
    // Addable only while someone is signed in: saying yes with no session behind
    // it connects nothing, and the run it kicks off ends on "nothing new to
    // read" - which reads as the site having no bets rather than as no login.
    return {
      tone: 'idle',
      state: account.signedIn ? 'Not tracked.' : `Not tracked. Sign in to ${name} to add it.`,
      primary: account.signedIn
        ? {
            label: 'Add',
            busy: 'Connecting to your account…',
            run: () => setConsent(bookmaker, true),
          }
        : null,
      secondary: null,
      quiet: account.signedIn ? undefined : true,
    };
  }

  if (connection.tone === 'busy') {
    return { tone: 'busy', state: connection.label, primary: null, secondary: null };
  }

  // A connected account with nothing stored is already being read whole: the
  // background starts that the moment it has a session, so this is a state to
  // report rather than a button to press.
  if (bets === 0 && connection.tone !== 'failed') {
    return { tone: 'busy', state: 'Reading your bets…', primary: null, secondary: null };
  }

  // Everything else is the same judgement the settings page shows, worked out
  // once in the background so the two can never disagree.
  return { tone: connection.tone, state: connection.label, primary: null, secondary: null };
};

type Counted = NonNullable<SyncProgress['kind']>;

/**
 * The click the popup is still waiting on. Once made it is never taken back: the
 * button is gone for good and this becomes first the wait, then the answer. A
 * button that reappears mid-run reads as the click having done nothing.
 */
interface Busy {
  bookmaker: Bookmaker;
  label: string;
  /** Rows written so far, per kind - the running tally under the spinner. */
  counts: Map<Counted, number>;
  /** Set once there is an answer; until then the popup is still waiting. */
  outcome: { ok: boolean; text: string } | null;
}

let busy: Busy | null = null;
/** The bookmaker this popup is speaking about, so a run's steps can be attributed. */
let here: Bookmaker | null = null;
let silenceTimer = 0;

/** Silence this long with nothing to show for it is an answer of its own. */
const SILENCE_MS = 45_000;

/**
 * Silence is only an answer if nothing is running behind it. A run walks the
 * deposits in hundreds of sequential requests and says nothing for minutes while
 * it does, which used to end a finished import on "no answer from the site".
 */
const onSilence = async (): Promise<void> => {
  if (busy === null || busy.outcome !== null) return;
  const res = (await send({ type: 'GET_STATUS' })) as FromBackground | undefined;
  if (res?.type === 'STATUS' && res.syncing) {
    armSilenceTimer();
    return;
  }
  if (busy === null || busy.outcome !== null) return;
  busy.outcome = { ok: false, text: 'No answer from the site. Open it again and retry.' };
  void refresh();
};

/** Restarted by every message, so a long run is never cut off mid-way. */
const armSilenceTimer = (): void => {
  window.clearTimeout(silenceTimer);
  silenceTimer = window.setTimeout(() => void onSilence(), SILENCE_MS);
};

const tallyText = (counts: Map<Counted, number>): string =>
  [...counts]
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${n === 1 ? kind.slice(0, -1) : kind}`)
    .join(' · ');

/**
 * What the tally is showing at this instant, walked towards what has really
 * landed. The sites hand over a page of a hundred bets at a time, so the true
 * count arrives in one jump every few seconds; counted up instead, the same run
 * reads as work being done rather than as a number that sticks and then leaps.
 */
const shown = new Map<Counted, number>();

/** A twelfth of whatever is left, so a big gap closes fast and the last rows tick. */
const stepTally = (): void => {
  if (busy === null) {
    shown.clear();
    return;
  }
  let moved = false;
  for (const [kind, total] of busy.counts) {
    const at = shown.get(kind) ?? 0;
    if (at >= total) continue;
    shown.set(kind, at + Math.max(1, Math.ceil((total - at) / 12)));
    moved = true;
  }
  if (!moved) return;
  const line = document.querySelector('.tally');
  if (line !== null) line.textContent = tallyText(shown);
};

const button = (
  action: NonNullable<Action>,
  className: string,
  account: AccountStatus,
): HTMLButtonElement => {
  const el = document.createElement('button');
  el.className = className;
  el.textContent = action.label;
  el.addEventListener('click', () => {
    busy = { bookmaker: account.bookmaker, label: action.busy, counts: new Map(), outcome: null };
    armSilenceTimer();
    void refresh();
    void action.run().then(() => {
      // The panel is in the page to ask one question. Answered, it gets out of
      // the way: the reading that follows takes minutes and is worth watching
      // only if the user goes looking for it in the toolbar popup.
      if (panel !== null) {
        closePanel();
        return;
      }
      if (busy !== null && action.settled !== undefined) {
        busy.outcome = { ok: true, text: action.settled };
      }
      void refresh();
    });
  });
  return el;
};

/**
 * The mark cut out of grey ink rather than printed on the brand's own plate: the
 * popup is about the account, and a white box shouting the logo was the loudest
 * thing on it. The same treatment the dashboard uses in its grey mode.
 */
const logoFor = (bookmaker: Bookmaker): HTMLElement => {
  const mark = document.createElement('span');
  mark.className = 'logo';
  mark.title = bookmaker;
  const url = `url(logos/${bookmaker}.png)`;
  mark.style.maskImage = url;
  mark.style.webkitMaskImage = url;
  return mark;
};

/** Ask for a read now, whatever the schedule was going to do. */
const refreshButton = (): HTMLButtonElement => {
  const el = document.createElement('button');
  el.className = 'refresh';
  el.title = 'Refresh now';
  el.setAttribute('aria-label', 'Refresh now');
  el.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>';
  return el;
};

/** What is stored, counted. A kind with nothing in it is left out, not zeroed. */
const factsText = (account: AccountStatus): string => {
  const parts: [number, string, string][] = [
    [account.bets, 'bet', 'bets'],
    [account.transactions, 'transaction', 'transactions'],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join('\u2003');
};

/** The account the open page belongs to: its mark, its name, what we are doing. */
const cardFor = (account: AccountStatus, pending: Bookmaker | null): HTMLElement => {
  const view = viewFor(account, pending);
  const working = busy?.bookmaker === account.bookmaker ? busy : null;

  const site = document.createElement('div');
  site.className = 'site';

  const head = document.createElement('div');
  head.className = 'head';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = account.name;
  const outcome = working?.outcome ?? null;

  const state = document.createElement('div');
  state.className = 'state';
  state.style.color =
    working === null
      ? TONE[view.tone]
      : outcome === null
        ? TONE.busy
        : TONE[outcome.ok ? 'ok' : 'failed'];
  // Ahead of the words, so the one thing the user can do about the state is on
  // the same line as the state. It gives way to the spinner while work is on:
  // asking again mid-run would only queue the run that is already going.
  const waiting = (working !== null && outcome === null) || view.tone === 'busy';
  if (account.consent === true && !waiting && view.quiet !== true) {
    const reread = refreshButton();
    reread.addEventListener('click', () => {
      busy = {
        bookmaker: account.bookmaker,
        label: 'Connecting…',
        counts: new Map(),
        outcome: null,
      };
      armSilenceTimer();
      void refresh();
      void send({ type: 'SYNC_NOW', mode: 'incremental' });
    });
    state.append(reread);
  } else if (waiting) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    state.append(spinner);
  }
  // A turning ring beside what is being done, so a run that takes minutes is
  // visibly still running instead of looking ignored.
  state.append(working !== null ? (outcome?.text ?? working.label) : view.state);

  const who = document.createElement('div');
  who.className = 'who';
  who.append(name, state);
  head.append(logoFor(account.bookmaker), who);
  site.append(head);

  // What has actually landed so far, counted as it lands. Prose in the line above
  // says what we are doing; this says how much of it is done. Always present
  // while a run is on, empty or not: the ticker writes into this node, and one
  // that only appears once there is something to say would never receive the
  // first number.
  if (working !== null && outcome === null) {
    const line = document.createElement('div');
    line.className = 'tally';
    line.textContent = tallyText(shown);
    site.append(line);
  }

  // What is in the database, said in numbers rather than in the status line: the
  // line above is about how the reading is going, this is about what came of it.
  // Only when nothing is running: during a read the only number worth showing is
  // what that read has found, and the total beside it reads as part of the find.
  const facts = waiting || view.quiet === true ? '' : factsText(account);
  if (account.consent === true && facts !== '') {
    const line = document.createElement('div');
    line.className = 'facts';
    const counts = document.createElement('span');
    counts.textContent = facts;
    line.append(counts);
    // Hard right of the same line: how much there is, and as of when, read as
    // one statement rather than two stacked ones.
    if (account.meta?.lastSyncAt != null) {
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = formatDateTime(account.meta.lastSyncAt);
      line.append(when);
    }
    site.append(line);
  }

  if (working === null && (view.primary !== null || view.secondary !== null)) {
    const choices = document.createElement('div');
    choices.className = 'choices';
    if (view.primary !== null) choices.append(button(view.primary, 'primary', account));
    // Declining is not a second thing to weigh up against the first, so it is
    // written rather than framed: one button on the card, and a way out beside it.
    if (view.secondary !== null) choices.append(button(view.secondary, 'plain', account));
    site.append(choices);
  }

  return site;
};

const render = (accounts: readonly AccountStatus[], pending: Bookmaker | null): void => {
  const list = $('accounts');
  list.replaceChildren(...accounts.map((account) => cardFor(account, pending)));
};

/** Said in place of an account, when there is none this page could be about. */
const renderNote = (text: string): void => {
  const site = document.createElement('div');
  site.className = 'site';
  const state = document.createElement('div');
  state.className = 'state';
  state.textContent = text;
  site.append(state);
  $('accounts').replaceChildren(site);
};

/** The bookmaker whose site is open in front of the user, if any. */
const currentBookmaker = async (): Promise<Bookmaker | null> => {
  // In the page there is no guessing to do: the panel was opened over one site.
  const named = panel?.get('site');
  if (named != null && named !== '') return named as Bookmaker;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (url === undefined) return null;
  try {
    return bookmakerForHost(new URL(url).host);
  } catch {
    return null;
  }
};

/**
 * A page whose address means nothing to us. What it has already loaded still
 * names the platform it runs on, and that is all a renumbered mirror has left in
 * common with the site we ship. Reading it here is allowed by `activeTab`: the
 * user opened this popup on this very page a moment ago.
 */
const mirrorHere = async (): Promise<{ bookmaker: Bookmaker; origin: string } | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || tab.url === undefined) return null;
  let origin: string;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    return null;
  }
  if (!origin.startsWith('https://')) return null;
  let urls: string[];
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => performance.getEntriesByType('resource').map((entry) => entry.name),
    });
    urls = (result?.result as string[] | undefined) ?? [];
  } catch {
    return null; // no access to this page, and none is asked for
  }
  const bookmaker = bookmakerForRequests(urls);
  return bookmaker === null ? null : { bookmaker, origin };
};

/**
 * Sites we recognise on sight but do not read yet. Kept here rather than as a
 * capture rule so nothing else in the extension mistakes one for a supported
 * bookmaker; the popup only says the name back to the user.
 */
const COMING_SOON: readonly { host: RegExp; name: string }[] = [
  { host: /(^|\.)(bet365\.[a-z]{2,3}|game-365\.com)$/, name: 'bet365' },
];

const comingSoonHere = async (): Promise<string | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url === undefined) return null;
  try {
    const { host } = new URL(tab.url);
    return COMING_SOON.find((site) => site.host.test(host))?.name ?? null;
  } catch {
    return null;
  }
};

/**
 * A site nobody has written an adapter for yet, and the one thing that can be
 * done about it from here: record it.
 *
 * The recording is the whole of the contributor's side of adding a bookmaker,
 * and the DevTools route to it - F12, Network, Preserve log, an export menu
 * whose default quietly strips the sign-in headers - is where most people stop.
 * This is a click, the browsing they were going to do anyway, and a click.
 */
const RECORDER_ID = 'bettracker-recorder';
const RECORDING_KEY = 'recording';
/**
 * Which site was last recorded, kept past the browser being closed. The
 * recording itself is not: this is one host and one date, so that the step the
 * dashboard shows next can be the step the reader is actually on.
 */
const RECORDED_KEY = 'recordingSaved';
/** The site the dashboard was told is being added, written by that page. */
const ADDING_KEY = 'addingSite';

interface Recording {
  origin: string;
  host: string;
}

const addingSite = async (): Promise<AddingSite | null> =>
  ((await chrome.storage.local.get(ADDING_KEY))[ADDING_KEY] as AddingSite | undefined) ?? null;

const activeTab = async (): Promise<chrome.tabs.Tab | undefined> =>
  (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

const recordingNow = async (): Promise<Recording | null> =>
  ((await chrome.storage.session.get(RECORDING_KEY))[RECORDING_KEY] as Recording | undefined) ??
  null;

/**
 * Registered rather than injected once: a bet history is browsed, and every
 * page the user opens is a fresh JS context with no hooks in it. The script
 * itself carries what it has recorded across those loads.
 */
const startRecording = async (origin: string, host: string): Promise<void> => {
  await chrome.scripting.unregisterContentScripts({ ids: [RECORDER_ID] }).catch(() => {
    /* nothing was registered */
  });
  await chrome.scripting.registerContentScripts([
    {
      id: RECORDER_ID,
      js: ['recorder.js'],
      matches: [`${origin}/*`],
      world: 'MAIN',
      runAt: 'document_start',
      // A recording nobody saved is dropped by closing the browser, in step
      // with `storage.session`. Otherwise an abandoned one would keep hooking
      // that site for good, with nothing on screen saying so.
      persistAcrossSessions: false,
    },
  ]);
  const tab = await activeTab();
  if (tab?.id !== undefined) {
    // The page in front of the user is already loaded, so the registration
    // above will not reach it until it navigates.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['recorder.js'],
      world: 'MAIN',
    });
  }
  await chrome.storage.session.set({ [RECORDING_KEY]: { origin, host } });
};

/** The page writes the file, and the access it was given is handed straight back. */
const stopRecording = async (recording: Recording): Promise<SaveResult | null> => {
  const tab = await activeTab();
  let saved: SaveResult | null = null;
  if (tab?.id !== undefined) {
    const done = await chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => window.__betTrackerSaveRecording?.() ?? null,
      })
      .catch(() => {
        /* the tab moved on; what it had recorded went with it */
        return [];
      });
    saved = (done[0]?.result as SaveResult | null | undefined) ?? null;
  }
  await chrome.scripting.unregisterContentScripts({ ids: [RECORDER_ID] }).catch(() => {
    /* already gone */
  });
  await chrome.storage.session.remove(RECORDING_KEY);
  await chrome.storage.local.set({
    [RECORDED_KEY]: { host: recording.host, at: new Date().toISOString() },
  });
  await chrome.permissions.remove({ origins: [`${recording.origin}/*`] });
  return saved;
};

const actionButton = (label: string, onClick: () => void): HTMLButtonElement => {
  const el = document.createElement('button');
  el.className = 'primary';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
};

const renderUnsupported = async (): Promise<void> => {
  const tab = await activeTab();
  let origin = '';
  let host = '';
  try {
    ({ origin, host } = new URL(tab?.url ?? ''));
  } catch {
    /* a browser page, not a site */
  }
  const soon = await comingSoonHere();
  if (!origin.startsWith('https://')) {
    renderNote(
      soon === null
        ? 'This site is not one we can read bets from.'
        : `${soon} is not supported yet. Coming later.`,
    );
    return;
  }
  const recording = await recordingNow();

  const site = document.createElement('div');
  site.className = 'site';
  const state = document.createElement('div');
  state.className = 'state';
  const choices = document.createElement('div');
  choices.className = 'choices';
  site.append(state, choices);
  $('accounts').replaceChildren(site);

  if (recording !== null && recording.origin !== origin) {
    state.textContent = `Recording ${recording.host}. Open that site again to save it.`;
    return;
  }

  if (recording !== null) {
    state.textContent = 'Recording. Click through your bet history, then save.';
    choices.append(
      actionButton('Save recording', () => {
        state.textContent = 'Saving…';
        choices.remove();
        // Said here rather than five steps later: a recording of the wrong site
        // costs a clone, a coding tool and a build before anything says so.
        void stopRecording(recording).then((saved) => {
          state.textContent =
            saved === null || saved.calls === 0
              ? 'Saved, but nothing was recorded. Browse your bet history while it records.'
              : saved.betting
                ? 'Saved to your downloads. Next: pnpm add-bookmaker.'
                : `Saved, but nothing in it looks like a betting account. Is ${recording.host} where your bets are, and were you signed in?`;
        });
      }),
    );
    return;
  }

  const adding = await addingSite();
  const offer = recordOffer(host, adding, __STORE_BUILD__);
  if (!offer.offer) {
    // Only while a site is being added is the page being the wrong one worth
    // saying. Everywhere else this popup is opened over an ordinary site, and
    // naming that site back at the reader alongside an invitation to write an
    // adapter for it is an offer nobody on that page asked for.
    state.textContent =
      offer.because === 'another-site'
        ? `${soon ?? host} is not one we read. You are adding ${adding?.host}.`
        : soon === null
          ? 'This site is not one we can read bets from.'
          : `${soon} is not supported yet. Coming later.`;
    return;
  }

  state.textContent = `${soon ?? host} is the site you are adding.`;
  choices.append(
    actionButton('Record this site', () => {
      // Answered by the click itself: Chrome refuses an origin request that does
      // not come from a user gesture, so nothing may be awaited before it.
      void chrome.permissions.request({ origins: [`${origin}/*`] }).then(async (granted) => {
        if (!granted) {
          state.textContent = 'Not recorded. Nothing on this page is read.';
          choices.remove();
          return;
        }
        await startRecording(origin, host);
        await renderUnsupported();
      });
    }),
  );
};

/** The offer to watch a mirror we recognised but were never given access to. */
const renderMirrorOffer = (bookmaker: Bookmaker, name: string, origin: string): void => {
  const site = document.createElement('div');
  site.className = 'site';

  const head = document.createElement('div');
  head.className = 'head';
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = name;
  const who = document.createElement('div');
  who.className = 'who';
  who.append(label);
  head.append(logoFor(bookmaker), who);

  const state = document.createElement('div');
  state.className = 'state';
  state.textContent = `This page runs ${name}. Read your bets here too?`;

  const choices = document.createElement('div');
  choices.className = 'choices';
  const yes = document.createElement('button');
  yes.className = 'primary';
  yes.textContent = 'Enable here';
  yes.addEventListener('click', () => {
    // The grant has to answer this click: Chrome refuses an origin request that
    // does not come from a user gesture.
    void chrome.permissions.request({ origins: [`${origin}/*`] }).then(async (granted) => {
      choices.remove();
      if (!granted) {
        state.textContent = 'Not enabled. Nothing on this page is read.';
        return;
      }
      state.textContent = 'Enabled. Reloading the page to read your account…';
      await send({ type: 'ENABLE_MIRROR', bookmaker, origin });
    });
  });
  choices.append(yes);

  site.append(head, state, choices);
  $('accounts').replaceChildren(site);
};

const refresh = async (): Promise<void> => {
  const res = (await send({ type: 'GET_STATUS' })) as FromBackground | undefined;
  if (!res || res.type !== 'STATUS') return;
  // The popup speaks about the page the user is on, and nothing else: anywhere
  // we cannot read bets from, saying so is the only honest answer.
  here = res.pending ?? (await currentBookmaker());
  // A site nobody supports, whatever said otherwise: the panel is a page of ours
  // that any site is free to embed, so what it was told to show is checked
  // against the bookmakers the background actually knows.
  if (here !== null && !res.accounts.some((a) => a.bookmaker === here)) here = null;
  if (here === null) {
    const found = await mirrorHere();
    if (found === null) {
      await renderUnsupported();
      return;
    }
    const name = res.accounts.find((a) => a.bookmaker === found.bookmaker)?.name ?? found.bookmaker;
    renderMirrorOffer(found.bookmaker, name, found.origin);
    return;
  }
  render(
    res.accounts.filter((a) => a.bookmaker === here),
    res.pending,
  );
};

$('openDashboard').addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onMessage.addListener((message: FromBackground) => {
  if (message.type === 'STATUS_CHANGED') void refresh();
  if (message.type !== 'SYNC_PROGRESS') return;
  const progress = message.progress;
  // A run nobody clicked for - the background starts one on its own as soon as a
  // site signs in. Its steps belong on this card too: without this the popup sat
  // showing the stored totals while new rows were landing behind it.
  if (busy === null && here !== null && progress.ok === undefined) {
    busy = { bookmaker: here, label: 'Reading your bets…', counts: new Map(), outcome: null };
  }
  if (busy !== null && busy.outcome === null) {
    if (progress.kind !== undefined) {
      // `totalNew` is cumulative within one account, so the largest number seen is
      // the count. Across accounts this under-counts, which still beats a tally
      // that jumps backwards each time the next account starts at zero.
      // ponytail: a per-account tally needs a bookmaker on SyncProgress.
      const seen = busy.counts.get(progress.kind) ?? 0;
      busy.counts.set(progress.kind, Math.max(seen, progress.totalNew));
    }
    if (progress.ok === undefined) armSilenceTimer();
    else {
      window.clearTimeout(silenceTimer);
      const tally = tallyText(busy.counts);
      busy.outcome = {
        ok: progress.ok,
        // What the run brought in is not repeated here: the line below counts
        // what is stored, and the same numbers twice read as two findings.
        text: progress.ok
          ? tally === ''
            ? 'Done. Nothing new to read.'
            : 'Done.'
          : progress.message,
      };
    }
  }
  void refresh();
});

// Left running for as long as the popup is open, which is seconds at a time: it
// rewrites one line of text, and only while a run has something to count.
window.setInterval(stepTally, 60);

if (panel !== null) {
  // Every render, the ticker included: in the page the frame has no window to
  // size itself, so its height is whatever this document currently needs.
  new ResizeObserver(reportHeight).observe(document.body);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });
}

void refresh();
