import { describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_KEY,
  LEGACY_AUTOSAVE_KEY,
  cleanProjectName,
  dumpFileName,
  loadAutosave,
  nextIds,
  parseProject,
  projectFileName,
  projectNameFromFileName,
  saveAutosave,
  serializeProject,
  toDocument,
  type WorkspaceState,
} from '../project';
import { chainOf } from '../ruler/chains';
import { addLane } from '../ruler/lanes';
import { addSubRuler, INITIAL_RULERS, setRatio } from '../ruler/rulers';

const rulers = setRatio(addSubRuler(INITIAL_RULERS, 0, 1), 1, { m: 3, n: 2 });
const state: WorkspaceState = {
  rulers,
  lanes: addLane([], 2, 1),
  lanesCreated: 1,
  blocks: [{ id: 4, laneId: 2, start: 1, end: 5 / 3, chainId: 7, pitch: 64, text: 'la', chord: [4, 7] }],
  chains: [{ id: 7, chain: chainOf(rulers, 1) }],
  view: { offsetX: 0.5, scale: 40 },
};
const doc = toDocument('Song', state);

/** A JSON text of the document with one field replaced. */
const withField = (field: string, value: unknown) => JSON.stringify({ ...doc, [field]: value });

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

describe('project documents', () => {
  it('survive a round trip through JSON', () => {
    expect(parseProject(serializeProject(doc))).toEqual(doc);
  });

  it('keep the playback speed, defaulting to 120 BPM for projects saved before playback', () => {
    expect(parseProject(serializeProject(toDocument('Song', state, 96))).bpm).toBe(96);
    expect(parseProject(withField('bpm', undefined)).bpm).toBe(120);
    expect(() => parseProject(withField('bpm', 0))).toThrow(/"bpm"/);
  });

  it('reject text that is not a project', () => {
    expect(() => parseProject('not json')).toThrow(/not valid JSON/);
    expect(() => parseProject('[]')).toThrow(/does not contain a project/);
    expect(() => parseProject(withField('version', 99))).toThrow(/version/);
    expect(() => parseProject(withField('lanes', [{ id: 'x' }]))).toThrow(/"lanes"/);
  });

  it('give lanes from projects saved before keys, sounds, volumes and segments existed the defaults', () => {
    const parsed = parseProject(withField('lanes', [{ id: 2, name: 'Lane 1' }]));
    expect(parsed.lanes).toEqual([{ id: 2, name: 'Lane 1', key: 'C', sound: 'sine', volume: 50, segments: [] }]);
    expect(parseProject(withField('lanes', [{ id: 2, name: 'Lane 1', segments: [1.5, 3] }])).lanes[0].segments).toEqual([1.5, 3]);
    expect(() => parseProject(withField('lanes', [{ id: 2, name: 'Lane 1', segments: ['x'] }]))).toThrow(/"lanes"/);
    expect(() => parseProject(withField('lanes', [{ id: 2, name: 'Lane 1', volume: 101 }]))).toThrow(/"lanes"/);
    expect(() => parseProject(withField('lanes', [{ id: 2, name: 'Lane 1', sound: 'noise' }]))).toThrow(/"lanes"/);
    expect(parseProject(withField('lanes', [{ id: 2, name: 'Lane 1', sound: 'drums' }])).lanes[0].sound).toBe('drums');
    expect(() => parseProject(withField('lanes', [{ id: 2, name: 'Lane 1', key: 'H' }]))).toThrow(/"lanes"/);
  });

  it('give blocks from projects saved before pitches existed middle C', () => {
    const { pitch: _, ...withoutPitch } = state.blocks[0];
    expect(parseProject(withField('blocks', [withoutPitch])).blocks[0].pitch).toBe(60);
    expect(() => parseProject(withField('blocks', [{ ...withoutPitch, pitch: 128 }]))).toThrow(/"blocks"/);
  });

  it('give blocks from projects saved before texts existed "la", and reject texts the voice cannot sing', () => {
    const { text: _, ...withoutText } = state.blocks[0];
    expect(parseProject(withField('blocks', [withoutText])).blocks[0].text).toBe('la');
    expect(parseProject(withField('blocks', [{ ...withoutText, text: 'bO~ Zur' }])).blocks[0].text).toBe('bO~ Zur');
    expect(() => parseProject(withField('blocks', [{ ...withoutText, text: 'l_a' }]))).toThrow(/"blocks"/);
  });

  it('keep chords, give blocks from projects saved before chords existed none, and reject broken chords', () => {
    expect(parseProject(serializeProject(doc)).blocks[0].chord).toEqual([4, 7]);
    const { chord: _, ...withoutChord } = state.blocks[0];
    expect(parseProject(withField('blocks', [withoutChord])).blocks[0].chord).toEqual([]);
    expect(() => parseProject(withField('blocks', [{ ...withoutChord, chord: [4.5] }]))).toThrow(/"blocks"/);
    expect(() => parseProject(withField('blocks', [{ ...withoutChord, chord: '4 7' }]))).toThrow(/"blocks"/);
  });

  it('reject broken references', () => {
    expect(() => parseProject(withField('rulers', rulers.slice(1)))).toThrow(/main ruler/);
    const orphan = { ...rulers[1], parentId: 42 };
    expect(() => parseProject(withField('rulers', [rulers[0], orphan]))).toThrow(/rulers/);
    const cycle = [rulers[0], { ...rulers[1], parentId: 3 }, { ...rulers[1], id: 3, parentId: 1 }];
    expect(() => parseProject(withField('rulers', cycle))).toThrow(/broken tree/);
    expect(() => parseProject(withField('chains', []))).toThrow(/unknown lane or chain/);
  });

  it('continue ids after the highest one in use', () => {
    expect(nextIds(state)).toEqual({ node: 3, block: 5, chain: 8 });
  });
});

describe('project file names', () => {
  const date = new Date(2026, 9, 30, 9, 5, 7);

  it('put the date and time between the name and .json', () => {
    expect(projectFileName('Song', date)).toBe('Song.2026-10-30_09-05-07.json');
  });

  it('give back the name when opening such a file', () => {
    expect(projectNameFromFileName(projectFileName('my.song', date))).toBe('my.song');
    expect(projectNameFromFileName('other.json')).toBe('other');
  });

  it('mark security copies with "dump." and give back the project name when opening one', () => {
    expect(dumpFileName('Song', date)).toBe('dump.Song.2026-10-30_09-05-07.json');
    expect(projectNameFromFileName(dumpFileName('my.song', date))).toBe('my.song');
    expect(projectNameFromFileName('dump.json')).toBe('dump');
    expect(projectNameFromFileName('dump.notes.json')).toBe('dump.notes');
  });

  it('only use names that are valid file names', () => {
    expect(cleanProjectName('  a/b:c?  ')).toBe('abc');
    expect(cleanProjectName('song.json')).toBe('song');
    expect(cleanProjectName('song. ')).toBe('song');
    expect(cleanProjectName(' :? ')).toBeNull();
  });
});

describe('autosave', () => {
  it('restores what was saved', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    expect(loadAutosave(storage)).toBeUndefined();
    saveAutosave(doc, storage);
    expect(loadAutosave(storage)).toEqual(doc);
  });

  it('takes over the autosave kept under the old project name', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_AUTOSAVE_KEY, serializeProject(doc));
    expect(loadAutosave(storage as unknown as Storage)).toEqual(doc);
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(serializeProject(doc));
    expect(storage.getItem(LEGACY_AUTOSAVE_KEY)).toBeNull();
    expect(loadAutosave(storage as unknown as Storage)).toEqual(doc);
  });

  it('prefers the autosave under the new name', () => {
    const storage = new MemoryStorage();
    const newer = { ...doc, name: 'newer' };
    storage.setItem(LEGACY_AUTOSAVE_KEY, serializeProject(doc));
    storage.setItem(AUTOSAVE_KEY, serializeProject(newer));
    expect(loadAutosave(storage as unknown as Storage)).toEqual(newer);
  });

  it('ignores unreadable data', () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTOSAVE_KEY, '{ broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadAutosave(storage as unknown as Storage)).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
