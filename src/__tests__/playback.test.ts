import { describe, expect, it } from 'vitest';
import { blocksUnder, DEFAULT_BPM, marksPerSecond, parseBpm, playbackEnd, resumePosition } from '../playback';
import type { Block } from '../ruler/lanes';

const block = (id: number, start: number, end: number): Block => ({ id, laneId: 1, start, end, chainId: 1, pitch: 60, text: 'la', chord: [] });

describe('playback', () => {
  it('moves one mark per four beats', () => {
    expect(DEFAULT_BPM).toBe(120);
    expect(marksPerSecond(120)).toBe(0.5);
    expect(marksPerSecond(240)).toBe(1);
  });

  it('parses the BPM field', () => {
    expect(parseBpm('120')).toBe(120);
    expect(parseBpm(' 92.5 ')).toBe(92.5);
    for (const text of ['', '0', '-60', '1e3', 'fast', '1001']) expect(parseBpm(text)).toBeNull();
  });

  it('finds the blocks under the cursor, including their start and excluding their end', () => {
    const blocks = [block(1, 1, 2), block(2, 2, 4), block(3, 1.5, 3)];
    expect(blocksUnder(blocks, 1).map((b) => b.id)).toEqual([1]);
    expect(blocksUnder(blocks, 2).map((b) => b.id)).toEqual([2, 3]);
    expect(blocksUnder(blocks, 4)).toEqual([]);
  });

  it('ends after the last block', () => {
    expect(playbackEnd([block(1, 1, 2), block(2, 5, 7), block(3, 3, 6)])).toBe(7);
    expect(playbackEnd([])).toBeUndefined();
  });
});

describe('resumePosition', () => {
  it('resumes at the playhead inside the region, else at its start', () => {
    expect(resumePosition(null, 3, 9)).toBe(3);
    expect(resumePosition(5.5, 3, 9)).toBe(5.5);
    expect(resumePosition(2, 3, 9)).toBe(3);
    expect(resumePosition(9, 3, 9)).toBe(3);
    expect(resumePosition(5, 3, undefined)).toBe(3);
  });
});
