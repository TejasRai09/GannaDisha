import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Database, Sprout } from 'lucide-react';
import {
  StepNumber,
  UserRole,
  VarietyRecord,
  ParametersState,
  VarietyStrategySetting,
  StrategyMode,
  SavedScenario,
  AllocationResult,
  BaselineData,
  FreePlot,
  VarietyStage,
} from './types';
import {
  INITIAL_VARIETIES,
  DEFAULT_PARAMETERS,
  INITIAL_STRATEGY_SETTINGS,
  INITIAL_SAVED_SCENARIOS,
  INITIAL_BASELINE,
} from './data/initialData';
import {
  calculateYearlyProjections,
  calculateSummaryMetrics,
  calculateSeedBalances,
  calculateComplianceChecks,
  generateWarnings,
} from './engine/calculations';
import { Header } from './components/Header';
import { StickySummaryStrip } from './components/StickySummaryStrip';
import { ToastProvider } from './components/Toast';
import { Step1Data } from './components/Step1Data';
import { EmptyState } from './components/EmptyState';
import { Step2Varieties } from './components/Step2Varieties';
import { Step3Parameters } from './components/Step3Parameters';
import { Step4Strategy } from './components/Step4Strategy';
import { Step5Results } from './components/Step5Results';
import { Step6Allocation } from './components/Step6Allocation';
import { ScenarioCompareModal } from './components/ScenarioCompareModal';
import { allocatePlots } from './engine/allocate';
import { inferLandTypes } from './engine/inferLandType';


/**
 * Builds the varietal registry from what the survey actually found.
 *
 * Nothing agronomic is invented here. Area and lowland share are measured;
 * everything else starts UNKNOWN for the agronomy team to fill in. Stage is a
 * suggestion only: anything sizeable is obviously COMMERCIAL, and everything
 * else is flagged REVIEW rather than retired - a small area may be a trial on
 * its way up, and dropping it on size alone would kill it.
 */
function registryFromBaseline(b: BaselineData): VarietyRecord[] {
  const rows = b.varietyBreakdown ?? [];
  const total = b.surveyedAreaHa || 1;

  return rows.map((v) => {
    const sharePct = (v.areaHa / total) * 100;
    const stage: VarietyStage = sharePct >= 1 ? 'COMMERCIAL' : 'REVIEW';

    return {
      id: v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: v.name,
      currentAreaHa: v.areaHa,

      // Measured from the survey.
      measuredLowlandPct: v.lowlandSharePct,
      surveyRecords: v.records,
      maturity: v.maturity || 'UNKNOWN',

      // Not known until somebody says so.
      landSuitability: 'UNKNOWN',
      plantingSeason: 'UNKNOWN',
      juiceSucrosePct: 0,          // 0 = not yet known
      avgCaneWeightGrams: 0,
      farmerAcceptance: 0,
      animalDamageRisk: 'LOW',
      seedAvailableQtl: 0,

      stage,
      strategy: 'HOLD',
      notes: '',
    } as VarietyRecord;
  });
}

export default function App() {
  // Navigation & Role State
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [userRole, setUserRole] = useState<UserRole>('plant_team');

  // Dark/Light Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cane_theme');
      if (saved) return saved === 'dark';
      return false;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('cane_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('cane_theme', 'light');
    }
  }, [isDark]);

  const [isGlobalScenarioModalOpen, setIsGlobalScenarioModalOpen] = useState(false);

  // Varietal Registry State
  // No survey ingested yet - downstream steps are gated on this being non-null.
  const [baseline, setBaseline] = useState<BaselineData | null>(INITIAL_BASELINE);

  const [varieties, setVarieties] = useState<VarietyRecord[]>(INITIAL_VARIETIES);

  // Planning Parameters State
  const [params, setParams] = useState<ParametersState>(DEFAULT_PARAMETERS);

  // Strategy Mode & Settings State
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('seed-driven');
  const [strategies, setStrategies] = useState<Record<string, VarietyStrategySetting>>(
    INITIAL_STRATEGY_SETTINGS
  );

  // Saved Scenarios for Comparison
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(INITIAL_SAVED_SCENARIOS);

  // Village Allocations
  // Free plots come from the survey in Step 1. Empty until a file is loaded.
  const [freePlots, setFreePlots] = useState<FreePlot[]>([]);

  // Engine Pure Calculations
  const projections = useMemo(() => {
    return calculateYearlyProjections(varieties, params, strategies, strategyMode);
  }, [varieties, params, strategies, strategyMode]);

  const seedBalances = useMemo(() => {
    return calculateSeedBalances(varieties, params, strategies, projections, strategyMode);
  }, [varieties, params, strategies, projections, strategyMode]);

  // After seedBalances - the strip reports what the cards decided, so it must
  // be derived from them rather than computed a second way.
  const summaryMetrics = useMemo(() => {
    return calculateSummaryMetrics(varieties, params, strategies, projections, seedBalances);
  }, [varieties, params, strategies, projections, seedBalances]);

  // Step 6. Runs off the same projections and rules as everything else, so the
  // allocation cannot drift from the plan it is supposed to carry out.
  // The ERP records no land type on ratoon rows, and every free plot is a ratoon
  // plot. Work out what each is sitting on before anything is allocated to it.
  const landInference = useMemo(
    () => (freePlots.length ? inferLandTypes(freePlots) : null),
    [freePlots]
  );

  /**
   * Allocation is the one genuinely expensive calculation in the app - 178,635
   * plots over three years, about three and a half seconds.
   *
   * It used to sit in a plain useMemo keyed on varieties, params and strategies,
   * which meant every click on a strategy button or retention preset in Step 4
   * re-ran the whole thing and froze the tab. It now runs only while Step 6 is
   * actually open, and the last result is kept so leaving and returning does not
   * recompute it.
   */
  const allocationRef = useRef<AllocationResult | null>(null);
  const allocation = useMemo(() => {
    if (currentStep !== 6 || !landInference) return allocationRef.current;
    allocationRef.current = allocatePlots(
      landInference.plots, varieties, params, projections, strategies
    );
    return allocationRef.current;
  }, [currentStep, landInference, varieties, params, projections, strategies]);

  // Inputs changed while we were on another screen - the kept result is stale,
  // so drop it rather than show Step 6 an allocation for a plan that moved on.
  useEffect(() => {
    if (currentStep !== 6) allocationRef.current = null;
  }, [varieties, params, strategies, currentStep]);

  const villageAllocations = allocation?.villages ?? [];

  const complianceChecks = useMemo(() => {
    return calculateComplianceChecks(varieties, params, projections, seedBalances, villageAllocations);
  }, [varieties, params, projections, seedBalances, villageAllocations]);

  const warnings = useMemo(() => {
    return generateWarnings(varieties, params, complianceChecks, seedBalances);
  }, [varieties, params, complianceChecks, seedBalances]);

  // Parameter handlers
  const handleResetParameters = () => {
    setParams({ ...DEFAULT_PARAMETERS });
  };

  // Variety CRUD handlers
  const handleAddVariety = (newVar: VarietyRecord) => {
    setVarieties((prev) => [...prev, newVar]);
    setStrategies((prev) => ({
      ...prev,
      [newVar.id]: {
        varietyId: newVar.id,
        strategy: newVar.strategy,
        retentionPreset: 'BALANCED',
        retentionPct: 50,
      },
    }));
  };

  const handleUpdateVariety = (updatedVar: VarietyRecord) => {
    setVarieties((prev) =>
      prev.map((v) => (v.id === updatedVar.id ? updatedVar : v))
    );
  };

  // Scenario handlers
  const handleSaveScenario = (name: string, desc: string) => {
    const y3Item = projections[projections.length - 1];
    const year3Area: Record<string, number> = {};
    varieties.forEach((v) => {
      year3Area[v.id] = y3Item?.varietyBreakdown[v.id] || 0;
    });

    const newScen: SavedScenario = {
      id: `scen-${Date.now()}`,
      name,
      createdAt: new Date().toISOString().slice(0, 10),
      description: desc,
      parameters: { ...params },
      strategies: { ...strategies },
      resultsYear3Area: year3Area,
      blendedSucroseY3: y3Item ? y3Item.blendedSucrosePct : 13.5,
    };

    setSavedScenarios((prev) => [newScen, ...prev]);
  };

  const handleLoadScenario = (scen: SavedScenario) => {
    setParams({ ...scen.parameters });
    setStrategies({ ...scen.strategies });
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-(--surface-page) text-(--text-primary) flex flex-col font-sans antialiased">
        {/* Top Application Header with Navigation Stepper and Role Selector */}
        <Header
          currentStep={currentStep}
          onSelectStep={(step) => setCurrentStep(step as StepNumber)}
          completedSteps={[1, 2, 3, 4, 5, 6].filter((s) => s < currentStep)}
          role={userRole}
          onRoleChange={(role) => setUserRole(role)}
          isDark={isDark}
          onToggleTheme={() => setIsDark((prev) => !prev)}
          onOpenCompareModal={() => setIsGlobalScenarioModalOpen(true)}
          baseline={baseline}
          baseYear={params.baseYear}
        />

        {/* Main Content View Container */}
        <main
          className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6"
          style={{ paddingBottom: currentStep === 3 || currentStep === 4 ? 120 : 40 }}
        >
          {currentStep === 1 && (
            <Step1Data
              baseline={baseline}
              onBaselineLoaded={(b) => {
                setBaseline(b);
                // The survey is the source of the variety list - Step 2 starts
                // from what is actually in the ground, not a blank page.
                const reg = registryFromBaseline(b);
                setVarieties(reg);
                setStrategies(
                  Object.fromEntries(
                    reg.map((v) => [
                      v.id,
                      { varietyId: v.id, strategy: v.strategy, retentionPreset: 'BALANCED', retentionPct: 50 },
                    ])
                  )
                );
              }}
              onFreePlotsLoaded={setFreePlots}
              onProceedToVarieties={() => setCurrentStep(2)}
              isDark={isDark}
            />
          )}

          {currentStep === 2 && !baseline && (
            <EmptyState
              icon={<Database className="w-6 h-6" />}
              title="No survey data loaded yet"
              description="This screen works from the season's plot survey. Upload it on the first step and these figures will fill in."
              steps={[
                'Go to Baseline Data and upload the plot-wise survey workbook.',
                'Review what was read in, and any data-quality flags.',
                'Come back here once the baseline is in place.',
              ]}
              actionLabel="Go to Baseline Data"
              onAction={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 2 && baseline && (
            <Step2Varieties
              varieties={varieties}
              onAddVariety={handleAddVariety}
              onUpdateVariety={handleUpdateVariety}
              onReplaceVarieties={setVarieties}
              surveyFileName={baseline?.fileName}
              onProceedToParameters={() => setCurrentStep(3)}
              isDark={isDark}
            />
          )}

          {currentStep === 3 && varieties.length === 0 && (
            <EmptyState
              icon={<Sprout className="w-6 h-6" />}
              title="No varieties in the registry"
              description="Add the varieties grown in the command area before setting parameters or planning seed."
              steps={[
                'Upload the survey on Baseline Data, or',
                'Open the Varietal Registry and add varieties by hand.',
                'Set each variety’s land suitability and strategy.',
              ]}
              actionLabel="Go to Varietal Registry"
              onAction={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 3 && varieties.length > 0 && (
            <Step3Parameters
              baseline={baseline}
              params={params}
              onChangeParams={setParams}
              onResetDefaults={handleResetParameters}
              role={userRole}
              onProceedToStrategy={() => setCurrentStep(4)}
              isDark={isDark}
            />
          )}

          {currentStep === 4 && varieties.length === 0 && (
            <EmptyState
              icon={<Sprout className="w-6 h-6" />}
              title="No varieties in the registry"
              description="Add the varieties grown in the command area before setting parameters or planning seed."
              steps={[
                'Upload the survey on Baseline Data, or',
                'Open the Varietal Registry and add varieties by hand.',
                'Set each variety’s land suitability and strategy.',
              ]}
              actionLabel="Go to Varietal Registry"
              onAction={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 4 && varieties.length > 0 && (
            <Step4Strategy
              varieties={varieties}
              params={params}
              strategies={strategies}
              onChangeStrategies={setStrategies}
              mode={strategyMode}
              onToggleMode={setStrategyMode}
              projections={projections}
              seedBalances={seedBalances}
              onProceedToResults={() => setCurrentStep(5)}
              isDark={isDark}
            />
          )}

          {currentStep === 5 && varieties.length === 0 && (
            <EmptyState
              icon={<Sprout className="w-6 h-6" />}
              title="No varieties in the registry"
              description="Add the varieties grown in the command area before setting parameters or planning seed."
              steps={[
                'Upload the survey on Baseline Data, or',
                'Open the Varietal Registry and add varieties by hand.',
                'Set each variety’s land suitability and strategy.',
              ]}
              actionLabel="Go to Varietal Registry"
              onAction={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 5 && varieties.length > 0 && (
            <Step5Results
              varieties={varieties}
              params={params}
              strategies={strategies}
              projections={projections}
              seedBalances={seedBalances}
              complianceChecks={complianceChecks}
              warnings={warnings}
              savedScenarios={savedScenarios}
              onSaveScenario={handleSaveScenario}
              onLoadScenario={handleLoadScenario}
              onProceedToAllocation={() => setCurrentStep(6)}
              isDark={isDark}
            />
          )}

          {currentStep === 6 && villageAllocations.length === 0 && (
            // Three different reasons nothing is allocated, and they need three
            // different answers. Saying "load the survey" to someone who has
            // already loaded one just sends them round in a circle.
            <EmptyState
              icon={<Database className="w-6 h-6" />}
              title={
                !baseline
                  ? 'Nothing allocated yet'
                  : freePlots.length === 0
                  ? 'This file has no plot rows'
                  : 'No variety could be placed'
              }
              description={
                !baseline
                  ? 'Village and field allocations are produced once the baseline, varieties and seed strategy are in place.'
                  : freePlots.length === 0
                  ? 'The survey loaded fine and every other screen works, but allocation needs the individual plots and a prepared baseline.json does not carry them. Upload the full .xlsx survey on Baseline Data and this screen will fill in.'
                  : `${freePlots.length.toLocaleString()} free plots were read, but no variety is eligible for any of them. A variety can only be placed once its land suitability is set - anything still UNKNOWN is deliberately left out.`
              }
              steps={
                !baseline
                  ? [
                      'Load the survey on Baseline Data.',
                      'Complete the Varietal Registry.',
                      'Set the seed strategy, then return here.',
                    ]
                  : freePlots.length === 0
                  ? [
                      'Go to Baseline Data.',
                      'Upload the .xlsx plot-wise survey rather than a baseline.json.',
                      'Return here - the allocation runs on its own.',
                    ]
                  : [
                      'Go to the Varietal Registry.',
                      'Download the template, set Land Suitability, and upload it back.',
                      'Return here - the allocation runs on its own.',
                    ]
              }
              actionLabel={
                baseline && freePlots.length > 0 ? 'Go to Varietal Registry' : 'Go to Baseline Data'
              }
              onAction={() => setCurrentStep(baseline && freePlots.length > 0 ? 2 : 1)}
            />
          )}

          {currentStep === 6 && villageAllocations.length > 0 && (
            <Step6Allocation villages={villageAllocations} allocation={allocation} isDark={isDark} />
          )}
        </main>

        {/* Global Scenario Compare Modal triggerable from header */}
        {isGlobalScenarioModalOpen && (
          <ScenarioCompareModal
            isOpen={isGlobalScenarioModalOpen}
            onClose={() => setIsGlobalScenarioModalOpen(false)}
            savedScenarios={savedScenarios}
            currentParams={params}
            currentStrategies={strategies}
            varieties={varieties}
            currentYear3Area={(() => {
              const y3 = projections[projections.length - 1];
              const areaMap: Record<string, number> = {};
              varieties.forEach((v) => {
                areaMap[v.id] = y3?.varietyBreakdown?.[v.id] || 0;
              });
              return areaMap;
            })()}
            currentBlendedSucroseY3={projections[projections.length - 1]?.blendedSucrosePct || 0}
            onSaveScenario={handleSaveScenario}
            onLoadScenario={(scen) => {
              handleLoadScenario(scen);
              setIsGlobalScenarioModalOpen(false);
            }}
          />
        )}

        {/* Persistent Live Sticky Summary Strip on Steps 3 and 4 */}
        {(currentStep === 3 || currentStep === 4) && (
          <StickySummaryStrip
            totalPlannedAreaHa={summaryMetrics.totalPlannedAreaHa}
            commandAreaHa={summaryMetrics.commandAreaHa}
            totalSeedRequiredQtl={summaryMetrics.totalSeedRequiredQtl}
            varietiesOverCapCount={summaryMetrics.varietiesOverCapCount}
            isFeasible={summaryMetrics.isFeasible}
            feasibilityReason={summaryMetrics.feasibilityReason}
            onNavigateToResults={() => setCurrentStep(5)}
          />
        )}
      </div>
    </ToastProvider>
  );
}
