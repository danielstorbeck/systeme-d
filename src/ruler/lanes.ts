import type { Chord } from '../chord';
import type { Grid } from './rulers';
import { DEFAULT_KEY, type Key } from '../keys';
import { clampPitch } from '../pitch';
import { DEFAULT_SOUND, type Sound } from '../sound';
import { FIRST_MARK } from './viewport';

export type { Grid };

/** A horizontal strip below the rulers that starts at mark 1 of the main ruler and is open to the right. */
export interface Lane {
  id: number;
  name: string;
  key: Key;
  /** The waveform its blocks sound with, or the drum kit. */
  sound: Sound;
  /** Loudness in percent, 0 to 100. */
  volume: number;
  /** World x of the lines dividing the lane into segments, in order; shown while segmentation is on. */
  segments: number[];
}

/** A rectangle inside a lane, spanning whole intervals of the ruler that was selected when it was drawn. */
export interface Block {
  id: number;
  laneId: number;
  /** World x of the left and right edge. */
  start: number;
  end: number;
  /** The ruler chain in the pool that the block was drawn with; it outlives the ruler itself. */
  chainId: number;
  /** MIDI note number. */
  pitch: number;
  /** What it sings in a voice lane, in X-SAMPA; other lanes keep it for when they become voice lanes. */
  text: string;
  /** Further notes in semitones above the pitch, played with it in melodic lanes; empty for a single note. */
  chord: Chord;
}

/** What a block holds besides its place. */
export type BlockContent = Pick<Block, 'pitch' | 'text' | 'chord'>;

/** Every lane starts at half volume, which leaves room to make one lane stand out. */
export const DEFAULT_VOLUME = 50;

export function isVolume(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
}

/** Appends a lane in C major with a sine sound at half volume, named "Lane <n>", n counting the lanes created so far. */
export function addLane(lanes: Lane[], id: number, number: number): Lane[] {
  return [...lanes, { id, name: `Lane ${number}`, key: DEFAULT_KEY, sound: DEFAULT_SOUND, volume: DEFAULT_VOLUME, segments: [] }];
}

export function renameLane(lanes: Lane[], id: number, name: string): Lane[] {
  return lanes.map((lane) => (lane.id === id ? { ...lane, name } : lane));
}

export function setLaneKey(lanes: Lane[], id: number, key: Key): Lane[] {
  return lanes.map((lane) => (lane.id === id ? { ...lane, key } : lane));
}

export function setLaneSound(lanes: Lane[], id: number, sound: Sound): Lane[] {
  return lanes.map((lane) => (lane.id === id ? { ...lane, sound } : lane));
}

/**
 * The id of the lane this many places below (positive) or above the given one, or the given id itself if
 * there is no lane there. Without a given lane, the top lane.
 */
export function neighbourLane(lanes: Lane[], id: number | null, offset: number): number | null {
  const i = lanes.findIndex((lane) => lane.id === id);
  if (i < 0) return lanes.length > 0 ? lanes[0].id : null;
  return lanes[i + offset]?.id ?? lanes[i].id;
}

/** Swaps a lane with the one below (offset 1) or above (offset -1); unchanged if there is none. */
export function moveLane(lanes: Lane[], id: number, offset: number): Lane[] {
  const i = lanes.findIndex((lane) => lane.id === id);
  const j = i + offset;
  if (i < 0 || j < 0 || j >= lanes.length) return lanes;
  const moved = [...lanes];
  [moved[i], moved[j]] = [moved[j], moved[i]];
  return moved;
}

/** Sets a lane's volume, kept within 0 to 100 percent. */
export function setLaneVolume(lanes: Lane[], id: number, volume: number): Lane[] {
  const clamped = Math.min(100, Math.max(0, Math.round(volume)));
  return lanes.map((lane) => (lane.id === id ? { ...lane, volume: clamped } : lane));
}

/** Turns a lane's volume up (positive) or down by this many percentage points. */
export function changeLaneVolume(lanes: Lane[], id: number, percent: number): Lane[] {
  const lane = lanes.find((l) => l.id === id);
  return lane ? setLaneVolume(lanes, id, lane.volume + percent) : lanes;
}

export function setBlockText(blocks: Block[], id: number, text: string): Block[] {
  return blocks.map((block) => (block.id === id ? { ...block, text } : block));
}

export function setBlockChord(blocks: Block[], id: number, chord: Chord): Block[] {
  return blocks.map((block) => (block.id === id ? { ...block, chord } : block));
}

/** Sets a block's pitch, kept within the MIDI range. */
export function setBlockPitch(blocks: Block[], id: number, pitch: number): Block[] {
  return blocks.map((block) => (block.id === id ? { ...block, pitch: clampPitch(pitch) } : block));
}

/** Index of the interval of the grid that contains world x. */
export function intervalIndex(grid: Grid, x: number): number {
  return Math.floor((x - grid.origin) / grid.interval);
}

/**
 * The intervals a new block anchored at interval k may cover: from the lane's left end or the nearest
 * block on the left up to the nearest block on the right. Null if interval k itself isn't free.
 * `blocks` are the blocks of the lane in question.
 */
export function freeIntervals(grid: Grid, blocks: Block[], k: number): { min: number; max: number } | null {
  const { origin, interval } = grid;
  // Tolerance for edges that should coincide but differ by floating point noise.
  const tolerance = interval * 1e-6;
  const start = origin + k * interval;
  const end = start + interval;
  if (start < FIRST_MARK - tolerance) return null;
  if (blocks.some((b) => b.start < end - tolerance && b.end > start + tolerance)) return null;

  const leftLimit = Math.max(FIRST_MARK, ...blocks.filter((b) => b.end <= start + tolerance).map((b) => b.end));
  const rightStarts = blocks.filter((b) => b.start >= end - tolerance).map((b) => b.start);
  const min = Math.ceil((leftLimit - origin) / interval - 1e-6);
  const max = rightStarts.length > 0 ? Math.floor((Math.min(...rightStarts) - origin) / interval + 1e-6) - 1 : Infinity;
  return { min, max };
}

/** The edges of a block reaching from interval `anchor` to interval `current`, kept within `free`. */
export function blockSpan(
  grid: Grid,
  anchor: number,
  current: number,
  free: { min: number; max: number },
): { start: number; end: number } {
  const from = Math.max(free.min, Math.min(anchor, current));
  const to = Math.min(free.max, Math.max(anchor, current));
  return { start: grid.origin + from * grid.interval, end: grid.origin + (to + 1) * grid.interval };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const centre = (b: Block) => (b.start + b.end) / 2;

/**
 * The block to move the highlight to from block `fromId`: the neighbour on the same lane for left/right,
 * the horizontally nearest block on the nearest lane above/below that has blocks for up/down.
 * Undefined when there is no block in that direction. `laneIds` lists the lanes top to bottom.
 */
export function neighbourBlock(
  blocks: Block[],
  laneIds: number[],
  fromId: number,
  direction: Direction,
): Block | undefined {
  const from = blocks.find((b) => b.id === fromId);
  if (!from) return undefined;

  if (direction === 'left' || direction === 'right') {
    const sameLane = blocks.filter((b) => b.laneId === from.laneId && b.id !== from.id);
    const candidates =
      direction === 'left'
        ? sameLane.filter((b) => centre(b) < centre(from)).sort((a, b) => centre(b) - centre(a))
        : sameLane.filter((b) => centre(b) > centre(from)).sort((a, b) => centre(a) - centre(b));
    return candidates[0];
  }

  const step = direction === 'up' ? -1 : 1;
  for (let i = laneIds.indexOf(from.laneId) + step; i >= 0 && i < laneIds.length; i += step) {
    const onLane = blocks.filter((b) => b.laneId === laneIds[i]);
    if (onLane.length > 0) {
      return onLane.reduce((best, b) =>
        Math.abs(centre(b) - centre(from)) < Math.abs(centre(best) - centre(from)) ? b : best,
      );
    }
  }
  return undefined;
}

/**
 * The edges of block `id` after moving one of them this many marks of the grid to the right (positive) or left.
 * From a position between two marks, the first step goes to the neighbouring mark. Undefined if the edge can't
 * move there: past the lane's left end, onto another block of the lane, or leaving the block narrower than one
 * interval of the grid.
 */
export function resizeBlock(
  blocks: Block[],
  id: number,
  grid: Grid,
  side: 'left' | 'right',
  offset: number,
): { start: number; end: number } | undefined {
  const block = blocks.find((b) => b.id === id);
  if (!block) return undefined;
  const { origin, interval } = grid;
  const tolerance = interval * 1e-6;
  const t = ((side === 'left' ? block.start : block.end) - origin) / interval;
  const mark = offset > 0 ? Math.floor(t + 1e-6) + offset : Math.ceil(t - 1e-6) + offset;
  const x = origin + mark * interval;
  const others = blocks.filter((b) => b.laneId === block.laneId && b.id !== id);
  if (side === 'left') {
    const leftLimit = Math.max(FIRST_MARK, ...others.filter((b) => b.end <= block.start + tolerance).map((b) => b.end));
    if (x < leftLimit - tolerance || block.end - x < interval - tolerance) return undefined;
    return { start: x, end: block.end };
  }
  const rightLimit = Math.min(Infinity, ...others.filter((b) => b.start >= block.end - tolerance).map((b) => b.start));
  if (x > rightLimit + tolerance || x - block.start < interval - tolerance) return undefined;
  return { start: block.start, end: x };
}

/** What copying a block keeps: everything but its place, with its length in intervals of the ruler it was drawn with. */
export interface CopiedBlock extends BlockContent {
  intervals: number;
}

/** Copies a block drawn with the ruler whose marks are `grid`. */
export function copyBlock(block: Block, grid: Grid): CopiedBlock {
  const intervals = (block.end - block.start) / grid.interval;
  const whole = Math.round(intervals);
  return { pitch: block.pitch, text: block.text, chord: block.chord, intervals: Math.abs(intervals - whole) < 1e-6 ? whole : intervals };
}

/**
 * The place the paste cursor covers: from the mark of the grid nearest x, but not left of the lane's start, as
 * many intervals of the grid long as the copied block.
 */
export function cursorSpan(grid: Grid, x: number, intervals: number): { start: number; end: number } {
  const { origin, interval } = grid;
  const first = Math.ceil((FIRST_MARK - origin) / interval - 1e-6);
  const start = origin + Math.max(first, Math.round((x - origin) / interval)) * interval;
  return { start, end: start + intervals * interval };
}

/** Whether no block of the lane overlaps the span. */
export function isFree(blocks: Block[], laneId: number, span: { start: number; end: number }): boolean {
  const tolerance = (span.end - span.start) * 1e-6;
  return !blocks.some((b) => b.laneId === laneId && b.start < span.end - tolerance && b.end > span.start + tolerance);
}

/** A lane's vertical place on the canvas, in pixels. */
export interface LaneSpan {
  laneId: number;
  top: number;
  height: number;
}

/**
 * Of the blocks at least partly in view (a widthPx × heightPx area, x from world to screen by toX), the one
 * whose visible part's centre is nearest the middle of the view; undefined if none is in view.
 */
export function centreMostBlock(
  blocks: Block[],
  lanes: LaneSpan[],
  toX: (worldX: number) => number,
  widthPx: number,
  heightPx: number,
): Block | undefined {
  let best: Block | undefined;
  let bestDistance = Infinity;
  for (const block of blocks) {
    const lane = lanes.find((l) => l.laneId === block.laneId);
    if (!lane) continue;
    const left = Math.max(0, toX(block.start));
    const right = Math.min(widthPx, toX(block.end));
    const top = Math.max(0, lane.top);
    const bottom = Math.min(heightPx, lane.top + lane.height);
    if (left >= right || top >= bottom) continue;
    const distance = Math.hypot((left + right) / 2 - widthPx / 2, (top + bottom) / 2 - heightPx / 2);
    if (distance < bestDistance) {
      best = block;
      bestDistance = distance;
    }
  }
  return best;
}

export function blockAt(blocks: Block[], laneId: number, x: number): Block | undefined {
  return blocks.find((b) => b.laneId === laneId && x >= b.start && x <= b.end);
}
