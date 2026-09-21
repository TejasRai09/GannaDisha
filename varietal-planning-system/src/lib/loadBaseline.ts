/**
 * Decode a prepared baseline.json.
 *
 * Two paths reach this file: someone choosing it on Step 1, and the app
 * fetching it on sign-in so the team lands on a screen that already has the
 * season's survey in it. Both go through this one function - the decoding was
 * duplicated once already and the two copies drifted.
 *
 * The plot rows are index arrays against three dictionaries rather than 178,635
 * objects. Written out in full that would be 9 MB; like this it is under two.
 */

import type {
  BaselineData,
  FreePlot,
  ParametersState,
  VarietyRecord,
  VarietyStrategySetting,
} from '../types';

export interface DecodedBaseline {
  baseline: BaselineData;
  freePlots?: FreePlot[];
}

/**
 * The worked scenario the deployment opens on, from build/make_preset.py.
 *
 * Steps 2, 3 and 4 arrive filled in so the app opens on a complete plan
 * rather than on six screens waiting for input. Most of it is measured from
 * the survey; `provisionalFields` names the handful that are not, and the app
 * says so on screen rather than letting them pass as mill figures.
 */
export interface DeployedPreset {
  provisional?: boolean;
  provisionalFields?: string[];
  note?: string;
  generatedAt?: string;
  varieties: VarietyRecord[];
  parameters?: Partial<ParametersState>;
  strategies?: Record<string, VarietyStrategySetting>;
}

/** Row shape: village, society, grower, land, area, variety, shares, stage. */
type PlotRow = [number, number, string, number, number, number, number?, number?, number?];

export function decodeBaseline(parsed: any): DecodedBaseline {
  const b = parsed?.baseline ?? parsed;
  if (!b || typeof b.surveyedAreaHa !== 'number') {
    throw new Error('That does not look like a baseline file.');
  }

  // make_baseline.py writes the variety list beside `baseline`, not inside it.
  // Without this the metrics load but Step 2 comes up empty.
  const varieties = b.varietyBreakdown ?? parsed?.varieties ?? [];

  const fp = parsed?.freePlots;
  let freePlots: FreePlot[] | undefined;
  if (fp?.rows?.length) {
    const { villages = [], societies = [], varieties: vnames = [], rows } = fp;
    freePlots = rows.map((r: PlotRow, i: number) => ({
      id: `p${i}`,
      village: villages[r[0]] ?? '',
      society: societies[r[1]] ?? '',
      grower: r[2],
      // 0 upland, 1 lowland, 2 = ratoon, which the ERP leaves blank
      landType:
        r[3] === 1 ? ('LOWLAND' as const)
        : r[3] === 2 ? ('UNKNOWN' as const)
        : ('UPLAND' as const),
      growerLowlandShare: r[6] ?? -1,
      villageLowlandShare: r[7] ?? -1,
      cropStage: (['PLANT', 'AUTUMN', 'RATOON', 'RATOON II'] as const)[r[8] ?? 2],
      areaHa: r[4],
      currentVariety: vnames[r[5]] ?? '',
    }));
  }

  return {
    baseline: {
      ...b,
      varietyBreakdown: varieties,
      dataQualityFlags: b.dataQualityFlags ?? [],
      // The tables behind each metric card on Step 1. Older baseline files
      // predate them; an empty array opens an empty panel, which at least
      // cannot throw.
      villageBreakdown: b.villageBreakdown ?? [],
      societyBreakdown: b.societyBreakdown ?? [],
    },
    freePlots,
  };
}

/**
 * Fetch the season's survey that ships with the deployment.
 *
 * Returns null rather than throwing when there is nothing there - a deployment
 * without a prepared baseline is a normal state, and Step 1 should simply ask
 * for an upload instead of showing an error.
 */
export async function fetchDeployedBaseline(
  signal?: AbortSignal
): Promise<DecodedBaseline | null> {
  try {
    const res = await fetch('/baseline.json', { credentials: 'same-origin', signal });
    if (!res.ok) return null;
    return decodeBaseline(await res.json());
  } catch {
    return null;
  }
}

/**
 * Fetch the worked scenario, if the deployment ships one.
 *
 * Null on anything unexpected, for the same reason as the baseline above: a
 * deployment without a preset is a normal state, and the app should fall back
 * to the survey-only registry rather than show an error.
 */
export async function fetchDeployedPreset(
  signal?: AbortSignal
): Promise<DeployedPreset | null> {
  try {
    const res = await fetch('/preset.json', { credentials: 'same-origin', signal });
    if (!res.ok) return null;
    const p = await res.json();
    return Array.isArray(p?.varieties) && p.varieties.length ? (p as DeployedPreset) : null;
  } catch {
    return null;
  }
}
