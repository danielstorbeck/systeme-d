import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chord } from './chord';
import type { Key } from './keys';
import { exportMidi } from './midi';
import { DEFAULT_BPM } from './playback';
import { exportScore } from './score';
import type { Sound } from './sound';
import {
  cleanProjectName,
  DEFAULT_PROJECT_NAME,
  dumpFileName,
  emptyState,
  loadAutosave,
  midiFileNames,
  NEW_PROJECT_NAME,
  parseProject,
  projectFileName,
  projectNameFromFileName,
  saveAutosave,
  scoreFileName,
  serializeProject,
  toDocument,
  type ProjectDocument,
} from './project';
import { RulerWorkspace, type RulerWorkspaceHandle } from './ruler/RulerWorkspace';
import { Toolbar } from './Toolbar';
import { DEFAULT_MODE, type Mode } from './modes';

/** Changes are written to localStorage this long after the last one. */
const AUTOSAVE_DELAY_MS = 500;
/** "New" zooms so that this many main-ruler marks, from mark 1 on, are visible. */
const NEW_PROJECT_MARK_COUNT = 7;

/** Lets the browser download the project as a JSON file with the given name. */
function download(fileName: string, doc: ProjectDocument): void {
  downloadBlob(fileName, new Blob([serializeProject(doc)], { type: 'application/json' }));
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Some browsers start reading the file only after the click has returned.
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

const REVOKE_DELAY_MS = 10_000;
/** Browsers may drop downloads that start at the same moment, so the MIDI files follow each other at this pace. */
const DOWNLOAD_SPACING_MS = 250;

export function App() {
  const workspaceRef = useRef<RulerWorkspaceHandle>(null);
  const [restored] = useState(loadAutosave);
  const [projectName, setProjectName] = useState(restored?.name ?? DEFAULT_PROJECT_NAME);
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;
  const [bpm, setBpm] = useState(restored?.bpm ?? DEFAULT_BPM);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [segmentation, setSegmentation] = useState(false);
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [laneKey, setLaneKey] = useState<Key | undefined>();
  const [laneSound, setLaneSound] = useState<Sound | undefined>();
  const [pitch, setPitch] = useState<number | undefined>();
  /** Id of the highlighted block. */
  const [blockId, setBlockId] = useState<number | undefined>();
  /** Key of the highlighted block's lane, which spells the pitch names. */
  const [pitchKey, setPitchKey] = useState<Key | undefined>();
  /** Sound of the highlighted block's lane; with drums the pitches are drums. */
  const [pitchSound, setPitchSound] = useState<Sound | undefined>();
  /** Sung text of the highlighted block. */
  const [text, setText] = useState<string | undefined>();
  /** Chord of the highlighted block. */
  const [chord, setChord] = useState<Chord | undefined>();

  const autosaveNow = useCallback(() => {
    const workspace = workspaceRef.current;
    if (workspace) saveAutosave(toDocument(projectNameRef.current, workspace.getState(), bpmRef.current));
  }, []);

  // Changes are saved shortly after they happen; the view (pan and zoom) is saved along with them
  // and whenever the page is hidden or closed.
  const timerRef = useRef(0);
  const scheduleAutosave = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(autosaveNow, AUTOSAVE_DELAY_MS);
  }, [autosaveNow]);

  useEffect(scheduleAutosave, [projectName, bpm, scheduleAutosave]);

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timerRef.current);
      autosaveNow();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [autosaveNow]);

  const save = () => {
    const workspace = workspaceRef.current;
    const name = cleanProjectName(projectName);
    if (!workspace || name === null) return;
    download(projectFileName(name, new Date()), toDocument(name, workspace.getState(), bpm));
  };

  /** Downloads the blocks as MIDI files: one with all lanes, then one per lane (see exportMidi). */
  const exportMidiFiles = () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const { lanes, blocks } = workspace.getState();
    const name = cleanProjectName(projectName) ?? NEW_PROJECT_NAME;
    const files = exportMidi(name, lanes, blocks, bpm);
    if (files.length === 0) {
      window.alert('There is nothing to export: no lane has any rectangles.');
      return;
    }
    const fileNames = midiFileNames(name, files.map((file) => file.label), new Date());
    files.forEach((file, i) => {
      const blob = new Blob([file.bytes], { type: 'audio/midi' });
      window.setTimeout(() => downloadBlob(fileNames[i], blob), i * DOWNLOAD_SPACING_MS);
    });
  };

  /** Downloads the blocks as a LilyPond score, named like the project file but ending in .ly (see exportScore). */
  const exportScoreFile = () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const { lanes, blocks } = workspace.getState();
    const name = cleanProjectName(projectName) ?? NEW_PROJECT_NAME;
    const score = exportScore(name, lanes, blocks, bpm);
    if (score === undefined) {
      window.alert('There is nothing to export: no lane has any rectangles.');
      return;
    }
    downloadBlob(scoreFileName(name, new Date()), new Blob([score], { type: 'text/x-lilypond;charset=utf-8' }));
  };

  /**
   * Starts over: first downloads a security copy of the current work as dump.<name>.<date_time>.json (always, even
   * right after saving), then keeps only the main ruler, zoomed so that marks 1 to 7 fill the width, with looping and segmentation off, the default speed and
   * the name "unnamed". The tool bar sets depeche mode.
   */
  const startNew = () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const state = workspace.getState();
    const name = cleanProjectName(projectName) ?? NEW_PROJECT_NAME;
    download(dumpFileName(name, new Date()), toDocument(name, state, bpm));
    workspace.loadState(emptyState(state.view));
    workspace.showFirstMarks(NEW_PROJECT_MARK_COUNT);
    setLoop(false);
    setSegmentation(false);
    setBpm(DEFAULT_BPM);
    setProjectName(NEW_PROJECT_NAME);
  };

  const open = async (file: File) => {
    let doc;
    try {
      doc = parseProject(await file.text());
    } catch (error) {
      window.alert(`Could not open "${file.name}".\n\n${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!window.confirm(`Open "${file.name}"? This replaces the current work.`)) return;
    workspaceRef.current?.loadState(doc);
    setProjectName(projectNameFromFileName(file.name) || doc.name);
    setBpm(doc.bpm);
  };

  return (
    <main className="app">
      <RulerWorkspace
        ref={workspaceRef}
        initialState={restored}
        onChange={scheduleAutosave}
        bpm={bpm}
        loop={loop}
        mode={mode}
        segmentation={segmentation}
        onPlayingChange={setPlaying}
        onSelectedLaneChange={(lane) => {
          setLaneKey(lane?.key);
          setLaneSound(lane?.sound);
        }}
        onHighlightedBlockChange={(block, lane) => {
          setBlockId(block?.id);
          setPitch(block?.pitch);
          setText(block?.text);
          setChord(block?.chord);
          setPitchKey(lane?.key);
          setPitchSound(lane?.sound);
        }}
      />
      <Toolbar
        onGoToMark={(mark) => workspaceRef.current?.goToMark(mark)}
        playing={playing}
        onPlay={(mark) => workspaceRef.current?.play(mark)}
        onStop={() => workspaceRef.current?.stop()}
        loop={loop}
        onLoopChange={setLoop}
        bpm={bpm}
        onBpmChange={setBpm}
        onNewLane={() => workspaceRef.current?.addLane()}
        segmentation={segmentation}
        onSegmentationChange={setSegmentation}
        onModeChange={setMode}
        onModeEnter={(mode) => workspaceRef.current?.enterMode(mode)}
        onModeLeave={(mode) => workspaceRef.current?.leaveMode(mode)}
        onCommand={(mode, command) => workspaceRef.current?.runCommand(mode, command)}
        onPitchDone={() => workspaceRef.current?.finishNext()}
        blockId={blockId}
        laneKey={laneKey}
        laneSound={laneSound}
        onSoundChange={(sound) => workspaceRef.current?.setSelectedLaneSound(sound)}
        onKeyChange={(key) => workspaceRef.current?.setSelectedLaneKey(key)}
        pitch={pitch}
        pitchKey={pitchKey}
        pitchSound={pitchSound}
        onPitchChange={(p) => workspaceRef.current?.setHighlightedPitch(p)}
        text={text}
        onTextChange={(t) => workspaceRef.current?.setHighlightedText(t)}
        chord={chord}
        onChordChange={(c) => workspaceRef.current?.setHighlightedChord(c)}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onSave={save}
        onOpen={open}
        onNew={startNew}
        onMidiExport={exportMidiFiles}
        onScoreExport={exportScoreFile}
      />
    </main>
  );
}
