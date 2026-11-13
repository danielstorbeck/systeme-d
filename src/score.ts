import { chordPitches } from './chord';
import { drumFor, type Drum } from './drums';
import type { Key } from './keys';
import { spellPitch } from './pitch';
import type { Block, Lane } from './ruler/lanes';
import { isPowerOfTwo } from './ruler/rulers';
import { FIRST_MARK } from './ruler/viewport';

/**
 * A LilyPond score of the lanes' blocks. Time is counted in whole notes from mark 1 of the main ruler, so that a
 * main-ruler interval is a 4/4 bar, as in the MIDI export. Each lane with blocks gets a staff: a drum staff for
 * drums, a staff in the lane's key otherwise, with the sung text as lyrics in voice lanes. The lanes' segment
 * lines are the bar lines; without any, every main-ruler interval is a bar of 4/4. Notes whose edges don't fall
 * on binary fractions of a bar (rulers whose ratio against the main ruler isn't m:n with m a power of two) are
 * written in tuplets, nested where that is simpler.
 */

// ---- Exact fractions; the denominators that occur are small. ----

export interface Fraction {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const frac = (n: number, d = 1): Fraction => {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
};
const add = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d);
const cmp = (a: Fraction, b: Fraction) => a.n * b.d - b.n * a.d;
const isBinary = (f: Fraction) => isPowerOfTwo(f.d);
const ZERO = frac(0);
const oddPart = (n: number) => {
  while (n % 2 === 0) n /= 2;
  return n;
};
const pow2 = (e: number) => (e >= 0 ? frac(2 ** e) : frac(1, 2 ** -e));

/** The fraction nearest x with a denominator of at most maxDenominator, found by continued fractions. */
export function toFraction(x: number, maxDenominator = 1_000_000): Fraction {
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let v = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    const [h2, k2] = [a * h1 + h0, a * k1 + k0];
    if (k2 > maxDenominator) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(x - h1 / k1) < 1e-9 || v - a < 1e-12) break;
    v = 1 / (v - a);
  }
  return frac(h1, k1);
}

// ---- Bars ----

export interface Bar {
  start: Fraction;
  end: Fraction;
}

/**
 * The bars up to at least `end` (in whole notes from mark 1): between the segment lines (world x), the last
 * segment's length repeated after the last line; every main-ruler interval without lines. At least one bar.
 */
export function barsOf(lines: number[], end: Fraction): Bar[] {
  const marks = lines
    .map((x) => toFraction(x - FIRST_MARK))
    .filter((x) => x.n > 0)
    .sort(cmp)
    .filter((x, i, all) => i === 0 || cmp(x, all[i - 1]) !== 0);
  const bars: Bar[] = [];
  let start = ZERO;
  for (const mark of marks) {
    bars.push({ start, end: mark });
    start = mark;
  }
  const length = bars.length > 0 ? sub(bars[bars.length - 1].end, bars[bars.length - 1].start) : frac(1);
  while (bars.length === 0 || cmp(bars[bars.length - 1].end, end) < 0) {
    bars.push({ start, end: add(start, length) });
    start = add(start, length);
  }
  // Bars after the last one the music reaches are left out.
  while (bars.length > 1 && cmp(bars[bars.length - 2].end, end) >= 0) bars.pop();
  return bars;
}

// ---- Notes ----

/** A note, chord, drum or rest from start to end; tied when its block goes on after end. */
interface Piece {
  start: Fraction;
  end: Fraction;
  /** The LilyPond pitch, chord or drum, e.g. "cis'", "<c' e' g'>" or "sn"; undefined for a rest. */
  sound?: string;
  tie: boolean;
}

/** A sequence of LilyPond music, with how hard it is to read: the tuplet numbers it uses, added up. */
interface Written {
  tokens: string[];
  cost: number;
}

const DUTCH_ACCIDENTALS: Record<number, string> = { [-2]: 'eses', [-1]: 'es', 0: '', 1: 'is', 2: 'isis' };
const LETTER_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

/** A pitch in LilyPond's absolute notation, spelled in the key: 60 is c', 61 is cis' or des'. */
export function lilyPitch(pitch: number, key: Key): string {
  const { letter, accidental, octave } = spellPitch(pitch, key);
  const marks = octave - 3;
  return LETTER_NAMES[letter] + DUTCH_ACCIDENTALS[accidental] + (marks > 0 ? "'".repeat(marks) : ','.repeat(-marks));
}

/** LilyPond's names of the kit's drums. */
const DRUM_NAMES: Record<Drum['name'], string> = {
  bd: 'bd',
  sn: 'sn',
  hc: 'hhc',
  ho: 'hho',
  t1: 'tomh',
  t2: 'tomml',
  t3: 'tomfh',
  cr: 'cymc',
  rd: 'cymr',
};

/** What a block sounds as: its drum, its melody note in a voice lane, its note or chord with a waveform. */
function blockSound(lane: Lane, block: Block): string {
  if (lane.sound === 'drums') return DRUM_NAMES[drumFor(block.pitch).name];
  const pitches = lane.sound === 'voice' ? [block.pitch] : chordPitches(block.pitch, block.chord).sort((a, b) => a - b);
  const names = pitches.map((p) => lilyPitch(p, lane.key));
  return names.length === 1 ? names[0] : `<${names.join(' ')}>`;
}

/**
 * Note values adding up to a binary length, longest first, using a dot where it fits: 3/4 is "2.", 5/8 is "2", "8".
 */
export function noteValues(length: Fraction): string[] {
  const values: string[] = [];
  let rest = length;
  while (rest.n > 0) {
    let e = 2;
    while (cmp(pow2(e), rest) > 0) e--;
    const name = e === 2 ? '\\longa' : e === 1 ? '\\breve' : String(2 ** -e);
    const dotted = mul(pow2(e), frac(3, 2));
    if (cmp(dotted, rest) <= 0) {
      values.push(`${name}.`);
      rest = sub(rest, dotted);
    } else {
      values.push(name);
      rest = sub(rest, pow2(e));
    }
  }
  return values;
}

/** A piece written with durations scaled by `scale` (inside tuplets), its parts tied together. */
function plain(piece: Piece, scale: Fraction): string[] {
  const values = noteValues(mul(sub(piece.end, piece.start), scale));
  if (piece.sound === undefined) return values.map((v) => `r${v}`);
  return values.map((v, i) => `${piece.sound}${v}${i < values.length - 1 || piece.tie ? '~' : ''}`);
}

/** The odd divisors of an odd number, greater than 1, smallest first. */
function oddDivisors(q: number): number[] {
  const divisors: number[] = [];
  for (let d = 3; d <= q; d += 2) if (q % d === 0) divisors.push(d);
  return divisors;
}

/**
 * Pieces filling the span from a to b, with durations scaled by `scale`. The span is cut where the music reaches a
 * binary offset from a; a stretch between such cuts holding more than one piece needs a tuplet.
 */
function writeSpan(pieces: Piece[], a: Fraction, scale: Fraction): Written {
  const written: Written = { tokens: [], cost: 0 };
  let chunk: Piece[] = [];
  let chunkStart = a;
  pieces.forEach((piece, i) => {
    chunk.push(piece);
    if (i < pieces.length - 1 && !isBinary(mul(sub(piece.end, a), scale))) return;
    const part = writeChunk(chunk, chunkStart, scale);
    written.tokens.push(...part.tokens);
    written.cost += part.cost;
    chunkStart = piece.end;
    chunk = [];
  });
  return written;
}

/**
 * A stretch from a whose inner edges aren't binary: as a tuplet q/p, q an odd divisor of what makes the edges
 * non-binary and p the power of two just below it, with further tuplets inside where needed. Of the ways to do
 * that, the one with the smallest tuplet numbers in all is taken, e.g. 3 and 5 nested rather than one 15.
 */
function writeChunk(chunk: Piece[], a: Fraction, scale: Fraction): Written {
  const end = chunk[chunk.length - 1].end;
  if (chunk.length === 1 && isBinary(mul(sub(end, a), scale))) return { tokens: plain(chunk[0], scale), cost: 0 };
  const lcm = (x: number, y: number) => (x / gcd(x, y)) * y;
  const q = chunk.reduce((acc, piece) => lcm(acc, oddPart(mul(sub(piece.end, a), scale).d)), 1);
  let best: Written | undefined;
  for (const n of oddDivisors(q)) {
    const p = 2 ** Math.floor(Math.log2(n));
    const inner = writeSpan(chunk, a, mul(scale, frac(n, p)));
    const cost = n + inner.cost;
    if (!best || cost < best.cost) best = { tokens: [`\\tuplet ${n}/${p} {`, ...inner.tokens, '}'], cost };
  }
  return best ?? { tokens: chunk.flatMap((piece) => plain(piece, scale)), cost: 0 };
}

/** The lane's blocks and the rests between them, from 0 to end, in whole notes from mark 1. */
function lanePieces(lane: Lane, blocks: Block[], end: Fraction): (Piece & { block?: Block })[] {
  const pieces: (Piece & { block?: Block })[] = [];
  let at = ZERO;
  const own = blocks.filter((b) => b.laneId === lane.id).sort((x, y) => x.start - y.start);
  for (const block of own) {
    let start = toFraction(block.start - FIRST_MARK);
    const stop = toFraction(block.end - FIRST_MARK);
    if (cmp(start, at) < 0) start = at;
    if (cmp(stop, start) <= 0) continue;
    if (cmp(start, at) > 0) pieces.push({ start: at, end: start, tie: false });
    pieces.push({ start, end: stop, sound: blockSound(lane, block), tie: false, block });
    at = stop;
  }
  if (cmp(at, end) < 0) pieces.push({ start: at, end, tie: false });
  return pieces;
}

/** The pieces within the bar: cut at its edges, tied over the bar line where a block goes on. */
function barPieces(pieces: (Piece & { block?: Block })[], bar: Bar): (Piece & { block?: Block })[] {
  return pieces
    .filter((p) => cmp(p.end, bar.start) > 0 && cmp(p.start, bar.end) < 0)
    .map((p) => {
      const start = cmp(p.start, bar.start) < 0 ? bar.start : p.start;
      const end = cmp(p.end, bar.end) > 0 ? bar.end : p.end;
      return { ...p, start, end, tie: p.sound !== undefined && cmp(p.end, bar.end) > 0 };
    });
}

/** "\time 3/4" for a bar of that length; lengths that aren't binary set the measure length instead. */
export function timeSignature(length: Fraction): string {
  if (!isBinary(length)) return `\\set Timing.measureLength = #(ly:make-moment ${length.n}/${length.d})`;
  return length.d < 4 ? `\\time ${(length.n * 4) / length.d}/4` : `\\time ${length.n}/${length.d}`;
}

// ---- Clefs ----

/** The clefs, with the pitches from the bottom to the top line of the staff. */
const CLEFS = [
  { name: 'treble', low: 64, high: 77 },
  { name: 'alto', low: 53, high: 67 },
  { name: 'bass', low: 43, high: 57 },
] as const;
/** About this many semitones per ledger line. */
const SEMITONES_PER_LEDGER_LINE = 3.5;
/** Changing the clef is worth it if it saves more ledger lines than this, over the bars until the next change. */
const CLEF_CHANGE_COST = 6;

/**
 * The clef of each bar, given the pitches of each bar: the one needing the fewest ledger lines, changed only where
 * that saves more than CLEF_CHANGE_COST ledger lines, found by dynamic programming over the bars.
 */
export function chooseClefs(barPitches: number[][]): string[] {
  const ledger = (pitches: number[], clef: (typeof CLEFS)[number]) =>
    pitches.reduce((sum, p) => sum + Math.max(0, clef.low - p, p - clef.high) / SEMITONES_PER_LEDGER_LINE, 0);
  if (barPitches.length === 0) return [];
  let costs = CLEFS.map((clef) => ledger(barPitches[0], clef));
  const from: number[][] = [];
  for (let i = 1; i < barPitches.length; i++) {
    const back: number[] = [];
    costs = CLEFS.map((clef, c) => {
      let best = 0;
      let bestCost = Infinity;
      costs.forEach((cost, prev) => {
        const total = cost + (prev === c ? 0 : CLEF_CHANGE_COST);
        if (total < bestCost) [best, bestCost] = [prev, total];
      });
      back.push(best);
      return bestCost + ledger(barPitches[i], clef);
    });
    from.push(back);
  }
  let c = costs.indexOf(Math.min(...costs));
  const chosen = [c];
  for (let i = from.length - 1; i >= 0; i--) chosen.unshift((c = from[i][c]));
  return chosen.map((index) => CLEFS[index].name);
}

// ---- The score ----

/** A LilyPond string, with quotes and backslashes escaped. */
const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** \key for the lane's key, e.g. "\key fis \minor". */
function keySignature(key: Key): string {
  const minor = key[0] === key[0].toLowerCase();
  const accidental = key.includes('♯') ? 'is' : key.includes('♭') ? 'es' : '';
  return `\\key ${key[0].toLowerCase()}${accidental} ${minor ? '\\minor' : '\\major'}`;
}

const INDENT = '  ';

/** The staff of one lane, with its lyrics in a voice lane. */
function laneStaff(lane: Lane, blocks: Block[], bars: Bar[], tempo: string | undefined): string[] {
  const drums = lane.sound === 'drums';
  const pieces = lanePieces(lane, blocks, bars[bars.length - 1].end);
  const barsPieces = bars.map((bar) => barPieces(pieces, bar));
  const clefs = drums
    ? []
    : chooseClefs(
        barsPieces.map((ps) => ps.flatMap((p) => (p.block ? chordPitches(p.block.pitch, lane.sound === 'voice' ? [] : p.block.chord) : []))),
      );
  const lines: string[] = [];
  const staff = drums ? 'DrumStaff' : 'Staff';
  lines.push(`${INDENT}\\new ${staff} \\with { instrumentName = ${quote(lane.name)} } ${drums ? '\\drummode ' : ''}{`);
  const inner = INDENT.repeat(2);
  if (tempo) lines.push(inner + tempo);
  if (!drums) lines.push(inner + keySignature(lane.key));
  let time = '';
  let clef = '';
  bars.forEach((bar, i) => {
    const length = sub(bar.end, bar.start);
    const head: string[] = [];
    const signature = timeSignature(length);
    if (signature !== time) head.push((time = signature));
    if (!drums && clefs[i] !== clef) head.push(`\\clef ${(clef = clefs[i])}`);
    for (const line of head) lines.push(inner + line);
    const ps = barsPieces[i];
    const music =
      ps.length === 1 && ps[0].sound === undefined
        ? [`R1${length.n === 1 && length.d === 1 ? '' : `*${length.n}${length.d === 1 ? '' : `/${length.d}`}`}`]
        : writeSpan(ps, bar.start, frac(1)).tokens;
    lines.push(inner + [...music, '|'].join(' '));
  });
  lines.push(`${INDENT}}`);
  if (lane.sound === 'voice') {
    const syllables = pieces.filter((p) => p.block).map((p) => quote(p.block!.text));
    lines.push(`${INDENT}\\addlyrics { ${syllables.join(' ')} }`);
  }
  return lines;
}

/**
 * The score of the lanes with blocks, in lane order, as a LilyPond file; undefined if no lane has blocks. Lanes
 * without segment lines take those of the topmost lane that has any. If the staves' bars differ, each staff keeps
 * its own time.
 */
export function exportScore(name: string, lanes: Lane[], blocks: Block[], bpm: number): string | undefined {
  const used = lanes.filter((lane) => blocks.some((block) => block.laneId === lane.id));
  if (used.length === 0) return undefined;
  const end = blocks.reduce((max, b) => {
    const x = toFraction(b.end - FIRST_MARK);
    return cmp(x, max) > 0 ? x : max;
  }, ZERO);
  const shared = lanes.find((lane) => lane.segments.length > 0)?.segments ?? [];
  const barsByLane = used.map((lane) => barsOf(lane.segments.length > 0 ? lane.segments : shared, end));
  const key = (bars: Bar[]) => bars.map((bar) => `${bar.end.n}/${bar.end.d}`).join(' ');
  const polymetric = barsByLane.some((bars) => key(bars) !== key(barsByLane[0]));
  const tempo = `\\tempo 4 = ${Math.max(1, Math.round(bpm))}`;

  const lines = ['\\version "2.24.0"', '', `\\header {`, `${INDENT}title = ${quote(name)}`, `${INDENT}composer = ${quote('Système D')}`, '}', ''];
  if (polymetric) {
    // Each staff counts its own bars.
    lines.push(
      '\\layout {',
      `${INDENT}\\context { \\Score \\remove "Timing_translator" \\remove "Default_bar_line_engraver" }`,
      `${INDENT}\\context { \\Staff \\consists "Timing_translator" \\consists "Default_bar_line_engraver" }`,
      `${INDENT}\\context { \\DrumStaff \\consists "Timing_translator" \\consists "Default_bar_line_engraver" }`,
      '}',
      '',
    );
  }
  lines.push('<<');
  used.forEach((lane, i) => lines.push(...laneStaff(lane, blocks, barsByLane[i], i === 0 ? tempo : undefined)));
  lines.push('>>', '');
  return lines.join('\n');
}
