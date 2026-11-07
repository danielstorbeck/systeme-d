import { describe, expect, it } from 'vitest';
import { DEFAULT_DRUM_PITCH, DRUMS, drumFor, stepDrum } from '../drums';
import { noteName } from '../pitch';

describe('drums', () => {
  it('list the kit in Pitch-list order with General MIDI note numbers', () => {
    expect(DRUMS.map((d) => d.name)).toEqual(['bd', 'sn', 'ho', 'hc', 't1', 't2', 't3', 'cr', 'rd']);
    expect(DRUMS.map((d) => d.pitch)).toEqual([36, 38, 46, 42, 50, 47, 43, 49, 51]);
    expect(drumFor(DEFAULT_DRUM_PITCH).name).toBe('bd');
  });

  it('play other pitches as the kick', () => {
    expect(drumFor(38).name).toBe('sn');
    expect(drumFor(60).name).toBe('bd');
  });

  it('step through the kit in list order, up the list for positive steps, stopping at the ends', () => {
    expect(stepDrum(36, -1)).toBe(38);
    expect(stepDrum(46, 1)).toBe(38);
    expect(stepDrum(38, -3)).toBe(50);
    expect(stepDrum(36, 2)).toBe(36);
    expect(stepDrum(51, -1)).toBe(51);
    expect(stepDrum(60, -1)).toBe(38);
  });

  it('name blocks in drum lanes by their drum', () => {
    expect(noteName(42, 'drums')).toBe('hc');
    expect(noteName(42, 'sine')).toBe('2 F♯');
  });
});
