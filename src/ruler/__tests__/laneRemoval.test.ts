import { describe, expect, it } from 'vitest';
import { addLane, type Block } from '../lanes';
import { laneAfterRemoval, removeLane, restoreLane, type LaneWork } from '../laneRemoval';

const block = (id: number, laneId: number, chainId: number): Block => ({
  id,
  laneId,
  start: 0,
  end: 1,
  chainId,
  pitch: 60,
  text: 'la',
  chord: [],
});

const work: LaneWork = {
  lanes: [1, 2, 3].reduce((all, id) => addLane(all, id, id), [] as LaneWork['lanes']),
  blocks: [block(10, 1, 100), block(11, 2, 100), block(12, 2, 101)],
  chains: [
    { id: 100, chain: [] },
    { id: 101, chain: [] },
  ],
};

describe('lane removal', () => {
  it('removes the lane with its blocks and the chains only they used', () => {
    const { work: after, removal } = removeLane(work, 2)!;
    expect(after.lanes.map((l) => l.id)).toEqual([1, 3]);
    expect(after.blocks.map((b) => b.id)).toEqual([10]);
    expect(after.chains.map((c) => c.id)).toEqual([100]);
    expect(removal).toMatchObject({ index: 1, lane: { id: 2 } });
    expect(removal.blocks.map((b) => b.id)).toEqual([11, 12]);
    expect(removal.chains.map((c) => c.id)).toEqual([101]);
    expect(removeLane(work, 9)).toBeNull();
  });

  it('puts the lane back where it was, with its blocks and chains', () => {
    const { work: after, removal } = removeLane(work, 2)!;
    const restored = restoreLane(after, removal);
    expect(restored.lanes).toEqual(work.lanes);
    expect(restored.blocks.map((b) => b.id).sort()).toEqual([10, 11, 12]);
    expect(restored.chains.map((c) => c.id).sort()).toEqual([100, 101]);
  });

  it('puts the lane at the bottom if the lanes have become fewer', () => {
    const { removal } = removeLane(work, 3)!;
    const restored = restoreLane({ ...work, lanes: work.lanes.slice(0, 1) }, removal);
    expect(restored.lanes.map((l) => l.id)).toEqual([1, 3]);
  });

  it('selects the lane below the removed one, else the one above', () => {
    const lanes = work.lanes.filter((l) => l.id !== 2);
    expect(laneAfterRemoval(lanes, 1)).toBe(3);
    expect(laneAfterRemoval(lanes, 2)).toBe(3);
    expect(laneAfterRemoval([], 0)).toBeNull();
  });
});
