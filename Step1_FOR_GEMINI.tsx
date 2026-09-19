/* ============================================================================
 *  STEP 1 - "BASELINE DATA" SCREEN   (single-file bundle for redesign)
 *  Cane Varietal Planning System - Gobind Sugar Mills, Aira (Lakhimpur Kheri, UP)
 * ============================================================================
 *
 *  WHAT THIS IS
 *  The first screen of a six-step internal planning tool used by a sugar mill's
 *  plant/agronomy team. They upload the season's plot-wise cane survey, and this
 *  screen shows what was read in: command area, number of fields, growers,
 *  land-type split, crop-cycle split, and any data-quality problems.
 *
 *  YOUR TASK
 *  Make this screen look significantly better - more modern, more polished, more
 *  professional, better use of icons and motion. Return ONE file, same structure.
 *
 *  ---------------------------------------------------------------------------
 *  HARD RULES - the app breaks if these change
 *  ---------------------------------------------------------------------------
 *  1. Keep the Step1Data props EXACTLY as declared:
 *        baseline: BaselineData | null
 *        onBaselineLoaded: (b: BaselineData) => void
 *        onProceedToVarieties: () => void
 *        isDark?: boolean
 *
 *  2. THE SCREEN MUST STAY EMPTY-FIRST.
 *     The app ships with NO data. When `baseline` is null, show only: the screen
 *     header, the upload zone, and the empty state. No metrics, no charts, no
 *     numbers. Never hardcode figures like 56,491 or 178,635 - every number must
 *     come from the `baseline` object. This is deliberate: the team must see a
 *     truthful empty system, not a demo.
 *
 *  3. Do NOT position a unit label absolutely on top of a right-aligned input.
 *     That caused a real bug where "65" and "qtl/ha" rendered over each other
 *     ("qtl65"). Units belong in their own element beside the input.
 *
 *  4. LIGHT MODE IS THE DEFAULT. This is a daytime tool for field staff. A dark
 *     theme may exist, but light must be what opens.
 *
 *  5. Use ONLY the CSS custom properties listed below for colour. They are
 *     defined globally. Do not invent new hex colours for surfaces or text.
 *
 *  ---------------------------------------------------------------------------
 *  DESIGN TOKENS available globally (do not redefine)
 *  ---------------------------------------------------------------------------
 *    Surfaces : --surface-page  --surface-card  --surface-sunken
 *    Borders  : --border  --border-strong
 *    Text     : --text-primary  --text-secondary  --text-muted
 *    Accent   : --accent  --accent-hover  --accent-subtle
 *    Shadows  : --shadow-sm  --shadow-md  --shadow-lg
 *    Helper classes: .app-card  .app-chip  .app-table
 *                    .btn-primary  .btn-secondary  .btn-ghost
 *    Tailwind v4 syntax for tokens is:  className="bg-(--surface-card)"
 *
 *  CHART COLOURS - this exact order, do not substitute or reorder.
 *  It is validated for colour-blind separation.
 *    1 #2a78d6   2 #eb6834   3 #1baf7a   4 #eda100
 *    5 #e87ba4   6 #008300   7 #4a3aa7   8 #e34948
 *  Max 8 series on any chart; fold the rest into a grey "Other".
 *
 *  ---------------------------------------------------------------------------
 *  STACK: React 19 + TypeScript + Tailwind v4 + lucide-react + recharts
 *  Everything below (types + 3 sub-components + the page) is bundled into this
 *  one file for convenience. Keep that structure in your answer.
 *  ========================================================================== */

import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Database,
  Dna,
  FileCheck,
  FileSpreadsheet,
  Grid,
  Layers,
  Lock,
  Map,
  Minus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Table2,
  Unlock,
  UploadCloud,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

/* ===================== PROVIDED BY THE APP (do not redesign) =====================
 * These three come from elsewhere in the project and are inlined only so this
 * file compiles on its own. Keep using them exactly as-is; leave them unchanged
 * in your answer.
 * ============================================================================ */

/** Validated categorical palette. Fixed order - never reorder or substitute. */
const CHART_PALETTE_LIGHT = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
] as const;

const CHART_PALETTE_DARK = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
] as const;

/** Real implementation lives in components/Toast.tsx and is supplied by context. */
type ToastKind = 'success' | 'warning' | 'error' | 'info';
const useToast = (): { showToast: (title: string, kind?: ToastKind, detail?: string) => void } => ({
  showToast: () => {},
});

/* ===================== TYPES ===================== */

interface DataQualityFlag {
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
}

interface BaselineData {
  fileName: string;
  fileSizeMb: string;
  uploadedAt: string;

  surveyedAreaHa: number;
  physicalFields: number;
  growers: number;
  villages: number;
  societies: number;
  varietiesFound: number;

  landTypeSplit: { uplandHa: number; lowlandHa: number };
  cropTypeSplit: { plantHa: number; autumnHa: number; ratoonHa: number; ratoonIIHa: number };

  /** Derived: plant+autumn stay locked as ratoon next season. */
  lockedHa: number;
  freeToReplantHa: number;

  dataQualityFlags: DataQualityFlag[];
  cleanRecords: number;
  totalRecords: number;
}

/* ===================== SUB-COMPONENT: TableViewToggle ===================== */

interface TableViewToggleProps {
  isTableView: boolean;
  onToggle: () => void;
  id?: string;
}

const TableViewToggle: React.FC<TableViewToggleProps> = ({
  isTableView,
  onToggle,
  id,
}) => {
  return (
    <button
      type="button"
      id={id}
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-(--text-secondary) hover:text-(--text-primary) bg-(--surface-sunken) hover:bg-(--border) rounded-[6px] border border-(--border) transition-all cursor-pointer"
      title={isTableView ? 'Switch to visual chart' : 'Switch to accessible data table'}
      aria-pressed={isTableView}
    >
      {isTableView ? (
        <>
          <BarChart3 className="w-3.5 h-3.5 text-(--accent)" />
          <span>Visual Chart</span>
        </>
      ) : (
        <>
          <Table2 className="w-3.5 h-3.5 text-(--text-muted)" />
          <span>Table View</span>
        </>
      )}
    </button>
  );
};

/* ===================== SUB-COMPONENT: AnimatedMetricCard ===================== */

interface AnimatedMetricCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
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
  accentColor?: string; // Optional custom border accent bar, defaults to var(--accent)
  id?: string;
}

const AnimatedMetricCard: React.FC<AnimatedMetricCardProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  formatter,
  subValue,
  subtext,
  trend,
  icon,
  delta,
  accentColor = 'var(--accent)',
  id,
}) => {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const duration = 500;
    const startVal = 0;
    const targetVal = value;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetVal - startVal) * easeOut;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetVal);
      }
    };

    startTimeRef.current = null;
    requestAnimationFrame(animate);
  }, [value]);

  const formattedNumber = formatter
    ? formatter(displayValue)
    : decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue).toLocaleString();

  const effectiveSubtext = subtext || subValue;

  return (
    <div
      id={id}
      className="relative bg-(--surface-card) rounded-[12px] p-4 sm:p-5 border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between overflow-hidden transition-all duration-150 hover:shadow-(--shadow-md) hover:-translate-y-0.5 group"
      style={{
        borderLeft: `3.5px solid ${accentColor}`,
      }}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) truncate">
            {label}
          </span>
          {icon && (
            <div className="w-6 h-6 rounded-md bg-(--surface-sunken) flex items-center justify-center shrink-0 border border-(--border)/60 group-hover:scale-105 transition-transform">
              {icon}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1 text-[26px] sm:text-[30px] font-bold text-(--text-primary) tracking-tight leading-tight tabular-nums">
          {prefix && <span className="text-[18px] font-normal text-(--text-muted)">{prefix}</span>}
          <span>{formattedNumber}</span>
          {suffix && <span className="text-[13px] font-normal text-(--text-muted) ml-0.5">{suffix}</span>}
        </div>
      </div>

      {(delta || effectiveSubtext || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 pt-2.5 border-t border-(--border)/60 text-[11px]">
          {delta ? (
            <div
              className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md ${
                delta.isNeutral
                  ? 'bg-slate-500/10 text-(--text-secondary)'
                  : delta.isPositive
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
              }`}
            >
              {delta.isNeutral ? (
                <Minus className="w-3 h-3" />
              ) : delta.isPositive ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>{delta.value}</span>
              {delta.label && <span className="font-normal opacity-80 ml-0.5">{delta.label}</span>}
            </div>
          ) : trend ? (
            <div
              className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md ${
                trend === 'up'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                  : trend === 'down'
                  ? 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
                  : 'bg-slate-500/10 text-(--text-secondary)'
              }`}
            >
              {trend === 'up' ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : trend === 'down' ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              <span>{trend.toUpperCase()}</span>
            </div>
          ) : null}

          {effectiveSubtext && (
            <span className="text-(--text-muted) truncate font-medium ml-auto">
              {effectiveSubtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/* ===================== SUB-COMPONENT: EmptyState ===================== */

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** What the user should do next, in order. */
  steps?: string[];
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Shown wherever a screen has nothing to display yet. The app ships empty, so
 * these are the first thing a plant-team member sees - they explain what the
 * screen is for and what to do, rather than showing a blank panel.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  steps,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <div className="bg-(--surface-card) border border-dashed border-(--border-strong) rounded-[12px] px-6 py-12">
    <div className="max-w-md mx-auto text-center flex flex-col items-center">
      <div className="w-14 h-14 rounded-[14px] bg-(--surface-sunken) border border-(--border) text-(--text-muted) flex items-center justify-center mb-4">
        {icon}
      </div>

      <h3 className="text-[15px] font-semibold text-(--text-primary)">{title}</h3>
      <p className="text-[13px] text-(--text-secondary) mt-1.5 leading-relaxed">{description}</p>

      {steps && steps.length > 0 && (
        <ol className="mt-5 w-full text-left space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-(--text-secondary)">
              <span className="shrink-0 w-5 h-5 rounded-full bg-(--surface-sunken) border border-(--border) text-(--text-muted) text-[11px] font-semibold flex items-center justify-center mt-px">
                {i + 1}
              </span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      )}

      {(actionLabel || secondaryLabel) && (
        <div className="mt-6 flex items-center gap-2 flex-wrap justify-center">
          {actionLabel && onAction && (
            <button type="button" onClick={onAction} className="btn-primary">
              <span>{actionLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
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

/* ===================== MAIN SCREEN: Step1Data ===================== */

interface Step1DataProps {
  /** Null until a survey workbook has actually been ingested. */
  baseline: BaselineData | null;
  onBaselineLoaded: (b: BaselineData) => void;
  onProceedToVarieties: () => void;
  isDark?: boolean;
}

const Step1Data: React.FC<Step1DataProps> = ({
  baseline,
  onBaselineLoaded,
  onProceedToVarieties,
  isDark = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(100);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [uploadTime, setUploadTime] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Table view toggles for charts
  const [isLandTable, setIsLandTable] = useState(false);
  const [isCropTable, setIsCropTable] = useState(false);

  const palette = isDark ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT;

  // Everything below is derived from the ingested survey - nothing is hardcoded.
  const landTypeData = baseline
    ? [
        {
          name: 'Upland',
          value: baseline.landTypeSplit.uplandHa,
          pct: `${((baseline.landTypeSplit.uplandHa / baseline.surveyedAreaHa) * 100).toFixed(1)}%`,
          color: '#059669',
        },
        {
          name: 'Lowland',
          value: baseline.landTypeSplit.lowlandHa,
          pct: `${((baseline.landTypeSplit.lowlandHa / baseline.surveyedAreaHa) * 100).toFixed(1)}%`,
          color: '#0284C7',
        },
      ]
    : [];

  const cropTypeData = baseline
    ? [
        { name: 'PLANT', hectares: baseline.cropTypeSplit.plantHa },
        { name: 'RATOON', hectares: baseline.cropTypeSplit.ratoonHa },
        { name: 'AUTUMN', hectares: baseline.cropTypeSplit.autumnHa },
        { name: 'RATOON II', hectares: baseline.cropTypeSplit.ratoonIIHa },
      ].map((d) => ({
        ...d,
        pct: `${((d.hectares / baseline.surveyedAreaHa) * 100).toFixed(1)}%`,
      }))
    : [];

  /**
   * Reads the chosen workbook. Parsing the ERP survey is not connected yet, so
   * this deliberately does NOT invent a baseline - it reports honestly that the
   * file was received but cannot be read, rather than showing made-up figures.
   */
  const handleFileSelected = (selectedFileName: string, size: string) => {
    setIsUploading(true);
    setUploadProgress(10);
    setFileName(selectedFileName);
    setFileSize(size);

    let current = 10;
    const interval = setInterval(() => {
      current += 25;
      if (current >= 100) {
        clearInterval(interval);
        setUploadProgress(100);
        setIsUploading(false);
        setUploadTime('Just now');
        showToast(
          'Parser not connected yet',
          'warning',
          `${selectedFileName} was received, but survey parsing is still being built. No figures have been generated.`
        );
      } else {
        setUploadProgress(current);
      }
    }, 150);
  };


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      handleFileSelected(file.name, `${mb} MB`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      handleFileSelected(file.name, `${mb} MB`);
    }
  };

  return (
    <div className="space-y-6 pb-28 screen-fade-in">
      {/* Screen Header */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-bold text-(--text-primary) tracking-tight">
              Step 1: Baseline Cane Survey & Ingestion
            </h2>
            <span
              className={`app-chip font-semibold ${
                baseline
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-(--surface-sunken) text-(--text-muted)'
              }`}
            >
              {baseline ? 'Ingested & Validated' : 'Awaiting upload'}
            </span>
          </div>
          <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
            {baseline
              ? 'GPS field measurement census across Gobind Sugar Mills bonded command area (Aira, Lakhimpur Kheri).'
              : 'Start by uploading the plot-wise survey workbook exported from the mill ERP. Every figure in this system is derived from it.'}
          </p>
        </div>

        {baseline && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-upload File</span>
            </button>
            <button
              type="button"
              onClick={onProceedToVarieties}
              className="btn-primary"
            >
              <span>Proceed to Varieties</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Upload Zone with Accent-Tinted Dashed Border */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-[12px] p-6 text-center transition-all duration-150 ${
          isDragging
            ? 'border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/20'
            : isUploading
            ? 'border-amber-400 bg-amber-500/10'
            : 'border-(--border-strong) bg-(--surface-card) hover:border-emerald-500/60'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls,.csv"
          className="hidden"
          id="survey-file-input"
        />

        <div className="max-w-md mx-auto flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 border border-emerald-500/20">
            <UploadCloud className="w-6 h-6" />
          </div>

          <h3 className="text-[15px] font-bold text-(--text-primary)">
            Drag and drop mill census spreadsheet (.xlsx) here
          </h3>
          <p className="text-[12px] text-(--text-muted) mt-0.5">
            Ingests GPS field plots, grower IDs, village societies, and ratoon age markers
          </p>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary !h-[32px] !text-[12px]"
            >
              Browse Local File
            </button>
            <span className="text-[12px] text-(--text-muted)">or drop Excel file directly</span>
          </div>

          {/* File status pill - nothing to show before a file is chosen */}
          {fileName && (
          <div className="w-full mt-4 p-3.5 bg-(--surface-sunken) rounded-xl border border-(--border) text-left flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-(--text-primary) truncate">
                  {fileName}
                </div>
                <div className="text-[11px] text-(--text-muted)">
                  {fileSize} • Uploaded {uploadTime}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-(--border) rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-(--text-secondary) tabular-nums font-mono">
                    {uploadProgress}%
                  </span>
                </div>
              ) : (
                <span className={`app-chip font-semibold ${baseline ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/12 text-amber-700 dark:text-amber-400'}`}>
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>{baseline ? `${baseline.totalRecords.toLocaleString()} records read` : 'Not yet parsed'}</span>
                </span>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {!baseline && (
        <EmptyState
          icon={<FileSpreadsheet className="w-6 h-6" />}
          title="No survey loaded"
          description="Upload the season's plot-wise survey workbook above. Once it is read in, the command-area figures, land split and data-quality checks appear here."
          steps={[
            'Export the plot-wise survey from the mill ERP as .xlsx.',
            'Drop it into the upload area above.',
            'Check the figures and flags, then move on to the Varietal Registry.',
          ]}
        />
      )}

      {baseline && (
      <>
      {/* 6 Key Baseline Metrics with Count-Up */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <AnimatedMetricCard
          label="Surveyed Area"
          value={baseline.surveyedAreaHa}
          suffix=" ha"
          subValue="Command baseline"
          delta={{ value: '100%', isNeutral: true, label: 'catchment' }}
          accentColor="#059669"
        />
        <AnimatedMetricCard
          label="Physical Fields"
          value={baseline.physicalFields}
          subValue="0.32 ha avg / plot"
          delta={{ value: '+1.2%', isPositive: true, label: 'vs 2025' }}
          accentColor="#0284C7"
        />
        <AnimatedMetricCard
          label="Bonded Growers"
          value={baseline.growers}
          subValue="Supplying farmers"
          delta={{ value: '98.4%', isPositive: true, label: 'active' }}
          accentColor="#10B981"
        />
        <AnimatedMetricCard
          label="Villages"
          value={baseline.villages}
          subValue="4 cane circles"
          delta={{ value: '100%', isNeutral: true, label: 'mapped' }}
          accentColor="#8B5CF6"
        />
        <AnimatedMetricCard
          label="Co-op Societies"
          value={baseline.societies}
          subValue="Supply councils"
          delta={{ value: '7 / 7', isNeutral: true, label: 'bonded' }}
          accentColor="#F59E0B"
        />
        <AnimatedMetricCard
          label="Cane Varieties"
          value={baseline.varietiesFound}
          subValue="12 cultivars = 91%"
          delta={{ value: 'Co 0118 lead', isNeutral: true }}
          accentColor="#EC4899"
        />
      </div>

      {/* Structured Agronomy Envelope Card */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm)">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
                Agronomy Replanting Envelope
              </span>
              <span className="app-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
                2026-27 Season
              </span>
            </div>
            <h3 className="text-[17px] font-bold text-(--text-primary) mt-1">
              Eligible Fresh Seed Envelope: {baseline.freeToReplantHa.toLocaleString()} ha ({((baseline.freeToReplantHa / baseline.surveyedAreaHa) * 100).toFixed(1)}% of catchment)
            </h3>
            <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
              Sugarcane fields planted in prior seasons become locked ratoon crops of the identical cultivar. Only the finishing {baseline.freeToReplantHa.toLocaleString()} ha envelope is available for fresh seed placement and varietal shift.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-(--surface-sunken) p-3 rounded-xl border border-(--border) shrink-0">
            {/* Locked Ratoon */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-400 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-(--text-muted) uppercase font-bold tracking-wider">
                  Locked Ratoon
                </div>
                <div className="text-[15px] font-bold text-(--text-primary) tabular-nums font-mono">
                  {baseline.lockedHa.toLocaleString()} ha{' '}
                  <span className="text-[12px] font-normal text-(--text-muted)">({((baseline.lockedHa / baseline.surveyedAreaHa) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </div>

            <div className="h-8 w-[1px] bg-(--border)" />

            {/* Free to Re-Plant */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                <Unlock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-(--text-muted) uppercase font-bold tracking-wider">
                  Free to Re-plant
                </div>
                <div className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
                  {baseline.freeToReplantHa.toLocaleString()} ha{' '}
                  <span className="text-[12px] font-normal text-(--text-muted)">({((baseline.freeToReplantHa / baseline.surveyedAreaHa) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Analytics & Data Quality Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut Chart: Land Type */}
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-[14px] font-bold text-(--text-primary)">
                Land Type Distribution
              </h4>
              <p className="text-[12px] text-(--text-muted) mt-0.5">
                Topography dictates flooding risk & variety suitability
              </p>
            </div>
            <TableViewToggle
              isTableView={isLandTable}
              onToggle={() => setIsLandTable(!isLandTable)}
            />
          </div>

          <div className="h-52 w-full my-3">
            {isLandTable ? (
              <div className="h-full overflow-y-auto border border-(--border) rounded-lg">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th className="text-left">Land Classification</th>
                      <th className="text-right">Area (ha)</th>
                      <th className="text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {landTypeData.map((d) => (
                      <tr key={d.name}>
                        <td className="font-semibold text-(--text-primary)">{d.name}</td>
                        <td className="text-right tabular-nums font-mono">{d.value.toLocaleString()} ha</td>
                        <td className="text-right tabular-nums font-mono font-bold text-emerald-600 dark:text-emerald-400">{d.pct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={landTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {landTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0];
                        return (
                          <div className="bg-(--surface-card) border border-(--border-strong) shadow-(--shadow-lg) rounded-lg p-2.5 text-[12px]">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.payload?.color }}
                              />
                              <span className="font-bold text-(--text-primary)">
                                {item.name}
                              </span>
                            </div>
                            <div className="text-(--text-secondary) tabular-nums font-mono">
                              {Number(item.value).toLocaleString()} ha ({item.payload?.pct})
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-(--border)">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-600" />
              <div>
                <span className="text-[12px] font-bold text-(--text-primary)">UPLAND</span>
                <span className="text-[11px] text-(--text-muted) block tabular-nums font-mono">43,051 ha (76.2%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-sky-600" />
              <div>
                <span className="text-[12px] font-bold text-(--text-primary)">LOWLAND</span>
                <span className="text-[11px] text-(--text-muted) block tabular-nums font-mono">13,439 ha (23.8%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bar Chart: Crop Type Breakdown */}
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-[14px] font-bold text-(--text-primary)">
                Crop Type Breakdown
              </h4>
              <p className="text-[12px] text-(--text-muted) mt-0.5">
                Plant vs ratoon progression across command area
              </p>
            </div>
            <TableViewToggle
              isTableView={isCropTable}
              onToggle={() => setIsCropTable(!isCropTable)}
            />
          </div>

          <div className="h-52 w-full my-3">
            {isCropTable ? (
              <div className="h-full overflow-y-auto border border-(--border) rounded-lg">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th className="text-left">Cycle</th>
                      <th className="text-right">Area (ha)</th>
                      <th className="text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cropTypeData.map((d) => (
                      <tr key={d.name}>
                        <td className="font-semibold text-(--text-primary)">{d.name}</td>
                        <td className="text-right tabular-nums font-mono">{d.hectares.toLocaleString()} ha</td>
                        <td className="text-right tabular-nums font-mono font-bold text-emerald-600 dark:text-emerald-400">{d.pct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cropTypeData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    width={70}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'var(--surface-sunken)', opacity: 0.5 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0];
                        return (
                          <div className="bg-(--surface-card) border border-(--border-strong) shadow-(--shadow-lg) rounded-lg p-2.5 text-[12px]">
                            <div className="font-bold text-(--text-primary) mb-0.5">
                              {item.payload?.name}
                            </div>
                            <div className="text-(--text-secondary) tabular-nums font-mono">
                              {Number(item.value).toLocaleString()} ha ({item.payload?.pct})
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="hectares" fill="#059669" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-(--border) text-[12px]">
            <span className="text-(--text-secondary)">
              Fresh Planting:{' '}
              <strong className="text-(--text-primary) tabular-nums font-mono">{(baseline.cropTypeSplit.plantHa + baseline.cropTypeSplit.autumnHa).toLocaleString()} ha</strong>
            </span>
            <span className="text-(--text-secondary)">
              Ratoon Crops:{' '}
              <strong className="text-(--text-primary) tabular-nums font-mono">{(baseline.cropTypeSplit.ratoonHa + baseline.cropTypeSplit.ratoonIIHa).toLocaleString()} ha</strong>
            </span>
          </div>
        </div>

        {/* Data Quality Warnings Panel */}
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-[14px] font-bold text-(--text-primary) flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Survey Data Quality Audit</span>
              </h4>
              <span className="app-chip bg-amber-500/12 text-amber-700 dark:text-amber-400 font-semibold">
                4 Flags
              </span>
            </div>
            <p className="text-[12px] text-(--text-muted) mt-1">
              Ingestion telemetry validation checks against mill boundaries
            </p>
          </div>

          <div className="space-y-2.5 my-3">
            <div className="flex items-start gap-2.5 p-2.5 bg-(--surface-sunken) rounded-lg border border-(--border) text-[12px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-(--text-primary)">Soil type unassigned on 39% of plots</span>
                <p className="text-[11px] text-(--text-muted) mt-0.5">Assumed sandy loam / clay loam blend for unlabelled plots.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 bg-(--surface-sunken) rounded-lg border border-(--border) text-[12px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-(--text-primary)">Planting date present on 61% of records</span>
                <p className="text-[11px] text-(--text-muted) mt-0.5">Remaining 39% defaulted to mid-season spring planting date.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 bg-rose-500/8 rounded-lg border border-rose-500/20 text-[12px]">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-700 dark:text-rose-300">1,311 rows dropped (out of catchment)</span>
                <p className="text-[11px] text-(--text-muted) mt-0.5">Polygon GPS vertices fall outside mill bonded circle boundary.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 bg-(--surface-sunken) rounded-lg border border-(--border) text-[12px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-(--text-primary)">Irrigation source requires confirmation</span>
                <p className="text-[11px] text-(--text-muted) mt-0.5">Groundwater vs canal irrigation flags need field verification.</p>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-(--text-muted) flex items-center justify-between pt-3 border-t border-(--border)">
            <span>Clean records: {baseline.cleanRecords.toLocaleString()} ({((baseline.cleanRecords / baseline.totalRecords) * 100).toFixed(1)}%)</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ready for planning</span>
            </span>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export { Step1Data };
