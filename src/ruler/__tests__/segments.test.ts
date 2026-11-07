import { describe, expect, it } from 'vitest';
import { addLane } from '../lanes';
import { layoutLanes, layoutRows, LANE_HEIGHT_PX, segmentRowAt } from '../layout';
import { addSubRuler, INITIAL_RULERS, orderRulers, setRatio } from '../rulers';
import { addSegmentLine, formatSegmentLength, removeSegmentLine, segmentLength, segmentLineAt, snapToBinaryMarks } from '../segments';

// 1 = 4:1 under the main ruler (binary), 2 = 3:1 under the main ruler (not binary).
let rulers = addSubRuler(addSubRuler(INITIAL_RULERS, 0, 1), 0, 2);
rulers = setRatio(setRatio(rulers, 1, { m: 4, n: 1 }), 2, { m: 3, n: 1 });
const ordered = orderRulers(rulers);

describe('segment lines', () => {
  it('snap to the nearest mark of a binary sub-ruler only', () => {
    // The 3:1 ruler has a mark at 1 + 1/3 ≈ 1.333, but only quarters count.
    expect(snapToBinaryMarks(ordered, 1.34)).toBeCloseTo(1.25);
    expect(snapToBinaryMarks(ordered, 2.9)).toBeCloseTo(3);
    expect(snapToBinaryMarks(orderRulers(setRatio(rulers, 1, { m: 3, n: 1 })), 2)).toBeUndefined();
    expect(snapToBinaryMarks(orderRulers(INITIAL_RULERS), 2)).toBeUndefined();
  });

  it('never snap left of the start of the lanes', () => {
    expect(snapToBinaryMarks(ordered, 0.2)).toBeCloseTo(1);
  });

  it('are set in order, once, and removed again', () => {
    let lanes = addLane([], 5, 1);
    lanes = addSegmentLine(lanes, 5, 3);
    lanes = addSegmentLine(lanes, 5, 1.5);
    lanes = addSegmentLine(lanes, 5, 3);
    expect(lanes[0].segments).toEqual([1.5, 3]);
    expect(segmentLineAt(lanes[0], 1.55, 0.1)).toBe(1.5);
    expect(segmentLineAt(lanes[0], 2, 0.1)).toBeUndefined();
    expect(removeSegmentLine(lanes, 5, 1.5)[0].segments).toEqual([3]);
  });

  it('get a part of their own above the blocks, which doubles the height of the lanes', () => {
    const lanes = addLane(addLane([], 5, 1), 6, 2);
    const rows = layoutRows(ordered);
    const plain = layoutLanes(lanes, rows);
    const split = layoutLanes(lanes, rows, true);
    expect(plain.every((row) => row.segmentTop === null)).toBe(true);
    expect(split[0].segmentTop).toBe(plain[0].top);
    expect(split[0].top).toBe(plain[0].top + LANE_HEIGHT_PX);
    expect(split[1].top - split[0].top).toBe(plain[1].top - plain[0].top + LANE_HEIGHT_PX);
    expect(segmentRowAt(split, split[1].segmentTop! + 1)?.lane.id).toBe(6);
    expect(segmentRowAt(split, split[1].top + 1)).toBeUndefined();
    expect(segmentRowAt(plain, plain[1].top + 1)).toBeUndefined();
  });
});

describe('segment lengths', () => {
  it('are fractions of main-ruler intervals in lowest terms', () => {
    expect(formatSegmentLength(1, 1.375)).toBe('3/8');
    expect(formatSegmentLength(1.25, 1.75)).toBe('1/2');
    expect(formatSegmentLength(2, 4)).toBe('2/1');
    expect(formatSegmentLength(1, 1 + 5 / 1024)).toBe('5/1024');
    expect(segmentLength(1 + 1 / 12, 1.25)).toEqual({ k: 1, m: 6 });
  });
});
