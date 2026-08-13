import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useDashboard } from '@/context/dashboard-context';
import { useSettings } from '@/data/use-settings';
import { placeBubble, type Placement } from '@/components/tour/anchor';
import { PAGE_NAMES, TOUR_STEPS, type TourStep } from '@/components/tour/steps';
import { cn } from '@/lib/utils';

const BUBBLE_WIDTH = 320;
const PAD = 6;
/** A route change has to paint before its elements can be measured. */
const WAIT_MS = 1500;
/** How long an anchor that is already on the page is given to take up room. */
const EMPTY_MS = 250;

const findAnchor = (step: TourStep): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const boxOf = (element: HTMLElement): Box => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

/**
 * Walks a first-time user through the dashboard once real bets are in, driving
 * the navigation itself: the pages it explains are spread over five routes, and
 * asking someone who has just installed the extension to find them defeats the
 * point of the tour.
 */
export const ProductTour = (): JSX.Element | null => {
  const { settings, patch } = useSettings();
  const { betCount, loading, analyticsView, analysisUnit, setAnalyticsView, setAnalysisUnit } =
    useDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  const [index, setIndex] = useState<number | null>(null);
  /** The tour is offered before it is given: it takes over the page it explains. */
  const [asking, setAsking] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  /** What the analytics page looked like before the tour rearranged it. */
  const restore = useRef<{ view: typeof analyticsView; unit: typeof analysisUnit } | null>(null);

  const running = index !== null;
  const step = index === null ? null : TOUR_STEPS[index] ?? null;

  useEffect(() => {
    if (settings === null || settings.tourSeen || loading || betCount === 0 || running || asking) {
      return;
    }
    setAsking(true);
  }, [settings, loading, betCount, running, asking]);

  const close = useCallback(() => {
    setIndex(null);
    setAsking(false);
    setBox(null);
    setPlacement(null);
    if (restore.current !== null) {
      setAnalyticsView(restore.current.view);
      setAnalysisUnit(restore.current.unit);
      restore.current = null;
    }
    void patch({ tourSeen: true });
  }, [patch, setAnalyticsView, setAnalysisUnit]);

  const start = useCallback(() => {
    restore.current = { view: analyticsView, unit: analysisUnit };
    setAsking(false);
    setIndex(0);
  }, [analyticsView, analysisUnit]);

  const move = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (current === null) return null;
        const next = current + delta;
        return next < 0 || next >= TOUR_STEPS.length ? current : next;
      });
      setBox(null);
      setPlacement(null);
    },
    [],
  );

  // The step asks for a route and, on analytics, for a view; both have to be in
  // place before its element exists to be measured.
  useEffect(() => {
    if (step === null) return;
    if (location.pathname !== step.route) navigate(step.route);
    if (step.view !== undefined) setAnalyticsView(step.view);
    if (step.unit !== undefined) setAnalysisUnit(step.unit);
  }, [step, location.pathname, navigate, setAnalyticsView, setAnalysisUnit]);

  // A stop can be about something behind a button. Pressing it for the user is
  // the point: told about the drawer rather than shown it, nobody opens it.
  useEffect(() => {
    if (step?.opens === undefined || location.pathname !== step.route) return undefined;
    const opener = document.querySelector<HTMLElement>(`[data-tour="${step.opens}"]`);
    opener?.click();
    return () => {
      // Clicking the bubble counts as a click outside the drawer, which closes
      // it on its own; pressing the opener again then would only re-open it.
      if (document.querySelector(`[data-tour="${step.anchor}"]`) !== null) opener?.click();
    };
  }, [step, location.pathname]);

  // Poll for the element instead of guessing a delay: charts and tables mount
  // when their data resolves, which is not tied to the route change.
  useEffect(() => {
    if (step === null) return undefined;
    let frame = 0;
    const started = performance.now();

    const look = (): void => {
      const element = findAnchor(step);
      // A zero-width anchor is a wrapper whose content rendered nothing — the
      // account filter with a single account, for one.
      if (element !== null && element.getBoundingClientRect().width > 0) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        setBox(boxOf(element));
        return;
      }
      // An anchor already on its own page is not waiting on anything: it is
      // empty and will stay empty. Waiting the full route budget out for it left
      // a visible dead pause between two stops on the same screen.
      const empty = element !== null && location.pathname === step.route;
      if (performance.now() > started + (empty ? EMPTY_MS : WAIT_MS)) {
        // Nothing to point at — one account has no filter, a bet list without a
        // combo has no row to fold open. Skip rather than stall.
        if (index === TOUR_STEPS.length - 1) close();
        else move(1);
        return;
      }
      frame = requestAnimationFrame(look);
    };

    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [step, index, move, close, location.pathname]);

  useLayoutEffect(() => {
    if (box === null || bubbleRef.current === null) return;
    setPlacement(
      placeBubble(
        box,
        { width: BUBBLE_WIDTH, height: bubbleRef.current.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [box]);

  useEffect(() => {
    if (!running || step === null) return undefined;
    const recompute = (): void => {
      const element = findAnchor(step);
      if (element !== null) setBox(boxOf(element));
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [running, step, close]);

  if (asking) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Take the tour"
      >
        <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-border bg-background p-5 shadow-2xl">
          <p className="text-base font-semibold text-foreground">Want a quick tour?</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your bets are in. In about two minutes we walk through each page and what it tells
            you. You can leave at any point, and start it again later from Settings.
          </p>
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={start}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Show me around
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === null || index === null || box === null) return null;

  const last = index === TOUR_STEPS.length - 1;
  // Counted within the page rather than across all of them: "3 of 5 on Bets" is
  // a place in something you can see, where "16 of 29" is only a long way to go.
  const pageSteps = TOUR_STEPS.filter((one) => one.route === step.route);
  const pagePosition = pageSteps.indexOf(step) + 1;

  return (
    // A stop inside the open-slips drawer is a stop on top of a modal, which
    // turns off pointer events everywhere outside itself — including here.
    <div
      className="pointer-events-auto fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Tour"
    >
      <div
        className="absolute rounded-lg ring-2 ring-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.86)] transition-all duration-200"
        style={{
          top: box.top - PAD,
          left: box.left - PAD,
          width: box.width + PAD * 2,
          height: box.height + PAD * 2,
        }}
      />
      <div
        ref={bubbleRef}
        aria-live="polite"
        className={cn(
          'absolute flex flex-col gap-3 rounded-xl border border-border bg-background p-4',
          'shadow-xl transition-opacity',
          placement === null && 'opacity-0',
        )}
        style={{ width: BUBBLE_WIDTH, top: placement?.top ?? 0, left: placement?.left ?? 0 }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{step.title}</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close the tour"
            className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={close}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Skip the tour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {PAGE_NAMES[step.route] ?? ''}{' '}
              <span className="tabular-nums">
                {pagePosition} / {pageSteps.length}
              </span>
            </span>
            {index > 0 && (
              <button
                type="button"
                onClick={() => move(-1)}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : move(1))}
              className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
