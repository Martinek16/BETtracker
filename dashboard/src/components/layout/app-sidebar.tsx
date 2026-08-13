import { NavLink } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, Gift, LayoutGrid, ReceiptText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  end?: boolean;
  /** Extra classes, used to push a link to the bottom of the rail. */
  className?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/bets', label: 'Bets', icon: ReceiptText },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/transactions', label: 'Cashflow', icon: ArrowLeftRight },
  { to: '/bonuses', label: 'Bonuses', icon: Gift },
  { to: '/options', label: 'Options', icon: Settings, className: 'mt-auto' },
];

export const AppSidebar = (): JSX.Element => (
  <aside
    className={cn(
      'group/sidebar fixed left-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] flex-col',
      'w-[56px] border-r border-border bg-background/95 backdrop-blur',
      'transition-[width] duration-200 ease-out',
      'hover:w-[216px] hover:shadow-[4px_0_24px_rgba(0,0,0,0.35)]',
    )}
  >
    <nav
      data-tour="sidebar"
      className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, end, className }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          /* The tour opens every page by pointing at its own link first, so the
             rail is what the user is looking at when the page changes under it. */
          data-tour={`nav:${to}`}
          className={({ isActive }) =>
            cn(
              'relative flex h-10 items-center rounded-lg',
              'justify-center group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              className,
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-primary',
                  'transition-opacity duration-200',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="relative shrink-0">
                <Icon size={17} strokeWidth={isActive ? 2 : 1.75} />
              </span>
              <span
                className={cn(
                  'max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0',
                  'group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100',
                )}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  </aside>
);
