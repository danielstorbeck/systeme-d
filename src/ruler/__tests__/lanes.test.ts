import { describe, expect, it } from 'vitest';
import {
  addLane,
  blockAt,
  blockSpan,
  centreMostBlock,
  copyBlock,
  cursorSpan,
  isFree,
  resizeBlock,
  freeIntervals,
  intervalIndex,
  moveLane,
  neighbourLane,
  neighbourBlock,
  renameLane,
  setBlockPitch,
  setLaneKey,
  setLaneSound,
  setLaneVolume,
  type Block,
} from '../lanes';
import { LANE_HEIGHT_PX, layoutLanes, layoutRows } from '../layout';
import { addSubRuler, INITIAL_RULERS, orderRulers } from '../rulers';

describe('lanes', () => {
  it('adds a new lane each time, numbered by creation', () => {
    const lanes = addLane(addLane([], 10, 1), 11, 2);
    expect(lanes.map((l) => l.name)).toEqual(['Lane 1', 'Lane 2']);
  });

  it('renames one lane', () => {
    const lanes = renameLane(addLane(addLane([], 10, 1), 11, 2), 11, 'Melody');
    expect(lanes.map((l) => l.name)).toEqual(['Lane 1', 'Melody']);
  });

  it('starts every lane in C major and gives each lane its own key', () => {
    const lanes = setLaneKey(addLane(addLane([], 10, 1), 11, 2), 11, 'f♯');
    expect(lanes.map((l) => l.key)).toEqual(['C', 'f♯']);
  });

  it('starts every lane with a sine and gives each lane its own sound', () => {
    const lanes = setLaneSound(addLane(addLane([], 10, 1), 11, 2), 10, 'square');
    expect(lanes.map((l) => l.sound)).toEqual(['square', 'sine']);
  });

  it('starts every lane at 50 % volume and keeps volumes between 0 and 100 %', () => {
    const lanes = addLane(addLane([], 10, 1), 11, 2);
    expect(lanes.map((l) => l.volume)).toEqual([50, 50]);
    expect(setLaneVolume(lanes, 11, 65).map((l) => l.volume)).toEqual([50, 65]);
    expect(setLaneVolume(lanes, 10, 120)[0].volume).toBe(100);
    expect(setLaneVolume(lanes, 10, -5)[0].volume).toBe(0);
  });

  it('stacks lanes below the rulers without overlapping', () => {
    const rows = layoutRows(orderRulers(addSubRuler(INITIAL_RULERS, 0, 1)));
    const laneRows = layoutLanes(addLane(addLane([], 10, 1), 11, 2), rows);
    expect(laneRows[0].top).toBeGreaterThan(rows[rows.length - 1].bottom);
    expect(laneRows[1].top).toBeGreaterThan(laneRows[0].top + LANE_HEIGHT_PX);
  });

  describe('blocks', () => {
    // A 3:2 sub-ruler shifted by one step: marks at 1/3 + k * 2/3, i.e. …, 1, 5/3, 7/3, 3, …
    const grid = { origin: 1 / 3, interval: 2 / 3 };
    const block = (id: number, start: number, end: number): Block => ({ id, laneId: 7, start, end, chainId: 1, pitch: 60, text: 'la', chord: [] });

    it('starts as the interval under the pointer', () => {
      const k = intervalIndex(grid, 2);
      const span = blockSpan(grid, k, k, freeIntervals(grid, [], k)!);
      expect(span.start).toBeCloseTo(5 / 3);
      expect(span.end).toBeCloseTo(7 / 3);
    });

    it('extends to the far edge of the interval under the pointer, in both directions', () => {
      const anchor = intervalIndex(grid, 2);
      const free = freeIntervals(grid, [], anchor)!;
      const right = blockSpan(grid, anchor, intervalIndex(grid, 4.1), free);
      expect(right.start).toBeCloseTo(5 / 3);
      expect(right.end).toBeCloseTo(13 / 3);
      const left = blockSpan(grid, anchor, intervalIndex(grid, 1.2), free);
      expect(left.start).toBeCloseTo(1);
      expect(left.end).toBeCloseTo(7 / 3);
    });

    it('stays inside the lane, which starts at mark 1', () => {
      expect(freeIntervals(grid, [], intervalIndex(grid, 0.9))).toBeNull();
      const anchor = intervalIndex(grid, 2);
      const span = blockSpan(grid, anchor, -50, freeIntervals(grid, [], anchor)!);
      expect(span.start).toBeCloseTo(1);
    });

    it('cannot start on an existing block', () => {
      expect(freeIntervals(grid, [block(1, 5 / 3, 3)], intervalIndex(grid, 2))).toBeNull();
    });

    it('stops before neighbouring blocks', () => {
      const others = [block(1, 1, 5 / 3), block(2, 3 + 2 / 3, 5)];
      const anchor = intervalIndex(grid, 2.5);
      const free = freeIntervals(grid, others, anchor)!;
      const span = blockSpan(grid, anchor, intervalIndex(grid, 100), free);
      expect(span.end).toBeCloseTo(3 + 2 / 3);
      expect(blockSpan(grid, anchor, -100, free).start).toBeCloseTo(5 / 3);
    });

    it('changes the pitch of one block, within the MIDI range', () => {
      const blocks = [block(1, 1, 2), block(2, 2, 3)];
      expect(setBlockPitch(blocks, 2, 62).map((b) => b.pitch)).toEqual([60, 62]);
      expect(setBlockPitch(blocks, 2, 200)[1].pitch).toBe(127);
      expect(setBlockPitch(blocks, 2, -5)[1].pitch).toBe(0);
    });

    it('finds the block under the pointer for deleting', () => {
      const blocks = [block(1, 1, 5 / 3), { ...block(2, 3, 4), laneId: 8 }];
      expect(blockAt(blocks, 7, 1.2)?.id).toBe(1);
      expect(blockAt(blocks, 7, 3.5)).toBeUndefined();
      expect(blockAt(blocks, 8, 3.5)?.id).toBe(2);
    });
  });

  describe('moving the highlight', () => {
    // Lanes 7, 8, 9 (empty), 10 from top to bottom.
    const laneIds = [7, 8, 9, 10];
    const b = (id: number, laneId: number, start: number, end: number): Block => ({ id, laneId, start, end, chainId: 1, pitch: 60, text: 'la', chord: [] });
    const blocks = [b(1, 7, 1, 2), b(2, 7, 2, 4), b(3, 7, 6, 7), b(4, 8, 3, 4), b(5, 8, 8, 9), b(6, 10, 1, 2)];
    const move = (from: number, direction: 'left' | 'right' | 'up' | 'down') =>
      neighbourBlock(blocks, laneIds, from, direction)?.id;

    it('goes to the left and right neighbour on the same lane', () => {
      expect(move(2, 'left')).toBe(1);
      expect(move(2, 'right')).toBe(3);
    });

    it('goes to the horizontally nearest block on the lane above or below', () => {
      expect(move(2, 'down')).toBe(4);
      expect(move(3, 'down')).toBe(5); // centre 6.5: block 5 (8.5) is nearer than block 4 (3.5)
      expect(move(5, 'up')).toBe(3);
    });

    it('skips lanes without blocks', () => {
      expect(move(4, 'down')).toBe(6);
      expect(move(6, 'up')).toBe(4);
    });

    it('stays where it is when there is no block in that direction', () => {
      expect(move(1, 'left')).toBeUndefined();
      expect(move(3, 'right')).toBeUndefined();
      expect(move(1, 'up')).toBeUndefined();
      expect(move(6, 'down')).toBeUndefined();
    });
  });

  it('moves the lanes down when rulers are added', () => {
    const lanes = addLane([], 10, 1);
    const before = layoutLanes(lanes, layoutRows(orderRulers(INITIAL_RULERS)))[0].top;
    const after = layoutLanes(lanes, layoutRows(orderRulers(addSubRuler(INITIAL_RULERS, 0, 1))))[0].top;
    expect(after).toBeGreaterThan(before);
  });
});

describe('lane order', () => {
  const lanes = [1, 2, 3].reduce((all, id) => addLane(all, id, id), [] as ReturnType<typeof addLane>);
  const ids = (list: typeof lanes) => list.map((lane) => lane.id);

  it('moves the selection to the neighbouring lane, staying at the ends', () => {
    expect(neighbourLane(lanes, null, 1)).toBe(1);
    expect(neighbourLane(lanes, 1, 1)).toBe(2);
    expect(neighbourLane(lanes, 2, -1)).toBe(1);
    expect(neighbourLane(lanes, 1, -1)).toBe(1);
    expect(neighbourLane(lanes, 3, 1)).toBe(3);
    expect(neighbourLane([], null, 1)).toBeNull();
  });

  it('swaps a lane with its neighbour, staying at the ends', () => {
    expect(ids(moveLane(lanes, 1, 1))).toEqual([2, 1, 3]);
    expect(ids(moveLane(lanes, 3, -1))).toEqual([1, 3, 2]);
    expect(moveLane(lanes, 1, -1)).toBe(lanes);
    expect(moveLane(lanes, 3, 1)).toBe(lanes);
  });
});

describe('centreMostBlock', () => {
  const b = (id: number, laneId: number, start: number, end: number): Block => ({ id, laneId, start, end, chainId: 1, pitch: 60, text: 'la', chord: [] });
  // 10 px per world unit, a 200 × 100 px view; lane 1 at y 40–60 (the middle), lane 2 at y 80–100, lane 3 below the view.
  const lanes = [
    { laneId: 1, top: 40, height: 20 },
    { laneId: 2, top: 80, height: 20 },
    { laneId: 3, top: 120, height: 20 },
  ];
  const pick = (blocks: Block[]) => centreMostBlock(blocks, lanes, (x) => x * 10, 200, 100)?.id;

  it('picks the block nearest the middle of the view', () => {
    expect(pick([b(1, 1, 1, 2), b(2, 1, 9, 11), b(3, 2, 9, 11)])).toBe(2);
  });

  it('measures from the visible part of a block', () => {
    // Block 1 runs far off to the right; its visible part (x 150–200) is centred at 175, block 2 at 60.
    expect(pick([b(1, 1, 15, 100), b(2, 1, 5, 7)])).toBe(2);
  });

  it('ignores blocks out of view', () => {
    expect(pick([b(1, 3, 9, 11), b(2, 1, 25, 30)])).toBeUndefined();
    expect(pick([b(1, 3, 9, 11), b(2, 2, 0, 1)])).toBe(2);
  });
});

describe('resizeBlock', () => {
  const b = (id: number, laneId: number, start: number, end: number): Block => ({ id, laneId, start, end, chainId: 1, pitch: 60, text: 'la', chord: [] });
  // Marks at 1, 1.5, 2, 2.5, …
  const grid = { origin: 1, interval: 0.5 };
  const blocks = [b(1, 7, 2, 3), b(2, 7, 4, 5), b(3, 8, 1, 6)];
  const resize = (id: number, side: 'left' | 'right', offset: number) => resizeBlock(blocks, id, grid, side, offset);

  it('moves an edge mark by mark', () => {
    expect(resize(1, 'left', -1)).toEqual({ start: 1.5, end: 3 });
    expect(resize(1, 'left', 1)).toEqual({ start: 2.5, end: 3 });
    expect(resize(1, 'right', -1)).toEqual({ start: 2, end: 2.5 });
    expect(resize(1, 'right', 1)).toEqual({ start: 2, end: 3.5 });
  });

  it('keeps the block at least one interval wide', () => {
    expect(resizeBlock([b(1, 7, 2, 2.5)], 1, grid, 'left', 1)).toBeUndefined();
    expect(resizeBlock([b(1, 7, 2, 2.5)], 1, grid, 'right', -1)).toBeUndefined();
  });

  it('only extends into free space on the lane, after the lane start', () => {
    expect(resizeBlock(blocks, 1, grid, 'right', 3)).toBeUndefined(); // 4.5 is inside block 2
    expect(resizeBlock(blocks, 1, grid, 'right', 2)).toEqual({ start: 2, end: 4 }); // touching block 2
    expect(resize(3, 'left', -1)).toBeUndefined(); // the lane starts at mark 1
  });

  it('steps from between marks to the neighbouring mark first', () => {
    expect(resizeBlock([b(1, 7, 2.2, 3)], 1, grid, 'left', -1)).toEqual({ start: 2, end: 3 });
    expect(resizeBlock([b(1, 7, 2.2, 3)], 1, grid, 'left', 1)).toEqual({ start: 2.5, end: 3 });
  });
});

describe('copying and pasting', () => {
  const b = (id: number, laneId: number, start: number, end: number): Block => ({ id, laneId, start, end, chainId: 1, pitch: 64, text: 'mi', chord: [3, 7] });

  it('copies the pitch, the text, the chord and the length in intervals of the original ruler', () => {
    expect(copyBlock(b(1, 7, 2, 3.5), { origin: 1, interval: 0.5 })).toEqual({ pitch: 64, text: 'mi', chord: [3, 7], intervals: 3 });
    expect(copyBlock(b(1, 7, 1, 2), { origin: 1, interval: 1 / 3 }).intervals).toBe(3);
  });

  it('puts the cursor on the nearest mark of the selected ruler, as long as the copy in its intervals', () => {
    expect(cursorSpan({ origin: 1, interval: 0.25 }, 2.1, 3)).toEqual({ start: 2, end: 2.75 });
    expect(cursorSpan({ origin: 1, interval: 2 }, 4.2, 1)).toEqual({ start: 5, end: 7 });
  });

  it('keeps the cursor right of the lane start', () => {
    expect(cursorSpan({ origin: 0.4, interval: 0.5 }, -3, 1)).toEqual({ start: 1.4, end: 1.9 });
  });

  it('only finds a place free if no block of the lane overlaps it', () => {
    const blocks = [b(1, 7, 2, 3), b(2, 8, 3, 4)];
    expect(isFree(blocks, 7, { start: 3, end: 4 })).toBe(true);
    expect(isFree(blocks, 7, { start: 1, end: 2 })).toBe(true);
    expect(isFree(blocks, 7, { start: 2.5, end: 3.5 })).toBe(false);
    expect(isFree(blocks, 8, { start: 2, end: 5 })).toBe(false);
  });
});
