import { describe, expect, it } from 'vitest';
import { noteName } from '../pitch';
import { isVoiceText, parseXSampa, timeline } from '../xsampa';

const symbols = (text: string) => parseXSampa(text)?.map((phone) => phone.symbol);

describe('X-SAMPA', () => {
  it('splits text into phones, taking the longest symbol', () => {
    expect(symbols('la')).toEqual(['l', 'a']);
    expect(symbols('r\\`@\\')).toEqual(['r\\`', '@\\']);
    expect(symbols('t`S')).toEqual(['t`', 'S']);
    expect(symbols('?\\a?')).toEqual(['?\\', 'a', '?']);
  });

  it('makes vowels nasal with a tilde and skips spaces', () => {
    const phones = parseXSampa('bO~ Zur')!;
    expect(phones.map((p) => p.symbol)).toEqual(['b', 'O~', 'Z', 'u', 'r']);
    expect(phones[1]).toMatchObject({ manner: 'vowel', nasal: true });
  });

  it('only accepts the pulmonic consonants and vowels', () => {
    expect(isVoiceText('la')).toBe(true);
    expect(isVoiceText('a:')).toBe(false); // length marks are not in the subset
    expect(isVoiceText('p_h')).toBe(false); // nor diacritics
    expect(isVoiceText('s~')).toBe(false); // only vowels can be nasal
    expect(isVoiceText('|\\')).toBe(false); // clicks are not pulmonic
    expect(isVoiceText('')).toBe(false);
    expect(isVoiceText('  ')).toBe(false);
  });

  it('gives consonants their natural length and the vowels the rest of the note', () => {
    const segments = timeline(parseXSampa('la')!, 1);
    expect(segments[0].end).toBeCloseTo(0.07);
    expect(segments[1]).toMatchObject({ start: segments[0].end, end: 1 });
  });

  it('shortens consonants in short notes and holds consonants in texts without vowels', () => {
    const short = timeline(parseXSampa('str')!, 0.1);
    expect(short[short.length - 1].end).toBeCloseTo(0.1);
    const hum = timeline(parseXSampa('mm')!, 1);
    expect(hum.map((s) => s.end - s.start)).toEqual([0.5, 0.5]);
    const melisma = timeline(parseXSampa('pa')!, 0.1);
    expect(melisma[1].end - melisma[1].start).toBeGreaterThanOrEqual(0.04 - 1e-9);
  });

  it('labels voice blocks with pitch and text', () => {
    expect(noteName(60, 'voice', 'C', 'la')).toBe('4 C, la');
  });
});
