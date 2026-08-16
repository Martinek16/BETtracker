import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check as CheckMark, ChevronLeft, CircleDashed, X } from 'lucide-react';
import { parseAccountKey } from '@betanal/shared';
import { CATALOG } from '@bookmakers/catalog';
import { isReleased } from '@bookmakers/released';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/context/dashboard-context';
import { useOpenBetsSeen, useStoredRecords, useSyncMetaByAccount } from '@/data/accounts';
import { cn } from '@/lib/utils';
import { Section } from '@/pages/options/parts';
import { checksFor, scoreOf, type Check } from '@/pages/options/readiness';

const REPO = 'https://github.com/Martinek16/BETtracker';

/** What to paste into a coding tool. The address is the only part to change. */
const PROMPT = `Add the bookmaker https://www.yourbookmaker.com to BETtracker.

The project is ${REPO} — clone it,
read AGENTS.md, and follow it.`;

const MARK = {
  true: { icon: CheckMark, tone: 'text-profit' },
  false: { icon: X, tone: 'text-loss' },
  null: { icon: CircleDashed, tone: 'text-muted-foreground' },
} as const;

const CheckRow = ({ check }: { check: Check }): JSX.Element => {
  const { icon: Icon, tone } = MARK[String(check.state) as keyof typeof MARK];
  return (
    <div className="flex items-start gap-2.5 border-b border-border/60 py-2 text-sm last:border-0">
      <Icon size={14} strokeWidth={2} className={cn('mt-0.5 shrink-0', tone)} />
      <div className="min-w-0">
        <p className="text-foreground">{check.label}</p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
      </div>
    </div>
  );
};

/**
 * One site's report. Shown for every bookmaker in the build, not only the ones
 * somebody added: a released site whose API moved fails these the same way, and
 * this is where that shows up first.
 */
const SiteReport = ({ id, name, checks }: { id: string; name: string; checks: Check[] }): JSX.Element => {
  const { passed, failed, open } = scoreOf(checks);
  return (
    <Section title={name}>
      <div className="flex items-center gap-2 border-b border-border/60 py-2.5 text-xs">
        <AccountIcon bookmaker={id} className="h-4 w-4" />
        {isReleased(id) ? (
          <span className="text-muted-foreground">Part of a release</span>
        ) : (
          <span className="text-primary">Added to this copy — nobody else has checked it</span>
        )}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {passed} proved · {failed} wrong · {open} untested
        </span>
      </div>
      {checks.map((check) => (
        <CheckRow key={check.label} check={check} />
      ))}
    </Section>
  );
};

/**
 * Adding a bookmaker, and finding out whether the one you added works.
 *
 * The second half is the reason this page exists rather than a paragraph in the
 * README. A green test run proves a recording parses; it says nothing about
 * whether the site fills the screens, and the gap between those two is where an
 * evening's work quietly goes wrong.
 */
export const AddBookmakerPage = (): JSX.Element => {
  const [copied, setCopied] = useState(false);
  const records = useStoredRecords();
  const metas = useSyncMetaByAccount();
  const openBetsSeen = useOpenBetsSeen();
  const { accountBalances } = useDashboard();

  const onCopy = (): void => {
    void navigator.clipboard.writeText(PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const all = {
    bets: records.bets,
    transactions: records.transactions,
    bonuses: records.bonuses,
    balances: accountBalances,
    openBetsSeen,
    metas: Object.entries(metas).flatMap(([key, meta]) => {
      const account = parseAccountKey(key);
      return account === null ? [] : [{ account, meta }];
    }),
  };

  return (
    <div className="flex flex-1 flex-col gap-4 pb-1">
      <Link
        to="/options/accounts"
        className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft size={13} strokeWidth={1.75} />
        All accounts
      </Link>
      <Section title="Add a bookmaker">
        <div className="border-b border-border/60 py-3 text-sm text-muted-foreground">
          <p>
            A bookmaker that is missing can be added in an evening. A coding tool writes the
            code from a recording of your own signed-in session; you sign in and say whether
            the figures are right, which is the part nobody else can do.
          </p>
          <p className="mt-2">
            It needs the project itself, not the copy from the store — a site only exists in a
            build that contains it. Paste this into Claude Code, Cursor or similar, with your
            bookmaker&apos;s address in place of the example.
          </p>
        </div>
        <div className="flex items-start gap-3 border-b border-border/60 py-3">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
            {PROMPT}
          </pre>
          <Button variant="outline" size="sm" onClick={onCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-4 py-3 text-xs">
          <a
            href={`${REPO}/blob/main/docs/ADD_A_BOOKMAKER.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Every step in detail
          </a>
          <a
            href={`${REPO}/discussions`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Ask before you spend an evening on it
          </a>
        </div>
      </Section>

      {CATALOG.map((meta) => (
        <SiteReport key={meta.id} id={meta.id} name={meta.name} checks={checksFor(meta.id, all)} />
      ))}

      <Section title="What this page cannot check">
        <div className="py-3 text-sm text-muted-foreground">
          <p>
            Everything above is read off what was stored, so it can only say that a figure
            arrived — never that it is the right one. Those are yours, with the
            bookmaker&apos;s own history page open beside this one:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The bet count matches the site&apos;s own, not one page of it</li>
            <li>Profit and turnover match, to the cent</li>
            <li>The oldest bet you have is here — paging reached the end</li>
            <li>Stake, odds and return match the site&apos;s figures on a bet you remember</li>
            <li>A second sync changes nothing: no duplicates, the same counts</li>
          </ul>
        </div>
      </Section>
    </div>
  );
};
