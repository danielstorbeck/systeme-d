import { chordPitches } from './chord';
import { drumFor } from './drums';
import { BEATS_PER_MARK } from './playback';
import type { Block, Lane } from './ruler/lanes';
import { FIRST_MARK } from './ruler/viewport';
import type { Sound } from './sound';

/**
 * Standard MIDI files (SMF) of the lanes' blocks. Mark 1 of the main ruler is the start of the file, a beat (a
 * quarter of a main-ruler interval, see playback.ts) is a quarter note, so each main-ruler interval is a 4/4 bar.
 */

/** Ticks per quarter note; 960 splits a beat into halves, thirds, quarters, fifths, sixths, eighths, … exactly. */
export const TICKS_PER_QUARTER = 960;
const TICKS_PER_MARK = TICKS_PER_QUARTER * BEATS_PER_MARK;
/** General MIDI plays channel 10 (index 9) as the drum kit. */
const DRUM_CHANNEL = 9;
const VELOCITY = 100;

/** General MIDI programs (0-based) sounding closest to the lanes' sounds; drums need none. */
const PROGRAMS: Record<Exclude<Sound, 'drums'>, number> = {
  sine: 79, // Ocarina
  triangle: 73, // Flute
  square: 80, // Lead 1 (square)
  sawtooth: 81, // Lead 2 (sawtooth)
  voice: 53, // Voice Oohs
};

interface MidiEvent {
  tick: number;
  /** At the same tick, lower orders come first: note-offs before lyrics before note-ons. */
  order: number;
  bytes: number[];
}

/** A lane as a MIDI track: its name, sound and volume, its blocks as notes, and in voice lanes their texts as lyrics. */
export function laneTrack(lane: Lane, blocks: Block[], channel: number): number[] {
  const events: MidiEvent[] = [
    { tick: 0, order: 0, bytes: metaEvent(0x03, lane.name) },
    // Channel volume (controller 7) from the lane's volume.
    { tick: 0, order: 0, bytes: [0xb0 | channel, 7, Math.round((lane.volume / 100) * 127)] },
  ];
  if (lane.sound !== 'drums') events.push({ tick: 0, order: 0, bytes: [0xc0 | channel, PROGRAMS[lane.sound]] });
  for (const block of blocks) {
    if (block.laneId !== lane.id) continue;
    const start = toTick(block.start);
    // Even a block shorter than a tick sounds.
    const end = Math.max(start + 1, toTick(block.end));
    if (lane.sound === 'voice' && block.text !== '') {
      events.push({ tick: start, order: 1, bytes: metaEvent(0x05, block.text) });
    }
    for (const pitch of blockPitches(lane.sound, block)) {
      events.push({ tick: start, order: 2, bytes: [0x90 | channel, pitch, VELOCITY] });
      events.push({ tick: end, order: 0, bytes: [0x80 | channel, pitch, 0] });
    }
  }
  return trackChunk(events);
}

/** What a block plays: drums sound as the kit's drum, voices sing only the melody, waveforms add their chord. */
function blockPitches(sound: Sound, block: Block): number[] {
  if (sound === 'drums') return [drumFor(block.pitch).pitch];
  if (sound === 'voice') return [block.pitch];
  return chordPitches(block.pitch, block.chord);
}

/** The first track of every file: the name, the tempo and the 4/4 time signature. */
export function conductorTrack(name: string, bpm: number): number[] {
  const microsPerQuarter = Math.round(60_000_000 / bpm);
  return trackChunk([
    { tick: 0, order: 0, bytes: metaEvent(0x03, name) },
    { tick: 0, order: 0, bytes: [0xff, 0x51, 3, ...bigEndian(microsPerQuarter, 3)] },
    // 4/4, a metronome click per quarter (24 MIDI clocks), 8 thirty-seconds per quarter.
    { tick: 0, order: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
  ]);
}

/** A format 1 file: the conductor track, then one track per lane. */
export function midiFile(tracks: number[][]): Uint8Array {
  const header = [...ascii('MThd'), ...bigEndian(6, 4), 0, 1, ...bigEndian(tracks.length, 2), ...bigEndian(TICKS_PER_QUARTER, 2)];
  return new Uint8Array([...header, ...tracks.flat()]);
}

export interface MidiExport {
  /** "all", or the lane's name; see midiExportFiles for the file names. */
  label: string;
  bytes: Uint8Array;
}

/**
 * One file with all lanes that have blocks, each on a track of its own, then one file per such lane. Melodic lanes
 * get channels 1 to 16 except 10 in lane order, starting over after 15 lanes; drum lanes play on channel 10.
 * Each lane's own file uses the same channel as in the file with all lanes.
 */
export function exportMidi(name: string, lanes: Lane[], blocks: Block[], bpm: number): MidiExport[] {
  const used = lanes.filter((lane) => blocks.some((block) => block.laneId === lane.id));
  if (used.length === 0) return [];
  let melodic = 0;
  const tracks = used.map((lane) => {
    const channel = lane.sound === 'drums' ? DRUM_CHANNEL : melodicChannel(melodic++);
    return laneTrack(lane, blocks, channel);
  });
  const conductor = conductorTrack(name, bpm);
  return [
    { label: 'all', bytes: midiFile([conductor, ...tracks]) },
    ...used.map((lane, i) => ({ label: lane.name, bytes: midiFile([conductor, tracks[i]]) })),
  ];
}

/** The n-th melodic channel (0-based): 0 to 15 without the drum channel, round and round. */
function melodicChannel(n: number): number {
  const channel = n % 15;
  return channel < DRUM_CHANNEL ? channel : channel + 1;
}

function toTick(x: number): number {
  return Math.max(0, Math.round((x - FIRST_MARK) * TICKS_PER_MARK));
}

/** Events in time order, each after the time since the previous one, closed by the end-of-track event. */
function trackChunk(events: MidiEvent[]): number[] {
  const sorted = events
    .map((event, index) => ({ ...event, index }))
    .sort((a, b) => a.tick - b.tick || a.order - b.order || a.index - b.index);
  const data: number[] = [];
  let tick = 0;
  for (const event of sorted) {
    data.push(...variableLength(event.tick - tick), ...event.bytes);
    tick = event.tick;
  }
  data.push(0, 0xff, 0x2f, 0);
  return [...ascii('MTrk'), ...bigEndian(data.length, 4), ...data];
}

function metaEvent(type: number, text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  return [0xff, type, ...variableLength(bytes.length), ...bytes];
}

/** MIDI's variable-length quantity: 7 bits per byte, most significant first, all but the last with the top bit set. */
export function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

function bigEndian(value: number, length: number): number[] {
  return Array.from({ length }, (_, i) => Math.floor(value / 256 ** (length - 1 - i)) & 0xff);
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}
