import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  Calculator,
  ChevronRight,
  Eye,
  Globe,
  Lock,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { ACCOUNTS } from '@/data/accounts';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { Section } from '@/pages/options/parts';
import { cn } from '@/lib/utils';

/** Read off the installed extension rather than hard-coded, so it cannot drift. */
const version = (): string =>
  typeof chrome === 'undefined' || !chrome.runtime?.id
    ? 'Not packaged'
    : chrome.runtime.getManifest().version;

const Prose = ({ children }: { children: string }): JSX.Element => (
  <p className="border-b border-border/60 py-2 text-sm leading-relaxed text-muted-foreground last:border-0">
    {children}
  </p>
);

/** A footnote or caveat: smaller than body text, and marked by what it is about. */
const Note = ({ icon: Icon, children }: { icon: LucideIcon; children: string }): JSX.Element => (
  <div className="flex items-start gap-2.5 border-b border-border/60 py-2 last:border-0">
    <Icon size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
    <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
  </div>
);

const QUESTIONS: readonly { question: string; answer: string }[] = [
  {
    question: 'Why is an old bet missing?',
    answer:
      'History is read backwards a page at a time. Open the bookmaker and leave the tab a moment.',
  },
  {
    question: 'Why does an account stop updating?',
    answer: 'The bookmaker signed you out. Open its site again and it carries on.',
  },
  {
    question: 'Can I track two accounts at one bookmaker?',
    answer: 'Yes. Each login gets its own card under Accounts.',
  },
  {
    question: 'Is casino play counted?',
    answer:
      'Where the site hands out its rounds one at a time, the Casino page reads them, kept apart from the sports figures. Elsewhere the casino is only the gap in the wallet.',
  },
  {
    question: 'How do I keep a copy?',
    answer: 'Settings, Your data, Save. One file of everything stored here.',
  },
];

/**
 * One question at a time, the way the analytics questions open. Collapsed by
 * default: the answers are for the reader who has one of these, not a wall for
 * the reader who has none.
 */
const Questions = (): JSX.Element => {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section title="Common questions">
      {QUESTIONS.map(({ question, answer }) => {
        const isOpen = open === question;
        return (
          <div key={question} className="border-b border-border/60 last:border-0">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : question)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 py-2 text-left"
            >
              <ChevronRight
                aria-hidden
                size={13}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform',
                  isOpen && 'rotate-90',
                )}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm transition-colors',
                  isOpen ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {question}
              </span>
            </button>
            {isOpen ? (
              <p className="pb-3 pl-[21px] text-xs leading-relaxed text-muted-foreground">
                {answer}
              </p>
            ) : null}
          </div>
        );
      })}
    </Section>
  );
};

/** Closes the page the way Accounts closes with its logos. */
const Footer = (): JSX.Element => (
  <div className="mt-auto flex items-center justify-center gap-2 border-t border-border/60 pb-2 pt-4 text-xs text-muted-foreground">
    <span>© {new Date().getFullYear()} BETtracker</span>
    <span aria-hidden>·</span>
    <span className="tabular-nums">Version {version()}</span>
  </div>
);

/**
 * Three columns and short paragraphs, so the whole page is one screenful: this
 * is read once, and a reader who has to scroll for the rest mostly does not.
 */
export const AboutPage = (): JSX.Element => (
  <div className="flex flex-1 flex-col gap-4 pb-1">
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section title="What this is">
          <Prose>
            Your betting accounts added up in one place: what you won and lost, and where it came
            from. A bookmaker only shows today's balance and the last few pages.
          </Prose>
          <Prose>It looks backwards, never forwards. No tips, no predictions.</Prose>
        </Section>

        <Section title="How it works">
          <Note icon={Eye}>
            While you are signed in, it reads your bets and payments off your own account pages. It
            never signs in and never places a bet.
          </Note>
          <Note icon={RefreshCw}>
            It picks up where it left off, so a long history fills in over a few visits.
          </Note>
          <Note icon={Calculator}>Every figure is counted from those records, never guessed.</Note>
        </Section>

        <Section title="Your data">
          <Prose>
            Stored: bets, deposits, withdrawals, bonuses, casino rounds where the site records them,
            these settings. Not stored: passwords, card details.
          </Prose>
          <Prose>
            All of it stays in this browser. No account, no server, nothing uploaded or sold.
          </Prose>
          <Note icon={Lock}>
            Uninstalling or clearing site data starts you from nothing. The backup under Settings,
            Your data is the only copy that survives.
          </Note>
        </Section>

        {/* One door, so the whole card opens it - a row that opens a page, the
            way the questions open an answer. */}
        <Link
          to="/options/about/privacy"
          className="group mt-auto flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <ShieldCheck
            size={15}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          />
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">Privacy policy</p>
          <ChevronRight
            aria-hidden
            size={14}
            className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="Supported bookmakers">
          {ACCOUNTS.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3 border-b border-border/60 py-2 text-sm last:border-0"
            >
              <AccountIcon bookmaker={account.id} className="h-5 w-5" />
              <span className="font-medium text-foreground">{account.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{account.site}</span>
            </div>
          ))}
          <Note icon={Globe}>Their country domains and numbered mirrors work the same way.</Note>
        </Section>

        <Questions />

        <Section title="Keep in mind">
          <Note icon={ArrowLeftRight}>
            Other currencies use daily reference rates, so totals can differ slightly from the
            bookmaker's.
          </Note>
          <Note icon={TriangleAlert}>
            For adults only. If gambling stops being something you control, your national helpline
            is free and confidential.
          </Note>
        </Section>
      </div>
    </div>

    <Footer />
  </div>
);
