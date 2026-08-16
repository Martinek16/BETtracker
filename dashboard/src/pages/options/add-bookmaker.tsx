import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Check as CheckMark,
  ChevronLeft,
  CircleDashed,
  Copy,
  Download,
  ShieldAlert,
  X,
} from 'lucide-react';
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

/**
 * One numbered thing to do, as its own card. `aside` sits on the header line, on
 * the right, which is where the one action a card carries belongs.
 */
const Step = ({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}): JSX.Element => (
  <section className="rounded-xl border border-border bg-card">
    <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-foreground">
        {n}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</p>
      {aside}
    </div>
    <div className="px-4 py-3 text-sm text-muted-foreground">{children}</div>
  </section>
);

/** What the reader types or clicks, set apart from the prose around it. */
const Key = ({ children }: { children: ReactNode }): JSX.Element => (
  <span className="rounded border border-border/80 bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-foreground">
    {children}
  </span>
);

/** GitHub's copy affordance: an icon in the corner, ticked for a moment after. */
const CopyButton = ({ text }: { text: string }): JSX.Element => {
  const [copied, setCopied] = useState(false);

  const onCopy = (): void => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onCopy}
      title={copied ? 'Copied' : 'Copy'}
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? (
        <CheckMark size={14} strokeWidth={2} className="text-profit" />
      ) : (
        <Copy size={14} strokeWidth={1.75} />
      )}
    </Button>
  );
};

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
  const records = useStoredRecords();
  const metas = useSyncMetaByAccount();
  const openBetsSeen = useOpenBetsSeen();
  const { accountBalances } = useDashboard();
  const canAdd = canAddBookmaker();
  const added = CATALOG.filter((meta) => !isReleased(meta.id));

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
      <div className="flex items-baseline gap-3 px-1">
        <h2 className="text-sm font-semibold text-foreground">
          {canAdd ? 'Add a bookmaker' : 'Adding a bookmaker needs the project'}
        </h2>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {canAdd
            ? 'A coding tool writes the site. These four are yours.'
            : 'A site only exists in a build that contains it.'}
        </p>
      </div>

      {canAdd ? (
        <>
          <Step n={1} title="Paste this into a coding tool" aside={<CopyButton text={PROMPT} />}>
            <p>Claude Code, Cursor or similar. It clones the project and sets it up.</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {PROMPT}
            </pre>
          </Step>

          <Step n={2} title="Record your account at the bookmaker">
            <ol className="list-decimal space-y-1.5 pl-4 marker:text-muted-foreground/70">
              <li>Sign in at the bookmaker.</li>
              <li>
                Press <Key>F12</Key>, open <Key>Network</Key>, tick <Key>Preserve log</Key>.
              </li>
              <li>
                Click through: bet history — several pages back — open bets, balance, deposits and
                withdrawals, bonuses.
              </li>
              <li className="flex flex-wrap items-center gap-1.5">
                Right-click the list, then
                <Key>
                  <Download size={11} strokeWidth={2} className="mr-1 inline align-[-1px]" />
                  Save all as HAR with content
                </Key>
              </li>
            </ol>
            <p className="mt-2.5 flex items-start gap-1.5 text-xs">
              <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0 text-pending" />
              That file holds your live session. Keep it on your machine — the tool strips it
              before any of it is published.
            </p>
          </Step>

          <Step n={3} title="Tell the tool where you saved it">
            <p>
              From here it reads the recording, writes the site, runs the tests and builds. Answer
              its questions about your bookmaker as they come.
            </p>
          </Step>

          <Step n={4} title="Load the build and check the figures">
            <ol className="list-decimal space-y-1.5 pl-4 marker:text-muted-foreground/70">
              <li>
                Open <Key>edge://extensions</Key> (or <Key>chrome://extensions</Key>) and turn on
                Developer mode.
              </li>
              <li>
                <Key>Load unpacked</Key> → the project&apos;s <Key>extension/dist</Key> folder.
              </li>
              <li>
                Sign in at the bookmaker, let it sync, then compare the totals with the
                bookmaker&apos;s own history page.
              </li>
            </ol>
            <p className="mt-2.5 text-xs">
              Have the copy from the store too? Switch it off first — two copies read the same
              account into two separate histories. Whatever looks wrong, tell the tool; the report
              for the new site appears below.
            </p>
          </Step>
        </>
      ) : (
        <section className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          This copy came from the store, so it reads the bookmakers it was built with and no
          others. Adding one takes the project itself: clone it, load the build it produces, and a
          coding tool writes the site from a recording of your own signed-in session.
        </section>
      )}

      <div className="flex flex-wrap gap-4 px-1 text-xs">
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
