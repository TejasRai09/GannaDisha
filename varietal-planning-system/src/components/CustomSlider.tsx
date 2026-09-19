import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

interface CustomSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  unitPosition?: 'suffix' | 'prefix';
  onChange: (val: number) => void;
  onReset?: () => void;
  disabled?: boolean;
  helpText?: string;
  source?: string;
  /** Rendered inline beside the label. */
  info?: React.ReactNode;
  id?: string;
}

export const CustomSlider: React.FC<CustomSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit = '',
  unitPosition = 'suffix',
  onChange,
  onReset,
  disabled = false,
  helpText,
  source,
  info,
  id,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // A pointer emits moves faster than the screen redraws - often 120 a second.
  // Each one used to call onChange, and every onChange rebuilds the parameters
  // object, which re-runs the projection, the seed balances and the compliance
  // checks. Dragging a slider therefore queued far more work than the browser
  // could finish, and the tab locked up. Now at most one update per frame: the
  // latest position is remembered and applied when the browser is ready to
  // paint, so the slider still tracks the cursor without the backlog.
  const pendingX = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // Clamp value
  const clampedVal = Math.max(min, Math.min(max, value));
  const pct = max > min ? ((clampedVal - min) / (max - min)) * 100 : 0;
  const isModified = defaultValue !== undefined && Math.abs(clampedVal - defaultValue) > 0.0001;

  // Handle pointer down on track
  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || !trackRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || disabled || !trackRef.current) return;
    pendingX.current = e.clientX;
    if (frame.current !== null) return; // a frame is already queued
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pendingX.current !== null) updateFromPointer(pendingX.current);
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      // Apply wherever the pointer finished, in case a frame was still queued.
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      if (pendingX.current !== null) {
        updateFromPointer(pendingX.current);
        pendingX.current = null;
      }
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
    }
  };

  const updateFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawVal = min + ratio * (max - min);
    // Snap to step
    const stepped = Math.round((rawVal - min) / step) * step + min;
    const cleanVal = Number(Math.max(min, Math.min(max, stepped)).toFixed(step < 1 ? 2 : 0));
    onChange(cleanVal);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let nextVal = clampedVal;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      nextVal = Math.min(max, clampedVal + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      nextVal = Math.max(min, clampedVal - step);
    } else if (e.key === 'PageUp') {
      nextVal = Math.min(max, clampedVal + step * 5);
    } else if (e.key === 'PageDown') {
      nextVal = Math.max(min, clampedVal - step * 5);
    } else if (e.key === 'Home') {
      nextVal = min;
    } else if (e.key === 'End') {
      nextVal = max;
    } else {
      return;
    }
    e.preventDefault();
    onChange(Number(nextVal.toFixed(step < 1 ? 2 : 0)));
  };

  return (
    <div className={`space-y-1.5 group/slider ${disabled ? 'opacity-50 pointer-events-none' : ''}`} id={id}>
      {/* Label and Reset / Value Indicator Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-(--text-primary)">
            {label}
          </span>
          {info && <span className="shrink-0 flex items-center">{info}</span>}
          {isModified && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-(--accent)"
              title="Modified from default"
            />
          )}
          {isModified && onReset && (
            <button
              type="button"
              onClick={onReset}
              title={`Reset to default: ${defaultValue}${unit ? ' ' + unit : ''}`}
              className="opacity-0 group-hover/slider:opacity-100 text-(--text-muted) hover:text-(--accent) transition-all p-0.5 rounded-[4px] hover:bg-(--surface-sunken)"
              aria-label={`Reset ${label}`}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Number and unit live in separate cells of one bordered group. The unit
            used to be absolutely positioned over a right-aligned input, so the two
            rendered on top of each other ("qtl65"). */}
        <div
          className="flex items-stretch h-[28px] shrink-0 bg-(--surface-card) border border-(--border) rounded-[8px] overflow-hidden transition-all focus-within:border-(--accent) focus-within:ring-2 focus-within:ring-(--accent)/40"
          style={{ width: unit ? (unit.length > 4 ? 116 : 94) : 72 }}
        >
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={clampedVal}
            disabled={disabled}
            aria-label={`${label} value`}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (!isNaN(parsed)) {
                onChange(Math.max(min, Math.min(max, parsed)));
              }
            }}
            className="w-full min-w-0 bg-transparent border-none outline-none text-right font-semibold text-[13px] text-(--text-primary) tabular-nums px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && unitPosition === 'suffix' && (
            <span className="flex items-center pr-2 text-[10.5px] text-(--text-muted) font-medium whitespace-nowrap">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Slider Track and Thumb */}
      <div className="pt-2 pb-1 relative">
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-[4px] bg-(--surface-sunken) rounded-full cursor-pointer touch-none select-none border border-(--border)/50"
        >
          {/* Filled portion in --accent */}
          <div
            className="absolute top-0 left-0 bottom-0 bg-(--accent) rounded-full transition-all duration-75"
            style={{ width: `${pct}%` }}
          />

          {/* Handle */}
          <div
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={clampedVal}
            aria-label={label}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setIsHoveringHandle(true)}
            onMouseLeave={() => setIsHoveringHandle(false)}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-(--surface-card) border-2 border-(--accent) shadow-(--shadow-md) cursor-grab active:cursor-grabbing focus:outline-none transition-transform duration-100 flex items-center justify-center"
            style={{
              left: `${pct}%`,
              width: isDragging ? '22px' : isHoveringHandle ? '20px' : '18px',
              height: isDragging ? '22px' : isHoveringHandle ? '20px' : '18px',
              boxShadow: isDragging
                ? '0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent), 0 2px 8px rgba(0,0,0,0.15)'
                : 'var(--shadow-md)',
            }}
          >
            {/* Value bubble while dragging */}
            {isDragging && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-(--surface-card) border border-(--border) text-(--text-primary) text-[11px] font-semibold rounded-[4px] shadow-(--shadow-md) whitespace-nowrap pointer-events-none tabular-nums animate-in fade-in zoom-in-95 duration-100">
                {clampedVal}
                {unit ? ` ${unit}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Min and max labels beneath track */}
        <div className="flex justify-between items-center text-[11px] text-(--text-muted) mt-1.5 tabular-nums">
          <span>
            {min}
            {unit ? ` ${unit}` : ''}
          </span>
          {helpText && <span className="text-[11px] text-(--text-muted) italic">{helpText}</span>}
          <span>
            {max}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
