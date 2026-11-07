import { pruneChains, type PooledChain } from './chains';
import type { Block, Lane } from './lanes';

/** The parts of the work that removing a lane changes. */
export interface LaneWork {
  lanes: Lane[];
  blocks: Block[];
  chains: PooledChain[];
}

/** Everything a removed lane took with it, enough to put it back where it was. */
export interface LaneRemoval {
  lane: Lane;
  /** Its position among the lanes, top first. */
  index: number;
  blocks: Block[];
  /** Ruler chains that only its blocks used. */
  chains: PooledChain[];
}

/** Removes a lane with its blocks, and the ruler chains no other block uses. Null if there is no such lane. */
export function removeLane(work: LaneWork, id: number): { work: LaneWork; removal: LaneRemoval } | null {
  const index = work.lanes.findIndex((lane) => lane.id === id);
  if (index < 0) return null;
  const blocks = work.blocks.filter((block) => block.laneId !== id);
  const chains = pruneChains(work.chains, blocks);
  return {
    work: { lanes: work.lanes.filter((lane) => lane.id !== id), blocks, chains },
    removal: {
      lane: work.lanes[index],
      index,
      blocks: work.blocks.filter((block) => block.laneId === id),
      chains: work.chains.filter((entry) => !chains.includes(entry)),
    },
  };
}

/**
 * Puts a removed lane back with its blocks and chains, at its old position, or at the bottom if the lanes
 * have become fewer since.
 */
export function restoreLane(work: LaneWork, removal: LaneRemoval): LaneWork {
  const lanes = [...work.lanes];
  lanes.splice(Math.min(removal.index, lanes.length), 0, removal.lane);
  const chainIds = new Set(work.chains.map((entry) => entry.id));
  return {
    lanes,
    blocks: [...work.blocks, ...removal.blocks],
    chains: [...work.chains, ...removal.chains.filter((entry) => !chainIds.has(entry.id))],
  };
}

/** The lane to select after removing the one at this index: the lane that moved up into its place, else the one above. */
export function laneAfterRemoval(lanes: Lane[], index: number): number | null {
  return (lanes[index] ?? lanes[index - 1])?.id ?? null;
}
