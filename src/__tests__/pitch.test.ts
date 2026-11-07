import { describe, expect, it } from 'vitest';
import { MAJOR_KEYS, MINOR_KEYS, type Key } from '../keys';
import { clampPitch, isPitch, parsePitch, pitchName } from '../pitch';

/** The names of the 12 pitches from middle C up, in the key. */
const octave = (key: Key) => Array.from({ length: 12 }, (_, i) => pitchName(60 + i, key));

describe('pitch', () => {
  it('names MIDI notes with the octave before the letter', () => {
    expect(pitchName(0)).toBe('-1 C');
    expect(pitchName(11)).toBe('-1 B');
    expect(pitchName(60)).toBe('4 C');
    expect(pitchName(69)).toBe('4 A');
    expect(pitchName(127)).toBe('9 G');
  });

  it('spells the scale notes as the key signature does', () => {
    expect(octave('D')).toEqual(expect.arrayContaining(['4 F♯', '4 C♯']));
    expect(octave('F♯')).toEqual(expect.arrayContaining(['4 E♯', '4 A♯']));
    expect(octave('A♭')).toEqual(expect.arrayContaining(['4 D♭', '4 A♭', '4 B♭', '4 E♭']));
    expect(octave('G♭')).toEqual(expect.arrayContaining(['5 C♭', '4 G♭'])); // C♭5 sounds as B4
    expect(octave('b♭')).toEqual(expect.arrayContaining(['4 D♭', '4 G♭']));
  });

  it('spells enharmonic keys differently', () => {
    expect(pitchName(66, 'F♯')).toBe('4 F♯');
    expect(pitchName(66, 'G♭')).toBe('4 G♭');
    expect(pitchName(68, 'g♯')).toBe('4 G♯');
    expect(pitchName(68, 'a♭')).toBe('4 A♭');
  });

  it('uses sharps outside the scale in sharp keys and flats in flat keys', () => {
    expect(octave('C')).toEqual(['4 C', '4 C♯', '4 D', '4 D♯', '4 E', '4 F', '4 F♯', '4 G', '4 G♯', '4 A', '4 A♯', '4 B']);
    expect(octave('F')).toEqual(['4 C', '4 D♭', '4 D', '4 E♭', '4 E', '4 F', '4 G♭', '4 G', '4 A♭', '4 A', '4 B♭', '4 B']);
  });

  it('prefers a natural to a double accidental outside the scale', () => {
    expect(pitchName(67, 'F♯')).toBe('4 G');
    expect(pitchName(62, 'C♭')).toBe('4 D'); // not E𝄫
    expect(pitchName(64, 'C♭')).toBe('4 F♭'); // a scale note
  });

  it('spells the raised 6th and 7th of minor keys from the scale', () => {
    expect(pitchName(68, 'a')).toBe('4 G♯');
    expect(pitchName(61, 'd')).toBe('4 C♯');
    expect(pitchName(71, 'c')).toBe('4 B');
    expect(pitchName(69, 'a♯')).toBe('4 G𝄪');
  });

  it('takes the octave from the letter', () => {
    expect(pitchName(59, 'C♭')).toBe('4 C♭');
    expect(pitchName(60, 'C♯')).toBe('3 B♯');
    expect(pitchName(0, 'C♯')).toBe('-2 B♯');
  });

  it('gives 12 distinct names in every key', () => {
    for (const key of [...MAJOR_KEYS, ...MINOR_KEYS]) {
      expect(new Set(octave(key)).size).toBe(12);
    }
  });

  it('stays within the MIDI range', () => {
    expect(clampPitch(-3)).toBe(0);
    expect(clampPitch(130)).toBe(127);
    expect(isPitch(127)).toBe(true);
    expect(isPitch(128)).toBe(false);
    expect(isPitch(60.5)).toBe(false);
  });
});

describe('typing a pitch', () => {
  it('reads <octave><letter><accidental>', () => {
    expect(parsePitch('4c')).toBe(60);
    expect(parsePitch('5a#')).toBe(82);
    expect(parsePitch('5A♯')).toBe(82);
    expect(parsePitch('3bb')).toBe(58);
    expect(parsePitch('3b')).toBe(59);
    expect(parsePitch('4ebb')).toBe(62);
    expect(parsePitch('4fx')).toBe(67);
    expect(parsePitch(' 4 g ## ')).toBe(69);
    expect(parsePitch('-1c')).toBe(0);
  });

  it('keeps the octave with the letter, as pitch names do', () => {
    expect(parsePitch('3b#')).toBe(60);
    expect(parsePitch('4cb')).toBe(59);
  });

  it('rejects what is not a pitch or is outside the MIDI range', () => {
    expect(parsePitch('')).toBeNull();
    expect(parsePitch('5h')).toBeNull();
    expect(parsePitch('a#')).toBeNull();
    expect(parsePitch('5a###')).toBeNull();
    expect(parsePitch('-1cb')).toBeNull();
    expect(parsePitch('9a')).toBeNull();
  });
});
