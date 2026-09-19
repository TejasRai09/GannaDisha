import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  source?: string;
  children?: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, source, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1 group">
      <button
        type="button"
        className="text-(--text-muted) hover:text-(--accent) focus:outline-none focus-visible:ring-1 focus-visible:ring-(--accent) rounded p-0.5 transition-colors cursor-help"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(!isVisible);
        }}
        aria-label="Assumption info"
      >
        {children || <Info className="w-3.5 h-3.5" />}
      </button>

      {isVisible && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-3 bg-(--surface-card) text-(--text-primary) text-[12px] rounded-[8px] border border-(--border-strong) shadow-(--shadow-lg) pointer-events-none transition-all animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="font-normal leading-relaxed text-(--text-secondary)">{content}</div>
          {source && (
            <div className="mt-2 pt-2 border-t border-(--border) text-[10px] text-(--text-muted) flex items-center justify-between">
              <span className="uppercase tracking-wider font-semibold">Source</span>
              <span className="font-medium text-(--text-secondary)">{source}</span>
            </div>
          )}
          {/* Subtle caret */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-(--border-strong)" />
        </div>
      )}
    </span>
  );
};
