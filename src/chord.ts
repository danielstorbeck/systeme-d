import { isPitch, MAX_PITCH } from './pitch';

/**
 * A block's chord: further notes sounding with its pitch, each given in semitones above it (below if negative),
 * e.g. [4, 7] makes a major triad on the pitch. Only melodic sounds play it; drum and voice lanes keep it for
 * when they become melodic again.
 */
export type Chord = number[];

/** More notes than this would be a cluster rather than a chord. */
export const MAX_CHORD_NOTES = 12;

export function isChord(value: unknown): value is Chord {
  return (
    Array.isArray(value) &&
    value.length <= MAX_CHORD_NOTES &&
    value.every((n) => Number.isInteger(n) && Math.abs(n) <= MAX_PITCH)
  );
}

/** Reads integers separated by spaces, e.g. "4 7"; empty means no chord. Null if it isn't a chord. */
export function parseChord(text: string): Chord | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  if (!/^-?\d+(\s+-?\d+)*$/.test(trimmed)) return null;
  const chord = trimmed.split(/\s+/).map(Number);
  return isChord(chord) ? chord : null;
}

export function formatChord(chord: Chord): string {
  return chord.join(' ');
}

/** The pitches that sound: the pitch itself and the chord's notes above it, without repeats or notes outside MIDI. */
export function chordPitches(pitch: number, chord: Chord): number[] {
  return [...new Set([pitch, ...chord.map((n) => pitch + n)])].filter(isPitch);
}
