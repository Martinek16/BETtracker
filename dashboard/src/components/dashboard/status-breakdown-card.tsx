import type { StatusBreakdown } from '@/lib/period-analytics';
import { DashboardCard, DashboardCardHeading } from './dashboard-card';

interface StatusBreakdownCardProps {
  status: StatusBreakdown;
  total: number;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const StatusBreakdownCard = ({ status, total }: StatusBreakdownCardProps): JSX.Element => {
  // Pending and void sit last because they are outcomes the bettor is waiting on
  // or never had, not results. Empty ones drop out entirely - a row reading "0"
  // is a row spent saying nothing - but won and lost stay whatever they read,
  // since a period with no wins is exactly the case worth seeing.
  const segments = [
    { key: 'won', label: 'Won', value: status.won, color: 'hsl(var(--profit))', always: true },
    { key: 'lost', label: 'Lost', value: status.lost, color: 'hsl(var(--loss))', always: true },
    {
      key: 'other',
      label: 'Void / cashed out',
      value: status.void + status.cashed_out,
      color: 'hsl(var(--muted-foreground) / 0.25)',
      always: false,
    },
    {
      key: 'pending',
      label: 'Open',
      value: status.pending,
      color: 'hsl(var(--muted-foreground) / 0.5)',
      always: false,
    },
  ];

  const counted = segments.reduce((sum, s) => sum + s.value, 0);
  const share = (value: number): number => (counted === 0 ? 0 : (value / counted) * 100);
  const shown = segments.filter((s) => s.always || s.value > 0);

  let offset = 0;
  const arcs = segments.map((s) => {
    const length = (share(s.value) / 100) * CIRCUMFERENCE;
    const arc = { key: s.key, color: s.color, length, offset };
    offset += length;
    return arc;
  });

  return (
    <DashboardCard className="flex h-full flex-col overflow-hidden p-4">
      <DashboardCardHeading className="mb-3" title="Bet outcomes" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* The ring takes whatever height the legend leaves, so a period with two
            rows draws a bigger ring than one with four rather than a fixed disc
            floating in empty card. */}
        <div className="flex min-h-[80px] flex-1 items-center justify-center pb-3">
          <div className="relative aspect-square h-full max-h-[188px]">
            {/* The count lives inside the viewBox so it grows with the ring
                instead of sitting at one size in a disc that changes. */}
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <g transform="rotate(-90 50 50)">
                <circle
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="11"
                  className="stroke-muted/40"
                />
                {arcs.map((arc) => (
                  <circle
                    key={arc.key}
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="none"
                    strokeWidth="11"
                    stroke={arc.color}
                    strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                    strokeDashoffset={-arc.offset}
                  />
                ))}
              </g>
              <text
                x="50"
                y="50"
                textAnchor="middle"
                fontSize="14"
                className="fill-foreground font-semibold tabular-nums"
              >
                {total}
              </text>
              <text
                x="50"
                y="60"
                textAnchor="middle"
                fontSize="7.5"
                className="fill-muted-foreground"
              >
                bets
              </text>
            </svg>
          </div>
        </div>

        <ul className="shrink-0 space-y-1.5">
          {shown.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{s.value}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                {share(s.value).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardCard>
  );
};
