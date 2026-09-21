import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * Says which figures on the screen are not the mill's own.
 *
 * The app opens on a worked scenario so that nobody has to fill in 86
 * varieties before they can see what the tool does. Most of that scenario is
 * measured from the survey, but four fields - sucrose, cane weight, cane yield
 * and red rot reaction - are not in the survey and cannot be derived from it.
 * They are placeholders by maturity class until the cane R&D inputs arrive.
 *
 * A recovery percentage computed from a placeholder sucrose figure looks
 * exactly like one computed from a measured sucrose figure. This is what keeps
 * the two apart, so it is deliberately hard to miss and deliberately says
 * which fields it means.
 */

const LABELS: Record<string, string> = {
  juiceSucrosePct: 'juice sucrose',
  avgCaneWeightGrams: 'average cane weight',
  caneYieldTha: 'cane yield',
  redRot: 'red rot reaction',
};

export const ProvisionalNotice: React.FC<{
  fields?: string[];
  /** What this particular screen gets wrong if the figures are wrong. */
  consequence?: string;
  className?: string;
}> = ({ fields, consequence, className = '' }) => {
  if (!fields?.length) return null;

  const named = fields.map((f) => LABELS[f] ?? f);
  const list =
    named.length > 1
      ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
      : named[0];

  return (
    <div
      className={`flex items-start gap-3 rounded-[12px] border border-amber-300/70 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-950/25 ${className}`}
      role="note"
    >
      <FlaskConical
        className="mt-[2px] h-[15px] w-[15px] shrink-0 text-amber-700 dark:text-amber-400"
        aria-hidden="true"
      />
      <p className="text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200">
        <span className="font-semibold">Awaiting cane R&amp;D inputs.</span>{' '}
        The {list} shown for each variety {named.length > 1 ? 'are' : 'is'} a
        placeholder by maturity class, not a mill figure. Area, maturity, land
        type and grower counts are measured from the 2026-27 survey and are real.
        {consequence ? ` ${consequence}` : ''}
      </p>
    </div>
  );
};
