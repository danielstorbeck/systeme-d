import { parseXSampa, timeline, type Formants, type Phone, type Segment } from './xsampa';

/**
 * A synthetic singing voice by formant synthesis: a glottal buzz at the note's pitch passes three resonances
 * (formants) that glide from sound to sound; noise makes the hiss of fricatives, the bursts of plosives and a
 * little breath; a low resonance gives nasals their hum.
 */

/** Overall level, soft like the drums. */
const VOICE_GAIN = 0.9;
/** Formant resonances get weaker upwards, as in a real voice. */
const FORMANT_GAINS = [1, 0.5, 0.25];
const FORMANT_BANDWIDTHS = [80, 100, 140];
const NASAL_FORMANT = { frequency: 270, q: 2 };
/** A gentle vibrato that sets in after the start of the note. */
const VIBRATO_HZ = 5.5;
const VIBRATO_CENTS = 18;
const VIBRATO_DELAY_S = 0.25;
/** Time constants of the glides between sounds. */
const FORMANT_GLIDE_S = 0.02;
const GAIN_GLIDE_S = 0.008;
const ATTACK_S = 0.03;
const RELEASE_S = 0.03;
/** Breath noise under vowels. */
const BREATH = 0.03;
/** Formants used where there are no others to take, e.g. for "h" alone. */
const NEUTRAL: Formants = [500, 1500, 2500];

/** The levels of the voice's parts while a sound lasts. */
interface Levels {
  /** Buzz through the formants. */
  voice: number;
  /** Buzz through the nasal resonance. */
  nasal: number;
  /** Noise through the formants, as in "h" and breath. */
  aspiration: number;
  /** Noise through the fricative's own band. */
  frication: number;
}

function levelsOf(phone: Phone): Levels {
  const voiced = phone.voiced ? 1 : 0;
  const hiss = phone.noise?.gain ?? 0;
  switch (phone.manner) {
    case 'vowel':
      return phone.nasal
        ? { voice: 0.8, nasal: 0.5, aspiration: BREATH, frication: 0 }
        : { voice: 1, nasal: 0, aspiration: BREATH, frication: 0 };
    case 'nasal':
      return { voice: 0.12, nasal: 1, aspiration: 0, frication: 0 };
    case 'plosive':
      // The closure: silent, or a faint hum for voiced plosives. The burst is scheduled separately.
      return { voice: 0, nasal: 0.15 * voiced, aspiration: 0, frication: 0 };
    case 'trill':
    case 'tap':
      return { voice: 0.7, nasal: 0, aspiration: 0, frication: 0 };
    case 'approximant':
      return { voice: 0.7, nasal: 0, aspiration: 0, frication: 0 };
    case 'lateral':
      return { voice: 0.6, nasal: 0, aspiration: 0, frication: 0 };
    case 'fricative':
      if (phone.formants === undefined) return { voice: 0.4 * voiced, nasal: 0, aspiration: 0.25, frication: 0 };
      return { voice: 0.35 * voiced, nasal: 0, aspiration: 0, frication: hiss * (voiced ? 0.7 : 1) };
    case 'lateral-fricative':
      return { voice: 0.35 * voiced, nasal: 0, aspiration: 0, frication: hiss * (voiced ? 0.7 : 1) };
  }
}

/** Glottal sounds take the formants of the next sound, or failing that of the previous one. */
function formantsAt(segments: Segment[], i: number): Formants {
  for (let j = i; j < segments.length; j++) {
    const formants = segments[j].phone.formants;
    if (formants) return formants;
  }
  for (let j = i - 1; j >= 0; j--) {
    const formants = segments[j].phone.formants;
    if (formants) return formants;
  }
  return NEUTRAL;
}

/** A soft glottal buzz: harmonics falling off a little faster than a sawtooth's. */
function glottalWave(context: BaseAudioContext): PeriodicWave {
  const harmonics = 64;
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let n = 1; n < harmonics; n++) imag[n] = 1 / n ** 1.6;
  return context.createPeriodicWave(real, imag);
}

export interface SungNote {
  setPitch(frequency: number): void;
  setLevel(level: number): void;
  /** Fades out early. */
  stop(): void;
}

/**
 * Sings the text over a note of the given length, starting now; it ends by itself after that. The level
 * scales the voice (1 = as designed). Unknown text sings nothing.
 */
export function singNote(
  context: BaseAudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  note: { frequency: number; text: string; seconds: number; level: number },
): SungNote {
  const t0 = context.currentTime;
  const seconds = Math.max(note.seconds, 0.05);
  const segments = timeline(parseXSampa(note.text) ?? [], seconds);
  const end = t0 + seconds;

  const master = context.createGain();
  master.connect(destination);
  const peak = () => VOICE_GAIN * note.level;
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(peak(), t0 + ATTACK_S);
  master.gain.setValueAtTime(peak(), end - RELEASE_S);
  master.gain.linearRampToValueAtTime(0, end);

  // The buzz, with vibrato.
  const buzz = context.createOscillator();
  buzz.setPeriodicWave(glottalWave(context));
  buzz.frequency.value = note.frequency;
  const vibrato = context.createOscillator();
  vibrato.frequency.value = VIBRATO_HZ;
  const vibratoDepth = context.createGain();
  vibratoDepth.gain.setValueAtTime(0, t0);
  vibratoDepth.gain.setValueAtTime(0, t0 + VIBRATO_DELAY_S);
  vibratoDepth.gain.linearRampToValueAtTime(VIBRATO_CENTS, t0 + VIBRATO_DELAY_S + 0.3);
  vibrato.connect(vibratoDepth).connect(buzz.detune);

  const noiseSource = context.createBufferSource();
  noiseSource.buffer = noise;
  noiseSource.loop = true;

  const voiceGain = context.createGain();
  const nasalGain = context.createGain();
  const aspirationGain = context.createGain();
  const fricationGain = context.createGain();
  buzz.connect(voiceGain);
  buzz.connect(nasalGain);
  noiseSource.connect(aspirationGain);

  const formantFilters = FORMANT_GAINS.map((gainValue) => {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = context.createGain();
    gain.gain.value = gainValue;
    voiceGain.connect(filter);
    aspirationGain.connect(filter);
    filter.connect(gain).connect(master);
    return filter;
  });

  const nasalFilter = context.createBiquadFilter();
  nasalFilter.type = 'bandpass';
  nasalFilter.frequency.value = NASAL_FORMANT.frequency;
  nasalFilter.Q.value = NASAL_FORMANT.q;
  nasalGain.connect(nasalFilter).connect(master);

  const fricationFilter = context.createBiquadFilter();
  fricationFilter.type = 'bandpass';
  noiseSource.connect(fricationFilter).connect(fricationGain).connect(master);

  // Start from the first sound's settings, then glide from sound to sound.
  const setFormants = (formants: Formants, time: number, glide: boolean) =>
    formantFilters.forEach((filter, k) => {
      const q = formants[k] / FORMANT_BANDWIDTHS[k];
      if (glide) {
        filter.frequency.setTargetAtTime(formants[k], time, FORMANT_GLIDE_S);
        filter.Q.setTargetAtTime(q, time, FORMANT_GLIDE_S);
      } else {
        filter.frequency.setValueAtTime(formants[k], time);
        filter.Q.setValueAtTime(q, time);
      }
    });
  const gains = { voice: voiceGain.gain, nasal: nasalGain.gain, aspiration: aspirationGain.gain, frication: fricationGain.gain };
  const setLevels = (levels: Levels, time: number, glide: boolean) => {
    for (const part of Object.keys(gains) as (keyof Levels)[]) {
      if (glide) gains[part].setTargetAtTime(levels[part], time, GAIN_GLIDE_S);
      else gains[part].setValueAtTime(levels[part], time);
    }
  };

  segments.forEach((segment, i) => {
    const { phone } = segment;
    const start = t0 + segment.start;
    const length = segment.end - segment.start;
    setFormants(formantsAt(segments, i), start, i > 0);
    setLevels(levelsOf(phone), start, i > 0);
    if (phone.noise) {
      fricationFilter.frequency.setValueAtTime(phone.noise.frequency, start);
      fricationFilter.Q.setValueAtTime(phone.noise.q, start);
    }

    if (phone.manner === 'plosive' && phone.formants) {
      // A burst at the release of the closure; voiceless plosives breathe out after it.
      const release = start + length * 0.7;
      const burst = (phone.noise?.gain ?? 0.1) * 1.5;
      fricationFilter.frequency.setValueAtTime(phone.noise!.frequency, release);
      gains.frication.setValueAtTime(burst, release);
      gains.frication.setTargetAtTime(0, release + 0.005, GAIN_GLIDE_S);
      if (!phone.voiced) {
        gains.aspiration.setValueAtTime(0.15, release + 0.01);
        gains.aspiration.setTargetAtTime(0, release + 0.03, 0.015);
      } else {
        gains.voice.setTargetAtTime(0.6, release, GAIN_GLIDE_S);
      }
    } else if (phone.manner === 'trill') {
      // The tongue or lips flap a few times: the voice dips at about 25 Hz.
      const flap = 0.04;
      for (let t = start; t + flap <= start + length; t += flap) {
        gains.voice.setTargetAtTime(0.2, t, 0.004);
        gains.voice.setTargetAtTime(0.7, t + flap / 2, 0.004);
      }
    } else if (phone.manner === 'tap') {
      gains.voice.setTargetAtTime(0.2, start, 0.004);
      gains.voice.setTargetAtTime(0.7, start + length * 0.8, 0.004);
    }
  });

  const sources = [buzz, vibrato, noiseSource];
  for (const source of sources) {
    source.start(t0, source === noiseSource ? Math.random() * noise.duration : 0);
    source.stop(end + 0.01);
  }
  buzz.onended = () => master.disconnect();

  let stopped = false;
  return {
    setPitch: (frequency) => buzz.frequency.setValueAtTime(frequency, context.currentTime),
    setLevel: (level) => {
      if (stopped || level === note.level) return;
      note.level = level;
      const now = context.currentTime;
      if (now >= end - RELEASE_S) return;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(peak(), now, GAIN_GLIDE_S);
      master.gain.setValueAtTime(peak(), end - RELEASE_S);
      master.gain.linearRampToValueAtTime(0, end);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = context.currentTime;
      if (now >= end) return;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + RELEASE_S);
      for (const source of sources) source.stop(now + RELEASE_S + 0.01);
    },
  };
}
