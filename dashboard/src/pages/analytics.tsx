import { BreakdownsView } from '@/components/analytics/breakdowns-view';
import { GeneralSelections } from '@/components/analytics/general-selections';
import { GeneralSlips } from '@/components/analytics/general-slips';
import { useDashboard } from '@/context/dashboard-context';

export const AnalyticsPage = (): JSX.Element => {
  const { periodBets, loading, analysisUnit, analyticsView } = useDashboard();
  const currency = periodBets[0]?.currency ?? 'EUR';

  return (
    <div className="h-full min-h-0 overflow-hidden pr-1">
      {analyticsView === 'breakdowns' ? (
        <BreakdownsView
          bets={periodBets}
          unit={analysisUnit}
          currency={currency}
          loading={loading}
        />
      ) : analysisUnit === 'selections' ? (
        <GeneralSelections bets={periodBets} currency={currency} />
      ) : (
        <GeneralSlips bets={periodBets} currency={currency} />
      )}
    </div>
  );
};
