import { describe, expect, it } from 'vitest';
import type { PooledChain } from '../chains';
import type { Block } from '../lanes';
import {
  copyPattern,
  inRange,
  moveCursor,
  pasteLanes,
  pasteSpaceFree,
  pastedRectangles,
  patternCandidates,
  patternRange,
  shiftPasteCursor,
  startCursor,
  startPasteCursor,
  toggleGroup,
} from '../pattern';

const block = (id: number, laneId: number, start: number, end: number): Block => ({
  id,
  laneId,
  start,
  end,
  chainId: 1,
  pitch: 60 + id,
  text: 'a',
  chord: [],
});

const lanes = [10, 20, 30];
const blocks = [block(1, 10, 1, 2), block(2, 10, 2, 4), block(3, 20, 1.5, 3), block(4, 30, 5, 6)];

describe('patternRange', () => {
  it('is the borders when they are set', () => {
    expect(patternRange({ left: 2, right: 5 }, blocks)).toEqual({ start: 2, end: 5 });
  });
  it('spans all rectangles without borders', () => {
    expect(patternRange(null, blocks)).toEqual({ start: 1, end: 6 });
    expect(patternRange(null, [])).toBeUndefined();
  });
});

describe('patternCandidates', () => {
  it('takes only rectangles wholly between the borders', () => {
    const range = { start: 1.5, end: 4 };
    expect(inRange(blocks[0], range)).toBe(false);
    expect(patternCandidates(blocks, lanes, range).map((b) => b.id)).toEqual([2, 3]);
  });
  it('takes all rectangles without borders', () => {
    expect(patternCandidates(blocks, lanes, patternRange(null, blocks))).toHaveLength(4);
  });
});

describe('select cursor', () => {
  it('starts on the preferred rectangle, else the leftmost of the topmost lane with one', () => {
    expect(startCursor(blocks, lanes, 3, 0)).toMatchObject({ laneId: 20, blockId: 3 });
    expect(startCursor(blocks, lanes, 99, 0)).toMatchObject({ laneId: 10, blockId: 1 });
    expect(startCursor([], lanes, null, 7)).toEqual({ laneId: 10, blockId: null, x: 7 });
    expect(startCursor([], [], null, 7)).toBeUndefined();
  });

  it('moves left and right on its lane, and stops at the ends', () => {
    const cursor = startCursor(blocks, lanes, 1, 0)!;
    const right = moveCursor(blocks, lanes, cursor, 'right');
    expect(right.blockId).toBe(2);
    expect(moveCursor(blocks, lanes, right, 'right')).toBe(right);
    expect(moveCursor(blocks, lanes, right, 'left').blockId).toBe(1);
  });

  it('moves to the nearest rectangle on the lane below, through lanes without any, keeping its place', () => {
    const candidates = patternCandidates(blocks, lanes, { start: 1, end: 4 });
    const cursor = startCursor(candidates, lanes, 2, 0)!;
    const down = moveCursor(candidates, lanes, cursor, 'down');
    expect(down).toEqual({ laneId: 20, blockId: 3, x: 3 });
    const empty = moveCursor(candidates, lanes, down, 'down');
    expect(empty).toEqual({ laneId: 30, blockId: null, x: 3 });
    expect(moveCursor(candidates, lanes, empty, 'down')).toBe(empty);
    expect(moveCursor(candidates, lanes, moveCursor(candidates, lanes, empty, 'up'), 'up').blockId).toBe(2);
  });
});

describe('toggleGroup', () => {
  it('chooses the group unless all of it is chosen, then unchooses it', () => {
    const some = toggleGroup(new Set([1]), [1, 2]);
    expect([...some].sort()).toEqual([1, 2]);
    expect([...toggleGroup(some, [1, 2])]).toEqual([]);
    expect([...toggleGroup(new Set([5]), [1])].sort()).toEqual([1, 5]);
    expect([...toggleGroup(new Set([5]), [])]).toEqual([5]);
  });
});

describe('copyPattern', () => {
  const chains: PooledChain[] = [{ id: 1, chain: [{ m: 2, n: 1, offset: 0 }] as never }];

  it('copies the chosen rectangles relative to the borders and the top chosen lane', () => {
    const range = { start: 1, end: 7 };
    const pattern = copyPattern(blocks, new Set([3, 4]), lanes, chains, range)!;
    expect(pattern.width).toBe(6);
    expect(pattern.lanes).toBe(2);
    expect(pattern.topLane).toBe(1);
    expect(pattern.rectangles.map(({ lane, start, end, pitch }) => ({ lane, start, end, pitch }))).toEqual([
      { lane: 0, start: 0.5, end: 2, pitch: 63 },
      { lane: 1, start: 4, end: 5, pitch: 64 },
    ]);
  });

  it('stays as it was when the rectangles and chains change afterwards', () => {
    const source = [block(1, 10, 1, 2)];
    const pooled: PooledChain[] = [{ id: 1, chain: [{ m: 2, n: 1, offset: 0 }] as never }];
    const pattern = copyPattern(source, new Set([1]), lanes, pooled, { start: 0, end: 4 })!;
    source[0].chord.push(4);
    (pooled[0].chain as unknown as { m: number }[])[0].m = 3;
    expect(pattern.rectangles[0].chord).toEqual([]);
    expect((pattern.rectangles[0].chain as unknown as { m: number }[])[0].m).toBe(2);
  });

  it('is undefined with nothing chosen', () => {
    expect(copyPattern(blocks, new Set(), lanes, chains, { start: 0, end: 9 })).toBeUndefined();
  });
});

describe('paste cursor', () => {
  const pattern = {
    width: 2,
    lanes: 2,
    topLane: 1,
    rectangles: [
      { lane: 0, start: 0, end: 1, pitch: 60, text: 'a', chord: [], chain: [] },
      { lane: 1, start: 1, end: 2, pitch: 62, text: 'a', chord: [], chain: [] },
    ],
  };
  const laneIds = [10, 20, 30, 40];

  it('appears on the lanes the pattern came from, as near as the lanes allow', () => {
    expect(startPasteCursor(pattern, 4, 5)).toEqual({ top: 1, x: 5 });
    expect(startPasteCursor({ ...pattern, topLane: 3 }, 4, 5)).toEqual({ top: 2, x: 5 });
    expect(startPasteCursor(pattern, 1, 5)).toBeUndefined();
  });

  it('moves up and down as far as the pattern fits on the lanes', () => {
    const cursor = { top: 1, x: 5 };
    expect(shiftPasteCursor(cursor, pattern, 4, 1)).toEqual({ top: 2, x: 5 });
    expect(shiftPasteCursor({ top: 2, x: 5 }, pattern, 4, 1)).toEqual({ top: 2, x: 5 });
    expect(shiftPasteCursor({ top: 0, x: 5 }, pattern, 4, -1)).toEqual({ top: 0, x: 5 });
    expect(shiftPasteCursor(cursor, pattern, 2, 0)).toEqual({ top: 0, x: 5 });
  });

  it('is free only if no rectangle overlaps the space on any of its lanes', () => {
    const cursor = { top: 1, x: 5 };
    expect(pasteLanes(pattern, laneIds, cursor)).toEqual([20, 30]);
    expect(pasteSpaceFree([block(1, 20, 3, 5), block(2, 30, 7, 8), block(3, 10, 5, 7)], pattern, laneIds, cursor)).toBe(true);
    expect(pasteSpaceFree([block(1, 30, 6.5, 7.5)], pattern, laneIds, cursor)).toBe(false);
    expect(pasteSpaceFree([], pattern, laneIds, { top: 3, x: 5 })).toBe(false);
  });

  it('places the rectangles relative to the cursor', () => {
    expect(pastedRectangles(pattern, laneIds, { top: 2, x: 5 }).map(({ laneId, start, end }) => ({ laneId, start, end }))).toEqual([
      { laneId: 30, start: 5, end: 6 },
      { laneId: 40, start: 6, end: 7 },
    ]);
  });
});
