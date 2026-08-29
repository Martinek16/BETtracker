import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Spoken and hover name, needed when the label is an icon rather than words. */
  title?: string;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export const SegmentedToggle = <T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedToggleProps<T>): JSX.Element => (
  <div
    className={cn(
      // Fixed height so every toggle in a toolbar lines up with the date fields,
      // whatever its labels are - an icon label is taller than a word label.
      'inline-flex h-[23px] items-stretch rounded-md border border-border bg-muted/30 p-0.5 text-[10px]',
      className,
    )}
  >
    {options.map(({ value: v, label, title }) => (
      <button
        key={v}
        type="button"
        onClick={() => onChange(v)}
        title={title}
        aria-label={title}
        aria-pressed={value === v}
        className={cn(
          'flex items-center rounded-[5px] px-2 font-medium leading-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          value === v
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
      </button>
    ))}
  </div>
);
