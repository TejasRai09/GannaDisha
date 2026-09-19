/**
 * Step 6 - plot-wise planting allocation.
 *
 * Steps 1-5 produce totals: "CO 0118 should be 18,000 ha". That is a number, not
 * an instruction. This turns it into one a supervisor can act on - which plot,
 * which variety, and where a plot is large enough, which part of which plot.
 *
 * The unit is a BLOCK, not a plot. A plot big enough to harvest in parts may
 * carry two or three varieties, and each block then ratoons as its own variety,
 * so the lock is finer than the plot. On Gobind's land that matters: the median
 * plot is 0.23 ha and only 15% are half a hectare or more - but those 15% hold
 * 40% of the area.
 *
 * Order of work:
 *
 *   1. WHAT EACH VARIETY STILL NEEDS.  Target area minus the area that carries
 *      itself over as ratoon. Negative means it is already above target.
 *
 *   2. WHO MAY GO WHERE.  A variety declared UPLAND cannot take a lowland plot.
 *      A variety with no land rule is not placed at all - Step 2's own rule,
 *      that nothing unclassified may be used.
 *
 *   3. EXIT PLOTS FIRST.  A plot finishing on a variety the plan wants gone is
 *      the plot the plan most wants to move, so it is offered first.
 *
 *   4. BY GROWER, NOT BY PLOT.  A grower's free plots are filled together and
 *      given different maturities where possible, so his harvest staggers even
 *      when each individual plot is too small to split. Over half of Gobind's
 *      growers already work this way across their plots.
 *
 *   5. VILLAGE CAP.  No village may end up more than the Step 3 cap on one
 *      variety - that is where an outbreak actually starts.
 */

import type {
  AllocationResult,
  FreePlot,
  ParametersState,
  PlotBlock,
  VarietyRecord,
  VarietyStrategySetting,
  VillageAllocation,
  YearProjectionItem,
} from '../types';

/**
 * Which planning year a plot becomes available to plant.
 *
 * A plot runs plant -> ratoon(s) -> plough out. So:
 *
 *   RATOON II    done now                            -> Year 1
 *   RATOON       done now, unless it carries to a     -> Year 1 (or 2 for the
 *                second ratoon                            carry fraction)
 *   PLANT/AUTUMN ratoons through Year 1, then free    -> Year 2 (or 3)
 *
 * The carry fraction is the Step 3 ratoon II rate: at Gobind only 3.8% of ratoon
 * fields take a second one, so nearly all of today's ratoon land is free now.
 * Assigning it proportionally rather than per plot keeps the totals honest.
 */
function assignFreeYears(plots: FreePlot[], params: ParametersState): FreePlot[] {
  const carry = params.ratoonsTaken >= 2 ? Math.max(0, params.ratoonIICarryRatePct / 100) : 0;

  const baseYearOf = (stage?: string): number => {
    if (stage === 'RATOON II') return 1;
    if (stage === 'RATOON') return 1;
    return 2; // PLANT and AUTUMN ratoon through Year 1
  };

  // Spend the carry fraction on whole plots, largest first, so the share lands
  // close without splitting a plot across two years.
  const eligibleForCarry = plots.filter(
    (p) => p.cropStage === 'RATOON' || p.cropStage === 'PLANT' || p.cropStage === 'AUTUMN'
  );
  const carryBudget = eligibleForCarry.reduce((s, p) => s + p.areaHa, 0) * carry;
  let spent = 0;
  const pushed = new Set<string>();
  if (carry > 0) {
    [...eligibleForCarry]
      .sort((a, b) => b.areaHa - a.areaHa)
      .forEach((p) => {
        if (spent + p.areaHa <= carryBudget) { pushed.add(p.id); spent += p.areaHa; }
      });
  }

  // Written in place. These objects are already this pipeline's own copies from
  // inferLandTypes, and copying 178,635 of them again just to add one field was
  // a third of a live heap for nothing.
  plots.forEach((p) => {
    p.freeInYear = baseYearOf(p.cropStage) + (pushed.has(p.id) ? 1 : 0);
  });
  return plots;
}

/** A plot below this cannot be harvested in parts, so it stays one variety. */
export const MIN_BLOCK_HA = 0.25;

interface Need {
  variety: VarietyRecord;
  remainingHa: number;
  maturity: string;
}

const isExiting = (v: VarietyRecord) => v.strategy === 'EXIT' || v.stage === 'RETIRED';

/** Can this variety legally take this plot? */
function eligible(v: VarietyRecord, plot: FreePlot): boolean {
  if (isExiting(v)) return false;
  const rule = v.landSuitability;
  // Step 2's rule: nothing unclassified may be placed.
  if (!rule || rule === 'UNKNOWN') return false;
  if (rule === 'BOTH') return true;
  // A plot whose land type could not be established takes only BOTH varieties.
  // Guessing here is how 23,161 ha came to be treated as upland.
  if (plot.landType === 'UNKNOWN') return false;
  return rule === plot.landType;
}

/**
 * Build the outstanding requirement per variety.
 *
 * A variety keeps the area that is mid-cycle without being given anything, so
 * what it needs from the free land is its target minus that carry-over.
 */
function buildNeeds(
  varieties: VarietyRecord[],
  projections: YearProjectionItem[],
  carryOverHa: Record<string, number>,
  year: number
): Need[] {
  // projections[0] is the base year, so Year N is projections[N].
  const target = projections[year] || projections[projections.length - 1] || projections[0];
  const breakdown = target?.varietyBreakdown ?? {};
  return varieties
    .filter((v) => !isExiting(v))
    .map((v) => ({
      variety: v,
      remainingHa: Math.max(0, (breakdown[v.id] ?? v.currentAreaHa) - (carryOverHa[v.id] ?? 0)),
      maturity: v.maturity || 'UNKNOWN',
    }))
    .filter((n) => n.remainingHa > 0)
    .sort((a, b) => b.remainingHa - a.remainingHa);
}

function allocateOneYear(
  freePlots: FreePlot[],
  varieties: VarietyRecord[],
  params: ParametersState,
  projections: YearProjectionItem[],
  year: number,
  basis: 'SURVEYED' | 'PROJECTED'
): AllocationResult {
  const totalFreeHa = freePlots.reduce((s, p) => s + p.areaHa, 0);

  // Area each variety holds that is NOT up for reassignment this season.
  const freeByVariety: Record<string, number> = {};
  const byName = new Map<string, VarietyRecord>();
  varieties.forEach((v) => byName.set(norm(v.name), v));
  freePlots.forEach((p) => {
    const v = byName.get(norm(p.currentVariety));
    if (v) freeByVariety[v.id] = (freeByVariety[v.id] || 0) + p.areaHa;
  });
  const carryOverHa: Record<string, number> = {};
  varieties.forEach((v) => {
    carryOverHa[v.id] = Math.max(0, v.currentAreaHa - (freeByVariety[v.id] || 0));
  });

  const needs = buildNeeds(varieties, projections, carryOverHa, year);
  const needById = new Map(needs.map((n) => [n.variety.id, n]));


  // Village cap, enforced as we go rather than reported afterwards.
  const villageTotalHa: Record<string, number> = {};
  const villageVarietyHa: Record<string, Record<string, number>> = {};
  freePlots.forEach((p) => {
    villageTotalHa[p.village] = (villageTotalHa[p.village] || 0) + p.areaHa;
  });
  const capFrac = Math.max(0.1, Math.min(1, params.villageLevelConcentrationCapPct / 100));
  const villageHeadroom = (village: string, varietyId: string, want: number): number => {
    const cap = (villageTotalHa[village] || 0) * capFrac;
    const used = villageVarietyHa[village]?.[varietyId] || 0;
    return Math.min(want, Math.max(0, cap - used));
  };
  const commitVillage = (village: string, varietyId: string, ha: number) => {
    if (!villageVarietyHa[village]) villageVarietyHa[village] = {};
    villageVarietyHa[village][varietyId] = (villageVarietyHa[village][varietyId] || 0) + ha;
  };

  // Group a grower's plots so his holding can be given a spread of maturities.
  const byGrower = new Map<string, FreePlot[]>();
  freePlots.forEach((p) => {
    const k = p.grower || `${p.village}|solo|${p.id}`;
    if (!byGrower.has(k)) byGrower.set(k, []);
    byGrower.get(k)!.push(p);
  });

  const blocks: PlotBlock[] = [];
  let plotsUsed = 0;
  let plotsSplit = 0;
  let unassignedPlots = 0;
  let unassignedHa = 0;

  byGrower.forEach((plots) => {
    // Plots coming off an exit variety first - those are the ones the plan most
    // wants moved. Larger plots next, since they can carry a split. Sorted in
    // place: this array is built fresh per grower and used nowhere else.
    const ordered = plots.sort((a, b) => {
      const ax = exitingPlot(a, byName) ? 1 : 0;
      const bx = exitingPlot(b, byName) ? 1 : 0;
      if (ax !== bx) return bx - ax;
      return b.areaHa - a.areaHa;
    });

    // Maturities already given to this grower, so the next plot can differ.
    const givenMaturity = new Set<string>();

    ordered.forEach((plot) => {
      // remainingHa first: once a variety is satisfied this skips the land test
      // entirely, which is why bucketing by land type turned out slower.
      const candidates = needs.filter(
        (n) => n.remainingHa > 0 && eligible(n.variety, plot)
      );
      if (!candidates.length) {
        unassignedPlots++;
        unassignedHa += plot.areaHa;
        return;
      }

      // How many blocks this plot can carry.
      const maxBlocks = Math.max(1, Math.floor(plot.areaHa / MIN_BLOCK_HA));
      const wantSplit = maxBlocks >= 2 && candidates.length >= 2;

      const chosen: Need[] = [];
      const pool = candidates; // already a fresh array from the filter above
      const take = wantSplit ? Math.min(maxBlocks, 2, pool.length) : 1;

      for (let i = 0; i < take; i++) {
        // Prefer a maturity this grower has not been given yet, so his harvest
        // staggers. Among equals, whichever variety needs the area most.
        const fresh = pool.filter((n) => !givenMaturity.has(n.maturity));
        const from = fresh.length && i === 0 ? fresh : pool;
        const pick = from.reduce((best, n) => {
          const bh = villageHeadroom(plot.village, best.variety.id, best.remainingHa);
          const nh = villageHeadroom(plot.village, n.variety.id, n.remainingHa);
          return nh > bh ? n : best;
        }, from[0]);
        if (!pick) break;
        if (villageHeadroom(plot.village, pick.variety.id, plot.areaHa) <= 0) {
          pool.splice(pool.indexOf(pick), 1);
          i--;
          if (!pool.length) break;
          continue;
        }
        chosen.push(pick);
        pool.splice(pool.indexOf(pick), 1);
        if (!pool.length) break;
      }

      if (!chosen.length) {
        unassignedPlots++;
        unassignedHa += plot.areaHa;
        return;
      }

      const share = plot.areaHa / chosen.length;
      const split = chosen.length > 1;
      const prevIsExit = exitingPlot(plot, byName);

      chosen.forEach((n) => {
        const ha = Math.round(Math.min(share, villageHeadroom(plot.village, n.variety.id, share)) * 1000) / 1000;
        if (ha <= 0) return;
        blocks.push({
          plotId: plot.id,
          year,
          basis,
          village: plot.village,
          society: plot.society,
          grower: plot.grower,
          landType: plot.landType as 'UPLAND' | 'LOWLAND',
          landTypeSource: plot.landTypeSource,
          areaHa: ha,
          variety: n.variety.name,
          previousVariety: plot.currentVariety,
          isSplit: split,
          isPriority: prevIsExit || undefined,
          priorityNote: prevIsExit
            ? `Replaces ${plot.currentVariety}, which the plan is exiting.`
            : undefined,
        });
        n.remainingHa = Math.max(0, n.remainingHa - ha);
        commitVillage(plot.village, n.variety.id, ha);
        givenMaturity.add(n.maturity);
      });

      plotsUsed++;
      if (split) plotsSplit++;
    });
  });

  // Roll up to villages, which is what the screen lists.
  const vmap = new Map<string, VillageAllocation>();
  blocks.forEach((b) => {
    const key = `y${b.year}|${b.village}|${b.variety}|${b.landType}`;
    const ex = vmap.get(key);
    if (ex) {
      ex.areaFreeToReplantHa = Math.round((ex.areaFreeToReplantHa + b.areaHa) * 100) / 100;
      ex.numberOfFields++;
      if (b.isPriority) { ex.isPriorityAction = true; ex.priorityNote = b.priorityNote; }
    } else {
      vmap.set(key, {
        id: `y${b.year}|${key}`,
        year: b.year,
        society: b.society,
        village: b.village,
        landType: b.landType,
        areaFreeToReplantHa: Math.round(b.areaHa * 100) / 100,
        varietyToPlant: b.variety,
        numberOfFields: 1,
        isPriorityAction: b.isPriority,
        priorityNote: b.priorityNote,
      });
    }
  });

  const unmetHa: Record<string, number> = {};
  needById.forEach((n) => {
    if (n.remainingHa > 0.5) unmetHa[n.variety.name] = Math.round(n.remainingHa * 10) / 10;
  });

  const totalAllocatedHa = Math.round(blocks.reduce((s, b) => s + b.areaHa, 0) * 10) / 10;

  const landTypeBasis = blocks.reduce((acc, b) => {
    const k = b.landTypeSource ?? 'UNKNOWN';
    acc[k] = Math.round(((acc[k] || 0) + b.areaHa) * 10) / 10;
    return acc;
  }, {} as Record<string, number>) as AllocationResult['landTypeBasis'];

  return {
    blocks,
    landTypeBasis,
    villages: [...vmap.values()].sort((a, b) => b.areaFreeToReplantHa - a.areaFreeToReplantHa),
    unmetHa,
    totalFreeHa: Math.round(totalFreeHa * 10) / 10,
    totalAllocatedHa,
    plotsUsed,
    plotsSplit,
    unassignedPlots,
    unassignedHa: Math.round(unassignedHa * 10) / 10,
  };
}

function norm(v: string): string {
  return (v || '').replace(/\s+/g, '').toUpperCase();
}

function exitingPlot(p: FreePlot, byName: Map<string, VarietyRecord>): boolean {
  const v = byName.get(norm(p.currentVariety));
  return v ? isExiting(v) : true; // unknown variety - treat as worth replacing
}

/**
 * The full plan: one allocation pass per planning year.
 *
 * Year 1 is planted on land the survey says is finishing its ratoon now, so it
 * rests on measured fact. Later years are planted on land the cycle says will
 * come free - today's plant crop finishing its ratoon, and then the plots this
 * plan itself sets in Year 1. Those are projections, and every block says so.
 *
 * A plot allocated in Year N carries its new variety through its ratoons and
 * comes free again in Year N + 1 + ratoons taken, so it re-enters the pool.
 */
export function allocatePlots(
  allPlots: FreePlot[],
  varieties: VarietyRecord[],
  params: ParametersState,
  projections: YearProjectionItem[],
  _strategies: Record<string, VarietyStrategySetting> = {}
): AllocationResult {
  const horizon = Math.max(1, Math.min(5, Math.round(params.planningHorizonYears || 3)));
  const dated = assignFreeYears(allPlots, params);
  const cycleYears = 1 + Math.max(1, params.ratoonsTaken || 1);

  const blocks: PlotBlock[] = [];
  const villages: VillageAllocation[] = [];
  const byYear: NonNullable<AllocationResult['byYear']> = [];
  const unmetHa: Record<string, number> = {};

  let totalFreeHa = 0, totalAllocatedHa = 0;
  let plotsUsed = 0, plotsSplit = 0, unassignedPlots = 0, unassignedHa = 0;

  // What each plot is carrying as the plan moves forward. Starts as the survey
  // found it; a plot allocated in Year N carries its new variety after that.
  const currentVariety = new Map<string, string>();
  dated.forEach((p) => currentVariety.set(p.id, p.currentVariety));
  const freeYear = new Map<string, number>();
  dated.forEach((p) => freeYear.set(p.id, p.freeInYear ?? 1));

  for (let year = 1; year <= horizon; year++) {
    // Filter, do not copy. What a plot now carries is applied to the object
    // itself before the pass, so no per-year duplicate of the plot list exists.
    const pool = dated.filter((p) => freeYear.get(p.id) === year);
    pool.forEach((p) => {
      const now = currentVariety.get(p.id);
      if (now !== undefined) p.currentVariety = now;
    });

    const basis: 'SURVEYED' | 'PROJECTED' = year === 1 ? 'SURVEYED' : 'PROJECTED';
    const res = allocateOneYear(pool, varieties, params, projections, year, basis);

    // A loop, not push(...spread). Year 2 alone produces about 97,000 blocks,
    // and spreading that many arguments into push overflows the call stack -
    // which is what killed the tab on opening Step 6.
    for (const b of res.blocks) blocks.push(b);
    for (const v of res.villages) villages.push(v);
    totalFreeHa += res.totalFreeHa;
    totalAllocatedHa += res.totalAllocatedHa;
    plotsUsed += res.plotsUsed;
    plotsSplit += res.plotsSplit;
    unassignedPlots += res.unassignedPlots;
    unassignedHa += res.unassignedHa;
    Object.entries(res.unmetHa).forEach(([k, v]) => {
      unmetHa[k] = Math.round(((unmetHa[k] || 0) + v) * 10) / 10;
    });

    byYear.push({
      year,
      basis,
      freeHa: res.totalFreeHa,
      allocatedHa: res.totalAllocatedHa,
      plotsUsed: res.plotsUsed,
      plotsSplit: res.plotsSplit,
      unassignedHa: res.unassignedHa,
    });

    // Hand this year's plots forward: they now carry what was planted on them,
    // and come free again once their own ratoons are finished.
    res.blocks.forEach((b) => {
      currentVariety.set(b.plotId, b.variety);
      freeYear.set(b.plotId, year + cycleYears);
    });
  }

  const landTypeBasis = blocks.reduce((acc, b) => {
    const k = b.landTypeSource ?? 'UNKNOWN';
    acc[k] = Math.round(((acc[k] || 0) + b.areaHa) * 10) / 10;
    return acc;
  }, {} as Record<string, number>) as AllocationResult['landTypeBasis'];

  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    blocks,
    villages: villages.sort(
      (a, b) => (a.year ?? 1) - (b.year ?? 1) || b.areaFreeToReplantHa - a.areaFreeToReplantHa
    ),
    byYear,
    landTypeBasis,
    unmetHa,
    totalFreeHa: r1(totalFreeHa),
    totalAllocatedHa: r1(totalAllocatedHa),
    plotsUsed,
    plotsSplit,
    unassignedPlots,
    unassignedHa: r1(unassignedHa),
  };
}
