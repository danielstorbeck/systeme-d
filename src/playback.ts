import type { Block } from './ruler/lanes';

/** Playback speed in beats per minute; a beat is a quarter of the interval between two main-ruler marks. */
export const DEFAULT_BPM = 120;
export const MIN_BPM = 1;
export const MAX_BPM = 1000;
export const BEATS_PER_MARK = 4;

export function isBpm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM;
}

/** Accepts a number (decimals allowed) from MIN_BPM to MAX_BPM; returns null for anything else. */
export function parseBpm(text: string): number | null {
  if (!/^\s*\d+(\.\d+)?\s*$/.test(text)) return null;
  const bpm = Number(text);
  return isBpm(bpm) ? bpm : null;
}

/** How far the cursor moves along the main ruler per second, in marks. */
export function marksPerSecond(bpm: number): number {
  return bpm / 60 / BEATS_PER_MARK;
}

/** Blocks the cursor is over: a block sounds from its start up to, but not including, its end. */
export function blocksUnder(blocks: Block[], x: number): Block[] {
  return blocks.filter((block) => block.start <= x && x < block.end);
}

/** Where playback ends: the end of the last block, or undefined when there are no blocks. */
export function playbackEnd(blocks: Block[]): number | undefined {
  return blocks.length === 0 ? undefined : Math.max(...blocks.map((block) => block.end));
}

/** Where playback resumes: at the playhead if it lies inside the region, otherwise at the region's start. */
export function resumePosition(playhead: number | null, start: number, end: number | undefined): number {
  return playhead !== null && playhead >= start && end !== undefined && playhead < end ? playhead : start;
}
