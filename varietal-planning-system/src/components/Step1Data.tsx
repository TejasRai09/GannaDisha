import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Dna,
  Download,
  FileCheck,
  FileSpreadsheet,
  Grid,
  Layers,
  Lock,
  Map,
  RefreshCw,
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
import { FreePlot, BaselineData } from '../types';
import { decodeBaseline } from '../lib/loadBaseline';
import { EmptyState } from './EmptyState';
import { CommandAreaLogo } from './Logos';
import { AnimatedMetricCard } from './AnimatedMetricCard';
import { TableViewToggle } from './TableViewToggle';
import { MetricDetailModal, DetailColumn } from './MetricDetailModal';
import { DataCoverage, DataAudit } from './DataCoverage';
import { useToast } from './Toast';
import { CHART_PALETTE_LIGHT, CHART_PALETTE_DARK } from '../utils/theme';

interface Step1DataProps {
  /** Null until a survey workbook has actually been ingested. */
  baseline: BaselineData | null;
  onBaselineLoaded: (b: BaselineData) => void;
  /** Plots finishing ratoon, handed to Step 6's allocator. */
  onFreePlotsLoaded?: (plots: FreePlot[]) => void;
  onProceedToVarieties: () => void;
  isDark?: boolean;
  /** Combined findings across the three survey files, from make_data_audit.py. */
  dataAudit?: DataAudit | null;
}

export const Step1Data: React.FC<Step1DataProps> = ({
  dataAudit,
  baseline,
  onBaselineLoaded,
  onFreePlotsLoaded,
  onProceedToVarieties,
  isDark = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(100);
  const [fileName, setFileName] = useState('');
  // Set by the Re-upload button, to bring the drop zone back on demand.
  const [showUploader, setShowUploader] = useState(false);
  const [fileSize, setFileSize] = useState('');
  const [uploadTime, setUploadTime] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [detail, setDetail] = useState<null | 'area' | 'fields' | 'growers' | 'villages' | 'societies' | 'varieties'>(null);

  const [isLandTable, setIsLandTable] = useState(false);
  const [isCropTable, setIsCropTable] = useState(false);

  const palette = isDark ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT;

  // Everything below is derived from the ingested survey. Nothing is hardcoded:
  // if a figure is not in `baseline`, it is not shown at all.
  // Share is taken against the area where land type was actually RECORDED, not
  // against the whole command area. The ERP leaves LANDTYPE blank on every
  // ratoon row, so dividing by the full 56,491 ha showed lowland at 23.8% when
  // the surveyed rows say 39.5% - and the two figures did not sum to 100%.
  const landBasisHa =
    baseline?.landTypeSplit.recordedHa ||
    (baseline ? baseline.landTypeSplit.uplandHa + baseline.landTypeSplit.lowlandHa : 0);
  const landUnrecordedHa = baseline?.landTypeSplit.unrecordedHa ?? 0;

  const landTypeData = baseline
    ? [
        {
          name: 'Upland',
          value: baseline.landTypeSplit.uplandHa,
          pct: `${((baseline.landTypeSplit.uplandHa / (landBasisHa || 1)) * 100).toFixed(1)}%`,
          color: palette[2],
        },
        {
          name: 'Lowland',
          value: baseline.landTypeSplit.lowlandHa,
          pct: `${((baseline.landTypeSplit.lowlandHa / (landBasisHa || 1)) * 100).toFixed(1)}%`,
          color: palette[0],
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

  const villageRows = baseline?.villageBreakdown ?? [];
  const societyRows = baseline?.societyBreakdown ?? [];
  const varietyRows = baseline?.varietyBreakdown ?? [];

  const avgPlotHa = baseline ? baseline.surveyedAreaHa / baseline.physicalFields : 0;
  const criticalFlags = baseline
    ? baseline.dataQualityFlags.filter((f) => f.severity === 'critical').length
    : 0;

  const [parseLabel, setParseLabel] = useState('');

  /**
   * Parses the ERP survey workbook in a Web Worker.
   *
   * The file is ~78 MB on disk but ~556 MB of XML inside, so it is streamed
   * row by row rather than loaded into a spreadsheet object model. The worker
   * keeps the interface responsive and reports progress as it goes.
   */
  const handleFile = (file: File) => {
    const sizeLabel =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    setFileName(file.name);
    setFileSize(sizeLabel);
    setIsUploading(true);
    setUploadProgress(2);
    setParseLabel('Reading file');

    const finish = (b: BaselineData, plots?: FreePlot[]) => {
      if (plots && onFreePlotsLoaded) onFreePlotsLoaded(plots);
      setUploadProgress(100);
      setIsUploading(false);
      setParseLabel('');
      setUploadTime('Just now');
      onBaselineLoaded(b);
      showToast(
        'Survey loaded',
        'success',
        `${b.totalRecords.toLocaleString()} records across ${b.physicalFields.toLocaleString()} fields.`
      );
    };

    const fail = (msg: string) => {
      setIsUploading(false);
      setUploadProgress(100);
      setParseLabel('');
      showToast('Could not read the survey', 'error', msg);
    };

    // A previously prepared baseline.json is still accepted. Decoding lives in
    // one place so this and the sign-in auto-load cannot drift apart.
    if (/\.json$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onerror = () => fail('The file could not be opened.');
      reader.onload = () => {
        try {
          const { baseline: b, freePlots } = decodeBaseline(JSON.parse(String(reader.result)));
          finish(b, freePlots);
        } catch (err) {
          fail(err instanceof Error ? err.message : 'Unreadable JSON.');
        }
      };
      reader.readAsText(file);
      return;
    }

    if (!/\.xlsx$/i.test(file.name)) {
      fail('Please choose the .xlsx survey exported from the mill ERP.');
      return;
    }

    const worker = new Worker(
      new URL('../workers/surveyParser.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === 'progress') {
        setUploadProgress(Math.max(2, Math.round(m.pct)));
        setParseLabel(m.label);
      } else if (m.type === 'done') {
        finish(m.payload.baseline as BaselineData, m.payload.freePlots as FreePlot[]);
        worker.terminate();
      } else if (m.type === 'error') {
        fail(m.message);
        worker.terminate();
      }
    };
    worker.onerror = (ev) => {
      fail(ev.message || 'The parser stopped unexpectedly.');
      worker.terminate();
    };

    file.arrayBuffer().then(
      (buffer) =>
        worker.postMessage({ buffer, fileName: file.name, fileSize: file.size }, [buffer]),
      () => fail('The file could not be read from disk.')
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-8 pb-28 screen-fade-in max-w-[1600px] mx-auto">
      {/* ------------------------------ header ------------------------------ */}
      <div className="bg-(--surface-card) p-6 sm:p-8 rounded-[16px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[24px] font-extrabold text-(--text-primary) tracking-tight">
              Step 1: Baseline Cane Survey &amp; Ingestion
            </h2>
            <span
              className={`app-chip font-bold border ${
                baseline
                  ? 'bg-(--accent-subtle) text-(--accent) border-(--accent-subtle)'
                  : 'bg-(--surface-sunken) text-(--text-secondary) border-(--border)'
              }`}
            >
              {baseline ? 'Ingested & Validated' : 'Awaiting upload'}
            </span>
          </div>
          <p className="text-[14px] text-(--text-secondary) max-w-3xl leading-relaxed">
            {baseline
              ? 'GPS field measurement census across Gobind Sugar Mill bonded command area (Aira, Lakhimpur Kheri).'
              : 'Start by uploading the plot-wise survey workbook exported from the mill ERP. Every figure in this system is derived from it.'}
          </p>
        </div>

        {baseline && (
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                // Show the drop zone as well as opening the picker, so a drag
                // works too and it is clear where a file would land.
                setShowUploader(true);
                fileInputRef.current?.click();
              }}
              className="btn-secondary"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="font-semibold">Re-upload</span>
            </button>
            <button type="button" onClick={onProceedToVarieties} className="btn-primary">
              <span className="font-bold">Proceed to Varieties</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------- upload zone ---------------------------- */}
      {/* The season's survey is loaded automatically when the deployment ships
          one, so leading with an empty drop zone would ask for a file that is
          already in. It is kept for an upload mid-season - the Re-upload button
          above opens it - but it does not take the top of the screen once the
          figures are there. */}
      <div
        hidden={Boolean(baseline) && !isUploading && !showUploader}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-[16px] p-8 sm:p-12 text-center transition-all duration-300 group overflow-hidden ${
          isDragging
            ? 'border-(--accent) bg-(--accent-subtle) scale-[1.01] shadow-(--shadow-md)'
            : isUploading
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
            : 'border-(--border-strong) bg-(--surface-card) hover:border-(--accent)'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.json"
          className="hidden"
          id="survey-file-input"
        />

        <div className="max-w-lg mx-auto flex flex-col items-center relative z-10">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${
              isDragging
                ? 'bg-(--accent) text-white shadow-lg scale-110'
                : 'bg-(--surface-sunken) text-(--text-muted) border border-(--border) group-hover:bg-(--accent-subtle) group-hover:text-(--accent)'
            }`}
          >
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-[18px] font-extrabold text-(--text-primary)">
            Drag and drop the survey file (.xlsx) here
          </h3>
          <p className="text-[13px] text-(--text-secondary) mt-1.5 leading-relaxed">
            Reads GPS field plots, grower records, villages and crop cycles straight from the workbook
          </p>

          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary !h-[38px] !px-5"
            >
              Browse for the survey file
            </button>
            <span className="text-[13px] font-medium text-(--text-muted)">
              or drop it directly
            </span>
          </div>

          {fileName && (
            <div className="w-full mt-8 p-4 bg-(--surface-sunken) rounded-xl border border-(--border) text-left flex items-center justify-between screen-fade-in">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-(--surface-card) border border-(--border) flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-(--accent)" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-(--text-primary) truncate">{fileName}</div>
                  <div className="text-[12px] text-(--text-muted) font-medium mt-0.5">
                    {fileSize} &middot; uploaded {uploadTime}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 pl-4 border-l border-(--border)">
                {isUploading ? (
                  <div className="flex flex-col gap-1.5 w-32">
                    <div className="flex justify-between items-center text-[11px] font-bold text-(--text-secondary)">
                      <span>{parseLabel || 'Reading'}</span>
                      <span className="tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-(--border) rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-(--accent) h-full transition-all duration-200 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border ${
                      baseline
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400'
                    }`}
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>
                      {baseline ? `${baseline.totalRecords.toLocaleString()} records` : 'Awaiting parse'}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!baseline && (
        <EmptyState
          icon={<CommandAreaLogo className="w-9 h-9" />}
          title="No survey loaded"
          description="Upload the season's plot-wise survey workbook above. Once it is read in, the command-area figures, land split and data-quality checks appear here."
          steps={[
            'Export the plot-wise survey from the mill ERP as .xlsx.',
            'Drop it into the upload area above and wait for it to finish reading.',
            'Check the figures and flags, then move on to the Varietal Registry.',
          ]}
        />
      )}

      {baseline && (
        <div className="space-y-6 screen-fade-in">
          {/* Metrics. All six read from `baseline`. Sub-labels state only what the
              survey actually tells us - no year-on-year deltas, because the app
              holds a single season and has nothing to compare against. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatedMetricCard
              label="Surveyed Area"
              onClick={() => setDetail('area')}
              value={baseline.surveyedAreaHa}
              suffix="ha"
              subValue="Total area recorded in this survey"
              icon={<Map className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Physical Fields"
              onClick={() => setDetail('fields')}
              value={baseline.physicalFields}
              subValue={`${avgPlotHa.toFixed(2)} ha average per field`}
              icon={<Grid className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Bonded Growers"
              onClick={() => setDetail('growers')}
              value={baseline.growers}
              subValue="Registered supplying farmers"
              icon={<Users className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Villages"
              onClick={() => setDetail('villages')}
              value={baseline.villages}
              subValue={`Across ${baseline.societies} co-operative societies`}
              icon={<Building2 className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Co-op Societies"
              onClick={() => setDetail('societies')}
              value={baseline.societies}
              subValue="Supply councils under contract"
              icon={<Layers className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Cane Varieties"
              onClick={() => setDetail('varieties')}
              value={baseline.varietiesFound}
              subValue="Distinct varieties found in the survey"
              icon={<Dna className="w-4 h-4" />}
            />
          </div>

          {/* ------------------------ replanting envelope ------------------------ */}
          <div className="bg-(--surface-page) p-1 rounded-[16px] border border-(--border) shadow-(--shadow-sm)">
            <div className="bg-(--surface-card) p-6 rounded-[12px] flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[12px] uppercase tracking-widest font-extrabold text-(--accent)">
                    Agronomy Replanting Envelope
                  </span>
                </div>
                <h3 className="text-[20px] font-extrabold text-(--text-primary) tracking-tight">
                  Eligible Fresh Seed Envelope:{' '}
                  <span className="text-(--accent)">
                    {Math.round(baseline.freeToReplantHa).toLocaleString()} ha
                  </span>
                  <span className="text-[16px] font-medium text-(--text-muted) ml-2">
                    ({((baseline.freeToReplantHa / baseline.surveyedAreaHa) * 100).toFixed(1)}% of catchment)
                  </span>
                </h3>
                <p className="text-[13px] text-(--text-secondary) mt-2 max-w-4xl leading-relaxed">
                  Fields planted in prior seasons become locked ratoon crops of the identical cultivar.
                  Only the finishing envelope is available for fresh seed placement and varietal shift.
                </p>
              </div>

              <div className="flex items-center gap-5 bg-(--surface-sunken) p-4 rounded-xl border border-(--border) shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-400 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-(--text-secondary) uppercase font-bold tracking-wider mb-0.5">
                      Locked Ratoon
                    </div>
                    <div className="text-[18px] font-extrabold text-(--text-primary) tabular-nums leading-none">
                      {Math.round(baseline.lockedHa).toLocaleString()}{' '}
                      <span className="text-[14px] font-medium text-(--text-muted)">ha</span>
                    </div>
                  </div>
                </div>

                <div className="h-10 w-px bg-(--border-strong)" />

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-(--accent-subtle) border border-(--accent-subtle) text-(--accent) flex items-center justify-center">
                    <Unlock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-(--text-secondary) uppercase font-bold tracking-wider mb-0.5">
                      Free to Re-plant
                    </div>
                    <div className="text-[18px] font-extrabold text-(--accent) tabular-nums leading-none">
                      {Math.round(baseline.freeToReplantHa).toLocaleString()}{' '}
                      <span className="text-[14px] font-medium opacity-80">ha</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DataCoverage audit={dataAudit} />

          {/* --------------------- charts + data quality --------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* land type */}
            <div className="bg-(--surface-card) p-6 rounded-[16px] border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-[15px] font-extrabold text-(--text-primary)">
                    Land Type Distribution
                  </h4>
                  <p className="text-[13px] text-(--text-muted) mt-1">
                    Topography dictates flooding risk
                  </p>
                </div>
                <TableViewToggle isTableView={isLandTable} onToggle={setIsLandTable} />
              </div>

              <div className="h-56 w-full mb-4 relative">
                {isLandTable ? (
                  <div className="h-full overflow-y-auto border border-(--border) rounded-xl">
                    <table className="app-table">
                      <thead>
                        <tr>
                          <th className="text-left">Classification</th>
                          <th className="text-right">Area (ha)</th>
                          <th className="text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {landTypeData.map((d) => (
                          <tr key={d.name}>
                            <td className="font-bold text-(--text-primary)">{d.name}</td>
                            <td className="text-right tabular-nums text-(--text-secondary)">
                              {Math.round(d.value).toLocaleString()}
                            </td>
                            <td className="text-right tabular-nums font-bold text-(--text-primary)">
                              {d.pct}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    {/* total sits in the donut hole rather than leaving it empty */}
                    {/* The donut is the land-type split, so it must show the area
                        that split was measured on - not the whole command area,
                        which would not match the two slices. */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                      <span className="text-[22px] font-extrabold text-(--text-primary) tabular-nums tracking-tight">
                        {Math.round(landBasisHa).toLocaleString()}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-(--text-muted) mt-0.5">
                        hectares
                      </span>
                      {landUnrecordedHa > 0 && (
                        <span className="text-[9.5px] leading-tight text-(--text-muted) mt-1">
                          where land type
                          <br />
                          was recorded
                        </span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={landTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="var(--surface-card)"
                          strokeWidth={2}
                        >
                          {landTypeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const item: any = payload[0];
                              return (
                                <div className="bg-(--surface-card) border border-(--border-strong) shadow-(--shadow-md) rounded-xl p-3 text-[13px]">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span
                                      className="w-3 h-3 rounded-full shrink-0"
                                      style={{ backgroundColor: item.payload?.color }}
                                    />
                                    <span className="font-bold text-(--text-primary)">{item.name}</span>
                                  </div>
                                  <div className="text-(--text-secondary) tabular-nums">
                                    {Math.round(Number(item.value)).toLocaleString()} ha ({item.payload?.pct})
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-(--border)">
                {landTypeData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <div className="min-w-0">
                      <span className="text-[12px] font-bold text-(--text-primary) uppercase tracking-wider">
                        {d.name}
                      </span>
                      <span className="text-[12px] text-(--text-muted) block tabular-nums mt-0.5">
                        {Math.round(d.value).toLocaleString()} ha ({d.pct})
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {landUnrecordedHa > 0 && (
                <p className="text-[11px] text-(--text-muted) leading-snug mt-3 pt-3 border-t border-(--border)">
                  A further <strong className="text-(--text-secondary) tabular-nums">
                    {Math.round(landUnrecordedHa).toLocaleString()} ha
                  </strong>{' '}
                  of ratoon carries no land type in the ERP and is excluded from this split
                  rather than counted as upland.
                </p>
              )}
            </div>

            {/* crop type */}
            <div className="bg-(--surface-card) p-6 rounded-[16px] border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-[15px] font-extrabold text-(--text-primary)">
                    Crop Type Breakdown
                  </h4>
                  <p className="text-[13px] text-(--text-muted) mt-1">Plant vs ratoon progression</p>
                </div>
                <TableViewToggle isTableView={isCropTable} onToggle={setIsCropTable} />
              </div>

              <div className="h-56 w-full mb-4">
                {isCropTable ? (
                  <div className="h-full overflow-y-auto border border-(--border) rounded-xl">
                    <table className="app-table">
                      <thead>
                        <tr>
                          <th className="text-left">Cycle</th>
                          <th className="text-right">Area (ha)</th>
                          <th className="text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cropTypeData.map((d) => (
                          <tr key={d.name}>
                            <td className="font-bold text-(--text-primary)">{d.name}</td>
                            <td className="text-right tabular-nums text-(--text-secondary)">
                              {Math.round(d.hectares).toLocaleString()}
                            </td>
                            <td className="text-right tabular-nums font-bold text-(--text-primary)">
                              {d.pct}
                            </td>
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
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-secondary)' }}
                        width={75}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'var(--surface-sunken)', opacity: 0.6 }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const item: any = payload[0];
                            return (
                              <div className="bg-(--surface-card) border border-(--border-strong) shadow-(--shadow-md) rounded-xl p-3 text-[13px]">
                                <div className="font-bold text-(--text-primary) mb-1.5 uppercase tracking-wider text-[11px]">
                                  {item.payload?.name}
                                </div>
                                <div className="text-(--text-secondary) tabular-nums">
                                  {Math.round(Number(item.value)).toLocaleString()} ha ({item.payload?.pct})
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="hectares" fill={palette[2]} radius={[0, 6, 6, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-(--border) text-[13px]">
                <span className="text-(--text-secondary)">
                  Fresh:{' '}
                  <strong className="text-(--text-primary) tabular-nums ml-1">
                    {Math.round(
                      baseline.cropTypeSplit.plantHa + baseline.cropTypeSplit.autumnHa
                    ).toLocaleString()}{' '}
                    ha
                  </strong>
                </span>
                <div className="w-px h-4 bg-(--border)" />
                <span className="text-(--text-secondary)">
                  Ratoon:{' '}
                  <strong className="text-(--text-primary) tabular-nums ml-1">
                    {Math.round(
                      baseline.cropTypeSplit.ratoonHa + baseline.cropTypeSplit.ratoonIIHa
                    ).toLocaleString()}{' '}
                    ha
                  </strong>
                </span>
              </div>
            </div>

            {/* data quality - driven entirely by baseline.dataQualityFlags */}
            <div className="bg-(--surface-card) p-6 rounded-[16px] border border-(--border) shadow-(--shadow-sm) flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[15px] font-extrabold text-(--text-primary) flex items-center gap-2">
                    <AlertTriangle
                      className={`w-4 h-4 ${criticalFlags > 0 ? 'text-rose-500' : 'text-amber-500'}`}
                    />
                    <span>Quality Audit</span>
                  </h4>
                  <span
                    className={`px-2.5 py-1 font-bold text-[11px] rounded-md border ${
                      baseline.dataQualityFlags.length === 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400'
                    }`}
                  >
                    {baseline.dataQualityFlags.length}{' '}
                    {baseline.dataQualityFlags.length === 1 ? 'Flag' : 'Flags'}
                  </span>
                </div>
                <p className="text-[13px] text-(--text-muted) mb-4">
                  Validation of the ingested records against mill boundaries
                </p>
              </div>

              <div className="space-y-3 mb-4 overflow-y-auto pr-1 flex-1">
                {baseline.dataQualityFlags.length === 0 && (
                  <div className="flex items-start gap-3 p-3 bg-(--surface-sunken) rounded-xl border border-(--border) text-[13px]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-(--text-primary)">No issues found</span>
                      <p className="text-[12px] text-(--text-secondary) mt-1">
                        Every record passed validation.
                      </p>
                    </div>
                  </div>
                )}

                {baseline.dataQualityFlags.map((flag, i) => {
                  const critical = flag.severity === 'critical';
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-[13px] transition-colors ${
                        critical
                          ? 'bg-rose-50/50 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/30'
                          : 'bg-(--surface-sunken) border-(--border) hover:bg-(--surface-page)'
                      }`}
                    >
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          critical ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600'
                        }`}
                      />
                      <div className="min-w-0">
                        <span
                          className={`font-bold ${
                            critical ? 'text-rose-700 dark:text-rose-400' : 'text-(--text-primary)'
                          }`}
                        >
                          {flag.title}
                        </span>
                        <p
                          className={`text-[12px] mt-1 leading-snug ${
                            critical
                              ? 'text-rose-600/80 dark:text-rose-400/80'
                              : 'text-(--text-secondary)'
                          }`}
                        >
                          {flag.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[12px] flex items-center justify-between pt-4 border-t border-(--border)">
                <span className="text-(--text-secondary) font-medium">
                  Clean:{' '}
                  <span className="tabular-nums font-bold text-(--text-primary)">
                    {baseline.cleanRecords.toLocaleString()}
                  </span>
                  <span className="text-(--text-muted) ml-1">
                    ({((baseline.cleanRecords / baseline.totalRecords) * 100).toFixed(1)}%)
                  </span>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ready</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Every headline figure can be opened up - the number is never a dead end. */}
      <MetricDetailModal
        open={detail === 'villages' || detail === 'fields' || detail === 'growers' || detail === 'area'}
        onClose={() => setDetail(null)}
        title={
          detail === 'fields' ? 'Fields by village'
          : detail === 'growers' ? 'Growers by village'
          : detail === 'area' ? 'Area by village'
          : 'Villages'
        }
        subtitle={`${villageRows.length.toLocaleString()} villages in the survey`}
        rows={villageRows}
        searchKeys={['name', 'society']}
        initialSort={detail === 'growers' ? 'growers' : detail === 'fields' ? 'fields' : 'areaHa'}
        columns={[
          { key: 'name', label: 'Village' },
          { key: 'society', label: 'Society' },
          { key: 'areaHa', label: 'Area (ha)', numeric: true,
            format: (r) => r.areaHa.toLocaleString() },
          { key: 'fields', label: 'Fields', numeric: true,
            format: (r) => r.fields.toLocaleString() },
          { key: 'growers', label: 'Growers', numeric: true,
            format: (r) => r.growers.toLocaleString() },
        ] as DetailColumn<(typeof villageRows)[number]>[]}
      />

      <MetricDetailModal
        open={detail === 'societies'}
        onClose={() => setDetail(null)}
        title="Co-operative societies"
        subtitle={`${societyRows.length} societies in the survey`}
        rows={societyRows}
        searchKeys={['name']}
        initialSort="areaHa"
        columns={[
          { key: 'name', label: 'Society' },
          { key: 'areaHa', label: 'Area (ha)', numeric: true,
            format: (r) => r.areaHa.toLocaleString() },
          { key: 'villages', label: 'Villages', numeric: true },
          { key: 'fields', label: 'Fields', numeric: true,
            format: (r) => r.fields.toLocaleString() },
          { key: 'growers', label: 'Growers', numeric: true,
            format: (r) => r.growers.toLocaleString() },
        ] as DetailColumn<(typeof societyRows)[number]>[]}
      />

      <MetricDetailModal
        open={detail === 'varieties'}
        onClose={() => setDetail(null)}
        title="Cane varieties"
        subtitle={`${varietyRows.length} distinct varieties found in the survey`}
        rows={varietyRows}
        searchKeys={['name']}
        initialSort="areaHa"
        columns={[
          { key: 'name', label: 'Variety' },
          { key: 'areaHa', label: 'Area (ha)', numeric: true,
            format: (r) => r.areaHa.toLocaleString() },
          { key: 'records', label: 'Records', numeric: true,
            format: (r) => r.records.toLocaleString() },
          { key: 'lowlandSharePct', label: 'On lowland', numeric: true,
            format: (r) => `${r.lowlandSharePct.toFixed(1)}%` },
        ] as DetailColumn<(typeof varietyRows)[number]>[]}
      />
    </div>
  );
};
