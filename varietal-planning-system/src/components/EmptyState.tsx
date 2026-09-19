import React from 'react';
import { ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  steps?: string[];
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Shown wherever a screen has nothing to display. The app ships with no data,
 * so these are the first thing a plant-team member sees - they explain what the
 * screen is for and what to do next, rather than leaving a blank panel.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  steps,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <div className="relative bg-(--surface-card) border border-(--border) shadow-(--shadow-sm) rounded-[16px] px-6 py-16 overflow-hidden">
    {/* faint dot grid so the panel reads as a surface, not a hole */}
    <div
      className="absolute inset-0 opacity-[0.03] pointer-events-none"
      style={{
        backgroundImage:
          'radial-gradient(circle at 2px 2px, var(--text-primary) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }}
    />

    <div className="relative max-w-lg mx-auto text-center flex flex-col items-center">
      <div className="w-16 h-16 rounded-[18px] bg-(--surface-sunken) border border-(--border) text-(--text-muted) flex items-center justify-center mb-5">
        {icon}
      </div>

      <h3 className="text-[18px] font-bold text-(--text-primary)">{title}</h3>
      <p className="text-[14px] text-(--text-secondary) mt-2 leading-relaxed">{description}</p>

      {steps && steps.length > 0 && (
        <div className="mt-8 w-full bg-(--surface-sunken) rounded-xl border border-(--border) p-5 text-left">
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3.5 text-[13px] text-(--text-secondary)">
                <span className="shrink-0 w-6 h-6 rounded-full bg-(--surface-card) border border-(--border-strong) text-(--text-primary) text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="leading-relaxed pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(actionLabel || secondaryLabel) && (
        <div className="mt-8 flex items-center gap-3 flex-wrap justify-center">
          {actionLabel && onAction && (
            <button type="button" onClick={onAction} className="btn-primary">
              <span>{actionLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button type="button" onClick={onSecondary} className="btn-secondary">
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);
