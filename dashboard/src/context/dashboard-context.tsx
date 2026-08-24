import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  accountKey,
  convertAmount,
  convertBets,
  convertBonuses,
  convertRounds,
  convertTransactions,
  dayOf,
  log,
  type AccountRef,
  type BalanceLayout,
  type BalanceSource,
  type Bet,
  type Bonus,
  type Bookmaker,
  type CasinoRound,
  type KnownAccount,
  type OddsFormat,
  type Transaction,
} from '@betanal/shared';
import {
  RANGE_OPTIONS,
  isoDay,
  periodLabel,
  rangeToDays,
  rangeUntil,
  type RangeChoice,
} from '@/components/dashboard/time-range-toggle';
import { BOOKMAKER_IDS } from '@bookmakers/catalog';
import { filterBetsByRange, rangeCutoff, rangeEnd } from '@/lib/chart-data';
import { hasStored, usePersistedState } from '@/lib/persisted-state';
import { setNumberFormat } from '@/lib/utils';
import {
  getKnownAccounts,
  getRates,
  getSettings,
  loadBalances,
  loadBetSummary,
  loadBets,
  loadBonuses,
  loadCasinoRounds,
  loadPerks,
  loadTransactions,
} from '@/data/source';
import { collectedSince } from '@/data/claimable';
import { subscribeToSettings } from '@/data/use-settings';

/** What a row of analytics counts: a whole slip, or each pick inside it. */
export type AnalysisUnit = 'slips' | 'selections';

/** Which half of analytics is on screen: the diagnostics or the dimension tables. */
export type AnalyticsView = 'general' | 'breakdowns';

/** Which account the whole dashboard is showing. */
export type AccountFilter = Bookmaker | 'all';

const RANGE_CHOICES: readonly RangeChoice[] = [...RANGE_OPTIONS.map((o) => o.value), 'custom'];

interface DashboardContextValue {
  /**
   * Bets in the selected period, plus every open slip whatever its date. Not the
   * whole history: years of it are read a window at a time so the heap does not
   * have to hold what nothing on screen is asking for.
   */
  bets: Bet[];
  /** Deposits and withdrawals, all time - money in and out of the account. */
  transactions: Transaction[];
  /** Bonus grants, already converted. Never mixed into transactions - see `Bonus`. */
  bonuses: Bonus[];
  /**
   * The same two, untouched by the account toggle. The header states what is in
   * the accounts, which is one figure whatever a page is narrowed to.
   */
  allTransactions: Transaction[];
  allBonuses: Bonus[];
  /**
   * The window's bets, likewise untouched by the account toggle. What a league is
   * called and which country it is played in is read from these, so narrowing the
   * page to one book never renames a competition or takes its flag away.
   */
  allBets: Bet[];
  /**
   * Every casino round on record, converted. Read here rather than on the casino
   * page so that page opens with its figures already in hand, like every other.
   */
  casinoRounds: CasinoRound[];
  /** Every login the extension has seen, whether or not it is switched off. */
  knownAccounts: KnownAccount[];
  /** Bets stored in total, counted in the database rather than in `bets`. */
  betCount: number;
  periodBets: Bet[];
  /** The currency every amount above has been converted into. */
  currency: string;
  /** How every price on screen is written. */
  oddsFormat: OddsFormat;
  /** Which figure the header calls the balance. */
  balanceSource: BalanceSource;
  /** Whether the header adds the accounts up or lists them side by side. */
  balanceLayout: BalanceLayout;
  /** False when the header balance leaves granted bonus money out. */
  includeBonus: boolean;
  /** True when bookmaker logos are drawn in grey instead of their own colours. */
  monoIcons: boolean;
  /** Records held out of every total because no rate covered their day. */
  unconvertible: number;
  /** Money sitting in every connected account, converted, one entry per account. */
  accountBalances: BalanceRow[];
  /** Rewards sitting unclaimed, converted. Empty when there is nothing waiting. */
  claimable: ClaimableReward[];
  /** Bumped on every reload, for pages reading stores this context does not. */
  nonce: number;
  /** Connected accounts whose balance has never been read. */
  unreadBalances: Bookmaker[];
  bookmaker: AccountFilter;
  setBookmaker: (bookmaker: AccountFilter) => void;
  /** Accounts that actually hold data. A filter over one account is just noise. */
  activeBookmakers: Bookmaker[];
  loading: boolean;
  reload: () => void;
  range: RangeChoice;
  setRange: (range: RangeChoice) => void;
  /** Ends of a hand-picked window, `yyyy-mm-dd`. Only read when range is custom. */
  customFrom: string | null;
  customTo: string | null;
  /** `null` on either end means "as wide as the data goes on that side". */
  setCustom: (from: string | null, to: string | null) => void;
  /** Oldest record on screen, so a picked start date cannot run off the data. */
  earliestRecord: string | null;
  days: number | null;
  /** Midnight of the window's last day, or `null` when it runs to today. */
  until: number | null;
  periodLabel: string;
  analysisUnit: AnalysisUnit;
  setAnalysisUnit: (unit: AnalysisUnit) => void;
  analyticsView: AnalyticsView;
  setAnalyticsView: (view: AnalyticsView) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const byAccount = <T extends { bookmaker: Bookmaker }>(
  rows: readonly T[],
  only: AccountFilter,
): T[] => (only === 'all' ? [...rows] : rows.filter((row) => row.bookmaker === only));

/**
 * The money in one account: its worth in the display currency, and the coins
 * that worth is made of. Two logins at one site are two of these; without the
 * login in the row they would collide into one entry on screen.
 */
export interface BalanceRow {
  bookmaker: Bookmaker;
  key: string;
  amount: number;
  /** Each coin with what it is worth. Empty at a site that keeps one balance. */
  holdings: { currency: string; amount: number; worth: number }[];
  /** Worth put aside in the site's vault, out of betting reach and out of `amount`. */
  vault?: number;
  /** Lifetime turnover the site reports itself, split by product. */
  wagered?: { sports: number; casino: number };
  /** Lifetime result the site reports itself, split by product. */
  result?: { sports: number; casino: number };
}

/**
 * A reward that is sitting there waiting to be claimed rather than one that was
 * already given. It is worth surfacing precisely because nothing happens to it
 * until the player goes and takes it.
 */
export interface ClaimableReward {
  bookmaker: Bookmaker;
  key: string;
  kind: 'rakeback';
  /** Worth in the display currency, or null when no rate covered the coin. */
  worth: number | null;
  /** The coins it is held in, so the figure is never the whole answer. */
  parts: { currency: string; amount: number }[];
}

/** Everything read from the database, already in one currency. */
interface Loaded {
  bets: Bet[];
  transactions: Transaction[];
  bonuses: Bonus[];
  casinoRounds: CasinoRound[];
  knownAccounts: KnownAccount[];
  balances: BalanceRow[];
  claimable: ClaimableReward[];
  currency: string;
  oddsFormat: OddsFormat;
  balanceSource: BalanceSource;
  balanceLayout: BalanceLayout;
  includeBonus: boolean;
  monoIcons: boolean;
  unconvertible: number;
  /** Counted in the database, so a windowed read of `bets` cannot shrink it. */
  betCount: number;
  /** Oldest stored day, likewise counted rather than derived from `bets`. */
  earliest: string | null;
  /** Bookmakers holding bets, from the index - `bets` only covers the window. */
  betBookmakers: Bookmaker[];
}

const NOTHING: Loaded = {
  bets: [],
  transactions: [],
  bonuses: [],
  casinoRounds: [],
  knownAccounts: [],
  balances: [],
  claimable: [],
  betCount: 0,
  earliest: null,
  betBookmakers: [],
  currency: 'EUR',
  oddsFormat: 'decimal',
  balanceSource: 'live',
  balanceLayout: 'total',
  includeBonus: true,
  monoIcons: true,
  unconvertible: 0,
};

export const DashboardProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [data, setData] = useState<Loaded>(NOTHING);
  const [bookmaker, setBookmaker] = usePersistedState<AccountFilter>('bookmaker', 'all', [
    'all',
    ...BOOKMAKER_IDS,
  ]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [range, setRange] = usePersistedState<RangeChoice>('range', '7d', RANGE_CHOICES);
  // Read during the first render: the hook writes its own value on mount, so by
  // the time any effect runs the key is there whether the user picked it or not.
  const [rangeWasStored] = useState(() => hasStored('range'));
  const [customFrom, setFrom] = usePersistedState<string | null>('customFrom', null);
  const [customTo, setTo] = usePersistedState<string | null>('customTo', null);
  const [analysisUnit, setAnalysisUnit] = usePersistedState<AnalysisUnit>('analysisUnit', 'slips', [
    'slips',
    'selections',
  ]);
  const [analyticsView, setAnalyticsView] = usePersistedState<AnalyticsView>(
    'analyticsView',
    'general',
    ['general', 'breakdowns'],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Picking a date is the whole gesture: it says "custom" as well as when.
  const setCustom = useCallback((from: string | null, to: string | null) => {
    setFrom(from);
    setTo(to);
    setRange('custom');
  }, []);

  const bets = useMemo(() => byAccount(data.bets, bookmaker), [data.bets, bookmaker]);
  const transactions = useMemo(
    () => byAccount(data.transactions, bookmaker),
    [data.transactions, bookmaker],
  );
  const bonuses = useMemo(() => byAccount(data.bonuses, bookmaker), [data.bonuses, bookmaker]);

  // Read off the index rather than from the loaded rows: those are one window,
  // and the pickers have to know where the whole history starts.
  const earliestRecord = data.earliest;

  // An unset end of a custom window is the widest one the data allows, which is
  // also what the pickers show: Custom on its own must not mean "no bets at all".
  const from = customFrom ?? (earliestRecord === null ? null : isoDay(new Date(earliestRecord)));
  const days = rangeToDays(range, from, customTo);
  const until = rangeUntil(range, customTo);
  const label = periodLabel(range, from, customTo);

  // The same window the pages filter by, written as the timestamps the periodDate
  // index is keyed on. Both ends open is the All period, and only that one still
  // reads the whole store.
  const windowFrom = days === null ? null : new Date(rangeCutoff(days, until)).toISOString();
  const windowTo = until === null ? null : new Date(rangeEnd(until)).toISOString();

  // Still filtered after loading: the window is fetched from the database, but
  // open slips come with it whatever their date and are not part of the period.
  const periodBets = useMemo(() => filterBetsByRange(bets, days, until), [bets, days, until]);

  // A balance counts as much as a bet: an account that has been read but never
  // played is still connected, and leaving it out hid it from the header entirely
  // - which is exactly what an empty account looks like.
  const activeBookmakers = useMemo(() => {
    const seen = new Set<Bookmaker>(data.betBookmakers);
    for (const row of [...data.transactions, ...data.bonuses, ...data.balances])
      seen.add(row.bookmaker);
    return BOOKMAKER_IDS.filter((b) => seen.has(b));
  }, [data]);

  // Not narrowed by the account toggle: the balance answers "how much is in the
  // accounts", and that answer does not change because a page is being read one
  // account at a time.
  const unreadBalances = useMemo(
    () => activeBookmakers.filter((b) => !data.balances.some((read) => read.bookmaker === b)),
    [data.balances, activeBookmakers],
  );

  // The setting says which period a dashboard *opens* on, so it only applies
  // when this tab has not been given a range yet: a reload must not throw away
  // the one the user picked.
  useEffect(() => {
    if (rangeWasStored) return;
    void getSettings().then((s) => setRange(s.defaultRange));
  }, [rangeWasStored, setRange]);

  useEffect(() => {
    let active = true;
    // `loading` is not raised again on a reload: a background sync would replace
    // whatever is on screen with "Loading…" for an instant and put it straight
    // back, which reads as the page flickering rather than as it refreshing.
    void Promise.all([
      loadBets(windowFrom, windowTo),
      loadTransactions(),
      loadBonuses(),
      loadBalances(),
      getSettings(),
      getRates(),
      loadBetSummary(),
      getKnownAccounts(),
      loadPerks(),
      loadCasinoRounds(),
    ]).then(
      ([
        loadedBets,
        loadedTxs,
        loadedBonuses,
        loadedBalances,
        settings,
        rates,
        summary,
        known,
        loadedPerks,
        loadedRounds,
      ]) => {
        if (!active) return;
        setNumberFormat(settings.numberFormat, settings.symbolPosition);
        // Both filters run once, here: switching an account off is what makes it
        // vanish from every view, and converting once is what lets every
        // calculation downstream keep working on plain comparable numbers.
        const shown = <T extends AccountRef>(rows: readonly T[]): T[] =>
          rows.filter((row) => !settings.hiddenAccounts.includes(accountKey(row)));
        const visibleBets = shown(loadedBets);
        const target = settings.currency;
        const converted = {
          bets: convertBets(visibleBets, rates, target),
          transactions: convertTransactions(shown(loadedTxs), rates, target),
          bonuses: convertBonuses(shown(loadedBonuses), rates, target),
        };
        const casinoRounds = convertRounds(loadedRounds, rates, target).converted;
        // A balance is read off the page, where the currency symbol can be missing;
        // the account's own movements are denominated in it and say which it is.
        const accountCurrency = (bm: Bookmaker): string =>
          loadedTxs.find((t) => t.bookmaker === bm)?.currency ??
          loadedBets.find((b) => b.bookmaker === bm)?.currency ??
          target;
        const balances = shown(loadedBalances).flatMap((b) => {
          const day = dayOf(b.capturedAt);
          const amount = convertAmount(
            b.amount,
            b.currency ?? accountCurrency(b.bookmaker),
            day,
            rates,
            target,
          );
          if (amount === null) {
            // Dropping it here empties the live list, and the header then falls
            // back to the tracked figure without ever saying why.
            log(
              'warn',
              b.bookmaker,
              `balance left out: no ${b.currency ?? '?'}→${target} rate near ${day}`,
            );
            return [];
          }
          // A coin nobody has a rate for is left out of the list rather than
          // priced at nothing; the account's own total already counted it.
          const holdings = (b.holdings ?? []).flatMap((h) => {
            const worth = convertAmount(h.amount, h.currency, day, rates, target);
            return worth === null ? [] : [{ ...h, worth }];
          });
          const vault =
            b.vault === undefined
              ? null
              : convertAmount(
                  b.vault,
                  b.currency ?? accountCurrency(b.bookmaker),
                  day,
                  rates,
                  target,
                );
          const inTarget = (value: number): number | null =>
            convertAmount(value, b.currency ?? accountCurrency(b.bookmaker), day, rates, target);
          const sports = b.wagered === undefined ? null : inTarget(b.wagered.sports);
          const casino = b.wagered === undefined ? null : inTarget(b.wagered.casino);
          const wonSports = b.result === undefined ? null : inTarget(b.result.sports);
          const wonCasino = b.result === undefined ? null : inTarget(b.result.casino);
          return [
            {
              bookmaker: b.bookmaker,
              key: accountKey(b),
              amount,
              holdings,
              ...(vault === null ? {} : { vault }),
              ...(sports === null || casino === null ? {} : { wagered: { sports, casino } }),
              ...(wonSports === null || wonCasino === null
                ? {}
                : { result: { sports: wonSports, casino: wonCasino } }),
            },
          ];
        });
        // Rakeback sits in coins the display currency may have no rate for, so the
        // bookmaker's own USD pricing is the fallback before giving up on a figure.
        const claimable = shown(loadedPerks).flatMap((p): ClaimableReward[] => {
          const balances = p.rakeback?.balances ?? [];
          if (!settings.showClaimable) return [];
          if (p.rakeback?.enabled !== true || balances.length === 0) return [];
          // Claimed on the site since this reading was taken, so what it says is
          // waiting is already in the balance.
          if (collectedSince(loadedBonuses, p, p.readAt)) return [];
          const day = dayOf(p.readAt);
          let worth = 0;
          for (const b of balances) {
            const priced =
              convertAmount(b.amount, b.currency, day, rates, target) ??
              (b.worth === null ? null : convertAmount(b.worth, 'USD', day, rates, target));
            if (priced === null) {
              worth = Number.NaN;
              break;
            }
            worth += priced;
          }
          return [
            {
              bookmaker: p.bookmaker,
              key: accountKey(p),
              kind: 'rakeback',
              worth: Number.isNaN(worth) ? null : worth,
              parts: balances.map((b) => ({ currency: b.currency, amount: b.amount })),
            },
          ];
        });
        setData({
          bets: converted.bets.converted,
          transactions: converted.transactions.converted,
          bonuses: converted.bonuses.converted,
          casinoRounds,
          knownAccounts: known,
          balances,
          claimable,
          currency: target,
          oddsFormat: settings.oddsFormat,
          balanceSource: settings.balanceSource,
          balanceLayout: settings.balanceLayout,
          includeBonus: settings.includeBonus,
          monoIcons: settings.monoIcons,
          unconvertible:
            converted.bets.skipped.length +
            converted.transactions.skipped.length +
            converted.bonuses.skipped.length,
          betCount: summary.count,
          earliest: summary.earliest,
          // Counted per bookmaker, hidden per account: a site whose every known
          // login is switched off has been switched off, and listing it would put
          // a toggle on screen that nothing behind it can fill.
          betBookmakers: summary.bookmakers.filter((b) =>
            shown(known).some((a) => a.bookmaker === b),
          ),
        });
        setLoading(false);
      },
      // A read that throws used to leave the whole dashboard on "Loading…" for
      // good: nothing here ever stopped waiting. Saying so and letting the empty
      // states speak is worse news, but it is news.
      (err: Error) => {
        if (!active) return;
        log('error', 'dashboard', `could not read the database: ${err.message}`);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [nonce, windowFrom, windowTo]);

  // Everything below is derived from the settings as they were at load time, so a
  // change to any of them has to be re-derived rather than merely re-rendered.
  useEffect(() => subscribeToSettings(reload), [reload]);

  useEffect(() => {
    // No read is kicked off here: the worker syncs on its own schedule, and a run
    // started by opening a tab only finishes if that tab is left open.
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
    const onMessage = (message: { type?: string; progress?: { done?: boolean } }): void => {
      // A balance is scraped on its own, without a sync, and the header is the
      // first place a stale one shows.
      if (message.type === 'BALANCE') reload();
      if (message.type === 'SYNC_PROGRESS' && message.progress?.done) reload();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [reload]);

  return (
    <DashboardContext.Provider
      value={{
        bets,
        transactions,
        bonuses,
        allTransactions: data.transactions,
        allBonuses: data.bonuses,
        allBets: data.bets,
        casinoRounds: data.casinoRounds,
        knownAccounts: data.knownAccounts,
        betCount: data.betCount,
        periodBets,
        currency: data.currency,
        oddsFormat: data.oddsFormat,
        balanceSource: data.balanceSource,
        balanceLayout: data.balanceLayout,
        includeBonus: data.includeBonus,
        monoIcons: data.monoIcons,
        unconvertible: data.unconvertible,
        accountBalances: data.balances,
        claimable: data.claimable,
        nonce,
        unreadBalances,
        bookmaker,
        setBookmaker,
        activeBookmakers,
        loading,
        reload,
        range,
        setRange,
        customFrom,
        customTo,
        setCustom,
        earliestRecord,
        days,
        until,
        periodLabel: label,
        analysisUnit,
        setAnalysisUnit,
        analyticsView,
        setAnalyticsView,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextValue => {
  const ctx = useContext(DashboardContext);
  if (ctx === null) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
};
