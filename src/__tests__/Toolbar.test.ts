import { describe, expect, it } from 'vitest';
import { parseMark } from '../Toolbar';

describe('parseMark', () => {
  it('accepts whole numbers from 1 up', () => {
    expect(parseMark('1')).toBe(1);
    expect(parseMark(' 250 ')).toBe(250);
  });

  it('rejects anything else', () => {
    for (const text of ['', '0', '-3', '2.5', '1e3', 'abc', '12a']) {
      expect(parseMark(text)).toBeNull();
    }
  });
});
