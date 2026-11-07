/**
 * The sung text of blocks in voice lanes, written in X-SAMPA. Only a subset is understood: the pulmonic
 * consonants and the vowels, with "~" after a vowel making it nasal. Spaces may separate words.
 */

/** New blocks sing "la". */
export const DEFAULT_TEXT = 'la';

export type Manner =
  | 'vowel'
  | 'plosive'
  | 'nasal'
  | 'trill'
  | 'tap'
  | 'fricative'
  | 'lateral-fricative'
  | 'approximant'
  | 'lateral';

type Place =
  | 'bilabial'
  | 'labiodental'
  | 'dental'
  | 'alveolar'
  | 'postalveolar'
  | 'retroflex'
  | 'palatal'
  | 'velar'
  | 'uvular'
  | 'pharyngeal'
  | 'glottal';

/** First three formant frequencies in Hz. */
export type Formants = readonly [number, number, number];

/** Colour of the noise of a fricative or a plosive's burst: a band around frequency, with its loudness. */
export interface Noise {
  frequency: number;
  q: number;
  gain: number;
}

export interface Phone {
  symbol: string;
  manner: Manner;
  voiced: boolean;
  /** A nasal vowel, written with "~". */
  nasal: boolean;
  /** Undefined for glottal sounds, which take the formants of the vowel next to them. */
  formants: Formants | undefined;
  noise: Noise | undefined;
}

// Average adult formants; the vowel chart from close front to open back.
const VOWELS: Record<string, Formants> = {
  i: [280, 2250, 2890],
  y: [280, 1800, 2200],
  '1': [320, 1500, 2400],
  '}': [320, 1400, 2200],
  M: [320, 1300, 2400],
  u: [310, 870, 2250],
  I: [400, 1920, 2560],
  Y: [400, 1650, 2300],
  U: [450, 1030, 2380],
  e: [400, 2100, 2700],
  '2': [400, 1600, 2400],
  '@\\': [450, 1500, 2500],
  '8': [450, 1300, 2400],
  '7': [450, 1100, 2400],
  o: [450, 800, 2600],
  '@': [500, 1500, 2500],
  E: [550, 1770, 2490],
  '9': [550, 1500, 2400],
  '3': [560, 1480, 2520],
  '3\\': [560, 1300, 2400],
  V: [640, 1190, 2390],
  O: [590, 880, 2540],
  '{': [690, 1660, 2490],
  '6': [700, 1350, 2500],
  a: [800, 1450, 2600],
  '&': [750, 1300, 2400],
  A: [750, 1100, 2500],
  Q: [700, 900, 2500],
};

/** Where the formants head during a consonant (its locus), and the colour of its noise. */
const PLACES: Record<Place, { formants: Formants | undefined; noise: Noise }> = {
  bilabial: { formants: [250, 800, 2200], noise: { frequency: 1200, q: 0.5, gain: 0.08 } },
  labiodental: { formants: [250, 1100, 2300], noise: { frequency: 7000, q: 0.6, gain: 0.12 } },
  dental: { formants: [250, 1400, 2600], noise: { frequency: 6500, q: 0.6, gain: 0.1 } },
  alveolar: { formants: [250, 1700, 2600], noise: { frequency: 5500, q: 1.5, gain: 0.3 } },
  postalveolar: { formants: [250, 1900, 2400], noise: { frequency: 3200, q: 1.2, gain: 0.3 } },
  retroflex: { formants: [250, 1600, 1900], noise: { frequency: 3000, q: 1.4, gain: 0.25 } },
  palatal: { formants: [250, 2200, 2900], noise: { frequency: 4000, q: 1, gain: 0.18 } },
  velar: { formants: [250, 1500, 2300], noise: { frequency: 2000, q: 1, gain: 0.16 } },
  uvular: { formants: [400, 1200, 2400], noise: { frequency: 1200, q: 1, gain: 0.14 } },
  pharyngeal: { formants: [650, 1100, 2500], noise: { frequency: 1000, q: 0.7, gain: 0.1 } },
  glottal: { formants: undefined, noise: { frequency: 1500, q: 0.4, gain: 0.1 } },
};

/** Approximants and laterals have formants of their own rather than their place's locus. */
const SONORANT_FORMANTS: Record<string, Formants> = {
  P: [300, 1300, 2300],
  'v\\': [300, 1300, 2300],
  'r\\': [350, 1150, 1600],
  'r\\`': [350, 1100, 1500],
  j: [280, 2200, 3000],
  'M\\': [320, 1200, 2400],
  l: [360, 1100, 2600],
  'l`': [360, 1300, 1900],
  L: [300, 2100, 2800],
  'L\\': [360, 900, 2500],
};

/** Laterals hiss at the sides of the tongue, higher than most fricatives. */
const LATERAL_NOISE: Noise = { frequency: 4000, q: 1, gain: 0.18 };

// The pulmonic consonants of the IPA chart: [symbol, manner, voiced, place].
const CONSONANTS: [string, Manner, boolean, Place][] = [
  ['p', 'plosive', false, 'bilabial'],
  ['b', 'plosive', true, 'bilabial'],
  ['t', 'plosive', false, 'alveolar'],
  ['d', 'plosive', true, 'alveolar'],
  ['t`', 'plosive', false, 'retroflex'],
  ['d`', 'plosive', true, 'retroflex'],
  ['c', 'plosive', false, 'palatal'],
  ['J\\', 'plosive', true, 'palatal'],
  ['k', 'plosive', false, 'velar'],
  ['g', 'plosive', true, 'velar'],
  ['q', 'plosive', false, 'uvular'],
  ['G\\', 'plosive', true, 'uvular'],
  ['?', 'plosive', false, 'glottal'],
  ['m', 'nasal', true, 'bilabial'],
  ['F', 'nasal', true, 'labiodental'],
  ['n', 'nasal', true, 'alveolar'],
  ['n`', 'nasal', true, 'retroflex'],
  ['J', 'nasal', true, 'palatal'],
  ['N', 'nasal', true, 'velar'],
  ['N\\', 'nasal', true, 'uvular'],
  ['B\\', 'trill', true, 'bilabial'],
  ['r', 'trill', true, 'alveolar'],
  ['R\\', 'trill', true, 'uvular'],
  ['4', 'tap', true, 'alveolar'],
  ['r`', 'tap', true, 'retroflex'],
  ['p\\', 'fricative', false, 'bilabial'],
  ['B', 'fricative', true, 'bilabial'],
  ['f', 'fricative', false, 'labiodental'],
  ['v', 'fricative', true, 'labiodental'],
  ['T', 'fricative', false, 'dental'],
  ['D', 'fricative', true, 'dental'],
  ['s', 'fricative', false, 'alveolar'],
  ['z', 'fricative', true, 'alveolar'],
  ['S', 'fricative', false, 'postalveolar'],
  ['Z', 'fricative', true, 'postalveolar'],
  ['s`', 'fricative', false, 'retroflex'],
  ['z`', 'fricative', true, 'retroflex'],
  ['C', 'fricative', false, 'palatal'],
  ['j\\', 'fricative', true, 'palatal'],
  ['x', 'fricative', false, 'velar'],
  ['G', 'fricative', true, 'velar'],
  ['X', 'fricative', false, 'uvular'],
  ['R', 'fricative', true, 'uvular'],
  ['X\\', 'fricative', false, 'pharyngeal'],
  ['?\\', 'fricative', true, 'pharyngeal'],
  ['h', 'fricative', false, 'glottal'],
  ['h\\', 'fricative', true, 'glottal'],
  ['K', 'lateral-fricative', false, 'alveolar'],
  ['K\\', 'lateral-fricative', true, 'alveolar'],
  ['P', 'approximant', true, 'labiodental'],
  ['v\\', 'approximant', true, 'labiodental'],
  ['r\\', 'approximant', true, 'alveolar'],
  ['r\\`', 'approximant', true, 'retroflex'],
  ['j', 'approximant', true, 'palatal'],
  ['M\\', 'approximant', true, 'velar'],
  ['l', 'lateral', true, 'alveolar'],
  ['l`', 'lateral', true, 'retroflex'],
  ['L', 'lateral', true, 'palatal'],
  ['L\\', 'lateral', true, 'velar'],
];

const PHONES = new Map<string, Phone>();
for (const [symbol, formants] of Object.entries(VOWELS)) {
  PHONES.set(symbol, { symbol, manner: 'vowel', voiced: true, nasal: false, formants, noise: undefined });
}
for (const [symbol, manner, voiced, place] of CONSONANTS) {
  const noise = manner === 'lateral-fricative' ? LATERAL_NOISE : PLACES[place].noise;
  const formants = SONORANT_FORMANTS[symbol] ?? PLACES[place].formants;
  PHONES.set(symbol, { symbol, manner, voiced, nasal: false, formants, noise });
}
const LONGEST_SYMBOL = Math.max(...[...PHONES.keys()].map((symbol) => symbol.length));

/** Splits X-SAMPA text into phones, taking the longest symbol at each point. Null if the text has anything else. */
export function parseXSampa(text: string): Phone[] | null {
  const phones: Phone[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === ' ') {
      i++;
      continue;
    }
    let phone: Phone | undefined;
    for (let length = Math.min(LONGEST_SYMBOL, text.length - i); length > 0 && !phone; length--) {
      phone = PHONES.get(text.slice(i, i + length));
    }
    if (!phone) return null;
    i += phone.symbol.length;
    if (phone.manner === 'vowel' && text[i] === '~') {
      phone = { ...phone, symbol: `${phone.symbol}~`, nasal: true };
      i++;
    }
    phones.push(phone);
  }
  return phones.length > 0 ? phones : null;
}

/** Text a voice block can sing: at least one sound, and only sounds of the supported subset. */
export function isVoiceText(text: unknown): text is string {
  return typeof text === 'string' && parseXSampa(text) !== null;
}

/** How long consonants take in seconds; vowels take whatever time is left. */
const CONSONANT_S: Record<Exclude<Manner, 'vowel'>, number> = {
  plosive: 0.08,
  nasal: 0.07,
  trill: 0.09,
  tap: 0.03,
  fricative: 0.11,
  'lateral-fricative': 0.1,
  approximant: 0.06,
  lateral: 0.07,
};
/** Consonants never take more than this share of a note, so short notes still have some vowel. */
const MAX_CONSONANT_SHARE = 0.6;
const CONTINUANTS: Manner[] = ['nasal', 'trill', 'fricative', 'lateral-fricative', 'approximant', 'lateral'];

export interface Segment {
  phone: Phone;
  /** Seconds from the start of the note. */
  start: number;
  end: number;
}

/**
 * Lays the phones out over a note of the given length, as a singer would: consonants at their natural length
 * (shortened if the note is short), the vowels sharing the rest. Without vowels, the consonants that can be
 * held (e.g. "mm", "s") share it instead, and failing that all of them.
 */
export function timeline(phones: Phone[], seconds: number): Segment[] {
  let stretchy = phones.map((phone) => phone.manner === 'vowel');
  if (!stretchy.includes(true)) stretchy = phones.map((phone) => CONTINUANTS.includes(phone.manner));
  if (!stretchy.includes(true)) stretchy = phones.map(() => true);

  const fixed = phones.map((phone, i) => (stretchy[i] || phone.manner === 'vowel' ? 0 : CONSONANT_S[phone.manner]));
  const fixedTotal = fixed.reduce((sum, s) => sum + s, 0);
  const scale = fixedTotal > seconds * MAX_CONSONANT_SHARE ? (seconds * MAX_CONSONANT_SHARE) / fixedTotal : 1;
  const stretchyCount = stretchy.filter(Boolean).length;
  const stretchyLength = (seconds - fixedTotal * scale) / stretchyCount;

  let time = 0;
  return phones.map((phone, i) => {
    const start = time;
    time += stretchy[i] ? stretchyLength : fixed[i] * scale;
    return { phone, start, end: time };
  });
}
