import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { connectionOf, type ConnectionTone, type SyncMeta } from '@betanal/shared';
import { cn } from '@/lib/utils';

/**
 * Where you are and the way back out, on the one line. A subpage is opened from
 * a tab and returns to it, so the parent is the title's own first half rather
 * than a separate link stacked above it eating a line of the page.
 */
export const Crumbs = ({
  to,
  parent,
  title,
  children,
}: {
  to: string;
  parent: string;
  title: string;
  /** Anything that belongs on the same line, such as a note about the page. */
  children?: ReactNode;
}): JSX.Element => (
  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-sm">
    <Link to={to} className="text-muted-foreground transition-colors hover:text-foreground">
      {parent}
    </Link>
    <ChevronRight size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground/50" />
    <h2 className="min-w-0 truncate font-semibold text-foreground">{title}</h2>
    {children}
  </div>
);

/** The four signs, in the same inks the popup uses so both read as one app. */
const TONE: Record<ConnectionTone, string> = {
  ok: 'text-profit',
  busy: 'text-pending',
  stuck: 'text-pending',
  failed: 'text-loss',
  idle: 'text-muted-foreground',
};

/**
 * How an account is doing, in words rather than a coloured dot to decode. The
 * judgement itself is the extension's, so this page and the popup can never end
 * up saying different things about the same account.
 */
export const ConnectionLabel = ({
  meta,
  className,
}: {
  meta: SyncMeta | null | undefined;
  className?: string;
}): JSX.Element => {
  const { tone, label } = connectionOf(meta);
  return <span className={cn(TONE[tone], className)}>{label}</span>;
};

/** A titled card. Every settings block and every About block is one of these. */
export const Section = ({
  title,
  tour,
  children,
}: {
  title: string;
  /** Names the block for the guided tour to point at. */
  tour?: string;
  children: ReactNode;
}): JSX.Element => (
  <section data-tour={tour}>
    <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
    <div className="rounded-xl border border-border bg-card px-4">{children}</div>
  </section>
);

export const Stat = ({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  /** A second figure the first one does not contain, set apart by its colour. */
  note?: string;
}): JSX.Element => (
  <div className="min-w-0">
    <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className={cn('truncate text-sm font-semibold tabular-nums text-foreground', tone)}>
      {value}
    </p>
    {note !== undefined && (
      <p className="truncate text-[10px] tabular-nums text-emerald-500">{note}</p>
    )}
  </div>
);

export const Row = ({ label, children }: { label: string; children: ReactNode }): JSX.Element => (
  <div className="flex items-center justify-between gap-6 border-b border-border/60 py-2.5 text-sm last:border-0">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <div className="min-w-0 text-right">{children}</div>
  </div>
);
