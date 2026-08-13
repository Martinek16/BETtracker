import { Layers, Target } from 'lucide-react';
import { SegmentedToggle, type SegmentedOption } from './segmented-toggle';
import type { AnalysisUnit } from '@/context/dashboard-context';

const OPTIONS: readonly SegmentedOption<AnalysisUnit>[] = [
  { value: 'slips', label: <Layers size={12} strokeWidth={2} />, title: 'Per bet slip' },
  { value: 'selections', label: <Target size={12} strokeWidth={2} />, title: 'Per selection' },
];

interface AnalysisUnitToggleProps {
  value: AnalysisUnit;
  onChange: (value: AnalysisUnit) => void;
}

/**
 * Card-local slips/selections switch. Deliberately not the toolbar's shared
 * `analysisUnit`: that one retunes the whole Analytics page, and an overview
 * card flipping it would silently change a page the user is not looking at.
 */
export const AnalysisUnitToggle = ({ value, onChange }: AnalysisUnitToggleProps): JSX.Element => (
  <SegmentedToggle value={value} options={OPTIONS} onChange={onChange} />
);
