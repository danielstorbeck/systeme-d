import { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { chainGrid, chainOf, findChain, mergeChain, pruneChains, type PooledChain, type RulerChain } from './chains';
import { drawBlock, drawLane, drawMainRuler, drawSubRuler } from './drawRuler';
import { emptyState, nextIds, type WorkspaceState } from '../project';
import type { Key } from '../keys';
import { DEFAULT_DRUM_PITCH, stepDrum } from '../drums';
import { DEFAULT_PITCH, noteName } from '../pitch';
import { DEFAULT_TEXT } from '../xsampa';
import type { Chord } from '../chord';
import { blocksUnder, DEFAULT_BPM, marksPerSecond, playbackEnd, resumePosition } from '../playback';
import { Synth, type Sound } from '../sound';
import {
  addLane,
  neighbourBlock,
  centreMostBlock,
  copyBlock,
  cursorSpan,
  isFree,
  spanAfter,
  neighbourMark,
  blockBefore,
  resizeBlock,
  renameLane,
  setBlockPitch,
  setBlockChord,
  setBlockText,
  setLaneKey,
  setLaneSound,
  changeLaneVolume,
  moveLane,
  neighbourLane,
  type Block,
  type BlockContent,
  type CopiedBlock,
  type Direction,
  type Lane,
} from './lanes';
import {
  connectorPath,
  CONTROL_SIZE_PX,
  DELETE_BUTTON_RIGHT_PX,
  GUTTER_PADDING_PX,
  LABEL_WIDTH_PX,
  LANE_HEIGHT_PX,
  layoutLanes,
  layoutRows,
  leftGutterWidth,
  PLUS_BUTTON_RIGHT_PX,
  RIGHT_GUTTER_PX,
  rowAt,
  rulerColor,
  segmentRowAt,
} from './layout';
import { addSegmentLine, formatSegmentLength, removeSegmentLine, segmentLineAt, snapToBinaryMarks } from './segments';
import { RatioLabel } from './RatioLabel';
import { laneAfterRemoval, removeLane, restoreLane, type LaneRemoval, type LaneWork } from './laneRemoval';
import { moveRuler, neighbourRuler, removeRulerTree, restoreRulerTree, rulerAfterRemoval, type RulerRemoval } from './rulerTree';
import type { Command, Mode } from '../modes';
import { moveBorder, placeBorders, resolveBorders, type Borders } from './borders';
import { VolumeLabel } from './VolumeLabel';
import { addSubRuler, isBinaryRuler, MAIN_RULER_ID, orderRulers, removeRuler, selectRuler, setRatio, shiftRuler } from './rulers';
import { useBlockDrawing } from './useBlockDrawing';
import { useBranchDrag } from './useBranchDrag';
import { usePanZoom } from './usePanZoom';
import { FIRST_MARK, fitFirstMarks, INITIAL_VIEW, scrollToMark, toScreen, toWorld, type View } from './viewport';

/** The part of the main ruler that playback runs through, read again every frame; end is undefined if there is nothing to play. */
interface PlaybackRegion {
  start: () => number;
  end: () => number | undefined;
}

export interface RulerWorkspaceHandle {
  /** Scrolls so that this main-ruler mark is at the left end of the visible rulers. */
  goToMark: (mark: number) => void;
  /** Zooms and scrolls so that the main ruler's first `count` marks fill the visible rulers. */
  showFirstMarks: (count: number) => void;
  /** Adds a lane below the existing ones. */
  addLane: () => void;
  /** The current work, including the view, for saving. */
  getState: () => WorkspaceState;
  /** Replaces the current work, e.g. with an opened project. */
  loadState: (state: WorkspaceState) => void;
  /**
   * Prepares a mode that was just set: lane mode selects the top lane, ruler mode the top sub-ruler if none is,
   * border mode shows the borders if they are hidden and a sub-ruler is selected.
   */
  enterMode: (mode: Mode) => void;
  /** Tidies up after a mode: leaving transport mode hides the stopped playhead. */
  leaveMode: (mode: Mode) => void;
  /**
   * Runs a command of lane or ruler mode on the selected lane or sub-ruler: moving the selection, moving it
   * among its neighbours, removing it (which can be undone and redone), or deriving a new sub-ruler; and the
   * commands of the other modes. Returns the id of a block next mode has just put, whose pitch is to be set.
   */
  runCommand: (mode: Mode, command: Command) => number | undefined;
  /** Next mode: the new block's pitch is set (or left as it is), so the green line moves to its right end. */
  finishNext: () => void;
  /** Assigns a key to the selected lane, if there is one. */
  setSelectedLaneKey: (key: Key) => void;
  /** Assigns a sound to the selected lane, if there is one. */
  setSelectedLaneSound: (sound: Sound) => void;
  /** Sets the pitch of the highlighted block, if there is one. */
  setHighlightedPitch: (pitch: number) => void;
  /** Sets the sung text of the highlighted block, if there is one. */
  setHighlightedText: (text: string) => void;
  /** Sets the chord of the highlighted block, if there is one. */
  setHighlightedChord: (chord: Chord) => void;
  /**
   * Starts playback with the cursor at this main-ruler mark; returns false if there is nothing to play there,
   * i.e. no block ends after the mark. Must be called from a click or key press so that the sound is heard.
   */
  play: (fromMark: number) => boolean;
  stop: () => void;
}

interface RulerWorkspaceProps {
  /** Work to start with instead of an empty workspace; read on mount only. */
  initialState?: WorkspaceState;
  /** Called after the rulers, lanes or blocks have changed. Panning and zooming don't count. */
  onChange?: () => void;
  /** Called with the selected lane whenever another lane is selected or the selected lane changes. */
  onSelectedLaneChange?: (lane: Lane | undefined) => void;
  /**
   * Called with the highlighted block and its lane whenever another block is highlighted or the block or
   * its lane (e.g. the lane's key) changes.
   */
  onHighlightedBlockChange?: (block: Block | undefined, lane: Lane | undefined) => void;
  /** Playback speed; may change while playing. */
  bpm?: number;
  /** Called when playback starts, and when it stops, whether by stop() or after the last block. */
  onPlayingChange?: (playing: boolean) => void;
  /** Playback starts again at its start when it reaches its end, also while it is already playing. */
  loop?: boolean;
  /** The current mode; the rectangle keys (arrows, d, r) only work when it is 'depeche'. */
  mode?: Mode;
  /** Shows each lane's segment lines in an upper part, where clicks set and remove them. */
  segmentation?: boolean;
}

/** On first load the view is scaled so that this many marks fill the width. */
const INITIAL_MARK_COUNT = 10;
/** The selected ruler is drawn thicker as well as in the highlight colour. */
const SELECTED_LINE_WIDTH = 2;
/** The borders of border mode. */
const BORDER_LINE_WIDTH = 2;
/** A deleted block, and the pooled chain that left the pool with it if it was the chain's last block. */
interface BlockDeletion {
  block: Block;
  chain?: PooledChain;
}

/** Where next mode's green line is: at the right end of a block, or at x on a lane after an empty space. */
type NextAnchor = { blockId: number } | { laneId: number; x: number };
/**
 * A space or rectangle put in next mode: where the green line was before and after, and what was highlighted
 * before; for a rectangle its id, and once undone the rectangle as it was taken out.
 */
interface NextStep {
  before: NextAnchor;
  after: NextAnchor;
  highlightedBefore: number | null;
  blockId?: number;
  deletion?: BlockDeletion;
}

/** After the wheel stops turning over a block, its note goes on sounding this long. */
const WHEEL_SOUND_HOLD_MS = 400;
/** Next mode's green line is drawn this thick, reaching this far above and below its lane. */
const NEXT_LINE_WIDTH = 2;
const NEXT_LINE_OVERHANG_PX = 3;
/** Next mode reads lengths of at most this many digits. */
const MAX_NEXT_DIGITS = 4;
/** The playback cursor is drawn this thick. */
const CURSOR_LINE_WIDTH = 2;
/** Longer gaps between frames (e.g. while the tab was hidden) only advance the cursor this far. */
const MAX_FRAME_MS = 100;
/** Voice of the block being auditioned; blocks playing back use their ids. */
const AUDITION_VOICE = 'audition';
/** A set segment line counts as under the pointer this many pixels to either side. */
const SEGMENT_HIT_PX = 4;
/** Segment lines leave this much room above and below them in the segment part. */
const SEGMENT_LINE_INSET_PX = 3;
const SEGMENT_LABEL_FONT = '11px system-ui, sans-serif';
/** A segment's length is only shown if it fits between its lines with this much room on either side. */
const SEGMENT_LABEL_PADDING_PX = 3;
/** The volume label spans the width of the delete and plus buttons above it. */
const VOLUME_LABEL_WIDTH_PX = RIGHT_GUTTER_PX - 2 * PLUS_BUTTON_RIGHT_PX;

/**
 * The main ruler and the sub-rulers derived from it, sharing one horizontal pan and zoom.
 * Rulers are drawn on a canvas; labels, plus buttons and connector lines are HTML/SVG on top.
 * The view lives in a ref so panning doesn't re-render React.
 */
export const RulerWorkspace = forwardRef<RulerWorkspaceHandle, RulerWorkspaceProps>(function RulerWorkspace(
  { initialState, onChange, onSelectedLaneChange, onHighlightedBlockChange, bpm = DEFAULT_BPM, onPlayingChange, loop = false, mode = 'depeche', segmentation = false },
  ref,
) {
  // Without saved work, start with only the main ruler.
  const [initial] = useState(() => initialState ?? emptyState());
  const initialIds = useMemo(() => nextIds(initial), [initial]);
  const [rulers, setRulers] = useState(initial.rulers);
  const nextIdRef = useRef(initialIds.node);
  const rows = useMemo(() => layoutRows(orderRulers(rulers)), [rulers]);
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.node.id, row])), [rows]);
  const gutter = leftGutterWidth(rows);
  const [lanes, setLanes] = useState(initial.lanes);
  const lanesCreatedRef = useRef(initial.lanesCreated);
  const laneRows = useMemo(() => layoutLanes(lanes, rows, segmentation), [lanes, rows, segmentation]);
  /** The lane whose label is highlighted; the key field in the toolbar shows and sets its key. */
  const [selectedLaneId, setSelectedLaneId] = useState<number | null>(null);
  const selectedLane = lanes.find((lane) => lane.id === selectedLaneId);
  const selectedLaneIdRef = useRef(selectedLaneId);
  selectedLaneIdRef.current = selectedLaneId;
  const [blocks, setBlocks] = useState(initial.blocks);
  const nextBlockIdRef = useRef(initialIds.block);
  /** At most one block is highlighted; the others are drawn neutral. */
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  // The pool of ruler chains referenced by blocks. Mirrored in a ref so that pointer handlers see it at once.
  const [chains, setChains] = useState(initial.chains);
  const chainsRef = useRef(initial.chains);
  const nextChainIdRef = useRef(initialIds.chain);
  const updateChains = useCallback((next: PooledChain[]) => {
    chainsRef.current = next;
    setChains(next);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>(initialState?.view ?? INITIAL_VIEW);
  /** The borders of border mode, or null while hidden. */
  const bordersRef = useRef<Borders | null>(null);
  /** The borders at the current positions of the marks they sit on, or null while hidden. */
  const currentBorders = (): Borders | null => {
    const borders = bordersRef.current;
    if (!borders) return null;
    bordersRef.current = resolveBorders(borders, layoutRef.current.rows);
    return bordersRef.current;
  };
  const layoutRef = useRef({ rows, gutter, laneRows, blocks, highlightedId });
  /** The chain of the selected ruler, or undefined if none is selected. */
  const selectedChain = () => {
    const nodes = layoutRef.current.rows.map((row) => row.node);
    const selected = nodes.find((node) => node.selected);
    return selected && chainOf(nodes, selected.id);
  };
  // What c copied stays until something else is copied. While the paste cursor is shown, its left edge snaps to
  // the selected ruler's mark nearest x.
  const copiedRef = useRef<CopiedBlock | null>(null);
  const pasteCursorRef = useRef<{ laneId: number; x: number } | null>(null);
  /** Where the paste cursor is, with whether the copy fits there; undefined while it is hidden. */
  const pasteCursorSpan = () => {
    const cursor = pasteCursorRef.current;
    const copied = copiedRef.current;
    const chain = selectedChain();
    if (!cursor || !copied || !chain) return undefined;
    const { laneRows, blocks } = layoutRef.current;
    const laneRow = laneRows.find((row) => row.lane.id === cursor.laneId);
    if (!laneRow) return undefined;
    const span = cursorSpan(chainGrid(chain), cursor.x, copied.intervals);
    return { laneRow, chain, span, free: isFree(blocks, cursor.laneId, span) };
  };
  /**
   * Next mode's green line: at the right end of a block, or at x after an empty space; the digits typed for the
   * length of what comes next; and whether the block just put there is still having its pitch set (the line then
   * waits, and the block is highlighted as usual). Null outside next mode, or without a block to start from.
   */
  const nextRef = useRef<{ anchor: NextAnchor; digits: string; editing: boolean } | null>(null);
  /** Where the green line is; undefined while hidden, e.g. after its block has gone. */
  const nextLine = () => {
    const next = nextRef.current;
    if (!next) return undefined;
    if ('x' in next.anchor) return next.anchor;
    const { blockId } = next.anchor;
    const block = layoutRef.current.blocks.find((b) => b.id === blockId);
    return block && { laneId: block.laneId, x: block.end };
  };
  /** The place the typed length covers after the green line, with whether it is free; undefined without one. */
  const nextCursor = () => {
    const line = nextLine();
    const intervals = Number(nextRef.current?.digits || 0);
    const chain = selectedChain();
    if (!line || !chain || !(intervals > 0) || nextRef.current?.editing) return undefined;
    const { laneRows, blocks } = layoutRef.current;
    const laneRow = laneRows.find((row) => row.lane.id === line.laneId);
    if (!laneRow) return undefined;
    const span = spanAfter(line.x, chainGrid(chain), intervals);
    return { laneRow, chain, span, free: isFree(blocks, line.laneId, span) };
  };
  const sizeRef = useRef({ width: 0, height: 0 });
  const frameRef = useRef(0);
  /** Where the pointer is within the workspace, or null while it is outside. */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * What a click at this position would do in a lane's segment part: remove the set line under it, or set a line
   * on the nearest mark of a binary sub-ruler. Undefined outside the segment parts, or with no line to set.
   */
  const segmentTarget = (x: number, y: number) => {
    const { gutter, laneRows, rows } = layoutRef.current;
    if (x < gutter || x > sizeRef.current.width - RIGHT_GUTTER_PX) return undefined;
    const laneRow = segmentRowAt(laneRows, y);
    if (!laneRow) return undefined;
    const view = viewRef.current;
    const worldX = toWorld(view, x - gutter);
    const existing = segmentLineAt(laneRow.lane, worldX, SEGMENT_HIT_PX / view.scale);
    if (existing !== undefined) return { laneRow, x: existing, existing: true };
    const snapped = snapToBinaryMarks(rows, worldX);
    return snapped === undefined ? undefined : { laneRow, x: snapped, existing: false };
  };
  // A restored view is kept as it was; only a fresh workspace is fitted to the first marks.
  const fittedRef = useRef(initialState !== undefined);
  /** Number of main-ruler marks the next frame zooms to fit (see showFirstMarks), or null. */
  const pendingFitRef = useRef<number | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.();
  }, [rulers, lanes, blocks, chains]);

  const onSelectedLaneChangeRef = useRef(onSelectedLaneChange);
  onSelectedLaneChangeRef.current = onSelectedLaneChange;
  useEffect(() => {
    onSelectedLaneChangeRef.current?.(selectedLane);
  }, [selectedLane]);

  const highlightedBlock = blocks.find((block) => block.id === highlightedId);
  const highlightedLane = highlightedBlock && lanes.find((lane) => lane.id === highlightedBlock.laneId);
  const onHighlightedBlockChangeRef = useRef(onHighlightedBlockChange);
  onHighlightedBlockChangeRef.current = onHighlightedBlockChange;
  useEffect(() => {
    onHighlightedBlockChangeRef.current?.(highlightedBlock, highlightedLane);
  }, [highlightedBlock, highlightedLane]);

  // A block sounds in its lane's sound while the left button holds it down, and while the wheel is rolled over
  // it, until the wheel has been still for WHEEL_SOUND_HOLD_MS.
  const synthRef = useRef<Synth>();
  const auditionRef = useRef<{ blockId: number; pressed: boolean; wheelTimer: number } | null>(null);
  const latestRef = useRef({ blocks, lanes, rulers });
  latestRef.current = { blocks, lanes, rulers };
  const soundBlock = useCallback((blockId: number) => {
    const { blocks, lanes } = latestRef.current;
    const block = blocks.find((b) => b.id === blockId);
    const lane = block && lanes.find((l) => l.id === block.laneId);
    if (!block || !lane) {
      synthRef.current?.stop(AUDITION_VOICE);
      return;
    }
    synthRef.current ??= new Synth();
    // A voice sings the block's text over the time the block takes at the current speed.
    const seconds = (block.end - block.start) / marksPerSecond(bpmRef.current);
    synthRef.current.play(AUDITION_VOICE, { ...block, sound: lane.sound, volume: lane.volume, seconds });
  }, []);
  const stopAudition = useCallback(() => {
    window.clearTimeout(auditionRef.current?.wheelTimer);
    auditionRef.current = null;
    synthRef.current?.stop(AUDITION_VOICE);
  }, []);
  const startAudition = useCallback(
    (blockId: number, how: 'press' | 'wheel') => {
      const current = auditionRef.current;
      window.clearTimeout(current?.wheelTimer);
      const pressed = how === 'press' || (current?.pressed === true && current.blockId === blockId);
      const wheelTimer = how === 'wheel' && !pressed ? window.setTimeout(stopAudition, WHEEL_SOUND_HOLD_MS) : 0;
      auditionRef.current = { blockId, pressed, wheelTimer };
      soundBlock(blockId);
    },
    [soundBlock, stopAudition],
  );
  const endPress = useCallback(() => {
    if (auditionRef.current?.pressed) stopAudition();
  }, [stopAudition]);

  // The sounding note follows changes to its block's pitch and its lane's sound; it stops if the block goes away.
  useEffect(() => {
    if (auditionRef.current) soundBlock(auditionRef.current.blockId);
  }, [blocks, lanes, soundBlock]);

  // While playing, the cursor sits at main-ruler position x and the blocks in `voices` are sounding.
  const playbackRef = useRef<{ x: number; lastTime: number | null; frame: number; voices: Set<number> } | null>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  /** Where transport mode resumes playback after stopping; drawn as a dashed cursor while stopped. */
  const playheadRef = useRef<number | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  useEffect(
    () => () => {
      cancelAnimationFrame(playbackRef.current?.frame ?? 0);
      playbackRef.current = null;
      stopAudition();
      synthRef.current?.close();
      synthRef.current = undefined;
    },
    [stopAudition],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = sizeRef.current;
    const { rows, gutter, laneRows, blocks, highlightedId } = layoutRef.current;
    const rulerWidth = Math.max(0, width - gutter - RIGHT_GUTTER_PX);
    // Fitted here rather than in showFirstMarks, so that the gutter is that of the rulers now shown.
    if (pendingFitRef.current !== null && rulerWidth > 0) {
      viewRef.current = fitFirstMarks(pendingFitRef.current, rulerWidth);
      pendingFitRef.current = null;
      onChangeRef.current?.();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const ink = getComputedStyle(canvas).color;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1;

    // Rulers are drawn between the label margin on the left and the button margin on the right.
    ctx.save();
    ctx.beginPath();
    ctx.rect(gutter, 0, rulerWidth, height);
    ctx.clip();
    ctx.translate(gutter, 0);
    const highlight = getComputedStyle(canvas).getPropertyValue('--selected').trim() || ink;
    // Sub-rulers dividing the main ruler's intervals in halves, quarters, … stand out by a lighter background.
    const binaryFill = getComputedStyle(canvas).getPropertyValue('--binary-ruler-fill').trim();
    if (binaryFill) {
      ctx.fillStyle = binaryFill;
      for (const row of rows) {
        if (isBinaryRuler(row)) ctx.fillRect(0, row.top, rulerWidth, row.bottom - row.top);
      }
      ctx.fillStyle = ink;
    }
    for (const row of rows) {
      if (row.node.parentId === null) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        drawMainRuler(ctx, viewRef.current, rulerWidth, row.baselineY);
        continue;
      }
      ctx.strokeStyle = row.node.selected ? highlight : ink;
      ctx.lineWidth = row.node.selected ? SELECTED_LINE_WIDTH : 1;
      drawSubRuler(ctx, viewRef.current, rulerWidth, { ...row, groupSize: row.node.ratio.m });
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--lane-fill').trim() || 'transparent';
    for (const { top, segmentTop } of laneRows) {
      const laneTop = segmentTop ?? top;
      drawLane(ctx, viewRef.current, rulerWidth, laneTop, top + LANE_HEIGHT_PX - laneTop);
    }

    const style = getComputedStyle(canvas);
    // With segmentation on, a thin line parts each lane's segment lines (above) from its blocks (below). The line
    // a click would set is drawn muted under the pointer; a set line under the pointer, which a click removes, in
    // the highlight colour.
    const pointer = pointerRef.current;
    const target = pointer ? segmentTarget(pointer.x, pointer.y) : undefined;
    const thinColor = style.getPropertyValue('--line').trim() || ink;
    const laneLeft = Math.max(0, Math.round(toScreen(viewRef.current, FIRST_MARK)) + 0.5);
    const lineX = (worldX: number) => Math.round(toScreen(viewRef.current, worldX)) + 0.5;
    for (const { lane, top, segmentTop } of laneRows) {
      if (segmentTop === null) continue;
      ctx.lineWidth = 1;
      ctx.strokeStyle = thinColor;
      ctx.beginPath();
      ctx.moveTo(laneLeft, top + 0.5);
      ctx.lineTo(rulerWidth, top + 0.5);
      ctx.stroke();
      const hovered = target?.laneRow.lane.id === lane.id ? target : undefined;
      const lineTop = segmentTop + SEGMENT_LINE_INSET_PX;
      const lineBottom = top - SEGMENT_LINE_INSET_PX;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      for (const line of lane.segments) {
        const x = lineX(line);
        if (x < -1 || x > rulerWidth + 1 || (hovered?.existing && hovered.x === line)) continue;
        ctx.moveTo(x, lineTop);
        ctx.lineTo(x, lineBottom);
      }
      ctx.stroke();
      // Each segment shows its length in main-ruler intervals, e.g. "3/8"; the first one starts at the lane's left border.
      ctx.save();
      ctx.font = SEGMENT_LABEL_FONT;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bounds = [FIRST_MARK, ...lane.segments];
      for (let i = 1; i < bounds.length; i++) {
        const left = lineX(bounds[i - 1]);
        const right = lineX(bounds[i]);
        if (right <= left || right < 0 || left > rulerWidth) continue;
        const label = formatSegmentLength(bounds[i - 1], bounds[i]);
        if (ctx.measureText(label).width + 2 * SEGMENT_LABEL_PADDING_PX > right - left) continue;
        ctx.fillText(label, (left + right) / 2, segmentTop + LANE_HEIGHT_PX / 2);
      }
      ctx.restore();
      if (hovered) {
        ctx.strokeStyle = hovered.existing ? highlight : style.getPropertyValue('--muted').trim() || ink;
        ctx.lineWidth = hovered.existing ? SELECTED_LINE_WIDTH : 1;
        const x = Math.round(toScreen(viewRef.current, hovered.x)) + (ctx.lineWidth % 2) / 2;
        ctx.beginPath();
        ctx.moveTo(x, lineTop);
        ctx.lineTo(x, lineBottom);
        ctx.stroke();
      }
    }
    const blockFill = style.getPropertyValue('--block-fill').trim() || ink;
    const blockStroke = style.getPropertyValue('--block-stroke').trim() || ink;
    const highlightFill = style.getPropertyValue('--block-highlight-fill').trim() || highlight;
    // In next mode the green line takes the place of the highlight, except while a new block gets its pitch.
    const line = nextLine();
    const hideHighlight = line !== undefined && !nextRef.current?.editing;
    for (const { lane, top } of laneRows) {
      for (const block of blocks) {
        if (block.laneId !== lane.id) continue;
        const highlighted = block.id === highlightedId && !hideHighlight;
        ctx.fillStyle = highlighted ? highlightFill : blockFill;
        ctx.strokeStyle = highlighted ? highlight : blockStroke;
        ctx.lineWidth = highlighted ? SELECTED_LINE_WIDTH : 1;
        drawBlock(ctx, viewRef.current, top, LANE_HEIGHT_PX, block.start, block.end, noteName(block.pitch, lane.sound, lane.key, block.text, block.chord), ink);
      }
    }

    // The paste cursor shades a free place green and a place over blocks red.
    // So does next mode's cursor, showing the length typed after the green line.
    for (const place of [pasteCursorSpan(), nextCursor()]) {
      if (!place) continue;
      ctx.fillStyle = style.getPropertyValue(place.free ? '--paste-free-fill' : '--paste-taken-fill').trim() || 'transparent';
      ctx.strokeStyle = style.getPropertyValue(place.free ? '--border-line' : '--cursor').trim() || ink;
      ctx.lineWidth = SELECTED_LINE_WIDTH;
      drawBlock(ctx, viewRef.current, place.laneRow.top, LANE_HEIGHT_PX, place.span.start, place.span.end, '', ink);
    }
    const lineRow = hideHighlight ? laneRows.find((row) => row.lane.id === line.laneId) : undefined;
    if (lineRow) {
      const x = Math.round(toScreen(viewRef.current, line!.x)) + (NEXT_LINE_WIDTH % 2) / 2;
      ctx.strokeStyle = style.getPropertyValue('--border-line').trim() || 'green';
      ctx.lineWidth = NEXT_LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, lineRow.top - NEXT_LINE_OVERHANG_PX);
      ctx.lineTo(x, lineRow.top + LANE_HEIGHT_PX + NEXT_LINE_OVERHANG_PX);
      ctx.stroke();
    }

    // The borders run across the rulers and the lanes, each on a mark of the ruler it was last moved on.
    const borders = currentBorders();
    if (borders) {
      const { left, right } = borders;
      ctx.strokeStyle = style.getPropertyValue('--border-line').trim() || 'green';
      ctx.lineWidth = BORDER_LINE_WIDTH;
      ctx.beginPath();
      for (const { x: worldX } of [left, right]) {
        const x = Math.round(toScreen(viewRef.current, worldX)) + (BORDER_LINE_WIDTH % 2) / 2;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();
    }

    // The playback cursor runs across the rulers and the lanes; a stopped playhead is dashed.
    const cursorX = playbackRef.current?.x ?? playheadRef.current;
    if (cursorX !== null) {
      const x = Math.round(toScreen(viewRef.current, cursorX)) + (CURSOR_LINE_WIDTH % 2) / 2;
      ctx.strokeStyle = style.getPropertyValue('--cursor').trim() || 'red';
      ctx.lineWidth = CURSOR_LINE_WIDTH;
      if (!playbackRef.current) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }, []);

  // Coalesces all input events of one frame into a single redraw.
  const requestDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  /** Stops the cursor. Drums still ringing are cut short, unless playback stops because the last block has ended. */
  const stopPlayback = useCallback((letRing = false) => {
    const playback = playbackRef.current;
    if (!playback) return;
    cancelAnimationFrame(playback.frame);
    for (const id of playback.voices) synthRef.current?.stop(id);
    if (!letRing) synthRef.current?.silenceDrums();
    playbackRef.current = null;
    requestDraw();
    onPlayingChangeRef.current?.(false);
  }, [requestDraw]);

  /**
   * Moves the cursor from x to the right at the current BPM, sounding every block under it, until the end of
   * the region: by default the end of the last block. With Loop on, it then starts again at the region's
   * start (by default where it started). When the cursor runs off the right edge, the view pages on so that it
   * is at the left. The region is read again every frame, so it follows e.g. moving borders.
   */
  const startPlayback = useCallback(
    (fromMark: number, region?: PlaybackRegion) => {
      stopPlayback();
      const { start, end: regionEnd } = region ?? {
        start: () => fromMark,
        end: () => playbackEnd(latestRef.current.blocks),
      };
      const end = regionEnd();
      if (end === undefined || fromMark >= end) return false;
      playheadRef.current = null;
      // A block played with i in content mode makes way for the playback.
      stopAudition();
      // Waking the audio up now, during the click, lets the notes started from animation frames be heard.
      (synthRef.current ??= new Synth()).resume();

      const rulerWidth = () => sizeRef.current.width - layoutRef.current.gutter - RIGHT_GUTTER_PX;
      const startX = toScreen(viewRef.current, fromMark);
      if (startX < 0 || startX > rulerWidth()) viewRef.current = scrollToMark(viewRef.current, fromMark);

      const playback = { x: fromMark, lastTime: null as number | null, frame: 0, voices: new Set<number>() };
      playbackRef.current = playback;
      const step = (time: number) => {
        if (playbackRef.current !== playback) return;
        const previousX = playback.x;
        if (playback.lastTime !== null) {
          const seconds = Math.min(time - playback.lastTime, MAX_FRAME_MS) / 1000;
          playback.x += seconds * marksPerSecond(bpmRef.current);
        }
        playback.lastTime = time;

        const { blocks, lanes } = latestRef.current;
        const end = regionEnd();
        if (end !== undefined && playback.x >= end && loopRef.current && start() < end) {
          // Every note starts afresh at the start of the loop.
          for (const id of playback.voices) synthRef.current?.stop(id);
          playback.voices = new Set();
          playback.x = start();
          const startX = toScreen(viewRef.current, playback.x);
          if (startX < 0 || startX > rulerWidth()) viewRef.current = scrollToMark(viewRef.current, playback.x);
        } else if (end === undefined || playback.x >= end) {
          stopPlayback(true);
          return;
        }
        const synth = (synthRef.current ??= new Synth());
        const sounding = new Set<number>();
        for (const block of blocksUnder(blocks, playback.x)) {
          const lane = lanes.find((l) => l.id === block.laneId);
          if (!lane) continue;
          sounding.add(block.id);
          const seconds = (block.end - playback.x) / marksPerSecond(bpmRef.current);
          synth.play(block.id, { ...block, sound: lane.sound, volume: lane.volume, seconds });
        }
        for (const id of playback.voices) if (!sounding.has(id)) synth.stop(id);
        playback.voices = sounding;

        // Only crossing the right edge pages on, so the user can still scroll elsewhere while it plays.
        const width = rulerWidth();
        if (toScreen(viewRef.current, previousX) <= width && toScreen(viewRef.current, playback.x) > width) {
          viewRef.current = scrollToMark(viewRef.current, playback.x);
        }
        draw();
        playback.frame = requestAnimationFrame(step);
      };
      playback.frame = requestAnimationFrame(step);
      onPlayingChangeRef.current?.(true);
      return true;
    },
    [draw, stopPlayback, stopAudition],
  );

  useEffect(() => {
    layoutRef.current = { rows, gutter, laneRows, blocks, highlightedId };
    requestDraw();
  }, [rows, gutter, laneRows, blocks, highlightedId, requestDraw]);

  // Lane and ruler removals, block deletions and pastes can be undone and redone, each in their own mode (pastes
  // while the paste cursor is shown, deletions while it is hidden); resizes can be undone while in extension mode.
  // Nothing else is recorded.
  const undoStackRef = useRef<LaneRemoval[]>([]);
  const redoStackRef = useRef<LaneRemoval[]>([]);
  const rulerUndoStackRef = useRef<RulerRemoval[]>([]);
  const rulerRedoStackRef = useRef<RulerRemoval[]>([]);
  /** The edges of each block before each resize of the current visit to extension mode, last one last. */
  const extensionUndoStackRef = useRef<Pick<Block, 'id' | 'start' | 'end'>[]>([]);
  /** Deleted blocks, each with the pooled chain that left the pool with it, if it was the chain's last block. */
  const deletionUndoStackRef = useRef<BlockDeletion[]>([]);
  const deletionRedoStackRef = useRef<BlockDeletion[]>([]);
  /** The ids of pasted blocks; undoing a paste takes the block out again, to be put back by redo. */
  const pasteUndoStackRef = useRef<number[]>([]);
  const pasteRedoStackRef = useRef<BlockDeletion[]>([]);
  /** A sub-ruler derived from the keyboard, whose ratio label takes the focus when it appears. */
  const [focusRatioId, setFocusRatioId] = useState<number | null>(null);
  const currentLaneWork = (): LaneWork => ({
    lanes: latestRef.current.lanes,
    blocks: latestRef.current.blocks,
    chains: chainsRef.current,
  });
  const applyLaneWork = (work: LaneWork) => {
    setLanes(work.lanes);
    setBlocks(work.blocks);
    updateChains(work.chains);
  };
  /** Removes a lane, recording the removal for undo; returns false if there is no such lane. */
  const removeLaneById = (id: number): boolean => {
    const result = removeLane(currentLaneWork(), id);
    if (!result) return false;
    const { work, removal } = result;
    applyLaneWork(work);
    setSelectedLaneId(laneAfterRemoval(work.lanes, removal.index));
    setHighlightedId((highlighted) => (removal.blocks.some((block) => block.id === highlighted) ? null : highlighted));
    undoStackRef.current.push(removal);
    return true;
  };

  const addNewLane = () => {
    const number = ++lanesCreatedRef.current;
    const id = nextIdRef.current++;
    setLanes((current) => addLane(current, id, number));
    setSelectedLaneId(id);
  };

  const laneCommand = (command: Command) => {
    const { lanes } = latestRef.current;
    const id = selectedLaneIdRef.current;
    switch (command.action) {
      case 'create':
        return addNewLane();
      case 'select':
        return setSelectedLaneId(neighbourLane(lanes, id, command.offset));
      case 'move':
        if (id !== null) setLanes((current) => moveLane(current, id, command.offset));
        return;
      case 'remove':
        if (id !== null && removeLaneById(id)) redoStackRef.current = [];
        return;
      case 'undo': {
        const removal = undoStackRef.current.pop();
        if (!removal) return;
        applyLaneWork(restoreLane(currentLaneWork(), removal));
        setSelectedLaneId(removal.lane.id);
        redoStackRef.current.push(removal);
        return;
      }
      case 'redo': {
        const removal = redoStackRef.current.pop();
        if (removal) removeLaneById(removal.lane.id);
        return;
      }
    }
  };

  /** Removes a sub-ruler tree, recording the removal for undo; returns false if there is no such ruler. */
  const removeRulerById = (id: number): boolean => {
    const result = removeRulerTree(latestRef.current.rulers, id);
    if (!result) return false;
    const next = rulerAfterRemoval(result.rulers, result.removal);
    setRulers(next === null ? result.rulers : selectRuler(result.rulers, next));
    rulerUndoStackRef.current.push(result.removal);
    return true;
  };

  /** The selected sub-ruler's marks, or undefined if none is selected. */
  const selectedRulerRow = () => layoutRef.current.rows.find((row) => row.node.selected);

  const borderCommand = (command: Command) => {
    const row = selectedRulerRow();
    const borders = currentBorders();
    if (command.action === 'hide') bordersRef.current = null;
    else if (command.action === 'border' && row && borders) {
      bordersRef.current = moveBorder(borders, row, command.side, command.offset);
    }
    requestDraw();
  };

  /** Where transport mode starts: the left border if the borders are visible, else mark 1 of the main ruler. */
  const transportStart = () => currentBorders()?.left.x ?? FIRST_MARK;
  /** Where transport mode ends: the right border if the borders are visible, else the end of the last block. */
  const transportEnd = () => currentBorders()?.right.x ?? playbackEnd(latestRef.current.blocks);

  const transportCommand = (command: Command) => {
    const playback = playbackRef.current;
    switch (command.action) {
      case 'play': {
        if (playback) return;
        const start = transportStart();
        const end = transportEnd();
        startPlayback(resumePosition(playheadRef.current, start, end), { start: transportStart, end: transportEnd });
        return;
      }
      case 'stop':
        if (!playback) return;
        stopPlayback();
        playheadRef.current = playback.x;
        requestDraw();
        return;
      case 'reset': {
        const start = transportStart();
        if (playback) {
          for (const id of playback.voices) synthRef.current?.stop(id);
          playback.voices = new Set();
          playback.x = start;
        } else {
          playheadRef.current = start;
        }
        const x = toScreen(viewRef.current, start);
        const width = sizeRef.current.width - layoutRef.current.gutter - RIGHT_GUTTER_PX;
        if (x < 0 || x > width) viewRef.current = scrollToMark(viewRef.current, start);
        requestDraw();
        return;
      }
    }
  };

  /** Adds a block drawn with the ruler described by the chain, pooling the chain if it is new; returns its id. */
  const addBlock = (
    laneId: number,
    span: { start: number; end: number },
    chain: RulerChain,
    { pitch, text, chord }: BlockContent,
  ) => {
    const pooled = findChain(chainsRef.current, chain);
    const chainId = pooled?.id ?? nextChainIdRef.current++;
    if (!pooled) updateChains([...chainsRef.current, { id: chainId, chain }]);
    const id = nextBlockIdRef.current++;
    setBlocks((current) => [...current, { id, laneId, ...span, chainId, pitch, text, chord }]);
    return id;
  };

  /** Scrolls world x to the left end of the view, unless it is in view already. */
  const scrollIntoView = (worldX: number) => {
    const x = toScreen(viewRef.current, worldX);
    const width = sizeRef.current.width - layoutRef.current.gutter - RIGHT_GUTTER_PX;
    if (x >= 0 && x <= width) return;
    viewRef.current = scrollToMark(viewRef.current, worldX);
    requestDraw();
  };

  /** Moves the paste cursor a mark of the selected ruler left or right, or to the lane below or above. */
  const movePasteCursor = (direction: Direction) => {
    const cursor = pasteCursorRef.current;
    if (!cursor) return;
    if (direction === 'up' || direction === 'down') {
      const laneId = neighbourLane(latestRef.current.lanes, cursor.laneId, direction === 'down' ? 1 : -1);
      if (laneId !== null) pasteCursorRef.current = { ...cursor, laneId };
    } else {
      const chain = selectedChain();
      const copied = copiedRef.current;
      if (!chain || !copied) return;
      const grid = chainGrid(chain);
      const { start } = cursorSpan(grid, cursor.x, copied.intervals);
      const x = cursorSpan(grid, start + (direction === 'left' ? -grid.interval : grid.interval), copied.intervals).start;
      pasteCursorRef.current = { ...cursor, x };
      scrollIntoView(x);
    }
    requestDraw();
  };

  /**
   * Copies, shows the paste cursor and pastes; undoes or redoes block deletions; or moves the highlight to the
   * neighbouring block, scrolling it into view if it starts outside it. With nothing highlighted, the highlight
   * goes to the block in view nearest the middle of the view instead. While the paste cursor is shown, it moves
   * instead of the highlight.
   */
  const depecheCommand = (command: Command) => {
    if (command.action === 'copy') {
      const { blocks, highlightedId } = layoutRef.current;
      const block = blocks.find((b) => b.id === highlightedId);
      const pooled = block && chainsRef.current.find((entry) => entry.id === block.chainId);
      if (!block || !pooled) return;
      copiedRef.current = copyBlock(block, chainGrid(pooled.chain));
      requestDraw();
      return;
    }
    if (command.action === 'cursor') {
      // The cursor starts on the highlighted block, or on the top lane at the left of the view.
      if (pasteCursorRef.current) {
        pasteCursorRef.current = null;
      } else if (copiedRef.current && selectedChain()) {
        const { blocks, highlightedId, laneRows } = layoutRef.current;
        const block = blocks.find((b) => b.id === highlightedId);
        const laneId = block?.laneId ?? laneRows[0]?.lane.id;
        if (laneId !== undefined) pasteCursorRef.current = { laneId, x: block?.start ?? toWorld(viewRef.current, 0) };
      }
      requestDraw();
      return;
    }
    if (command.action === 'paste') {
      const place = pasteCursorSpan();
      if (!place?.free) return;
      pasteUndoStackRef.current.push(addBlock(place.laneRow.lane.id, place.span, place.chain, copiedRef.current!));
      pasteRedoStackRef.current = [];
      return;
    }
    // While the paste cursor is shown, z and y undo and redo pastes; pasted blocks deleted since are skipped.
    if (command.action === 'undo' && pasteCursorRef.current) {
      let id;
      let removal;
      while ((id = pasteUndoStackRef.current.pop()) !== undefined && !(removal = removeBlock(id)));
      if (removal) pasteRedoStackRef.current.push(removal);
      return;
    }
    if (command.action === 'redo' && pasteCursorRef.current) {
      let removal;
      while ((removal = pasteRedoStackRef.current.pop()) && !canRestore(removal));
      if (!removal) return;
      restoreBlock(removal);
      pasteUndoStackRef.current.push(removal.block.id);
      return;
    }
    if (command.action === 'undo') {
      let deletion;
      while ((deletion = deletionUndoStackRef.current.pop()) && !canRestore(deletion));
      if (!deletion) return;
      restoreBlock(deletion);
      setHighlightedId(deletion.block.id);
      deletionRedoStackRef.current.push(deletion);
      return;
    }
    if (command.action === 'redo') {
      let deletion;
      while ((deletion = deletionRedoStackRef.current.pop()) && !deleteBlock(deletion.block.id));
      return;
    }
    if (command.action !== 'highlight') return;
    if (pasteCursorRef.current) movePasteCursor(command.direction);
    else moveHighlight(command.direction);
  };

  /**
   * Moves the highlight to the neighbouring rectangle in the direction, on the same lane or the next lane with
   * rectangles; with nothing highlighted, highlights the rectangle in view nearest the middle.
   */
  const moveHighlight = (direction: Direction) => {
    const { blocks, laneRows, highlightedId, gutter } = layoutRef.current;
    if (highlightedId === null) {
      const block = centreMostBlock(
        blocks,
        laneRows.map(({ lane, top }) => ({ laneId: lane.id, top, height: LANE_HEIGHT_PX })),
        (x) => toScreen(viewRef.current, x),
        Math.max(0, sizeRef.current.width - gutter - RIGHT_GUTTER_PX),
        sizeRef.current.height,
      );
      if (block) setHighlightedId(block.id);
      return;
    }
    const laneIds = laneRows.map((row) => row.lane.id);
    const next = neighbourBlock(blocks, laneIds, highlightedId, direction);
    if (!next) return;
    setHighlightedId(next.id);
    scrollIntoView(next.start);
  };

  /** Content mode: h, j, k and l move the highlight; the Pitch and Text fields are the toolbar's. */
  const contentCommand = (command: Command) => {
    if (command.action === 'highlight') moveHighlight(command.direction);
    // i sounds the highlighted block until o, like holding it down with the mouse, but only while nothing plays.
    if (command.action === 'listen') {
      const id = layoutRef.current.highlightedId;
      if (id === null || playbackRef.current) return;
      window.clearTimeout(auditionRef.current?.wheelTimer);
      auditionRef.current = { blockId: id, pressed: false, wheelTimer: 0 };
      soundBlock(id);
    }
    if (command.action === 'silence') stopAudition();
  };

  /** Next mode's spaces and rectangles, for z and y; forgotten when next mode is left. */
  const nextUndoStackRef = useRef<NextStep[]>([]);
  const nextRedoStackRef = useRef<NextStep[]>([]);

  /** Scrolls next mode's green line into view after undo or redo moved it. */
  const showNextLine = () => {
    const anchor = nextRef.current?.anchor;
    if (!anchor) return;
    // A block put back by redo isn't in the layout yet, so its end is found among the steps' deletions.
    const x =
      'x' in anchor
        ? anchor.x
        : (layoutRef.current.blocks.find((b) => b.id === anchor.blockId) ??
            nextUndoStackRef.current.find((s) => s.deletion?.block.id === anchor.blockId)?.deletion?.block)?.end;
    if (x !== undefined) scrollIntoView(x);
  };

  /** Starts next mode's green line at the right end of a block, dropping any length typed. */
  const startNext = (blockId: number) => {
    nextRef.current = { anchor: { blockId }, digits: '', editing: false };
    requestDraw();
  };

  /**
   * Next mode: digits type a length in intervals of the selected ruler; r leaves that much empty space after the
   * green line, p puts a block there with the content of the block before it on the lane and returns its id, for the
   * toolbar to go to its Pitch field. The line moves on to the end of either; for a block, once its pitch is set
   * (finishNext). h and l move the line to the selected ruler's previous or next mark, j and k to the lane below or above.
   */
  const nextCommand = (command: Command): number | undefined => {
    const next = nextRef.current;
    if (!next || next.editing) return undefined;
    if (command.action === 'line') {
      const line = nextLine();
      if (!line) return undefined;
      if (command.direction === 'up' || command.direction === 'down') {
        const laneId = neighbourLane(latestRef.current.lanes, line.laneId, command.direction === 'down' ? 1 : -1);
        if (laneId === null || laneId === line.laneId) return undefined;
        next.anchor = { laneId, x: line.x };
      } else {
        const chain = selectedChain();
        const x = chain && neighbourMark(chainGrid(chain), line.x, command.direction === 'left' ? -1 : 1);
        if (x === undefined) return undefined;
        next.anchor = { laneId: line.laneId, x };
        scrollIntoView(x);
      }
    } else if (command.action === 'digit') {
      if (next.digits.length < MAX_NEXT_DIGITS) next.digits = next.digits === '0' ? String(command.digit) : next.digits + command.digit;
    } else if (command.action === 'erase') {
      next.digits = next.digits.slice(0, -1);
    } else if (command.action === 'clear') {
      next.digits = '';
    } else if (command.action === 'space' || command.action === 'rectangle') {
      const place = nextCursor();
      if (!place?.free) return undefined;
      const laneId = place.laneRow.lane.id;
      const { blocks, highlightedId } = layoutRef.current;
      const step: NextStep = { before: next.anchor, after: next.anchor, highlightedBefore: highlightedId };
      next.digits = '';
      if (command.action === 'space') {
        next.anchor = { laneId, x: place.span.end };
      } else {
        const source = blockBefore(blocks, laneId, place.span.start);
        const drums = latestRef.current.lanes.find((lane) => lane.id === laneId)?.sound === 'drums';
        const content = source ?? { pitch: drums ? DEFAULT_DRUM_PITCH : DEFAULT_PITCH, text: DEFAULT_TEXT, chord: [] };
        const id = addBlock(laneId, place.span, place.chain, content);
        next.anchor = { blockId: id };
        next.editing = true;
        step.blockId = id;
        setHighlightedId(id);
      }
      step.after = next.anchor;
      nextUndoStackRef.current.push(step);
      nextRedoStackRef.current = [];
      // What was just put stays in view, from its start on.
      const end = toScreen(viewRef.current, place.span.end);
      if (end < 0 || end > sizeRef.current.width - layoutRef.current.gutter - RIGHT_GUTTER_PX) {
        viewRef.current = scrollToMark(viewRef.current, place.span.start);
      }
      requestDraw();
      return step.blockId;
    } else if (command.action === 'undo') {
      // A rectangle is taken out again, as it is now (e.g. with the pitch it was given), for redo to put back.
      const step = nextUndoStackRef.current.pop();
      if (!step) return undefined;
      if (step.blockId !== undefined) step.deletion = removeBlock(step.blockId);
      next.anchor = step.before;
      next.digits = '';
      if (step.blockId !== undefined) setHighlightedId(step.highlightedBefore);
      nextRedoStackRef.current.push(step);
      showNextLine();
    } else if (command.action === 'redo') {
      // A rectangle comes back only if its lane is still there and its place still free.
      const step = nextRedoStackRef.current.pop();
      if (!step) return undefined;
      if (step.deletion) {
        if (!canRestore(step.deletion)) return undefined;
        restoreBlock(step.deletion);
        setHighlightedId(step.deletion.block.id);
      }
      next.anchor = step.after;
      next.digits = '';
      nextUndoStackRef.current.push(step);
      showNextLine();
    } else {
      return undefined;
    }
    requestDraw();
    return undefined;
  };

  /** Moves an edge of the highlighted block along the marks of the selected sub-ruler. */
  const extensionCommand = (command: Command) => {
    const { blocks, highlightedId } = layoutRef.current;
    if (command.action === 'undo') {
      // Resizes of blocks deleted since then, or whose old edges a newly drawn block now covers, are skipped.
      const fits = ({ id, start, end }: Pick<Block, 'id' | 'start' | 'end'>) => {
        const block = blocks.find((b) => b.id === id);
        return !!block && !blocks.some((b) => b.laneId === block.laneId && b.id !== id && b.start < end && b.end > start);
      };
      const stack = extensionUndoStackRef.current;
      let previous;
      while ((previous = stack.pop()) && !fits(previous));
      if (!previous) return;
      const { id, start, end } = previous;
      setBlocks((current) => current.map((b) => (b.id === id ? { ...b, start, end } : b)));
      return;
    }
    const row = selectedRulerRow();
    if (command.action !== 'resize' || !row || highlightedId === null) return;
    const block = blocks.find((b) => b.id === highlightedId);
    const span = resizeBlock(blocks, highlightedId, row, command.side, command.offset);
    if (!block || !span) return;
    extensionUndoStackRef.current.push({ id: block.id, start: block.start, end: block.end });
    setBlocks((current) => current.map((b) => (b.id === highlightedId ? { ...b, ...span } : b)));
  };

  const rulerCommand = (command: Command) => {
    const { rulers } = latestRef.current;
    const id = rulers.find((node) => node.selected)?.id ?? null;
    switch (command.action) {
      case 'select': {
        const next = neighbourRuler(rulers, id, command.offset);
        if (next !== null) setRulers(selectRuler(rulers, next));
        return;
      }
      case 'move':
        if (id !== null) setRulers(moveRuler(rulers, id, command.offset));
        return;
      case 'remove':
        if (id !== null && removeRulerById(id)) rulerRedoStackRef.current = [];
        return;
      case 'undo': {
        const removal = rulerUndoStackRef.current.pop();
        if (!removal) return;
        setRulers(restoreRulerTree(rulers, removal));
        rulerRedoStackRef.current.push(removal);
        return;
      }
      case 'redo': {
        const removal = rulerRedoStackRef.current.pop();
        if (removal) removeRulerById(removal.nodes[0].id);
        return;
      }
      case 'derive': {
        const child = nextIdRef.current++;
        setRulers(selectRuler(addSubRuler(rulers, id ?? MAIN_RULER_ID, child), child));
        setFocusRatioId(child);
        return;
      }
    }
  };

  /** Takes a block out, returning it for putting back; chains no block refers to any more leave the pool. */
  const removeBlock = useCallback(
    (id: number): BlockDeletion | undefined => {
      const { blocks } = layoutRef.current;
      const block = blocks.find((b) => b.id === id);
      if (!block) return undefined;
      const remaining = blocks.filter((b) => b.id !== id);
      const pool = pruneChains(chainsRef.current, remaining);
      const chain = chainsRef.current.find((entry) => entry.id === block.chainId && !pool.includes(entry));
      setBlocks(remaining);
      updateChains(pool);
      setHighlightedId((highlighted) => (highlighted === id ? null : highlighted));
      return { block, chain };
    },
    [updateChains],
  );

  /** Deletes a block, recording it for undo. */
  const deleteBlock = useCallback(
    (id: number): boolean => {
      const deletion = removeBlock(id);
      if (deletion) deletionUndoStackRef.current.push(deletion);
      return !!deletion;
    },
    [removeBlock],
  );

  /** Whether a block taken out can come back: its lane is still there and no block has taken its place. */
  const canRestore = ({ block }: BlockDeletion) => {
    const { lanes, blocks } = latestRef.current;
    return (
      lanes.some((lane) => lane.id === block.laneId) &&
      !blocks.some((b) => b.id === block.id || (b.laneId === block.laneId && b.start < block.end && b.end > block.start))
    );
  };

  /** Puts a block taken out back, with its chain if that left the pool with it. */
  const restoreBlock = ({ block, chain }: BlockDeletion) => {
    setBlocks((current) => [...current, block]);
    if (chain && !chainsRef.current.some((entry) => entry.id === chain.id)) updateChains([...chainsRef.current, chain]);
  };

  const deleteHighlightedBlock = useCallback(() => {
    const { highlightedId } = layoutRef.current;
    if (highlightedId !== null && deleteBlock(highlightedId)) deletionRedoStackRef.current = [];
  }, [deleteBlock]);

  /** Brings back the ruler the highlighted block was drawn with, reusing whatever part of its chain still exists. */
  const recreateHighlightedRuler = useCallback(() => {
    const { rows, blocks, highlightedId } = layoutRef.current;
    const block = blocks.find((b) => b.id === highlightedId);
    const pooled = block && chainsRef.current.find((entry) => entry.id === block.chainId);
    if (!pooled) return;
    const merged = mergeChain(
      rows.map((row) => row.node),
      pooled.chain,
      () => nextIdRef.current++,
    );
    setRulers(selectRuler(merged.rulers, merged.id));
  }, []);

  // Arrow keys move the highlight between blocks, D deletes the highlighted one and R recreates its ruler,
  // only in depeche mode and the user isn't typing in a text field. Described in the help (modes.ts).
  useEffect(() => {
    const directions: Record<string, Direction> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const { blocks, laneRows, highlightedId } = layoutRef.current;
      if (highlightedId === null || modeRef.current !== 'depeche' || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as Element).closest?.('input, textarea, select')) return;
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        deleteHighlightedBlock();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        recreateHighlightedRuler();
        return;
      }
      const direction = directions[e.key];
      if (!direction) return;
      e.preventDefault();
      const laneIds = laneRows.map((row) => row.lane.id);
      const next = neighbourBlock(blocks, laneIds, highlightedId, direction);
      if (next) setHighlightedId(next.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteHighlightedBlock, recreateHighlightedRuler]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width, height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const rulerWidth = width - layoutRef.current.gutter - RIGHT_GUTTER_PX;
      if (!fittedRef.current && rulerWidth > 0) {
        viewRef.current = fitFirstMarks(INITIAL_MARK_COUNT, rulerWidth);
        fittedRef.current = true;
      }
      draw();
    });
    observer.observe(canvas);

    // Redraw when the colour scheme changes, since the ink colour comes from CSS.
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', requestDraw);

    return () => {
      observer.disconnect();
      scheme.removeEventListener('change', requestDraw);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [draw, requestDraw]);

  const contentLeft = useCallback(() => layoutRef.current.gutter, []);
  // A click in a lane's segment part sets or removes a segment line; a click on a ruler selects it.
  const clickAt = (x: number, y: number) => {
    const target = segmentTarget(x, y);
    if (target) {
      const { laneRow, x: line, existing } = target;
      setLanes((current) => (existing ? removeSegmentLine : addSegmentLine)(current, laneRow.lane.id, line));
      return;
    }
    const row = rowAt(layoutRef.current.rows, y);
    if (row) setRulers((current) => selectRuler(current, row.node.id));
  };
  const clickAtRef = useRef(clickAt);
  clickAtRef.current = clickAt;
  const onClickAt = useCallback((x: number, y: number) => clickAtRef.current(x, y), []);
  usePanZoom(containerRef, viewRef, requestDraw, contentLeft, onClickAt);

  useEffect(() => {
    if (!segmentation) containerRef.current?.classList.remove('segmenting');
  }, [segmentation]);

  // The segment line under the pointer follows it; it goes away when the pointer leaves the segment part.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const wasInSegments = pointerRef.current !== null && segmentRowAt(layoutRef.current.laneRows, pointerRef.current.y);
      pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const inSegments = segmentRowAt(layoutRef.current.laneRows, pointerRef.current.y);
      container.classList.toggle('segmenting', inSegments !== undefined);
      if (wasInSegments || inSegments) requestDraw();
    };
    const onLeave = () => {
      pointerRef.current = null;
      container.classList.remove('segmenting');
      requestDraw();
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
    };
  }, [requestDraw]);

  useBranchDrag(containerRef, {
    rowAt: useCallback((y: number) => rowAt(layoutRef.current.rows, y), []),
    scale: useCallback(() => viewRef.current.scale, []),
    onShift: useCallback((id: number, steps: number) => setRulers((current) => shiftRuler(current, id, steps)), []),
  });

  useBlockDrawing(containerRef, {
    laneAt: (x, y) => {
      const { gutter, laneRows } = layoutRef.current;
      if (x < gutter || x > sizeRef.current.width - RIGHT_GUTTER_PX) return undefined;
      const laneRow = laneRows.find(({ top }) => y >= top && y < top + LANE_HEIGHT_PX);
      return laneRow && { laneId: laneRow.lane.id, worldX: toWorld(viewRef.current, x - gutter) };
    },
    worldX: (x) => toWorld(viewRef.current, x - layoutRef.current.gutter),
    // Blocks follow the marks described by the selected ruler's chain, the same chain they will reference.
    selectedGrid: () => {
      const chain = selectedChain();
      return chain && chainGrid(chain);
    },
    blocks: () => layoutRef.current.blocks,
    onCreate: (laneId, span) => {
      const drums = latestRef.current.lanes.find((lane) => lane.id === laneId)?.sound === 'drums';
      return addBlock(laneId, span, selectedChain()!, {
        pitch: drums ? DEFAULT_DRUM_PITCH : DEFAULT_PITCH,
        text: DEFAULT_TEXT,
        chord: [],
      });
    },
    onResize: (id, span) => setBlocks((current) => current.map((b) => (b.id === id ? { ...b, ...span } : b))),
    onHighlight: (id) => {
      setHighlightedId(id);
      // In next mode the green line follows a click on a block, unless a new block is still getting its pitch.
      if (modeRef.current === 'next' && !nextRef.current?.editing) startNext(id);
    },
    onPressStart: (id) => startAudition(id, 'press'),
    onPressEnd: endPress,
    onWheelOver: (id) => startAudition(id, 'wheel'),
    // In a drum lane the wheel moves through the drums in the order of the Pitch list.
    onPitchStep: (id, steps) =>
      setBlocks((current) => {
        const block = current.find((b) => b.id === id);
        if (!block) return current;
        const drums = latestRef.current.lanes.find((lane) => lane.id === block.laneId)?.sound === 'drums';
        return setBlockPitch(current, id, drums ? stepDrum(block.pitch, steps) : block.pitch + steps);
      }),
  });

  useImperativeHandle(
    ref,
    () => ({
      showFirstMarks: (count) => {
        pendingFitRef.current = count;
        requestDraw();
      },
      goToMark: (mark) => {
        viewRef.current = scrollToMark(viewRef.current, mark);
        requestDraw();
      },
      addLane: addNewLane,
      getState: () => ({
        rulers: layoutRef.current.rows.map((row) => row.node),
        lanes: layoutRef.current.laneRows.map((row) => row.lane),
        lanesCreated: lanesCreatedRef.current,
        blocks: layoutRef.current.blocks,
        chains: chainsRef.current,
        view: viewRef.current,
      }),
      loadState: (state) => {
        stopPlayback();
        const ids = nextIds(state);
        nextIdRef.current = ids.node;
        nextBlockIdRef.current = ids.block;
        nextChainIdRef.current = ids.chain;
        lanesCreatedRef.current = state.lanesCreated;
        setRulers(state.rulers);
        setLanes(state.lanes);
        setBlocks(state.blocks);
        updateChains(state.chains);
        setHighlightedId(null);
        setSelectedLaneId(null);
        undoStackRef.current = [];
        redoStackRef.current = [];
        rulerUndoStackRef.current = [];
        rulerRedoStackRef.current = [];
        setFocusRatioId(null);
        bordersRef.current = null;
        playheadRef.current = null;
        extensionUndoStackRef.current = [];
        deletionUndoStackRef.current = [];
        deletionRedoStackRef.current = [];
        pasteUndoStackRef.current = [];
        pasteRedoStackRef.current = [];
        pasteCursorRef.current = null;
        nextRef.current = null;
        nextUndoStackRef.current = [];
        nextRedoStackRef.current = [];
        viewRef.current = state.view;
        requestDraw();
      },
      setHighlightedPitch: (pitch) => {
        const id = layoutRef.current.highlightedId;
        if (id !== null) setBlocks((current) => setBlockPitch(current, id, pitch));
      },
      setHighlightedText: (text) => {
        const id = layoutRef.current.highlightedId;
        if (id !== null) setBlocks((current) => setBlockText(current, id, text));
      },
      setHighlightedChord: (chord) => {
        const id = layoutRef.current.highlightedId;
        if (id !== null) setBlocks((current) => setBlockChord(current, id, chord));
      },
      setSelectedLaneSound: (sound) => {
        const id = selectedLaneIdRef.current;
        if (id !== null) setLanes((current) => setLaneSound(current, id, sound));
      },
      leaveMode: (mode) => {
        if (mode === 'extension') extensionUndoStackRef.current = [];
        if (mode === 'content') stopAudition();
        if (mode === 'depeche' && pasteCursorRef.current) {
          pasteCursorRef.current = null;
          requestDraw();
        }
        if (mode === 'transport' && playheadRef.current !== null) {
          playheadRef.current = null;
          requestDraw();
        }
        if (mode === 'next') {
          nextRef.current = null;
          nextUndoStackRef.current = [];
          nextRedoStackRef.current = [];
          requestDraw();
        }
      },
      finishNext: () => {
        const next = nextRef.current;
        if (!next?.editing) return;
        next.editing = false;
        requestDraw();
      },
      enterMode: (mode) => {
        const { lanes, rulers } = latestRef.current;
        if (mode === 'lane') setSelectedLaneId(lanes[0]?.id ?? null);
        if (mode === 'ruler' && !rulers.some((node) => node.selected)) {
          const top = neighbourRuler(rulers, null, 0);
          if (top !== null) setRulers(selectRuler(rulers, top));
        }
        const row = selectedRulerRow();
        if (mode === 'border' && !bordersRef.current && row) {
          const width = Math.max(0, sizeRef.current.width - layoutRef.current.gutter - RIGHT_GUTTER_PX);
          bordersRef.current = placeBorders(row, viewRef.current, width);
          requestDraw();
        }
        const { highlightedId } = layoutRef.current;
        if (mode === 'next' && highlightedId !== null) startNext(highlightedId);
      },
      runCommand: (mode, command) => {
        if (mode === 'next') return nextCommand(command);
        if (mode === 'depeche') depecheCommand(command);
        if (mode === 'content') contentCommand(command);
        if (mode === 'extension') extensionCommand(command);
        if (mode === 'lane') laneCommand(command);
        if (mode === 'ruler') rulerCommand(command);
        if (mode === 'border') borderCommand(command);
        if (mode === 'transport') transportCommand(command);
        return undefined;
      },
      setSelectedLaneKey: (key) => {
        const id = selectedLaneIdRef.current;
        if (id !== null) setLanes((current) => setLaneKey(current, id, key));
      },
      play: startPlayback,
      stop: () => stopPlayback(),
    }),
    [requestDraw, updateChains, startPlayback, stopPlayback],
  );

  const deriveRuler = (parentId: number) => {
    const id = nextIdRef.current++;
    setRulers((current) => addSubRuler(current, parentId, id));
  };

  return (
    <div ref={containerRef} className="workspace">
      <canvas ref={canvasRef} className="ruler-canvas" />
      <svg className="connectors" width={gutter} aria-hidden="true">
        {rows.map((row) => {
          const parent = row.node.parentId === null ? undefined : rowsById.get(row.node.parentId);
          return (
            parent && (
              <path key={row.node.id} d={connectorPath(parent, row)} style={{ stroke: rulerColor(parent.node.id) }} />
            )
          );
        })}
      </svg>
      {rows.map((row) => (
        <Fragment key={row.node.id}>
          <RatioLabel
            ratio={row.node.ratio}
            editable={row.node.parentId !== null}
            autoFocus={row.node.id === focusRatioId}
            onChange={(ratio) => setRulers((current) => setRatio(current, row.node.id, ratio))}
            style={{
              left: row.labelLeft,
              top: row.controlTop,
              width: LABEL_WIDTH_PX,
              height: CONTROL_SIZE_PX,
              borderLeftColor: rulerColor(row.node.id),
            }}
          />
          {row.node.parentId !== null && (
            <button
              type="button"
              className="ruler-button"
              style={{ top: row.controlTop, right: DELETE_BUTTON_RIGHT_PX, width: CONTROL_SIZE_PX, height: CONTROL_SIZE_PX }}
              title="Delete this sub-ruler and the rulers derived from it"
              aria-label="Delete sub-ruler"
              onClick={() => setRulers((current) => removeRuler(current, row.node.id))}
            >
              <TrashIcon />
            </button>
          )}
          <button
            type="button"
            className="ruler-button"
            style={{ top: row.controlTop, right: PLUS_BUTTON_RIGHT_PX, width: CONTROL_SIZE_PX, height: CONTROL_SIZE_PX }}
            title="Derive a sub-ruler"
            aria-label="Derive a sub-ruler"
            onClick={() => deriveRuler(row.node.id)}
          >
            +
          </button>
        </Fragment>
      ))}
      {laneRows.map(({ lane, top }) => (
        <input
          key={lane.id}
          className={lane.id === selectedLaneId ? 'lane-label selected' : 'lane-label'}
          style={{ left: GUTTER_PADDING_PX, top, width: gutter - 2 * GUTTER_PADDING_PX, height: LANE_HEIGHT_PX }}
          value={lane.name}
          spellCheck={false}
          aria-label="Lane name"
          aria-current={lane.id === selectedLaneId}
          title={`${lane.name} · key ${lane.key}`}
          onFocus={() => setSelectedLaneId(lane.id)}
          onChange={(e) => setLanes((current) => renameLane(current, lane.id, e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      ))}
      {laneRows.map(({ lane, top }) => (
        <VolumeLabel
          key={lane.id}
          volume={lane.volume}
          laneName={lane.name}
          onStep={(percent) => setLanes((current) => changeLaneVolume(current, lane.id, percent))}
          style={{ right: PLUS_BUTTON_RIGHT_PX, top, width: VOLUME_LABEL_WIDTH_PX, height: LANE_HEIGHT_PX }}
        />
      ))}
    </div>
  );
});

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M1.5 3h9M4.5 3V1.5h3V3M2.5 3l.6 7.5h5.8L9.5 3M5 5v4M7 5v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
