import React, { useState, useRef, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, ChevronRight } from 'lucide-react';

interface AnimatedMetricCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  /** Alias for `suffix`. Step 5 calls it `unit` - both render identically. */
  unit?: string;
  decimals?: number;
  formatter?: (val: number) => string;
  subValue?: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  delta?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
    label?: string;
  };
  accentColor?: string;
  /** When given, the whole card becomes a button that opens its detail. */
  onClick?: () => void;
  id?: string;
}

export const AnimatedMetricCard: React.FC<AnimatedMetricCardProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  unit = '',
  decimals = 0,
  formatter,
  subValue,
  subtext,
  trend,
  icon,
  delta,
  accentColor = 'var(--accent)',
  onClick,
  id,
}) => {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(value);
      return;
    }
    let start: number | null = null;
    const duration = 700;

    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplayValue(value * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setDisplayValue(value);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const formattedNumber = formatter
    ? formatter(displayValue)
    : decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toLocaleString();

  const effectiveSuffix = suffix || unit;
  const effectiveSubtext = subtext || subValue;

  return (
    <div
      id={id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`relative bg-(--surface-card) rounded-[12px] p-5 border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between overflow-hidden transition-all duration-200 hover:shadow-(--shadow-md) hover:-translate-y-1 group ${
        onClick
          ? 'cursor-pointer hover:border-(--accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)'
          : ''
      }`}
    >
      <div
        className="absolute top-0 left-0 w-full h-1 opacity-80"
        style={{ backgroundColor: accentColor }}
      />

      <div>
        <div className="flex items-center justify-between gap-2 mb-3 mt-1">
          <span className="text-[12px] font-bold uppercase tracking-wider text-(--text-muted) truncate">
            {label}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {onClick && (
              <ChevronRight className="w-4 h-4 text-(--text-muted) opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            )}
            {icon && (
              <div className="w-7 h-7 rounded-lg bg-(--surface-sunken) flex items-center justify-center border border-(--border) text-(--text-secondary) group-hover:text-(--text-primary) transition-colors">
                {icon}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-1 text-[28px] sm:text-[32px] font-extrabold text-(--text-primary) tracking-tight leading-none tabular-nums">
          {prefix && <span className="text-[18px] font-medium text-(--text-muted)">{prefix}</span>}
          <span>{formattedNumber}</span>
          {effectiveSuffix && (
            <span className="text-[14px] font-medium text-(--text-muted) ml-0.5">
              {effectiveSuffix}
            </span>
          )}
        </div>
      </div>

      {(delta || effectiveSubtext) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 border-t border-(--border) text-[12px]">
          {delta && (
            <div
              className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded-md ${
                delta.isNeutral
                  ? 'bg-(--surface-sunken) text-(--text-secondary)'
                  : delta.isPositive
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
              }`}
            >
              {delta.isNeutral ? (
                <Minus className="w-3.5 h-3.5" />
              ) : delta.isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              <span>{delta.value}</span>
              {delta.label && <span className="font-medium opacity-80 ml-0.5">{delta.label}</span>}
            </div>
          )}

          {effectiveSubtext && (
            <span className="text-(--text-muted) font-medium leading-snug basis-full">
              {effectiveSubtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
