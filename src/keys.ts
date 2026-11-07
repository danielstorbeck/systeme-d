/**
 * The keys of the circle of fifths: major keys in upper case, minor keys in lower case. Enharmonic
 * equivalents (B = C♭, F♯ = G♭, C♯ = D♭ and their relative minors) are separate keys, listed next to each other.
 * Each group goes clockwise from no accidentals, through the sharp keys, to the flat keys.
 */
export const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'C♭', 'F♯', 'G♭', 'C♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'] as const;
export const MINOR_KEYS = ['a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'a♭', 'd♯', 'e♭', 'a♯', 'b♭', 'f', 'c', 'g', 'd'] as const;

export type Key = (typeof MAJOR_KEYS)[number] | (typeof MINOR_KEYS)[number];

/** Every lane starts in C major. */
export const DEFAULT_KEY: Key = 'C';

const ALL_KEYS: readonly string[] = [...MAJOR_KEYS, ...MINOR_KEYS];

export function isKey(value: unknown): value is Key {
  return typeof value === 'string' && ALL_KEYS.includes(value);
}
