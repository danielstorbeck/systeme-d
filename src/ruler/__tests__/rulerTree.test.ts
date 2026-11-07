import { describe, expect, it } from 'vitest';
import { addSubRuler, INITIAL_RULERS, MAIN_RULER_ID, orderRulers, selectRuler, type RulerNode } from '../rulers';
import { moveRuler, neighbourRuler, removeRulerTree, restoreRulerTree, rulerAfterRemoval } from '../rulerTree';

/** Main ruler 0 with sub-rulers 1 (which has 3 and 4 derived from it) and 2, shown as 0, 1, 3, 4, 2. */
const rulers = [
  [1, MAIN_RULER_ID],
  [2, MAIN_RULER_ID],
  [3, 1],
  [4, 1],
].reduce((all, [id, parentId]) => addSubRuler(all, parentId, id), INITIAL_RULERS);

const shown = (list: RulerNode[]) => orderRulers(list).map((r) => r.node.id);
const selected = (list: RulerNode[]) => list.find((r) => r.selected)?.id;

describe('ruler selection', () => {
  it('moves through the sub-rulers in display order, never to the main ruler', () => {
    expect(shown(rulers)).toEqual([0, 1, 3, 4, 2]);
    expect(neighbourRuler(rulers, null, 0)).toBe(1);
    expect(neighbourRuler(rulers, 1, 1)).toBe(3);
    expect(neighbourRuler(rulers, 4, 1)).toBe(2);
    expect(neighbourRuler(rulers, 2, 1)).toBe(2);
    expect(neighbourRuler(rulers, 1, -1)).toBe(1);
    expect(neighbourRuler(INITIAL_RULERS, null, 1)).toBeNull();
  });
});

describe('moving rulers', () => {
  it('swaps a ruler and its subtree with a sibling', () => {
    const moved = moveRuler(rulers, 1, 1);
    expect(shown(moved)).toEqual([0, 2, 1, 3, 4]);
    expect(shown(moveRuler(moved, 1, -1))).toEqual([0, 1, 3, 4, 2]);
    expect(shown(moveRuler(rulers, 4, -1))).toEqual([0, 1, 4, 3, 2]);
  });

  it('keeps parents ahead of their sub-rulers in the list', () => {
    const moved = moveRuler(rulers, 1, 1);
    const index = new Map(moved.map((r, i) => [r.id, i]));
    for (const r of moved) if (r.parentId !== null) expect(index.get(r.parentId)!).toBeLessThan(index.get(r.id)!);
  });

  it('stays without a sibling there, and never moves the main ruler', () => {
    expect(moveRuler(rulers, 2, 1)).toBe(rulers);
    expect(moveRuler(rulers, 3, -1)).toBe(rulers);
    expect(moveRuler(rulers, MAIN_RULER_ID, 1)).toBe(rulers);
  });
});

describe('removing rulers', () => {
  it('removes a ruler with its subtree and selects the ruler that moved into its place', () => {
    const { rulers: after, removal } = removeRulerTree(selectRuler(rulers, 1), 1)!;
    expect(shown(after)).toEqual([0, 2]);
    expect(removal.nodes.map((r) => r.id)).toEqual([1, 3, 4]);
    expect(rulerAfterRemoval(after, removal)).toBe(2);
    expect(removeRulerTree(rulers, MAIN_RULER_ID)).toBeNull();
  });

  it('selects the ruler above when the bottom one is removed, or none when no sub-ruler is left', () => {
    const bottom = removeRulerTree(rulers, 2)!;
    expect(rulerAfterRemoval(bottom.rulers, bottom.removal)).toBe(4);
    const only = removeRulerTree(addSubRuler(INITIAL_RULERS, 0, 1), 1)!;
    expect(rulerAfterRemoval(only.rulers, only.removal)).toBeNull();
  });

  it('puts a removed tree back at its place and selects it', () => {
    const { rulers: after, removal } = removeRulerTree(selectRuler(rulers, 1), 1)!;
    const restored = restoreRulerTree(selectRuler(after, 2), removal);
    expect(shown(restored)).toEqual([0, 1, 3, 4, 2]);
    expect(selected(restored)).toBe(1);
  });

  it('puts it last among its siblings if they have become fewer', () => {
    const { rulers: after, removal } = removeRulerTree(rulers, 4)!;
    const restored = restoreRulerTree(removeRulerTree(after, 3)!.rulers, removal);
    expect(shown(restored)).toEqual([0, 1, 4, 2]);
  });
});
