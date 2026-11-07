import { FIRST_MARK } from './viewport';

/** m:n: the sub-ruler's marks form m intervals in the space of n intervals of the ruler it is derived from. */
export interface Ratio {
  m: number;
  n: number;
}

export interface RulerNode {
  id: number;
  /** The ruler this one is derived from; null for the main ruler. */
  parentId: number | null;
  ratio: Ratio;
  /**
   * Shift against the parent, in offset steps (see OrderedRuler.offsetStep). Only shifts that keep some
   * mark aligned with a parent mark are possible. Kept in [0, offsetPeriod(ratio)): a shift by a whole
   * period moves the ruler by one of its own intervals, which leaves its marks where they were.
   */
  offset: number;
  /** At most one ruler is selected; the main ruler never is. */
  selected: boolean;
}

export interface OrderedRuler {
  node: RulerNode;
  /** 0 for the main ruler, 1 for its sub-rulers, and so on. */
  depth: number;
  /** Distance between neighbouring marks in world units; the main ruler's is 1. */
  interval: number;
  /** World x of the ruler's reference mark (k = 0); its other marks sit at origin + k * interval. */
  origin: number;
  /** World distance of one offset step: the smallest move that keeps marks aligned with the parent's. */
  offsetStep: number;
  /** Marks k with k ≡ groupPhase (mod m) are aligned with parent marks and close a group of m intervals. */
  groupPhase: number;
  /**
   * The ratio against the main ruler, in lowest terms: the ratios down the tree multiplied, e.g. 4:1 under
   * the main ruler and 3:2 under that give 12:2 = 6:1. The main ruler's is 1:1.
   */
  mainRatio: Ratio;
}

export const MAIN_RULER_ID = 0;
export const UNIT_RATIO: Ratio = { m: 1, n: 1 };
export const INITIAL_RULERS: RulerNode[] = [
  { id: MAIN_RULER_ID, parentId: null, ratio: UNIT_RATIO, offset: 0, selected: false },
];

const RATIO_PATTERN = /^\s*(\d+)\s*:\s*(\d+)\s*$/;

/** Accepts "1" or "m:n" with positive integers m and n; returns null for anything else. */
export function parseRatio(text: string): Ratio | null {
  if (text.trim() === '1') return UNIT_RATIO;
  const match = RATIO_PATTERN.exec(text);
  if (!match) return null;
  const m = Number(match[1]);
  const n = Number(match[2]);
  if (!Number.isSafeInteger(m) || !Number.isSafeInteger(n) || m < 1 || n < 1) return null;
  return { m, n };
}

export function formatRatio({ m, n }: Ratio): string {
  return m === 1 && n === 1 ? '1' : `${m}:${n}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Non-negative remainder, also for negative a. */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Number of offset steps that add up to one interval of the sub-ruler: n / gcd(m, n). */
export function offsetPeriod({ m, n }: Ratio): number {
  return n / gcd(m, n);
}

/** Number of offset steps of a sub-ruler that add up to one interval of its parent: m / gcd(m, n). */
function stepsPerParentInterval({ m, n }: Ratio): number {
  return m / gcd(m, n);
}

/** Where a ruler's marks are: origin + k * interval for every integer k. */
export interface Grid {
  origin: number;
  interval: number;
}

/** The marks of a sub-ruler with the given ratio and offset against a parent with the given marks. */
export function childGeometry(parent: Grid, ratio: Ratio, offset: number): Grid & { offsetStep: number } {
  const offsetStep = parent.interval / stepsPerParentInterval(ratio);
  return {
    origin: parent.origin + offset * offsetStep,
    interval: (parent.interval * ratio.n) / ratio.m,
    offsetStep,
  };
}

/** The main ruler's marks. */
export const MAIN_GRID: Grid = { origin: FIRST_MARK, interval: 1 };

/** A new sub-ruler starts with the same marks as its parent. */
export function addSubRuler(rulers: RulerNode[], parentId: number, id: number): RulerNode[] {
  return [...rulers, { id, parentId, ratio: UNIT_RATIO, offset: 0, selected: false }];
}

/** Selects the given sub-ruler and deselects all others. Selecting the main ruler does nothing. */
export function selectRuler(rulers: RulerNode[], id: number): RulerNode[] {
  const target = rulers.find((r) => r.id === id);
  if (!target || target.parentId === null || target.selected) return rulers;
  return rulers.map((r) => (r.selected === (r.id === id) ? r : { ...r, selected: r.id === id }));
}

/** Removes a ruler together with all rulers derived from it, directly or indirectly. */
export function removeRuler(rulers: RulerNode[], id: number): RulerNode[] {
  const removed = new Set([id]);
  // Parents always precede their sub-rulers in the list, so one pass finds the whole subtree.
  for (const r of rulers) {
    if (r.parentId !== null && removed.has(r.parentId)) removed.add(r.id);
  }
  return rulers.filter((r) => !removed.has(r.id));
}

/**
 * Brings the ruler's offset back into [0, period). Dropping whole periods moves the ruler's reference
 * mark by whole intervals, so its sub-rulers' offsets are compensated to keep them where they are.
 */
function normalizeOffset(byId: Map<number, RulerNode>, id: number): void {
  const node = byId.get(id)!;
  const period = offsetPeriod(node.ratio);
  const intervals = Math.floor(node.offset / period);
  if (intervals === 0) return;
  node.offset -= intervals * period;
  for (const child of byId.values()) {
    if (child.parentId !== id) continue;
    child.offset += intervals * stepsPerParentInterval(child.ratio);
    normalizeOffset(byId, child.id);
  }
}

function updateRuler(rulers: RulerNode[], id: number, change: (node: RulerNode) => void): RulerNode[] {
  const byId = new Map(rulers.map((r) => [r.id, { ...r }]));
  const node = byId.get(id);
  if (!node || node.parentId === null) return rulers;
  change(node);
  normalizeOffset(byId, id);
  return rulers.map((r) => byId.get(r.id)!);
}

export function setRatio(rulers: RulerNode[], id: number, ratio: Ratio): RulerNode[] {
  return updateRuler(rulers, id, (node) => {
    node.ratio = ratio;
  });
}

/** Moves a sub-ruler and everything derived from it by `steps` offset steps against its parent. */
export function shiftRuler(rulers: RulerNode[], id: number, steps: number): RulerNode[] {
  return updateRuler(rulers, id, (node) => {
    node.offset += steps;
  });
}

/** Multiplies a ratio against the main ruler by a ratio against it, in lowest terms. */
export function composeRatios(outer: Ratio, inner: Ratio): Ratio {
  const m = outer.m * inner.m;
  const n = outer.n * inner.n;
  const g = gcd(m, n);
  return { m: m / g, n: n / g };
}

/** True for 1, 2, 4, 8, …: halving them again and again ends at 1. */
export function isPowerOfTwo(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 1) return false;
  while (value % 2 === 0) value /= 2;
  return value === 1;
}

/**
 * A sub-ruler is binary when its m against the main ruler is a power of two, i.e. it divides the main
 * ruler's intervals in halves, quarters, eighths, … (possibly grouped, as in 4:3), and some of its marks
 * still sit on main-ruler marks after its own offset and those of its ancestors. Then all its marks sit on
 * multiples of 1/m, so the distance between any two marks of binary rulers is k/2^j main intervals.
 * The main ruler isn't binary.
 */
export function isBinaryRuler(ruler: OrderedRuler): boolean {
  if (ruler.node.parentId === null || !isPowerOfTwo(ruler.mainRatio.m)) return false;
  // Marks sit at origin + k·n/m with n and m coprime, so some mark is a whole number of main intervals from the
  // main ruler's first mark exactly when (origin − first mark)·m is a whole number.
  const steps = (ruler.origin - MAIN_GRID.origin) * ruler.mainRatio.m;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** The marks k of a sub-ruler that coincide with parent marks satisfy k ≡ groupPhase (mod m). */
function groupPhase({ m, n }: Ratio, offset: number): number {
  const g = gcd(m, n);
  // Mark k sits (offset * g + k * n) / m parent intervals from the parent's reference mark.
  for (let k = 0; k < m / g; k++) {
    if ((offset + (k * n) / g) % (m / g) === 0) return k;
  }
  return 0;
}

/**
 * Rulers in display order: each ruler is directly followed by the rulers derived from it (depth first,
 * oldest first). Ratios and offsets are relative to the parent, so changing one ruler moves its whole subtree.
 */
export function orderRulers(rulers: RulerNode[]): OrderedRuler[] {
  const children = new Map<number | null, RulerNode[]>();
  for (const r of rulers) {
    const siblings = children.get(r.parentId) ?? [];
    siblings.push(r);
    children.set(r.parentId, siblings);
  }

  const ordered: OrderedRuler[] = [];
  const visit = (ruler: OrderedRuler) => {
    ordered.push(ruler);
    for (const child of children.get(ruler.node.id) ?? []) {
      visit({
        node: child,
        depth: ruler.depth + 1,
        ...childGeometry(ruler, child.ratio, child.offset),
        groupPhase: groupPhase(child.ratio, child.offset),
        mainRatio: composeRatios(ruler.mainRatio, child.ratio),
      });
    }
  };
  for (const root of children.get(null) ?? []) {
    visit({ node: root, depth: 0, ...MAIN_GRID, offsetStep: 0, groupPhase: 0, mainRatio: UNIT_RATIO });
  }
  return ordered;
}
