/**
 * Work out what land a ratoon plot is sitting on.
 *
 * The ERP records LANDTYPE on plant, autumn and ratoon II rows, but on none of
 * the 92,319 plain RATOON rows - they come through blank and default to UPLAND.
 * Since every plot free to replant is a ratoon plot, that left the allocator
 * choosing varieties for 23,161 ha it believed was entirely upland, and put the
 * command area's lowland share on screen as 23.8% when the surveyed rows say
 * 39.5%.
 *
 * Nothing here invents data. It uses the land type the survey DID record, on
 * plots belonging to the same grower, and failing that the same village:
 *
 *   MEASURED  ratoon II - the ERP recorded it, so it is used as-is
 *   GROWER    this grower's own surveyed plots say what share is lowland
 *   VILLAGE   no measured plot for this grower, so the village's share is used
 *   UNKNOWN   neither available - left alone rather than guessed
 *
 * Within a grower the assignment is proportional, not per-plot: if his surveyed
 * land is 40% lowland, enough of his ratoon plots are marked lowland to reach
 * 40% of their area. Assigning each plot independently by majority would push
 * every grower to whichever type happened to lead and erase the minority.
 */

import type { FreePlot, LandTypeSource } from '../types';

export interface InferenceReport {
  plots: FreePlot[];
  /** Area by how the land type was arrived at. */
  basis: Record<LandTypeSource, number>;
  lowlandHa: number;
  uplandHa: number;
  unknownHa: number;
}

export function inferLandTypes(freePlots: FreePlot[]): InferenceReport {
  const byGrower = new Map<string, FreePlot[]>();
  const out: FreePlot[] = freePlots.map((p) => ({ ...p }));

  out.forEach((p) => {
    if (p.landType !== 'UNKNOWN') {
      p.landTypeSource = 'MEASURED';
      return;
    }
    const k = p.grower || `__solo__${p.id}`;
    if (!byGrower.has(k)) byGrower.set(k, []);
    byGrower.get(k)!.push(p);
  });

  byGrower.forEach((plots) => {
    const first = plots[0];
    const gShare = first.growerLowlandShare ?? -1;
    const vShare = first.villageLowlandShare ?? -1;

    const share = gShare >= 0 ? gShare : vShare;
    const source: LandTypeSource = gShare >= 0 ? 'GROWER' : vShare >= 0 ? 'VILLAGE' : 'UNKNOWN';

    if (source === 'UNKNOWN') {
      plots.forEach((p) => { p.landTypeSource = 'UNKNOWN'; });
      return;
    }

    const totalHa = plots.reduce((s, p) => s + p.areaHa, 0);
    let lowlandBudget = totalHa * share;

    // Largest plots first, so the budget is spent in whole plots with the least
    // rounding left over.
    [...plots]
      .sort((a, b) => b.areaHa - a.areaHa)
      .forEach((p) => {
        // Take the plot if most of it fits in what is left of the budget. That
        // keeps the grower's total close to the measured share either way.
        if (lowlandBudget >= p.areaHa * 0.5) {
          p.landType = 'LOWLAND';
          lowlandBudget -= p.areaHa;
        } else {
          p.landType = 'UPLAND';
        }
        p.landTypeSource = source;
      });
  });

  const basis: Record<LandTypeSource, number> = {
    MEASURED: 0, GROWER: 0, VILLAGE: 0, UNKNOWN: 0,
  };
  let lowlandHa = 0, uplandHa = 0, unknownHa = 0;
  out.forEach((p) => {
    basis[p.landTypeSource ?? 'UNKNOWN'] += p.areaHa;
    if (p.landType === 'LOWLAND') lowlandHa += p.areaHa;
    else if (p.landType === 'UPLAND') uplandHa += p.areaHa;
    else unknownHa += p.areaHa;
  });

  const r1 = (n: number) => Math.round(n * 10) / 10;
  (Object.keys(basis) as LandTypeSource[]).forEach((k) => { basis[k] = r1(basis[k]); });

  return { plots: out, basis, lowlandHa: r1(lowlandHa), uplandHa: r1(uplandHa), unknownHa: r1(unknownHa) };
}
