import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'profit' | 'loss' | 'neutral';

const toneClass = (tone: Tone): string =>
  tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-foreground';

interface CardNoteProps {
  /** What the card found and what to do about it, in one plain sentence. */
  children: ReactNode;
  tone?: Tone;
}

/** The single closing line every card ends on: the finding and the advice together. */
export const CardNote = ({ children, tone = 'neutral' }: CardNoteProps): JSX.Element => (
  <p
    className={cn(
      'mt-auto pt-2 text-[11px] leading-snug',
      tone === 'neutral' ? 'text-muted-foreground' : toneClass(tone),
    )}
  >
    {children}
  </p>
);

/** The one-word answer to the card's title question, top right. Long answers are
 *  names, and a name that wraps pushes the card's body down — it truncates. */
export const CardHeadline = ({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}): JSX.Element => (
  <span
    title={title}
    className={cn(
      'block max-w-[10rem] truncate text-sm font-semibold tabular-nums',
      toneClass(tone),
    )}
  >
    {children}
  </span>
);

/** A figure inside a note: the note stays muted, the number carries the colour. */
export const NoteFigure = ({
  children,
  tone,
}: {
  children: ReactNode;
  tone: Tone;
}): JSX.Element => (
  <span className={cn('font-medium tabular-nums', toneClass(tone))}>{children}</span>
);
