import React from 'react';
import { Lock } from 'lucide-react';

interface LockedControlProps {
  isLocked: boolean;
  lockReason?: string;
  children: React.ReactNode;
}

export const LockedControl: React.FC<LockedControlProps> = ({
  isLocked,
  lockReason = 'Requires Manager authority to modify',
  children,
}) => {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="relative group/locked select-none">
      <div className="opacity-50 pointer-events-none filter grayscale-[20%]">
        {children}
      </div>

      {/* Subtle lock indicator badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-(--surface-sunken) border border-(--border-strong) px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium text-(--text-secondary) shadow-(--shadow-sm)">
        <Lock className="w-3 h-3 text-(--text-muted)" />
        <span>Manager only</span>
      </div>

      {/* Tooltip on hover */}
      <div className="absolute inset-0 z-10 cursor-not-allowed">
        <div className="hidden group-hover/locked:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-(--surface-card) text-(--text-primary) text-[11px] rounded-[6px] border border-(--border-strong) shadow-(--shadow-md) whitespace-nowrap pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-(--accent)" />
            <span>{lockReason}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
