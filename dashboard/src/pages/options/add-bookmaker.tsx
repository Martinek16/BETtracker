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

/**
 * Which steps are behind you. Adding a site spans several sittings and at least
 * one extension reload, so the ticks have to outlive the page. Stored as plain
 * numbers, which cannot be parsed into a throw the way stray JSON can.
 */
const DONE_KEY = 'bettracker.add-bookmaker.done';
const readDone = (): number[] =>
  (localStorage.getItem(DONE_KEY) ?? '').split(',').filter(Boolean).map(Number);

/** What to paste into a coding tool. The address is the only part to change. */
const PROMPT = `Add the bookmaker https://www.yourbookmaker.com to BETtracker.

The project is ${REPO} — clone it, read AGENTS.md, and follow it. Ask me for whatever you cannot get yourself.`;

/**
 * One numbered thing to do, as its own card. Only the step you are on is open:
 * the ones behind you are finished, and the ones ahead read as instructions for
 * a screen you have not reached yet, which is how a step gets skipped.
 */
const Step = ({
  n,
  title,
  done,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element => (
  <section
    className={cn(
      'rounded-xl border bg-card transition-colors',
      done ? 'border-profit/40' : 'border-border',
    )}
  >
    <button
      type="button"
      onClick={onToggle}
      disabled={!done && !open}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left disabled:cursor-default"
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
          done
            ? 'bg-profit text-background'
            : open
              ? 'bg-muted text-foreground'
              : 'bg-muted/40 text-muted-foreground',
        )}
      >
        {done ? <CheckMark size={12} strokeWidth={3} /> : n}
      </span>
      <p
        className={cn(
          'min-w-0 flex-1 truncate text-sm font-medium',
          open ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {title}
      </p>
      {(done || open) && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {done ? 'Done' : 'Mark done'}
        </span>
      )}
    </button>
    {open && (
      <div className="border-t border-border/60 px-3.5 py-2.5 text-muted-foreground">
        {children}
      </div>
    )}
  </section>
);

/** What the reader types or clicks, set apart from the prose around it. */
const Key = ({ children }: { children: ReactNode }): JSX.Element => (
  <span className="inline-flex items-center whitespace-nowrap rounded border border-border/80 bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-foreground">
    {children}
  </span>
);

/** The moves inside one step, one to a line, numbered in the margin. */
const Substeps = ({ items }: { items: ReactNode[] }): JSX.Element => (
  <ol className="space-y-1">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2.5">
        <span className="w-3 shrink-0 text-right text-[11px] leading-5 tabular-nums text-muted-foreground/60">
          {i + 1}
        </span>
        <span className="min-w-0 flex-1 text-xs leading-5 text-foreground/90">{item}</span>
      </li>
    ))}
  </ol>
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
const SiteReport = ({
  id,
  name,
  checks,
}: {
  id: string;
  name: string;
  checks: Check[];
}): JSX.Element => {
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
  const [done, setDone] = useState(readDone);

  const toggle = (n: number): void => {
    const next = done.includes(n) ? done.filter((d) => d !== n) : [...done, n];
    localStorage.setItem(DONE_KEY, next.join(','));
    setDone(next);
  };

  /** The one step still to do. A step ahead of it stays shut: it reads as an
   *  instruction for a screen you have not reached, which is how one gets skipped. */
  const at = [1, 2, 3, 4].find((n) => !done.includes(n));

  const step = (n: number): { done: boolean; open: boolean; onToggle: () => void } => ({
    done: done.includes(n),
    open: n === at,
    onToggle: () => toggle(n),
  });

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
    <div className="flex flex-1 flex-col gap-3 pb-1">
      <div className="flex flex-col gap-1 px-1">
        <Link
          to="/options/accounts"
          className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft size={13} strokeWidth={1.75} />
          All accounts
        </Link>
        <h2 className="text-sm font-semibold text-foreground">
          {canAdd ? 'Add a bookmaker' : 'Adding a bookmaker needs the project'}
        </h2>
        {!canAdd && (
          <p className="text-xs text-muted-foreground">
            A site only exists in a build that contains it.
          </p>
        )}
      </div>

      {canAdd ? (
        <div className="flex flex-col gap-2.5">
          <Step n={1} title="Record your account at the bookmaker" {...step(1)}>
            <Substeps
              items={[
                <>
                  Sign in at the bookmaker, then press <Key>F12</Key>.
                </>,
                <>
                  Open <Key>Network</Key> and tick <Key>Preserve log</Key>.
                </>,
                <>
                  Click through bet history — several pages back — open bets, balance, payments,
                  bonuses.
                </>,
                <>
                  Right-click the list, then{' '}
                  <Key>
                    <Download size={11} strokeWidth={2} className="mr-1" />
                    Save all as HAR with content
                  </Key>
                </>,
              ]}
            />
            <p className="mt-2 flex items-start gap-1.5 text-xs">
              <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0 text-pending" />
              That file holds your live session. Keep it on your machine; the tool strips it.
            </p>
          </Step>

          <Step n={2} title="Paste this into a coding tool" {...step(2)}>
            <p className="text-xs">
              Claude Code, Cursor or similar. It clones the project, finds the recording you just
              saved, strips it, writes the site, tests it and builds. Answer its questions as they
              come.
            </p>
            <div className="relative mt-2">
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 pr-10 text-xs leading-snug text-foreground">
                {PROMPT}
              </pre>
              <div className="absolute right-1 top-1">
                <CopyButton text={PROMPT} />
              </div>
            </div>
          </Step>

          <Step n={3} title="Load the build" {...step(3)}>
            <Substeps
              items={[
                <>
                  Open <Key>edge://extensions</Key> or <Key>chrome://extensions</Key>, and turn on
                  Developer mode.
                </>,
                <>
                  <Key>Load unpacked</Key> → the project&apos;s <Key>extension/dist</Key> folder.
                </>,
                <>Sign in at the bookmaker, say yes when asked, and let it sync.</>,
              ]}
            />
            <p className="mt-2 text-xs">
              Switch the store copy off first — two copies read one account into two histories.
            </p>
          </Step>

          <Step n={4} title="Check that everything arrived" {...step(4)}>
            <p className="text-xs">
              Come back to this page. The new site is listed below, one line per thing it has to
              have proved:
            </p>
            <Substeps
              items={[
                <>Bets read, each naming a sport, a match and a selection.</>,
                <>Won, lost and void all read as what they are; accumulators carry their legs.</>,
                <>Open bets, the balance, money in and out, bonuses.</>,
                <>The account syncs without an error.</>,
              ]}
            />
            <p className="mt-2 text-xs">
              <span className="text-muted-foreground">Untested</span> means your account has never
              had one of those, not that it failed. Send the wrong and untested lines back to the
              tool — that is the whole bug report it needs. Then compare the totals with the
              bookmaker&apos;s own history page: this page can say a figure arrived, never that it
              is right.
            </p>
          </Step>
        </div>
      ) : (
        <section className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          This copy came from the store, so it reads the bookmakers it was built with and no others.
          Adding one takes the project itself: clone it, load the build it produces, and a coding
          tool writes the site from a recording of your own signed-in session.
        </section>
      )}

      {added.map((meta) => (
        <SiteReport key={meta.id} id={meta.id} name={meta.name} checks={checksFor(meta.id, all)} />
      ))}

      {added.length > 0 && (
        <Section title="What this page cannot check">
          <div className="py-3 text-sm text-muted-foreground">
            <p>
              The report above is read off what was stored, so it can only say that a figure arrived
              — never that it is the right one. Those are yours, with the bookmaker&apos;s own
              history page open beside this one:
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

      <div className="mt-auto flex flex-wrap justify-center gap-5 pt-2 text-xs">
        {[
          [REPO, 'The project'],
          [`${REPO}/blob/main/docs/ADD_A_BOOKMAKER.md`, 'Every step in detail'],
          [`${REPO}/discussions`, 'Ask first'],
        ].map(([href, label]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
};
