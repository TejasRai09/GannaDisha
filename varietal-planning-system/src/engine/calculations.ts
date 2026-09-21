/**
 * @file calculations.ts
 * @description Pure calculation engine for the Varietal Planning System.
 * NOTE: PLACEHOLDER - to be replaced with real engine logic / backend API calls.
 * All functions are pure, deterministic, and easily testable.
 */

import {
  VarietyRecord,
  ParametersState,
  VarietyStrategySetting,
  StrategyMode,
  YearProjectionItem,
  VarietySeedBalance,
  ComplianceCheck,
  VillageAllocation,
} from '../types';

/**
 * Effective seed rate considering bud type option.
 * PLACEHOLDER - to be replaced with real engine logic.
 */
export function getEffectiveSeedRate(params: ParametersState): number {
  if (params.budType === 'SINGLE BUD') {
    return Math.round(params.seedRateQtlPerHa * 0.7); // Single bud uses ~30% less seed cane
  }
  return params.seedRateQtlPerHa;
}

/**
 * Calculates seed required for a given target fresh planting area.
 * PLACEHOLDER - to be replaced with real engine logic.
 */
/**
 * The share of standing area that must be freshly planted each year.
 *
 * A field runs plant -> ratoon I -> (ratoon II) -> plough out. If `r` fields
 * carry to ratoon for every 1 planted, and a fraction `carry` of those go on to
 * a second ratoon, then in steady state:
 *
 *     total = P + r*P + carry*r*P      so     P/total = 1 / (1 + r*(1 + carry))
 *
 * This replaces a hardcoded 0.52, which is what the formula yields at the
 * default ratio of 0.9 - someone computed it once and froze it. Against the
 * 2026-27 survey's measured 0.677 it returns 0.587, reproducing the observed
 * free-to-replant area to within 5 ha.
 */
export function getFreshPlantRatio(params: ParametersState): number {
  const carry = params.ratoonsTaken >= 2 ? params.ratoonIICarryRatePct / 100 : 0;
  const r = Math.max(0, params.ratoonToPlantRatio);
  return 1 / (1 + r * (1 + carry));
}

/**
 * Hectares free to replant this season - the area coming out of ratoon.
 * Everything else is locked under a standing crop of a variety already chosen.
 */
export function getFreeReplantableHa(params: ParametersState, totalAreaHa?: number): number {
  const total = totalAreaHa && totalAreaHa > 0 ? totalAreaHa : params.commandAreaHa;
  return Math.round(total * (1 - getFreshPlantRatio(params)));
}

export function calculateSeedRequiredQtl(
  areaHa: number,
  effectiveSeedRateQtlPerHa: number
): number {
  return Math.round(areaHa * effectiveSeedRateQtlPerHa);
}

/**
 * Calculates max fresh plantable area based on available seed.
 * PLACEHOLDER - to be replaced with real engine logic.
 */
export function calculateMaxPlantableHa(
  seedAvailableQtl: number,
  effectiveSeedRateQtlPerHa: number
): number {
  if (effectiveSeedRateQtlPerHa <= 0) return 0;
  return Math.floor(seedAvailableQtl / effectiveSeedRateQtlPerHa);
}

/**
 * Computes 3-year projections by variety.
 * PLACEHOLDER - to be replaced with real engine logic.
 *
 * Accounts for:
 * - Sugarcane crop cycle: Fresh planted cane in year T becomes ratoon in year T+1
 * - Free replantable land (~23,161 ha base) vs locked ratoon (~33,135 ha base)
 * - Multiplication rate (1 ha seed plot produces enough seed for ~8 ha next year)
 * - Mode A (Target-driven) vs Mode B (Seed-driven)
 */
/**
 * The most hectares a variety can reach next season.
 *
 * Who supplies the seed decides the ceiling, and the two cases are different in
 * kind:
 *
 *   Farmers already grow it  - they cut seed from their own standing crop, for
 *                              replanting and for taking new ground alike. The
 *                              limit is how fast that crop multiplies, which is
 *                              the multiplication factor tempered by how much
 *                              they hold back rather than crush.
 *
 *   Not out there yet        - every hectare has to come from mill seed, so the
 *                              nursery stock and the purchase ceiling bind hard.
 *
 * Both the projection and the seed check call this, so seed-driven mode caps at
 * exactly the figure target-driven mode warns against.
 */
export function getMaxReachableHa(
  prevAreaHa: number,
  params: ParametersState,
  retentionPct: number,
  seedAvailableQtl: number
): number {
  if (prevAreaHa <= 0) {
    const fromStock = calculateMaxPlantableHa(seedAvailableQtl, getEffectiveSeedRate(params));
    return Math.min(fromStock, params.seedPurchaseCeilingHa);
  }
  const retentionRate = Math.max(0, retentionPct) / 100;
  const expansionRatio = 1 + (params.defaultMultiplicationFactor * retentionRate - 1) * 0.35;
  // Never below what it already holds - farmers can always replant their own.
  return Math.round(prevAreaHa * Math.max(1, expansionRatio));
}

export function calculateYearlyProjections(
  varieties: VarietyRecord[],
  params: ParametersState,
  strategies: Record<string, VarietyStrategySetting>,
  mode: StrategyMode
): YearProjectionItem[] {
  const seedRate = getEffectiveSeedRate(params);
  const totalCommandArea = params.commandAreaHa;
  const freshPlantRatio = getFreshPlantRatio(params);

  // Base Year breakdown
  const baseBreakdown: Record<string, number> = {};
  let baseTotalArea = 0;
  let baseWeightedSucrose = 0;

  varieties.forEach((v) => {
    baseBreakdown[v.id] = v.currentAreaHa;
    baseTotalArea += v.currentAreaHa;
    baseWeightedSucrose += v.currentAreaHa * v.juiceSucrosePct;
  });

  const baseBlendedSucrose =
    baseTotalArea > 0 ? Number((baseWeightedSucrose / baseTotalArea).toFixed(2)) : 17.4;
  const baseRecovery = Number((baseBlendedSucrose * params.juiceToRecoveryFactor).toFixed(2));

  // We will build Year 1, Year 2, Year 3
  const projections: YearProjectionItem[] = [
    {
      year: `Base (${params.baseYear})`,
      totalAreaHa: baseTotalArea,
      varietyBreakdown: { ...baseBreakdown },
      blendedSucrosePct: baseBlendedSucrose,
      estimatedRecoveryPct: baseRecovery,
      caneDivertedToSeedTonnes: 125000,
    },
  ];

  // Progressive projection tracking
  let prevYearAreas = { ...baseBreakdown };
  let currentSeedStock: Record<string, number> = {};
  varieties.forEach((v) => {
    currentSeedStock[v.id] = v.seedAvailableQtl;
  });

  // The horizon is a parameter. Clamped so a stray value cannot spin the loop.
  const horizon = Math.max(1, Math.min(5, Math.round(params.planningHorizonYears || 3)));
  const years = Array.from({ length: horizon }, (_, i) => `Year ${i + 1}`);

  years.forEach((yearLabel, yIdx) => {
    const yearNum = yIdx + 1;
    const yearBreakdown: Record<string, number> = {};
    let yearTotalArea = 0;
    let totalSeedUsedQtl = 0;

    varieties.forEach((v) => {
      const strat = strategies[v.id] || {
        varietyId: v.id,
        strategy: v.strategy,
        retentionPreset: 'BALANCED',
        retentionPct: 50,
      };

      // Multiplication is a ratio of nursery to farmer planting density, not a
      // variety trait - so it is one mill-wide setting, never per variety.
      const multFactor = params.defaultMultiplicationFactor;
      const prevArea = prevYearAreas[v.id] || 0;
      const availableSeed = currentSeedStock[v.id] || 0;
      const maxSeedHa = calculateMaxPlantableHa(availableSeed, seedRate);

      let targetArea = 0;

      if (mode === 'target-driven') {
        // Whatever was typed for this year; untouched years hold their area.
        const asked = strat.targetsHa?.[yIdx];
        targetArea = typeof asked === 'number' && Number.isFinite(asked) ? asked : prevArea;
      } else {
        // Mode B: Seed-driven algorithm
        switch (strat.strategy) {
          case 'EXIT': {
            // Rapid phase-out: locked ratoon in Y1, then minimal in Y2, 0 in Y3
            if (yearNum === 1) targetArea = Math.round(prevArea * 0.45);
            else if (yearNum === 2) targetArea = Math.round(prevArea * 0.15);
            else targetArea = 0;
            break;
          }
          case 'REDUCE': {
            // Gradual reduction by ~25% each year
            targetArea = Math.max(0, Math.round(prevArea * 0.75));
            break;
          }
          case 'HOLD': {
            // Steady state
            targetArea = Math.round(prevArea * 0.98);
            break;
          }
          case 'INTRODUCE-NEW': {
            // Started from test plot / purchased seed
            if (prevArea === 0) {
              const initialHa = Math.min(params.seedPurchaseCeilingHa, params.testPlotSizeHa);
              targetArea = initialHa;
            } else {
              const retentionRate = (strat.retentionPct || 50) / 100;
              const expansionHa = Math.round(prevArea * multFactor * retentionRate);
              targetArea = Math.min(expansionHa, prevArea * 5);
            }
            break;
          }
          case 'EXPAND':
          default: {
            const retentionRate = (strat.retentionPct || 50) / 100;

            // Who supplies the seed decides what limits the growth.
            //
            // Once farmers hold a variety they multiply it themselves, from their
            // own standing crop - for replanting AND for taking new ground. So the
            // mill's nursery stock does not cap them; their own multiplication
            // rate and retention choice does, which is what expansionRatio models.
            //
            // A variety farmers do not have yet is different. Every hectare of it
            // has to come from mill seed, so there the stock is a hard ceiling.
            targetArea = getMaxReachableHa(
              prevArea,
              params,
              strat.retentionPct || 50,
              availableSeed
            );
            break;
          }
        }
      }

      // Enforce physical constraints: cannot exceed 50% of command area per variety
      const varietyMaxCapHa = (params.maxVarietyConcentrationPct / 100) * totalCommandArea;
      targetArea = Math.min(targetArea, varietyMaxCapHa);

      yearBreakdown[v.id] = targetArea;
      yearTotalArea += targetArea;
    });

    // The land is finite, and nothing above knew that.
    //
    // Each variety's target is worked out on its own - its strategy, its seed,
    // its own 40% ceiling - and the results were simply added up. Eighty-six
    // varieties each allowed to grow independently summed to 131,703 ha against
    // a 56,491 ha command area: more than twice the land that exists. A varietal
    // plan redistributes the command area between varieties, it does not create
    // new ground.
    //
    // So where the targets ask for more land than there is, every variety is
    // scaled back by the same factor. That keeps the mix the strategies asked
    // for - which is what the plan is actually about - while fitting what can
    // be planted. Asking for less than the command area is left alone: a plan
    // that shrinks the crop is a real answer, not an error.
    if (yearTotalArea > totalCommandArea && yearTotalArea > 0) {
      const fit = totalCommandArea / yearTotalArea;
      let scaled = 0;
      varieties.forEach((v) => {
        yearBreakdown[v.id] = Math.round((yearBreakdown[v.id] || 0) * fit);
        scaled += yearBreakdown[v.id];
      });
      yearTotalArea = scaled;
    }

    // Seed is costed against the area actually planned, so it has to come after
    // the fit above - charging the mill for seed it was never going to plant
    // was how the old single pass got it wrong.
    varieties.forEach((v) => {
      const strat = strategies[v.id];
      const area = yearBreakdown[v.id] || 0;

      const freshPlantHa = Math.round(area * freshPlantRatio);
      totalSeedUsedQtl += calculateSeedRequiredQtl(freshPlantHa, seedRate);

      // Seed generated for next year
      const seedHarvestHa = Math.round(area * ((strat?.retentionPct ?? 50) / 100) * 0.15);
      // Cane produced per hectare. Use the variety's own yield where Step 2 has it,
      // otherwise fall back to the old flat assumption of 800 qtl/ha.
      const yieldQtlPerHa = v.caneYieldTha ? v.caneYieldTha * 10 : 800;
      const newSeedGenQtl = seedHarvestHa * yieldQtlPerHa;
      // No floor. Telling the planner that seed has run out is the whole point of
      // this screen; a minimum of 100 qtl meant scarcity could never actually bite.
      currentSeedStock[v.id] = Math.max(0, Math.round(newSeedGenQtl));
    });

    let weightedSucrose = 0;
    varieties.forEach((v) => {
      const a = yearBreakdown[v.id] || 0;
      weightedSucrose += a * v.juiceSucrosePct;
    });

    const blendedSucrose =
      yearTotalArea > 0 ? Number((weightedSucrose / yearTotalArea).toFixed(2)) : 17.5;
    // Same factor as the base year, and nothing added for the passage of time.
    // This used to be `* 0.638 + yearNum * 0.08`, which handed every projection
    // 0.08% recovery a year for free - Year 3 opened 0.24% ahead before any
    // varietal change was counted, so the plan always looked like it worked.
    const recovery = Number((blendedSucrose * params.juiceToRecoveryFactor).toFixed(2));

    projections.push({
      year: yearLabel,
      totalAreaHa: yearTotalArea,
      varietyBreakdown: yearBreakdown,
      blendedSucrosePct: blendedSucrose,
      estimatedRecoveryPct: recovery,
      caneDivertedToSeedTonnes: Math.round((totalSeedUsedQtl * 100) / 1000), // qtl to tonnes
    });

    prevYearAreas = { ...yearBreakdown };
  });

  return projections;
}

/**
 * Calculates seed balance table for Year 1 planting.
 * PLACEHOLDER - to be replaced with real engine logic.
 */
export function calculateSeedBalances(
  varieties: VarietyRecord[],
  params: ParametersState,
  strategies: Record<string, VarietyStrategySetting>,
  projections: YearProjectionItem[],
  /** Needed so a target-driven ask can be judged before the caps trim it. */
  mode: StrategyMode = 'seed-driven'
): VarietySeedBalance[] {
  const seedRate = getEffectiveSeedRate(params);
  const year1 = projections[1] || projections[0] || { totalAreaHa: params.commandAreaHa, varietyBreakdown: {} };
  const breakdown = year1.varietyBreakdown || {};

  return varieties.map((v) => {
    const plannedAreaHa = breakdown[v.id] || 0;

    // Seed from the mill is needed only for area a variety does not already hold.
    //
    // When a farmer replants the same variety on the same land he cuts seed from
    // his own crop - he does not buy it. So the mill's nursery exists to introduce
    // and scale varieties, not to reseed the command area every year.
    //
    // This used to charge every variety for its total fresh planting. On CO 0118
    // that demanded 594,295 qtl to stand still, against 16,295 qtl held - and the
    // same rule across all varieties asked the mill for 26x the seed it has.
    // A variety farmers already grow is self-supplying - they cut seed from their
    // own crop, for holding and for expanding alike. The mill's nursery is called
    // on only for a variety that is not out there yet.
    const retentionPct = strategies[v.id]?.retentionPct ?? 50;
    const growthHa = Math.max(0, plannedAreaHa - v.currentAreaHa);
    const areaToPlantHa =
      v.strategy === 'EXIT' ? 0 : v.currentAreaHa > 0 ? 0 : Math.round(growthHa);

    // Whether the mill supplies the seed or the farmer does, the plan still has to
    // be reachable. In target-driven mode nothing else catches an impossible ask.
    const reachableHa =
      v.strategy === 'EXIT' ? plannedAreaHa
        : getMaxReachableHa(v.currentAreaHa, params, retentionPct, v.seedAvailableQtl);

    // Judge what was ASKED FOR, not what survived the caps. The concentration cap
    // trims the projection first, so comparing against the projection let an
    // impossible target pass silently - the planner typed 60,000 ha, got 22,596,
    // and was told nothing.
    const asked = mode === 'target-driven' ? strategies[v.id]?.targetsHa?.[0] : undefined;
    const requestedHa =
      typeof asked === 'number' && Number.isFinite(asked) ? asked : plannedAreaHa;

    const concentrationCapHa = Math.round(
      (params.maxVarietyConcentrationPct / 100) * params.commandAreaHa
    );
    const shortfallHa = Math.max(0, Math.round(requestedHa - reachableHa));
    const overCapHa = Math.max(0, Math.round(requestedHa - concentrationCapHa));
    const seedRequiredQtl = calculateSeedRequiredQtl(areaToPlantHa, seedRate);
    const seedAvailableQtl = v.seedAvailableQtl || 0;
    const balanceQtl = seedAvailableQtl - seedRequiredQtl;

    let statusText: VarietySeedBalance['statusText'] = 'Adequate';
    let isFeasible = true;
    let warningMessage: string | undefined = undefined;

    // Report whichever limit actually binds, and name it.
    if (overCapHa > 0 && concentrationCapHa <= reachableHa) {
      statusText = 'Deficit';
      isFeasible = false;
      warningMessage =
        `${v.name}: target of ${Math.round(requestedHa).toLocaleString()} ha breaches the ` +
        `${params.maxVarietyConcentrationPct}% concentration cap of ${concentrationCapHa.toLocaleString()} ha ` +
        `- over by ${overCapHa.toLocaleString()} ha. Raise the cap in Step 3 or lower the target.`;
    } else if (shortfallHa > 0 && v.currentAreaHa > 0) {
      // Farmers hold it, so mill stock is not the issue - the target simply
      // outruns how fast the standing crop can multiply.
      statusText = 'Deficit';
      isFeasible = false;
      warningMessage =
        `${v.name}: target of ${Math.round(requestedHa).toLocaleString()} ha outruns multiplication. ` +
        `From ${v.currentAreaHa.toLocaleString()} ha at ${retentionPct}% retention the most reachable next season is ` +
        `${reachableHa.toLocaleString()} ha - short by ${shortfallHa.toLocaleString()} ha.`;
    } else if (seedAvailableQtl === 0 && areaToPlantHa > 0) {
      statusText = 'Zero Seed';
      isFeasible = false;
      warningMessage = `${v.name}: expanding by ${areaToPlantHa.toLocaleString()} ha but no seed is held. Purchase from the breeder or multiply on mill land first.`;
    } else if (balanceQtl < -1000) {
      statusText = 'Deficit';
      isFeasible = false;
      const maxPossibleHa = calculateMaxPlantableHa(seedAvailableQtl, seedRate);
      warningMessage = `${v.name}: expanding by ${areaToPlantHa.toLocaleString()} ha needs ${seedRequiredQtl.toLocaleString()} qtl, but only ${seedAvailableQtl.toLocaleString()} qtl is held - enough for ${maxPossibleHa.toLocaleString()} ha.`;
    } else if (areaToPlantHa === 0) {
      // Not growing, so it makes no claim on the nursery at all. Calling this
      // "Surplus" would put a green badge on 80-odd varieties and bury the few
      // that genuinely need seed.
      statusText = 'Adequate';
    } else if (balanceQtl > seedRequiredQtl * 0.4) {
      statusText = 'Surplus';
    }

    return {
      varietyId: v.id,
      varietyName: v.name,
      areaToPlantHa,
      seedRequiredQtl,
      seedAvailableQtl,
      balanceQtl,
      isFeasible,
      statusText,
      warningMessage,
    };
  });
}

/**
 * Evaluates mill compliance rules.
 * PLACEHOLDER - to be replaced with real engine logic.
 */
export function calculateCompliance(
  varieties: VarietyRecord[],
  params: ParametersState,
  projections: YearProjectionItem[],
  seedBalances: VarietySeedBalance[],
  /** Step 6 output. Empty until an allocation has been produced. */
  allocations: VillageAllocation[] = []
): ComplianceCheck[] {
  const year1 = projections[1] || projections[0] || { totalAreaHa: params.commandAreaHa, varietyBreakdown: {} };
  const totalArea = year1.totalAreaHa || 1;
  const breakdown = year1.varietyBreakdown || {};

  // 1. Max concentration cap
  let maxConcPct = 0;
  let topVarietyName = '';
  varieties.forEach((v) => {
    const a = breakdown[v.id] || 0;
    const conc = (a / totalArea) * 100;
    if (conc > maxConcPct) {
      maxConcPct = conc;
      topVarietyName = v.name;
    }
  });
  const concentrationPassed = maxConcPct <= params.maxVarietyConcentrationPct;

  // 2. Lowland coverage floor
  let lowlandArea = 0;
  varieties.forEach((v) => {
    if (v.landSuitability === 'LOWLAND' || v.landSuitability === 'BOTH') {
      lowlandArea += breakdown[v.id] || 0;
    }
  });
  const lowlandCoveragePct = (lowlandArea / totalArea) * 100;
  const lowlandPassed = lowlandCoveragePct >= params.lowlandCoverageFloorPct;

  // 3. Seed sufficiency
  const deficitCount = seedBalances.filter((b) => b.balanceQtl < 0 && b.areaToPlantHa > 0).length;
  const seedPassed = deficitCount === 0;

  // 3b. Red rot exposure. Step 2's sheet carries a per-variety reaction; any
  //     variety marked S is a standing outbreak risk, so the plan should not
  //     rest more than the trigger share of the command area on them.
  let susceptibleHa = 0;
  const susceptibleNames: string[] = [];
  varieties.forEach((v) => {
    if (v.redRot === 'S') {
      const a = breakdown[v.id] || 0;
      if (a > 0) { susceptibleHa += a; susceptibleNames.push(v.name); }
    }
  });
  const susceptiblePct = (susceptibleHa / totalArea) * 100;
  const redRotKnown = varieties.some((v) => v.redRot);
  const redRotPassed = !redRotKnown || susceptiblePct <= params.redRotEmergencyThresholdPct;

  // 3c. Village-level concentration. The command-area cap can pass while a
  //     single village is planted almost entirely to one variety - which is
  //     where a disease outbreak actually starts. Needs Step 6's allocation.
  let worstVillage = '';
  let worstVillagePct = 0;
  if (allocations.length) {
    const byVillage = new Map<string, Map<string, number>>();
    allocations.forEach((a) => {
      if (!byVillage.has(a.village)) byVillage.set(a.village, new Map());
      const m = byVillage.get(a.village)!;
      m.set(a.varietyToPlant, (m.get(a.varietyToPlant) || 0) + a.areaFreeToReplantHa);
    });
    byVillage.forEach((m, village) => {
      const tot = [...m.values()].reduce((x, y) => x + y, 0);
      if (tot <= 0) return;
      const top = Math.max(...m.values());
      const pct = (top / tot) * 100;
      if (pct > worstVillagePct) { worstVillagePct = pct; worstVillage = village; }
    });
  }
  const villageCapPassed =
    allocations.length === 0 || worstVillagePct <= params.villageLevelConcentrationCapPct;

  // 4. Replantable land fit - derived from the crop-cycle sliders so that
  //    changing the ratoon assumptions actually moves the budget.
  // Every hectare that has to be planted fresh, not only the hectares the mill
  // supplies seed for.
  //
  // This used to sum seedBalances.areaToPlantHa, which is zero for any variety
  // already in the ground - the engine holds that those multiply from the
  // farmer's own crop. Every variety in the survey is already in the ground, so
  // the total was always 0, and a check called "plan fits replantable land"
  // passed by comparing nothing against 23,000 ha. It now asks the question it
  // says it asks: how much land does this plan need to replant, against how
  // much comes free.
  const totalFreshPlanting = Math.round(
    (year1.totalAreaHa || params.commandAreaHa) * getFreshPlantRatio(params)
  );
  // Sized off the command area, not the projection total: how much land comes
  // out of ratoon is a fact about the land, not about how much of it the plan
  // happens to cover.
  const freeReplantableLandHa = getFreeReplantableHa(params, params.commandAreaHa);
  const replantLandPassed = totalFreshPlanting <= freeReplantableLandHa * 1.05; // 5% tolerance

  return [
    {
      id: 'max-cap',
      label: 'No variety over concentration cap',
      passed: concentrationPassed,
      actual: `${maxConcPct.toFixed(1)}% (${topVarietyName})`,
      threshold: `≤ ${params.maxVarietyConcentrationPct}%`,
      detail: concentrationPassed
        ? `All varieties within the ${params.maxVarietyConcentrationPct}% concentration limit.`
        : `${topVarietyName} exceeds concentration limit by ${(maxConcPct - params.maxVarietyConcentrationPct).toFixed(1)}%.`,
    },
    {
      id: 'lowland-floor',
      label: 'Lowland coverage above floor',
      passed: lowlandPassed,
      actual: `${lowlandCoveragePct.toFixed(1)}%`,
      threshold: `≥ ${params.lowlandCoverageFloorPct}%`,
      detail: lowlandPassed
        ? `Lowland flood-tolerant varieties meet the minimum buffer.`
        : `Lowland area is ${lowlandCoveragePct.toFixed(1)}%, below the mandated ${params.lowlandCoverageFloorPct}% floor.`,
    },
    {
      id: 'seed-sufficient',
      label: 'Seed stock sufficiency',
      passed: seedPassed,
      actual: deficitCount === 0 ? 'All covered' : `${deficitCount} variety deficits`,
      threshold: '0 deficits',
      detail: seedPassed
        ? 'All varieties have sufficient seed nurseries for Year 1 planting targets.'
        : `${deficitCount} varieties have insufficient seed to meet the Year 1 planting target.`,
    },
    {
      id: 'village-cap',
      label: 'No village over concentration cap',
      passed: villageCapPassed,
      actual: allocations.length
        ? `${worstVillagePct.toFixed(1)}% (${worstVillage})`
        : 'No allocation yet',
      threshold: `≤ ${params.villageLevelConcentrationCapPct}%`,
      detail: !allocations.length
        ? 'Runs once Step 6 has produced a village allocation.'
        : villageCapPassed
        ? `Most concentrated village is ${worstVillage} at ${worstVillagePct.toFixed(1)}%, inside the ${params.villageLevelConcentrationCapPct}% cap.`
        : `${worstVillage} is ${worstVillagePct.toFixed(1)}% one variety - above the ${params.villageLevelConcentrationCapPct}% cap. A single outbreak there would take the whole village.`,
    },
    {
      id: 'red-rot',
      label: 'Red-rot exposure under trigger',
      passed: redRotPassed,
      actual: redRotKnown
        ? `${susceptiblePct.toFixed(1)}% on susceptible varieties`
        : 'Not yet known',
      threshold: `≤ ${params.redRotEmergencyThresholdPct}%`,
      detail: !redRotKnown
        ? 'No variety has a red rot reaction recorded. Fill the Red Rot column on the Step 2 sheet to enable this check.'
        : redRotPassed
        ? `Susceptible varieties hold ${susceptibleHa.toLocaleString()} ha, inside the ${params.redRotEmergencyThresholdPct}% quarantine trigger.`
        : `${susceptibleNames.slice(0, 3).join(', ')}${susceptibleNames.length > 3 ? ` and ${susceptibleNames.length - 3} more` : ''} carry ${susceptibleHa.toLocaleString()} ha - above the ${params.redRotEmergencyThresholdPct}% trigger.`,
    },
    {
      id: 'replant-fit',
      label: 'Plan fits replantable land',
      passed: replantLandPassed,
      actual: `${totalFreshPlanting.toLocaleString()} ha`,
      threshold: `≤ ${freeReplantableLandHa.toLocaleString()} ha free`,
      detail: replantLandPassed
        ? `Fresh planting of ${totalFreshPlanting.toLocaleString()} ha fits the ${freeReplantableLandHa.toLocaleString()} ha coming out of ratoon.`
        : `Fresh planting exceeds free land by ${(totalFreshPlanting - freeReplantableLandHa).toLocaleString()} ha.`,
    },
  ];
}

/**
 * Plain-language agronomy alerts and warnings.
 * PLACEHOLDER - to be replaced with real engine logic.
 */
export function generateAgronomyWarnings(
  varieties: VarietyRecord[],
  seedBalances: VarietySeedBalance[],
  compliance: ComplianceCheck[],
  params: ParametersState
): string[] {
  const warnings: string[] = [];

  // Red rot alert for CO 0238
  const co0238 = varieties.find((v) => v.name.includes('0238'));
  if (co0238 && co0238.strategy !== 'EXIT') {
    warnings.push(
      'CO 0238 Alert: Severe susceptibility to red rot epidemic in UP subtropical tract. Strategy should be set to EXIT to safeguard mill catchment.'
    );
  } else if (co0238) {
    warnings.push(
      `CO 0238 Phased Exit: Phasing out ${co0238.currentAreaHa.toLocaleString()} ha frees prime upland area for early-sucrose replacements (COLK 14201 & CO 15023).`
    );
  }

  // Seed deficit alerts
  seedBalances
    .filter((b) => !b.isFeasible && b.warningMessage)
    .forEach((b) => {
      if (b.warningMessage) warnings.push(b.warningMessage);
    });

  // Multiplication constraint alert
  const smallExpanding = varieties.filter((v) => v.currentAreaHa < 100 && v.strategy === 'EXPAND');
  if (smallExpanding.length > 0) {
    warnings.push(
      `Nursery Multiplier: ${smallExpanding.map((v) => v.name).join(', ')} currently have limited area (<100 ha). At ${params.defaultMultiplicationFactor}x multiplication, full commercial release requires at least 2 full nursery cycles.`
    );
  }

  // Concentration cap alert
  const capCheck = compliance.find((c) => c.id === 'max-cap');
  if (capCheck && !capCheck.passed) {
    warnings.push(
      `Risk Alert: ${capCheck.actual} breaches the monoculture concentration ceiling of ${params.maxVarietyConcentrationPct}%. High varietal concentration elevates disease vulnerability.`
    );
  }

  return warnings;
}

/**
 * Calculates live summary strip metrics.
 */
export function calculateSummaryMetrics(
  varieties: VarietyRecord[],
  params: ParametersState,
  strategies: Record<string, VarietyStrategySetting>,
  projections: YearProjectionItem[],
  /** The per-variety verdicts. The strip must agree with the cards above it. */
  seedBalances: VarietySeedBalance[] = []
) {
  const y1 = projections[1] || projections[0] || { totalAreaHa: params.commandAreaHa, varietyBreakdown: {} };
  const totalPlannedAreaHa = y1.totalAreaHa || params.commandAreaHa;
  const seedRate = getEffectiveSeedRate(params);
  const breakdown = y1.varietyBreakdown || {};

  let varietiesOverCapCount = 0;
  varieties.forEach((v) => {
    const plannedArea = breakdown[v.id] || 0;
    const sharePct = totalPlannedAreaHa > 0 ? (plannedArea / totalPlannedAreaHa) * 100 : 0;
    if (sharePct > params.maxVarietyConcentrationPct) varietiesOverCapCount++;
  });

  // Seed comes straight from the per-variety balances rather than being worked
  // out again here. This used to carry its own copy of the fresh-plant constant
  // and charge every variety for all of its replanting, so the strip could show
  // 1.8 million qtl while the cards above it showed almost none.
  const totalSeedRequiredQtl = seedBalances.reduce((sum, b) => sum + b.seedRequiredQtl, 0);

  // Feasibility used to test the concentration cap alone, so the strip reported
  // "FEASIBLE: OK" with seed deficits sitting on the cards directly above it.
  const infeasible = seedBalances.filter((b) => !b.isFeasible);
  const isFeasible = varietiesOverCapCount === 0 && infeasible.length === 0;

  let feasibilityReason: string;
  if (isFeasible) {
    feasibilityReason = 'Within concentration cap, and every target is reachable';
  } else if (varietiesOverCapCount > 0 && infeasible.length > 0) {
    feasibilityReason =
      `${varietiesOverCapCount} over the ${params.maxVarietyConcentrationPct}% cap, ` +
      `${infeasible.length} unreachable`;
  } else if (varietiesOverCapCount > 0) {
    feasibilityReason =
      `${varietiesOverCapCount} ${varietiesOverCapCount === 1 ? 'variety exceeds' : 'varieties exceed'} ` +
      `the ${params.maxVarietyConcentrationPct}% concentration cap`;
  } else {
    const first = infeasible[0];
    feasibilityReason =
      infeasible.length === 1
        ? `${first.varietyName}: target not reachable`
        : `${infeasible.length} varieties have targets that are not reachable`;
  }

  return {
    totalPlannedAreaHa,
    commandAreaHa: params.commandAreaHa,
    totalSeedRequiredQtl,
    varietiesOverCapCount,
    isFeasible,
    feasibilityReason,
  };
}

export const calculateComplianceChecks = calculateCompliance;
export const generateWarnings = (
  varieties: VarietyRecord[],
  params: ParametersState,
  complianceChecks: ComplianceCheck[],
  seedBalances: VarietySeedBalance[]
) => generateAgronomyWarnings(varieties, seedBalances, complianceChecks, params);

