import { chordPitches, type Chord } from './chord';
import { createNoise, strikeDrum } from './drums';
import { singNote, type SungNote } from './voice';
import { DEFAULT_TEXT } from './xsampa';

/** The melodic sounds: the basic oscillator waveforms of the Web Audio API. */
export const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export type Waveform = (typeof WAVEFORMS)[number];

/** Whether the sound is a waveform, i.e. a melodic sound that can play chords. */
export function isWaveform(sound: Sound): sound is Waveform {
  return (WAVEFORMS as readonly string[]).includes(sound);
}

/**
 * The sounds a lane can have: a waveform, the drum kit, whose pitches are drums rather than notes, or a
 * singing voice, whose blocks also have a text.
 */
export const SOUNDS = [...WAVEFORMS, 'drums', 'voice'] as const;
export type Sound = (typeof SOUNDS)[number];

/** Every lane starts with a sine. */
export const DEFAULT_SOUND: Sound = 'sine';

export const SOUND_LABELS: Record<Sound, string> = {
  sine: 'Sine',
  triangle: 'Triangle',
  square: 'Square',
  sawtooth: 'Sawtooth',
  drums: 'Drums',
  voice: 'Voice',
};

export function isSound(value: unknown): value is Sound {
  return typeof value === 'string' && (SOUNDS as readonly string[]).includes(value);
}

/** Equal temperament with A4 (MIDI 69) at 440 Hz. */
export function midiToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/** Square and sawtooth have strong overtones and sound much louder than sine and triangle at the same gain. */
const WAVEFORM_GAIN: Record<Waveform, number> = { sine: 0.3, triangle: 0.3, square: 0.1, sawtooth: 0.12 };
/** Short fades so that starting and stopping a note doesn't click. */
const ATTACK_S = 0.005;
const RELEASE_S = 0.04;
/** Time constant of the glide to a new level when the waveform or the volume changes while a note sounds. */
const LEVEL_GLIDE_S = 0.01;

/**
 * Gain factor for a lane volume in percent: 50 % plays the sounds at their designed level, 100 % at twice that
 * (6 dB louder), 0 % is silent.
 */
export function volumeLevel(volume: number): number {
  return volume / 50;
}

/** A held note (one oscillator per note of its chord), a drum that was struck and rings out by itself, or a sung note. */
type Voice =
  | { kind: 'tone'; oscillators: OscillatorNode[]; gain: GainNode; level: number }
  | { kind: 'drum'; pitch: number }
  | { kind: 'sung'; note: SungNote };

/** What to play. Volume is in percent (see volumeLevel). */
export interface Note {
  pitch: number;
  sound: Sound;
  volume: number;
  /** The X-SAMPA text a voice sings. */
  text?: string;
  /** Further notes in semitones above the pitch, played by the waveforms only. */
  chord?: Chord;
  /** How long a voice takes to sing its text. */
  seconds?: number;
}

/** A voice sings for this long if not told otherwise. */
const DEFAULT_SUNG_S = 1;

/** Identifies a voice, e.g. a block id or a name for the note being auditioned. */
export type VoiceKey = string | number;

/**
 * Plays any number of notes at once, one voice per key. The audio context is created on first use and must be
 * resumed by a user gesture (see resume), otherwise the browser keeps it silent.
 */
export class Synth {
  private context: AudioContext | undefined;
  /** All voices go through a compressor so that many notes together don't clip. */
  private output: AudioNode | undefined;
  private noise: AudioBuffer | undefined;
  private voices = new Map<VoiceKey, Voice>();
  /** Drums still ringing, also after their voice has stopped. */
  private ringing = new Set<GainNode>();

  /**
   * Starts the note of this voice, or retunes it if it is already sounding. With drums, the voice strikes its
   * drum when it starts and again when it changes to another drum; a struck drum keeps the volume it was
   * struck with. A singing voice sings its text over the given time when it starts, and then follows changes
   * of pitch and volume, but not of the text. A waveform plays the chord with the pitch.
   */
  play(key: VoiceKey, { pitch, sound, volume, text = DEFAULT_TEXT, chord = [], seconds = DEFAULT_SUNG_S }: Note): void {
    const level = volumeLevel(volume);
    const voice = this.voices.get(key);
    if (sound === 'voice') {
      if (voice?.kind === 'sung') {
        voice.note.setPitch(midiToFrequency(pitch));
        voice.note.setLevel(level);
        return;
      }
      if (voice) this.stop(key);
      const context = this.resume();
      if (!context || !this.output) return;
      this.noise ??= createNoise(context);
      const note = singNote(context, this.output, this.noise, { frequency: midiToFrequency(pitch), text, seconds, level });
      this.voices.set(key, { kind: 'sung', note });
      return;
    }
    if (sound === 'drums') {
      if (voice?.kind === 'drum' && voice.pitch === pitch) return;
      if (voice) this.stop(key);
      this.strike(key, pitch, level);
      return;
    }
    const pitches = chordPitches(pitch, chord);
    if (voice?.kind === 'tone' && voice.oscillators.length === pitches.length) {
      this.retune(voice, pitches, sound, level);
      return;
    }
    if (voice) this.stop(key);
    const context = this.resume();
    if (!context || !this.output) return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(WAVEFORM_GAIN[sound] * level, context.currentTime + ATTACK_S);
    gain.connect(this.output);
    const oscillators = pitches.map((p) => {
      const oscillator = context.createOscillator();
      oscillator.type = sound;
      oscillator.frequency.value = midiToFrequency(p);
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    this.voices.set(key, { kind: 'tone', oscillators, gain, level });
  }

  /** Fades out the note of this voice, if it is sounding. A struck drum is left to ring out. */
  stop(key: VoiceKey): void {
    const { context } = this;
    const voice = this.voices.get(key);
    if (!context || !voice) return;
    this.voices.delete(key);
    if (voice.kind === 'drum') return;
    if (voice.kind === 'sung') {
      voice.note.stop();
      return;
    }
    fadeOut(voice.gain, context.currentTime);
    for (const oscillator of voice.oscillators) oscillator.stop(context.currentTime + RELEASE_S);
    voice.oscillators[0].onended = () => voice.gain.disconnect();
  }

  /** Quickly fades out the drums that are still ringing. */
  silenceDrums(): void {
    if (!this.context) return;
    for (const gain of this.ringing) fadeOut(gain, this.context.currentTime);
    this.ringing.clear();
  }

  isPlaying(key: VoiceKey): boolean {
    return this.voices.has(key);
  }

  /**
   * Creates the audio context if needed and wakes it up. Called from a click or key press, this lets notes
   * started later (e.g. from an animation frame) be heard.
   */
  resume(): AudioContext | undefined {
    if (typeof AudioContext === 'undefined') return undefined;
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createDynamicsCompressor();
      this.output.connect(this.context.destination);
    }
    // Browsers start the context suspended until the page has had a click or key press.
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  close(): void {
    for (const key of [...this.voices.keys()]) this.stop(key);
    this.silenceDrums();
    void this.context?.close();
    this.context = undefined;
    this.output = undefined;
    this.noise = undefined;
  }

  private strike(key: VoiceKey, pitch: number, level: number): void {
    const context = this.resume();
    if (!context || !this.output) return;
    this.noise ??= createNoise(context);
    const gain = strikeDrum(context, this.output, this.noise, pitch, level);
    this.ringing.add(gain);
    // Hits keep coming during playback, so forget each one once it has had time to ring out.
    window.setTimeout(() => this.ringing.delete(gain), MAX_RING_MS);
    this.voices.set(key, { kind: 'drum', pitch });
  }

  private retune(voice: Extract<Voice, { kind: 'tone' }>, pitches: number[], waveform: Waveform, level: number): void {
    const { oscillators, gain } = voice;
    const now = this.context!.currentTime;
    oscillators.forEach((oscillator, i) => oscillator.frequency.setValueAtTime(midiToFrequency(pitches[i]), now));
    if (oscillators[0].type !== waveform || voice.level !== level) {
      for (const oscillator of oscillators) oscillator.type = waveform;
      voice.level = level;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(WAVEFORM_GAIN[waveform] * level, now, LEVEL_GLIDE_S);
    }
  }
}

/** Longer than the longest drum (the crash) takes to ring out. */
const MAX_RING_MS = 2000;

function fadeOut(gain: GainNode, now: number): void {
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + RELEASE_S);
}
