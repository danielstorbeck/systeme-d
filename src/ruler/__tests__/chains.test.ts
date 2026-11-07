import { describe, expect, it } from 'vitest';
import { chainGrid, chainOf, findChain, mergeChain, pruneChains, type PooledChain } from '../chains';
import { addSubRuler, INITIAL_RULERS, orderRulers, removeRuler, setRatio, shiftRuler } from '../rulers';

// main(0) ── a(1, 3:2, shifted 1) ── c(3, 5:4, shifted 2)
let rulers = addSubRuler(INITIAL_RULERS, 0, 1);
rulers = addSubRuler(rulers, 1, 3);
rulers = setRatio(setRatio(rulers, 1, { m: 3, n: 2 }), 3, { m: 5, n: 4 });
rulers = shiftRuler(shiftRuler(rulers, 1, 1), 3, 2);

describe('ruler chains', () => {
  it('lists offset and m:n from the main ruler down', () => {
    expect(chainOf(rulers, 3)).toEqual([
      { ratio: { m: 3, n: 2 }, offset: 1 },
      { ratio: { m: 5, n: 4 }, offset: 2 },
    ]);
    expect(chainOf(rulers, 0)).toEqual([]);
  });

  it('describes the same marks as the live ruler', () => {
    for (const ruler of orderRulers(rulers)) {
      const grid = chainGrid(chainOf(rulers, ruler.node.id));
      expect(grid.origin).toBeCloseTo(ruler.origin);
      expect(grid.interval).toBeCloseTo(ruler.interval);
    }
  });

  it('still describes the ruler after it has been deleted', () => {
    const chain = chainOf(rulers, 3);
    const before = orderRulers(rulers).find((r) => r.node.id === 3)!;
    removeRuler(rulers, 1);
    expect(chainGrid(chain).origin).toBeCloseTo(before.origin);
    expect(chainGrid(chain).interval).toBeCloseTo(before.interval);
  });

  it('is a copy that later changes to the ruler do not affect', () => {
    const chain = chainOf(rulers, 1);
    shiftRuler(setRatio(rulers, 1, { m: 7, n: 3 }), 1, 1);
    expect(chain).toEqual([{ ratio: { m: 3, n: 2 }, offset: 1 }]);
  });
});

describe('mergeChain', () => {
  const ids = () => {
    let next = 100;
    return () => next++;
  };
  const structure = (rs: typeof rulers) =>
    orderRulers(rs).map((r) => `${'  '.repeat(r.depth)}${r.node.ratio.m}:${r.node.ratio.n}@${r.node.offset}`);

  it('recreates a deleted ruler under its still existing parent', () => {
    const chain = chainOf(rulers, 3);
    const merged = mergeChain(removeRuler(rulers, 3), chain, ids());
    expect(structure(merged.rulers)).toEqual(structure(rulers));
    expect(chainOf(merged.rulers, merged.id)).toEqual(chain);
  });

  it('recreates a whole deleted branch', () => {
    const chain = chainOf(rulers, 3);
    const merged = mergeChain(removeRuler(rulers, 1), chain, ids());
    expect(structure(merged.rulers)).toEqual(structure(rulers));
    expect(merged.rulers).toHaveLength(3);
  });

  it('adds nothing when the ruler still exists', () => {
    const merged = mergeChain(rulers, chainOf(rulers, 3), ids());
    expect(merged.rulers).toBe(rulers);
    expect(merged.id).toBe(3);
  });

  it('reuses the common part of the chain and only adds what differs', () => {
    // A sibling of c(3) under a(1), differing only in its offset.
    const chain = chainOf(shiftRuler(rulers, 3, 1), 3);
    const merged = mergeChain(rulers, chain, ids());
    expect(merged.rulers).toHaveLength(rulers.length + 1);
    expect(merged.rulers.find((r) => r.id === merged.id)!.parentId).toBe(1);
  });
});

describe('chain pool', () => {
  const pool: PooledChain[] = [
    { id: 1, chain: chainOf(rulers, 1) },
    { id: 2, chain: chainOf(rulers, 3) },
  ];

  it('finds an equal chain, so each chain is pooled once', () => {
    expect(findChain(pool, chainOf(rulers, 3))?.id).toBe(2);
    expect(findChain(pool, chainOf(shiftRuler(rulers, 3, 1), 3))).toBeUndefined();
  });

  it('drops chains that no block refers to any more', () => {
    expect(pruneChains(pool, [{ chainId: 2 }]).map((c) => c.id)).toEqual([2]);
    expect(pruneChains(pool, [{ chainId: 1 }, { chainId: 2 }])).toBe(pool);
  });
});
