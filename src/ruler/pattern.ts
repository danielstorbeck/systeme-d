import type { RulerChain, PooledChain } from './chains';
import type { Block, Direction } from './lanes';

/**
 * Pattern mode: a set of rectangles of some lanes is chosen between the borders, and copied as a pattern that no
 * longer depends on the lanes and rectangles it came from.
 */

/** The part of the lanes that pattern mode chooses from. */
export interface PatternRange {
  start: number;
  end: number;
}

/** Tolerance for comparing world x. */
const EPSILON = 1e-9;

/**
 * The borders' interval; without borders, as if they were set left of the leftmost and right of the rightmost
 * rectangle. Undefined if there are neither borders nor rectangles.
 */
export function patternRange(borders: { left: number; right: number } | null, blocks: Block[]): PatternRange | undefined {
  if (borders) return { start: borders.left, end: borders.right };
  if (blocks.length === 0) return undefined;
  return { start: Math.min(...blocks.map((b) => b.start)), end: Math.max(...blocks.map((b) => b.end)) };
}

/** Whether a rectangle lies wholly between the borders; one reaching over a border can't be chosen. */
export function inRange(block: Block, range: PatternRange): boolean {
  return block.start >= range.start - EPSILON && block.end <= range.end + EPSILON;
}

/** The rectangles pattern mode can choose: between the borders, on one of the lanes. */
export function patternCandidates(blocks: Block[], laneIds: number[], range: PatternRange | undefined): Block[] {
  if (!range) return [];
  return blocks.filter((b) => laneIds.includes(b.laneId) && inRange(b, range));
}

/** The select cursor: on a lane, on one of its rectangles if it has any to choose; x is where it is along the lane. */
export interface PatternCursor {
  laneId: number;
  blockId: number | null;
  x: number;
}

const centre = (b: Block) => (b.start + b.end) / 2;

/** The cursor on a rectangle. */
export const cursorOn = (block: Block): PatternCursor => ({ laneId: block.laneId, blockId: block.id, x: centre(block) });

/**
 * Where the cursor starts: on the given rectangle if it can be chosen, else on the leftmost one of the topmost
 * lane that has any, else on the top lane without a rectangle.
 */
export function startCursor(
  candidates: Block[],
  laneIds: number[],
  preferredId: number | null,
  x: number,
): PatternCursor | undefined {
  const preferred = candidates.find((b) => b.id === preferredId);
  if (preferred) return cursorOn(preferred);
  for (const laneId of laneIds) {
    const first = candidates.filter((b) => b.laneId === laneId).sort((a, b) => a.start - b.start)[0];
    if (first) return cursorOn(first);
  }
  return laneIds.length > 0 ? { laneId: laneIds[0], blockId: null, x } : undefined;
}

/**
 * The cursor moved: left and right to the neighbouring rectangle on its lane that can be chosen, up and down to the
 * lane above or below, onto its rectangle nearest the cursor's place, or onto no rectangle if it has none to choose.
 * Up and down keep the cursor's place, so that going through an empty lane comes back to the same column.
 * Unchanged where there is nothing in that direction. `laneIds` lists the lanes top to bottom.
 */
export function moveCursor(candidates: Block[], laneIds: number[], cursor: PatternCursor, direction: Direction): PatternCursor {
  if (direction === 'left' || direction === 'right') {
    const sameLane = candidates.filter((b) => b.laneId === cursor.laneId && b.id !== cursor.blockId);
    const from = candidates.find((b) => b.id === cursor.blockId);
    const x = from ? centre(from) : cursor.x;
    const ahead = sameLane.filter((b) => (direction === 'left' ? centre(b) < x : centre(b) > x));
    if (ahead.length === 0) return cursor;
    const next = ahead.reduce((best, b) => (Math.abs(centre(b) - x) < Math.abs(centre(best) - x) ? b : best));
    return cursorOn(next);
  }
  const i = laneIds.indexOf(cursor.laneId);
  const laneId = i < 0 ? laneIds[0] : laneIds[i + (direction === 'down' ? 1 : -1)];
  if (laneId === undefined) return cursor;
  const onLane = candidates.filter((b) => b.laneId === laneId);
  if (onLane.length === 0) return { laneId, blockId: null, x: cursor.x };
  const nearest = onLane.reduce((best, b) => (Math.abs(centre(b) - cursor.x) < Math.abs(centre(best) - cursor.x) ? b : best));
  return { laneId, blockId: nearest.id, x: cursor.x };
}

/**
 * Chooses a group of rectangles, or unchooses it if all of them are chosen already: a for all rectangles between
 * the borders, s for those on the cursor's lane, d for the one under the cursor. Without rectangles, unchanged.
 */
export function toggleGroup(selection: ReadonlySet<number>, ids: number[]): Set<number> {
  const next = new Set(selection);
  if (ids.length === 0) return next;
  const all = ids.every((id) => selection.has(id));
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}

/** A rectangle of a pattern, relative to the pattern: its lane counted from the pattern's top lane, its edges from its start. */
export interface PatternRectangle {
  lane: number;
  start: number;
  end: number;
  pitch: number;
  text: string;
  chord: number[];
  /** The ruler it was drawn with, as it was when the pattern was copied. */
  chain: RulerChain;
}

/**
 * A copied pattern: as wide as between the borders, as many lanes high as from its top to its bottom rectangle;
 * topLane is the index of its top lane when it was copied.
 */
export interface Pattern {
  width: number;
  lanes: number;
  topLane: number;
  rectangles: PatternRectangle[];
}

/**
 * The pattern of the chosen rectangles between the borders, copied so that it stays as it is whatever happens to the
 * lanes, rectangles and rulers afterwards. Undefined if no rectangle is chosen. `laneIds` lists the lanes top to bottom.
 */
export function copyPattern(
  candidates: Block[],
  selection: ReadonlySet<number>,
  laneIds: number[],
  chains: PooledChain[],
  range: PatternRange,
): Pattern | undefined {
  const chosen = candidates
    .filter((b) => selection.has(b.id))
    .map((block) => ({ block, lane: laneIds.indexOf(block.laneId), pooled: chains.find((c) => c.id === block.chainId) }))
    .filter(({ lane, pooled }) => lane >= 0 && pooled);
  if (chosen.length === 0) return undefined;
  const top = Math.min(...chosen.map(({ lane }) => lane));
  const bottom = Math.max(...chosen.map(({ lane }) => lane));
  const rectangles = chosen
    .map(({ block, lane, pooled }) => ({
      lane: lane - top,
      start: block.start - range.start,
      end: block.end - range.start,
      pitch: block.pitch,
      text: block.text,
      chord: [...block.chord],
      chain: structuredClone(pooled!.chain),
    }))
    .sort((a, b) => a.lane - b.lane || a.start - b.start);
  return { width: range.end - range.start, lanes: bottom - top + 1, topLane: top, rectangles };
}

/** Where a pattern would be pasted: the index of the top lane it covers, and the world x of its left edge. */
export interface PasteCursor {
  top: number;
  x: number;
}

/** The highest top lane index the pattern can be pasted at with this many lanes; negative if it doesn't fit. */
const lastTop = (pattern: Pattern, laneCount: number) => laneCount - pattern.lanes;

/**
 * The paste cursor as it appears: at x (right of the right border), on the lanes the pattern was copied from, or
 * as near to them as the lanes allow. Undefined if there are fewer lanes than the pattern is high.
 */
export function startPasteCursor(pattern: Pattern, laneCount: number, x: number): PasteCursor | undefined {
  if (lastTop(pattern, laneCount) < 0) return undefined;
  return { top: Math.min(pattern.topLane, lastTop(pattern, laneCount)), x };
}

/** The paste cursor moved this many lanes down (positive) or up, as far as the lanes go. */
export function shiftPasteCursor(cursor: PasteCursor, pattern: Pattern, laneCount: number, offset: number): PasteCursor {
  const top = Math.max(0, Math.min(lastTop(pattern, laneCount), cursor.top + offset));
  return { ...cursor, top };
}

/** The lanes the paste cursor covers, top to bottom; undefined if they aren't all there any more. */
export function pasteLanes(pattern: Pattern, laneIds: number[], cursor: PasteCursor): number[] | undefined {
  if (cursor.top < 0 || cursor.top + pattern.lanes > laneIds.length) return undefined;
  return laneIds.slice(cursor.top, cursor.top + pattern.lanes);
}

/** Whether the space under the paste cursor is empty: no rectangle on any of its lanes overlaps it. */
export function pasteSpaceFree(blocks: Block[], pattern: Pattern, laneIds: number[], cursor: PasteCursor): boolean {
  const lanes = pasteLanes(pattern, laneIds, cursor);
  if (!lanes) return false;
  const tolerance = Math.max(pattern.width, 1) * 1e-6;
  const end = cursor.x + pattern.width;
  return !blocks.some((b) => lanes.includes(b.laneId) && b.start < end - tolerance && b.end > cursor.x + tolerance);
}

/** The rectangles of the pattern pasted at the cursor, each on its lane at its place. */
export function pastedRectangles(pattern: Pattern, laneIds: number[], cursor: PasteCursor) {
  const lanes = pasteLanes(pattern, laneIds, cursor) ?? [];
  return pattern.rectangles.flatMap((r) =>
    lanes[r.lane] === undefined ? [] : [{ ...r, laneId: lanes[r.lane], start: cursor.x + r.start, end: cursor.x + r.end }],
  );
}
