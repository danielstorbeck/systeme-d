import { drumFor } from './drums';
import { DEFAULT_KEY, type Key } from './keys';
import type { Sound } from './sound';

/** Pitches are MIDI note numbers: 0 is C in octave −1, 60 is middle C. */
export const MIN_PITCH = 0;
export const MAX_PITCH = 127;
/** New blocks start at middle C. */
export const DEFAULT_PITCH = 60;

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Pitch class of each natural letter. */
const LETTER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** A written note: a letter (index into LETTERS) with an accidental in semitones (−2 … 2). */
interface Spelling {
  letter: number;
  accidental: number;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** The accidental that turns the letter into pitch class pc, as the smallest move up or down. */
function accidentalFor(letter: number, pc: number): number {
  const diff = mod12(pc - LETTER_PITCH_CLASSES[letter]);
  return diff > 6 ? diff - 12 : diff;
}

const pitchClass = ({ letter, accidental }: Spelling) => mod12(LETTER_PITCH_CLASSES[letter] + accidental);

/**
 * How each of the 12 pitch classes is written in the key:
 * - notes of the scale (natural minor for minor keys) as in the key signature;
 * - in minor keys, the raised 6th and 7th degrees (melodic and harmonic minor), e.g. G♯ in a minor;
 * - every other note as a neighbouring scale note raised or lowered, whichever needs fewer accidentals,
 *   preferring sharps in keys with sharps (and in C major / a minor) and flats in keys with flats.
 */
function keySpellings(key: Key): Spelling[] {
  const minor = key[0] === key[0].toLowerCase();
  const tonicLetter = LETTERS.indexOf(key[0].toUpperCase());
  const tonic = { letter: tonicLetter, accidental: key.includes('♯') ? 1 : key.includes('♭') ? -1 : 0 };
  const tonicPc = pitchClass(tonic);
  const scale = (minor ? NATURAL_MINOR_SCALE : MAJOR_SCALE).map((interval, degree): Spelling => {
    const letter = (tonicLetter + degree) % 7;
    return { letter, accidental: accidentalFor(letter, tonicPc + interval) };
  });

  const spellings: (Spelling | undefined)[] = new Array(12);
  for (const note of scale) spellings[pitchClass(note)] = note;
  if (minor) {
    for (const degree of [5, 6]) {
      const raised = { ...scale[degree], accidental: scale[degree].accidental + 1 };
      spellings[pitchClass(raised)] ??= raised;
    }
  }

  const prefersFlats = scale.reduce((sum, note) => sum + note.accidental, 0) < 0;
  for (let pc = 0; pc < 12; pc++) {
    if (spellings[pc]) continue;
    // Major and natural minor scales have only whole and half steps, so both neighbours are scale notes.
    const below = scale.find((note) => pitchClass(note) === mod12(pc - 1))!;
    const above = scale.find((note) => pitchClass(note) === mod12(pc + 1))!;
    const raised = { ...below, accidental: below.accidental + 1 };
    const lowered = { ...above, accidental: above.accidental - 1 };
    const difference = Math.abs(raised.accidental) - Math.abs(lowered.accidental);
    spellings[pc] = difference < 0 || (difference === 0 && !prefersFlats) ? raised : lowered;
  }
  return spellings as Spelling[];
}

const spellingsByKey = new Map<Key, Spelling[]>();

/**
 * Scientific pitch notation with the octave first, spelled as in the key: 60 is "4 C", 61 is "4 C♯" in
 * D major but "4 D♭" in A♭ major. The octave follows the letter, so 59 in C♭ major is "4 C♭" and 60 in
 * C♯ major is "3 B♯".
 */
export function pitchName(pitch: number, key: Key = DEFAULT_KEY): string {
  let spellings = spellingsByKey.get(key);
  if (!spellings) spellingsByKey.set(key, (spellings = keySpellings(key)));
  const { letter, accidental } = spellings[mod12(pitch)];
  const octave = (pitch - accidental - LETTER_PITCH_CLASSES[letter]) / 12 - 1;
  return `${octave} ${LETTERS[letter]}${ACCIDENTALS[accidental]}`;
}

/**
 * How a block is labelled: the drum's acronym in a drum lane, otherwise the note spelled in the lane's key,
 * followed in a voice lane by the sung text, e.g. "4 C, la", and with a waveform by the chord, e.g. "4 C + 4 7".
 */
export function noteName(pitch: number, sound: Sound, key: Key = DEFAULT_KEY, text = '', chord: number[] = []): string {
  if (sound === 'drums') return drumFor(pitch).name;
  if (sound === 'voice') return `${pitchName(pitch, key)}, ${text}`;
  return chord.length > 0 ? `${pitchName(pitch, key)} + ${chord.join(' ')}` : pitchName(pitch, key);
}

/**
 * Reads a typed pitch: <octave><letter><accidental>, e.g. "5a#" (A♯5, 82), "3bb" (B♭3), "4c" (middle C) or
 * "-1c" (0). The accidental is #, ##, x, b or bb (or ♯, ♭); the octave goes with the letter, as in pitchName,
 * so "3b#" is middle C. Null if it isn't a pitch or is outside the MIDI range.
 */
export function parsePitch(text: string): number | null {
  const match = /^\s*(-?\d+)\s*([a-g])\s*(##|#|♯|x|𝄪|bb|b|♭|𝄫)?\s*$/i.exec(text);
  if (!match) return null;
  const accidentals: Record<string, number> = { '#': 1, '♯': 1, '##': 2, x: 2, '𝄪': 2, b: -1, '♭': -1, bb: -2, '𝄫': -2 };
  const letter = LETTERS.indexOf(match[2].toUpperCase());
  const accidental = match[3] ? accidentals[match[3].toLowerCase()] : 0;
  const pitch = (Number(match[1]) + 1) * 12 + LETTER_PITCH_CLASSES[letter] + accidental;
  return isPitch(pitch) ? pitch : null;
}

export function clampPitch(pitch: number): number {
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.round(pitch)));
}

export function isPitch(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_PITCH && (value as number) <= MAX_PITCH;
}
