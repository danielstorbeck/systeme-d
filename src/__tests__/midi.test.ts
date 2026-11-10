import { describe, expect, it } from 'vitest';
import { exportMidi, TICKS_PER_QUARTER, variableLength } from '../midi';
import { midiFileNames } from '../project';
import type { Block, Lane } from '../ruler/lanes';
import type { Sound } from '../sound';

const lane = (id: number, name: string, sound: Sound, volume = 50): Lane => ({
  id,
  name,
  key: 'C',
  sound,
  volume,
  segments: [],
} as Lane);

const block = (id: number, laneId: number, start: number, end: number, pitch: number, extra: Partial<Block> = {}): Block => ({
  id,
  laneId,
  start,
  end,
  chainId: 1,
  pitch,
  text: 'la',
  chord: [],
  ...extra,
});

interface Event {
  tick: number;
  status: number;
  data: number[];
  /** Meta events: their type and text. */
  meta?: number;
  text?: string;
}

/** Reads a format 1 file back: the header and each track's events with absolute ticks. */
function readMidi(bytes: Uint8Array) {
  let pos = 0;
  const u = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + bytes[pos++];
    return v;
  };
  const tag = () => String.fromCharCode(...bytes.slice(pos, (pos += 4)));
  const vlq = () => {
    let v = 0;
    let b;
    do {
      b = bytes[pos++];
      v = v * 128 + (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  expect(tag()).toBe('MThd');
  expect(u(4)).toBe(6);
  const format = u(2);
  const trackCount = u(2);
  const division = u(2);
  const tracks: Event[][] = [];
  for (let t = 0; t < trackCount; t++) {
    expect(tag()).toBe('MTrk');
    const end = u(4) + pos;
    const events: Event[] = [];
    let tick = 0;
    while (pos < end) {
      tick += vlq();
      const status = bytes[pos++];
      if (status === 0xff) {
        const meta = bytes[pos++];
        const length = vlq();
        const data = [...bytes.slice(pos, (pos += length))];
        events.push({ tick, status, data, meta, text: new TextDecoder().decode(new Uint8Array(data)) });
      } else {
        const length = (status & 0xf0) === 0xc0 ? 1 : 2;
        events.push({ tick, status, data: [...bytes.slice(pos, (pos += length))] });
      }
    }
    expect(pos).toBe(end);
    tracks.push(events);
  }
  expect(pos).toBe(bytes.length);
  return { format, division, tracks };
}

const notes = (events: Event[], kind: 0x90 | 0x80) =>
  events.filter((e) => (e.status & 0xf0) === kind).map((e) => ({ tick: e.tick, channel: e.status & 0x0f, pitch: e.data[0] }));

describe('MIDI export', () => {
  const lanes = [lane(10, 'Bass', 'sawtooth', 100), lane(11, 'Beat', 'drums'), lane(12, 'Empty', 'sine'), lane(13, 'Singer', 'voice')];
  const blocks = [
    block(1, 10, 1, 1.25, 40, { chord: [7] }),
    block(2, 11, 1.5, 2, 99), // not a drum of the kit: plays the kick
    block(3, 13, 2, 3, 64, { text: 'hEl@U', chord: [4, 7] }),
  ];
  const files = exportMidi('Song', lanes, blocks, 90);

  it('writes one file with all lanes that have rectangles, then one per lane', () => {
    expect(files.map((f) => f.label)).toEqual(['all', 'Bass', 'Beat', 'Singer']);
    const all = readMidi(files[0].bytes);
    expect(all.format).toBe(1);
    expect(all.division).toBe(TICKS_PER_QUARTER);
    expect(all.tracks).toHaveLength(4);
    expect(readMidi(files[2].bytes).tracks).toHaveLength(2);
  });

  it('starts at mark 1 with a beat as a quarter note, and sets the tempo', () => {
    const [conductor, bass] = readMidi(files[0].bytes).tracks;
    expect(conductor.find((e) => e.meta === 0x51)!.data).toEqual([0x0a, 0x2c, 0x2b]); // 666 667 µs = 90 BPM
    expect(conductor.find((e) => e.meta === 0x03)!.text).toBe('Song');
    expect(notes(bass, 0x90)).toEqual([
      { tick: 0, channel: 0, pitch: 40 },
      { tick: 0, channel: 0, pitch: 47 },
    ]);
    expect(notes(bass, 0x80).map((n) => n.tick)).toEqual([960, 960]);
    expect(bass.find((e) => e.meta === 0x03)!.text).toBe('Bass');
    expect(bass.find((e) => (e.status & 0xf0) === 0xc0)!.data).toEqual([81]);
    expect(bass.find((e) => (e.status & 0xf0) === 0xb0)!.data).toEqual([7, 127]);
  });

  it('plays drums on channel 10 as the kit plays them', () => {
    const beat = readMidi(files[0].bytes).tracks[2];
    expect(notes(beat, 0x90)).toEqual([{ tick: 1920, channel: 9, pitch: 36 }]);
    expect(beat.some((e) => (e.status & 0xf0) === 0xc0)).toBe(false);
  });

  it('gives voices only their melody, with the text as lyrics', () => {
    const singer = readMidi(files[0].bytes).tracks[3];
    expect(notes(singer, 0x90)).toEqual([{ tick: 3840, channel: 1, pitch: 64 }]);
    expect(singer.find((e) => e.meta === 0x05)).toMatchObject({ tick: 3840, text: 'hEl@U' });
    // The lane's own file is the same track.
    expect(readMidi(files[3].bytes).tracks[1]).toEqual(singer);
  });

  it('ends notes before starting the next one at the same time', () => {
    const [file] = exportMidi('x', [lane(1, 'A', 'sine')], [block(1, 1, 1, 2, 60), block(2, 1, 2, 3, 60)], 120);
    const track = readMidi(file.bytes).tracks[1].filter((e) => e.tick === 3840 && e.status !== 0xff);
    expect(track.map((e) => e.status & 0xf0)).toEqual([0x80, 0x90]);
  });

  it('exports nothing without rectangles', () => {
    expect(exportMidi('x', lanes, [], 120)).toEqual([]);
  });

  it('skips channel 10 for melodic lanes', () => {
    const many = Array.from({ length: 11 }, (_, i) => lane(i + 1, `L${i}`, 'sine'));
    const result = exportMidi('x', many, many.map((l) => block(l.id, l.id, 1, 2, 60)), 120);
    const channels = readMidi(result[0].bytes).tracks.slice(1).map((t) => notes(t, 0x90)[0].channel);
    expect(channels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11]);
  });

  it('encodes variable-length quantities', () => {
    expect(variableLength(0)).toEqual([0]);
    expect(variableLength(127)).toEqual([0x7f]);
    expect(variableLength(128)).toEqual([0x81, 0]);
    expect(variableLength(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });
});

describe('MIDI file names', () => {
  it('keep the files of one export together and unique', () => {
    const date = new Date(2026, 10, 8, 9, 5, 7);
    expect(midiFileNames('Song', ['all', 'Bass', 'bass', 'a/b', ' :? '], date)).toEqual([
      'Song.2026-11-08_09-05-07.all.mid',
      'Song.2026-11-08_09-05-07.Bass.mid',
      'Song.2026-11-08_09-05-07.bass 2.mid',
      'Song.2026-11-08_09-05-07.ab.mid',
      'Song.2026-11-08_09-05-07.Track 4.mid',
    ]);
  });
});
