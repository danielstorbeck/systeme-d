import { isChord } from './chord';
import { DEFAULT_KEY, isKey } from './keys';
import { DEFAULT_PITCH, isPitch } from './pitch';
import { DEFAULT_BPM, isBpm } from './playback';
import { DEFAULT_SOUND, isSound } from './sound';
import { DEFAULT_TEXT, isVoiceText } from './xsampa';
import type { PooledChain } from './ruler/chains';
import { DEFAULT_VOLUME, isVolume, type Block, type Lane } from './ruler/lanes';
import { isSegments } from './ruler/segments';
import { INITIAL_RULERS, MAIN_RULER_ID, type Ratio, type RulerNode } from './ruler/rulers';
import { clampView, INITIAL_VIEW, type View } from './ruler/viewport';

/** Everything the workspace needs to restore the user's work. */
export interface WorkspaceState {
  rulers: RulerNode[];
  lanes: Lane[];
  /** Lanes created so far, for naming the next one "Lane <n>". */
  lanesCreated: number;
  blocks: Block[];
  chains: PooledChain[];
  view: View;
}

/** What is autosaved and written to project files. Bump the version when the format changes. */
export interface ProjectDocument extends WorkspaceState {
  version: typeof PROJECT_VERSION;
  name: string;
  /** Playback speed. */
  bpm: number;
}

export const PROJECT_VERSION = 1;
export const DEFAULT_PROJECT_NAME = 'composition';
/** The name of the project "New" starts. */
export const NEW_PROJECT_NAME = 'unnamed';
export const AUTOSAVE_KEY = 'systeme-d.autosave';
/** Where the autosave was kept while the project was called "conlon"; moved to AUTOSAVE_KEY on loading. */
export const LEGACY_AUTOSAVE_KEY = 'conlon.autosave';

/** Only the main ruler: no sub-rulers, lanes or blocks. */
export function emptyState(view: View = INITIAL_VIEW): WorkspaceState {
  return { rulers: INITIAL_RULERS, lanes: [], lanesCreated: 0, blocks: [], chains: [], view };
}

export function toDocument(name: string, state: WorkspaceState, bpm: number = DEFAULT_BPM): ProjectDocument {
  return { version: PROJECT_VERSION, name, bpm, ...state };
}

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Reads a project document, throwing an Error that says what is wrong if the text isn't one. */
export function parseProject(text: string): ProjectDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isObject(data)) throw new Error('The file does not contain a project.');
  if (data.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version ${JSON.stringify(data.version)}; expected ${PROJECT_VERSION}.`);
  }
  const { name, bpm, rulers, lanes, lanesCreated, blocks, chains, view } = data;
  check(typeof name === 'string', 'name');
  check(bpm === undefined || isBpm(bpm), 'bpm');
  check(Array.isArray(rulers) && rulers.every(isRuler), 'rulers');
  check(Array.isArray(lanes) && lanes.every(isLane), 'lanes');
  check(isCount(lanesCreated), 'lanesCreated');
  check(Array.isArray(blocks) && blocks.every(isBlock), 'blocks');
  check(Array.isArray(chains) && chains.every(isPooledChain), 'chains');
  check(isObject(view) && isFiniteNumber(view.offsetX) && isFiniteNumber(view.scale) && view.scale > 0, 'view');

  const doc = {
    version: PROJECT_VERSION,
    name,
    // Projects saved before playback get the default speed.
    bpm: bpm ?? DEFAULT_BPM,
    rulers,
    // Projects saved before lanes had keys, sounds, volumes or segments get the defaults.
    lanes: lanes.map((lane) => ({
      ...lane,
      key: lane.key ?? DEFAULT_KEY,
      sound: lane.sound ?? DEFAULT_SOUND,
      volume: lane.volume ?? DEFAULT_VOLUME,
      segments: lane.segments ?? [],
    })),
    lanesCreated,
    // Likewise for blocks saved before they had a pitch, a text or a chord.
    blocks: blocks.map((block) => ({
      ...block,
      pitch: block.pitch ?? DEFAULT_PITCH,
      text: block.text ?? DEFAULT_TEXT,
      chord: block.chord ?? [],
    })),
    chains,
    view: clampView({ offsetX: view.offsetX, scale: view.scale }),
  } as ProjectDocument;
  checkReferences(doc);
  return doc;
}

/** Ruler and lane ids share one counter, blocks and chains have their own. */
export function nextIds(state: WorkspaceState): { node: number; block: number; chain: number } {
  const next = (ids: number[]) => Math.max(0, ...ids) + 1;
  return {
    node: next([...state.rulers.map((r) => r.id), ...state.lanes.map((l) => l.id)]),
    block: next(state.blocks.map((b) => b.id)),
    chain: next(state.chains.map((c) => c.id)),
  };
}

/** Characters not allowed in file names on common systems, plus control characters. */
const UNSAFE_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

/** The name as a file name stem, or null when nothing usable is left. A trailing ".json" is dropped. */
export function cleanProjectName(name: string): string | null {
  const cleaned = name
    .replace(UNSAFE_FILE_NAME, '')
    .trim()
    .replace(/\.json$/i, '')
    .replace(/[. ]+$/, '');
  return cleaned === '' ? null : cleaned;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "<name>.<YYYY-MM-DD_HH-MM-SS>.json", in local time. */
export function projectFileName(name: string, date: Date): string {
  return `${name}.${timestamp(date)}.json`;
}

function timestamp(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${day}_${time}`;
}

/**
 * Names for the MIDI files of one export, "<name>.<YYYY-MM-DD_HH-MM-SS>.<label>.mid", so that they sort together.
 * A label that is no file name becomes "Track <i>", i being its position counting from 0 (with "all" first, a
 * lane's track number in the file with all lanes); repeated labels get " 2", " 3", … added.
 */
export function midiFileNames(name: string, labels: string[], date: Date): string[] {
  const taken = new Set<string>();
  return labels.map((label, i) => {
    const base = cleanProjectName(label) ?? `Track ${i}`;
    let unique = base;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${base} ${n}`;
    taken.add(unique.toLowerCase());
    return `${name}.${timestamp(date)}.${unique}.mid`;
  });
}

/** "<name>.<YYYY-MM-DD_HH-MM-SS>.ly": the score, named like the project file but with LilyPond's extension. */
export function scoreFileName(name: string, date: Date): string {
  return projectFileName(name, date).replace(/\.json$/, '.ly');
}

/** "dump.<name>.<YYYY-MM-DD_HH-MM-SS>.json": the security copy written before "New" clears the work. */
export function dumpFileName(name: string, date: Date): string {
  return `${DUMP_PREFIX}${projectFileName(name, date)}`;
}

const DUMP_PREFIX = 'dump.';
const TIMESTAMP_SUFFIX = /\.\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

/**
 * The project name in a file name written by projectFileName or dumpFileName; other names just lose ".json".
 * Opening a security copy thus gives the project its name back.
 */
export function projectNameFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.json$/i, '');
  if (!TIMESTAMP_SUFFIX.test(stem)) return stem;
  const name = stem.replace(TIMESTAMP_SUFFIX, '');
  return name.startsWith(DUMP_PREFIX) && name.length > DUMP_PREFIX.length ? name.slice(DUMP_PREFIX.length) : name;
}

/** The autosaved project, or undefined if there is none or it can't be read. */
export function loadAutosave(storage: Storage | undefined = safeLocalStorage()): ProjectDocument | undefined {
  try {
    const text = storage?.getItem(AUTOSAVE_KEY);
    if (text) return parseProject(text);
    const legacy = storage?.getItem(LEGACY_AUTOSAVE_KEY);
    if (!legacy) return undefined;
    const doc = parseProject(legacy);
    // Move it under the new key; the old one is dropped only once the copy is stored.
    storage!.setItem(AUTOSAVE_KEY, legacy);
    storage!.removeItem(LEGACY_AUTOSAVE_KEY);
    return doc;
  } catch (error) {
    console.warn('Ignoring the autosaved project:', error);
    return undefined;
  }
}

export function saveAutosave(doc: ProjectDocument, storage: Storage | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch (error) {
    // Storage may be full or disabled; the work is still there until the page closes.
    console.warn('Autosave failed:', error);
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function check(condition: boolean, field: string): asserts condition {
  if (!condition) throw new Error(`The project's "${field}" is missing or malformed.`);
}

/** Ids must be unique, the main ruler must be the root of the tree, and blocks must point at existing things. */
function checkReferences({ rulers, lanes, blocks, chains }: WorkspaceState): void {
  const nodeIds = [...rulers.map((r) => r.id), ...lanes.map((l) => l.id)];
  check(new Set(nodeIds).size === nodeIds.length, 'rulers/lanes (duplicate ids)');
  check(new Set(blocks.map((b) => b.id)).size === blocks.length, 'blocks (duplicate ids)');
  check(new Set(chains.map((c) => c.id)).size === chains.length, 'chains (duplicate ids)');

  const byId = new Map(rulers.map((r) => [r.id, r]));
  const main = byId.get(MAIN_RULER_ID);
  check(main !== undefined && main.parentId === null, 'rulers (no main ruler)');
  for (const ruler of rulers) {
    // Walking up must reach the main ruler; more steps than rulers means a cycle.
    let current: RulerNode | undefined = ruler;
    for (let steps = 0; current && current.id !== MAIN_RULER_ID; steps++) {
      check(steps <= rulers.length && current.parentId !== null, 'rulers (broken tree)');
      current = byId.get(current.parentId);
    }
    check(current !== undefined, 'rulers (missing parent)');
  }

  const laneIds = new Set(lanes.map((l) => l.id));
  const chainIds = new Set(chains.map((c) => c.id));
  check(
    blocks.every((b) => laneIds.has(b.laneId) && chainIds.has(b.chainId)),
    'blocks (unknown lane or chain)',
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRatio(value: unknown): value is Ratio {
  return isObject(value) && isCount(value.m) && isCount(value.n) && value.m > 0 && value.n > 0;
}

function isRuler(value: unknown): value is RulerNode {
  return (
    isObject(value) &&
    isCount(value.id) &&
    (value.parentId === null || isCount(value.parentId)) &&
    isRatio(value.ratio) &&
    Number.isSafeInteger(value.offset) &&
    typeof value.selected === 'boolean'
  );
}

/** A lane, possibly without a key, sound, volume or segments as in projects saved before lanes had them. */
function isLane(
  value: unknown,
): value is Omit<Lane, 'key' | 'sound' | 'volume' | 'segments'> & Partial<Pick<Lane, 'key' | 'sound' | 'volume' | 'segments'>> {
  return (
    isObject(value) &&
    isCount(value.id) &&
    typeof value.name === 'string' &&
    (value.key === undefined || isKey(value.key)) &&
    (value.sound === undefined || isSound(value.sound)) &&
    (value.volume === undefined || isVolume(value.volume)) &&
    (value.segments === undefined || isSegments(value.segments))
  );
}

/** A block, possibly without a pitch, text or chord as in projects saved before blocks had them. */
function isBlock(
  value: unknown,
): value is Omit<Block, 'pitch' | 'text' | 'chord'> & Partial<Pick<Block, 'pitch' | 'text' | 'chord'>> {
  return (
    isObject(value) &&
    (value.chord === undefined || isChord(value.chord)) &&
    (value.pitch === undefined || isPitch(value.pitch)) &&
    (value.text === undefined || isVoiceText(value.text)) &&
    isCount(value.id) &&
    isCount(value.laneId) &&
    isCount(value.chainId) &&
    isFiniteNumber(value.start) &&
    isFiniteNumber(value.end) &&
    value.start < value.end
  );
}

function isPooledChain(value: unknown): value is PooledChain {
  return (
    isObject(value) &&
    isCount(value.id) &&
    Array.isArray(value.chain) &&
    value.chain.every((link) => isObject(link) && isRatio(link.ratio) && Number.isSafeInteger(link.offset))
  );
}
