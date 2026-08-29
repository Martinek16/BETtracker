import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { accountKey, type Bet, type Bookmaker } from '@betanal/shared';
import { ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Ticket } from 'lucide-react';
import { ActiveSlipCard, useOpenSlips } from '@/components/active-bets/active-slip-card';
import { SlipTotals } from '@/components/active-bets/slip-totals';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { SearchBox } from '@/components/dashboard/search-box';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import { betSearchText } from '@/lib/bet-display';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAccountNames } from '@/data/accounts';
import { useOpenBets } from '@/data/use-open-bets';

/**
 * How many columns the cards are laid out in, read off the same widths the
 * classes below use. The cards are dealt across the columns here rather than by
 * CSS, so the count has to be known to the page and not only to the stylesheet.
 */
const columnsAt = (width: number): number =>
  width < 640 ? 1 : width < 768 ? 2 : width < 1024 ? 3 : 4;

const useColumnCount = (): number => {
  const [columns, setColumns] = useState(() => columnsAt(window.innerWidth));
  useEffect(() => {
    const measure = (): void => {
      setColumns(columnsAt(window.innerWidth));
    };
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);
  return columns;
};

/** One login with something open on it - the unit the page filters by. */
interface OpenAccount {
  key: string;
  bookmaker: Bookmaker;
  label: string;
}

/**
 * Two logins at the same bookmaker are two choices, not one: the account is the
 * unit everywhere else in the app, and a slip belongs to a login.
 */
const openAccounts = (bets: readonly Bet[], nameFor: (key: string) => string): OpenAccount[] => {
  const byKey = new Map<string, OpenAccount>();
  for (const bet of bets) {
    const key = accountKey(bet);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      key,
      bookmaker: bet.bookmaker,
      label: nameFor(key) || findAccount(bet.bookmaker)?.name || bet.bookmaker,
    });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
};

/** The mark is the name at every other place in the app, so a row of them
 *  stays one line however many sites are set up. */
const OpenAtBook = ({
  bookmaker,
  host,
  url,
}: {
  bookmaker: Bookmaker;
  host: string;
  url: string;
}): JSX.Element => (
  <a
    href={url}
    target="_blank"
    rel="noreferrer"
    title={`Open ${host}`}
    className="opacity-60 transition-opacity hover:opacity-100"
  >
    <AccountIcon bookmaker={bookmaker} className="h-7 w-7" />
  </a>
);

/**
 * Roughly how tall a card stands, counted in lines of text: the two the frame
 * and the figures take, one per fixture, and the picks and the placed-on line
 * once it is open. Rough is the point - it is only ever compared with another
 * card's, and measuring the real thing would mean laying the wall out twice.
 */
const cardLines = (bet: Bet, open: boolean): number => {
  const fixtures = new Set(bet.legs.map((leg) => leg.eventId ?? leg.event ?? '—')).size;
  return 2 + Math.max(fixtures, 1) + (open ? bet.legs.length + 1 : 0);
};

/** A slip with the state it is laid out in, which decides how tall it stands. */
interface DealtCard {
  bet: Bet;
  open: boolean;
}

/**
 * The cards dealt across the columns, each going to whichever column is
 * shortest so far. Straight round-robin left one column carrying every long
 * slip and the last one ending halfway up the page.
 *
 * Order still reads across the top: every column is empty to begin with and a
 * tie goes to the leftmost, so the first cards fill the first row in turn.
 */
const dealColumns = (dealt: readonly DealtCard[], columns: number): DealtCard[][] => {
  const wall = Array.from({ length: Math.max(columns, 1) }, () => ({
    height: 0,
    cards: [] as DealtCard[],
  }));
  for (const card of dealt) {
    // A tie keeps the column it started on, which is the leftmost one.
    const shortest = wall.reduce((low, column) => (column.height < low.height ? column : low));
    shortest.cards.push(card);
    shortest.height += cardLines(card.bet, card.open);
  }
  return wall.map((column) => column.cards);
};

/** What the wall is ordered by: when it plays, or what it is worth. */
type SortKey = 'time' | 'stake' | 'win';

const SORT_VALUE: Record<Exclude<SortKey, 'time'>, (bet: Bet) => number> = {
  stake: (bet) => bet.stake,
  win: (bet) => bet.currentPotentialReturn ?? bet.potentialReturn,
};

/** The count rides with the label, so the two halves are comparable at a glance. */
const tabLabel = (label: string, count: number): JSX.Element => (
  <span className="flex items-center gap-1.5">
    {label}
    <span className="tabular-nums opacity-70">{count}</span>
  </span>
);

/**
 * Every open slip at once, which the drawer can only show a column of.
 *
 * Nothing here is cut by the period picker, and the picker is hidden above it:
 * an open bet has not happened yet, so there is no window it could fall outside
 * of. What stands in its place is the same live/open split the drawer uses.
 */
export const OpenBetsPage = (): JSX.Element => {
  const { live, waiting, scores, refreshedAt, now, siteLinkFor } = useOpenBets(true);
  const { currency, activeBookmakers } = useDashboard();
  const { nameFor } = useAccountNames();
  const [params, setParams] = useSearchParams();
  // null = follow the data: land on Live whenever something is in play, exactly
  // as the drawer does. An explicit click pins the choice.
  const [tabPicked, setTabPicked] = useState<'live' | 'open' | null>(null);
  // Kickoff order is what the hook hands over, so it is also the default: the
  // slip about to be decided reads first. A second click on the same key flips it.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'time',
    dir: 'asc',
  });
  const [query, setQuery] = useState('');
  // What the wall stands as until a card is clicked: shut, so a page of ten
  // slips can be read at once, with the button for when they all want opening.
  const [allOpen, setAllOpen] = useState(false);
  const slips = useOpenSlips();
  const columns = useColumnCount();
  const needle = query.trim().toLowerCase();

  const accounts = openAccounts([...live, ...waiting], nameFor);
  // A login whose last slip has just settled is no longer a filter, only an
  // empty page - so the choice falls back to all rather than to nothing.
  const asked = params.get('book');
  const picked = accounts.some((account) => account.key === asked) ? asked : null;
  const mine = (bets: readonly Bet[]): Bet[] =>
    bets.filter(
      (bet) =>
        (picked === null || accountKey(bet) === picked) &&
        (needle === '' || betSearchText(bet).includes(needle)),
    );

  const shownLive = mine(live);
  const shownWaiting = mine(waiting);
  const shown = [...shownLive, ...shownWaiting];

  const tab = tabPicked ?? (shownLive.length > 0 ? 'live' : 'open');
  const picks = tab === 'live' ? shownLive : shownWaiting;
  // Money reads largest first, time reads soonest first - each key's own answer
  // to "what do I want at the top", so the first click never needs a second.
  const { key: sortKey, dir: sortDir } = sort;
  const cards =
    sortKey === 'time'
      ? sortDir === 'asc'
        ? picks
        : [...picks].reverse()
      : [...picks].sort((a, b) => {
          const delta = SORT_VALUE[sortKey](a) - SORT_VALUE[sortKey](b);
          return sortDir === 'asc' ? delta : -delta;
        });

  // The button says what a card stands as until it is clicked; a click on the
  // card itself overrides that one card and nothing else. Both are settled here
  // rather than inside the cards, because the packing below needs the answer.
  const dealt: DealtCard[] = cards.map((bet) => ({
    bet,
    open: slips.isOpen(bet.betId, allOpen),
  }));

  // Nothing open at all is still this page, not another one: the toolbar keeps
  // its shape so the two counts can be read at zero as well as at ten. What has
  // nothing to act on - the filters and the totals - stays out until it has.
  const nothing = accounts.length === 0;

  const accountOptions: SegmentedOption<string>[] = [
    { value: 'all', label: 'All', title: 'All accounts' },
    ...accounts.map((account) => ({
      value: account.key,
      label: (
        <AccountIcon
          bookmaker={account.bookmaker}
          className="h-3 w-3 rounded-[2px] p-0 text-[8px]"
        />
      ),
      title: account.label,
    })),
  ];

  const sortOption = (key: SortKey, text: string, title: string): SegmentedOption<SortKey> => ({
    value: key,
    title,
    label: (
      <span className="flex items-center gap-1">
        {text}
        {sort.key === key &&
          (sort.dir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </span>
    ),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The same shape as the period toolbar it replaces: what is being read on
          the left, how it is cut on the right. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {accounts.length >= 2 && (
            <SegmentedToggle
              value={picked ?? 'all'}
              options={accountOptions}
              onChange={(key) => setParams(key === 'all' ? {} : { book: key }, { replace: true })}
            />
          )}
          {/* Opposite the controls that cut the wall, not among them: the totals
              are what is being read, and they answer to every filter left of here. */}
          {!nothing && <SlipTotals bets={shown} currency={currency} />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!nothing && (
            <>
              <SearchBox value={query} onChange={setQuery} placeholder="Search team, pick…" />
              {/* Opens every card at once, and shuts them all again - including
                  the ones opened by hand, which is what makes it a way back.
                  Sits with the sort because both answer the same question:
                  what the wall of cards should show. */}
              <button
                type="button"
                onClick={() => {
                  setAllOpen(!allOpen);
                  slips.reset();
                }}
                aria-pressed={allOpen}
                title={allOpen ? 'Shut every slip' : 'Open every slip'}
                aria-label={allOpen ? 'Shut every slip' : 'Open every slip'}
                className="flex h-[23px] w-7 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground transition-colors hover:text-foreground"
              >
                {allOpen ? <ChevronsDownUp size={12} /> : <ChevronsUpDown size={12} />}
              </button>
              <SegmentedToggle
                value={sort.key}
                options={[
                  sortOption('time', 'Time', 'Kickoff order'),
                  sortOption('stake', 'Stake', 'What is at risk'),
                  sortOption('win', 'To win', 'What it pays if it lands'),
                ]}
                onChange={(key) =>
                  setSort((current) =>
                    current.key === key
                      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                      : { key, dir: key === 'time' ? 'asc' : 'desc' },
                  )
                }
              />
            </>
          )}
          <SegmentedToggle
            value={tab}
            options={[
              {
                value: 'live',
                label: tabLabel('Live', shownLive.length),
                title: 'Slips with a match running',
              },
              {
                value: 'open',
                label: tabLabel('Open', shownWaiting.length),
                title: 'Slips whose first match has not started',
              },
            ]}
            onChange={setTabPicked}
          />
        </div>
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto pr-1">
        {nothing ? (
          // No border to draw when there is nothing inside it: the message sits
          // in the middle of the empty room instead of in a box at the top of it.
          <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <Ticket className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No open bets</p>
            <p className="text-xs text-muted-foreground">
              A slip appears here the moment one is placed and stays until it settles.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
              {activeBookmakers.flatMap((bookmaker) => {
                const site = siteLinkFor(bookmaker);
                return site === null
                  ? []
                  : [<OpenAtBook key={bookmaker} bookmaker={bookmaker} {...site} />];
              })}
            </div>
          </div>
        ) : cards.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {needle !== ''
              ? 'Nothing open matches that.'
              : tab === 'live'
                ? 'A slip moves here as soon as one of its matches kicks off.'
                : 'Everything open is already running.'}
          </p>
        ) : (
          // Columns rather than a grid: a card opens in its own width, under its
          // own title, and only the cards beneath it move down. A grid would
          // have held every card in its row to the height of the opened one and
          // left the rest of that row empty.
          //
          // Dealt out here rather than left to CSS `columns`, which fills one
          // column before starting the next: the sort would then read downwards
          // while the toolbar that set it reads across.
          <div className="flex items-start gap-2">
            {dealColumns(dealt, columns).map((column, at) => (
              <div key={at} className="flex min-w-0 flex-1 flex-col gap-2">
                {column.map(({ bet, open }) => (
                  <ActiveSlipCard
                    key={bet.betId}
                    compact
                    expanded={open}
                    onToggle={() => {
                      slips.toggle(bet.betId, allOpen);
                    }}
                    bet={bet}
                    scores={scores}
                    now={now}
                    refreshedAt={refreshedAt}
                    siteUrl={siteLinkFor(bet.bookmaker)?.url ?? null}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
