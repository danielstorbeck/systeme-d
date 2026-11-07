import { describe, expect, it } from 'vitest';
import { isKey, MAJOR_KEYS, MINOR_KEYS } from '../keys';

describe('keys', () => {
  it('has the 15 major and 15 minor keys of the circle of fifths, enharmonics included', () => {
    expect(new Set(MAJOR_KEYS).size).toBe(15);
    expect(new Set(MINOR_KEYS).size).toBe(15);
    expect(MAJOR_KEYS).toEqual(expect.arrayContaining(['B', 'C♭', 'F♯', 'G♭', 'C♯', 'D♭']));
    expect(MINOR_KEYS).toEqual(expect.arrayContaining(['g♯', 'a♭', 'd♯', 'e♭', 'a♯', 'b♭']));
  });

  it('writes major keys in upper case and minor keys in lower case', () => {
    expect(MAJOR_KEYS.every((key) => key[0] === key[0].toUpperCase())).toBe(true);
    expect(MINOR_KEYS.every((key) => key[0] === key[0].toLowerCase())).toBe(true);
  });

  it('recognises only listed keys', () => {
    expect(isKey('f♯')).toBe(true);
    expect(isKey('F#')).toBe(false);
    expect(isKey(3)).toBe(false);
  });
});
