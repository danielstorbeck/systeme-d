import { useEffect, useRef, type RefObject } from 'react';
import { blockAt, blockSpan, freeIntervals, intervalIndex, type Block, type Grid } from './lanes';

interface BlockDrawingOptions {
  /** The lane at a position within the target, with the world x at that position. */
  laneAt: (x: number, y: number) => { laneId: number; worldX: number } | undefined;
  /** World x at a horizontal position within the target. */
  worldX: (x: number) => number;
  /** Marks of the selected sub-ruler; blocks can only be drawn while one is selected. */
  selectedGrid: () => Grid | undefined;
  blocks: () => Block[];
  onCreate: (laneId: number, span: { start: number; end: number }) => number;
  onResize: (id: number, span: { start: number; end: number }) => void;
  /** Called when an existing block is left-clicked or the wheel is rolled over it. */
  onHighlight: (id: number) => void;
  /** Rolling the wheel over a block changes its pitch by this many semitones (positive = up). */
  onPitchStep: (id: number, semitones: number) => void;
  /** The left button went down on a block, and up again (or the press was cancelled). */
  onPressStart: (id: number) => void;
  onPressEnd: () => void;
  /** The wheel is being rolled over a block. */
  onWheelOver: (id: number) => void;
}

/** Wheel distance in px for one semitone; one notch of a mouse wheel is usually 100 px. */
const WHEEL_PX_PER_SEMITONE = 100;
/** Wheel distance of one line, for browsers that report the wheel in lines. */
const WHEEL_LINE_PX = 100 / 3;

/**
 * Left press in a lane creates a block over the interval of the selected ruler above the pointer;
 * dragging extends it interval by interval. Left click on a block highlights it.
 * Rolling the wheel over a block highlights it and moves its pitch up or down.
 */
export function useBlockDrawing(targetRef: RefObject<HTMLElement>, options: BlockDrawingOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let drawing: {
      pointerId: number;
      blockId: number;
      grid: Grid;
      anchor: number;
      free: { min: number; max: number };
    } | null = null;
    /** The pointer holding down a block, which sounds until it is released. */
    let pressing: number | null = null;

    const localPosition = (e: MouseEvent) => {
      const rect = target.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // Registered in the capture phase so that a press in a lane doesn't also start panning.
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.ctrlKey || (e.target as Element).closest('input, button')) return;
      const { laneAt, selectedGrid, blocks, onCreate, onHighlight, onPressStart } = optionsRef.current;
      const { x, y } = localPosition(e);
      const hit = laneAt(x, y);
      if (!hit) return;
      // A press on an existing block highlights it and lets it sound until the button is released.
      const existing = blockAt(blocks(), hit.laneId, hit.worldX);
      if (existing) {
        e.stopPropagation();
        onHighlight(existing.id);
        onPressStart(existing.id);
        pressing = e.pointerId;
        target.setPointerCapture(e.pointerId);
        return;
      }
      const grid = selectedGrid();
      if (!grid) return;
      const anchor = intervalIndex(grid, hit.worldX);
      const free = freeIntervals(grid, blocks().filter((b) => b.laneId === hit.laneId), anchor);
      if (!free) return;

      e.stopPropagation();
      const blockId = onCreate(hit.laneId, blockSpan(grid, anchor, anchor, free));
      drawing = { pointerId: e.pointerId, blockId, grid, anchor, free };
      target.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawing || e.pointerId !== drawing.pointerId) return;
      const { worldX, onResize } = optionsRef.current;
      const current = intervalIndex(drawing.grid, worldX(localPosition(e).x));
      onResize(drawing.blockId, blockSpan(drawing.grid, drawing.anchor, current, drawing.free));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (drawing && e.pointerId === drawing.pointerId) drawing = null;
      if (e.pointerId === pressing) {
        pressing = null;
        optionsRef.current.onPressEnd();
      }
    };

    // Wheel distance not yet turned into a semitone, so that trackpads' small steps add up.
    let wheel = { blockId: -1, px: 0 };

    // Also in the capture phase, so that the wheel over a block doesn't also scroll the rulers.
    // Ctrl + wheel still zooms, and mostly horizontal trackpad scrolling still scrolls.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const { laneAt, blocks, onHighlight, onPitchStep, onWheelOver } = optionsRef.current;
      const { x, y } = localPosition(e);
      const hit = laneAt(x, y);
      const block = hit && blockAt(blocks(), hit.laneId, hit.worldX);
      if (!block) return;

      e.preventDefault();
      e.stopPropagation();
      onHighlight(block.id);
      onWheelOver(block.id);
      if (wheel.blockId !== block.id) wheel = { blockId: block.id, px: 0 };
      // Rolling away from the user (negative deltaY) raises the pitch.
      wheel.px -= e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX : 1);
      const semitones = Math.trunc(wheel.px / WHEEL_PX_PER_SEMITONE);
      if (semitones === 0) return;
      wheel.px -= semitones * WHEEL_PX_PER_SEMITONE;
      onPitchStep(block.id, semitones);
    };

    target.addEventListener('wheel', onWheel, { capture: true, passive: false });
    target.addEventListener('pointerdown', onPointerDown, { capture: true });
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
    return () => {
      target.removeEventListener('wheel', onWheel, { capture: true });
      target.removeEventListener('pointerdown', onPointerDown, { capture: true });
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
    };
  }, [targetRef]);
}
