import type { Lane } from './lanes';
import type { OrderedRuler } from './rulers';

/** The main ruler needs room for its numbers above the marks; sub-rulers are never numbered. */
const MAIN_ROW = { height: 56, baseline: 44 };
const SUB_ROW = { height: 36, baseline: 26 };

/** Height of the labels and plus buttons. */
export const CONTROL_SIZE_PX = 22;
/** Controls sit next to the marks, which rise from the baseline. */
const CONTROL_RAISE_PX = 18;
export const LABEL_WIDTH_PX = 60;
/** Each level of derivation indents the label by this much. */
const INDENT_PX = 14;
export const GUTTER_PADDING_PX = 8;
/** Space right of the rulers that holds the delete and plus buttons. */
export const RIGHT_GUTTER_PX = 68;
const BUTTON_GAP_PX = 4;
const BUTTON_MARGIN_PX = (RIGHT_GUTTER_PX - 2 * CONTROL_SIZE_PX - BUTTON_GAP_PX) / 2;
/** Distances from the right edge of the window. */
export const PLUS_BUTTON_RIGHT_PX = BUTTON_MARGIN_PX;
export const DELETE_BUTTON_RIGHT_PX = BUTTON_MARGIN_PX + CONTROL_SIZE_PX + BUTTON_GAP_PX;
const CONNECTOR_COLOR_COUNT = 6;

export interface Row extends OrderedRuler {
  top: number;
  bottom: number;
  baselineY: number;
  /** Top of the label and plus button. */
  controlTop: number;
  labelLeft: number;
}

export function layoutRows(ordered: OrderedRuler[]): Row[] {
  let top = 0;
  return ordered.map((ruler) => {
    const shape = ruler.node.parentId === null ? MAIN_ROW : SUB_ROW;
    const rowTop = top;
    const baselineY = top + shape.baseline;
    top += shape.height;
    return {
      ...ruler,
      top: rowTop,
      bottom: top,
      baselineY,
      controlTop: baselineY - CONTROL_RAISE_PX,
      labelLeft: GUTTER_PADDING_PX + ruler.depth * INDENT_PX,
    };
  });
}

/** Space between the rulers and the first lane. */
const LANES_GAP_PX = 32;
/** About the height of a text input. */
export const LANE_HEIGHT_PX = 28;
const LANE_SPACING_PX = 8;

export interface LaneRow {
  lane: Lane;
  /** Top of the part holding the blocks, LANE_HEIGHT_PX high. */
  top: number;
  /** With segmentation on, top of the part above the blocks holding the segment lines, LANE_HEIGHT_PX high. */
  segmentTop: number | null;
}

/**
 * Lanes are stacked below the rulers, between them and the tool bar. With segmentation on, each lane is twice
 * as high: the segment lines on top, the blocks below.
 */
export function layoutLanes(lanes: Lane[], rows: Row[], segmentation = false): LaneRow[] {
  const rulersBottom = rows.length > 0 ? rows[rows.length - 1].bottom : 0;
  const laneHeight = (segmentation ? 2 : 1) * LANE_HEIGHT_PX;
  return lanes.map((lane, i) => {
    const laneTop = rulersBottom + LANES_GAP_PX + i * (laneHeight + LANE_SPACING_PX);
    return segmentation
      ? { lane, top: laneTop + LANE_HEIGHT_PX, segmentTop: laneTop }
      : { lane, top: laneTop, segmentTop: null };
  });
}

/** The lane whose segment part contains y, if segmentation is on. */
export function segmentRowAt(laneRows: LaneRow[], y: number): LaneRow | undefined {
  return laneRows.find(({ segmentTop }) => segmentTop !== null && y >= segmentTop && y < segmentTop + LANE_HEIGHT_PX);
}

export function rowAt(rows: Row[], y: number): Row | undefined {
  return rows.find((row) => y >= row.top && y < row.bottom);
}

/** Width of the left margin holding the labels and connector lines; the rulers start right of it. */
export function leftGutterWidth(rows: Row[]): number {
  const maxDepth = Math.max(0, ...rows.map((r) => r.depth));
  return 2 * GUTTER_PADDING_PX + maxDepth * INDENT_PX + LABEL_WIDTH_PX;
}

/** SVG path from below the parent's label down and across to the child's label. */
export function connectorPath(parent: Row, child: Row): string {
  const x = parent.labelLeft + 6.5;
  const fromY = parent.controlTop + CONTROL_SIZE_PX;
  const toY = child.controlTop + CONTROL_SIZE_PX / 2 + 0.5;
  return `M ${x} ${fromY} V ${toY} H ${child.labelLeft}`;
}

/** Each ruler has a colour, used for its label's edge and for the lines to the rulers derived from it. */
export function rulerColor(id: number): string {
  return `var(--ruler-color-${id % CONNECTOR_COLOR_COUNT})`;
}
