import { useState } from 'react';
import { useNavigate } from 'react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Ticket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ActiveSlipCard, useOpenSlips } from '@/components/active-bets/active-slip-card';
import { SlipTotals } from '@/components/active-bets/slip-totals';
import { useDashboard } from '@/context/dashboard-context';
import { useLiveBets } from '@/data/live-bets';
import { useOpenBets } from '@/data/use-open-bets';
import { cn } from '@/lib/utils';

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
  const { bets } = useLiveBets();
  const { currency } = useDashboard();
  const slips = useOpenSlips();
  const { live, waiting, scores, refreshedAt, now, siteLinkFor } = useOpenBets(open);
  const tab = picked ?? (live.length > 0 ? 'live' : 'open');
  const shown = tab === 'live' ? live : waiting;
  const navigate = useNavigate();

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
            <div className="flex items-center">
              {/* The drawer is a column; the page lays the same slips out wide
                  and shows both halves at once. */}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open full page"
                title="Open full page"
                onClick={() => {
                  setOpen(false);
                  void navigate('/bets/open');
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </header>

          {/* Tabs rather than two boxes: the line under the chosen name says
              which half the slips below belong to, without a border round each
              word competing with the cards for the eye. The totals ride on the
              same rule, so the bar is one line and the list starts sooner. */}
          <div className="mx-4 mb-2 flex items-baseline gap-4 border-b border-border">
            {(
              [
                ['live', 'Live', live.length],
                ['open', 'Open', waiting.length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPicked(value)}
                className={cn(
                  '-mb-px border-b-2 pb-1.5 text-sm transition-colors',
                  tab === value
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                <span className="ml-1.5 text-[11px] tabular-nums opacity-60">{count}</span>
              </button>
            ))}
            <SlipTotals
              staked={shown.reduce((sum, bet) => sum + bet.stake, 0)}
              toWin={shown.reduce(
                (sum, bet) => sum + (bet.currentPotentialReturn ?? bet.potentialReturn),
                0,
              )}
              currency={currency}
              className="ml-auto pb-1.5"
            />
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
              shown.map((bet) => (
                <ActiveSlipCard
                  key={bet.betId}
                  expanded={slips.isOpen(bet.betId, false)}
                  onToggle={() => {
                    slips.toggle(bet.betId, false);
                  }}
                  bet={bet}
                  scores={scores}
                  now={now}
                  refreshedAt={refreshedAt}
                  siteUrl={siteLinkFor(bet.bookmaker)?.url ?? null}
                />
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
};
