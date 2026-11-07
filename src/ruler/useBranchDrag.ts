import { useEffect, type RefObject } from 'react';
import type { Row } from './layout';

interface BranchDragOptions {
  /** The ruler row at a y position within the target, if any. */
  rowAt: (y: number) => Row | undefined;
  /** Current zoom in pixels per world unit. */
  scale: () => number;
  /** Moves the sub-ruler (and its branch) by whole offset steps against its parent. */
  onShift: (id: number, steps: number) => void;
}

/**
 * Ctrl + drag on a sub-ruler moves it, together with everything derived from it, against its parent.
 * The movement snaps to positions where its marks line up with marks of the parent.
 */
export function useBranchDrag(targetRef: RefObject<HTMLElement>, options: BranchDragOptions): void {
  const { rowAt, scale, onShift } = options;

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let drag: { pointerId: number; id: number; startX: number; stepWorld: number; applied: number } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.ctrlKey || (e.target as Element).closest('input, button')) return;
      const row = rowAt(e.clientY - target.getBoundingClientRect().top);
      if (!row || row.node.parentId === null) return;
      e.preventDefault();
      drag = { pointerId: e.pointerId, id: row.node.id, startX: e.clientX, stepWorld: row.offsetStep, applied: 0 };
      target.setPointerCapture(e.pointerId);
      target.classList.add('moving-branch');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const steps = Math.round((e.clientX - drag.startX) / scale() / drag.stepWorld);
      if (steps === drag.applied) return;
      onShift(drag.id, steps - drag.applied);
      drag.applied = steps;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      target.classList.remove('moving-branch');
    };

    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
    return () => {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
    };
  }, [targetRef, rowAt, scale, onShift]);
}
