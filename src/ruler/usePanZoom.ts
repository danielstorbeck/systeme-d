import { useEffect, type MutableRefObject, type RefObject } from 'react';
import { panBy, zoomAt, type View } from './viewport';

/** Zoom factor per pixel of wheel delta. */
const ZOOM_SPEED = 0.0015;
const LINE_HEIGHT_PX = 16;
/** A press and release that moves less than this counts as a click rather than a drag. */
const CLICK_TOLERANCE_PX = 4;

/**
 * Wires dragging, wheel scrolling and ctrl-wheel / pinch zooming on the target element to the view.
 * contentLeft returns where the ruler area starts within the target, so zooming stays anchored at the cursor.
 * onClick receives the position within the target of a left click that didn't turn into a drag.
 */
export function usePanZoom(
  targetRef: RefObject<HTMLElement>,
  viewRef: MutableRefObject<View>,
  requestDraw: () => void,
  contentLeft: () => number,
  onClick: (x: number, y: number) => void,
): void {
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let dragPointer: number | null = null;
    let lastX = 0;
    let startX = 0;
    let startY = 0;
    let isClick = false;

    const update = (view: View) => {
      viewRef.current = view;
      requestDraw();
    };

    const onPointerDown = (e: PointerEvent) => {
      // Labels and buttons keep their own clicks; ctrl + drag moves a sub-ruler instead (useBranchDrag).
      if (e.button !== 0 || e.ctrlKey || (e.target as Element).closest('input, button')) return;
      dragPointer = e.pointerId;
      lastX = startX = e.clientX;
      startY = e.clientY;
      isClick = true;
      target.setPointerCapture(e.pointerId);
      target.classList.add('dragging');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== dragPointer) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > CLICK_TOLERANCE_PX) isClick = false;
      update(panBy(viewRef.current, e.clientX - lastX));
      lastX = e.clientX;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== dragPointer) return;
      dragPointer = null;
      target.classList.remove('dragging');
      if (isClick && e.type === 'pointerup') {
        const rect = target.getBoundingClientRect();
        onClick(e.clientX - rect.left, e.clientY - rect.top);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT_PX : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        // Ctrl + wheel, and trackpad pinch (which browsers report as ctrl + wheel).
        const x = e.clientX - target.getBoundingClientRect().left - contentLeft();
        update(zoomAt(viewRef.current, x, Math.exp(-dy * ZOOM_SPEED)));
      } else {
        // Vertical wheel scrolls the ruler horizontally; trackpads may send deltaX directly.
        update(panBy(viewRef.current, -(Math.abs(dx) > Math.abs(dy) ? dx : dy)));
      }
    };

    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      target.removeEventListener('wheel', onWheel);
    };
  }, [targetRef, viewRef, requestDraw, contentLeft, onClick]);
}
