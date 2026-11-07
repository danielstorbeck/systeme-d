import { describe, expect, it } from 'vitest';
import { chordPitches, formatChord, parseChord } from '../chord';
import { noteName } from '../pitch';

describe('chords', () => {
  it('reads integers separated by spaces', () => {
    expect(parseChord('4 7')).toEqual([4, 7]);
    expect(parseChord('  3   7 10 ')).toEqual([3, 7, 10]);
    expect(parseChord('-12')).toEqual([-12]);
    expect(parseChord('')).toEqual([]);
    expect(parseChord('   ')).toEqual([]);
  });

  it('rejects anything else', () => {
    expect(parseChord('4,7')).toBeNull();
    expect(parseChord('4 7.5')).toBeNull();
    expect(parseChord('4 a')).toBeNull();
    expect(parseChord('128')).toBeNull();
    expect(parseChord('1 2 3 4 5 6 7 8 9 10 11 12 13')).toBeNull();
  });

  it('writes a chord back as typed', () => {
    expect(formatChord([4, 7])).toBe('4 7');
    expect(formatChord([])).toBe('');
  });

  it('sounds the pitch with the notes above it, without repeats or notes outside MIDI', () => {
    expect(chordPitches(60, [4, 7])).toEqual([60, 64, 67]);
    expect(chordPitches(60, [])).toEqual([60]);
    expect(chordPitches(60, [0, 12, 12])).toEqual([60, 72]);
    expect(chordPitches(120, [4, 12])).toEqual([120, 124]);
  });

  it('labels a melodic rectangle with its chord, but not a drum or voice rectangle', () => {
    expect(noteName(60, 'sine', 'C', 'la', [4, 7])).toBe('4 C + 4 7');
    expect(noteName(60, 'sine', 'C', 'la', [])).toBe('4 C');
    expect(noteName(60, 'voice', 'C', 'la', [4, 7])).toBe('4 C, la');
    expect(noteName(36, 'drums', 'C', 'la', [4, 7])).toBe('bd');
  });
});
