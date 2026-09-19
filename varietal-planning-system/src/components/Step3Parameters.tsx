import React from 'react';
import { ParametersState, UserRole } from '../types';
import { DEFAULT_PARAMETERS } from '../data/initialData';
import { Tooltip } from './Tooltip';
import { CustomSlider } from './CustomSlider';
import { LockedControl } from './LockedControl';
import {
  RotateCcw,
  Sprout,
  Calendar,
  ShieldAlert,
  Globe,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Sparkles,
  Layers,
} from 'lucide-react';
import { RatoonCycleLogo } from './Logos';
import { useToast } from './Toast';
import { getFreshPlantRatio, getFreeReplantableHa } from '../engine/calculations';
import type { BaselineData } from '../types';

interface Step3ParametersProps {
  params: ParametersState;
  onChangeParams: (newParams: ParametersState) => void;
  onResetDefaults: () => void;
  role: UserRole;
  /** Step 1's survey, so the crop-cycle sliders can be checked against reality. */
  baseline?: BaselineData | null;
  onProceedToStrategy: () => void;
  isDark?: boolean;
}

export const Step3Parameters: React.FC<Step3ParametersProps> = ({
  params,
  onChangeParams,
  onResetDefaults,
  role,
  baseline,
  onProceedToStrategy,
  isDark = false,
}) => {
  const isManager = role === 'manager';
  const { showToast } = useToast();

  // What the crop-cycle sliders currently imply.
  const freshPlantRatio = getFreshPlantRatio(params);
  const totalHa = baseline?.surveyedAreaHa || params.commandAreaHa;
  const freeHa = getFreeReplantableHa(params, totalHa);
  const lockedHa = Math.round(totalHa - freeHa);

  /**
   * The same two figures read straight off the survey. plant+autumn carry into
   * ratoon; ratoon and ratoon II are what finish and free the field.
   */
  const measured = React.useMemo(() => {
    const c = baseline?.cropTypeSplit;
    if (!c) return null;
    const plant = (c.plantHa || 0) + (c.autumnHa || 0);
    const r1 = c.ratoonHa || 0;
    const r2 = c.ratoonIIHa || 0;
    if (plant <= 0 || r1 <= 0) return null;
    return {
      ratio: r1 / plant,
      carryPct: (r2 / r1) * 100,
      freeHa: Math.round(r1 + r2),
    };
  }, [baseline]);

  // How far the current settings sit from what was measured.
  const drift = measured ? Math.abs(freeHa - measured.freeHa) / measured.freeHa * 100 : 0;

  const applyMeasured = () => {
    if (!measured) return;
    onChangeParams({
      ...params,
      ratoonToPlantRatio: Number(measured.ratio.toFixed(2)),
      ratoonIICarryRatePct: Number(measured.carryPct.toFixed(1)),
      ratoonsTaken: measured.carryPct >= 1 ? 2 : 1,
    });
    showToast(
      'Measured values applied',
      'success',
      `Ratio ${measured.ratio.toFixed(2)}, carry ${measured.carryPct.toFixed(1)}% - from the survey.`
    );
  };

  const updateField = (field: keyof ParametersState, value: any) => {
    onChangeParams({
      ...params,
      [field]: value,
    });
  };

  const handleResetAll = () => {
    onResetDefaults();
    showToast('Parameters reset', 'info', 'All assumptions restored to default values.');
  };

  // Preset Configurations
  const applyPreset = (presetType: 'standard' | 'intensive' | 'flood') => {
    if (presetType === 'standard') {
      onChangeParams({ ...DEFAULT_PARAMETERS });
      showToast('Standard UP Norms Applied', 'info', 'Calibrated to UP Sugarcane Research Council norms');
    } else if (presetType === 'intensive') {
      onChangeParams({
        ...params,
        seedRateQtlPerHa: 48,
        defaultMultiplicationFactor: 12,
        budType: 'SINGLE BUD',
        seedPurchaseCeilingHa: 50,
      });
      showToast('Intensive STP Mode Activated', 'success', 'Seed rate set to 48 qtl/ha with 12x multiplication');
    } else if (presetType === 'flood') {
      onChangeParams({
        ...params,
        lowlandCoverageFloorPct: 30,
        maxVarietyConcentrationPct: 30,
        ratoonToPlantRatio: 1.0,
      });
      showToast('Flood-Resilience Mode Applied', 'info', 'Lowland reserve boosted to 30% with stricter caps');
    }
  };

  return (
    <div className="space-y-6 pb-28 screen-fade-in">
      {/* Screen Header */}
      <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-bold text-(--text-primary) tracking-tight">
              Step 3: Planning Parameters & Agronomic Calibration
            </h2>
            <span className="app-chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
              Interactive Feasibility Engine
            </span>
          </div>
          <p className="text-[13px] text-(--text-secondary) mt-1 max-w-3xl leading-relaxed">
            Calibrate multiplication rates, seed rates, ratoon carry rates, and biosecurity caps. Every control updates projections in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetAll}
            className="btn-secondary"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>

          <button
            type="button"
            onClick={onProceedToStrategy}
            className="btn-primary"
          >
            <span>Proceed to Strategy</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Calibration Presets Bar */}
      <div className="bg-(--surface-card) p-3 rounded-[12px] border border-(--border) shadow-(--shadow-sm) flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[12px] font-bold uppercase tracking-wider text-(--text-primary)">
            Agronomic Presets:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyPreset('standard')}
            className="px-3 py-1 text-[12px] font-medium rounded-lg border border-(--border) bg-(--surface-sunken) hover:bg-(--border) text-(--text-primary) transition-colors cursor-pointer"
          >
            Standard UP Norms (65 q/ha, 8x)
          </button>

          <button
            type="button"
            onClick={() => applyPreset('intensive')}
            className="px-3 py-1 text-[12px] font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
          >
            Intensive STP High-Tech (48 q/ha, 12x)
          </button>

          <button
            type="button"
            onClick={() => applyPreset('flood')}
            className="px-3 py-1 text-[12px] font-medium rounded-lg border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-400 transition-colors cursor-pointer"
          >
            Flood-Resilient Setup (30% Lowland Reserve)
          </button>
        </div>
      </div>

      {/* Grouped Parameter Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD 1: Seed & Multiplication */}
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-(--border)">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <Sprout className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-(--text-primary)">
                  Seed & Multiplication Logistics
                </h3>
                <p className="text-[11px] text-(--text-muted)">
                  Seed cane logistics, nursery multipliers & sett geometry
                </p>
              </div>
            </div>
            <span className="app-chip bg-(--surface-sunken) text-(--text-secondary) font-mono">
              Agronomy
            </span>
          </div>

          <div className="space-y-4">
            {/* Seed Rate Slider */}
            <CustomSlider
                info={<Tooltip content="Standard quantity of seed cane setts required to plant one hectare in subtropical UP. Typically 60-70 qtl/ha for double bud setts." source="UP Sugarcane Research Council, Shahjahanpur" />}
                label="Seed Rate"
                value={params.seedRateQtlPerHa}
                min={40}
                max={100}
                step={1}
                defaultValue={DEFAULT_PARAMETERS.seedRateQtlPerHa}
                unit="qtl/ha"
                onChange={(v) => updateField('seedRateQtlPerHa', v)}
                onReset={() => updateField('seedRateQtlPerHa', DEFAULT_PARAMETERS.seedRateQtlPerHa)}
                helpText="Trench: 40 | Std: 65 | Dense: 100"
              />

            {/* Default Multiplication Factor Slider */}
            <CustomSlider
                info={<Tooltip content="1 hectare of primary seed nursery produces sufficient seed cane to plant ~8 hectares in the next season." source="Gobind Mill Seed Nursery Standard" />}
                label="Multiplication Factor"
                value={params.defaultMultiplicationFactor}
                min={3}
                max={20}
                step={0.5}
                defaultValue={DEFAULT_PARAMETERS.defaultMultiplicationFactor}
                unit="x"
                onChange={(v) => updateField('defaultMultiplicationFactor', v)}
                onReset={() =>
                  updateField('defaultMultiplicationFactor', DEFAULT_PARAMETERS.defaultMultiplicationFactor)
                }
                helpText="Drought: 3x | Std: 8x | STP: 20x"
              />

            {/* Seed Purchase Ceiling */}
            <CustomSlider
                info={<Tooltip content="Maximum hectares of certified breeder/foundation seed the mill can purchase once from external research stations in Year 1." source="Cane Procurement Budget" />}
                label="Seed Purchase Ceiling"
                value={params.seedPurchaseCeilingHa}
                min={0}
                max={200}
                step={5}
                defaultValue={DEFAULT_PARAMETERS.seedPurchaseCeilingHa}
                unit="ha"
                onChange={(v) => updateField('seedPurchaseCeilingHa', v)}
                onReset={() =>
                  updateField('seedPurchaseCeilingHa', DEFAULT_PARAMETERS.seedPurchaseCeilingHa)
                }
                helpText="Budget limit: ~35 ha"
              />

            {/* Test Plot Size */}
            <CustomSlider
                info={<Tooltip content="Target nursery plot acreage for pilot evaluation of newly introduced cultivars before large-scale commercial release." source="Agronomy R&D Manual" />}
                label="Test Plot Size"
                value={params.testPlotSizeHa}
                min={0}
                max={50}
                step={1}
                defaultValue={DEFAULT_PARAMETERS.testPlotSizeHa}
                unit="ha"
                onChange={(v) => updateField('testPlotSizeHa', v)}
                onReset={() => updateField('testPlotSizeHa', DEFAULT_PARAMETERS.testPlotSizeHa)}
                helpText="Standard trial: 5 ha"
              />

            {/* Bud Type Toggle */}
            <div className="pt-3 border-t border-(--border) flex items-center justify-between">
              <div>
                <span className="text-[13px] font-medium text-(--text-primary) flex items-center">
                  Bud Type Technology
                  <Tooltip
                    content="Single bud settlings save ~30% seed cane (45 qtl/ha) with higher tillering, while double bud uses ~65 qtl/ha conventional planting."
                    source="IISR STP Manual"
                  />
                </span>
                <span className="text-[11px] text-(--text-muted) block">
                  Affects effective seed required per ha
                </span>
              </div>

              <div className="inline-flex rounded-lg border border-(--border) bg-(--surface-sunken) p-0.5">
                <button
                  type="button"
                  onClick={() => updateField('budType', 'SINGLE BUD')}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-all cursor-pointer ${
                    params.budType === 'SINGLE BUD'
                      ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  SINGLE BUD
                </button>
                <button
                  type="button"
                  onClick={() => updateField('budType', 'DOUBLE BUD')}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-all cursor-pointer ${
                    params.budType === 'DOUBLE BUD'
                      ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                      : 'text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                >
                  DOUBLE BUD
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Crop Cycle Dynamics */}
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-(--border)">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-(--accent-subtle) flex items-center justify-center border border-(--accent)/20">
                <RatoonCycleLogo className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-(--text-primary)">
                  Crop Cycle Dynamics
                </h3>
                <p className="text-[11px] text-(--text-muted)">
                  Ratoon retention constraints and multi-year field locking
                </p>
              </div>
            </div>
            <span className="app-chip bg-(--surface-sunken) text-(--text-secondary) font-mono">
              Cycle
            </span>
          </div>

          <div className="space-y-4">
            {/* Ratoons Taken - mill policy, not a variety trait */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-semibold text-(--text-primary)">
                  Ratoons Taken
                </label>
                <span className="text-[11px] text-(--text-muted)">
                  before ploughing out
                </span>
              </div>
              <div className="flex gap-2">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateField('ratoonsTaken', n)}
                    className={`flex-1 h-[34px] rounded-[8px] border text-[13px] font-semibold transition-colors cursor-pointer ${
                      params.ratoonsTaken === n
                        ? 'bg-(--accent) text-white border-(--accent)'
                        : 'bg-(--surface-card) text-(--text-secondary) border-(--border) hover:border-(--accent)'
                    }`}
                  >
                    {n === 1 ? '1 ratoon' : '2 ratoons'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-(--text-muted) mt-1.5 leading-relaxed">
                Survey shows only 3.8% of ratoon I reaching ratoon II, so in practice
                Gobind takes one. At 1, the carry rate below is ignored.
              </p>
            </div>

            {/* Ratoon II Carry Rate */}
            <CustomSlider
                info={<Tooltip content="Share of ratoon fields kept for a second ratoon instead of being ploughed. Uncertain - confirm with plant team." source="Survey Ratoon Records" />}
                label="Ratoon II Carry Rate"
                value={params.ratoonIICarryRatePct}
                min={0}
                max={20}
                step={0.1}
                defaultValue={DEFAULT_PARAMETERS.ratoonIICarryRatePct}
                unit="%"
                onChange={(v) => updateField('ratoonIICarryRatePct', v)}
                onReset={() =>
                  updateField('ratoonIICarryRatePct', DEFAULT_PARAMETERS.ratoonIICarryRatePct)
                }
                helpText="Strict 1-ratoon: 0% | Survey datum: 3.6%"
              />

            {/* Ratoon to Plant Ratio */}
            <CustomSlider
                info={<Tooltip content="Historical ratio of ratoon acreage to fresh plant acreage across Gobind mill command. Governs the rate of field turnover." source="Cane Survey Analysis" />}
                label="Ratoon : Plant Ratio"
                value={params.ratoonToPlantRatio}
                min={0.5}
                max={1.5}
                step={0.05}
                defaultValue={DEFAULT_PARAMETERS.ratoonToPlantRatio}
                onChange={(v) => updateField('ratoonToPlantRatio', v)}
                onReset={() =>
                  updateField('ratoonToPlantRatio', DEFAULT_PARAMETERS.ratoonToPlantRatio)
                }
                helpText="Replanting: 0.5 | Baseline: 0.9 | High: 1.5"
              />

            {/* What these two sliders actually produce. This is the replant budget. */}
            <div className="p-3 bg-(--surface-sunken) rounded-lg border border-(--border) space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-(--text-primary)">
                  Replant budget these settings produce
                </span>
                {measured && (
                  <button
                    type="button"
                    onClick={applyMeasured}
                    className="text-[11px] font-semibold text-(--accent) hover:underline cursor-pointer shrink-0"
                  >
                    Use measured values
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-md bg-(--surface-card) border border-(--border)">
                  <div className="text-[10px] uppercase tracking-wide text-(--text-muted)">Fresh plant</div>
                  <div className="text-[15px] font-bold text-(--text-primary) tabular-nums">
                    {(freshPlantRatio * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-2 rounded-md bg-(--surface-card) border border-(--border)">
                  <div className="text-[10px] uppercase tracking-wide text-(--text-muted)">Locked</div>
                  <div className="text-[15px] font-bold text-(--text-primary) tabular-nums">
                    {lockedHa.toLocaleString()} <span className="text-[11px] font-medium text-(--text-muted)">ha</span>
                  </div>
                </div>
                <div className="p-2 rounded-md bg-(--surface-card) border border-(--border)">
                  <div className="text-[10px] uppercase tracking-wide text-(--text-muted)">Free to replant</div>
                  <div className="text-[15px] font-bold text-(--accent) tabular-nums">
                    {freeHa.toLocaleString()} <span className="text-[11px] font-medium text-(--text-muted)">ha</span>
                  </div>
                </div>
              </div>

              {measured && (
                <p className={`text-[11px] leading-relaxed ${drift > 8 ? 'text-amber-700 dark:text-amber-400' : 'text-(--text-muted)'}`}>
                  {drift > 8 ? '⚠ ' : ''}
                  The survey measured {measured.freeHa.toLocaleString()} ha coming out of ratoon
                  (ratio {measured.ratio.toFixed(2)}, carry {measured.carryPct.toFixed(1)}%).
                  {drift > 8
                    ? ` These settings are ${drift.toFixed(0)}% off that.`
                    : ' These settings agree with it.'}
                </p>
              )}

              <p className="text-[11px] text-(--text-secondary) leading-relaxed border-t border-(--border) pt-2">
                A field planted in Year T stays locked as ratoon of the same variety in
                Year T+1. Only the area finishing ratoon is free to replant.
              </p>
            </div>
          </div>
        </div>

        {/* CARD 3: Limits & Rules (Manager Role Protected with LockedControl) */}
        <LockedControl
          isLocked={!isManager}
          lockReason="Only Mill Managers have authority to alter biosecurity caps and policy limits"
        >
          <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-5 h-full">
            <div className="flex items-center justify-between pb-3 border-b border-(--border)">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-(--text-primary)">
                    Biosecurity Caps & Policy Bounds
                  </h3>
                  <p className="text-[11px] text-(--text-muted)">
                    Biosecurity caps, monoculture ceilings & flood safety floors
                  </p>
                </div>
              </div>
              <span className="app-chip bg-amber-500/12 text-amber-700 dark:text-amber-400 font-semibold">
                Manager Control
              </span>
            </div>

            <div className="space-y-4">
              {/* Max Single Variety Pct (Monoculture Cap) */}
              <CustomSlider
                  info={<Tooltip content="Biosecurity cap to prevent catastrophic vulnerability like Co 0238 red-rot epidemic. UP state advisory: <= 35-40% for any single variety." source="UP Sugarcane Dept Directive 2024" />}
                  label="Monoculture Diversity Cap"
                  value={params.maxVarietyConcentrationPct}
                  min={20}
                  max={60}
                  step={1}
                  defaultValue={DEFAULT_PARAMETERS.maxVarietyConcentrationPct}
                  unit="%"
                  disabled={!isManager}
                  onChange={(v) => updateField('maxVarietyConcentrationPct', v)}
                  onReset={() =>
                    updateField('maxVarietyConcentrationPct', DEFAULT_PARAMETERS.maxVarietyConcentrationPct)
                  }
                  helpText="Safe: 30% | UP Limit: 35% | High Risk: 50%"
                />

              {/* Village Level Concentration Cap */}
              <CustomSlider
                  info={<Tooltip content="Maximum percentage of any single variety permitted within any individual village boundary." source="Gobind Mill Operations Standard" />}
                  label="Village-Level Concentration Cap"
                  value={params.villageLevelConcentrationCapPct}
                  min={30}
                  max={90}
                  step={1}
                  defaultValue={DEFAULT_PARAMETERS.villageLevelConcentrationCapPct}
                  unit="%"
                  disabled={!isManager}
                  onChange={(v) => updateField('villageLevelConcentrationCapPct', v)}
                  onReset={() =>
                    updateField('villageLevelConcentrationCapPct', DEFAULT_PARAMETERS.villageLevelConcentrationCapPct)
                  }
                  helpText="Recommended: 60% village ceiling"
                />

              {/* Lowland Coverage Floor */}
              <CustomSlider
                  info={<Tooltip content="Minimum share of lowland flooded fields that must be planted with waterlogging-tolerant varieties like Co 0118." source="Survey Lowland Assessment" />}
                  label="Lowland Coverage Floor"
                  value={params.lowlandCoverageFloorPct}
                  min={10}
                  max={50}
                  step={1}
                  defaultValue={DEFAULT_PARAMETERS.lowlandCoverageFloorPct}
                  unit="%"
                  disabled={!isManager}
                  onChange={(v) => updateField('lowlandCoverageFloorPct', v)}
                  onReset={() =>
                    updateField('lowlandCoverageFloorPct', DEFAULT_PARAMETERS.lowlandCoverageFloorPct)
                  }
                  helpText="Command lowland area: ~23.8%"
                />

              {/* Red-Rot Emergency Threshold */}
              <CustomSlider
                  info={<Tooltip content="Threshold percentage of field infection triggering emergency quarantine and seed replacement protocol." source="Cane Pathology Standard" />}
                  label="Red-Rot Quarantine Trigger"
                  value={params.redRotEmergencyThresholdPct}
                  min={0.5}
                  max={10}
                  step={0.5}
                  defaultValue={DEFAULT_PARAMETERS.redRotEmergencyThresholdPct}
                  unit="%"
                  disabled={!isManager}
                  onChange={(v) => updateField('redRotEmergencyThresholdPct', v)}
                  onReset={() =>
                    updateField(
                      'redRotEmergencyThresholdPct',
                      DEFAULT_PARAMETERS.redRotEmergencyThresholdPct
                    )
                  }
                  helpText="Strict quarantine: 2.0%"
                />
            </div>
          </div>
        </LockedControl>

        {/* CARD 4: Scope & Planning Horizon */}
        <div className="bg-(--surface-card) p-5 rounded-[12px] border border-(--border) shadow-(--shadow-sm) space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-(--border)">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-(--text-primary)">
                  Scope & Planning Horizon
                </h3>
                <p className="text-[11px] text-(--text-muted)">
                  Command target acreage and planning timeframe
                </p>
              </div>
            </div>
            <span className="app-chip bg-(--surface-sunken) text-(--text-secondary) font-mono">
              Command
            </span>
          </div>

          <div className="space-y-4">
            {/* Mill output constants. These decide the headline recovery figure and
                the rupee value on Step 5. They were buried in the code - the
                recovery factor differed between the base year and the projected
                years, and the crush tonnage and sugar price sat in a comment. */}
            <CustomSlider
              info={<Tooltip content="Recovery as a share of juice sucrose. Applied identically to the base year and every projected year, so recovery moves only when the varietal mix moves." source="Mill recovery records" />}
              label="Juice to Recovery Factor"
              value={params.juiceToRecoveryFactor}
              min={0.5}
              max={0.75}
              step={0.005}
              defaultValue={DEFAULT_PARAMETERS.juiceToRecoveryFactor}
              onChange={(v) => updateField('juiceToRecoveryFactor', v)}
              onReset={() => updateField('juiceToRecoveryFactor', DEFAULT_PARAMETERS.juiceToRecoveryFactor)}
              helpText={`18% sucrose would give ${(18 * params.juiceToRecoveryFactor).toFixed(2)}% recovery`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-(--text-primary) mb-1.5">
                  Season Crush (MT cane)
                </label>
                <input
                  type="number"
                  step="50000"
                  min="100000"
                  value={params.annualCaneCrushMT}
                  onChange={(e) => updateField('annualCaneCrushMT', parseInt(e.target.value) || 1350000)}
                  className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-lg focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none tabular-nums font-semibold"
                />
                <span className="text-[11px] text-(--text-muted) block mt-1">
                  {(params.annualCaneCrushMT / 100000).toFixed(1)} Lakh MT
                </span>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-(--text-primary) mb-1.5">
                  Sugar Price (Rs/kg)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={params.sugarPriceRsPerKg}
                  onChange={(e) => updateField('sugarPriceRsPerKg', parseInt(e.target.value) || 38)}
                  className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-lg focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none tabular-nums font-semibold"
                />
                <span className="text-[11px] text-(--text-muted) block mt-1">
                  +0.1% recovery is worth Rs{' '}
                  {(((params.annualCaneCrushMT * 0.001) * 1000 * params.sugarPriceRsPerKg) / 10000000).toFixed(2)} Cr
                </span>
              </div>
            </div>

            {/* Command Area */}
            <div>
              <div className="flex items-center justify-between text-[13px] mb-1">
                <span className="font-medium text-(--text-primary) flex items-center">
                  Command Area (Hectares)
                  <Tooltip
                    content="Gross sugarcane acreage targeted across Gobind Sugar Mills bonded command area for crushing capacity."
                    source="Factory Crushing Capacity (9,000 TCD)"
                  />
                </span>
                <span className="font-bold text-(--text-primary) tabular-nums font-mono">
                  {params.commandAreaHa.toLocaleString()} ha
                </span>
              </div>
              <input
                type="number"
                step="500"
                min="30000"
                max="80000"
                value={params.commandAreaHa}
                onChange={(e) => updateField('commandAreaHa', parseInt(e.target.value) || 57000)}
                className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-lg focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none tabular-nums font-semibold"
              />
              <span className="text-[11px] text-(--text-muted) block mt-1">
                Baseline survey census area: 56,491 ha
              </span>
            </div>

            {/* Planning Horizon */}
            <div>
              <label className="block text-[13px] font-medium text-(--text-primary) mb-2 flex items-center">
                Planning Horizon (Years)
                <Tooltip
                  content="Number of forward crop cycles to project. Standard is 3 years to cover one full plant-ratoon-replant cycle."
                  source="Mill Strategic Plan"
                />
              </label>

              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((years) => (
                  <button
                    key={years}
                    type="button"
                    onClick={() => updateField('planningHorizonYears', years)}
                    className={`py-1.5 px-1 text-center text-[12px] font-semibold rounded-lg border transition-all cursor-pointer ${
                      params.planningHorizonYears === years
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-(--surface-sunken) border-(--border) text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {years} {years === 1 ? 'Yr' : 'Yrs'}
                  </button>
                ))}
              </div>
            </div>

            {/* Base Year */}
            <div>
              <label className="block text-[13px] font-medium text-(--text-primary) mb-1.5 flex items-center">
                Base Year (Survey Datum)
                <Tooltip content="The completed crushing and survey year serving as t=0 baseline." />
              </label>
              <select
                value={params.baseYear}
                onChange={(e) => updateField('baseYear', e.target.value)}
                className="w-full px-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-lg focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent) focus:outline-none font-medium cursor-pointer"
              >
                <option value="2025-26">2025-26 Crushing Season</option>
                <option value="2026-27">2026-27 Crushing Season (Current)</option>
                <option value="2027-28">2027-28 Crushing Season</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
