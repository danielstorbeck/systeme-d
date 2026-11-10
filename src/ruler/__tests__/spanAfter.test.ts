import { describe, expect, it } from 'vitest';
import { blockBefore, isFree, neighbourMark, spanAfter, type Block } from '../lanes';

describe('next mode cursor', () => {
  it('starts at the green line and is as long as the typed intervals of the selected ruler from a mark', () => {
    expect(spanAfter(2.5, { origin: 1, interval: 0.25 }, 3)).toEqual({ start: 2.5, end: 3.25 });
  });

  it('ends on a mark of the selected ruler when the line is between its marks', () => {
    const grid = { origin: 1, interval: 0.5 };
    expect(spanAfter(1.2, grid, 1)).toEqual({ start: 1.2, end: 1.5 });
    expect(spanAfter(1.2, grid, 3)).toEqual({ start: 1.2, end: 2.5 });
    // Third-intervals don't land exactly on the marks of a binary ruler, but a line on a mark stays on it.
    const thirds = { origin: 1, interval: 1 / 3 };
    expect(spanAfter(1 + 3 * (1 / 3), thirds, 1).end).toBeCloseTo(2 + 1 / 3);
  });

  it('is free right after the block it starts from', () => {
    const block = { id: 1, laneId: 1, start: 1, end: 2 } as Block;
    expect(isFree([block], 1, spanAfter(2, { origin: 1, interval: 0.5 }, 2))).toBe(true);
    expect(isFree([block, { ...block, id: 2, start: 2.5, end: 3 }], 1, spanAfter(2, { origin: 1, interval: 0.5 }, 2))).toBe(false);
  });
});

describe('next mode line', () => {
  const grid = { origin: 1, interval: 0.5 };

  it('moves to the previous or next mark of the selected ruler', () => {
    expect(neighbourMark(grid, 2, 1)).toBe(2.5);
    expect(neighbourMark(grid, 2, -1)).toBe(1.5);
    expect(neighbourMark(grid, 1.2, 1)).toBe(1.5);
    expect(neighbourMark(grid, 1.2, -1)).toBe(1);
  });

  it('stops at the start of the lanes', () => {
    expect(neighbourMark(grid, 1, -1)).toBeUndefined();
  });

  it('takes its content from the rectangle before it on the lane', () => {
    const a = { id: 1, laneId: 1, start: 1, end: 2 } as Block;
    const b = { id: 2, laneId: 1, start: 2, end: 3 } as Block;
    const other = { id: 3, laneId: 2, start: 3, end: 4 } as Block;
    expect(blockBefore([b, a, other], 1, 3.5)).toBe(b);
    expect(blockBefore([b, a, other], 1, 2.5)).toBe(a);
    expect(blockBefore([b, a, other], 1, 1)).toBeUndefined();
  });
});
