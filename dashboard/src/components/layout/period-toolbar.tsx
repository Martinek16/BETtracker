import { AccountIcon } from '@/components/dashboard/account-icon';
import { TimeRangeToggle } from '@/components/dashboard/time-range-toggle';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import {
  useDashboard,
  type AccountFilter,
  type AnalysisUnit,
  type AnalyticsView,
} from '@/context/dashboard-context';
import { findAccount } from '@/data/accounts';

const VIEW_OPTIONS: readonly SegmentedOption<AnalyticsView>[] = [
  { value: 'general', label: 'General' },
  { value: 'breakdowns', label: 'Breakdowns' },
];

const UNIT_OPTIONS: readonly SegmentedOption<AnalysisUnit>[] = [
  { value: 'slips', label: 'Slips' },
  { value: 'selections', label: 'Selections' },
];

/**
 * Narrows every page to one account. Hidden below two accounts with data: a
 * single-choice filter is not a filter, only a control that appears broken.
 */
const AccountToggle = ({ casinoOnly }: { casinoOnly: boolean }): JSX.Element | null => {
  const { bookmaker, setBookmaker, activeBookmakers } = useDashboard();
  // The casino page can only say anything about a book that runs one, so the
  // rest are not choices there - offering them offers an empty page.
  const choices = casinoOnly
    ? activeBookmakers.filter((id) => findAccount(id)?.hasCasino === true)
    : activeBookmakers;
  if (choices.length < 2) return null;

  const options: SegmentedOption<AccountFilter>[] = [
    { value: 'all', label: 'All', title: 'All accounts' },
    ...choices.map((id) => ({
      value: id,
      label: <AccountIcon bookmaker={id} className="h-4 w-4 rounded-[3px] p-0 text-[9px]" />,
      title: findAccount(id)?.name ?? id,
    })),
  ];

  return <SegmentedToggle value={bookmaker} options={options} onChange={setBookmaker} />;
};

/**
 * Records held out of every total because no exchange rate covered their day.
 * Said out loud rather than absorbed: a total quietly missing rows is a wrong
 * total, and the count is the only way to tell one from a right one.
 */
const UnconvertibleNote = (): JSX.Element | null => {
  const { unconvertible, currency } = useDashboard();
  if (unconvertible === 0) return null;

  return (
    <span
      className="text-[11px] font-medium text-pending"
      title={`No exchange rate for these records on their own date, so they are left out of every ${currency} total.`}
    >
      {`${unconvertible} record${unconvertible === 1 ? '' : 's'} not counted`}
    </span>
  );
};

interface PeriodToolbarProps {
  /** Analytics adds the view and slips/selections toggles on the left; time range stays right. */
  analyticsMode?: boolean;
  /** Casino narrows the account chooser to the books that run one. */
  casinoMode?: boolean;
}

export const PeriodToolbar = ({
  analyticsMode = false,
  casinoMode = false,
}: PeriodToolbarProps): JSX.Element => {
  const {
    range,
    setRange,
    customFrom,
    customTo,
    setCustom,
    earliestRecord,
    analysisUnit,
    setAnalysisUnit,
    analyticsView,
    setAnalyticsView,
  } = useDashboard();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {analyticsMode && (
          <div className="flex items-center gap-2">
            <div className="flex items-center" data-tour="analytics-view">
              <SegmentedToggle
                value={analyticsView}
                options={VIEW_OPTIONS}
                onChange={setAnalyticsView}
              />
            </div>
            <div className="flex items-center" data-tour="analysis-unit">
              <SegmentedToggle
                value={analysisUnit}
                options={UNIT_OPTIONS}
                onChange={setAnalysisUnit}
              />
            </div>
          </div>
        )}
        <div className="flex items-center" data-tour="accounts">
          <AccountToggle casinoOnly={casinoMode} />
        </div>
        <UnconvertibleNote />
      </div>
      <div className="flex items-center" data-tour="period">
        <TimeRangeToggle
          value={range}
          onChange={setRange}
          customFrom={customFrom}
          customTo={customTo}
          onCustom={setCustom}
          earliest={earliestRecord}
        />
      </div>
    </div>
  );
};
