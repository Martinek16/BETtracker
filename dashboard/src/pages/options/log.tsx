import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Coins,
  LayoutDashboard,
  RefreshCw,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { clearLog, getLog, type Bookmaker, type LogEntry } from '@betanal/shared';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { ChartEmpty } from '@/components/charts/chart-empty';
import {
  DashboardCard,
  DashboardCardHeading,
} from '@/components/dashboard/dashboard-card';
import { Button } from '@/components/ui/button';
import { findAccount } from '@/data/accounts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn, formatDate, formatTime } from '@/lib/utils';

const TONE: Record<LogEntry['level'], string> = {
  info: 'text-muted-foreground',
  warn: 'text-pending',
  error: 'text-loss',
};

// Only what went wrong is marked: a tick on every ordinary line is a column of
// ticks, and a column of ticks is not a signal.
const LEVEL_ICON: Record<LogEntry['level'], LucideIcon | null> = {
  info: null,
  warn: AlertTriangle,
  error: CircleAlert,
};

/** Scopes that are not a bookmaker: the app's own parts, named as a user sees them. */
const PARTS: Record<string, { label: string; icon: LucideIcon }> = {
  sync: { label: 'All accounts', icon: RefreshCw },
  rates: { label: 'Currency rates', icon: Coins },
  dashboard: { label: 'This app', icon: LayoutDashboard },
};

/**
 * The lines are written for whoever has to debug the reader; this page is read
 * by whoever just wants to know whether their bets arrived. First match wins,
 * and anything unrecognised is shown as written — a line nobody translated is
 * still better than no line.
 */
const PLAIN: [RegExp, string | ((match: RegExpExecArray) => string)][] = [
  [/^Backfilling( Stake)? history \(page \d+, (\d+) new\)/, (m) => `Older bets · ${m[2]} new`],
  [/^Backfill: reached end of history/, 'Whole history read'],
  [/^Caught up new( Stake)? bets \(page \d+, (\d+) new\)/, (m) => `Bets · ${m[2]} new`],
  [/^(\d+) transactions imported/, (m) => `Deposits & withdrawals · ${m[1]} read`],
  [
    /^bonuses imported: (\d+) grants/,
    // Kept even at nothing: "the site has no bonuses" and "the bonuses were
    // never read" are the same empty page until this line tells them apart.
    (m) => (m[1] === '0' ? 'Bonuses · none on the account' : `Bonuses · ${m[1]} received`),
  ],
  [/^Open bets updated/, 'Running bets updated'],
  [/^Rates updated|^missing \d+ quotes/, 'Currency rates updated'],
  [/^Up to date/, 'Up to date'],
  [/^session captured/, 'Signed in'],
  [/^session went stale/, 'Signed out by the site, signing back in'],
  [/^no session on the page/, 'Not signed in yet'],
  [/^balance not read: no session captured yet/, 'Balance not read — sign in on the site'],
  [/^balance not read: account not identified/, 'Balance not read — account not recognised'],
  [/^balance (read skipped|unreadable)/, 'Balance not read'],
  [/^identity unreadable/, 'Account not recognised'],
  [/^transaction import skipped/, 'Deposits & withdrawals not read'],
  [/^sync failed/, 'Reading from the site failed'],
  [/^skipped unparseable bet/, 'One bet could not be read'],
  [/^(bonus|promo) import failed/, 'Bonuses not read'],
  [/^rate feed unavailable|^the feeds answered with nothing usable/, 'Currency rates unavailable'],
  [/^failed to read (.+?):/, 'Could not load $1:'],
  [/^failed to summarise bets/, 'Could not summarise the bets'],
  [/^open-bets refresh failed/, 'Running bets not refreshed'],
];

/**
 * Lines that report that nothing happened. A sync that found no new records
 * still says so on every step, and a page of "nothing new" is what buries the
 * one line that matters. Only ever applied to `info`: a warning saying zero of
 * something is still a warning.
 */
const NOTHING_HAPPENED = [
  /^0 transactions imported/,
  /^(Caught up new|Backfilling)( Stake)? (bets|history) \(page \d+, 0 new\)/,
];

/** The line as the user should read it, or null when it is not worth a row. */
const plainMessage = (entry: LogEntry): string | null => {
  if (entry.level === 'info' && NOTHING_HAPPENED.some((p) => p.test(entry.message))) return null;
  for (const [pattern, plain] of PLAIN) {
    const match = pattern.exec(entry.message);
    if (match === null) continue;
    // A string rule rewrites only the part it matched, so the site's own detail
    // after it ("sync failed: 403") survives; a function rule replaces the line.
    return typeof plain === 'string' ? entry.message.replace(pattern, plain) : plain(match);
  }
  return entry.message;
};

interface Line extends LogEntry {
  text: string;
  /** How many identical lines in a row this stands for. */
  times: number;
}

/** How far apart two identical lines still count as the same event. */
const SAME_EVENT_MS = 15 * 60 * 1000;

/**
 * A sync writes one line per page, and several runs can overlap: the same
 * sentence from the same account comes back interleaved with other accounts'.
 * Identical wording within a quarter of an hour is folded into the newest line
 * with a count, whether or not the repeats were next to each other.
 *
 * Entries arrive newest first, so the line that is kept is the latest one.
 */
const collapse = (entries: LogEntry[]): Line[] => {
  const lines: Line[] = [];
  const recent = new Map<string, { line: Line; at: number }>();
  for (const entry of entries) {
    const text = plainMessage(entry);
    if (text === null) continue;
    const at = Date.parse(entry.at);
    const key = `${entry.scope}|${text}`;
    const previous = recent.get(key);
    if (previous !== undefined && previous.at - at <= SAME_EVENT_MS) {
      previous.line.times += 1;
      previous.at = at;
      continue;
    }
    const line: Line = { ...entry, text, times: 1 };
    recent.set(key, { line, at });
    lines.push(line);
  }
  return lines;
};

/** Which account or which part of the app the line came from, named and marked. */
const SourceCell = ({ scope }: { scope: string }): JSX.Element => {
  const account = findAccount(scope);
  const part = PARTS[scope];
  const Icon = part?.icon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {account === undefined ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          {Icon === undefined ? null : <Icon size={12} strokeWidth={1.75} />}
        </span>
      ) : (
        <AccountIcon bookmaker={scope as Bookmaker} className="h-5 w-5 text-[10px]" />
      )}
      <span className="truncate font-medium text-foreground">
        {account?.name ?? part?.label ?? scope}
      </span>
    </span>
  );
};

const LevelIcon = ({ level }: { level: LogEntry['level'] }): JSX.Element | null => {
  const Icon = LEVEL_ICON[level];
  return Icon === null ? null : <Icon size={13} strokeWidth={2} className="mt-0.5 shrink-0" />;
};

/**
 * What the extension has been doing. The reading happens in a service worker and
 * inside the bookmaker's own page, neither of which the user can watch, so this
 * is the one place where "it says it synced but nothing appeared" has an answer.
 *
 * Newest first, and re-read on a slow beat so a sync running right now is
 * watchable without reloading the page.
 */
export const LogPage = (): JSX.Element => {
  const [lines, setLines] = useState<Line[]>([]);
  const [copied, setCopied] = useState(false);

  const read = useCallback(() => {
    void getLog().then((list) => setLines(collapse([...list].reverse())));
  }, []);

  useEffect(() => {
    read();
    const timer = setInterval(read, 3000);
    return () => clearInterval(timer);
  }, [read]);

  // The raw line, not the plain rewording: what gets pasted somewhere else is
  // read by whoever is debugging the reader, and that is what they need.
  const onCopy = (): void => {
    const text = lines
      .map(
        (line) =>
          `${formatDate(line.at)} ${formatTime(line.at)}\t${line.scope}\t${line.level}\t${line.message}${line.times > 1 ? ` (${line.times}×)` : ''}`,
      )
      .join('\n');
    void navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <DashboardCard className="flex min-h-0 flex-1 flex-col">
        <DashboardCardHeading
          className="mb-1.5 items-center"
          title={<span className="normal-case">Activity</span>}
          subtitle="What the extension has been doing, newest first."
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={lines.length === 0}
                onClick={onCopy}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={lines.length === 0}
                onClick={() => {
                  void clearLog().then(read);
                }}
              >
                Clear
              </Button>
            </div>
          }
        />
        {lines.length === 0 ? (
          <div className="min-h-0 flex-1">
            <ChartEmpty
              icon={ScrollText}
              title="Nothing recorded yet"
              hint="The extension writes a line here every time it reads from a bookmaker. Connect an account or run a sync to see what it did."
            />
          </div>
        ) : (
          <Table
            /* The page locks selection; the log is the one place a user is meant
               to highlight text and paste it somewhere else. */
            className="table-fixed select-text"
            containerClassName="min-h-0 flex-1"
            cols={
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[60%]" />
              </colgroup>
            }
            head={
              <TableHeader className="bg-card">
                <TableRow>
                  <TableHead className="text-center">When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>What happened</TableHead>
                </TableRow>
              </TableHeader>
            }
          >
            <TableBody>
              {lines.map((line) => (
                <TableRow key={`${line.at}-${line.text}`}>
                  <TableCell className="whitespace-nowrap text-center text-xs tabular-nums">
                    {formatDate(line.at)}{' '}
                    <span className="text-muted-foreground/90">{formatTime(line.at)}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <SourceCell scope={line.scope} />
                  </TableCell>
                  {/* Title keeps the line as it was written, for when the plain
                      wording is not enough to work out what went wrong. */}
                  <TableCell className="text-xs" title={line.message}>
                    <span className={cn('flex min-w-0 items-start gap-2', TONE[line.level])}>
                      <LevelIcon level={line.level} />
                      <span className="min-w-0 break-words">{line.text}</span>
                      {line.times > 1 ? (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {line.times}×
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DashboardCard>
    </div>
  );
};
