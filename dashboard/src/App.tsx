import { Route, Routes, useLocation } from 'react-router-dom';
import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { PeriodToolbar } from '@/components/layout/period-toolbar';
import {
  ConnectionToast,
  NewBookmakerToast,
  SyncToast,
  Toasts,
} from '@/components/layout/toasts';
import { ActiveBetsPanel } from '@/components/active-bets/active-bets-panel';
import { DashboardProvider } from '@/context/dashboard-context';
import { LiveBetsProvider } from '@/data/live-bets';
import { OverviewPage } from '@/pages/overview';
import { BetsPage } from '@/pages/bets';
import { AnalyticsPage } from '@/pages/analytics';
import { TransactionsPage } from '@/pages/transactions';
import { BonusesPage } from '@/pages/bonuses';
import { CasinoPage } from '@/pages/casino';
import { OptionsPage } from '@/pages/options';
import { WelcomePage } from '@/pages/welcome';
import { ProductTour } from '@/components/tour/product-tour';
import { cn } from '@/lib/utils';

export const App = (): JSX.Element => {
  const location = useLocation();
  const analyticsMode = location.pathname === '/analytics';
  // Nothing is connected yet on the welcome page, so every chrome that reads
  // from an account has nothing to show and only gets in the way.
  const welcome = location.pathname === '/welcome';
  // Settings are not a period, so a time range picker above them means nothing.
  const showToolbar = !location.pathname.startsWith('/options') && !welcome;

  return (
  <DashboardProvider>
    <LiveBetsProvider>
    <div className="h-screen overflow-hidden bg-background">
      <div className="dashboard-grid-bg flex h-full flex-col">
        <AppHeader bare={welcome} />
        <Toasts>
          <NewBookmakerToast />
          <ConnectionToast />
          <SyncToast />
        </Toasts>
        {!welcome && <AppSidebar />}
        <main
          className={cn(
            'min-h-0 flex-1 overflow-hidden px-6 py-4 lg:px-10',
            !welcome && 'ml-[52px]',
          )}
        >
          <div className={cn('flex h-full flex-col', !welcome && 'mx-auto max-w-[1280px]')}>
            {showToolbar && <PeriodToolbar analyticsMode={analyticsMode} />}
            <div className="min-h-0 flex-1">
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/bets" element={<BetsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/bonuses" element={<BonusesPage />} />
                <Route path="/casino" element={<CasinoPage />} />
                <Route path="/options/*" element={<OptionsPage />} />
                <Route path="/welcome" element={<WelcomePage />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
    {!welcome && <ActiveBetsPanel />}
    {!welcome && <ProductTour />}
    </LiveBetsProvider>
  </DashboardProvider>
  );
};
