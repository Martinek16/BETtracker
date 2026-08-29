import type { AnalysisUnit, AnalyticsView } from '@/context/dashboard-context';

export interface TourStep {
  /** Value of the `data-tour` attribute on the element being pointed at. */
  anchor: string;
  route: string;
  title: string;
  body: string;
  /** Analytics draws a different page per view, so the stop has to ask for its own. */
  view?: AnalyticsView;
  unit?: AnalysisUnit;
  /**
   * `data-tour` of a control to press before the stop, for a thing that lives
   * behind one. Told about rather than opened, the open-slips drawer is a button
   * nobody presses.
   */
  opens?: string;
  /**
   * `data-tour` of an element that has to be on screen already, or the stop is
   * dropped without its page ever being opened. The casino rail link is the one
   * case: a sportsbook-only reader would be walked onto an empty page.
   */
  onlyIf?: string;
}

/** What the bubble calls the page it is on, so the count reads as a place. */
export const PAGE_NAMES: Readonly<Record<string, string>> = {
  '/': 'Overview',
  '/bets': 'Bets',
  '/analytics': 'Analytics',
  '/casino': 'Casino',
  '/options': 'Settings',
  '/options/accounts': 'Accounts',
};

/**
 * Grouped by page and walked in order, so the tour crosses to a new page as
 * rarely as it can: every stop on one screen is made before the next is opened.
 *
 * A step whose element is not on screen is dropped rather than shown empty: the
 * account filter hides itself with one account, and a bet list without a combo
 * has no row to fold open.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  // ── Overview ───────────────────────────────────────────────────────────────
  {
    anchor: 'period',
    route: '/',
    title: 'Start with the period',
    body: 'Pick a stretch of time here. Every number and chart in the app is for that period only, so this is the first thing to set.',
  },
  {
    anchor: 'accounts',
    route: '/',
    title: 'One account or all of them',
    body: 'You have more than one account. Look at them added up, or click a logo to keep only that one.',
  },
  {
    anchor: 'kpis',
    route: '/',
    title: 'Your headline numbers',
    body: 'Profit is what came back minus what you staked. ROI is that profit per 100 staked. Click the first tile to switch it to money in and out instead.',
  },
  {
    anchor: 'performance',
    route: '/',
    title: 'How you got here',
    body: 'The chart is your profit over the period, so you can see when it turned. The panel beside it is where the running total stands today.',
  },
  {
    anchor: 'reads',
    route: '/',
    title: 'A short read on your betting',
    body: 'How often your picks landed, how the slips finished, your best and worst, and where money quietly leaked away.',
  },
  {
    anchor: 'active-bets',
    route: '/',
    title: 'Bets still running',
    body: 'Slips that have not finished sit behind this button: Live for matches playing right now with the score, Open for the ones still waiting to start.',
  },
  {
    anchor: 'active-bets-panel',
    opens: 'active-bets',
    route: '/',
    title: 'This is what is inside',
    body: 'We opened it for you. One card per running slip, with its picks and the score where there is one. It shuts again when you move on.',
  },
  {
    anchor: 'sidebar',
    route: '/',
    title: 'Everything else lives here',
    body: 'Bets is every slip you placed. Analytics digs into them. Cashflow is money in and out, Bonuses is what you were granted. Hover the rail to see the names. Next stop: Bets.',
  },
  // ── Bets ───────────────────────────────────────────────────────────────────
  {
    anchor: 'nav:/bets',
    route: '/bets',
    title: 'Bets',
    body: 'We are on Bets now - this is the link that brings you back. The page is one long list of every slip you placed, with the filters for it above.',
  },
  {
    anchor: 'bets-search',
    route: '/bets',
    title: 'Every bet you placed',
    body: 'This is the full list for the period you chose. Type here to find a team, a league or a market.',
  },
  {
    anchor: 'bets-status',
    route: '/bets',
    title: 'Keep only what you want to see',
    body: 'Won, Lost, or Other - which is everything else: void, cashed out and still running.',
  },
  {
    anchor: 'bets-sort',
    route: '/bets',
    title: 'Sort by any column',
    body: 'Click a heading to sort by it, click again to turn it around. Biggest stake, longest odds, worst loss - whichever you want at the top.',
  },
  {
    anchor: 'bets-table',
    route: '/bets',
    title: 'One row, one slip',
    body: 'When you placed it, what you picked, the odds you took, the stake and how it ended. Bets still running are pinned above the settled ones.',
  },
  {
    anchor: 'combo-row',
    route: '/bets',
    title: 'Open a combo',
    body: 'A row that says "4 selections" is a combo. Click it and the picks inside fold out, each with its own result. Next stop: Analytics.',
  },
  // ── Analytics ──────────────────────────────────────────────────────────────
  {
    anchor: 'nav:/analytics',
    route: '/analytics',
    view: 'general',
    unit: 'slips',
    title: 'Analytics',
    body: 'This is Analytics. The same bets as on the last page, only counted up and drawn, to say what has been working and what has not.',
  },
  {
    anchor: 'analytics-view',
    route: '/analytics',
    view: 'general',
    unit: 'slips',
    title: 'Two ways to read the same bets',
    body: 'General is the summary you are looking at now. Breakdowns takes the very same bets and splits them by one thing at a time.',
  },
  {
    anchor: 'analysis-unit',
    route: '/analytics',
    view: 'general',
    unit: 'slips',
    title: 'Slips or selections',
    body: 'Slips counts whole tickets: a five-fold is one bet that won or lost. Selections counts every pick on its own, so you can see which teams and markets actually came in.',
  },
  {
    anchor: 'analytics-basics',
    route: '/analytics',
    view: 'general',
    unit: 'slips',
    title: 'The plain facts',
    body: 'How many bets, what you staked, what came back, how often you were right. Underneath, the habits that cost you the most.',
  },
  {
    anchor: 'questions',
    route: '/analytics',
    view: 'general',
    unit: 'slips',
    title: 'One card, one question',
    body: 'Were you really winning, how much of it was luck, and did your stakes climb after a loss. Click a card to see the working behind the answer.',
  },
  {
    anchor: 'analytics-charts',
    route: '/analytics',
    view: 'general',
    unit: 'slips',
    title: 'The same thing, drawn',
    body: 'Profit by odds band, by how many picks were on the slip, and by stake size. A tall red bar is a habit worth knowing about.',
  },
  {
    anchor: 'breakdown-tabs',
    route: '/analytics',
    view: 'breakdowns',
    unit: 'slips',
    title: 'Split it by one thing',
    body: 'This is Breakdowns. Slip type, stake size, odds band, live or pre-match, cash-out, bookmaker. Switch to Selections and you split by sport, league, market and team instead.',
  },
  {
    anchor: 'breakdown-table',
    route: '/analytics',
    view: 'breakdowns',
    unit: 'slips',
    title: 'Read the rows',
    body: 'Each row is one group: how many bets, what you staked and what it did to your profit. Sort by any column to find your best and worst corners.',
  },
  // ── Casino ─────────────────────────────────────────────────────────────────
  // Dropped whole for a sportsbook-only reader: without the rail link there is
  // no casino page worth walking onto.
  {
    anchor: 'nav:/casino',
    onlyIf: 'nav:/casino',
    route: '/casino',
    title: 'Casino',
    body: 'One of your accounts runs a casino off the same wallet as the bets, so the rounds it played are read too. They are kept apart from the betting here, where they cannot skew it.',
  },
  {
    anchor: 'casino-kpis',
    onlyIf: 'nav:/casino',
    route: '/casino',
    title: 'What the slots did',
    body: 'What the rounds cost, what came back, and how much of every unit staked was returned. A return under 100% is the house edge doing its work.',
  },
  {
    anchor: 'casino-rounds',
    onlyIf: 'nav:/casino',
    route: '/casino',
    title: 'Round by round',
    body: 'Every spin drawn in the order it was played, so a session that ran away is a shape rather than a number.',
  },
  {
    anchor: 'casino-games',
    onlyIf: 'nav:/casino',
    route: '/casino',
    title: 'Which game took it',
    body: 'The same rounds grouped by game, by stake and by what they paid. This is where a favourite that quietly costs you shows up.',
  },
  {
    anchor: 'casino-sittings',
    onlyIf: 'nav:/casino',
    route: '/casino',
    title: 'One evening at a time',
    body: 'Rounds played close together are one sitting. Click a date to narrow everything above to that evening. Next stop: Settings.',
  },
  // ── Settings ───────────────────────────────────────────────────────────────
  {
    anchor: 'nav:/options',
    route: '/options',
    title: 'Settings',
    body: 'Last stop, at the bottom of the rail. Everything here changes how the other pages look and count - nothing on this page is about a single bet.',
  },
  {
    anchor: 'options-tabs',
    route: '/options',
    title: 'Settings and accounts',
    body: 'Settings is how things look and count. Accounts is the logins being read. Log shows what the extension did last, if something looks missing.',
  },
  {
    anchor: 'settings-preferences',
    route: '/options',
    title: 'How things are counted',
    body: 'Which period pages open on, your currency, and whether odds read as 2.50 or 6/4. Change these and every page follows.',
  },
  {
    anchor: 'settings-balance',
    route: '/options',
    title: 'What the balance means',
    body: 'Live is the money in your accounts right now. Net is whether you are up or down overall. You can also show one total or one figure per bookmaker.',
  },
  {
    anchor: 'settings-appearance',
    route: '/options',
    title: 'How it looks',
    body: 'Light or dark, and whether bookmaker logos keep their colours.',
  },
  {
    anchor: 'settings-notifications',
    route: '/options',
    title: 'When it should speak up',
    body: 'A note when new bets come in, or when an account quietly stops updating. Off is fine - nothing is lost either way.',
  },
  {
    anchor: 'settings-data',
    route: '/options',
    title: 'Your own backup',
    body: 'Save everything to a file on your computer, or pick out single accounts. Nothing is uploaded anywhere - the file is yours alone. This is also where you can replay this tour.',
  },
  // ── Accounts ───────────────────────────────────────────────────────────────
  {
    anchor: 'options-tabs',
    route: '/options/accounts',
    title: 'Accounts',
    body: 'We moved to the Accounts tab. This is the one page about the logins themselves rather than the bets that came out of them.',
  },
  {
    anchor: 'accounts-list',
    route: '/options/accounts',
    title: 'The accounts being read',
    body: 'One card per login, with its bets, deposits, withdrawals and whether it is still connected.',
  },
  {
    anchor: 'account-visibility',
    route: '/options/accounts',
    title: 'Take one out of the numbers',
    body: 'This switch hides an account from every page without deleting anything. Turn it back on and its bets return.',
  },
  {
    anchor: 'account-details',
    route: '/options/accounts',
    title: 'Look at one account alone',
    body: 'Open a card to rename it to whatever you call it, and to see how that account on its own has done.',
  },
  {
    anchor: 'supported-books',
    route: '/options/accounts',
    title: 'That is the tour',
    body: 'These are the bookmakers the extension can read. Sign in at one of them and it starts filling in by itself. You can replay this tour any time from Settings.',
  },
];
