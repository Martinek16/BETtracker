import { useState, type ReactNode } from 'react';
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

/**
 * Whether adding a bookmaker is something this copy can actually do. A site only
 * exists in a build that contains it, so it takes the project and a rebuild —
 * which the store copy cannot be given. The store writes `update_url` into the
 * manifest it serves; a build loaded from a folder has none, and the dashboard
 * run on its own dev server has no extension at all.
 */
const canAddBookmaker = (): boolean =>
  typeof chrome === 'undefined' ||
  !chrome.runtime?.id ||
  chrome.runtime.getManifest().update_url === undefined;

/** What to paste into a coding tool. The address is the only part to change. */
const PROMPT = `Add the bookmaker https://www.yourbookmaker.com to BETtracker.

The project is ${REPO} — clone it,
read AGENTS.md, and follow it. Ask me for whatever you cannot get
yourself.`;

/** One numbered thing to do, with whatever it takes to do it underneath. */
const Step = ({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}): JSX.Element => (
  <div className="flex gap-3 border-b border-border/60 py-3 last:border-0">
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
      {n}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </div>
  </div>
);

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
 * One site's report, and only for a site added to this copy. A released site has
 * been checked by whoever released it, so its report is a page of ticks nobody
 * came here to read — it belongs to the account it describes, not to the page
 * about adding a new one.
 */
const SiteReport = ({ id, name, checks }: { id: string; name: string; checks: Check[] }): JSX.Element => {
  const { passed, failed, open } = scoreOf(checks);
  return (
    <Section title={name}>
      <div className="flex items-center gap-2 border-b border-border/60 py-2.5 text-xs">
        <AccountIcon bookmaker={id} className="h-4 w-4" />
        <span className="text-primary">Added to this copy — nobody else has checked it</span>
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
 * whether the site fills the screens, and that gap is where the work quietly
 * goes wrong.
 */
export const AddBookmakerPage = (): JSX.Element => {
  const [copied, setCopied] = useState(false);
  const records = useStoredRecords();
  const metas = useSyncMetaByAccount();
  const openBetsSeen = useOpenBetsSeen();
  const { accountBalances } = useDashboard();
  const canAdd = canAddBookmaker();
  const added = CATALOG.filter((meta) => !isReleased(meta.id));

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
      <Section title={canAdd ? 'Add a bookmaker' : 'Adding a bookmaker needs the project'}>
        {canAdd ? (
          <>
            <p className="border-b border-border/60 py-3 text-sm text-muted-foreground">
              A coding tool writes the site. Four things are yours, because nobody else can sign
              in as you.
            </p>
            <Step n={1} title="Paste this into a coding tool">
              <p>Claude Code, Cursor or similar. It clones the project and sets it up.</p>
              <div className="mt-2 flex items-start gap-3">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
                  {PROMPT}
                </pre>
                <Button variant="outline" size="sm" onClick={onCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </Step>
            <Step n={2} title="Record your account at the bookmaker">
              <p>
                Sign in, press <b className="font-medium text-foreground">F12</b> →{' '}
                <b className="font-medium text-foreground">Network</b>, tick{' '}
                <b className="font-medium text-foreground">Preserve log</b>. Then click through
                your bet history — several pages back — your open bets, your balance, deposits
                and withdrawals, and bonuses. Right-click the list →{' '}
                <b className="font-medium text-foreground">Save all as HAR with content</b>.
              </p>
              <p className="mt-1.5 text-xs">
                That file holds your live session. Keep it on your machine; the tool strips it
                before anything is published.
              </p>
            </Step>
            <Step n={3} title="Tell the tool where you saved it">
              <p>
                From here it reads the recording, writes the site, runs the tests and builds. Answer
                its questions about your bookmaker when it asks.
              </p>
            </Step>
            <Step n={4} title="Load the build and check the figures">
              <p>
                <b className="font-medium text-foreground">edge://extensions</b> (or{' '}
                <b className="font-medium text-foreground">chrome://extensions</b>) → Developer
                mode → Load unpacked →{' '}
                <b className="font-medium text-foreground">extension/dist</b>. Sign in at the
                bookmaker, let it sync, then compare the totals with the bookmaker&apos;s own
                history page. If you also have the copy from the store, switch it off while you
                do — two copies read the same account into two separate histories.
              </p>
              <p className="mt-1.5 text-xs">
                Something wrong? Tell the tool what you see. It reports back here, per site.
              </p>
            </Step>
          </>
        ) : (
          <p className="border-b border-border/60 py-3 text-sm text-muted-foreground">
            This copy came from the store, so it reads the bookmakers it was built with and no
            others — a site only exists in a build that contains it. Adding one takes the project
            itself: clone it, load the build it produces, and a coding tool writes the site from a
            recording of your own signed-in session.
          </p>
        )}
        <div className="flex flex-wrap gap-4 py-3 text-xs">
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            The project
          </a>
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
            Ask before you start
          </a>
        </div>
      </Section>

      {added.map((meta) => (
        <SiteReport key={meta.id} id={meta.id} name={meta.name} checks={checksFor(meta.id, all)} />
      ))}

      {added.length > 0 && (
        <Section title="What this page cannot check">
          <div className="py-3 text-sm text-muted-foreground">
            <p>
              The report above is read off what was stored, so it can only say that a figure
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
      )}
    </div>
  );
};
