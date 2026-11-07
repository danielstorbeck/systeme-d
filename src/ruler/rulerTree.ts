import { orderRulers, removeRuler, selectRuler, type RulerNode } from './rulers';

/** The sub-rulers in display order, top first; the main ruler is left out since it can't be selected or moved. */
function subRulers(rulers: RulerNode[]): RulerNode[] {
  return orderRulers(rulers)
    .map((ruler) => ruler.node)
    .filter((node) => node.parentId !== null);
}

/**
 * The id of the sub-ruler this many places below (positive) or above the given one in display order, or the
 * given id itself if there is none there. Without a given sub-ruler, the top one.
 */
export function neighbourRuler(rulers: RulerNode[], id: number | null, offset: number): number | null {
  const shown = subRulers(rulers);
  const i = shown.findIndex((node) => node.id === id);
  if (i < 0) return shown[0]?.id ?? null;
  return shown[i + offset]?.id ?? shown[i].id;
}

/** Lists the rulers parent first, each followed by its subtree, with siblings in the given order. */
function listDepthFirst(rulers: RulerNode[], siblingsOf: (parentId: number | null) => RulerNode[]): RulerNode[] {
  const listed: RulerNode[] = [];
  const visit = (node: RulerNode) => {
    listed.push(node);
    for (const child of siblingsOf(node.id)) visit(child);
  };
  for (const root of siblingsOf(null)) visit(root);
  return listed.length === rulers.length ? listed : rulers;
}

/**
 * Swaps a sub-ruler, together with the rulers derived from it, with its sibling below (offset 1) or above
 * (offset -1). Unchanged if there is no such sibling, or for the main ruler.
 */
export function moveRuler(rulers: RulerNode[], id: number, offset: number): RulerNode[] {
  const node = rulers.find((r) => r.id === id);
  if (!node || node.parentId === null) return rulers;
  const siblings = rulers.filter((r) => r.parentId === node.parentId);
  const i = siblings.indexOf(node);
  const j = i + offset;
  if (j < 0 || j >= siblings.length) return rulers;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  // Sibling order is list order, so the list is rebuilt with parents still ahead of their sub-rulers.
  return listDepthFirst(rulers, (parentId) =>
    parentId === node.parentId ? siblings : rulers.filter((r) => r.parentId === parentId),
  );
}

/** A removed ruler with the rulers derived from it, enough to put them back where they were. */
export interface RulerRemoval {
  /** The removed ruler first, then its subtree, in list order. */
  nodes: RulerNode[];
  /** Its position among its siblings. */
  siblingIndex: number;
  /** Its position among the sub-rulers in display order. */
  displayIndex: number;
}

/** Removes a sub-ruler with everything derived from it. Null for the main ruler or an unknown id. */
export function removeRulerTree(rulers: RulerNode[], id: number): { rulers: RulerNode[]; removal: RulerRemoval } | null {
  const node = rulers.find((r) => r.id === id);
  if (!node || node.parentId === null) return null;
  const remaining = removeRuler(rulers, id);
  return {
    rulers: remaining,
    removal: {
      nodes: rulers.filter((r) => !remaining.includes(r)),
      siblingIndex: rulers.filter((r) => r.parentId === node.parentId).indexOf(node),
      displayIndex: subRulers(rulers).indexOf(node),
    },
  };
}

/**
 * Puts a removed ruler tree back at its old place among its siblings (last if they have become fewer), and
 * selects its top ruler. Unchanged if the ruler it was derived from no longer exists.
 */
export function restoreRulerTree(rulers: RulerNode[], removal: RulerRemoval): RulerNode[] {
  const [top] = removal.nodes;
  if (!rulers.some((r) => r.id === top.parentId)) return rulers;
  const nodes = removal.nodes.map((node) => ({ ...node, selected: false }));
  const before = rulers.filter((r) => r.parentId === top.parentId)[removal.siblingIndex];
  const at = before ? rulers.indexOf(before) : rulers.length;
  return selectRuler([...rulers.slice(0, at), ...nodes, ...rulers.slice(at)], top.id);
}

/** The ruler to select after a removal: the one that moved up into its place, else the one above. */
export function rulerAfterRemoval(rulers: RulerNode[], removal: RulerRemoval): number | null {
  const shown = subRulers(rulers);
  return (shown[removal.displayIndex] ?? shown[removal.displayIndex - 1])?.id ?? null;
}
