import type { Grid } from './rulers';
import { toWorld, type View } from './viewport';

/**
 * A border sits on a mark of the ruler it was last moved on, and follows that mark when the ruler changes
 * (e.g. its ratio). Selecting another ruler doesn't move it; only moving it in border mode puts it on the
 * marks of the ruler selected then.
 */
export interface Border {
  rulerId: number;
  /** Index k of the mark, at world x = origin + k * interval of the ruler. */
  mark: number;
  /** World x, as of the last time its ruler was seen; kept if the ruler is removed. */
  x: number;
}

/** Two borders marking an interval. */
export interface Borders {
  left: Border;
  right: Border;
}

export type BorderSide = keyof Borders;

/** A ruler with its marks, e.g. a laid-out ruler row. */
export type PlacedRuler = Grid & { node: { id: number } };

/** Tolerance for "on a mark", in marks. */
const EPSILON = 1e-9;

function onMark(ruler: PlacedRuler, mark: number): Border {
  // "+ 0" turns a -0 from Math.ceil into 0.
  return { rulerId: ruler.node.id, mark: mark + 0, x: ruler.origin + mark * ruler.interval };
}

/** The borders' current world x, from the marks of the rulers they sit on; a border whose ruler is gone stays put. */
export function resolveBorders(borders: Borders, rulers: PlacedRuler[]): Borders {
  const resolve = (border: Border) => {
    const ruler = rulers.find((r) => r.node.id === border.rulerId);
    return ruler ? onMark(ruler, border.mark) : border;
  };
  return { left: resolve(borders.left), right: resolve(borders.right) };
}

/**
 * The starting borders on the given ruler: the left one on its leftmost mark in view, the right one on its
 * mark nearest the middle of the view, at least one mark right of the left one.
 */
export function placeBorders(ruler: PlacedRuler, view: View, widthPx: number): Borders {
  const left = Math.ceil((toWorld(view, 0) - ruler.origin) / ruler.interval - EPSILON);
  const middle = Math.round((toWorld(view, widthPx / 2) - ruler.origin) / ruler.interval);
  return { left: onMark(ruler, left), right: onMark(ruler, Math.max(left + 1, middle)) };
}

/**
 * Moves one border (with current world x, see resolveBorders) this many marks of the given ruler to the right
 * (positive) or left, putting it on that ruler. From a position between two of its marks, the first step goes
 * to the neighbouring mark. Neither border gets onto or past the other: such a move leaves the borders as they are.
 */
export function moveBorder(borders: Borders, ruler: PlacedRuler, side: BorderSide, offset: number): Borders {
  const t = (borders[side].x - ruler.origin) / ruler.interval;
  const mark = offset > 0 ? Math.floor(t + EPSILON) + offset : Math.ceil(t - EPSILON) + offset;
  const moved = onMark(ruler, mark);
  const tolerance = EPSILON * ruler.interval;
  if (side === 'left' ? moved.x >= borders.right.x - tolerance : moved.x <= borders.left.x + tolerance) return borders;
  return { ...borders, [side]: moved };
}
