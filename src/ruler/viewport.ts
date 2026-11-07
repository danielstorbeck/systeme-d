/**
 * The visible part of the ruler.
 * World coordinates: mark i sits at world x = i.
 */
export interface View {
  /** World x shown at the left edge of the canvas. */
  offsetX: number;
  /** Pixels per world unit, i.e. the pixel distance between neighbouring marks. */
  scale: number;
}

/** Number of the ruler's leftmost mark, its left end. */
export const FIRST_MARK = 1;
/** How far (in px) the first mark may sit right of the canvas' left edge. */
export const LEFT_PADDING_PX = 24;
export const MIN_SCALE = 0.01;
export const MAX_SCALE = 2000;

/** Fallback view, used until the canvas size is known. */
export const INITIAL_VIEW: View = { offsetX: FIRST_MARK - LEFT_PADDING_PX / 20, scale: 20 };

export function toScreen(view: View, worldX: number): number {
  return (worldX - view.offsetX) * view.scale;
}

export function toWorld(view: View, screenX: number): number {
  return screenX / view.scale + view.offsetX;
}

/** Keeps the zoom inside its limits and stops the ruler's left end from moving past the padding. */
export function clampView(view: View): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  const offsetX = Math.max(view.offsetX, FIRST_MARK - LEFT_PADDING_PX / scale);
  return { offsetX, scale };
}

/** Moves the ruler's content by dxPx pixels (positive = content moves right). */
export function panBy(view: View, dxPx: number): View {
  return clampView({ offsetX: view.offsetX - dxPx / view.scale, scale: view.scale });
}

/** Zooms by factor while keeping the world point under screenX fixed. */
export function zoomAt(view: View, screenX: number, factor: number): View {
  const anchor = toWorld(view, screenX);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  return clampView({ offsetX: anchor - screenX / scale, scale });
}

/** Keeps the zoom and scrolls so that the given main-ruler mark sits at the left end, like mark 1 does at the start. */
export function scrollToMark(view: View, mark: number): View {
  return clampView({ offsetX: mark - LEFT_PADDING_PX / view.scale, scale: view.scale });
}

/** View showing the first `count` marks across widthPx, with LEFT_PADDING_PX on both sides. */
export function fitFirstMarks(count: number, widthPx: number): View {
  const scale = (widthPx - 2 * LEFT_PADDING_PX) / Math.max(1, count - 1);
  return clampView({ offsetX: FIRST_MARK - LEFT_PADDING_PX / scale, scale });
}
