import React from 'react';
import { Layers3, ArrowRight, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

/**
 * What the three survey files together do and do not tell us.
 *
 * Step 1's other panels describe one file. This one describes the join of
 * three, because on their own each gives a misleading answer: the season's
 * survey says two fifths of the command area has no agronomy at all, and
 * that is only true until last season's survey is laid beside it.
 *
 * Every figure comes from build/make_data_audit.py. Nothing is written here
 * by hand - if a number looks wrong, the arithmetic is in that file.
 *
 * It exists to be presented. The three questions at the foot are the ones the
 * plant team has to answer, and they are phrased to be read aloud.
 */

export interface DataAudit {
  totalHa: number;
  totalRows: number;
  sources: { name: string; rows: number; areaHa: number; role: string }[];
  coverage: {
    measuredHa: number; measuredPct: number;
    ratoonHa: number; ratoonPct: number; ratoonRows: number;
  };
  bridge: {
    ratoonRows: number; matched: number; matchedPct: number;
    wasPlant: number; wasAutumn: number;
  };
  recoverable: { field: string; rows: number; pct: number; areaHa: number }[];
  landType: {
    measuredLowlandHa: number; measuredUplandHa: number; measuredBaseHa: number;
    lowlandPct: number; lastYearLowlandPct: number; unfillableHa: number;
  };
  missingRatoon: {
    plots: number; areaHa: number; confirmedInLastYear: number; confirmedPct: number;
    wasPlant: number; wasAutumn: number;
    freeToReplantNowHa: number; freeToReplantIfConfirmedHa: number; upliftPct: number;
  };
}

const FIELD_LABEL: Record<string, string> = {
  soil_type: 'Soil type',
  crop_condition: 'Crop condition',
  diseases: 'Disease & pest',
  plant_method: 'Planting method',
};

const ha = (n: number) => Math.round(n).toLocaleString();

/** A two- or three-part proportion bar. Widths are the figures themselves. */
const Bar: React.FC<{ parts: { pct: number; className: string; title: string }[] }> = ({ parts }) => (
  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-(--surface-sunken)">
    {parts.map((p, i) => (
      <div key={i} className={p.className} style={{ width: `${p.pct}%` }} title={p.title} />
    ))}
  </div>
);

const Key: React.FC<{ swatch: string; label: string; value: string; sub?: string }> = ({
  swatch, label, value, sub,
}) => (
  <div className="flex items-start gap-2">
    <span className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} />
    <div className="min-w-0">
      <div className="text-[12.5px] font-semibold text-(--text-primary) leading-tight">{label}</div>
      <div className="text-[13px] font-bold tabular-nums text-(--text-primary) mt-0.5">{value}</div>
      {sub && <div className="text-[11.5px] text-(--text-muted) leading-snug mt-0.5">{sub}</div>}
    </div>
  </div>
);

export const DataCoverage: React.FC<{ audit?: DataAudit | null }> = ({ audit }) => {
  if (!audit) return null;
  const { coverage: c, bridge: b, landType: lt, missingRatoon: m } = audit;

  return (
    <div className="bg-(--surface-card) rounded-[16px] border border-(--border) shadow-(--shadow-sm) overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-(--border)">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h4 className="text-[15px] font-extrabold text-(--text-primary) flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-(--accent)" />
              What the survey files do and don&apos;t tell us
            </h4>
            <p className="text-[13px] text-(--text-muted) mt-1 max-w-2xl leading-relaxed">
              Three files describe this command area. Read on its own, none of them is complete.
              Read together, most of the gap closes.
            </p>
          </div>
          <span className="app-chip bg-(--accent-subtle) text-(--accent) font-semibold shrink-0">
            3 sources joined
          </span>
        </div>
      </div>

      {/* ---------------------------- the sources ---------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-(--border)">
        {audit.sources.map((s) => (
          <div key={s.name} className="bg-(--surface-card) px-5 py-4">
            <div className="text-[12.5px] font-bold text-(--text-primary) leading-snug">{s.name}</div>
            <div className="text-[11.5px] font-mono text-(--text-muted) mt-1 tabular-nums">
              {s.rows.toLocaleString()} rows · {ha(s.areaHa)} ha
            </div>
            <p className="text-[12px] text-(--text-secondary) mt-2 leading-relaxed">{s.role}</p>
          </div>
        ))}
      </div>

      <div className="p-6 space-y-7">
        {/* -------------------- 1. agronomy coverage -------------------- */}
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-2.5">
            <h5 className="text-[13.5px] font-bold text-(--text-primary)">
              Agronomy: soil, crop condition, planting method
            </h5>
            <span className="text-[11.5px] text-(--text-muted) tabular-nums">
              {ha(audit.totalHa)} ha total
            </span>
          </div>
          <Bar parts={[
            { pct: c.measuredPct, className: 'bg-emerald-500', title: `Measured this season: ${ha(c.measuredHa)} ha` },
            { pct: c.ratoonPct, className: 'bg-amber-400', title: `Recoverable from 2025-26: ${ha(c.ratoonHa)} ha` },
          ]} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3.5">
            <Key
              swatch="bg-emerald-500"
              label="Measured this season"
              value={`${ha(c.measuredHa)} ha  ·  ${c.measuredPct}%`}
              sub="Plant, autumn and ratoon II plots. Recorded in full."
            />
            <Key
              swatch="bg-amber-400"
              label="Recoverable from last season"
              value={`${ha(c.ratoonHa)} ha  ·  ${c.ratoonPct}%`}
              sub={`${c.ratoonRows.toLocaleString()} ratoon rows with nothing recorded this season.`}
            />
          </div>

          <div className="mt-4 rounded-[12px] border border-(--border) bg-(--surface-sunken) p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-(--text-primary)">
              <ArrowRight className="w-3.5 h-3.5 text-(--accent)" />
              <span>
                {b.matchedPct}% of those ratoon rows match a plot in the 2025-26 survey
              </span>
            </div>
            <p className="text-[12px] text-(--text-secondary) mt-1.5 leading-relaxed">
              {b.matched.toLocaleString()} of {b.ratoonRows.toLocaleString()}. Last season they were
              plant ({b.wasPlant.toLocaleString()}) or autumn ({b.wasAutumn.toLocaleString()}) crops
              — which is exactly what a ratoon plot should have been, and is how we know the join is real.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5">
              {audit.recoverable.map((r) => (
                <div key={r.field} className="rounded-[9px] bg-(--surface-card) border border-(--border) px-3 py-2.5">
                  <div className="text-[11px] text-(--text-muted) leading-tight">
                    {FIELD_LABEL[r.field] ?? r.field}
                  </div>
                  <div className="text-[17px] font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 leading-none mt-1.5">
                    {r.pct}%
                  </div>
                  <div className="text-[10.5px] text-(--text-muted) tabular-nums mt-1">
                    {ha(r.areaHa)} ha back
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* -------------------- 2. land type, the one gap -------------------- */}
        <div>
          <h5 className="text-[13.5px] font-bold text-(--text-primary) mb-2.5">
            Land type — the one thing no file can supply
          </h5>
          <Bar parts={[
            { pct: (lt.measuredBaseHa / audit.totalHa) * 100, className: 'bg-emerald-500', title: `Measured: ${ha(lt.measuredBaseHa)} ha` },
            { pct: (lt.unfillableHa / audit.totalHa) * 100, className: 'bg-red-400', title: `No data anywhere: ${ha(lt.unfillableHa)} ha` },
          ]} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3.5">
            <Key
              swatch="bg-emerald-500"
              label="Measured"
              value={`${ha(lt.measuredBaseHa)} ha  ·  ${lt.lowlandPct}% lowland`}
              sub="The figure the plan uses."
            />
            <Key
              swatch="bg-red-400"
              label="No data in any file"
              value={`${ha(lt.unfillableHa)} ha`}
              sub={`Stamped UPLAND without being measured. Last season recorded only ${lt.lastYearLowlandPct}% lowland, so it cannot be back-filled either.`}
            />
          </div>
          <div className="mt-3.5 flex items-start gap-2.5 rounded-[12px] border border-red-300/60 bg-red-50 dark:border-red-500/25 dark:bg-red-950/20 p-3.5">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-[1px]" />
            <p className="text-[12px] text-red-900 dark:text-red-200 leading-relaxed">
              Land type only began being recorded properly this season, and only on non-ratoon plots.
              The {lt.lowlandPct}% lowland figure is the best estimate available, but it is measured on
              {' '}{Math.round((lt.measuredBaseHa / audit.totalHa) * 100)}% of the area. Ratoon II — the one
              ratoon class the ERP does record — comes out the <em>most</em> lowland of all, so the true
              share is more likely above {lt.lowlandPct}% than below it.
            </p>
          </div>
        </div>

        {/* -------------------- 3. the missing ratoon land -------------------- */}
        <div>
          <h5 className="text-[13.5px] font-bold text-(--text-primary) mb-2.5">
            Land free to replant — possibly a quarter more than we think
          </h5>
          <Bar parts={[
            { pct: (m.freeToReplantNowHa / m.freeToReplantIfConfirmedHa) * 100, className: 'bg-(--accent)', title: `In the survey: ${ha(m.freeToReplantNowHa)} ha` },
            { pct: (m.areaHa / m.freeToReplantIfConfirmedHa) * 100, className: 'bg-sky-400', title: `In the ratoon register only: ${ha(m.areaHa)} ha` },
          ]} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3.5">
            <Key
              swatch="bg-(--accent)"
              label="In the plot-wise survey"
              value={`${ha(m.freeToReplantNowHa)} ha`}
              sub="What every plan so far has been built on."
            />
            <Key
              swatch="bg-sky-400"
              label="In the ratoon register, not the survey"
              value={`${ha(m.areaHa)} ha  ·  +${m.upliftPct}%`}
              sub={`${m.plots.toLocaleString()} plots. ${m.confirmedPct}% of them appear in the 2025-26 survey as plant or autumn crops.`}
            />
          </div>
          <div className="mt-3.5 flex items-start gap-2.5 rounded-[12px] border border-sky-300/60 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-950/20 p-3.5">
            <HelpCircle className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0 mt-[1px]" />
            <p className="text-[12px] text-sky-900 dark:text-sky-200 leading-relaxed">
              If these plots are real, replantable land rises from {ha(m.freeToReplantNowHa)} ha to
              {' '}<strong>{ha(m.freeToReplantIfConfirmedHa)} ha</strong> — the single biggest number in the
              plan. They were a standing crop last season and the ratoon register lists them now; only the
              field survey has no record. Either it missed them, or they were ploughed out between
              30 April and the survey&apos;s later passes.
            </p>
          </div>
        </div>

        {/* -------------------- what to ask -------------------- */}
        <div className="rounded-[12px] border border-(--border) bg-(--surface-sunken) p-5">
          <h5 className="text-[13px] font-bold text-(--text-primary) flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-(--accent)" />
            Three questions for the plant team
          </h5>
          <ol className="mt-3 space-y-3 list-decimal pl-5">
            <li className="text-[12.5px] text-(--text-secondary) leading-relaxed">
              <strong className="text-(--text-primary)">
                Are the {ha(m.areaHa)} ha of extra ratoon plots real, or were they ploughed out?
              </strong>{' '}
              {m.confirmedInLastYear.toLocaleString()} of {m.plots.toLocaleString()} were a standing crop
              last season. Their answer changes the plan&apos;s size by {m.upliftPct}%.
            </li>
            <li className="text-[12.5px] text-(--text-secondary) leading-relaxed">
              <strong className="text-(--text-primary)">
                Can we carry last season&apos;s soil, condition and disease onto this season&apos;s ratoon plots?
              </strong>{' '}
              It recovers {ha(c.ratoonHa)} ha of agronomy. The two seasons use different wording for the
              same things — &quot;SANDY&quot; last year has no equivalent this year — so somebody has to
              approve the mapping.
            </li>
            <li className="text-[12.5px] text-(--text-secondary) leading-relaxed">
              <strong className="text-(--text-primary)">
                Who can give us land type for the {ha(lt.unfillableHa)} ha of ratoon?
              </strong>{' '}
              It is the only gap with no data in any file, and lowland tolerance is a first-order varietal
              decision. A village-level judgement from the field staff would be enough to start.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
