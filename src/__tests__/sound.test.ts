import { describe, expect, it } from 'vitest';
import { isSound, midiToFrequency, SOUNDS, volumeLevel } from '../sound';

describe('sound', () => {
  it('offers the four basic waveforms, the drum kit and the voice', () => {
    expect(SOUNDS).toEqual(['sine', 'triangle', 'square', 'sawtooth', 'drums', 'voice']);
    expect(isSound('square')).toBe(true);
    expect(isSound('drums')).toBe(true);
    expect(isSound('noise')).toBe(false);
  });

  it('plays 50 % volume at the designed level and 100 % at twice that', () => {
    expect(volumeLevel(50)).toBe(1);
    expect(volumeLevel(100)).toBe(2);
    expect(volumeLevel(0)).toBe(0);
  });

  it('tunes A4 to 440 Hz in equal temperament', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(81)).toBe(880);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 2);
  });
});
