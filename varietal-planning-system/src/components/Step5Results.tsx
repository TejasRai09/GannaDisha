import React, { useState } from 'react';
import {
  VarietyRecord,
  ParametersState,
  VarietyStrategySetting,
  YearProjectionItem,
  VarietySeedBalance,
  ComplianceCheck,
  SavedScenario,
} from '../types';
import { ProvisionalNotice } from './ProvisionalNotice';
import { ScenarioCompareModal } from './ScenarioCompareModal';
import { AnimatedMetricCard } from './AnimatedMetricCard';
import { TableViewToggle } from './TableViewToggle';
import { CHART_PALETTE } from '../utils/theme';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookmarkPlus,
  GitCompare,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  ShieldCheck,
  Scale,
  Droplets,
  Sprout,
  Coins,
  Sparkles,
  Download,
} from 'lucide-react';
import { useToast } from './Toast';

interface Step5ResultsProps {
  varieties: VarietyRecord[];
  params: ParametersState;
  strategies: Record<string, VarietyStrategySetting>;
  projections: YearProjectionItem[];
  seedBalances: VarietySeedBalance[];
  complianceChecks: ComplianceCheck[];
  warnings: string[];
  savedScenarios: SavedScenario[];
  onSaveScenario: (name: string, desc: string) => void;
  onLoadScenario: (scenario: SavedScenario) => void;
  onProceedToAllocation: () => void;
  /** Fields in the shipped scenario that are placeholders, not mill figures. */
  provisionalFields?: string[];
  isDark?: boolean;
}

// Custom Tooltip for Recharts meeting strict design requirements
const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-(--surface-card) p-3 rounded-[10px] border border-(--border-strong) shadow-(--shadow-md) text-[12px] min-w-[200px]">
      <div className="font-bold text-(--text-primary) border-b border-(--border) pb-1.5 mb-2 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] font-mono text-(--text-muted)">Command Breakdown</span>
      </div>
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-(--text-secondary) text-[11px] truncate font-medium">
                {entry.name}
              </span>
            </div>
            <span className="font-bold text-(--text-primary) tabular-nums text-[11px] font-mono">
              {Number(entry.value).toLocaleString()} ha
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Step5Results: React.FC<Step5ResultsProps> = ({
  varieties,
  params,
  strategies,
  projections,
  seedBalances,
  complianceChecks,
  warnings,
  savedScenarios,
  onSaveScenario,
  onLoadScenario,
  onProceedToAllocation,
  provisionalFields,
  isDark = false,
}) => {
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'chart' | 'table'>('chart');
  const { showToast } = useToast();

  const baseItem = projections[0] || {
    blendedSucrosePct: 12.8,
    estimatedRecoveryPct: 9.8,
    totalAreaHa: params.commandAreaHa,
    year: 'Base',
    varietyBreakdown: {},
    caneDivertedToSeedTonnes: 0,
  };
  const y3Item = projections[3] ||
    projections[projections.length - 1] || {
      blendedSucrosePct: 13.9,
      estimatedRecoveryPct: 10.9,
      totalAreaHa: params.commandAreaHa,
      year: 'Year 3',
      varietyBreakdown: {},
      caneDivertedToSeedTonnes: 0,
    };

  // projections[0] is the base season, so Year 1 is index 1.
  const y1Item = projections[1] || baseItem;

  const sucroseDelta = (y3Item.blendedSucrosePct - baseItem.blendedSucrosePct).toFixed(2);
  const recoveryDelta = (y3Item.estimatedRecoveryPct - baseItem.estimatedRecoveryPct).toFixed(2);

  // What a recovery change is worth. Crush tonnage and sugar price were hardcoded
  // here as 13,50,000 MT and Rs 38/kg; they are mill figures, so they belong in
  // Step 3 where they can be seen and changed.
  const totalCaneCrushedMT = params.annualCaneCrushMT;
  const incrementalSugarMT = totalCaneCrushedMT * (Number(recoveryDelta) / 100);
  const incrementalRevenueCr = (
    (incrementalSugarMT * 1000 * params.sugarPriceRsPerKg) / 10000000
  ).toFixed(1);

  // Seed cane set aside for Year 1, taken from the projection's own figure.
  //
  // This used to sum seedBalances.seedRequiredQtl, which is a different
  // quantity: that column counts only the seed the MILL has to supply, and the
  // engine holds that a variety farmers already grow supplies its own. Every
  // variety in the survey is already out there, so the sum was zero and the
  // card read "0 qtl - ~0 MT cane set aside" under a plan that replants some
  // thirty thousand hectares. The projection counts every hectare replanted,
  // whoever the seed comes from, which is what this card claims to show.
  const totalSeedDivertedQtl = Math.round((y1Item.caneDivertedToSeedTonnes || 0) * 10);

  // Format chart data
  const chartData = projections.map((p) => {
    const item: any = {
      name: p.year,
      total: p.totalAreaHa,
    };
    varieties.forEach((v) => {
      item[v.name] = p.varietyBreakdown?.[v.id] || 0;
    });
    return item;
  });

  const year3AreaMap = y3Item.varietyBreakdown || {};

  const getDirectionIndicator = (baseVal: number, y3Val: number) => {
    const diff = y3Val - baseVal;
    if (diff > 500)
      return (
        <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 text-[12px] font-bold">
          <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
          +{Math.round(diff).toLocaleString()}
        </span>
      );
    if (diff < -500)
      return (
        <span className="inline-flex items-center text-rose-600 dark:text-rose-400 text-[12px] font-bold">
          <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
          {Math.round(diff).toLocaleString()}
        </span>
      );
    return (
      <span className="inline-flex items-center text-(--text-muted) text-[12px]">
        <Minus className="w-3.5 h-3.5 mr-0.5" />
        Stable
      </span>
    );
  };

  const handleExportCSV = () => {
    const headers = ['Variety', 'Suitability', 'Sucrose %', 'Base (ha)', 'Year 1 (ha)', 'Year 2 (ha)', 'Year 3 (ha)'];
    const rows = varieties.map((v) => [
      v.name,
      v.landSuitability,
      v.juiceSucrosePct,
      projections[0]?.varietyBreakdown?.[v.id] || 0,
      projections[1]?.varietyBreakdown?.[v.id] || 0,
      projections[2]?.varietyBreakdown?.[v.id] || 0,
      projections[3]?.varietyBreakdown?.[v.id] || 0,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `varietal_plan_projection_${params.baseYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Plan Exported', 'success', 'Varietal projection table exported as CSV.');
  };

  return (
    <div className="space-y-6 pb-28 screen-fade-in">
      <ProvisionalNotice
        fields={provisionalFields}
        consequence="Recovery and the money figure below move with them, so treat both as an illustration of the method rather than a forecast."
      />

      {/* Screen Header */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-bold text-(--text-primary) tracking-tight">
              Step 5: Dynamic Projections & Mill Yield Results
            </h2>
            <span className="app-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
              Crushing Season Horizon
            </span>
          </div>
          <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
            Multi-year sugar recovery trajectories, variety turnover kinetics, and full biosecurity compliance auditing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="btn-secondary"
            title="Download CSV report"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsScenarioModalOpen(true)}
            className="btn-secondary"
          >
            <GitCompare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Compare Scenarios ({savedScenarios.length})</span>
          </button>

          <button
            type="button"
            onClick={onProceedToAllocation}
            className="btn-primary"
          >
            <span>Proceed to Village Allocation</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Animated Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatedMetricCard
          label="Blended Sucrose (Y3)"
          value={y3Item.blendedSucrosePct}
          decimals={2}
          unit="%"
          subtext={`Base: ${baseItem.blendedSucrosePct.toFixed(2)}% (${Number(sucroseDelta) >= 0 ? '+' : ''}${sucroseDelta}%)`}
          trend={Number(sucroseDelta) >= 0 ? 'up' : 'down'}
          icon={<Droplets className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        />

        <AnimatedMetricCard
          label="Est. Sugar Recovery (Y3)"
          value={y3Item.estimatedRecoveryPct}
          decimals={2}
          unit="%"
          subtext={`Base: ${baseItem.estimatedRecoveryPct.toFixed(2)}% (${Number(recoveryDelta) >= 0 ? '+' : ''}${recoveryDelta}%)`}
          trend={Number(recoveryDelta) >= 0 ? 'up' : 'down'}
          icon={<Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        />

        <AnimatedMetricCard
          label="Seed Diverted (Year 1)"
          value={totalSeedDivertedQtl}
          decimals={0}
          unit="qtl"
          subtext={`~${Math.round(totalSeedDivertedQtl / 10).toLocaleString()} MT cane set aside`}
          trend="neutral"
          icon={<Sprout className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
        />

        <AnimatedMetricCard
          label="Command Hectare Target"
          value={y3Item.totalAreaHa}
          decimals={0}
          unit="ha"
          subtext={`Target: ${params.commandAreaHa.toLocaleString()} ha (100% bonded)`}
          trend="neutral"
          icon={<ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
        />
      </div>

      {/* Economic Value Banner */}
      {Number(recoveryDelta) > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-[12px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-[14px] font-bold text-(--text-primary)">
                Projected Mill Value Creation: +₹{incrementalRevenueCr} Crores / Crushing Season
              </h4>
              <p className="text-[12px] text-(--text-secondary)">
                A +{recoveryDelta}% recovery boost across {(totalCaneCrushedMT / 100000).toFixed(1)} Lakh MT cane produces approx. <strong>+{Math.round(incrementalSugarMT).toLocaleString()} MT</strong> additional refined sugar, at Rs {params.sugarPriceRsPerKg}/kg.
              </p>
            </div>
          </div>
          <span className="app-chip bg-emerald-600 text-white font-semibold self-end sm:self-auto shrink-0">
            High ROI Plan
          </span>
        </div>
      )}

      {/* Compliance Panel with Pass/Fail Chips */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-(--text-primary) flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mill Compliance & Agronomic Safety Directives</span>
          </h3>
          <span className="text-[12px] text-(--text-secondary) font-medium">
            Status:{' '}
            <strong
              className={
                complianceChecks.every((c) => c.passed)
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }
            >
              {complianceChecks.filter((c) => c.passed).length} of {complianceChecks.length} Passed
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {complianceChecks.map((check) => (
            <div
              key={check.id}
              className={`p-3.5 rounded-[10px] border flex items-start gap-2.5 transition-colors ${
                check.passed
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-(--text-primary)'
                  : 'bg-rose-500/5 border-rose-500/20 text-(--text-primary)'
              }`}
            >
              {check.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13px] font-bold truncate">{check.label}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                      check.passed
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {check.passed ? 'Pass' : 'Fail'}
                  </span>
                </div>
                <div className="text-[12px] text-(--text-secondary) mt-0.5 tabular-nums">
                  Actual: <strong className="text-(--text-primary) font-mono">{check.actual}</strong> (
                  {check.threshold})
                </div>
                <p className="text-[11px] text-(--text-muted) mt-0.5 leading-tight">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Large Stacked Area Chart with Table View Toggle */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm)">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-3 border-b border-(--border) gap-3">
          <div>
            <h3 className="text-[14px] font-bold text-(--text-primary)">
              3-Year Varietal Area Evolution (Stacked Hectares)
            </h3>
            <p className="text-[12px] text-(--text-secondary)">
              Varietal substitution kinetics and monoculture diversification progress
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[12px] text-(--text-muted) tabular-nums font-mono hidden sm:inline">
              Command: {params.commandAreaHa.toLocaleString()} ha
            </span>
            <TableViewToggle view={chartViewMode} onViewChange={setChartViewMode} />
          </div>
        </div>

        {chartViewMode === 'chart' ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {varieties.map((v, idx) => {
                    const color = CHART_PALETTE[idx % CHART_PALETTE.length];
                    return (
                      <linearGradient key={`grad-${v.id}`} id={`grad-${v.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.2} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 'dataMax + 2000']}
                />
                <RechartsTooltip content={<CustomChartTooltip />} />
                {varieties.map((v, idx) => (
                  <Area
                    key={v.id}
                    type="monotone"
                    dataKey={v.name}
                    stackId="1"
                    stroke={CHART_PALETTE[idx % CHART_PALETTE.length]}
                    strokeWidth={1.5}
                    fill={`url(#grad-${v.id})`}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>

            {/* Custom Horizontal Legend with dots */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3 border-t border-(--border) mt-2">
              {varieties.map((v, idx) => (
                <div key={v.id} className="flex items-center gap-1.5 text-[11px] text-(--text-secondary)">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                  />
                  <span>{v.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-left">Year</th>
                  <th className="text-right">Total Area</th>
                  {varieties.map((v) => (
                    <th key={v.id} className="text-right whitespace-nowrap">
                      {v.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr key={row.name}>
                    <td className="font-bold text-(--text-primary)">{row.name}</td>
                    <td className="text-right tabular-nums font-bold text-(--text-primary) font-mono">
                      {Number(row.total).toLocaleString()} ha
                    </td>
                    {varieties.map((v) => (
                      <td key={v.id} className="text-right tabular-nums text-(--text-secondary) font-mono">
                        {Number(row[v.name] || 0).toLocaleString()} ha
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Projection Table with Hectares, % Share & Trend Arrow */}
      <div className="bg-(--surface-card) rounded-[12px] border border-(--border) shadow-(--shadow-sm) overflow-hidden">
        <div className="p-4 border-b border-(--border) flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-(--text-primary)">
              Varietal Distribution Table across Horizon
            </h3>
            <p className="text-[12px] text-(--text-secondary)">
              Hectares, command percentage share, and trajectory trend
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr>
                <th className="text-left">Variety</th>
                <th className="text-left">Land Suitability</th>
                <th className="text-right">Sucrose %</th>
                <th className="text-right">Base (2026-27)</th>
                <th className="text-right">Year 1</th>
                <th className="text-right">Year 2</th>
                <th className="text-right">Year 3</th>
                <th className="text-center">Trend</th>
              </tr>
            </thead>
            <tbody>
              {varieties.map((v) => {
                const baseHa = projections[0]?.varietyBreakdown?.[v.id] || 0;
                const y1Ha = projections[1]?.varietyBreakdown?.[v.id] || 0;
                const y2Ha = projections[2]?.varietyBreakdown?.[v.id] || 0;
                const y3Ha = projections[3]?.varietyBreakdown?.[v.id] || 0;

                const baseTotal = projections[0]?.totalAreaHa || 1;
                const y1Total = projections[1]?.totalAreaHa || 1;
                const y2Total = projections[2]?.totalAreaHa || 1;
                const y3Total = projections[3]?.totalAreaHa || 1;

                return (
                  <tr key={v.id}>
                    <td className="font-bold text-(--text-primary)">
                      <span>{v.name}</span>
                    </td>
                    <td className="text-(--text-secondary)">{v.landSuitability}</td>
                    <td className="text-right tabular-nums text-(--text-secondary) font-mono">
                      {v.juiceSucrosePct}%
                    </td>

                    {/* Base */}
                    <td className="text-right tabular-nums">
                      <span className="font-medium text-(--text-primary) font-mono">
                        {baseHa.toLocaleString()} ha
                      </span>
                      <span className="block text-[11px] text-(--text-muted) font-mono">
                        {((baseHa / baseTotal) * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Y1 */}
                    <td className="text-right tabular-nums">
                      <span className="font-medium text-(--text-primary) font-mono">
                        {y1Ha.toLocaleString()} ha
                      </span>
                      <span className="block text-[11px] text-(--text-muted) font-mono">
                        {((y1Ha / y1Total) * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Y2 */}
                    <td className="text-right tabular-nums">
                      <span className="font-medium text-(--text-primary) font-mono">
                        {y2Ha.toLocaleString()} ha
                      </span>
                      <span className="block text-[11px] text-(--text-muted) font-mono">
                        {((y2Ha / y2Total) * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Y3 */}
                    <td className="text-right tabular-nums">
                      <span className="font-bold text-(--text-primary) font-mono">
                        {y3Ha.toLocaleString()} ha
                      </span>
                      <span className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {((y3Ha / y3Total) * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Direction Arrow */}
                    <td className="text-center">{getDirectionIndicator(baseHa, y3Ha)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seed Balance Table (Year 1 Planting) */}
      <div className="bg-(--surface-card) rounded-[12px] border border-(--border) shadow-(--shadow-sm) overflow-hidden">
        <div className="p-4 border-b border-(--border) flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-(--text-primary)">
              Year 1 Seed Stock & Requirement Balance
            </h3>
            <p className="text-[12px] text-(--text-secondary)">
              Seed cane logistics check for fresh planting targets
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr>
                <th className="text-left">Variety</th>
                <th className="text-right">Area to Plant</th>
                <th className="text-right">Seed Required</th>
                <th className="text-right">Seed Available</th>
                <th className="text-right">Surplus / Shortfall</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {seedBalances.map((b) => {
                const isDeficit = b.balanceQtl < 0 && b.areaToPlantHa > 0;
                return (
                  <tr key={b.varietyId} className={isDeficit ? 'bg-rose-500/5' : ''}>
                    <td className="font-bold text-(--text-primary)">{b.varietyName}</td>
                    <td className="text-right tabular-nums text-(--text-secondary) font-mono">
                      {b.areaToPlantHa.toLocaleString()} ha
                    </td>
                    <td className="text-right tabular-nums text-(--text-secondary) font-mono">
                      {b.seedRequiredQtl.toLocaleString()} qtl
                    </td>
                    <td className="text-right tabular-nums font-medium text-(--text-primary) font-mono">
                      {b.seedAvailableQtl.toLocaleString()} qtl
                    </td>
                    <td
                      className={`text-right tabular-nums font-bold font-mono ${
                        b.balanceQtl >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {b.balanceQtl >= 0
                        ? `+${b.balanceQtl.toLocaleString()}`
                        : b.balanceQtl.toLocaleString()}{' '}
                      qtl
                    </td>
                    <td className="text-center">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase ${
                          b.statusText === 'Surplus'
                            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                            : b.statusText === 'Adequate'
                            ? 'bg-blue-500/12 text-blue-700 dark:text-blue-400'
                            : b.statusText === 'Zero Seed'
                            ? 'bg-purple-500/12 text-purple-700 dark:text-purple-400'
                            : 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {b.statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warnings List in Plain Language */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-3">
        <h3 className="text-[14px] font-bold text-(--text-primary) flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>Agronomic Insights & Operations Advisories</span>
        </h3>

        <div className="space-y-2">
          {warnings.map((w, idx) => (
            <div
              key={idx}
              className="p-3 bg-amber-500/8 border border-amber-500/20 rounded-[10px] text-[12px] text-(--text-primary) flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{w}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario Compare & Save Modal */}
      <ScenarioCompareModal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        savedScenarios={savedScenarios}
        currentParams={params}
        currentStrategies={strategies}
        varieties={varieties}
        currentYear3Area={year3AreaMap}
        currentBlendedSucroseY3={y3Item.blendedSucrosePct}
        onSaveScenario={onSaveScenario}
        onLoadScenario={onLoadScenario}
      />
    </div>
  );
};
