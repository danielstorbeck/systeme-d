import { describe, expect, it } from 'vitest';
import type { Block, Lane } from '../ruler/lanes';
import { scoreFileName } from '../project';
import { barsOf, chooseClefs, exportScore, lilyPitch, noteValues, timeSignature, toFraction } from '../score';

const lane = (id: number, extra: Partial<Lane> = {}): Lane => ({
  id,
  name: `Lane ${id}`,
  key: 'C',
  sound: 'sine',
  volume: 80,
  segments: [],
  ...extra,
});
let nextId = 1;
/** A block from start to end, in main-ruler intervals counted from mark 1. */
const block = (laneId: number, start: number, end: number, pitch = 60, extra: Partial<Block> = {}): Block => ({
  id: nextId++,
  laneId,
  start: 1 + start,
  end: 1 + end,
  chainId: 1,
  pitch,
  text: 'la',
  chord: [],
  ...extra,
});
/** The music lines of the staves, without the heading. */
const music = (score: string) =>
  score
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('|'));

describe('fractions and note values', () => {
  it('finds exact fractions behind floating-point positions', () => {
    expect(toFraction(1 / 3 + 1 / 5)).toEqual({ n: 8, d: 15 });
    expect(toFraction(0.375)).toEqual({ n: 3, d: 8 });
  });
  it('writes binary lengths with dots and ties', () => {
    expect(noteValues({ n: 3, d: 4 })).toEqual(['2.']);
    expect(noteValues({ n: 5, d: 8 })).toEqual(['2', '8']);
    expect(noteValues({ n: 2, d: 1 })).toEqual(['\\breve']);
  });
  it('writes time signatures in quarters for bars of a half or more', () => {
    expect(timeSignature({ n: 1, d: 1 })).toBe('\\time 4/4');
    expect(timeSignature({ n: 3, d: 4 })).toBe('\\time 3/4');
    expect(timeSignature({ n: 1, d: 2 })).toBe('\\time 2/4');
    expect(timeSignature({ n: 5, d: 8 })).toBe('\\time 5/8');
  });
  it('spells pitches in the key, in absolute octaves', () => {
    expect(lilyPitch(60, 'C')).toBe("c'");
    expect(lilyPitch(61, 'D')).toBe("cis'");
    expect(lilyPitch(61, 'A♭')).toBe("des'");
    expect(lilyPitch(36, 'C')).toBe('c,');
    expect(lilyPitch(48, 'C')).toBe('c');
  });
});

describe('bars', () => {
  it('are main-ruler intervals without segment lines', () => {
    expect(barsOf([], { n: 5, d: 2 }).map((b) => b.end)).toEqual([
      { n: 1, d: 1 },
      { n: 2, d: 1 },
      { n: 3, d: 1 },
    ]);
  });
  it('follow the segment lines, repeating the last segment', () => {
    const bars = barsOf([1.75, 2.5], { n: 2, d: 1 });
    expect(bars.map((b) => `${b.end.n}/${b.end.d}`)).toEqual(['3/4', '3/2', '9/4']);
  });
});

describe('clefs', () => {
  it('take the clef of the register and change it only when worth it', () => {
    expect(chooseClefs([[72, 76], [40, 36], [], [74]])).toEqual(['treble', 'bass', 'bass', 'bass']);
    expect(chooseClefs([[72, 74, 76], [36, 38, 40, 41], [36, 38, 40, 41], [76, 79]])).toEqual(['treble', 'bass', 'bass', 'treble']);
    expect(chooseClefs([[76], [64], [79]])).toEqual(['treble', 'treble', 'treble']);
  });
});

describe('exportScore', () => {
  it('is undefined without blocks', () => {
    expect(exportScore('x', [lane(1)], [], 120)).toBeUndefined();
  });

  it('writes the header, tempo, key, time and clef, and the notes bar by bar', () => {
    const score = exportScore('My "song"', [lane(1, { key: 'G' })], [block(1, 0, 0.25, 67), block(1, 0.5, 1.25, 66)], 96)!;
    expect(score).toContain('title = "My \\"song\\""');
    expect(score).toContain('composer = "Système D"');
    expect(score).toContain('\\tempo 4 = 96');
    expect(score).toContain('\\key g \\major');
    expect(score).toContain('\\clef treble');
    expect(score).toContain('\\new Staff \\with { instrumentName = "Lane 1" }');
    expect(music(score)).toEqual(["g'4 r4 fis'2~ |", "fis'4 r2. |"]);
  });

  it('writes triplets, and nests tuplets where that is simpler', () => {
    const triplets = exportScore('t', [lane(1)], [block(1, 0, 1 / 3), block(1, 1 / 3, 2 / 3), block(1, 2 / 3, 1)], 120)!;
    expect(music(triplets)).toEqual(["\\tuplet 3/2 { c'2 c'2 c'2 } |"]);
    const fifths = [0, 1, 2, 3, 4].map((k) => block(1, 1 / 3 + k / 15, 1 / 3 + (k + 1) / 15));
    const nested = exportScore('n', [lane(1)], [block(1, 0, 1 / 3), ...fifths, block(1, 2 / 3, 1)], 120)!;
    expect(music(nested)).toEqual(["\\tuplet 3/2 { c'2 \\tuplet 5/4 { c'8 c'8 c'8 c'8 c'8 } c'2 } |"]);
  });

  it('follows the segmentation, giving each staff its own time where the bars differ', () => {
    const score = exportScore('s', [lane(1, { segments: [1.75] }), lane(2)], [block(1, 0, 1.5), block(2, 0, 0.5)], 120)!;
    expect(score).toContain('\\time 3/4');
    expect(score).not.toContain('Timing_translator');
    const poly = exportScore('p', [lane(1, { segments: [1.75] }), lane(2, { segments: [2] })], [block(1, 0, 1.5), block(2, 0, 0.5)], 120)!;
    expect(poly).toContain('\\consists "Timing_translator"');
  });

  it('writes drums on a drum staff, chords, and lyrics for voices', () => {
    const score = exportScore(
      'd',
      [lane(1, { sound: 'drums', name: 'Kit' }), lane(2, { sound: 'triangle' }), lane(3, { sound: 'voice' })],
      [
        block(1, 0, 0.25, 36),
        block(1, 0.25, 0.5, 38),
        block(2, 0, 1, 60, { chord: [4, 7] }),
        block(3, 0, 0.5, 72, { text: 'a"' }),
        block(3, 0.5, 1, 74, { text: 'lu:' }),
      ],
      120,
    )!;
    expect(score).toContain('\\new DrumStaff \\with { instrumentName = "Kit" } \\drummode {');
    expect(music(score)).toEqual(['bd4 sn4 r2 |', "<c' e' g'>1 |", "c''2 d''2 |"]);
    expect(score).toContain('\\addlyrics { "a\\"" "lu:" }');
  });

  it('is named like the project file, with .ly', () => {
    expect(scoreFileName('song', new Date(2026, 10, 13, 9, 5, 7))).toBe('song.2026-11-13_09-05-07.ly');
  });
});
