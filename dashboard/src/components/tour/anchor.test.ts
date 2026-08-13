import { describe, expect, it } from 'vitest';
import { placeBubble } from '@/components/tour/anchor';

const viewport = { width: 1000, height: 800 };
const bubble = { width: 320, height: 160 };

describe('placeBubble', () => {
  it('sits under the target and centres on it when there is room', () => {
    const placement = placeBubble({ top: 100, left: 400, width: 200, height: 60 }, bubble, viewport);
    expect(placement.side).toBe('bottom');
    expect(placement.top).toBe(172);
    expect(placement.left).toBe(340);
  });

  it('flips above a target sitting at the bottom edge', () => {
    const placement = placeBubble({ top: 700, left: 400, width: 200, height: 60 }, bubble, viewport);
    expect(placement.side).toBe('top');
    expect(placement.top).toBe(528);
  });

  it('stays on screen for a target hard against the right edge', () => {
    const placement = placeBubble({ top: 100, left: 960, width: 40, height: 40 }, bubble, viewport);
    expect(placement.left).toBe(668);
  });

  it('stays on screen for a target hard against the left edge', () => {
    const placement = placeBubble({ top: 100, left: 0, width: 40, height: 40 }, bubble, viewport);
    expect(placement.left).toBe(12);
  });

  it('keeps a bubble taller than the viewport at the top gap', () => {
    const tall = { width: 320, height: 900 };
    const placement = placeBubble({ top: 400, left: 400, width: 200, height: 60 }, tall, viewport);
    expect(placement.top).toBe(12);
  });
});
