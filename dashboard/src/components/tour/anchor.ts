export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  side: 'top' | 'bottom';
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Below the target when it fits, above when it does not, and never off screen —
 * a bubble pinned to a card near the bottom edge would otherwise hang past it.
 */
export const placeBubble = (
  target: Size & { top: number; left: number },
  bubble: Size,
  viewport: Size,
  gap = 12,
): Placement => {
  const below = target.top + target.height + gap;
  const above = target.top - gap - bubble.height;
  const fitsBelow = below + bubble.height <= viewport.height;
  const side: Placement['side'] = fitsBelow || above < gap ? 'bottom' : 'top';
  return {
    side,
    top: clamp(side === 'bottom' ? below : above, gap, viewport.height - bubble.height - gap),
    left: clamp(
      target.left + target.width / 2 - bubble.width / 2,
      gap,
      viewport.width - bubble.width - gap,
    ),
  };
};
