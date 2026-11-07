import { describe, expect, it } from 'vitest';
import { isFirstMarkNumbered, LABEL_GAP_PX, labelStep, markStep, MIN_MARK_GAP_PX, niceStep, visibleRange, visibleSubMarks } from '../ticks';
import { MAX_SCALE, MIN_SCALE } from '../viewport';

const scales = [MIN_SCALE, 0.037, 0.1, 0.5, 1, 3, 7.5, 20, 64, MAX_SCALE];

describe('ticks', () => {
  it('produces the nice sequence 1, 2, 5, 10, …', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(niceStep)).toEqual([1, 2, 5, 10, 20, 50, 100]);
  });

  it('never starts left of the first mark', () => {
    expect(visibleRange({ offsetX: -3, scale: 10 }, 100).first).toBe(1);
    expect(visibleRange({ offsetX: 7.5, scale: 10 }, 100)).toEqual({ first: 7, last: 18 });
  });

  it('finds the visible sub-ruler marks in both directions', () => {
    // Marks at 1 + k/2; the view shows world x from 2.2 to 4.2.
    expect(visibleSubMarks({ offsetX: 2.2, scale: 10 }, 20, 1, 0.5)).toEqual({ first: 2, last: 7 });
    // Left of the origin, k goes negative: world x from -1 to 1.
    expect(visibleSubMarks({ offsetX: -1, scale: 10 }, 20, 1, 0.5)).toEqual({ first: -4, last: 0 });
  });

  it('draws every mark when they are far enough apart', () => {
    expect(markStep(20)).toBe(1);
  });

  it('keeps drawn marks at least MIN_MARK_GAP_PX apart', () => {
    for (const scale of scales) {
      const step = markStep(scale);
      expect(step * scale).toBeGreaterThanOrEqual(MIN_MARK_GAP_PX);
    }
  });

  it('picks label steps that are multiples of the mark step and leave room for the labels', () => {
    for (const scale of scales) {
      for (const labelWidth of [7, 30, 70]) {
        const drawn = markStep(scale);
        const numbered = labelStep(scale, drawn, labelWidth);
        expect(numbered % drawn).toBe(0);
        expect(numbered * scale).toBeGreaterThanOrEqual(labelWidth + LABEL_GAP_PX);
      }
    }
  });

  it('numbers the first mark only when its number fits before the next one', () => {
    expect(isFirstMarkNumbered(20, 1, 7)).toBe(true);
    expect(isFirstMarkNumbered(20, 2, 30)).toBe(false); // 1 and 2 are only 20px apart
    expect(isFirstMarkNumbered(20, 5, 70)).toBe(true); // 1 and 5 are 80px apart
  });

  it('numbers fewer marks as labels get wider', () => {
    expect(labelStep(20, 1, 7)).toBe(1);
    expect(labelStep(20, 1, 30)).toBe(2);
    expect(labelStep(20, 1, 70)).toBe(5);
  });
});
