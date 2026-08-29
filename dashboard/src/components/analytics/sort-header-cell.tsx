import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortHeaderCellProps<K extends string> {
  label: string;
  sortKey: K;
  active: boolean;
  desc: boolean;
  numeric?: boolean;
  widthClass: string;
  onSort: (key: K) => void;
}

/** One header button for both breakdown tables, so the two sort alike. */
export const SortHeaderCell = <K extends string>({
  label,
  sortKey,
  active,
  desc,
  numeric = false,
  widthClass,
  onSort,
}: SortHeaderCellProps<K>): JSX.Element => (
  <button
    type="button"
    onClick={() => onSort(sortKey)}
    className={cn(
      'relative flex items-center gap-1 text-[10px] uppercase tracking-wide hover:text-foreground',
      numeric ? 'justify-center' : 'justify-start',
      active ? 'text-foreground' : 'text-muted-foreground',
      widthClass,
    )}
  >
    <span className="truncate">{label}</span>
    {active ? (
      // Out of the flow on the numeric columns: in the flow it pushes the label
      // off centre, and the label is what the values below are read against.
      <span className={cn('shrink-0', numeric && 'absolute right-0')}>
        {desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
      </span>
    ) : null}
  </button>
);
