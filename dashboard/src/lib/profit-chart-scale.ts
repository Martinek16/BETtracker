import { compactMoney } from '@/lib/utils';

/** Upper bound on y-axis intervals; fewer are used when the data needs fewer. */
const DIVISIONS = 4;

// 2.5 only from magnitude 10 up, so a step is always a whole unit of currency.
const NICE_MULTIPLES = [1, 2, 2.5, 5, 10];

const niceStep = (rough: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const normalized = Math.max(rough, 1) / magnitude;
  const multiple =
    NICE_MULTIPLES.find((m) => normalized <= m && (m !== 2.5 || magnitude >= 10)) ?? 10;
  return multiple * magnitude;
};

/**
 * Smallest round bounds enclosing [min, max] with zero on a grid line.
 *
 * The range is never padded out to a fixed division count: doing that pushes
 * bounds past the data on both sides, so an all-positive run gets a phantom
 * negative band and the zero line floats a quarter of the way up the plot
 * instead of sitting at the bottom where the data actually starts.
 */
const buildAxis = (min: number, max: number): { yMin: number; yMax: number; step: number } => {
  let step = niceStep((max - min) / DIVISIONS);
  while (Math.ceil(max / step) - Math.floor(min / step) > DIVISIONS) step = niceStep(step + 1);

  const lo = Math.floor(min / step);
  let hi = Math.ceil(max / step);
  // All-zero data collapses the axis to a point; give it one step of height.
  if (hi === lo) hi += 1;
  return { yMin: lo * step, yMax: hi * step, step };
};

export interface ProfitChartScale {
  yMin: number;
  yMax: number;
  yTicks: number[];
  zeroPct: number;
  toPctY: (value: number) => number;
  formatY: (value: number) => string;
}

export const buildProfitChartScale = (
  profits: readonly number[],
  currency: string,
): ProfitChartScale | null => {
  if (profits.length === 0) return null;

  const { yMin, yMax, step } = buildAxis(Math.min(...profits, 0), Math.max(...profits, 0));
  const toPctY = (value: number): number => ((yMax - value) / (yMax - yMin)) * 100;

  return {
    yMin,
    yMax,
    yTicks: Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step),
    zeroPct: toPctY(0),
    toPctY,
    formatY: (value) => compactMoney(value, currency),
  };
};

/**
 * Placement for y-tick `index` (ascending from yMin). Every label is centred on
 * its line, so the gaps between labels read as evenly as the gaps between the
 * lines — the plot needs a small vertical inset for the edge two to sit in.
 */
export const yTickLayout = (
  index: number,
  count: number,
): { pct: number; lineClassName: string; labelClassName: string } => ({
  pct: count <= 1 ? 50 : 100 - (index / (count - 1)) * 100,
  // The bottom line sits exactly on the plot border, where clipping eats it.
  lineClassName: index === 0 ? '-translate-y-px' : '',
  labelClassName: '-translate-y-1/2',
});

/**
 * Evenly-spaced x-axis label indices, first and last always included.
 *
 * The gap has to be a whole number of buckets. Rounding fractional positions
 * keeps the ends but leaves ragged gaps in between — a week of days labels the
 * 28th, 29th, 30th, then jumps to the 1st, and the missing 31st reads as a hole
 * in the data rather than a sampled axis. So take the densest count (one over
 * the budget is still readable) whose stride divides the span exactly, and only
 * fall back to rounding when the span has no usable divisor at all.
 */
export const pickXLabelIndices = (length: number, maxLabels = 6): number[] => {
  if (length === 0) return [];
  if (length <= maxLabels) return Array.from({ length }, (_, i) => i);

  const last = length - 1;
  for (let count = maxLabels + 1; count >= 3; count -= 1) {
    const stride = last / (count - 1);
    if (Number.isInteger(stride)) return Array.from({ length: count }, (_, i) => i * stride);
  }
  return Array.from({ length: maxLabels }, (_, i) => Math.round((i * last) / (maxLabels - 1)));
};

export const barGeometry = (
  profit: number,
  scale: ProfitChartScale,
): { top: number; height: number } => {
  if (profit === 0) return { top: scale.zeroPct, height: 0 };

  if (profit > 0) {
    const top = scale.toPctY(profit);
    return { top, height: Math.max(scale.zeroPct - top, 0.8) };
  }

  const bottom = scale.toPctY(profit);
  return { top: scale.zeroPct, height: Math.max(bottom - scale.zeroPct, 0.8) };
};

// Inset the first/last points a few percent so edge markers and tooltips stay
// fully inside the clipped plot area instead of being cut in half at the border.
const X_PAD = 4;
export const toPctX = (index: number, count: number): number =>
  count <= 1 ? 50 : X_PAD + (index / (count - 1)) * (100 - 2 * X_PAD);

/** Same inset mapping as `toPctX`, for axes positioned by value rather than index. */
export const pctFromRatio = (ratio: number): number =>
  X_PAD + Math.max(0, Math.min(1, ratio)) * (100 - 2 * X_PAD);

export const ratioFromPct = (pct: number): number =>
  Math.max(0, Math.min(1, (pct - X_PAD) / (100 - 2 * X_PAD)));

export interface PlotXY {
  x: number;
  y: number;
}

/**
 * Monotone cubic (Fritsch–Carlson) smoothing for soft, rounded chart lines.
 *
 * Plain Catmull-Rom aims each tangent at the neighbours, so a flat run followed
 * by a jump sags *below* the flat value before climbing — the chart shows a loss
 * that never happened. Clamping the tangents keeps every segment monotone, so
 * the curve can only move in the direction the data actually moved.
 */
export const smoothLinePath = (pts: readonly PlotXY[]): string => {
  if (pts.length === 0) return '';
  if (pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  const n = pts.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    slopes.push(dx === 0 ? 0 : (pts[i + 1]!.y - pts[i]!.y) / dx);
  }

  const tangents: number[] = [slopes[0]!];
  for (let i = 1; i < n - 1; i += 1) {
    const before = slopes[i - 1]!;
    const after = slopes[i]!;
    // A turning point gets a flat tangent. Averaging across the turn tilts the
    // curve past the peak, drawing a high or low the data never reached.
    tangents.push(before * after <= 0 ? 0 : (before + after) / 2);
  }
  tangents.push(slopes[n - 2]!);

  for (let i = 0; i < n - 1; i += 1) {
    const slope = slopes[i]!;
    if (slope === 0) {
      // Flat segment: pin both ends flat, otherwise the curve bulges off a plateau.
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    // Outside this circle the segment would overshoot; scale both tangents back.
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangents[i] = ((3 / h) * a) * slope;
      tangents[i + 1] = ((3 / h) * b) * slope;
    }
  }

  const segments: string[] = [`M ${pts[0]!.x} ${pts[0]!.y}`];
  for (let i = 0; i < n - 1; i += 1) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const dx = (p2.x - p1.x) / 3;
    segments.push(
      `C ${p1.x + dx} ${p1.y + tangents[i]! * dx} ${p2.x - dx} ${p2.y - tangents[i + 1]! * dx} ${p2.x} ${p2.y}`,
    );
  }
  return segments.join(' ');
};

/**
 * Running totals move in jumps, not slopes: the value holds flat until an event,
 * then steps. Smoothing sparse events invents movement that never happened (and
 * overshoots badly when points cluster in time).
 */
export const stepLinePath = (pts: readonly PlotXY[]): string => {
  if (pts.length === 0) return '';
  const segments = [`M ${pts[0]!.x} ${pts[0]!.y}`];
  for (let i = 1; i < pts.length; i += 1) {
    segments.push(`L ${pts[i]!.x} ${pts[i - 1]!.y}`, `L ${pts[i]!.x} ${pts[i]!.y}`);
  }
  return segments.join(' ');
};

export const stepAreaPath = (pts: readonly PlotXY[], baselineY: number): string => {
  if (pts.length === 0) return '';
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${stepLinePath(pts)} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
};

/** Closed area path under a smooth line, dropped to a baseline (0–100). */
export const smoothAreaPath = (pts: readonly PlotXY[], baselineY: number): string => {
  if (pts.length === 0) return '';
  const line = smoothLinePath(pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
};

/**
 * Center every x-axis label on its tick. Edge labels are clamped a few pixels in
 * from the plot border so they stay fully visible instead of clipping.
 */
export const axisLabelAlign = (
  index: number,
  count: number,
): { style: { left: string; right?: string }; className: string } =>
  axisLabelAlignAt(toPctX(index, count));

export const axisLabelAlignAt = (
  pct: number,
): { style: { left: string; right?: string }; className: string } => ({
  style: { left: `clamp(24px, ${pct}%, calc(100% - 24px))` },
  className: '-translate-x-1/2 text-center',
});
