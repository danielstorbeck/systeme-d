import { describe, expect, it } from 'vitest';
import { HELP_ORDER, MODE_COMMANDS, MODE_KEYS, MODES, modeHelp, readModeKey } from '../modes';

describe('mode commands', () => {
  it('reads "m" and then the mode key', () => {
    expect(readModeKey(false, 'm')).toEqual({ pending: true, consumed: true });
    expect(readModeKey(true, 'e')).toEqual({ pending: false, mode: 'extension', consumed: true });
    expect(readModeKey(true, 'd')).toEqual({ pending: false, mode: 'depeche', consumed: true });
    expect(readModeKey(true, 'E')).toMatchObject({ mode: 'extension' });
  });

  it('waits through modifier keys and swallows an unknown mode key', () => {
    expect(readModeKey(true, 'Shift')).toEqual({ pending: true, consumed: false });
    expect(readModeKey(true, 'n')).toEqual({ pending: false, mode: undefined, consumed: true });
  });

  it('leaves other keys alone', () => {
    expect(readModeKey(false, 'g')).toEqual({ pending: false, consumed: false });
    expect(readModeKey(false, '5')).toEqual({ pending: false, consumed: false });
  });
});

describe('content mode', () => {
  it('is set with "m c", moves the highlight with h, j, k and l and goes to the fields with p and t', () => {
    expect(readModeKey(true, 'c')).toMatchObject({ mode: 'content' });
    expect(MODE_COMMANDS.content.h).toEqual({ action: 'highlight', direction: 'left' });
    expect(MODE_COMMANDS.content.k).toEqual({ action: 'highlight', direction: 'up' });
    expect(MODE_COMMANDS.content.p).toEqual({ action: 'pitch' });
    expect(MODE_COMMANDS.content.t).toEqual({ action: 'text' });
    expect(MODE_COMMANDS.content.v).toEqual({ action: 'chord' });
    expect(MODE_COMMANDS.content.i).toEqual({ action: 'listen' });
    expect(MODE_COMMANDS.content.o).toEqual({ action: 'silence' });
  });

  it('chooses a drum with b, s, f, g, c, r, q, w and e', () => {
    const drums = Object.fromEntries('bsfgcrqwe'.split('').map((key) => [key, MODE_COMMANDS.content[key]]));
    expect(drums).toEqual({
      b: { action: 'drum', drum: 'bd' },
      s: { action: 'drum', drum: 'sn' },
      f: { action: 'drum', drum: 'hc' },
      g: { action: 'drum', drum: 'ho' },
      c: { action: 'drum', drum: 'cr' },
      r: { action: 'drum', drum: 'rd' },
      q: { action: 'drum', drum: 't1' },
      w: { action: 'drum', drum: 't2' },
      e: { action: 'drum', drum: 't3' },
    });
  });

  it('gives each content mode command its own key', () => {
    const keys = modeHelp('content').map((row) => row.keys).filter((keys) => keys.length === 1);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('lane mode', () => {
  it('is set with "m l"', () => {
    expect(readModeKey(true, 'l')).toMatchObject({ mode: 'lane' });
  });
});

describe('ruler mode', () => {
  it('is set with "m r" and reads n as deriving a ruler', () => {
    expect(readModeKey(true, 'r')).toMatchObject({ mode: 'ruler' });
    expect(MODE_COMMANDS.ruler?.n).toEqual({ action: 'derive' });
    expect(MODE_COMMANDS.lane.n).toEqual({ action: 'create' });
  });
});

describe('help mode', () => {
  it('is set with "m h", scrolls with j and k and closes with Escape', () => {
    expect(readModeKey(true, 'h')).toMatchObject({ mode: 'help' });
    expect(MODE_COMMANDS.help.j).toEqual({ action: 'scroll', offset: 1 });
    expect(MODE_COMMANDS.help.k).toEqual({ action: 'scroll', offset: -1 });
    expect(MODE_COMMANDS.help.escape).toEqual({ action: 'leave' });
  });

  it('explains every mode, help first, and every command of each mode', () => {
    expect(HELP_ORDER[0]).toBe('help');
    expect([...HELP_ORDER].sort()).toEqual([...MODES].sort());
    for (const mode of MODES) {
      const keys = modeHelp(mode).map((row) => (row.keys === 'Esc' ? 'escape' : row.keys));
      for (const key of Object.keys(MODE_COMMANDS[mode])) expect(keys).toContain(key);
    }
  });

  it('gives every mode its own key', () => {
    expect(new Set(Object.values(MODE_KEYS)).size).toBe(MODES.length);
  });
});

describe('border mode', () => {
  it('is set with "m b" and moves the borders with s, g, h and l', () => {
    expect(readModeKey(true, 'b')).toMatchObject({ mode: 'border' });
    expect(MODE_COMMANDS.border.s).toEqual({ action: 'border', side: 'left', offset: -1 });
    expect(MODE_COMMANDS.border.g).toEqual({ action: 'border', side: 'left', offset: 1 });
    expect(MODE_COMMANDS.border.h).toEqual({ action: 'border', side: 'right', offset: -1 });
    expect(MODE_COMMANDS.border.l).toEqual({ action: 'border', side: 'right', offset: 1 });
    expect(MODE_COMMANDS.border.r).toEqual({ action: 'hide' });
  });
});

describe('border mode keys', () => {
  it('no longer reads a and ö', () => {
    expect(MODE_COMMANDS.border.a).toBeUndefined();
    expect(MODE_COMMANDS.border['ö']).toBeUndefined();
  });
});

describe('transport mode', () => {
  it('is set with "m t" and reads p, s, r and l', () => {
    expect(readModeKey(true, 't')).toMatchObject({ mode: 'transport' });
    expect(MODE_COMMANDS.transport.p).toEqual({ action: 'play' });
    expect(MODE_COMMANDS.transport.s).toEqual({ action: 'stop' });
    expect(MODE_COMMANDS.transport.r).toEqual({ action: 'reset' });
    expect(MODE_COMMANDS.transport.l).toEqual({ action: 'loop' });
  });
});
