import { Link } from 'react-router-dom';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { ACCOUNTS } from '@/data/accounts';

const STEPS: readonly { title: string; body: string }[] = [
  {
    title: 'Sign in to a bookmaker we support',
    body: 'Open the site and log in as you always do.',
  },
  {
    title: 'Press Connect in the popup',
    body: 'The extension asks once per site. Say no and the site is left alone.',
  },
  {
    title: 'Everything shows up by itself',
    body: 'Bets, deposits and withdrawals appear here the moment they happen.',
  },
];

/**
 * Opened once, by the extension, the moment it is installed. It exists because
 * nothing about this extension is visible until a bookmaker's site is open - the
 * user would otherwise install it and see nothing at all.
 */
export const WelcomePage = (): JSX.Element => (
  <div className="flex h-full flex-col">
    <div className="flex flex-1 items-center justify-center py-6">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            Bettracker collects your betting history from the bookmakers you use and turns it into
            numbers you can read. Everything stays in this browser - nothing is uploaded, and no
            password is ever asked for.
          </p>
        </div>

        <DashboardCard className="flex flex-col gap-4 p-5">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {index + 1}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </DashboardCard>

        <Link
          to="/"
          className="mx-auto rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Go to the dashboard
        </Link>
      </div>
    </div>

    <div className="mt-auto flex flex-col items-center gap-2 border-t border-border/60 pb-2 pt-4">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Supported bookmakers
      </span>
      <div className="flex items-center gap-4">
        {ACCOUNTS.map((account) => (
          <span key={account.id} title={account.name} className="text-muted-foreground">
            <AccountIcon bookmaker={account.id} className="h-5 w-5" />
          </span>
        ))}
      </div>
    </div>
  </div>
);
