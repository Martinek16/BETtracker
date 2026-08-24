import {
  type HTMLAttributes,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Styles the scroll wrapper - needed to bound its height so `sticky` headers stick. */
  containerClassName?: string;
  /**
   * Header rows. Given here rather than as a child, they are rendered in their
   * own table above the scroll box, so the scrollbar starts at the first data
   * row instead of running alongside a header that never moves. Both boxes force
   * a scrollbar gutter, which is what keeps the two tables' columns lined up.
   */
  head?: ReactNode;
  /** Shared `<colgroup>`; both tables need it to agree on column widths. */
  cols?: ReactNode;
}

export const Table = ({
  className,
  containerClassName,
  head,
  cols,
  children,
  ...props
}: TableProps): JSX.Element => {
  const tableClass = cn('w-full caption-bottom text-sm', className);
  if (head === undefined) {
    return (
      <div className={cn('scroll-area relative w-full overflow-auto', containerClassName)}>
        <table className={tableClass} {...props}>
          {cols}
          {children}
        </table>
      </div>
    );
  }
  return (
    <div className={cn('flex w-full flex-col', containerClassName)}>
      <div className="scroll-gutter w-full overflow-y-scroll">
        <table className={tableClass} {...props}>
          {cols}
          {head}
        </table>
      </div>
      <div className="scroll-area min-h-0 flex-1 overflow-y-scroll">
        <table className={tableClass} {...props}>
          {cols}
          {children}
        </table>
      </div>
    </div>
  );
};

export const TableHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element => (
  <thead className={cn('[&_tr]:border-b [&_tr]:hover:bg-transparent', className)} {...props} />
);

export const TableBody = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);

export const TableRow = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>): JSX.Element => (
  <tr className={cn('border-b hover:bg-muted/50', className)} {...props} />
);

export const TableHead = ({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element => (
  <th
    className={cn('h-10 px-3 text-left align-middle font-medium text-muted-foreground', className)}
    {...props}
  />
);

export const TableCell = ({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element => (
  <td className={cn('p-3 align-middle', className)} {...props} />
);
