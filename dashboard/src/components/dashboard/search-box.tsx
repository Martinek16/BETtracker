import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Shown once the box is open, and spoken as its name whether open or shut. */
  placeholder: string;
  /** Width while open. The shut state is always the square of a toggle button. */
  width?: string;
  className?: string;
  /** Anchor for the product tour, where a step points at the box. */
  'data-tour'?: string;
}

/**
 * Collapsed to its icon until it is used, so a quiet page stays quiet; a typed
 * term holds it open, or the filter would hide its own reason. Every page that
 * searches uses this one, so the control reads the same wherever it appears.
 */
export const SearchBox = ({
  value,
  onChange,
  placeholder,
  width = 'w-52',
  className,
  'data-tour': dataTour,
}: SearchBoxProps): JSX.Element => {
  const [open, setOpen] = useState(false);
  const wide = open || value !== '';

  return (
    <div className={cn('relative flex', className)} data-tour={dataTour}>
      <Search
        size={12}
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          wide ? 'left-2' : 'left-1/2 -translate-x-1/2',
        )}
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={wide ? placeholder : ''}
        aria-label={placeholder}
        // Same height and corner as the toggles beside it - the row is read as
        // one bar, so nothing in it may sit lower.
        className={cn(
          'h-[23px] cursor-pointer rounded-md border-border bg-muted/30 py-0 text-[10px] shadow-none transition-[width] duration-150 focus-visible:ring-0 [&::-webkit-search-cancel-button]:hidden',
          wide ? cn(width, 'pl-7 pr-7') : 'w-7 px-0',
        )}
      />
      {wide && value !== '' ? (
        <button
          type="button"
          // Kept out of the blur that would shut the box before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
};
