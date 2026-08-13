import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { isLiveBet, type Bet } from '@betanal/shared';
import { Ticket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ActiveSlipCard } from '@/components/active-bets/active-slip-card';
import { findAccount, siteLinkOf, useSiteOrigins } from '@/data/accounts';
import { useLiveBets } from '@/data/live-bets';
import { cn } from '@/lib/utils';

/** A slip belongs to the day its first match starts, not the day it was placed. */
const kickoffOf = (bet: Bet): number => {
  const starts = bet.legs.flatMap((leg) => {
    const ms = leg.eventDate == null ? Number.NaN : Date.parse(leg.eventDate);
    return Number.isNaN(ms) ? [] : [ms];
  });
  return starts.length > 0 ? Math.min(...starts) : Date.parse(bet.placedAt);
};

/**
 * Floating button plus the right-hand drawer of open slips.
 *
 * Radix Dialog gives focus trap, Esc, outside click and scroll lock. The shared
 * `DialogContent` is hard-coded to a centered modal, so the portal/overlay/content
 * are composed inline here instead.
 */
export const ActiveBetsPanel = (): JSX.Element => {
  const [open, setOpen] = useState(false);
  // null = follow the data: land on Live whenever something is in play. An
  // explicit click pins the choice for the rest of the session.
  const [picked, setPicked] = useState<'live' | 'open' | null>(null);
  const { bets, scores, refreshedAt } = useLiveBets();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);
  // With the scores, so a slip whose match the book has called ended drops back
  // to Open rather than sitting under Live until the book gets round to settling
  // it. `now` ticks while the drawer is open, which is what re-runs this.
  const live = bets.filter((bet) => isLiveBet(bet, now, scores));
  const waiting = bets.filter((bet) => !isLiveBet(bet, now, scores));
  const tab = picked ?? (live.length > 0 ? 'live' : 'open');
  const shown = tab === 'live' ? live : waiting;
  // The mirror the browser actually reached the book on; its own address otherwise.
  const origins = useSiteOrigins();
  const siteUrlOf = (bet: Bet): string | null => {
    const account = findAccount(bet.bookmaker);
    if (account === undefined) return null;
    return siteLinkOf(account, origins, account.betsPath).url;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          aria-label="My bets"
          data-tour="active-bets"
          className="fixed bottom-6 right-6 z-40 h-[55px] w-[55px] rounded-full border-border bg-card text-foreground shadow-xl hover:bg-accent"
        >
          <Ticket className="h-5 w-5" />
          {bets.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
              {bets.length}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-tour="active-bets-panel"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-lg data-[state=open]:animate-slide-in-right"
        >
          <header className="flex items-center justify-between px-4 py-3">
            <DialogTitle className="text-base font-semibold">My Bets</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </header>

          <div className="mx-4 mb-2 grid grid-cols-2 gap-2">
            {([
              ['live', 'Live', live.length],
              ['open', 'Open', waiting.length],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPicked(value)}
                className={cn(
                  'rounded-md border py-1.5 text-sm font-medium',
                  tab === value
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="scroll-area flex-1 space-y-2 overflow-y-auto p-4">
            {shown.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Ticket className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {tab === 'live' ? 'No slips in play' : 'No slips waiting'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tab === 'live'
                    ? 'A slip moves here as soon as one of its matches kicks off.'
                    : 'Slips you place appear here until their first match starts.'}
                </p>
              </div>
            ) : (
              [...shown]
                .sort((a, b) => kickoffOf(a) - kickoffOf(b))
                .map((bet) => (
                  <ActiveSlipCard
                    key={bet.betId}
                    bet={bet}
                    scores={scores}
                    now={now}
                    refreshedAt={refreshedAt}
                    siteUrl={siteUrlOf(bet)}
                  />
                ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
};
