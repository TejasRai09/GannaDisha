import {
  VarietyRecord,
  ParametersState,
  VarietyStrategySetting,
  SavedScenario,
  VillageAllocation,
  BaselineData,
} from '../types';

/* ---------------------------------------------------------------------------
 * The application ships EMPTY.
 *
 * Nothing here is sample or demonstration data. A plant-team member opening
 * this for the first time sees an empty system and builds it up by uploading
 * the season's survey and entering variety information. The only values that
 * are pre-filled are the planning parameters below, and those are starting
 * assumptions the team is expected to adjust - not data.
 * ------------------------------------------------------------------------- */

/** No survey ingested yet. Step 1 populates this. */
export const INITIAL_BASELINE: BaselineData | null = null;

/** Varieties arrive from the survey, or are added by hand in Step 2. */
export const INITIAL_VARIETIES: VarietyRecord[] = [];

/** One entry per variety, created when that variety first appears. */
export const INITIAL_STRATEGY_SETTINGS: Record<string, VarietyStrategySetting> = {};

/** Saved by the user in Step 5 to compare alternatives. */
export const INITIAL_SAVED_SCENARIOS: SavedScenario[] = [];

/** Produced by the allocation engine in Step 6. */
export const INITIAL_VILLAGES: VillageAllocation[] = [];

/**
 * Starting assumptions, not measurements.
 *
 * Sources, so the team knows what they are changing:
 *   seedRateQtlPerHa            65  - verified against the mill's Seed Availability sheet
 *   defaultMultiplicationFactor  8  - plant team: 1 ha of nursery plants ~8 ha next season
 *   seedPurchaseCeilingHa       35  - roughly the limit that can be bought in; the rest
 *                                     must be multiplied on the mill's own land
 *   testPlotSizeHa               5  - standard first-year trial before multiplication starts
 *   ratoonIICarryRatePct       3.6  - measured from the 2026-27 survey; plant team is not
 *                                     certain of this figure, so treat it as adjustable
 *   ratoonToPlantRatio         0.9  - the ratio used in the mill's own proposal
 *   maxVarietyConcentrationPct  40  - a popular variety has historically run to 70-90%
 *                                     unchecked, so this ceiling is a policy choice
 */
export const DEFAULT_PARAMETERS: ParametersState = {
  // Seed & multiplication
  seedRateQtlPerHa: 65,
  defaultMultiplicationFactor: 8,
  seedPurchaseCeilingHa: 35,
  testPlotSizeHa: 5,
  budType: 'DOUBLE BUD',

  // Crop cycle
  ratoonsTaken: 2,
  ratoonIICarryRatePct: 3.6,
  ratoonToPlantRatio: 0.9,

  // Limits & rules (manager-owned)
  maxVarietyConcentrationPct: 40,
  villageLevelConcentrationCapPct: 60,
  lowlandCoverageFloorPct: 28,
  redRotEmergencyThresholdPct: 2,

  // Mill output
  juiceToRecoveryFactor: 0.635,
  annualCaneCrushMT: 1350000,
  sugarPriceRsPerKg: 38,

  // Scope
  commandAreaHa: 57000,
  planningHorizonYears: 3,
  baseYear: '2026-27',
};

/** Kept so existing imports do not break; the app no longer ships village data. */
export const MOCK_VILLAGES_DATA: VillageAllocation[] = INITIAL_VILLAGES;
