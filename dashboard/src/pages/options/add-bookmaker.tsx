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
 * The project, its packages, and the folder the recording goes in.
 *
 * One command to a line, and no `&&`: Windows PowerShell rejects that as a parse
 * error before it runs a thing. `npx` ships with Node and fetches pnpm for the
 * one command, so nothing has to be installed first and nothing depends on a
 * PATH the open terminal has not picked up yet.
 */
const CLONE = `git clone ${REPO}.git
cd BETtracker
npx -y pnpm install`;

/** The same thing for anyone without git: a folder, unzipped, then one command. */
const ZIP = `${REPO}/archive/refs/heads/main.zip`;

/** What to paste into a coding tool. The address is the only part to change. */
const PROMPT = `Add the bookmaker https://www.yourbookmaker.com to BETtracker.

Read AGENTS.md in this project and follow it. My recording is in har/. Ask me for whatever you cannot get yourself.`;

/** What proves the site is in the build the browser will load, not only on disk. */
const CHECK = `npx -y pnpm test
npx -y pnpm build`;

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
  onReopen,
  onDone,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  open: boolean;
  onReopen: () => void;
  onDone: () => void;
  children: ReactNode;
}): JSX.Element => (
  <section
    className={cn(
      'rounded-xl border bg-card transition-colors',
      done ? 'border-profit/40' : 'border-border',
    )}
  >
    <div className="flex w-full items-center gap-2.5 px-3.5 py-2">
      <button
        type="button"
        onClick={onReopen}
        disabled={!done}
        title={done ? 'Open it again' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
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
      </button>
      {/* Its own button, not the whole row: a step is finished by saying so,
          and a row that ticks itself when read is a step nobody did. */}
      {open && (
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-profit/50 hover:text-foreground"
        >
          Mark done
        </button>
      )}
      {done && <span className="shrink-0 text-[11px] text-muted-foreground">Done</span>}
    </div>
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

/** Something to paste elsewhere, with the copy in its own corner. */
const Code = ({ text }: { text: string }): JSX.Element => (
  <div className="relative mt-2">
    <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 pr-10 text-xs leading-snug text-foreground">
      {text}
    </pre>
    <div className="absolute right-1 top-1">
      <CopyButton text={text} />
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
  /**
   * How far the reader says they have got, for this sitting only. Deliberately
   * not stored: a tick on a step nothing can verify is a claim, and a claim
   * that outlives the tab it was made in reads later as a fact.
   */
  const [said, setSaid] = useState(0);
  /** Set when they start on a second site, which the first one's ticks would hide. */
  const [again, setAgain] = useState(false);

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

  const reports = added.map((meta) => {
    const checks = checksFor(meta.id, all);
    return { meta, checks, score: scoreOf(checks) };
  });

  /**
   * What the page can see for itself, rather than take the reader's word for.
   *
   * A site is in `CATALOG` only if a folder was written, registered, built and
   * loaded — which is every step up to the browser in one fact. Whether its
   * figures then arrived is the report's own answer. Ticks a reader sets by
   * hand only ever cover the steps before that, and they never disagree with
   * this: what the build contains is not a matter of opinion.
   */
  const seen =
    reports.length === 0
      ? 0
      : reports.every((report) => report.score.failed === 0 && report.score.passed > 0)
        ? 6
        : 5;
  // Starting on a second site means going back to the top: what the first one
  // proved is still true, and says nothing about this one.
  const at = again ? said : Math.max(said, seen);

  const step = (
    n: number,
  ): { done: boolean; open: boolean; onReopen: () => void; onDone: () => void } => ({
    done: n <= at,
    open: n === at + 1,
    onReopen: () => setSaid(n - 1),
    onDone: () => setSaid(n),
  });

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
          <Step n={1} title="Get the project" {...step(1)}>
            <p className="text-xs">
              Paste all three into a terminal — they run one after another, and the last one waits a
              minute. It also makes the <Key>har/</Key> folder, which is where the next step saves
              to.
            </p>
            <Code text={CLONE} />
            <p className="mt-2 text-xs">
              No git?{' '}
              <a
                href={ZIP}
                className="text-primary underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer noopener"
              >
                Download it as a zip
              </a>{' '}
              — unzip it, open that folder in a terminal, and run the last line only. Either way it
              needs{' '}
              <a
                href="https://nodejs.org"
                className="text-primary underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer noopener"
              >
                Node
              </a>
              , which brings <Key>npx</Key> with it.
            </p>
          </Step>

          <Step n={2} title="Record your account at the bookmaker" {...step(2)}>
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
                <>
                  Save it into the project&apos;s <Key>har/</Key> folder.
                </>,
              ]}
            />
            <p className="mt-2 flex items-start gap-1.5 text-xs">
              <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0 text-pending" />
              That file holds your live session. Keep it on your machine; the tool strips it.
            </p>
          </Step>

          <Step n={3} title="Paste this into a coding tool" {...step(3)}>
            <p className="text-xs">
              Claude Code, Cursor or similar, opened in that folder. It strips the recording, writes
              the site into <Key>extension/src/bookmakers/</Key> and registers it. Answer its
              questions as they come.
            </p>
            <Code text={PROMPT} />
          </Step>

          <Step n={4} title="Run the tests and the build" {...step(4)}>
            <p className="text-xs">
              In the project folder, one line then the other. The tests read the new site&apos;s own
              recording back through it; the build refuses outright if the folder was not
              registered, and copies everything into <Key>extension/dist</Key> — the folder the
              browser loads.
            </p>
            <Code text={CHECK} />
            <p className="mt-2 text-xs">
              Red? Give the tool the output as it stands. It is written for it. Only build once the
              tests are green — a build off a broken site loads a broken site.
            </p>
          </Step>

          <Step n={5} title="Load the build" {...step(5)}>
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

          <Step n={6} title="Check that everything arrived" {...step(6)}>
            <p className="text-xs">
              Come back to this page and let it sync. The new site is listed below, one line per
              thing it has to have proved, and this step ticks itself when none of them is wrong:
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

      {seen > 0 && canAdd && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>
            {reports.map((report) => report.meta.name).join(', ')}{' '}
            {reports.length === 1 ? 'is' : 'are'} in this build, so the steps up to loading{' '}
            {reports.length === 1 ? 'it' : 'them'} are ticked for you — a folder reaches the browser
            only by passing all of them.
          </span>
          <button
            type="button"
            onClick={() => {
              setAgain(!again);
              setSaid(0);
            }}
            className="text-primary underline-offset-2 hover:underline"
          >
            {again ? 'Hide the steps' : 'Add another bookmaker'}
          </button>
        </div>
      )}

      {reports.map((report) => (
        <SiteReport
          key={report.meta.id}
          id={report.meta.id}
          name={report.meta.name}
          checks={report.checks}
        />
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
