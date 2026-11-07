/**
 * Modes decide how key strokes are read. The "m" key starts a mode command and the next key names the mode:
 * "m h" sets the help mode, "m e" the extension mode, "m l" the lane mode, "m r" the ruler mode, "m b" the
 * border mode, "m t" the transport mode, "m d" the depeche mode, "m c" the content mode.
 *
 * The keys of each mode are described here, next to what they do, and the help overlay is made from these
 * descriptions; keep them in step with the code when keys change.
 */

import { DRUMS, type Drum } from './drums';

export const MODES = ['depeche', 'content', 'help', 'extension', 'lane', 'ruler', 'border', 'transport'] as const;
export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = 'depeche';

export const MODE_LABELS: Record<Mode, string> = {
  depeche: 'Depeche',
  content: 'Content',
  help: 'Help',
  extension: 'Extension',
  lane: 'Lane',
  ruler: 'Ruler',
  border: 'Border',
  transport: 'Transport',
};

/** The key that follows "m" to set each mode. */
export const MODE_KEYS: Record<Mode, string> = {
  depeche: 'd',
  content: 'c',
  help: 'h',
  extension: 'e',
  lane: 'l',
  ruler: 'r',
  border: 'b',
  transport: 't',
};

/** What each mode is for, in a few words. */
export const MODE_SUMMARIES: Record<Mode, string> = {
  depeche: 'the everyday mode; keys work on the highlighted rectangle and the Mark field, and copy and paste rectangles',
  content: 'move between rectangles and set their pitch, chord, text and drum by typing',
  help: 'show this overview of the keyboard shortcuts',
  extension: 'resize the highlighted rectangle mark by mark of the selected sub-ruler, into free space, at least one interval wide',
  lane: 'create, remove, select and move lanes',
  ruler: 'derive, remove, select and move sub-rulers',
  border: 'mark an interval with two green borders, moved along the marks of the selected ruler',
  transport: 'play, stop and loop, between the borders if they are visible',
};

/** The order of the modes in the help overlay: help first. */
export const HELP_ORDER: Mode[] = ['help', 'extension', 'lane', 'ruler', 'border', 'transport', 'depeche', 'content'];

/** What a key does in a mode. Offsets are positive downwards. */
export type Command =
  | { action: 'select'; offset: number }
  | { action: 'move'; offset: number }
  | { action: 'remove' }
  | { action: 'undo' }
  | { action: 'redo' }
  | { action: 'create' }
  | { action: 'derive' }
  | { action: 'scroll'; offset: number }
  | { action: 'leave' }
  | { action: 'border'; side: 'left' | 'right'; offset: number }
  | { action: 'hide' }
  | { action: 'play' }
  | { action: 'stop' }
  | { action: 'reset' }
  | { action: 'loop' }
  | { action: 'mark' }
  | { action: 'copy' }
  | { action: 'cursor' }
  | { action: 'paste' }
  | { action: 'pitch' }
  | { action: 'text' }
  | { action: 'chord' }
  | { action: 'listen' }
  | { action: 'silence' }
  | { action: 'drum'; drum: Drum['name'] }
  | { action: 'highlight'; direction: 'left' | 'right' | 'up' | 'down' }
  | { action: 'resize'; side: 'left' | 'right'; offset: number };

interface Binding {
  key: string;
  command: Command;
  description: string;
}

/** A row of the help overlay: one or more keys and what they do. */
export interface KeyHelp {
  keys: string;
  description: string;
}

/** The commands of lane and ruler mode; "lane" or "ruler" is filled in. */
const listBindings = (thing: string, create: Binding): Binding[] => [
  create,
  { key: 'f', command: { action: 'select', offset: 1 }, description: `select the ${thing} below` },
  { key: 'd', command: { action: 'select', offset: -1 }, description: `select the ${thing} above` },
  { key: 'j', command: { action: 'move', offset: 1 }, description: `move the selected ${thing} down` },
  { key: 'k', command: { action: 'move', offset: -1 }, description: `move the selected ${thing} up` },
  { key: 'r', command: { action: 'remove' }, description: `remove the selected ${thing}` },
  { key: 'z', command: { action: 'undo' }, description: `undo the last removal of a ${thing}` },
  { key: 'y', command: { action: 'redo' }, description: `redo the last undone removal of a ${thing}` },
];

/** Content mode's keys for the drums of the kit, in a drum lane. */
const DRUM_KEYS: Record<Drum['name'], string> = { bd: 'b', sn: 's', hc: 'f', ho: 'g', cr: 'c', rd: 'r', t1: 'q', t2: 'w', t3: 'e' };

const drumBindings = (): Binding[] =>
  DRUMS.map((drum) => ({
    key: DRUM_KEYS[drum.name],
    command: { action: 'drum', drum: drum.name },
    description: `in a drum lane, make the highlighted rectangle the ${drum.label.toLowerCase()} (${drum.name})`,
  }));

const BINDINGS: Record<Mode, Binding[]> = {
  depeche: [
    { key: 'h', command: { action: 'highlight', direction: 'left' }, description: 'highlight the rectangle to the left on the same lane' },
    { key: 'l', command: { action: 'highlight', direction: 'right' }, description: 'highlight the rectangle to the right on the same lane' },
    { key: 'j', command: { action: 'highlight', direction: 'down' }, description: 'highlight the nearest rectangle on the next lane below that has rectangles' },
    { key: 'k', command: { action: 'highlight', direction: 'up' }, description: 'highlight the nearest rectangle on the next lane above that has rectangles' },
    { key: 'g', command: { action: 'mark' }, description: 'go to the Mark field; type a mark of the main ruler and press Enter to scroll there' },
    { key: 'z', command: { action: 'undo' }, description: 'undo the last deletion of a rectangle and highlight it again; while the paste cursor is shown, undo the last paste instead' },
    { key: 'y', command: { action: 'redo' }, description: 'redo the last undone deletion of a rectangle; while the paste cursor is shown, redo the last undone paste instead' },
    {
      key: 'c',
      command: { action: 'copy' },
      description: 'copy the highlighted rectangle: its pitch, its text and its length in intervals of the ruler it was drawn with',
    },
    {
      key: 'p',
      command: { action: 'cursor' },
      description:
        'show or hide the paste cursor; needs something copied and a selected ruler. It starts on the highlighted rectangle, or on the top lane at the left of the view',
    },
    { key: 'v', command: { action: 'paste' }, description: 'paste the copy where the paste cursor is, if the place is free (green)' },
  ],
  content: [
    { key: 'h', command: { action: 'highlight', direction: 'left' }, description: 'highlight the rectangle to the left on the same lane' },
    { key: 'l', command: { action: 'highlight', direction: 'right' }, description: 'highlight the rectangle to the right on the same lane' },
    { key: 'j', command: { action: 'highlight', direction: 'down' }, description: 'highlight the nearest rectangle on the next lane below that has rectangles' },
    { key: 'k', command: { action: 'highlight', direction: 'up' }, description: 'highlight the nearest rectangle on the next lane above that has rectangles' },
    {
      key: 'p',
      command: { action: 'pitch' },
      description:
        'go to the Pitch field of the highlighted rectangle; type <octave><letter><accidental>, e.g. 5a# or 3bb, and press Enter. In a drum lane, choose the drum with the arrow keys',
    },
    {
      key: 'v',
      command: { action: 'chord' },
      description:
        'go to the Chord field of the highlighted rectangle, in a lane with a waveform sound: whole numbers separated by spaces, each a note that many semitones above the pitch, e.g. 4 7 for a major chord; empty for a single note',
    },
    {
      key: 't',
      command: { action: 'text' },
      description: 'go to the Text field of the highlighted rectangle, in a voice lane, to edit what it sings',
    },
    ...drumBindings(),
    {
      key: 'i',
      command: { action: 'listen' },
      description:
        'play the highlighted rectangle, with its chord, until o; not while the transport is playing. It follows changes of pitch, chord and drum, and stops when the rectangle is deleted or content mode is left',
    },
    { key: 'o', command: { action: 'silence' }, description: 'stop the rectangle played with i' },
  ],
  help: [
    { key: 'j', command: { action: 'scroll', offset: 1 }, description: 'scroll down' },
    { key: 'k', command: { action: 'scroll', offset: -1 }, description: 'scroll up' },
    { key: 'Esc', command: { action: 'leave' }, description: 'close the overview and go back to the previous mode' },
  ],
  extension: [
    { key: 's', command: { action: 'resize', side: 'left', offset: -1 }, description: 'move the left edge of the highlighted rectangle to the previous mark of the selected ruler' },
    { key: 'g', command: { action: 'resize', side: 'left', offset: 1 }, description: 'move the left edge of the highlighted rectangle to the next mark of the selected ruler' },
    { key: 'h', command: { action: 'resize', side: 'right', offset: -1 }, description: 'move the right edge of the highlighted rectangle to the previous mark of the selected ruler' },
    { key: 'l', command: { action: 'resize', side: 'right', offset: 1 }, description: 'move the right edge of the highlighted rectangle to the next mark of the selected ruler' },
    { key: 'z', command: { action: 'undo' }, description: 'undo the last resize, one step at a time; leaving extension mode forgets them' },
  ],
  lane: listBindings('lane', { key: 'n', command: { action: 'create' }, description: 'create a new lane at the bottom' }),
  ruler: listBindings('ruler', {
    key: 'n',
    command: { action: 'derive' },
    description: 'derive a new ruler from the selected one (or the main ruler) and edit its m:n ratio',
  }),
  border: [
    { key: 's', command: { action: 'border', side: 'left', offset: -1 }, description: 'move the left border to the previous mark of the selected ruler' },
    { key: 'g', command: { action: 'border', side: 'left', offset: 1 }, description: 'move the left border to the next mark of the selected ruler' },
    { key: 'h', command: { action: 'border', side: 'right', offset: -1 }, description: 'move the right border to the previous mark of the selected ruler' },
    { key: 'l', command: { action: 'border', side: 'right', offset: 1 }, description: 'move the right border to the next mark of the selected ruler' },
    { key: 'r', command: { action: 'hide' }, description: 'hide the borders' },
  ],
  transport: [
    {
      key: 'p',
      command: { action: 'play' },
      description: 'start playback at the playhead; it ends at the right border, or after the last rectangle',
    },
    {
      key: 's',
      command: { action: 'stop' },
      description: 'stop playback; the playhead stays where it stopped until transport mode is left',
    },
    {
      key: 'r',
      command: { action: 'reset' },
      description: 'put the playhead back at the start: the left border, or mark 1 of the main ruler',
    },
    { key: 'l', command: { action: 'loop' }, description: 'turn Loop on or off: at the end, playback starts again at the start' },
  ],
};

/** The rectangle keys, handled by the rulers themselves; they only work in depeche mode. */
const RECTANGLE_KEYS: KeyHelp[] = [
  { keys: 'Arrow keys', description: 'move the highlight between rectangles' },
  { keys: 'd', description: 'delete the highlighted rectangle' },
  { keys: 'r', description: 'recreate the ruler the highlighted rectangle was drawn with' },
];

/** Keys a mode reads that aren't commands. */
const OTHER_KEYS: Partial<Record<Mode, KeyHelp[]>> = {
  border: [
    {
      keys: 'm b',
      description:
        'if the borders are hidden, puts the left one on the leftmost mark in view and the right one on the mark nearest the middle; needs a selected sub-ruler. A border stays on the mark of the ruler it was last moved on, also when another ruler is selected',
    },
  ],
  content: [
    { keys: 'h l j k', description: 'if no rectangle is highlighted, highlight the one in view nearest the middle of the view' },
    { keys: 'Enter', description: 'in the Pitch, Chord or Text field: take what was typed and leave the field' },
    { keys: 'Esc', description: 'in the Pitch, Chord or Text field: leave the field; a pitch being typed is dropped' },
  ],
  depeche: [
    { keys: 'h l j k', description: 'if no rectangle is highlighted, highlight the one in view nearest the middle of the view' },
    {
      keys: 'h l j k',
      description:
        'while the paste cursor is shown: move it a mark of the selected ruler left or right, or to the lane below or above. It is as long as the copy in intervals of the selected ruler, green where the place is free and red over a rectangle',
    },
    ...RECTANGLE_KEYS,
    { keys: 'Enter', description: 'in the Mark field: scroll to the mark and leave the field' },
    { keys: 'Esc', description: 'in the Mark field: leave the field' },
  ],
};

/** The keys each mode reads as commands, by KeyboardEvent.key in lower case. */
export const MODE_COMMANDS: Record<Mode, Record<string, Command>> = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    Object.fromEntries(BINDINGS[mode].map((b) => [b.key === 'Esc' ? 'escape' : b.key.toLowerCase(), b.command])),
  ]),
) as Record<Mode, Record<string, Command>>;

/** All keys a mode reads, for the help overlay. */
export function modeHelp(mode: Mode): KeyHelp[] {
  return [...BINDINGS[mode].map((b) => ({ keys: b.key, description: b.description })), ...(OTHER_KEYS[mode] ?? [])];
}

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

/** Keys that only modify others; they don't end a mode command. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

export interface ModeKeyResult {
  /** An "m" was typed and the next key names the mode. */
  pending: boolean;
  /** The mode to set, if the key completed a mode command. */
  mode?: Mode;
  /** The key belonged to a mode command and must not do anything else. */
  consumed: boolean;
}

/**
 * Reads a key stroke as part of a mode command. After "m", any key ends the command: a mode's key sets that
 * mode, any other key is swallowed so that a typo does nothing unexpected.
 */
export function readModeKey(pending: boolean, key: string): ModeKeyResult {
  if (pending) {
    if (MODIFIER_KEYS.has(key)) return { pending: true, consumed: false };
    const mode = MODES.find((m) => MODE_KEYS[m] === key.toLowerCase());
    return { pending: false, mode, consumed: true };
  }
  if (key === 'm' || key === 'M') return { pending: true, consumed: true };
  return { pending: false, consumed: false };
}
