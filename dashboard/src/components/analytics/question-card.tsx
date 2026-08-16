import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { cn } from '@/lib/utils';

type Tone = 'profit' | 'loss' | 'neutral';

interface QuestionCardProps {
  /** The question, asked the way a bettor would ask it. */
  title: string;
  /** The whole answer in a word or two - all a collapsed card shows. */
  answer: ReactNode;
  tone?: Tone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const QuestionCard = ({
  title,
  answer,
  tone = 'neutral',
  open,
  onToggle,
  children,
}: QuestionCardProps): JSX.Element => (
  <DashboardCard className={cn('flex shrink-0 flex-col p-3', !open && 'py-2')}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 text-left"
    >
      <ChevronRight
        aria-hidden
        className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', open && 'rotate-90')}
      />
      <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-muted-foreground">
        {title}
      </h3>
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          open ? 'text-base' : 'text-[13px]',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {answer}
      </span>
    </button>
    {open ? <div className="mt-2 flex flex-col">{children}</div> : null}
  </DashboardCard>
);
