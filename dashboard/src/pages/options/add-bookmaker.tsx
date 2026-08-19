import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check as CheckMark, CircleDashed, Copy, Download, ShieldAlert, X } from 'lucide-react';
import { parseAccountKey } from '@betanal/shared';
import { CATALOG } from '@bookmakers/catalog';
import { isReleased } from '@bookmakers/released';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/context/dashboard-context';
import {
  useAddingSite,
  useOpenBetsSeen,
  useRecordingState,
  useStoredRecords,
  useSyncMetaByAccount,
  type AddingSite,
} from '@/data/accounts';
import { cn } from '@/lib/utils';
import { Crumbs } from '@/pages/options/parts';
import { checksFor, scoreOf, type Check } from '@/pages/options/readiness';

const REPO = 'https://github.com/Martinek16/BETtracker';

/**
 * Whether adding a bookmaker is something this copy can actually do. A site only
 * exists in a build that contains it, so it takes the project and a rebuild -
 * which the store copy cannot be given. The store writes `update_url` into the
 * manifest it serves; a build loaded from a folder has none, and the dashboard
 * run on its own dev server has no extension at all.
 */
const canAddBookmaker = (): boolean =>
  typeof chrome === 'undefined' ||
  !chrome.runtime?.id ||
  chrome.runtime.getManifest().update_url === undefined;

/**
 * Whether this page is being read from a build loaded out of a folder.
 *
 * If it is, that build is the one the project writes to, and every site after
 * the first is a rebuild of it - the same entry in the browser, refreshed. It is
 * the difference between loading a second extension and reloading this one, and
 * it decides what step 5 asks for.
 */
const isUnpacked = (): boolean =>
  typeof chrome !== 'undefined' &&
  Boolean(chrome.runtime?.id) &&
  chrome.runtime.getManifest().update_url === undefined;

/**
 * The project, its packages, and the folder the recording goes in.
 *
 * One command to a line, and no `&&`: Windows PowerShell rejects that as a parse
 * error before it runs a thing. `npx` ships with Node and fetches pnpm for the
 * one command, so nothing has to be installed first and nothing depends on a
 * PATH the open terminal has not picked up yet.
 *
 * `--depth 1` takes the current state and not the history behind it. A site is
 * added by building the project, so the project is what has to come down; every
 * commit that led to it is not.
 */
const CLONE = `git clone --depth 1 ${REPO}.git
cd BETtracker
npx -y pnpm install`;

/** The same thing for anyone without git: a folder, unzipped, then one command. */
const ZIP = `${REPO}/archive/refs/heads/main.zip`;

/**
 * What to paste into a coding tool. The address is the only part to change.
 *
 * The repository is named as well as the file, because the likeliest way this
 * goes wrong is an assistant opened somewhere other than the project: with only
 * "read AGENTS.md" it finds nothing and starts guessing at an adapter, which is
 * the one failure that reports someone's money wrongly. With the address it can
 * fetch the file, or say plainly that it is in the wrong folder.
 */
const promptFor = (site: AddingSite | null): string =>
  `Add the bookmaker https://${site?.host ?? 'www.yourbookmaker.com'} to BETtracker.

Follow AGENTS.md in this project - ${REPO}/blob/main/AGENTS.md if you cannot see it here, in which case say so before you write anything. My recording is in my Downloads folder - find it yourself and put it where it belongs. Ask me for whatever you cannot get yourself.${
    site === null ? '' : `\n\nStart with: npx -y pnpm new-bookmaker ${site.id} ${site.host}`
  }`;

/** What proves the site is in the build the browser will load, not only on disk. */
const CHECK = `npx -y pnpm test
npx -y pnpm build`;

/**
 * One numbered thing to do, as its own card. Only the step you are on is open:
 * the ones behind you are finished, and the ones ahead read as instructions for
 * a screen you have not reached yet, which is how a step gets skipped.
 */
/**
 * Which site this is all for, asked before the steps rather than inside one.
 *
 * It is not a step: nothing is done here and nothing can be verified. It is the
 * subject the steps are about, and once it is answered every one of them can say
 * the site's own name instead of "the bookmaker" - including the prompt, which
 * stops asking a coding tool to guess what the folder should be called.
 */
const SiteAsked = ({
  site,
  onChoose,
}: {
  site: AddingSite | null;
  onChoose: (host: string) => void;
}): JSX.Element => {
  const [typed, setTyped] = useState('');
  const shell = 'flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-1.5';

  if (site !== null)
    return (
      <div className={shell}>
        <span className="min-w-0 flex-1 truncate text-xs">
          Adding <span className="font-medium text-foreground">{site.host}</span>
          <span className="ml-1.5 text-muted-foreground">as {site.id}</span>
        </span>
        <button
          type="button"
          onClick={() => onChoose('')}
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Change
        </button>
      </div>
    );

  return (
    <form
      className={shell}
      onSubmit={(event) => {
        event.preventDefault();
        onChoose(typed);
      }}
    >
      <label htmlFor="adding-site" className="shrink-0 text-xs text-muted-foreground">
        Which site?
      </label>
      <input
        id="adding-site"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder="www.yourbookmaker.com"
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={typed.trim() === ''}>
        Set
      </Button>
    </form>
  );
};

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
}): JSX.Element => {
  const here = useRef<HTMLElement>(null);

  // The step you are on is brought to the top of the list, on opening the page
  // as well as on ticking one off: with five of them ticked, the only one left
  // to do would otherwise start below the fold of a list that never scrolled.
  useEffect(() => {
    if (open) here.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [open]);

  return (
    <section
      ref={here}
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
};

/** What the reader types or clicks, set apart from the prose around it. */
const Key = ({ children }: { children: ReactNode }): JSX.Element => (
  <span className="inline-flex items-center whitespace-nowrap rounded-[3px] border border-border/70 bg-muted/40 px-1 py-px font-medium leading-none text-foreground">
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
 * came here to read - it belongs to the account it describes, not to the page
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
    <section className="rounded-xl border border-border bg-card px-4">
      <div className="flex items-center gap-2 border-b border-border/60 py-2.5 text-xs">
        <AccountIcon bookmaker={id} className="h-4 w-4" />
        <span className="font-medium text-foreground">{name}</span>
        <span className="text-primary">- added here, nobody else has checked it</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {passed} proved · {failed} wrong · {open} untested
        </span>
      </div>
      {checks.map((check) => (
        <CheckRow key={check.label} check={check} />
      ))}
    </section>
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
  const recording = useRecordingState();
  const [site, chooseSite] = useAddingSite();
  const { accountBalances } = useDashboard();
  const canAdd = canAddBookmaker();
  const unpacked = isUnpacked();
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
   * loaded - which is every step up to the browser in one fact. Whether its
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
  /**
   * A saved recording is the one step before the build that the app can see for
   * itself, and it is the step people most often think they have not finished.
   *
   * A recording of some other site does not count. Recording the wrong tab is
   * easy to do and reads exactly like success until a coding tool opens the file.
   */
  // By id rather than by host: a bookmaker is browsed on whichever mirror the
  // browser was sent to, and `m.e-stave.com` is still e-stave.
  const rightSite = site === null || recording.saved === null || recording.saved.includes(site.id);
  const recorded = recording.saved !== null && rightSite ? 2 : 0;
  // Starting on a second site means going back to the top: what the first one
  // proved is still true, and says nothing about this one.
  const at = again ? said : Math.max(said, seen, recorded);

  const step = (
    n: number,
  ): { done: boolean; open: boolean; onReopen: () => void; onDone: () => void } => ({
    done: n <= at,
    open: n === at + 1,
    onReopen: () => setSaid(n - 1),
    onDone: () => setSaid(n),
  });

  return (
    // The steps are the only part that scrolls: the way back out and the links
    // at the foot are where they were left, however far down the steps you are.
    <div className="flex h-full min-h-0 flex-col gap-3 pb-1">
      <Crumbs
        to="/options/accounts"
        parent="Accounts"
        title={canAdd ? 'Add a bookmaker' : 'Adding a bookmaker needs the project'}
      >
        {/* Beside the title rather than under the steps: it explains why the
            first ticks are already there, which is read before them, not after. */}
        {seen > 0 && canAdd && (
          <div className="ml-auto flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span>
              {reports.map((report) => report.meta.name).join(', ')}{' '}
              {reports.length === 1 ? 'is' : 'are'} in this build, so those steps are ticked.
            </span>
            <button
              type="button"
              onClick={() => {
                setAgain(!again);
                setSaid(0);
              }}
              className="text-primary underline-offset-2 hover:underline"
            >
              {again ? 'Hide the steps' : 'Add another'}
            </button>
          </div>
        )}
      </Crumbs>

      {/* Above the scroll, not in it: the site being added is the subject of every
          step, so it stays on screen however far down the steps you are. */}
      {canAdd && (
        <div className="mb-1 flex flex-col gap-2.5">
          <SiteAsked site={site} onChoose={chooseSite} />

          {recording.running !== null && (
            <p className="flex items-center gap-1.5 px-1 text-xs text-pending">
              <CircleDashed size={13} strokeWidth={1.75} className="shrink-0" />
              Recording {recording.running} now. Browse your history, then save from the popup.
            </p>
          )}
          {recording.running === null && recording.saved !== null && rightSite && (
            <p className="flex items-center gap-1.5 px-1 text-xs text-profit">
              <CheckMark size={13} strokeWidth={2} className="shrink-0" />
              Recorded {recording.saved}. The file is in your downloads; step 3 goes looking for it
              there.
            </p>
          )}
          {recording.running === null && recording.saved !== null && !rightSite && (
            <p className="flex items-start gap-1.5 px-1 text-xs text-pending">
              <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0" />
              The last recording was of {recording.saved}, not {site?.host}. Record the site you are
              adding, or change which site that is above.
            </p>
          )}
        </div>
      )}

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto pr-1">
        {canAdd ? (
          <div className="flex flex-col gap-2.5">
            <Step n={1} title="Get the project" {...step(1)}>
              <p className="text-xs">
                Paste all three into a terminal - they run one after another, and the last one waits
                a minute.
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
                - unzip it, open that folder in a terminal, and run the last line only. Either way
                it needs{' '}
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
              {site === null && (
                <p className="mb-2 flex items-start gap-1.5 text-xs text-pending">
                  <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0" />
                  Give the address above first. The popup offers to record that one site and no
                  other.
                </p>
              )}
              <Substeps
                items={[
                  <>
                    Sign in at the bookmaker, then click the BETtracker icon in the toolbar and
                    press <Key>Record this site</Key>. Allow the access it asks for - it is for that
                    one site, and it is given back when you save.
                  </>,
                  <>
                    Now open every page the app has to read, and wait for each to finish loading.
                    Every site names them differently; look for:
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      <li>
                        <span className="text-foreground/90">Bet history</span> - settled bets, and
                        page back until the oldest one you have
                      </li>
                      <li>
                        <span className="text-foreground/90">Open bets</span> - unsettled, pending,
                        in play
                      </li>
                      <li>
                        <span className="text-foreground/90">Balance</span> - the wallet or account
                        page, each currency you hold
                      </li>
                      <li>
                        <span className="text-foreground/90">Money in and out</span> - deposits,
                        withdrawals, transactions, payments
                      </li>
                      <li>
                        <span className="text-foreground/90">Bonuses</span> - free bets, promotions,
                        rakeback, whatever is waiting to be claimed
                      </li>
                    </ul>
                    One recording holds the lot - the same one keeps running while you go from page
                    to page, and there is nothing to save in between. A page you do not open is not
                    in it, and the site cannot be read for that page later. An empty page still
                    counts: if you have never deposited, open the page anyway, and the coding tool
                    sees where the site would put one.
                  </>,
                  <>
                    Click the icon again, then{' '}
                    <Key>
                      <Download size={11} strokeWidth={2} className="mr-1" />
                      Save recording
                    </Key>
                  </>,
                  <>
                    Leave it in your downloads. There is nothing to move and no folder to find - the
                    next step goes looking for it there.
                  </>,
                ]}
              />
              <p className="mt-2 text-xs">
                Nothing recorded? A few sites fetch their history somewhere the extension cannot
                watch. Then it is DevTools: <Key>F12</Key>, <Key>Network</Key>,{' '}
                <Key>Preserve log</Key>, and export the log <em>with</em> sensitive data.
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-xs">
                <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0 text-pending" />
                That file holds your account&apos;s own data. Keep it on your machine; the tool
                strips what it can.
              </p>
            </Step>

            <Step n={3} title="Paste this into a coding tool" {...step(3)}>
              <p className="text-xs">
                Claude Code, Cursor or similar, opened in that folder. It strips the recording,
                writes the site into <Key>extension/src/bookmakers/</Key> and registers it. Answer
                its questions as they come.
              </p>
              <Code text={promptFor(site)} />
              <p className="mt-2 text-xs">
                Stripping the recording prints what it found in it, page by page, and names
                whatever it could not find along with where you would have got it. Read that
                before letting the tool carry on: a page you forgot to open is a minute to record
                again now, and a folder that parses nothing an hour from now.
              </p>
            </Step>

            <Step n={4} title="Run the tests and the build" {...step(4)}>
              <p className="text-xs">
                In the project folder, one line then the other. The tests read the new site&apos;s
                own recording back through it; the build refuses outright if the folder was not
                registered, and copies everything into <Key>extension/dist</Key> - the folder the
                browser loads.
              </p>
              <Code text={CHECK} />
              <p className="mt-2 text-xs">
                Red? Give the tool the output as it stands. It is written for it. Only build once
                the tests are green - a build off a broken site loads a broken site.
              </p>
            </Step>

            <Step n={5} title={unpacked ? 'Reload this copy' : 'Load the build'} {...step(5)}>
              <Substeps
                items={
                  unpacked
                    ? [
                        <>
                          Open <Key>edge://extensions</Key> or <Key>chrome://extensions</Key>.
                        </>,
                        <>
                          Press <Key>Reload</Key> on this copy. The build you just made is already
                          in the folder it reads.
                        </>,
                        <>Sign in at the bookmaker, say yes when asked, and let it sync.</>,
                      ]
                    : [
                        <>
                          Open <Key>edge://extensions</Key> or <Key>chrome://extensions</Key>, and
                          turn on Developer mode.
                        </>,
                        <>
                          <Key>Load unpacked</Key> → the project&apos;s <Key>extension/dist</Key>{' '}
                          folder.
                        </>,
                        <>Sign in at the bookmaker, say yes when asked, and let it sync.</>,
                      ]
                }
              />
              <p className="mt-2 text-xs">
                {unpacked ? (
                  <>
                    This is that copy - you are reading it. Every site after the first is a rebuild
                    of it, never a second extension.
                  </>
                ) : (
                  <>
                    Switch the store copy off first - two copies read one account into two
                    histories. You do this once: from then on the project rebuilds this same copy.
                  </>
                )}
              </p>
            </Step>

            <Step n={6} title="Check that everything arrived" {...step(6)}>
              <p className="text-xs">
                Sign in and let it sync, then send any wrong line to the coding tool.
              </p>
              <p className="mt-1 text-xs">
                <span className="text-muted-foreground">Untested</span> is not a failure - it means
                your account has never had one of those, so nothing here can prove it either way. An
                open bet, an accumulator, a deposit or a bonus each stay untested until you have
                one: leave a bet running, sync again, and the line answers itself.
              </p>
              {reports.map((report) => (
                <SiteReport
                  key={report.meta.id}
                  id={report.meta.id}
                  name={report.meta.name}
                  checks={report.checks}
                />
              ))}
              {/* Folded away: these are the reader's own job with the bookmaker's
                page open beside this one, and they are not why they came here. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-primary">
                  What this page cannot check
                </summary>
                <p className="mt-1.5 text-xs">
                  It reads what was stored, so it can only say a figure arrived - never that it is
                  right. With the bookmaker&apos;s own history page open beside this one:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                  <li>The bet count matches the site&apos;s own, not one page of it</li>
                  <li>Profit and turnover match, to the cent</li>
                  <li>The oldest bet you have is here - paging reached the end</li>
                  <li>
                    Stake, odds and return match the site&apos;s figures on a bet you remember
                  </li>
                  <li>A second sync changes nothing: no duplicates, the same counts</li>
                </ul>
              </details>
            </Step>
          </div>
        ) : (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-muted-foreground">
            <p>
              This copy came from the store, so it reads the bookmakers it was built with and no
              others. A bookmaker is not a setting that can be typed in here - it is code that knows
              where that one site keeps your bets, and code only reaches the browser in a build.
            </p>
            <p>
              Adding one is done in the project. You record your own signed-in session at the site,
              a coding tool reads that recording and writes the site from it, and you build and load
              the result yourself. Nothing about the recording leaves your machine, and no one else
              has to have heard of the bookmaker for it to work.
            </p>
            <p>
              That build is a separate extension with its own records, so the history on this page
              stays here and the built copy starts empty. It reads the same bookmakers this one
              does, and yours as well.
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <a
                href={`${REPO}/blob/main/docs/ADD_A_BOOKMAKER.md`}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                How to add a bookmaker
              </a>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Get the project on GitHub
              </a>
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-5 pt-1 text-xs">
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
