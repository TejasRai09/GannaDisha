export type UserRole = 'plant_team' | 'manager';
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type LandSuitability = 'UPLAND' | 'LOWLAND' | 'BOTH' | 'UNKNOWN';
export type PlantingSeason = 'SPRING' | 'AUTUMN' | 'BOTH' | 'UNKNOWN';
export type AnimalDamageRisk = 'LOW' | 'MEDIUM' | 'HIGH';
/**
 * Where a variety is in its life. Distinct from strategy, which is where we
 * WANT it to go. A 5 ha variety means opposite things at TRIAL and RETIRED, so
 * area alone must never decide whether something is dropped.
 *   REVIEW - found in the survey but nobody has judged it yet
 */
/** 12-month spring crop vs 18-month autumn crop - decides how long the field is held. */
export type CropDuration = '12-MONTH' | '18-MONTH';

/** Red rot reaction: resistant / moderately resistant / susceptible. */
export type RedRotReaction = 'R' | 'MR' | 'S';

export type VarietyStage =
  | 'TRIAL'
  | 'MULTIPLYING'
  | 'COMMERCIAL'
  | 'DECLINING'
  | 'RETIRED'
  | 'REVIEW';

export type VarietyStrategy = 'EXPAND' | 'HOLD' | 'REDUCE' | 'EXIT' | 'INTRODUCE-NEW';
export type SeedRetentionPreset = 'AGGRESSIVE' | 'BALANCED' | 'MATURE' | 'CUSTOM';
export type StrategyMode = 'seed-driven' | 'target-driven';

export interface VarietyRecord {
  id: string;
  name: string;
  currentAreaHa: number; // read-only from survey
  landSuitability: LandSuitability;
  plantingSeason: PlantingSeason;
  juiceSucrosePct: number; // 14.0 - 20.0
  avgCaneWeightGrams: number; // 300 - 1200
  farmerAcceptance: number; // 1 - 5 stars
  animalDamageRisk: AnimalDamageRisk;
  seedAvailableQtl: number; // seed available in quintals
  stage: VarietyStage;
  strategy: VarietyStrategy;
  /** Share of this variety's area the survey actually found on lowland.
   *  Measured, not declared - used to check the land rule against reality. */
  measuredLowlandPct?: number;
  /** Records behind it in the survey, so tiny entries can be spotted. */
  surveyRecords?: number;
  /** EARLY / GENERAL / REJECTED, read straight off the survey's CROPCATEGORY.
   *  Measured, not judged - it is clean and unambiguous for all 86 varieties.
   *  Step 6 uses it to stagger a grower's harvest across his plots. */
  maturity?: string;
  /** 12 or 18 month. An 18-month autumn crop occupies the field for two seasons,
   *  so this feeds the lock calculation directly. From the Step 2 sheet. */
  cropDuration?: CropDuration;
  /** Red rot reaction. An S variety should not be cleared for expansion. */
  redRot?: RedRotReaction;
  /** Tonnes per hectare. Without it the plan has no tonnage, only area. */
  caneYieldTha?: number;
  notes: string;
  isCustom?: boolean; // added via modal
  isEdited?: boolean;
}

export interface ParametersState {
  // Seed & Multiplication
  seedRateQtlPerHa: number; // default 65 (40-100)
  defaultMultiplicationFactor: number; // default 8 (3-20)
  seedPurchaseCeilingHa: number; // default 35 (0-200)
  testPlotSizeHa: number; // default 5 (0-50)
  budType: 'SINGLE BUD' | 'DOUBLE BUD';

  // Crop Cycle
  /** How many ratoons the mill takes before ploughing out. Mill policy, not a
   *  variety trait - the 2026-27 survey shows only 3.8% of ratoon I reaching
   *  ratoon II, so in practice Gobind takes one. */
  ratoonsTaken: 1 | 2;
  ratoonIICarryRatePct: number; // default 3.6% (0-20); ignored when ratoonsTaken = 1
  ratoonToPlantRatio: number; // default 0.9 (0.5-1.5); measured 0.68

  // Limits & Rules (Manager only)
  maxVarietyConcentrationPct: number; // default 40% (10-100)
  villageLevelConcentrationCapPct: number; // default 60% (10-100)
  lowlandCoverageFloorPct: number; // default 28% (0-60)
  redRotEmergencyThresholdPct: number; // default 2% (0-10)

  // Mill output
  /** Recovery as a share of juice sucrose. Mill-specific; the mill knows its own.
   *  Base and projected years must use the SAME factor - they used to differ
   *  (0.635 vs 0.638), which flattered every projection on its own. */
  juiceToRecoveryFactor: number; // default 0.635 (0.50-0.75)
  /** Cane crushed in a season, for costing a recovery change. */
  annualCaneCrushMT: number; // default 1,350,000
  /** Ex-mill sugar price, for the same purpose. */
  sugarPriceRsPerKg: number; // default 38

  // Scope
  commandAreaHa: number; // default 57000
  planningHorizonYears: number; // 1 | 2 | 3 | 4 | 5, default 3
  baseYear: string; // '2026-27'
}

export interface VarietyStrategySetting {
  varietyId: string;
  strategy: VarietyStrategy;
  retentionPreset: SeedRetentionPreset;
  retentionPct: number; // 0-100%
  /** Target hectares per year in target-driven mode, index 0 = Year 1.
   *  An array rather than three fixed fields so it follows the planning horizon. */
  targetsHa?: number[];
}

export interface YearProjectionItem {
  year: string; // 'Base (2026-27)', 'Year 1', 'Year 2', 'Year 3'
  totalAreaHa: number;
  varietyBreakdown: Record<string, number>; // varietyId -> ha
  blendedSucrosePct: number;
  estimatedRecoveryPct: number;
  caneDivertedToSeedTonnes: number;
}

export interface VarietySeedBalance {
  varietyId: string;
  varietyName: string;
  areaToPlantHa: number;
  seedRequiredQtl: number;
  seedAvailableQtl: number;
  balanceQtl: number;
  isFeasible: boolean;
  statusText: 'Surplus' | 'Adequate' | 'Deficit' | 'Zero Seed';
  warningMessage?: string;
}

export interface ComplianceCheck {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  threshold: string;
  detail: string;
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  description: string;
  parameters: ParametersState;
  strategies: Record<string, VarietyStrategySetting>;
  resultsYear3Area: Record<string, number>;
  blendedSucroseY3: number;
}

/** A plot finishing its ratoon cycle - the only land Step 6 may reassign. */
/** How a plot's land type was arrived at. */
export type LandTypeSource = 'MEASURED' | 'GROWER' | 'VILLAGE' | 'UNKNOWN';

/** Where a plot is in its cycle right now. Decides which year it comes free. */
export type CropStage = 'PLANT' | 'AUTUMN' | 'RATOON' | 'RATOON II';

export interface FreePlot {
  id: string;
  /** Crop stage at survey time. A plot is not free until its ratoons are done. */
  cropStage?: CropStage;
  /** Planning year this plot becomes available. Computed, not surveyed. */
  freeInYear?: number;
  village: string;
  society: string;
  /** Composite key: society | grower-village | grower code. */
  grower: string;
  /** UNKNOWN on plain RATOON rows - the ERP records no land type for them.
   *  Filled in by inferLandTypes() before allocation. */
  landType: 'UPLAND' | 'LOWLAND' | 'UNKNOWN';
  landTypeSource?: LandTypeSource;
  /** Lowland share measured on this grower's own surveyed plots, -1 if none. */
  growerLowlandShare?: number;
  /** Lowland share measured across this village's surveyed plots, -1 if none. */
  villageLowlandShare?: number;
  areaHa: number;
  /** What is finishing here. Exit varieties are replaced first. */
  currentVariety: string;
}

/**
 * One variety on one piece of ground.
 *
 * A block, not a plot: a plot large enough to harvest in parts may carry two or
 * three varieties, and each block then ratoons as its own variety. That is why
 * the lock is tracked here rather than on the plot.
 */
export interface PlotBlock {
  plotId: string;
  /** Planning year this instruction belongs to. */
  year: number;
  /** Year 1 rests on surveyed fact; later years on the projected cycle. */
  basis?: 'SURVEYED' | 'PROJECTED';
  village: string;
  society: string;
  grower: string;
  landType: 'UPLAND' | 'LOWLAND';
  /** Whether that land type was recorded or inferred. */
  landTypeSource?: LandTypeSource;
  areaHa: number;
  variety: string;
  /** What this block replaces. */
  previousVariety: string;
  /** True when the plot was split between varieties. */
  isSplit: boolean;
  /** Set when the plot was taken off an EXIT variety. */
  isPriority?: boolean;
  priorityNote?: string;
}

export interface AllocationResult {
  blocks: PlotBlock[];
  villages: VillageAllocation[];
  /** Area a variety asked for but could not be given, by variety name. */
  unmetHa: Record<string, number>;
  totalFreeHa: number;
  totalAllocatedHa: number;
  plotsUsed: number;
  plotsSplit: number;
  /** Plots left unassigned because no variety was eligible for that land. */
  unassignedPlots: number;
  unassignedHa: number;
  /** How each plot's land type was arrived at, by area. */
  landTypeBasis?: Record<LandTypeSource, number>;
  /** Per-year summary, index 0 = Year 1. */
  byYear?: {
    year: number;
    basis: 'SURVEYED' | 'PROJECTED';
    freeHa: number;
    allocatedHa: number;
    plotsUsed: number;
    plotsSplit: number;
    unassignedHa: number;
  }[];
}

export interface VillageAllocation {
  id: string;
  /** Planning year this row belongs to. */
  year?: number;
  society: string;
  village: string;
  landType: 'UPLAND' | 'LOWLAND';
  areaFreeToReplantHa: number;
  varietyToPlant: string;
  numberOfFields: number;
  isPriorityAction?: boolean;
  priorityNote?: string;
}

/**
 * Everything Step 1 derives from the uploaded survey workbook.
 * `null` until a file has actually been ingested - the app ships with no data.
 */
export interface DataQualityFlag {
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
}

export interface BaselineData {
  fileName: string;
  fileSizeMb: string;
  uploadedAt: string;

  surveyedAreaHa: number;
  physicalFields: number;
  growers: number;
  villages: number;
  societies: number;
  varietiesFound: number;

  /** Measured only on rows where land type was actually recorded. RATOON rows
   *  carry no land type in the ERP - all 92,319 of them default to UPLAND - so
   *  including them drags the lowland share from ~39% down to ~24%. */
  landTypeSplit: {
    uplandHa: number;
    lowlandHa: number;
    /** Area the split was measured on. */
    recordedHa?: number;
    /** Area with no land type recorded, excluded from the split. */
    unrecordedHa?: number;
  };
  cropTypeSplit: { plantHa: number; autumnHa: number; ratoonHa: number; ratoonIIHa: number };

  /** Derived: plant+autumn stay locked as ratoon next season. */
  lockedHa: number;
  freeToReplantHa: number;

  dataQualityFlags: DataQualityFlag[];
  cleanRecords: number;
  totalRecords: number;

  /** Detail behind the headline figures, so each metric can be opened up. */
  villageBreakdown?: VillageRow[];
  societyBreakdown?: SocietyRow[];
  varietyBreakdown?: VarietyRow[];
}

export interface VillageRow {
  name: string;
  society: string;
  areaHa: number;
  fields: number;
  growers: number;
  records: number;
}

export interface SocietyRow {
  name: string;
  areaHa: number;
  villages: number;
  fields: number;
  growers: number;
  records: number;
}

export interface VarietyRow {
  name: string;
  areaHa: number;
  records: number;
  lowlandSharePct: number;
  /** Survey CROPCATEGORY - EARLY / GENERAL / REJECTED. */
  maturity?: string;
}
