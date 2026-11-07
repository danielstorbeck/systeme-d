import { describe, expect, it } from 'vitest';
import { moveBorder, placeBorders, resolveBorders, type Borders, type PlacedRuler } from '../borders';

/** Ruler 1 with marks at 1.5, 2, 2.5, … and ruler 2 with marks at whole numbers. */
const half: PlacedRuler = { node: { id: 1 }, origin: 1.5, interval: 0.5 };
const whole: PlacedRuler = { node: { id: 2 }, origin: 0, interval: 1 };

const xs = (borders: Borders) => [borders.left.x, borders.right.x];

describe('borders', () => {
  it('start on the leftmost mark in view and the mark nearest the middle', () => {
    // The view shows world x 1.2 to 6.2: the leftmost mark is 1.5, the middle 3.7 is nearest 3.5.
    const borders = placeBorders(half, { offsetX: 1.2, scale: 100 }, 500);
    expect(borders.left).toEqual({ rulerId: 1, mark: 0, x: 1.5 });
    expect(borders.right).toEqual({ rulerId: 1, mark: 4, x: 3.5 });
  });

  it('keep at least one mark between them when they start', () => {
    const coarse: PlacedRuler = { node: { id: 3 }, origin: 0, interval: 10 };
    expect(xs(placeBorders(coarse, { offsetX: 0.5, scale: 1 }, 20))).toEqual([10, 20]);
  });

  it('move one mark at a time, but never onto or past each other', () => {
    const borders = placeBorders(half, { offsetX: 1.2, scale: 100 }, 500); // 1.5 and 3.5
    expect(xs(moveBorder(borders, half, 'left', 1))).toEqual([2, 3.5]);
    expect(xs(moveBorder(borders, half, 'right', 1))).toEqual([1.5, 4]);
    const close = { left: { rulerId: 1, mark: 2, x: 2.5 }, right: { rulerId: 1, mark: 3, x: 3 } };
    expect(moveBorder(close, half, 'left', 1)).toBe(close);
    expect(moveBorder(close, half, 'right', -1)).toBe(close);
  });

  it('stay on the ruler they were moved on until one of them is moved on another ruler', () => {
    const borders = { left: { rulerId: 1, mark: 1, x: 2 }, right: { rulerId: 1, mark: 4, x: 3.5 } };
    // Selecting the whole-number ruler and moving the right border only: the left one stays on ruler 1.
    const moved = moveBorder(borders, whole, 'right', 1);
    expect(moved.left).toBe(borders.left);
    expect(moved.right).toEqual({ rulerId: 2, mark: 4, x: 4 });
    // From 3.5, between two marks of the whole-number ruler, a step left goes to 3.
    expect(moveBorder(borders, whole, 'right', -1).right.x).toBe(3);
  });

  it('follow the marks they sit on, and stay put when their ruler is gone', () => {
    const borders = { left: { rulerId: 1, mark: 1, x: 2 }, right: { rulerId: 2, mark: 4, x: 4 } };
    const shifted = { ...half, origin: 1.75 };
    expect(xs(resolveBorders(borders, [shifted, whole]))).toEqual([2.25, 4]);
    expect(xs(resolveBorders(borders, [whole]))).toEqual([2, 4]);
  });
});
