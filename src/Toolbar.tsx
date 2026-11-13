import { useEffect, useRef, useState } from 'react';
import { DRUMS, drumFor, type Drum } from './drums';
import { DEFAULT_MODE, isMode, MODE_COMMANDS, type Command, MODE_KEYS, MODE_LABELS, MODES, readModeKey, type Mode } from './modes';
import { isKey, MAJOR_KEYS, MINOR_KEYS, type Key } from './keys';
import { MAX_PITCH, MIN_PITCH, parsePitch, pitchName } from './pitch';
import { MAX_BPM, MIN_BPM, parseBpm } from './playback';
import { cleanProjectName } from './project';
import { isVoiceText } from './xsampa';
import { formatChord, parseChord, type Chord } from './chord';
import { isSound, isWaveform, SOUND_LABELS, SOUNDS, type Sound } from './sound';
import { FIRST_MARK } from './ruler/viewport';
import { HelpOverlay } from './HelpOverlay';

/** How far j and k scroll the help overlay. */
const HELP_SCROLL_STEP_PX = 60;

interface ToolbarProps {
  onGoToMark: (mark: number) => void;
  playing: boolean;
  /** Starts playback at the mark in the Mark field, or at the first mark if the field is empty. */
  onPlay: (fromMark: number) => void;
  onStop: () => void;
  /** Whether playback starts again at its start when it reaches its end. */
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onNewLane: () => void;
  /** Whether the lanes show their segment lines in an upper part. */
  segmentation: boolean;
  onSegmentationChange: (segmentation: boolean) => void;
  /** Called with every mode that is set, help included. */
  onModeChange: (mode: Mode) => void;
  /** Called when a mode is set, e.g. to select the top lane in lane mode. */
  onModeEnter: (mode: Mode) => void;
  /** Called when a mode is left for another one; looking at the help in between doesn't count as leaving. */
  onModeLeave: (mode: Mode) => void;
  /** A key read as a command of a mode; true when next mode has put a rectangle whose pitch is to be set. */
  onCommand: (mode: Mode, command: Command) => number | undefined;
  /** Id of the highlighted block; undefined while no block is highlighted. */
  blockId: number | undefined;
  /** The Pitch field was left after next mode had put a rectangle, whether its pitch was confirmed or not. */
  onPitchDone: () => void;
  /** Key of the selected lane; undefined while no lane is selected. */
  laneKey: Key | undefined;
  onKeyChange: (key: Key) => void;
  /** Sound of the selected lane; undefined while no lane is selected. */
  laneSound: Sound | undefined;
  onSoundChange: (sound: Sound) => void;
  /** Pitch of the highlighted block; undefined while no block is highlighted. */
  pitch: number | undefined;
  /** Key of the highlighted block's lane; the pitch names are spelled in it. */
  pitchKey: Key | undefined;
  /** Sound of the highlighted block's lane; in a drum lane the list offers the drums instead of notes. */
  pitchSound: Sound | undefined;
  onPitchChange: (pitch: number) => void;
  /** Sung text of the highlighted block; it can only be edited in voice lanes. */
  text: string | undefined;
  onTextChange: (text: string) => void;
  /** Chord of the highlighted block; it can only be edited in lanes with a waveform sound. */
  chord: Chord | undefined;
  onChordChange: (chord: Chord) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSave: () => void;
  onOpen: (file: File) => void;
  /** Saves a security copy and starts over with only the main ruler; the tool bar then sets depeche mode. */
  onNew: () => void;
  /** Downloads the rectangles as MIDI files. */
  onMidiExport: () => void;
  /** Downloads the rectangles as a LilyPond score. */
  onScoreExport: () => void;
}

/** Highest pitch first, so that up in the list is up in pitch, like rolling the wheel away from you. */
const PITCHES_HIGH_TO_LOW = Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => MAX_PITCH - i);

/** Accepts a whole number of at least FIRST_MARK; returns null for anything else. */
export function parseMark(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const mark = Number(text);
  return Number.isSafeInteger(mark) && mark >= FIRST_MARK ? mark : null;
}

/** Controls below the rulers. The bar itself has no visible frame, only its content. */
export function Toolbar({
  onGoToMark,
  playing,
  onPlay,
  onStop,
  loop,
  onLoopChange,
  bpm,
  onBpmChange,
  onNewLane,
  segmentation,
  onSegmentationChange,
  onModeChange,
  onModeEnter,
  onModeLeave,
  onCommand,
  onPitchDone,
  blockId,
  laneKey,
  onKeyChange,
  laneSound,
  onSoundChange,
  pitch,
  pitchKey,
  pitchSound,
  onPitchChange,
  text: blockText,
  onTextChange,
  chord,
  onChordChange,
  projectName,
  onProjectNameChange,
  onSave,
  onOpen,
  onNew,
  onMidiExport,
  onScoreExport,
}: ToolbarProps) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const markInputRef = useRef<HTMLInputElement>(null);
  const [markFocused, setMarkFocused] = useState(false);
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  /** An "m" was typed; the next key names the mode. */
  const [modePending, setModePending] = useState(false);
  // The key listener reads these between renders.
  const modeRef = useRef(mode);
  const modePendingRef = useRef(modePending);
  const helpRef = useRef<HTMLDivElement>(null);
  /** The mode before help mode, which Escape goes back to. */
  const modeBeforeHelpRef = useRef<Mode>(DEFAULT_MODE);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const onPitchDoneRef = useRef(onPitchDone);
  onPitchDoneRef.current = onPitchDone;
  /** Next mode's new rectangle is getting its pitch; leaving the Pitch field moves the green line on. */
  const nextPitchRef = useRef(false);
  const leavePitchField = () => {
    if (!nextPitchRef.current) return;
    nextPitchRef.current = false;
    onPitchDoneRef.current();
  };
  /** A rectangle next mode has just put, whose Pitch field opens as soon as the fields show it. */
  const pendingPitchBlockRef = useRef<number | null>(null);
  // Runs after the render in which the fields (fieldsRef) belong to the new rectangle, which may be on another
  // lane, e.g. a drum lane, than the rectangle highlighted before.
  useEffect(() => {
    if (blockId === undefined || pendingPitchBlockRef.current !== blockId) return;
    pendingPitchBlockRef.current = null;
    nextPitchRef.current = true;
    if (!startPitch()) leavePitchField();
  }, [blockId]);
  const loopRef = useRef({ loop, onLoopChange });
  loopRef.current = { loop, onLoopChange };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drums = pitchSound === 'drums';
  const textEditable = blockText !== undefined && pitchSound === 'voice';
  const [textDraft, setTextDraft] = useState(blockText ?? '');
  const textInvalid = textEditable && !isVoiceText(textDraft);
  // Show the text of a newly highlighted block; the user's own typing changes it to the same text.
  useEffect(() => {
    setTextDraft((draft) => (draft === blockText ? draft : (blockText ?? '')));
  }, [blockText]);
  const pitchSelectRef = useRef<HTMLSelectElement>(null);
  const [pitchFocused, setPitchFocused] = useState(false);
  /** The pitch being typed after p in content mode; null while the Pitch list is shown. */
  const [pitchEntry, setPitchEntry] = useState<string | null>(null);
  const [pitchEntryInvalid, setPitchEntryInvalid] = useState(false);
  /** The drum chosen in content mode, in a drum lane, until Enter makes it the rectangle's; null otherwise. */
  const [drumEntry, setDrumEntry] = useState<number | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [textFocused, setTextFocused] = useState(false);
  // A typed pitch belongs to the rectangle it was started on.
  useEffect(() => {
    if (pitch === undefined || drums) setPitchEntry(null);
    if (pitch === undefined || !drums) setDrumEntry(null);
  }, [pitch, drums]);
  const chordEditable = chord !== undefined && pitchSound !== undefined && isWaveform(pitchSound);
  const chordText = chord === undefined ? '' : formatChord(chord);
  const [chordDraft, setChordDraft] = useState(chordText);
  const chordInvalid = chordEditable && parseChord(chordDraft) === null;
  // Show the chord of a newly highlighted block; the user's own typing changes it to the same chord.
  useEffect(() => {
    setChordDraft((draft) => {
      const typed = parseChord(draft);
      return typed !== null && formatChord(typed) === chordText ? draft : chordText;
    });
  }, [chordText]);
  const chordInputRef = useRef<HTMLInputElement>(null);
  const [chordFocused, setChordFocused] = useState(false);
  // The key listener reads these between renders.
  const fieldsRef = useRef({ pitch, drums, textEditable, chordEditable, onPitchChange });
  fieldsRef.current = { pitch, drums, textEditable, chordEditable, onPitchChange };
  const keyless = laneKey === undefined || laneSound === 'drums';
  const nameInvalid = cleanProjectName(projectName) === null;
  const [bpmText, setBpmText] = useState(String(bpm));
  const bpmInvalid = parseBpm(bpmText) === null;
  // Show a BPM that changed elsewhere, e.g. by opening a project; the user's own typing changes it to the same value.
  useEffect(() => {
    setBpmText((text) => (parseBpm(text) === bpm ? text : String(bpm)));
  }, [bpm]);

  /** Focuses the Mark field with its text selected for typing over. */
  const focusMark = () => {
    markInputRef.current?.focus();
    markInputRef.current?.select();
  };

  /**
   * Content mode's p: in a drum lane the Pitch list takes the keys, to choose a drum with the arrow keys or the drum
   * keys and confirm it with Enter; elsewhere a pitch is typed, e.g. 5a#, in a text field shown in its place.
   */
  const startPitch = (): boolean => {
    const { pitch, drums } = fieldsRef.current;
    if (pitch === undefined) return false;
    if (drums) {
      if (document.activeElement !== pitchSelectRef.current) setDrumEntry(drumFor(pitch).pitch);
      pitchSelectRef.current?.focus();
    } else {
      setPitchEntry('');
      setPitchEntryInvalid(false);
    }
    return true;
  };

  /** Content mode's drum keys: in a drum lane, the Pitch list shows that drum; Enter makes it the rectangle's. */
  const chooseDrum = (name: Drum['name']) => {
    const { pitch, drums } = fieldsRef.current;
    const drum = DRUMS.find((d) => d.name === name);
    if (pitch === undefined || !drums || !drum) return;
    setDrumEntry(drum.pitch);
    pitchSelectRef.current?.focus();
  };

  /** Content mode's v: the Chord field takes the keys, if the highlighted rectangle is in a lane with a waveform. */
  const startChord = () => {
    if (!fieldsRef.current.chordEditable) return;
    chordInputRef.current?.focus();
    chordInputRef.current?.select();
  };

  /** Content mode's t: the Text field takes the keys, if the highlighted rectangle is in a voice lane. */
  const startText = () => {
    if (!fieldsRef.current.textEditable) return;
    textInputRef.current?.focus();
    textInputRef.current?.select();
  };

  /** Sets a mode; going back to the mode before help keeps that mode's state, e.g. the selected lane. */
  const changeMode = (next: Mode, prepare = true) => {
    const left = modeRef.current === 'help' ? modeBeforeHelpRef.current : modeRef.current;
    if (next !== 'help' && next !== left) onModeLeave(left);
    if (next === 'help' && modeRef.current !== 'help') modeBeforeHelpRef.current = modeRef.current;
    modeRef.current = next;
    setMode(next);
    onModeChange(next);
    const active = document.activeElement;
    if (
      active === markInputRef.current ||
      active === pitchSelectRef.current ||
      active === chordInputRef.current ||
      active === textInputRef.current
    ) {
      (active as HTMLElement).blur();
    }
    setPitchEntry(null);
    if (prepare) onModeEnter(next);
  };

  const setPending = (pending: boolean) => {
    modePendingRef.current = pending;
    setModePending(pending);
  };

  // "m" starts a mode command anywhere except in fields where letters are text; other keys are commands of the
  // mode (see MODE_COMMANDS).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const target = e.target instanceof Element ? e.target : null;
      const inLetterField =
        target !== markInputRef.current &&
        !!target?.closest('textarea, input:not([inputmode="numeric"]):not([inputmode="decimal"])');
      if (!inLetterField) {
        const result = readModeKey(modePendingRef.current, e.key);
        if (result.pending !== modePendingRef.current) setPending(result.pending);
        if (result.consumed) {
          e.preventDefault();
          e.stopPropagation();
          if (result.mode) changeMode(result.mode);
        }
        if (result.consumed || result.pending) return;
      }
      // In next mode the Pitch list of a drum lane also takes content mode's drum keys.
      const drumCommand = MODE_COMMANDS.content[e.key.toLowerCase()];
      const command =
        modeRef.current === 'next' && target === pitchSelectRef.current && drumCommand?.action === 'drum'
          ? drumCommand
          : MODE_COMMANDS[modeRef.current]?.[e.key.toLowerCase()];
      if (command && !inLetterField) {
        e.preventDefault();
        e.stopPropagation();
        // Other commands, e.g. highlighting another rectangle, leave the Pitch list and drop a drum not yet confirmed.
        if (command.action !== 'drum' && command.action !== 'pitch' && document.activeElement === pitchSelectRef.current) {
          pitchSelectRef.current?.blur();
        }
        if (command.action === 'scroll') helpRef.current?.scrollBy({ top: command.offset * HELP_SCROLL_STEP_PX });
        else if (command.action === 'leave') changeMode(modeBeforeHelpRef.current, false);
        else if (command.action === 'loop') loopRef.current.onLoopChange(!loopRef.current.loop);
        else if (command.action === 'mark') focusMark();
        else if (command.action === 'pitch') startPitch();
        else if (command.action === 'text') startText();
        else if (command.action === 'chord') startChord();
        else if (command.action === 'drum') chooseDrum(command.drum);
        else {
          // Next mode put a rectangle; its Pitch field opens once it is highlighted (see below).
          const blockId = onCommandRef.current(modeRef.current, command);
          if (blockId !== undefined) pendingPitchBlockRef.current = blockId;
        }
        return;
      }
      // While the overview is open, other keys don't change the work behind it.
      if (modeRef.current === 'help' && !inLetterField && (e.key.length === 1 || e.key.startsWith('Arrow'))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Capture, so that the keys of a mode command never reach the rulers' own shortcuts.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const pitchClasses = ['toolbar-select', pitchFocused && 'active'].filter(Boolean).join(' ');
  const pitchEntryClasses = ['toolbar-input pitch active', pitchEntryInvalid && 'invalid'].filter(Boolean).join(' ');
  const chordClasses = ['toolbar-input chord', chordInvalid && 'invalid', chordFocused && 'active'].filter(Boolean).join(' ');
  const textClasses = ['toolbar-input text', textInvalid && 'invalid', textFocused && 'active'].filter(Boolean).join(' ');
  const markClasses = ['toolbar-input', invalid && 'invalid', markFocused && 'active'].filter(Boolean).join(' ');

  const play = () => {
    if (text.trim() === '') {
      onPlay(FIRST_MARK);
      return;
    }
    const mark = parseMark(text);
    if (mark === null) setInvalid(true);
    else onPlay(mark);
  };

  return (
    <footer className="toolbar">
      {mode === 'help' && <HelpOverlay ref={helpRef} />}
      <div className="toolbar-row">
        <label className="toolbar-field">
          Mode:
          <select
            className={modePending ? 'toolbar-select mode pending' : 'toolbar-select mode'}
            value={mode}
            title={`How key strokes are read. Type m and then ${MODES.map((m) => `${MODE_KEYS[m]} for ${MODE_LABELS[m]}`).join(', ')}`}
            onChange={(e) => {
              if (isMode(e.target.value)) changeMode(e.target.value);
            }}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        {modePending && <span className="mode-pending">m…</span>}
      </div>
      <div className="toolbar-row">
        <label className="toolbar-field">
          Mark:
          <input
            ref={markInputRef}
            className={markClasses}
            value={text}
            inputMode="numeric"
            spellCheck={false}
            aria-invalid={invalid}
            title="Press Enter to scroll this main-ruler mark to the left end"
            onFocus={() => setMarkFocused(true)}
            onBlur={() => setMarkFocused(false)}
            onChange={(e) => {
              setText(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur();
              if (e.key !== 'Enter') return;
              // The rulers only move once the number is confirmed.
              const mark = parseMark(text);
              if (mark === null) {
                setInvalid(true);
                return;
              }
              onGoToMark(mark);
              e.currentTarget.blur();
            }}
          />
        </label>
        <button
          type="button"
          className="toolbar-button play"
          title={playing ? 'Stop playback' : 'Play from the mark in the Mark field, or from mark 1 if it is empty'}
          onClick={playing ? onStop : play}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
        <label className="toolbar-field">
          Loop:
          <select
            className="toolbar-select"
            value={loop ? 'on' : 'off'}
            title="At the end, playback starts again at its start (l in transport mode toggles this)"
            onChange={(e) => onLoopChange(e.target.value === 'on')}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label className="toolbar-field">
          BPM:
          <input
            className={bpmInvalid ? 'toolbar-input bpm invalid' : 'toolbar-input bpm'}
            value={bpmText}
            inputMode="decimal"
            spellCheck={false}
            aria-invalid={bpmInvalid}
            title={`Playback speed in beats per minute (${MIN_BPM}–${MAX_BPM}); a beat is a quarter of a main-ruler interval`}
            onChange={(e) => {
              setBpmText(e.target.value);
              const value = parseBpm(e.target.value);
              if (value !== null) onBpmChange(value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            onBlur={() => setBpmText(String(bpm))}
          />
        </label>
      </div>
      {/* Rectangle fields above the lane fields; both act on what is selected in the workspace. */}
      <div className="toolbar-row">
        <label className="toolbar-field">
          Pitch:
          {pitchEntry !== null ? (
            <input
              className={pitchEntryClasses}
              value={pitchEntry}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder={pitch === undefined ? '' : pitchName(pitch, pitchKey).replace(' ', '')}
              aria-invalid={pitchEntryInvalid}
              title="Type <octave><letter><accidental>, e.g. 5a# or 3bb, and press Enter; Enter alone or Esc keeps the pitch shown"
              onChange={(e) => {
                setPitchEntry(e.target.value);
                setPitchEntryInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') e.currentTarget.blur();
                if (e.key !== 'Enter') return;
                // Enter in the empty field confirms the pitch shown greyed out, e.g. the copy next mode gives a new rectangle.
                if (pitchEntry.trim() === '') {
                  e.currentTarget.blur();
                  return;
                }
                const typed = parsePitch(pitchEntry);
                if (typed === null) {
                  setPitchEntryInvalid(true);
                  return;
                }
                onPitchChange(typed);
                e.currentTarget.blur();
              }}
              onBlur={() => {
                setPitchEntry(null);
                leavePitchField();
              }}
            />
          ) : (
          <select
            ref={pitchSelectRef}
            className={pitchClasses}
            value={pitch === undefined ? '' : drums ? (drumEntry ?? drumFor(pitch).pitch) : pitch}
            disabled={pitch === undefined}
            title={
              pitch === undefined
                ? 'Click a rectangle, or roll the mouse wheel over it, to set its pitch'
                : drumEntry !== null
                  ? 'Press Enter to make the highlighted rectangle this drum; Esc keeps its drum'
                  : 'Pitch of the highlighted rectangle; rolling the mouse wheel over a rectangle changes it too'
            }
            onChange={(e) => {
              // A drum chosen with the keys after p or a drum key waits for Enter.
              if (drumEntry !== null) setDrumEntry(Number(e.target.value));
              else onPitchChange(Number(e.target.value));
            }}
            onFocus={() => setPitchFocused(true)}
            onBlur={() => {
              setPitchFocused(false);
              setDrumEntry(null);
              leavePitchField();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && drumEntry !== null && pitch !== undefined && drumEntry !== drumFor(pitch).pitch) {
                onPitchChange(drumEntry);
              }
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
          >
            {pitch === undefined && <option value="">–</option>}
            {drums
              ? DRUMS.map((drum) => (
                  <option key={drum.pitch} value={drum.pitch} title={drum.label}>
                    {drum.name}
                  </option>
                ))
              : PITCHES_HIGH_TO_LOW.map((p) => (
                  <option key={p} value={p}>
                    {pitchName(p, pitchKey)}
                  </option>
                ))}
          </select>
          )}
        </label>
        <label className="toolbar-field">
          Chord:
          <input
            ref={chordInputRef}
            className={chordClasses}
            value={chordEditable ? chordDraft : ''}
            disabled={!chordEditable}
            spellCheck={false}
            autoComplete="off"
            placeholder={chordEditable ? 'e.g. 4 7' : ''}
            aria-invalid={chordInvalid}
            title={
              chordEditable
                ? 'Notes played with the pitch of the highlighted rectangle, in semitones above it, separated by spaces: 4 7 is a major chord, 3 7 a minor one'
                : 'Highlight a rectangle in a lane with a waveform sound (sine, triangle, square, sawtooth) to give it a chord'
            }
            onChange={(e) => {
              setChordDraft(e.target.value);
              const typed = parseChord(e.target.value);
              if (typed !== null) onChordChange(typed);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            onFocus={() => setChordFocused(true)}
            onBlur={() => {
              setChordFocused(false);
              setChordDraft(chordText);
            }}
          />
        </label>
        <label className="toolbar-field">
          Text:
          <input
            ref={textInputRef}
            className={textClasses}
            value={textEditable ? textDraft : ''}
            disabled={!textEditable}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={textInvalid}
            title={
              textEditable
                ? 'What the highlighted rectangle sings, in X-SAMPA: pulmonic consonants and vowels, "~" after a vowel nasalizes it'
                : 'Highlight a rectangle in a Voice lane to edit what it sings'
            }
            onChange={(e) => {
              setTextDraft(e.target.value);
              if (isVoiceText(e.target.value)) onTextChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            onFocus={() => setTextFocused(true)}
            onBlur={() => {
              setTextFocused(false);
              setTextDraft(blockText ?? '');
            }}
          />
        </label>
      </div>
      <div className="toolbar-row">
        <button type="button" className="toolbar-button" onClick={onNewLane}>
          New lane
        </button>
        <label className="toolbar-field">
          Key:
          <select
            className="toolbar-select"
            value={laneKey ?? ''}
            disabled={keyless}
            title={
              laneKey === undefined
                ? 'Click a lane name to select a lane'
                : laneSound === 'drums'
                  ? 'Drums have no key'
                  : 'Key of the selected lane'
            }
            onChange={(e) => {
              if (isKey(e.target.value)) onKeyChange(e.target.value);
            }}
          >
            {laneKey === undefined && <option value="">–</option>}
            <optgroup label="Major">
              {MAJOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </optgroup>
            <optgroup label="Minor">
              {MINOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="toolbar-field">
          Sound:
          <select
            className="toolbar-select"
            value={laneSound ?? ''}
            disabled={laneSound === undefined}
            title={laneSound === undefined ? 'Click a lane name to select a lane' : 'Sound of the selected lane'}
            onChange={(e) => {
              if (isSound(e.target.value)) onSoundChange(e.target.value);
            }}
          >
            {laneSound === undefined && <option value="">–</option>}
            {SOUNDS.map((sound) => (
              <option key={sound} value={sound}>
                {SOUND_LABELS[sound]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={segmentation ? 'toolbar-button toggle on' : 'toolbar-button toggle'}
          aria-pressed={segmentation}
          title={
            segmentation
              ? 'Hide the segment lines above the lanes'
              : 'Show segment lines above the lanes: click there to set a line on a mark of a ruler with a lighter background, click a line to remove it'
          }
          onClick={() => onSegmentationChange(!segmentation)}
        >
          Segmentation
        </button>
      </div>
      <div className="toolbar-row">
        <label className="toolbar-field">
          Project:
          <input
            className={nameInvalid ? 'toolbar-input project-name invalid' : 'toolbar-input project-name'}
            value={projectName}
            spellCheck={false}
            aria-invalid={nameInvalid}
            title="File name for saving; the date and time are added when saving"
            onChange={(e) => onProjectNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
          />
        </label>
        <button
          type="button"
          className="toolbar-button"
          disabled={nameInvalid}
          title="Download the project as <name>.<date_time>.json"
          onClick={onSave}
        >
          Save
        </button>
        <button
          type="button"
          className="toolbar-button"
          title="Open a project file, replacing the current work"
          onClick={() => fileInputRef.current?.click()}
        >
          Open…
        </button>
        <button
          type="button"
          className="toolbar-button"
          title="Download a security copy as dump.<name>.<date_time>.json, then start over with only the main ruler"
          onClick={() => {
            onNew();
            setPending(false);
            changeMode('depeche');
          }}
        >
          New
        </button>
        <button
          type="button"
          className="toolbar-button"
          title="Download the rectangles as MIDI files: <name>.<date_time>.all.mid with every lane, then one file per lane"
          onClick={onMidiExport}
        >
          Midi export
        </button>
        <button
          type="button"
          className="toolbar-button"
          title="Download the rectangles as a LilyPond score, <name>.<date_time>.ly: a staff per lane, bars from the segmentation"
          onClick={onScoreExport}
        >
          Score export
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so that choosing the same file again still triggers a change.
            e.target.value = '';
            if (file) onOpen(file);
          }}
        />
        <p className="hint">m h: keyboard shortcuts · Drag or scroll to move · Hold a rectangle to hear it · Wheel over a rectangle changes its pitch · Ctrl + wheel or pinch to zoom · Ctrl + drag moves a sub-ruler · + derives a sub-ruler</p>
      </div>
    </footer>
  );
}
