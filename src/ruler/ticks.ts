import { FIRST_MARK, type View } from './viewport';

/** Marks closer than this are thinned out so the ruler doesn't turn into a smear. */
export const MIN_MARK_GAP_PX = 5;
/** Minimum free space between two neighbouring numbers. */
export const LABEL_GAP_PX = 10;

const MANTISSAS = [1, 2, 5];

/** The k-th element of the sequence 1, 2, 5, 10, 20, 50, 100, … */
export function niceStep(k: number): number {
  return MANTISSAS[k % 3] * 10 ** Math.floor(k / 3);
}

/** Indices of the first and last mark that may be (partly) visible, extended by marginPx on both sides. */
export function visibleRange(view: View, widthPx: number, marginPx = 0): { first: number; last: number } {
  const first = Math.max(FIRST_MARK, Math.floor(view.offsetX - marginPx / view.scale));
  const last = Math.max(FIRST_MARK, Math.ceil(view.offsetX + (widthPx + marginPx) / view.scale));
  return { first, last };
}

/**
 * Indices k of the sub-ruler marks (at world x = origin + k * interval) that may be visible.
 * Sub-rulers are unbounded in both directions, so k can be negative.
 */
export function visibleSubMarks(
  view: View,
  widthPx: number,
  origin: number,
  interval: number,
  marginPx = 0,
): { first: number; last: number } {
  const left = view.offsetX - marginPx / view.scale - origin;
  const right = view.offsetX + (widthPx + marginPx) / view.scale - origin;
  return { first: Math.floor(left / interval), last: Math.ceil(right / interval) };
}

/** Every markStep-th mark is drawn: the smallest nice step whose marks are at least MIN_MARK_GAP_PX apart. */
export function markStep(scale: number): number {
  for (let k = 0; ; k++) {
    const step = niceStep(k);
    if (step * scale >= MIN_MARK_GAP_PX) return step;
  }
}

/**
 * Every labelStep-th mark carries a number: the smallest nice step that is a multiple of markStep
 * (so numbered marks are always drawn) and leaves room for labels of width labelWidthPx.
 */
export function labelStep(scale: number, drawnStep: number, labelWidthPx: number): number {
  for (let k = 0; ; k++) {
    const step = niceStep(k);
    if (step % drawnStep === 0 && step * scale >= labelWidthPx + LABEL_GAP_PX) return step;
  }
}

/**
 * Numbered marks are the multiples of numberedStep. The first mark (the ruler's end) is numbered
 * too, as long as its number doesn't collide with the next numbered mark.
 */
export function isFirstMarkNumbered(scale: number, numberedStep: number, labelWidthPx: number): boolean {
  if (FIRST_MARK % numberedStep === 0) return true;
  const nextNumbered = Math.ceil(FIRST_MARK / numberedStep) * numberedStep;
  return (nextNumbered - FIRST_MARK) * scale >= labelWidthPx + LABEL_GAP_PX;
}
