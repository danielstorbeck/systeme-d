import { describe, expect, it } from 'vitest';
import {
  clampView,
  FIRST_MARK,
  fitFirstMarks,
  LEFT_PADDING_PX,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  scrollToMark,
  toScreen,
  toWorld,
  zoomAt,
} from '../viewport';

describe('viewport', () => {
  it('starts the ruler at mark 1', () => {
    expect(FIRST_MARK).toBe(1);
  });

  it('converts between world and screen coordinates', () => {
    const view = { offsetX: 10, scale: 4 };
    expect(toScreen(view, 15)).toBe(20);
    expect(toWorld(view, 20)).toBe(15);
  });

  it('stops the left end at the padding', () => {
    const view = clampView({ offsetX: -1000, scale: 10 });
    expect(toScreen(view, FIRST_MARK)).toBeCloseTo(LEFT_PADDING_PX);
  });

  it('lets the ruler move arbitrarily far right', () => {
    const view = panBy({ offsetX: 0, scale: 10 }, -1e9);
    expect(view.offsetX).toBeCloseTo(1e8);
  });

  it('cannot pan past the left end', () => {
    const view = panBy({ offsetX: 0, scale: 10 }, 5000);
    expect(toScreen(view, FIRST_MARK)).toBeCloseTo(LEFT_PADDING_PX);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const view = { offsetX: 100, scale: 10 };
    const cursor = 300;
    const before = toWorld(view, cursor);
    const zoomed = zoomAt(view, cursor, 2.5);
    expect(zoomed.scale).toBe(25);
    expect(toWorld(zoomed, cursor)).toBeCloseTo(before);
  });

  it('clamps the zoom level', () => {
    expect(zoomAt({ offsetX: 0, scale: 10 }, 0, 1e6).scale).toBe(MAX_SCALE);
    expect(zoomAt({ offsetX: 0, scale: 10 }, 0, 1e-6).scale).toBe(MIN_SCALE);
  });

  it('scrolls a mark to the left end without changing the zoom', () => {
    const view = scrollToMark({ offsetX: 3.7, scale: 25 }, 1234);
    expect(view.scale).toBe(25);
    expect(toScreen(view, 1234)).toBeCloseTo(LEFT_PADDING_PX);
    expect(scrollToMark(view, FIRST_MARK).offsetX).toBeCloseTo(FIRST_MARK - LEFT_PADDING_PX / 25);
  });

  it('fits the first 10 marks into the width', () => {
    for (const width of [375, 1280, 3840]) {
      const view = fitFirstMarks(10, width);
      expect(toScreen(view, FIRST_MARK)).toBeCloseTo(LEFT_PADDING_PX);
      expect(toScreen(view, FIRST_MARK + 9)).toBeCloseTo(width - LEFT_PADDING_PX);
    }
  });
});
