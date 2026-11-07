import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chord } from './chord';
import type { Key } from './keys';
import { DEFAULT_BPM } from './playback';
import type { Sound } from './sound';
import {
  cleanProjectName,
  DEFAULT_PROJECT_NAME,
  loadAutosave,
  parseProject,
  projectFileName,
  projectNameFromFileName,
  saveAutosave,
  serializeProject,
  toDocument,
} from './project';
import { RulerWorkspace, type RulerWorkspaceHandle } from './ruler/RulerWorkspace';
import { Toolbar } from './Toolbar';
import { DEFAULT_MODE, type Mode } from './modes';

/** Changes are written to localStorage this long after the last one. */
const AUTOSAVE_DELAY_MS = 500;

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
    const doc = toDocument(name, workspace.getState(), bpm);
    const url = URL.createObjectURL(new Blob([serializeProject(doc)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = projectFileName(name, new Date());
    link.click();
    URL.revokeObjectURL(url);
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
      />
    </main>
  );
}
