import { useEffect, useRef, type CSSProperties } from 'react';

/** One notch of a mouse wheel (about 100 px) changes the volume by 5 percentage points; trackpads go finer. */
const WHEEL_PX_PER_PERCENT = 20;
const WHEEL_LINE_PX = 100 / 3;

interface VolumeLabelProps {
  volume: number;
  laneName: string;
  /** Called with the number of percentage points to add, positive for louder. */
  onStep: (percent: number) => void;
  style: CSSProperties;
}

/** Shows a lane's volume in percent; rolling the wheel over it, away from you, turns it up. */
export function VolumeLabel({ volume, laneName, onStep, style }: VolumeLabelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let px = 0;
    // A native listener, because React's wheel listeners are passive and can't keep the rulers from scrolling.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      px -= delta * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX : 1);
      const percent = Math.trunc(px / WHEEL_PX_PER_PERCENT);
      if (percent === 0) return;
      px -= percent * WHEEL_PX_PER_PERCENT;
      onStepRef.current(percent);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className="lane-volume"
      style={style}
      role="meter"
      aria-label={`Volume of ${laneName}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={volume}
      title={`Volume of ${laneName}; roll the mouse wheel to change it`}
    >
      {volume}%
    </div>
  );
}
