import { isFirstMarkNumbered, labelStep, markStep, visibleRange, visibleSubMarks } from './ticks';
import { mod } from './rulers';
import { FIRST_MARK, toScreen, type View } from './viewport';

/** Marks rise from the baseline; the main ruler's numbers sit above them. */
const SHORT_MARK_PX = 6;
const LONG_MARK_PX = 14;
const SUB_MARK_PX = 10;
/** Sub-ruler marks that close a group of m intervals (matching n intervals of the parent). */
const SUB_GROUP_MARK_PX = 16;
const LABEL_FONT = '12px system-ui, sans-serif';
/** Extra space left and right of the canvas so labels of marks just off-screen are still drawn. */
const OVERDRAW_PX = 80;

const digitWidthCache = new Map<string, number>();

/** Width of the widest digit in the label font; n digits never need more than n times this. */
function widestDigitWidth(ctx: CanvasRenderingContext2D): number {
  let width = digitWidthCache.get(LABEL_FONT);
  if (width === undefined) {
    ctx.font = LABEL_FONT;
    width = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width));
    digitWidthCache.set(LABEL_FONT, width);
  }
  return width;
}

function drawBaseline(ctx: CanvasRenderingContext2D, startX: number, width: number, baselineY: number): void {
  const y = baselineY + 0.5;
  ctx.moveTo(Math.max(0, startX), y);
  ctx.lineTo(width, y);
}

/**
 * Draws the numbered main ruler in CSS pixels, x measured from the left edge of the ruler area.
 * The caller sets stroke and fill styles.
 */
export function drawMainRuler(
  ctx: CanvasRenderingContext2D,
  view: View,
  width: number,
  baselineY: number,
): void {
  const { first, last } = visibleRange(view, width, OVERDRAW_PX);
  const drawnStep = markStep(view.scale);
  const labelWidth = widestDigitWidth(ctx) * String(last).length;
  const numberedStep = labelStep(view.scale, drawnStep, labelWidth);
  const firstNumbered = isFirstMarkNumbered(view.scale, numberedStep, labelWidth);
  const isNumbered = (i: number) => i % numberedStep === 0 || (i === FIRST_MARK && firstNumbered);

  const markX = (i: number) => Math.round(toScreen(view, i)) + 0.5;
  const drawMark = (i: number) => {
    const x = markX(i);
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY - (isNumbered(i) ? LONG_MARK_PX : SHORT_MARK_PX));
  };

  ctx.beginPath();
  // Baseline starts at the first mark: the ruler's left end.
  drawBaseline(ctx, markX(FIRST_MARK) - 0.5, width, baselineY);
  // The end mark is always drawn, even when zoomed out far enough to skip its neighbours.
  if (first === FIRST_MARK) drawMark(FIRST_MARK);
  for (let i = Math.ceil(first / drawnStep) * drawnStep; i <= last; i += drawnStep) {
    if (i !== FIRST_MARK) drawMark(i);
  }
  ctx.stroke();

  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const labelY = baselineY - LONG_MARK_PX - 4;
  if (first === FIRST_MARK && firstNumbered) {
    ctx.fillText(String(FIRST_MARK), toScreen(view, FIRST_MARK), labelY);
  }
  for (let i = Math.ceil(first / numberedStep) * numberedStep; i <= last; i += numberedStep) {
    if (i !== FIRST_MARK) ctx.fillText(String(i), toScreen(view, i), labelY);
  }
}

/**
 * Draws a lane: a rectangle whose left border sits at the main ruler's first mark and which stays open to
 * the right. The caller sets stroke and fill styles.
 */
export function drawLane(ctx: CanvasRenderingContext2D, view: View, width: number, top: number, height: number): void {
  const left = Math.round(toScreen(view, FIRST_MARK)) + 0.5;
  const from = Math.max(-1, left);
  const bottom = top + height - 0.5;
  ctx.fillRect(from, top, width - from, height);
  ctx.beginPath();
  ctx.moveTo(width, top + 0.5);
  ctx.lineTo(from, top + 0.5);
  if (left >= 0) ctx.lineTo(left, bottom);
  else ctx.moveTo(from, bottom);
  ctx.lineTo(width, bottom);
  ctx.stroke();
}

/** Space between a block and the lane's top and bottom edges. */
const BLOCK_INSET_PX = 4;

const BLOCK_FONT = '11px system-ui, sans-serif';
const BLOCK_TEXT_PADDING_PX = 4;

/**
 * Draws a block spanning world x from start to end inside a lane, with its label inside when it fits.
 * The caller sets stroke and fill styles; the label uses textColor.
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  view: View,
  laneTop: number,
  laneHeight: number,
  start: number,
  end: number,
  label: string,
  textColor: string,
): void {
  const left = Math.round(toScreen(view, start)) + 0.5;
  const right = Math.round(toScreen(view, end)) - 0.5;
  const top = laneTop + BLOCK_INSET_PX + 0.5;
  const height = laneHeight - 2 * BLOCK_INSET_PX - 1;
  const width = Math.max(0, right - left);
  ctx.fillRect(left, top, width, height);
  ctx.strokeRect(left, top, width, height);

  ctx.font = BLOCK_FONT;
  if (ctx.measureText(label).width + 2 * BLOCK_TEXT_PADDING_PX > width) return;
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + width / 2, top + height / 2);
  ctx.restore();
}

export interface SubRulerGeometry {
  baselineY: number;
  /** World x of mark k = 0; mark k sits at origin + k * interval. */
  origin: number;
  interval: number;
  /** The m of the m:n ratio: every m-th mark, starting at groupPhase, is drawn longer. */
  groupSize: number;
  groupPhase: number;
}

/** Draws an unnumbered sub-ruler. Sub-rulers have no end: they run across the whole width. */
export function drawSubRuler(
  ctx: CanvasRenderingContext2D,
  view: View,
  width: number,
  { baselineY, origin, interval, groupSize, groupPhase }: SubRulerGeometry,
): void {
  const { first, last } = visibleSubMarks(view, width, origin, interval, OVERDRAW_PX);
  const drawnStep = markStep(view.scale * interval);
  const isGroupMark = (k: number) => groupSize > 1 && mod(k - groupPhase, groupSize) === 0;

  const drawMark = (k: number) => {
    const x = Math.round(toScreen(view, origin + k * interval)) + 0.5;
    ctx.moveTo(x, baselineY);
    ctx.lineTo(x, baselineY - (isGroupMark(k) ? SUB_GROUP_MARK_PX : SUB_MARK_PX));
  };

  ctx.beginPath();
  drawBaseline(ctx, 0, width, baselineY);
  for (let k = Math.ceil(first / drawnStep) * drawnStep; k <= last; k += drawnStep) drawMark(k);
  // Group marks survive thinning: when zoomed out, they are thinned on their own, independently of the others.
  if (groupSize > 1) {
    const groupStep = groupSize * markStep(view.scale * interval * groupSize);
    const start = groupPhase + Math.ceil((first - groupPhase) / groupStep) * groupStep;
    for (let k = start; k <= last; k += groupStep) {
      if (mod(k, drawnStep) !== 0) drawMark(k);
    }
  }
  ctx.stroke();
}
