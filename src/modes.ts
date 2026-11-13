/**
 * Modes decide how key strokes are read. The "m" key starts a mode command and the next key names the mode:
 * "m h" sets the help mode, "m e" the extension mode, "m l" the lane mode, "m r" the ruler mode, "m b" the
 * border mode, "m t" the transport mode, "m d" the depeche mode, "m c" the content mode, "m n" the next mode, "m p" the pattern mode.
 *
 * The keys of each mode are described here, next to what they do, and the help overlay is made from these
 * descriptions; keep them in step with the code when keys change.
 */

import { DRUMS, type Drum } from './drums';

export const MODES = ['depeche', 'content', 'help', 'extension', 'lane', 'ruler', 'border', 'transport', 'next', 'pattern'] as const;
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
  next: 'Next',
  pattern: 'Pattern',
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
  next: 'n',
  pattern: 'p',
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
  next: 'add rectangles and empty spaces one after the other, to the right of the highlighted rectangle',
  pattern: 'choose rectangles of some lanes between the borders, copy them as a pattern and paste it into empty space, once or several times in a row',
};

/** The order of the modes in the help overlay: help first. */
export const HELP_ORDER: Mode[] = ['help', 'extension', 'lane', 'ruler', 'border', 'transport', 'depeche', 'content', 'next', 'pattern'];

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
  | { action: 'digit'; digit: number }
  | { action: 'erase' }
  | { action: 'clear' }
  | { action: 'space' }
  | { action: 'rectangle' }
  | { action: 'choose'; scope: 'all' | 'lane' | 'one' }
  | { action: 'line'; direction: 'left' | 'right' | 'up' | 'down' }
  | { action: 'highlight'; direction: 'left' | 'right' | 'up' | 'down' }
  | { action: 'resize'; side: 'left' | 'right'; offset: number };

interface Binding {
  key: string;
  command: Command;
  description: string;
  /** Keys described together in OTHER_KEYS, e.g. the digits, have no row of their own in the help overlay. */
  unlisted?: boolean;
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
    description: `in a drum lane, choose the ${drum.label.toLowerCase()} (${drum.name}) in the Pitch field; Enter makes the highlighted rectangle that drum`,
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
        'go to the Pitch field of the highlighted rectangle; type <octave><letter><accidental>, e.g. 5a# or 3bb, and press Enter. In a drum lane, choose the drum with the arrow keys or the drum keys and press Enter',
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
  next: [
    ...Array.from({ length: 10 }, (_, digit): Binding => ({
      key: String(digit),
      command: { action: 'digit', digit },
      description: '',
      unlisted: true,
    })),
    { key: 'h', command: { action: 'line', direction: 'left' }, description: 'move the green line to the previous mark of the selected ruler' },
    { key: 'l', command: { action: 'line', direction: 'right' }, description: 'move the green line to the next mark of the selected ruler' },
    { key: 'j', command: { action: 'line', direction: 'down' }, description: 'move the green line to the lane below, at the same place' },
    { key: 'k', command: { action: 'line', direction: 'up' }, description: 'move the green line to the lane above, at the same place' },
    { key: 'Backspace', command: { action: 'erase' }, description: 'take back the last digit of the length' },
    { key: 'Esc', command: { action: 'clear' }, description: 'drop the length typed so far' },
    {
      key: 'r',
      command: { action: 'space' },
      description: 'leave an empty space of the typed length after the green line; the line moves to its right end',
    },
    {
      key: 'p',
      command: { action: 'rectangle' },
      description:
        'put a rectangle of the typed length after the green line, with the content of the rectangle before it on that lane, and go to its Pitch field: type the pitch, e.g. 5a#, or Enter alone to keep the copied one, or in a drum lane choose the drum with the arrow keys or the drum keys of content mode, and press Enter. The line then moves to its right end',
    },
    {
      key: 'z',
      command: { action: 'undo' },
      description: 'undo the last space or rectangle, one step at a time: the rectangle goes and the green line goes back; leaving next mode forgets them',
    },
    {
      key: 'y',
      command: { action: 'redo' },
      description: 'redo the last undone space or rectangle, with the pitch it had; a rectangle only comes back if its place is still free',
    },
  ],
  pattern: [
    { key: 'h', command: { action: 'highlight', direction: 'left' }, description: 'move the select cursor to the rectangle to the left on its lane, between the borders; while the paste cursor is shown, move it to the previous mark of the selected ruler (the main ruler if none is selected)' },
    { key: 'l', command: { action: 'highlight', direction: 'right' }, description: 'move the select cursor to the rectangle to the right on its lane, between the borders; while the paste cursor is shown, move it to the next mark of the selected ruler (the main ruler if none is selected)' },
    {
      key: 'j',
      command: { action: 'highlight', direction: 'down' },
      description: 'move the select cursor to the lane below, onto its rectangle nearest the cursor between the borders, if it has one; while the paste cursor is shown, move it a lane down, if the pattern still fits on the lanes',
    },
    {
      key: 'k',
      command: { action: 'highlight', direction: 'up' },
      description: 'move the select cursor to the lane above, onto its rectangle nearest the cursor between the borders, if it has one; while the paste cursor is shown, move it a lane up',
    },
    {
      key: 'a',
      command: { action: 'choose', scope: 'all' },
      description: 'choose all rectangles between the borders; if all of them are chosen already, unchoose them all',
    },
    {
      key: 's',
      command: { action: 'choose', scope: 'lane' },
      description: "choose all rectangles between the borders on the cursor's lane; if all of them are chosen already, unchoose them",
    },
    { key: 'd', command: { action: 'choose', scope: 'one' }, description: 'choose the rectangle under the select cursor, or unchoose it if it is chosen' },
    {
      key: 'c',
      command: { action: 'copy' },
      description:
        'copy the chosen rectangles as a pattern, as wide as between the borders. It stays as it was copied, whatever happens to the lanes and rectangles afterwards, until another pattern is copied, also after leaving pattern mode',
    },
    {
      key: 'p',
      command: { action: 'cursor' },
      description:
        'show or hide the paste cursor; needs a copied pattern. It is as wide as the pattern and covers as many lanes as it, starting right of the right border (or of the rightmost rectangle without borders), on the lanes the pattern was copied from. It is green where the space is empty and red where a rectangle is in the way',
    },
    {
      key: 'v',
      command: { action: 'paste' },
      description: 'paste the pattern where the paste cursor is, if the space is empty (green); the cursor then moves on by its width, so that repeated v pastes the pattern again and again in a row',
    },
    {
      key: 'z',
      command: { action: 'undo' },
      description: 'undo the last change to the chosen rectangles, one step at a time; while the paste cursor is shown, undo the last paste instead and move the cursor back. Leaving pattern mode forgets them',
    },
    { key: 'y', command: { action: 'redo' }, description: 'redo the last undone change to the chosen rectangles; while the paste cursor is shown, redo the last undone paste, if its space is still empty' },
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
  next: [
    {
      keys: 'm n',
      description:
        'shows a thin green line at the right end of the highlighted rectangle in place of its highlight; needs a highlighted rectangle. Clicking a rectangle moves the line to its right end',
    },
    {
      keys: '0–9',
      description:
        'type the length of what comes next, in intervals of the selected ruler (one is needed). The paste cursor shows it from the green line to that many marks of the selected ruler on, so it always ends on a mark; if the line is between marks, the first interval is the part up to the next mark. It is green where the place is free, red over a rectangle, where r and p do nothing',
    },
  ],
  pattern: [
    {
      keys: 'm p',
      description:
        'shows the select cursor: the lane it is on is shaded and the rectangle it is on outlined like the highlight; it starts on the highlighted rectangle. Only rectangles wholly between the borders of border mode can be chosen, the others are faded; without borders, all rectangles can. Chosen rectangles are purple. They stay chosen when pattern mode is left and entered again, as long as they are still between the borders. Clicking a rectangle moves the cursor there. Leaving pattern mode hides the paste cursor',
    },
  ],
  content: [
    { keys: 'h l j k', description: 'if no rectangle is highlighted, highlight the one in view nearest the middle of the view' },
    { keys: 'Enter', description: 'in the Pitch, Chord or Text field: take what was typed and leave the field; in the empty Pitch field, keep the pitch shown greyed out' },
    { keys: 'Esc', description: 'in the Pitch, Chord or Text field: leave the field; a pitch being typed or a drum not yet confirmed is dropped' },
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
  return [
    ...BINDINGS[mode].filter((b) => !b.unlisted).map((b) => ({ keys: b.key, description: b.description })),
    ...(OTHER_KEYS[mode] ?? []),
  ];
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
