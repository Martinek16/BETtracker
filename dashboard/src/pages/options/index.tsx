import { NavLink, Route, Routes } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AccountDetailPage } from '@/pages/options/account';
import { AccountsPage } from '@/pages/options/accounts';
import { AboutPage } from '@/pages/options/about';
import { AddBookmakerPage } from '@/pages/options/add-bookmaker';
import { GeneralPage } from '@/pages/options/general';
import { LogPage } from '@/pages/options/log';
import { PrivacyPage } from '@/pages/options/privacy';

// Absolute paths: the parent route is a splat, which makes relative links
// resolve against the whole matched path rather than against /options.
const TABS = [
  { to: '/options', label: 'Settings', end: true },
  { to: '/options/accounts', label: 'Accounts', end: false },
  { to: '/options/log', label: 'Log', end: false },
  { to: '/options/about', label: 'About', end: false },
];

export const OptionsPage = (): JSX.Element => (
  // The tabs stay put and the page below them scrolls, so whichever page is open
  // is never scrolled away from the way back out of it.
  <div className="flex h-full flex-col gap-3 overflow-hidden">
    <div className="flex flex-wrap items-center gap-3">
      <nav
        data-tour="options-tabs"
        className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'rounded-[6px] px-3 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
    {/* The negative margin cancels the main area's own padding, so the scrollbar
        rides the edge of the window instead of floating a few centimetres inside
        it; the padding is put straight back so the content itself does not move. */}
    <div className="scroll-area -mr-6 flex min-h-0 flex-1 flex-col overflow-y-auto pr-6 lg:-mr-10 lg:pr-10">
      <Routes>
        <Route path="/" element={<GeneralPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        {/* Under Accounts, so its tab stays lit while the page is open. */}
        <Route path="accounts/add-bookmaker" element={<AddBookmakerPage />} />
        <Route path="accounts/:bookmaker/:accountId" element={<AccountDetailPage />} />
        <Route path="log" element={<LogPage />} />
        <Route path="about" element={<AboutPage />} />
        {/* Under About, so its tab stays lit while the policy is open. */}
        <Route path="about/privacy" element={<PrivacyPage />} />
      </Routes>
    </div>
  </div>
);
