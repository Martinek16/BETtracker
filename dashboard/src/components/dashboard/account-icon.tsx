import type { Bookmaker } from '@betanal/shared';
import { accountLogoUrl, findAccount } from '@/data/accounts';
import { useDashboard } from '@/context/dashboard-context';
import { cn } from '@/lib/utils';

interface AccountIconProps {
  bookmaker: Bookmaker;
  className?: string;
}

/** Falls back to the first letter for a bookmaker that ships no artwork. */
export const AccountIcon = ({ bookmaker, className }: AccountIconProps): JSX.Element => {
  const { monoIcons } = useDashboard();
  const account = findAccount(bookmaker);
  const box = cn('h-8 w-8 shrink-0 overflow-hidden rounded-md', className);

  if (account === undefined) {
    return (
      <span
        title={bookmaker}
        className={cn(
          box,
          'flex items-center justify-center bg-muted text-sm font-semibold uppercase text-muted-foreground',
        )}
      >
        {bookmaker.charAt(0)}
      </span>
    );
  }

  const logo = accountLogoUrl(account);

  // Grey mode paints the mark's own shape in whatever ink surrounds it, so it
  // reads on a light page, a dark page, and on a selected row that inverts both.
  if (monoIcons) {
    return (
      <span
        title={account.name}
        className={cn(box, 'block bg-current')}
        style={{
          maskImage: `url(${logo})`,
          WebkitMaskImage: `url(${logo})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
      />
    );
  }

  return (
    <span className={cn(box, 'block')} style={{ backgroundColor: account.brand }}>
      <img src={logo} alt="" title={account.name} className="h-full w-full object-contain p-0.5" />
    </span>
  );
};
