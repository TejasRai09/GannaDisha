import React, { useState } from 'react';
import {
  VarietyRecord,
  ParametersState,
  VarietyStrategySetting,
  StrategyMode,
  VarietyStrategy,
  SeedRetentionPreset,
  YearProjectionItem,
  VarietySeedBalance,
} from '../types';
import { Tooltip } from './Tooltip';
import {
  Target,
  Dna,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Zap,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Sprout,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from './Toast';
import { getMaxReachableHa } from '../engine/calculations';

interface Step4StrategyProps {
  varieties: VarietyRecord[];
  params: ParametersState;
  strategies: Record<string, VarietyStrategySetting>;
  onChangeStrategies: (newStrategies: Record<string, VarietyStrategySetting>) => void;
  mode: StrategyMode;
  onToggleMode: (newMode: StrategyMode) => void;
  projections: YearProjectionItem[];
  seedBalances: VarietySeedBalance[];
  onProceedToResults: () => void;
  isDark?: boolean;
}

/**
 * A four-point sparkline drawn as plain SVG.
 *
 * This was a recharts <ResponsiveContainer><LineChart> per variety - 86 of them
 * on screen, each with its own ResizeObserver, all re-rendering on every click.
 * Changing one strategy took three to four seconds. For four points and one
 * line, a polyline is the right tool.
 */
const Sparkline: React.FC<{ points: { ha: number }[]; colour: string }> = ({ points, colour }) => {
  if (points.length < 2) return <div className="w-24 h-9" />;
  const vals = points.map((p) => p.ha);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 96, H = 36, PAD = 3;
  const d = points
    .map((p, i) => {
      const x = PAD + (i * (W - PAD * 2)) / (points.length - 1);
      const y = H - PAD - ((p.ha - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} className="w-24 h-9 overflow-visible" aria-hidden="true">
      <polyline points={d} fill="none" stroke={colour} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const Step4Strategy: React.FC<Step4StrategyProps> = ({
  varieties,
  params,
  strategies,
  onChangeStrategies,
  mode,
  onToggleMode,
  projections,
  seedBalances,
  onProceedToResults,
  isDark = false,
}) => {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const { showToast } = useToast();
  const horizon = Math.max(1, Math.min(5, Math.round(params.planningHorizonYears || 3)));

  const toggleExpand = (id: string) => {
    setExpandedCardId(expandedCardId === id ? null : id);
  };

  const updateVarietyStrategy = (
    varietyId: string,
    updates: Partial<VarietyStrategySetting>
  ) => {
    const current = strategies[varietyId] || {
      varietyId,
      strategy: 'EXPAND',
      retentionPreset: 'BALANCED',
      retentionPct: 50,
    };

    const updated = {
      ...current,
      ...updates,
    };

    onChangeStrategies({
      ...strategies,
      [varietyId]: updated,
    });
  };

  /** Write one year's target hectares for one variety. */
  const setTarget = (v: VarietyRecord, yearIdx: number, value: number) => {
    const strat = strategies[v.id] || {
      varietyId: v.id, strategy: v.strategy, retentionPreset: 'BALANCED' as SeedRetentionPreset, retentionPct: 50,
    };
    const next = [...(strat.targetsHa ?? [])];
    while (next.length < horizon) next.push(Math.round(v.currentAreaHa));
    next[yearIdx] = Math.max(0, Math.round(value));
    onChangeStrategies({ ...strategies, [v.id]: { ...strat, targetsHa: next } });
  };

  const handlePresetSelect = (varietyId: string, preset: SeedRetentionPreset) => {
    let pct = 50;
    if (preset === 'AGGRESSIVE') pct = 100;
    else if (preset === 'BALANCED') pct = 50;
    else if (preset === 'MATURE') pct = 25;
    else pct = 40;

    updateVarietyStrategy(varietyId, {
      retentionPreset: preset,
      retentionPct: pct,
    });
  };

  /**
   * Portfolio presets.
   *
   * These used to test hardcoded variety names such as "Co 0118". The survey
   * spells it "CO 0118", so the match never fired and the phase-out preset
   * exited one variety while expanding nothing - reporting success either way.
   * They now read Step 2's data instead, so they work on whatever the survey
   * actually contains rather than on a list written a year ago.
   */
  const applyStrategicPreset = (presetName: 'phase_out_susceptible' | 'balanced' | 'high_sugar') => {
    const newStrategies = { ...strategies };
    const set = (v: VarietyRecord, strategy: VarietyStrategy, preset: SeedRetentionPreset, pct: number) => {
      newStrategies[v.id] = { varietyId: v.id, strategy, retentionPreset: preset, retentionPct: pct };
    };

    if (presetName === 'phase_out_susceptible') {
      const susceptible = varieties.filter((v) => v.redRot === 'S');
      if (!susceptible.length) {
        showToast(
          varieties.some((v) => v.redRot)
            ? 'No susceptible varieties'
            : 'Red rot data not filled in',
          'info',
          varieties.some((v) => v.redRot)
            ? 'Nothing is marked S for red rot, so there is nothing to phase out.'
            : 'Fill the Red Rot column on the Step 2 sheet, then try this again.'
        );
        return;
      }
      // The replacements are the resistant varieties already at real scale - the
      // ones that can absorb the area being given up.
      const replacements = varieties
        .filter((v) => (v.redRot === 'R' || v.redRot === 'MR') && v.currentAreaHa > 100)
        .sort((a, b) => b.currentAreaHa - a.currentAreaHa)
        .slice(0, 5);

      susceptible.forEach((v) => set(v, 'EXIT', 'MATURE', 15));
      replacements.forEach((v) => set(v, 'EXPAND', 'AGGRESSIVE', 100));
      onChangeStrategies(newStrategies);
      showToast(
        'Phase-out applied',
        'success',
        `${susceptible.length} susceptible ${susceptible.length === 1 ? 'variety' : 'varieties'} set to EXIT, ` +
          `${replacements.length} resistant set to EXPAND at 100% retention.`
      );
      return;
    }

    if (presetName === 'high_sugar') {
      const known = varieties.filter((v) => v.juiceSucrosePct > 0);
      if (!known.length) {
        showToast('Sucrose data not filled in', 'info',
          'Fill the Juice Sucrose column on the Step 2 sheet, then try this again.');
        return;
      }
      const high = known.filter((v) => v.juiceSucrosePct >= 18.0);
      if (!high.length) {
        showToast('Nothing above 18% sucrose', 'info',
          `Highest recorded is ${Math.max(...known.map((v) => v.juiceSucrosePct)).toFixed(1)}%.`);
        return;
      }
      high.forEach((v) => set(v, 'EXPAND', 'AGGRESSIVE', 100));
      onChangeStrategies(newStrategies);
      showToast('High sugar preset applied', 'success',
        `${high.length} ${high.length === 1 ? 'variety' : 'varieties'} at or above 18% sucrose set to EXPAND.`);
      return;
    }

    varieties.forEach((v) => set(v, v.strategy, 'BALANCED', 50));
    onChangeStrategies(newStrategies);
    showToast('Balanced transition restored', 'info',
      `All ${varieties.length} varieties set to 50% seed retention.`);
  };

  // Sparkline data generator for a specific variety
  const getSparklineData = (varietyId: string) => {
    return projections.map((p) => ({
      name: p.year.replace('Base (2026-27)', 'Base'),
      ha: p.varietyBreakdown?.[varietyId] || 0,
    }));
  };

  const getStrategyBadgeClass = (strat: string) => {
    switch (strat) {
      case 'EXPAND':
        return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30';
      case 'EXIT':
        return 'bg-rose-500/12 text-rose-700 dark:text-rose-400 border border-rose-500/30';
      case 'HOLD':
        return 'bg-slate-500/12 text-(--text-secondary) border border-slate-500/20';
      case 'REDUCE':
        return 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/30';
      case 'INTRODUCE-NEW':
        return 'bg-blue-500/12 text-blue-700 dark:text-blue-400 border border-blue-500/30';
      default:
        return 'bg-slate-500/12 text-(--text-secondary)';
    }
  };

  return (
    <div className="space-y-6 pb-28 screen-fade-in">
      {/* Screen Header */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-bold text-(--text-primary) tracking-tight">
              Step 4: Varietal Strategy & Seed Retention Matrix
            </h2>
            <span className="app-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
              {mode === 'seed-driven' ? 'Seed-Driven Multiplier Engine' : 'Target Hectare Modeler'}
            </span>
          </div>
          <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
            Direct replacement variety seed budgets to maximize sugar factory recovery while enforcing safe seed multipliers.
          </p>
        </div>

        <button
          type="button"
          onClick={onProceedToResults}
          className="btn-primary shrink-0"
        >
          <span>Calculate Results</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Strategic Presets & Mode Toggle Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Preset Selector */}
        <div className="lg:col-span-7 bg-(--surface-card) p-4 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[12px] font-bold uppercase tracking-wider text-(--text-primary)">
              Quick Strategy Presets:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyStrategicPreset('phase_out_susceptible')}
              className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[12px] font-semibold transition-colors cursor-pointer"
            >
              Phase Out Red-Rot Susceptible
            </button>

            <button
              type="button"
              onClick={() => applyStrategicPreset('high_sugar')}
              className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[12px] font-semibold transition-colors cursor-pointer"
            >
              Expand High Sugar (18%+)
            </button>

            <button
              type="button"
              onClick={() => applyStrategicPreset('balanced')}
              className="px-3 py-1.5 rounded-lg border border-(--border) bg-(--surface-sunken) hover:bg-(--border) text-(--text-primary) text-[12px] font-medium transition-colors cursor-pointer"
            >
              Balanced Transition
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="lg:col-span-5 bg-(--surface-card) p-4 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[12px] font-bold text-(--text-primary)">Mode:</span>
          </div>

          <div className="inline-flex rounded-lg bg-(--surface-sunken) p-0.5 border border-(--border)" id="mode-toggle-group">
            <button
              type="button"
              id="btn-mode-b"
              onClick={() => onToggleMode('seed-driven')}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
                mode === 'seed-driven'
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'text-(--text-secondary) hover:text-(--text-primary)'
              }`}
            >
              Seed-Driven (Recommended)
            </button>

            <button
              type="button"
              id="btn-mode-a"
              onClick={() => onToggleMode('target-driven')}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all cursor-pointer ${
                mode === 'target-driven'
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'text-(--text-secondary) hover:text-(--text-primary)'
              }`}
            >
              Target-Driven
            </button>
          </div>
        </div>
      </div>

      {/* List of Variety Strategy Cards */}
      <div className="space-y-3">
        {varieties.map((v) => {
          const strat = strategies[v.id] || {
            varietyId: v.id,
            strategy: v.strategy,
            retentionPreset: 'BALANCED',
            retentionPct: 50,
          };

          const balance = seedBalances.find((b) => b.varietyId === v.id);
          const hasSeedDeficit = balance && !balance.isFeasible && balance.warningMessage;
          const sparklineData = getSparklineData(v.id);
          const isExpanded = expandedCardId === v.id;
          const isExit = strat.strategy === 'EXIT';

          const y3Hectares = sparklineData[sparklineData.length - 1]?.ha || 0;
          const growthPct =
            v.currentAreaHa > 0
              ? (((y3Hectares - v.currentAreaHa) / v.currentAreaHa) * 100).toFixed(0)
              : '+New';

          return (
            <div
              key={v.id}
              className={`bg-(--surface-card) rounded-[12px] border transition-all duration-150 shadow-(--shadow-sm) ${
                hasSeedDeficit
                  ? 'border-rose-500/50 bg-rose-500/5'
                  : isExit
                  ? 'border-(--border) opacity-85'
                  : 'border-(--border) hover:border-(--border-strong)'
              }`}
            >
              {/* Card Header Bar */}
              <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold ${
                      isExit
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    <Dna className="w-4 h-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[15px] font-bold text-(--text-primary)">
                        {v.name}
                      </h4>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase ${getStrategyBadgeClass(
                          strat.strategy
                        )}`}
                      >
                        {strat.strategy}
                      </span>
                    </div>
                    <div className="text-[12px] text-(--text-secondary) mt-0.5">
                      Base Area:{' '}
                      <strong className="text-(--text-primary) font-mono">
                        {v.currentAreaHa.toLocaleString()} ha
                      </strong>{' '}
                      • {v.landSuitability} • Sucrose <strong className="text-(--text-primary) font-mono">{v.juiceSucrosePct}%</strong>
                    </div>
                  </div>
                </div>

                {/* Target hectares - the whole point of target-driven mode, and the
                    only place strat.targetsHa is ever written. Without these inputs
                    the engine fell back to "hold current area" for every variety, so
                    nothing could ever overreach and no warning could ever fire. */}
                {mode === 'target-driven' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-(--text-muted) hidden sm:inline flex items-center">
                      Target ha:
                      <Tooltip content="Type the hectares you want in each year. The engine will tell you if the variety cannot multiply that fast." />
                    </span>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: horizon }, (_, i) => (
                        <div key={i} className="flex flex-col items-center">
                          <span className="text-[9px] font-bold uppercase text-(--text-muted)">
                            Y{i + 1}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={strat.targetsHa?.[i] ?? Math.round(v.currentAreaHa)}
                            onChange={(e) => setTarget(v, i, Number(e.target.value))}
                            className="w-[74px] px-1.5 py-1 text-center text-[12px] tabular-nums font-semibold rounded-[6px] border border-(--border) bg-(--surface-card) text-(--text-primary) focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] leading-tight text-(--text-muted) hidden lg:block">
                      <span className="block uppercase font-bold">Reachable Y1</span>
                      <span className="font-mono text-[11px] text-(--text-secondary)">
                        {getMaxReachableHa(
                          v.currentAreaHa,
                          params,
                          strat.retentionPct || 50,
                          v.seedAvailableQtl
                        ).toLocaleString()} ha
                      </span>
                    </div>
                  </div>
                )}

                {/* Seed Retention Segmented Control */}
                {mode === 'seed-driven' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-(--text-muted) hidden sm:inline flex items-center">
                    Seed Retention:
                    <Tooltip content="Cane kept as seed cannot be crushed. Higher retention accelerates acreage expansion but yields less sugar in Year 1." />
                  </span>

                  <div className="inline-flex rounded-lg bg-(--surface-sunken) p-0.5 border border-(--border)">
                    {(['AGGRESSIVE', 'BALANCED', 'MATURE', 'CUSTOM'] as SeedRetentionPreset[]).map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handlePresetSelect(v.id, preset)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                            strat.retentionPreset === preset
                              ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                              : 'text-(--text-secondary) hover:text-(--text-primary)'
                          }`}
                        >
                          {preset === 'AGGRESSIVE'
                            ? '100% (STP)'
                            : preset === 'BALANCED'
                            ? '50%'
                            : preset === 'MATURE'
                            ? '25%'
                            : `${strat.retentionPct}%`}
                        </button>
                      )
                    )}
                  </div>
                </div>
                )}

                {/* Mini 3-Year Projection Sparkline */}
                <div className="flex items-center gap-3">
                  <Sparkline points={sparklineData} colour={isExit ? '#EF4444' : '#059669'} />

                  <div className="text-right min-w-[80px] tabular-nums">
                    <span className="text-[10px] text-(--text-muted) block uppercase font-bold">
                      Y3 Projection
                    </span>
                    <span className="text-[13px] font-bold text-(--text-primary) font-mono">
                      {y3Hectares.toLocaleString()} ha
                    </span>
                    <span
                      className={`text-[11px] block font-bold ${
                        isExit
                          ? 'text-rose-600 dark:text-rose-400'
                          : Number(growthPct) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {Number(growthPct) > 0 ? `+${growthPct}%` : `${growthPct}%`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(v.id)}
                    className="p-1 rounded-md hover:bg-(--surface-sunken) text-(--text-muted) hover:text-(--text-primary) transition-colors cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Warning Banner if seed cannot support target */}
              {hasSeedDeficit && (
                <div className="mx-4 mb-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[12px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <strong>Seed Constraint Alert: </strong>
                    {balance?.warningMessage}
                  </div>
                </div>
              )}

              {/* Expandable Details Drawer */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t border-(--border) grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
                  {/* Left Column: Custom Retention & Agronomy Details */}
                  <div className="space-y-3">
                    {strat.retentionPreset === 'CUSTOM' && (
                      <div>
                        <div className="flex justify-between font-medium text-(--text-primary) mb-1.5 text-[12px]">
                          <span>Custom Seed Retention:</span>
                          <span className="text-(--accent) font-semibold tabular-nums font-mono">
                            {strat.retentionPct}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          step="5"
                          value={strat.retentionPct}
                          onChange={(e) =>
                            updateVarietyStrategy(v.id, {
                              retentionPct: parseInt(e.target.value),
                            })
                          }
                          className="w-full accent-(--accent)"
                        />
                      </div>
                    )}

                    <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border)/70 space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-(--text-muted)">
                        Variety Specification
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-(--text-secondary)">Multiplication Rate (mill-wide):</span>
                        <strong className="text-(--text-primary) font-mono">1:{params.defaultMultiplicationFactor}x</strong>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-(--text-secondary)">Available Stock:</span>
                        <strong className="text-(--text-primary) font-mono">{v.seedAvailableQtl.toLocaleString()} qtl</strong>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-(--text-secondary)">Farmer Adoption Rating:</span>
                        <strong className="text-amber-500 font-mono">{'★'.repeat(v.farmerAcceptance)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Feasibility Check & Strategy Selector */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[12px] font-bold text-(--text-primary) mb-1">
                        Override Strategic Directive:
                      </label>
                      <select
                        value={strat.strategy}
                        onChange={(e) =>
                          updateVarietyStrategy(v.id, {
                            strategy: e.target.value as any,
                          })
                        }
                        className="w-full px-3 py-1.5 text-[12px] bg-(--surface-sunken) text-(--text-primary) border border-(--border) rounded-lg focus:ring-1 focus:ring-(--accent) cursor-pointer"
                      >
                        <option value="EXPAND">EXPAND (Maximize seed reproduction)</option>
                        <option value="HOLD">HOLD (Sustained crushing level)</option>
                        <option value="REDUCE">REDUCE (Phased harvest-out)</option>
                        <option value="EXIT">EXIT (Emergency zero-planting)</option>
                        <option value="INTRODUCE-NEW">INTRODUCE-NEW (Primary nursery)</option>
                      </select>
                    </div>

                    <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border)/70 text-[12px] text-(--text-secondary)">
                      <span className="font-bold text-(--text-primary) block mb-1">
                        Field Agronomist Notes:
                      </span>
                      <p className="leading-relaxed">{v.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
