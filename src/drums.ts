/**
 * The drum kit. A block in a drum lane keeps its pitch as a MIDI note number, using the General MIDI
 * percussion numbers, so the project format stays the same as for melodic lanes.
 */
export const DRUMS = [
  { name: 'bd', pitch: 36, label: 'Kick' },
  { name: 'sn', pitch: 38, label: 'Snare' },
  { name: 'ho', pitch: 46, label: 'Open hi-hat' },
  { name: 'hc', pitch: 42, label: 'Closed hi-hat' },
  { name: 't1', pitch: 50, label: 'High tom' },
  { name: 't2', pitch: 47, label: 'Mid tom' },
  { name: 't3', pitch: 43, label: 'Floor tom' },
  { name: 'cr', pitch: 49, label: 'Crash' },
  { name: 'rd', pitch: 51, label: 'Ride' },
] as const;

export type Drum = (typeof DRUMS)[number];

/** New blocks in a drum lane are kicks. */
export const DEFAULT_DRUM_PITCH = 36;

/**
 * The drum a pitch stands for. A pitch that is not one of the kit's (e.g. a melody in a lane that was switched
 * to drums) plays the kick, so switching back to a melodic sound gives the melody back unchanged.
 */
export function drumFor(pitch: number): Drum {
  return DRUMS.find((drum) => drum.pitch === pitch) ?? DRUMS[0];
}

/** Moves through the kit in list order; positive steps go up the list, towards the kick. Stops at either end. */
export function stepDrum(pitch: number, steps: number): number {
  const index = DRUMS.indexOf(drumFor(pitch));
  return DRUMS[Math.min(DRUMS.length - 1, Math.max(0, index - steps))].pitch;
}

/** Overall level of the kit, kept below the melodic sounds so that the drums stay in the background. */
const DRUM_GAIN = 0.5;
/** An envelope decays exponentially and can't reach zero; this is quiet enough to stop. */
const SILENT = 0.0001;
const ATTACK_S = 0.002;

interface Filter {
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
}

/** What a drum is made of: pitch-swept tones and filtered noise, each with a quick attack and an exponential decay. */
interface Recipe {
  tones?: { type: OscillatorType; from: number; to: number; sweepS: number; peak: number; decayS: number }[];
  noises?: { filters: Filter[]; peak: number; decayS: number }[];
}

// Soft rather than strident: low sweep starts without a click, noise is low-passed, metal is mostly filtered noise.
const RECIPES: Record<Drum['name'], Recipe> = {
  bd: {
    tones: [{ type: 'sine', from: 110, to: 48, sweepS: 0.09, peak: 0.9, decayS: 0.45 }],
    noises: [{ filters: [{ type: 'lowpass', frequency: 1200 }], peak: 0.06, decayS: 0.02 }],
  },
  sn: {
    tones: [{ type: 'triangle', from: 190, to: 160, sweepS: 0.05, peak: 0.35, decayS: 0.12 }],
    noises: [
      {
        filters: [
          { type: 'bandpass', frequency: 1800, Q: 0.7 },
          { type: 'lowpass', frequency: 6000 },
        ],
        peak: 0.4,
        decayS: 0.2,
      },
    ],
  },
  ho: {
    noises: [
      {
        filters: [
          { type: 'highpass', frequency: 6000 },
          { type: 'lowpass', frequency: 11000 },
        ],
        peak: 0.16,
        decayS: 0.45,
      },
    ],
  },
  hc: {
    noises: [
      {
        filters: [
          { type: 'highpass', frequency: 6000 },
          { type: 'lowpass', frequency: 11000 },
        ],
        peak: 0.2,
        decayS: 0.06,
      },
    ],
  },
  t1: {
    tones: [{ type: 'sine', from: 260, to: 190, sweepS: 0.12, peak: 0.65, decayS: 0.35 }],
    noises: [{ filters: [{ type: 'lowpass', frequency: 2500 }], peak: 0.05, decayS: 0.03 }],
  },
  t2: {
    tones: [{ type: 'sine', from: 190, to: 140, sweepS: 0.14, peak: 0.7, decayS: 0.42 }],
    noises: [{ filters: [{ type: 'lowpass', frequency: 2000 }], peak: 0.05, decayS: 0.03 }],
  },
  t3: {
    tones: [{ type: 'sine', from: 130, to: 95, sweepS: 0.16, peak: 0.8, decayS: 0.55 }],
    noises: [{ filters: [{ type: 'lowpass', frequency: 1500 }], peak: 0.05, decayS: 0.03 }],
  },
  cr: {
    noises: [
      {
        filters: [
          { type: 'highpass', frequency: 3500 },
          { type: 'lowpass', frequency: 9000 },
        ],
        peak: 0.16,
        decayS: 1.6,
      },
    ],
  },
  rd: {
    tones: [
      { type: 'sine', from: 2960, to: 2960, sweepS: 0, peak: 0.02, decayS: 0.7 },
      { type: 'sine', from: 4230, to: 4230, sweepS: 0, peak: 0.015, decayS: 0.5 },
    ],
    noises: [{ filters: [{ type: 'bandpass', frequency: 6500, Q: 1.5 }], peak: 0.12, decayS: 1.1 }],
  },
};

/** One second of white noise for the noisy parts of the kit, played in a loop. */
export function createNoise(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(gain: AudioParam, time: number, peak: number, decayS: number): void {
  gain.setValueAtTime(0, time);
  gain.linearRampToValueAtTime(peak, time + ATTACK_S);
  gain.exponentialRampToValueAtTime(SILENT, time + ATTACK_S + decayS);
}

/**
 * Strikes the drum the pitch stands for, now. It rings out by itself; the returned gain lets it be faded out
 * early, and is disconnected once the drum is silent. The level scales the whole kit (1 = as designed).
 */
export function strikeDrum(
  context: BaseAudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  pitch: number,
  level: number,
): GainNode {
  const { tones = [], noises = [] } = RECIPES[drumFor(pitch).name];
  const time = context.currentTime;
  const output = context.createGain();
  output.gain.value = DRUM_GAIN * level;
  output.connect(destination);

  const sources: AudioScheduledSourceNode[] = [];
  for (const tone of tones) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.from, time);
    if (tone.sweepS > 0) oscillator.frequency.exponentialRampToValueAtTime(tone.to, time + tone.sweepS);
    envelope(gain.gain, time, tone.peak, tone.decayS);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + ATTACK_S + tone.decayS);
    sources.push(oscillator);
  }
  for (const part of noises) {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    let node: AudioNode = source;
    for (const { type, frequency, Q } of part.filters) {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      if (Q !== undefined) filter.Q.value = Q;
      node = node.connect(filter);
    }
    const gain = context.createGain();
    envelope(gain.gain, time, part.peak, part.decayS);
    node.connect(gain).connect(output);
    // A random start in the loop makes repeated hits sound a little different from each other.
    source.start(time, Math.random() * noise.duration);
    source.stop(time + ATTACK_S + part.decayS);
    sources.push(source);
  }

  let playing = sources.length;
  for (const source of sources) {
    source.onended = () => {
      if (--playing === 0) output.disconnect();
    };
  }
  return output;
}
