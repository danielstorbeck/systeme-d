import { childGeometry, MAIN_GRID, MAIN_RULER_ID, type Grid, type Ratio, type RulerNode } from './rulers';

/** One step down from a parent ruler: the m:n ratio against the parent and the offset in offset steps. */
export interface ChainLink {
  ratio: Ratio;
  offset: number;
}

/**
 * The links from the main ruler down to a ruler, outermost first; empty for the main ruler itself.
 * Together they fully define where the ruler's marks are, independently of the live ruler tree.
 */
export type RulerChain = ChainLink[];

/** A chain in the pool, referenced by the blocks drawn with it. */
export interface PooledChain {
  id: number;
  chain: RulerChain;
}

/** The chain of the given ruler, read from the live ruler tree. */
export function chainOf(rulers: RulerNode[], id: number): RulerChain {
  const byId = new Map(rulers.map((r) => [r.id, r]));
  const chain: RulerChain = [];
  for (let r = byId.get(id); r && r.parentId !== null; r = byId.get(r.parentId)) {
    chain.unshift({ ratio: { ...r.ratio }, offset: r.offset });
  }
  return chain;
}

/** Where the marks of the ruler described by the chain are. */
export function chainGrid(chain: RulerChain): Grid {
  let grid: Grid = MAIN_GRID;
  for (const { ratio, offset } of chain) {
    const { origin, interval } = childGeometry(grid, ratio, offset);
    grid = { origin, interval };
  }
  return grid;
}

function sameChain(a: RulerChain, b: RulerChain): boolean {
  return (
    a.length === b.length &&
    a.every((link, i) => link.ratio.m === b[i].ratio.m && link.ratio.n === b[i].ratio.n && link.offset === b[i].offset)
  );
}

/** The pooled chain equal to `chain`, if there is one. */
export function findChain(pool: PooledChain[], chain: RulerChain): PooledChain | undefined {
  return pool.find((entry) => sameChain(entry.chain, chain));
}

/**
 * Makes sure the ruler described by the chain exists in the tree. Walking down from the main ruler, each link
 * reuses an existing sub-ruler with the same ratio and offset and only creates the rulers that are missing,
 * so no duplicate rulers appear. Returns the new tree and the id of the ruler at the end of the chain.
 */
export function mergeChain(
  rulers: RulerNode[],
  chain: RulerChain,
  newId: () => number,
): { rulers: RulerNode[]; id: number } {
  let merged = rulers;
  let parentId = MAIN_RULER_ID;
  for (const { ratio, offset } of chain) {
    const existing = merged.find(
      (r) => r.parentId === parentId && r.ratio.m === ratio.m && r.ratio.n === ratio.n && r.offset === offset,
    );
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const id = newId();
    merged = [...merged, { id, parentId, ratio: { ...ratio }, offset, selected: false }];
    parentId = id;
  }
  return { rulers: merged, id: parentId };
}

/** Keeps only the chains still referenced by some block. */
export function pruneChains(pool: PooledChain[], blocks: { chainId: number }[]): PooledChain[] {
  const used = new Set(blocks.map((b) => b.chainId));
  return pool.every((entry) => used.has(entry.id)) ? pool : pool.filter((entry) => used.has(entry.id));
}
