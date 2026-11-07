import type { Lane } from './lanes';
import { isBinaryRuler, type OrderedRuler } from './rulers';
import { FIRST_MARK } from './viewport';

/**
 * Lane segmentation: with segmentation shown, every lane has an upper part holding vertical lines that divide
 * the lane into segments. A line sits at a world x on a mark of a binary sub-ruler (see isBinaryRuler).
 */

/** Two lines closer than this (in world units) are the same line. */
const SAME_LINE = 1e-9;

/**
 * The mark nearest x among the marks of all binary sub-rulers, never left of the lanes' start;
 * undefined if there is no binary sub-ruler.
 */
export function snapToBinaryMarks(rulers: OrderedRuler[], x: number): number | undefined {
  let best: number | undefined;
  for (const ruler of rulers) {
    if (!isBinaryRuler(ruler)) continue;
    const { origin, interval } = ruler;
    let k = Math.round((x - origin) / interval);
    // Lanes start at the main ruler's first mark; a line left of it would be outside the lane.
    if (origin + k * interval < FIRST_MARK - SAME_LINE) k = Math.ceil((FIRST_MARK - SAME_LINE - origin) / interval);
    const mark = origin + k * interval;
    if (best === undefined || Math.abs(mark - x) < Math.abs(best - x)) best = mark;
  }
  return best;
}

/** The line of the lane nearest x and at most tolerance away from it, or undefined if there is none. */
export function segmentLineAt(lane: Lane, x: number, tolerance: number): number | undefined {
  let best: number | undefined;
  for (const line of lane.segments) {
    const distance = Math.abs(line - x);
    if (distance <= tolerance && (best === undefined || distance < Math.abs(best - x))) best = line;
  }
  return best;
}

/** Adds a line to the lane, keeping its lines in order; unchanged if the line is already there. */
export function addSegmentLine(lanes: Lane[], laneId: number, x: number): Lane[] {
  return lanes.map((lane) => {
    if (lane.id !== laneId || lane.segments.some((line) => Math.abs(line - x) < SAME_LINE)) return lane;
    return { ...lane, segments: [...lane.segments, x].sort((a, b) => a - b) };
  });
}

/** Takes the line at x out of the lane; unchanged if there is no such line. */
export function removeSegmentLine(lanes: Lane[], laneId: number, x: number): Lane[] {
  return lanes.map((lane) => {
    if (lane.id !== laneId) return lane;
    const segments = lane.segments.filter((line) => Math.abs(line - x) >= SAME_LINE);
    return segments.length === lane.segments.length ? lane : { ...lane, segments };
  });
}

export function isSegments(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** Largest denominator tried when writing a segment's length as a fraction. */
const MAX_DENOMINATOR = 4096;

/**
 * The length of the segment from line a to line b in main-ruler intervals, as a fraction k/m in lowest terms.
 * Lines on marks of binary sub-rulers always give a power of two for m; other denominators can only come from
 * lines set before their ruler was shifted off the main ruler's marks. Undefined if no fraction with a
 * denominator up to MAX_DENOMINATOR fits.
 */
export function segmentLength(a: number, b: number): { k: number; m: number } | undefined {
  const length = Math.abs(b - a);
  // The first denominator that fits gives the fraction in lowest terms.
  for (let m = 1; m <= MAX_DENOMINATOR; m++) {
    const k = Math.round(length * m);
    if (Math.abs(length * m - k) < 1e-6 * m) return { k, m };
  }
  return undefined;
}

/** "k/m", e.g. "3/8" or "2/1"; the length rounded to two decimals if it is no such fraction. */
export function formatSegmentLength(a: number, b: number): string {
  const fraction = segmentLength(a, b);
  return fraction ? `${fraction.k}/${fraction.m}` : String(Math.round(Math.abs(b - a) * 100) / 100);
}
