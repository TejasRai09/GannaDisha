import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react';

interface StickySummaryStripProps {
  totalPlannedAreaHa: number;
  commandAreaHa: number;
  totalSeedRequiredQtl: number;
  varietiesOverCapCount: number;
  isFeasible: boolean;
  feasibilityReason?: string;
  onNavigateToResults?: () => void;
}

export const StickySummaryStrip: React.FC<StickySummaryStripProps> = ({
  totalPlannedAreaHa,
  commandAreaHa,
  totalSeedRequiredQtl,
  varietiesOverCapCount,
  isFeasible,
  feasibilityReason,
  onNavigateToResults,
}) => {
  const areaRatioPct = commandAreaHa > 0 ? ((totalPlannedAreaHa / commandAreaHa) * 100).toFixed(1) : '0';

  // Flash background in --accent-subtle for 400ms when any value changes
  const [flash, setFlash] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFlash(true);
    const timer = setTimeout(() => {
      setFlash(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [totalPlannedAreaHa, totalSeedRequiredQtl, varietiesOverCapCount, isFeasible]);

  return (
    <aside
      aria-label="Live Feasibility Summary"
      className={`fixed bottom-0 left-0 right-0 z-30 transition-colors duration-400 border-t border-(--border) ${
        flash ? 'bg-(--accent-subtle)' : 'bg-(--surface-card)/80'
      } backdrop-blur-[12px] shadow-[0_-8px_28px_rgba(0,0,0,0.10)] dark:shadow-[0_-8px_28px_rgba(0,0,0,0.50)]`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Status Badge & Reason */}
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold tracking-wide uppercase ${
                isFeasible
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/12 text-rose-700 dark:text-rose-400 border border-rose-500/30'
              }`}
            >
              {isFeasible ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Feasible: OK</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Feasibility Warning</span>
                </>
              )}
            </div>

            {feasibilityReason && (
              <span className="text-[12px] text-(--text-secondary) truncate max-w-xs md:max-w-md hidden sm:inline">
                {feasibilityReason}
              </span>
            )}
          </div>

          {/* Metrics Laid Out Horizontally with Thin Vertical Dividers */}
          <div className="flex items-center gap-4 sm:gap-6 text-[13px] tabular-nums">
            <div>
              <span className="text-(--text-muted) block text-[11px] uppercase tracking-[0.06em] font-semibold">
                Planned Area
              </span>
              <span className="font-semibold text-(--text-primary)">
                {totalPlannedAreaHa.toLocaleString()}{' '}
                <span className="text-[11px] font-normal text-(--text-muted)">
                  ha ({areaRatioPct}%)
                </span>
              </span>
            </div>

            <div className="h-6 w-[1px] bg-(--border) hidden sm:block" />

            <div className="hidden sm:block">
              <span className="text-(--text-muted) block text-[11px] uppercase tracking-[0.06em] font-semibold">
                Seed Required
              </span>
              <span className="font-semibold text-(--accent)">
                {totalSeedRequiredQtl.toLocaleString()}{' '}
                <span className="text-[11px] font-normal text-(--text-muted)">qtl</span>
              </span>
            </div>

            <div className="h-6 w-[1px] bg-(--border)" />

            <div>
              <span className="text-(--text-muted) block text-[11px] uppercase tracking-[0.06em] font-semibold">
                Concentration Cap
              </span>
              <span
                className={`font-semibold ${
                  varietiesOverCapCount > 0
                    ? 'text-amber-600 dark:text-amber-400 flex items-center gap-1'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {varietiesOverCapCount > 0 ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 inline" />
                    <span>{varietiesOverCapCount} Over Cap</span>
                  </>
                ) : (
                  <span>Within Limits</span>
                )}
              </span>
            </div>

            {onNavigateToResults && (
              <button
                type="button"
                onClick={onNavigateToResults}
                className="ml-2 btn-primary !h-[32px] !text-[12px]"
              >
                <span>View Results</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
