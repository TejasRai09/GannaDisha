/* eslint-disable no-restricted-globals */
/**
 * Streams an ERP plot-survey .xlsx and produces the BaselineData the app needs.
 *
 * Why this is written by hand rather than with a spreadsheet library:
 * the workbook is ~78 MB on disk but ~556 MB of XML inside. Any library that
 * builds a cell object model for that will use several GB and kill the tab.
 * So we walk the sheet XML row by row, keep only the ~14 columns that matter,
 * accumulate totals, and throw each row away immediately. Memory stays flat
 * apart from two Sets (distinct fields and distinct growers).
 *
 * Runs in a Worker, so the interface stays responsive throughout.
 */

import { unzipSync, strFromU8 } from 'fflate';
import type { FreePlot } from '../types';

/* ------------------------------------------------------------------ columns */
/**
 * Columns are found by HEADER NAME, not by letter.
 *
 * The 2026-27 export changed shape between August and September: a G_LOCK column
 * appeared at position L and pushed everything after it one to the right, plus
 * three columns were appended. Fixed letters silently read the wrong field -
 * soil type where land type belonged - and the app would have shown confident
 * nonsense rather than failing. Names are stable; positions are not.
 */
const HEADER_NAMES = {
  societyCode: ['g_soc_cd'],
  society: ['so_name'],
  growerVillageCode: ['pl_vill'],
  growerCode: ['pl_grow'],
  plotVillage: ['plotvillagename'],
  areaHa: ['pl_area'],
  cropCategory: ['cropcategory'],
  variety: ['vr_name'],
  cropType: ['croptype'],
  diseases: ['diseases'],
  soilType: ['soiltype'],
  landType: ['landtype'],
  irrigation: ['irrigration'],
  lat1: ['pl_lat_1'], lon1: ['pl_lon_1'],
  lat2: ['pl_lat_2'], lon2: ['pl_lon_2'],
  lat3: ['pl_lat_3'], lon3: ['pl_lon_3'],
  lat4: ['pl_lat_4'], lon4: ['pl_lon_4'],
  plantDate: ['pl_plant_dt'],
} as const;

/**
 * Present only in the September 2026 export onward. Absent columns are fine -
 * they simply produce no flag, so older exports keep working unchanged.
 */
const OPTIONAL_HEADER_NAMES = {
  uploadYn: ['upload_yn'],
  errorDesc: ['amity_errordesc'],
} as const;
type OptColKey = keyof typeof OPTIONAL_HEADER_NAMES;
let OPT = {} as Partial<Record<OptColKey, string>>;

type ColKey = keyof typeof HEADER_NAMES;
/** Filled from row 1 before any data row is read. */
let COL = {} as Record<ColKey, string>;

/** Build the name -> column-letter map from the header row. */
function resolveColumns(headerCells: Record<string, string>): Record<ColKey, string> {
  const byName: Record<string, string> = {};
  Object.entries(headerCells).forEach(([letter, label]) => {
    const k = String(label).trim().toLowerCase();
    if (k && !(k in byName)) byName[k] = letter;
  });
  const out = {} as Record<ColKey, string>;
  const missing: string[] = [];
  (Object.keys(HEADER_NAMES) as ColKey[]).forEach((field) => {
    const hit = HEADER_NAMES[field].find((n) => n in byName);
    if (hit) out[field] = byName[hit];
    else missing.push(HEADER_NAMES[field][0]);
  });
  if (missing.length) {
    throw new Error(
      `This workbook is missing ${missing.length} expected column(s): ${missing.join(', ')}. ` +
        `Is it the plot-wise survey export?`
    );
  }

  OPT = {};
  (Object.keys(OPTIONAL_HEADER_NAMES) as OptColKey[]).forEach((field) => {
    const hit = OPTIONAL_HEADER_NAMES[field].find((n) => n in byName);
    if (hit) OPT[field] = byName[hit];
  });
  return out;
}

const LAT_MIN = 27, LAT_MAX = 29, LON_MIN = 80, LON_MAX = 82;

type Msg =
  | { type: 'progress'; pct: number; label: string }
  | { type: 'done'; payload: unknown }
  | { type: 'error'; message: string };

const post = (m: Msg) => (self as unknown as Worker).postMessage(m);

/** Strip the row number from a cell ref: "AR12345" -> "AR". */
function colOf(ref: string): string {
  let i = 0;
  while (i < ref.length && ref.charCodeAt(i) > 57) i++;
  return ref.slice(0, i);
}

function decodeXmlEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

/** sharedStrings.xml -> flat array. Only ~1 MB, so it is safe to hold. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(xml))) {
    const inner = si[1];
    let text = '';
    let t: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((t = tRe.exec(inner))) text += t[1];
    out.push(decodeXmlEntities(text));
  }
  return out;
}

const norm = (v: string) => v.replace(/\s+/g, '').toUpperCase();

export interface ParseResult {
  baseline: Record<string, unknown>;
  varieties: { name: string; areaHa: number; records: number; lowlandSharePct: number; maturity: string }[];
  freePlots: FreePlot[];
}

function run(buffer: ArrayBuffer, fileName: string, fileSize: number): ParseResult {
  post({ type: 'progress', pct: 4, label: 'Opening workbook' });

  // fflate decompresses entries individually, so we never hold the whole
  // uncompressed workbook - just the one sheet we care about.
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (f) =>
      f.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet1\.xml$/.test(f.name),
  });

  const sharedRaw = files['xl/sharedStrings.xml'];
  post({ type: 'progress', pct: 12, label: 'Reading shared strings' });
  const shared = sharedRaw ? parseSharedStrings(strFromU8(sharedRaw)) : [];

  const sheetBytes = files['xl/worksheets/sheet1.xml'];
  if (!sheetBytes) throw new Error('sheet1.xml not found - is this an ERP survey export?');

  post({ type: 'progress', pct: 20, label: 'Scanning rows' });

  /* ------------------------------------------------------------ accumulators */
  let totalRecords = 0;
  let droppedGps = 0;
  let areaTotal = 0;

  const cropHa: Record<string, number> = {};
  const landHa: Record<string, number> = {};
  let landRecordedHa = 0, landUnrecordedHa = 0;
  // Measured land type per grower and per village, from rows that actually carry
  // it. Used to infer what a ratoon plot sits on, since the ERP records nothing.
  const growerLow: Record<string, number> = {}, growerTot: Record<string, number> = {};
  const villageLow: Record<string, number> = {}, villageTot: Record<string, number> = {};
  const varietyHa: Record<string, number> = {};
  const varietyRecords: Record<string, number> = {};
  const varietyLowland: Record<string, number> = {};
  const varietyMaturity: Record<string, string> = {};

  const plotKeys = new Set<string>();

  // Plots finishing their ratoon cycle - the only land Step 6 can reassign.
  // Keyed by GPS so several grower rows on one field collapse into one plot.
  interface FreePlotAgg {
    village: string; society: string; grower: string;
    landType: 'UPLAND' | 'LOWLAND' | 'UNKNOWN'; areaHa: number; currentVariety: string;
    cropStage: 'PLANT' | 'AUTUMN' | 'RATOON' | 'RATOON II';
  }
  const freePlotMap = new Map<string, FreePlotAgg>();
  const growerKeys = new Set<string>();
  const villages = new Set<string>();
  const societies = new Set<string>();

  // Per-village and per-society detail so each headline number can be opened up.
  // 334 villages and 7 societies, so these stay small.
  interface Agg {
    areaHa: number; records: number;
    fields: Set<string>; growers: Set<string>;
    villages?: Set<string>;
    society?: string;
  }
  const byVillage = new Map<string, Agg>();
  const bySociety = new Map<string, Agg>();
  const touch = (m: Map<string, Agg>, k: string): Agg => {
    let a = m.get(k);
    if (!a) { a = { areaHa: 0, records: 0, fields: new Set(), growers: new Set(), villages: new Set() }; m.set(k, a); }
    return a;
  };

  let soilBlank = 0;
  let dateUsable = 0;
  let plantIrrYes = 0, plantRows = 0;
  let ratIrrYes = 0, ratRows = 0;
  let diseaseNone = 0;
  let uploadFailRows = 0, uploadFailHa = 0;
  const uploadFailReasons: Record<string, number> = {};

  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;

  // Decode the sheet in windows instead of all at once. A JS string holds two
  // bytes per character, so turning 556 MB of XML into one string would need
  // over a gigabyte and stall the tab. Here at most a few MB exists at a time:
  // each window is decoded, whole <row> elements are consumed, and the partial
  // tail is carried into the next window.
  const WINDOW = 4 << 20; // 4 MB
  const decoder = new TextDecoder('utf-8');
  const totalBytes = sheetBytes.length;
  let offset = 0;
  let carry = '';
  let lastPct = 20;
  let firstRow = true;

  const processBuffer = (buf: string, isLast: boolean): string => {
    rowRe.lastIndex = 0;
    let consumedTo = 0;
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(buf))) {
      consumedTo = rowRe.lastIndex;
      if (firstRow) {
        firstRow = false;
        // Row 1 names the columns. Everything after depends on this map.
        COL = resolveColumns(readCells(row[1]));
        continue;
      }
      handleRow(row[1]);
    }
    return isLast ? '' : buf.slice(consumedTo);
  };

  /** One row's cells, keyed by column letter. */
  function readCells(inner: string): Record<string, string> {
    const cells: Record<string, string> = {};
    cellRe.lastIndex = 0;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(inner))) {
      const col = colOf(c[1]);
      const attrs = c[2];
      const body = c[3];
      const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      let val = vm ? vm[1] : '';
      if (attrs.indexOf('t="s"') !== -1) {
        val = shared[Number(val)] ?? '';
      } else if (attrs.indexOf('t="inlineStr"') !== -1) {
        const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
        val = im ? decodeXmlEntities(im[1]) : '';
      }
      cells[col] = val;
    }
    return cells;
  }

  function handleRow(inner: string) {
    const cells = readCells(inner);

    const area = parseFloat(cells[COL.areaHa] || '0') || 0;
    const variety = (cells[COL.variety] || '').trim();
    const crop = (cells[COL.cropType] || '').trim().toUpperCase();
    const land = (cells[COL.landType] || '').trim().toUpperCase();

    totalRecords++;
    areaTotal += area;
    if (crop) cropHa[crop] = (cropHa[crop] || 0) + area;
    // Land type is recorded on plant, autumn and ratoon II, but on no RATOON row
    // at all - a field does not become upland when it ratoons, the column is
    // simply not filled. Averaging those in understates lowland badly, so the
    // split is measured only where the value exists.
    if (land && crop !== 'RATOON') {
      landHa[land] = (landHa[land] || 0) + area;
      landRecordedHa += area;
    } else {
      landUnrecordedHa += area;
    }

    if (variety) {
      const k = norm(variety);
      varietyHa[k] = (varietyHa[k] || 0) + area;
      varietyRecords[k] = (varietyRecords[k] || 0) + 1;
      if (land === 'LOWLAND') varietyLowland[k] = (varietyLowland[k] || 0) + 1;
      // CROPCATEGORY is the UP maturity class and is consistent per variety,
      // so the first non-blank value stands for the whole variety.
      if (!varietyMaturity[k]) {
        const cat = (cells[COL.cropCategory] || '').trim().toUpperCase();
        if (cat) varietyMaturity[k] = cat;
      }
    }

    const village = (cells[COL.plotVillage] || '').trim();
    if (village) villages.add(village);
    const society = (cells[COL.society] || '').trim();
    if (society) societies.add(society);

    const vAgg = village ? touch(byVillage, village) : null;
    const sAgg = society ? touch(bySociety, society) : null;
    if (vAgg) { vAgg.areaHa += area; vAgg.records++; if (society) vAgg.society = society; }
    if (sAgg) { sAgg.areaHa += area; sAgg.records++; if (village) sAgg.villages!.add(village); }

    // A grower code repeats between villages, so identity is the composite.
    const gk = `${cells[COL.societyCode] || ''}|${cells[COL.growerVillageCode] || ''}|${cells[COL.growerCode] || ''}`;
    if (gk !== '||') {
      growerKeys.add(gk);
      vAgg?.growers.add(gk);
      sAgg?.growers.add(gk);
    }

    // Land-type profile of this grower and this village, from measured rows only.
    if (land && crop !== 'RATOON') {
      const isLow = land === 'LOWLAND' ? area : 0;
      if (gk !== '||') {
        growerTot[gk] = (growerTot[gk] || 0) + area;
        growerLow[gk] = (growerLow[gk] || 0) + isLow;
      }
      if (village) {
        villageTot[village] = (villageTot[village] || 0) + area;
        villageLow[village] = (villageLow[village] || 0) + isLow;
      }
    }

    // Identical corners = one physical field shared between growers.
    const lats = [cells[COL.lat1], cells[COL.lat2], cells[COL.lat3], cells[COL.lat4]].map(Number);
    const lons = [cells[COL.lon1], cells[COL.lon2], cells[COL.lon3], cells[COL.lon4]].map(Number);
    const gpsOk =
      lats.every((v) => Number.isFinite(v) && v > LAT_MIN && v < LAT_MAX) &&
      lons.every((v) => Number.isFinite(v) && v > LON_MIN && v < LON_MAX);
    if (gpsOk) {
      const pk = lats.map((v) => v.toFixed(6)).join(',') + '|' + lons.map((v) => v.toFixed(6)).join(',');
      plotKeys.add(pk);
      vAgg?.fields.add(pk);
      sAgg?.fields.add(pk);

      // Every plot is kept, not only the ones finishing now. A plot carrying a
      // plant crop today is not free this season, but it becomes free once its
      // ratoons are done - which is what Years 2 and 3 are planted on.
      if (crop === 'PLANT' || crop === 'AUTUMN' || crop === 'RATOON' || crop === 'RATOON II') {
        const ex = freePlotMap.get(pk);
        if (ex) {
          ex.areaHa += area;
        } else {
          freePlotMap.set(pk, {
            village, society, grower: gk,
            // RATOON II carries a real land type; plain RATOON carries none, and
            // recording it as UPLAND is what understated lowland by 16 points.
            landType: crop === 'RATOON' ? 'UNKNOWN' : land === 'LOWLAND' ? 'LOWLAND' : 'UPLAND',
            areaHa: area,
            currentVariety: variety,
            cropStage: crop as 'PLANT' | 'AUTUMN' | 'RATOON' | 'RATOON II',
          });
        }
      }
    } else {
      droppedGps++;
    }

    const soil = (cells[COL.soilType] || '').trim().toUpperCase();
    if (!soil || soil === 'NONE') soilBlank++;

    const pd = cells[COL.plantDate] || '';
    // Excel serial dates; anything at or below 1900-01-01 is a placeholder.
    if (parseFloat(pd) > 100) dateUsable++;

    const irr = (cells[COL.irrigation] || '').trim().toUpperCase() === 'YES';
    if (crop === 'PLANT') { plantRows++; if (irr) plantIrrYes++; }
    else if (crop === 'RATOON' || crop === 'RATOON II') { ratRows++; if (irr) ratIrrYes++; }

    if ((cells[COL.diseases] || '').trim().toUpperCase() === 'NONE') diseaseNone++;

    // The ERP's own upload result. Recorded, never used to filter: the cane is
    // in the ground whether or not the row reached Amity, and dropping it would
    // describe a mill two-thirds the real size.
    if (OPT.uploadYn) {
      const okUp = (cells[OPT.uploadYn] || '').trim();
      if (okUp === '0') {
        uploadFailRows++;
        uploadFailHa += area;
        const why = OPT.errorDesc ? (cells[OPT.errorDesc] || '').trim() : '';
        if (why) uploadFailReasons[why] = (uploadFailReasons[why] || 0) + 1;
      }
    }

  }

  while (offset < totalBytes) {
    const end = Math.min(offset + WINDOW, totalBytes);
    const chunk = sheetBytes.subarray(offset, end);
    const isLast = end >= totalBytes;
    carry = processBuffer(carry + decoder.decode(chunk, { stream: !isLast }), isLast);
    offset = end;

    const pct = 20 + (offset / totalBytes) * 72;
    if (pct - lastPct > 1) {
      lastPct = pct;
      post({ type: 'progress', pct, label: `Read ${totalRecords.toLocaleString()} records` });
    }
  }

  if (totalRecords === 0) throw new Error('no data rows found in the first sheet');

  post({ type: 'progress', pct: 94, label: 'Summarising' });

  const plant = cropHa['PLANT'] || 0;
  const autumn = cropHa['AUTUMN'] || 0;
  const ratoon = cropHa['RATOON'] || 0;
  const ratoon2 = cropHa['RATOON II'] || 0;

  /* ------------------------------------------------------- quality flags */
  const flags: { severity: 'warning' | 'critical'; title: string; detail: string }[] = [];
  const r1 = (n: number) => Math.round(n * 10) / 10;

  // Reported first because it is by far the largest number on the panel, and a
  // 0.6% GPS drop sitting above a 39% upload failure gives the wrong impression
  // of where the data is weak.
  if (uploadFailRows > 0) {
    const pct = (uploadFailRows / totalRecords) * 100;
    const top = Object.entries(uploadFailReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([why, n]) => `${why} (${n.toLocaleString()})`)
      .join('; ');
    flags.push({
      severity: 'warning',
      title: `ERP upload failed on ${pct.toFixed(0)}% of records - ${r1(uploadFailHa).toLocaleString()} ha`,
      detail:
        `${uploadFailRows.toLocaleString()} rows carry UpLoad_YN = 0${top ? `. Mostly: ${top}` : ''}. ` +
        `These rows are KEPT and counted in full - the cane is in the ground whether or not the row ` +
        `reached Amity. Treat it as a warning about ERP record-keeping, not about the survey.`,
    });
  }

  if (landUnrecordedHa > 0) {
    const lowPct = landRecordedHa > 0 ? ((landHa['LOWLAND'] || 0) / landRecordedHa) * 100 : 0;
    flags.push({
      severity: 'warning',
      title: `Land type not recorded on ${r1(landUnrecordedHa).toLocaleString()} ha of ratoon`,
      detail:
        `The ERP leaves LANDTYPE blank on every RATOON row, so those plots default to UPLAND. ` +
        `The split shown is measured on the ${r1(landRecordedHa).toLocaleString()} ha where the value ` +
        `actually exists, giving ${lowPct.toFixed(1)}% lowland. Counting the ratoon land as upland ` +
        `would have shown about 24% instead.`,
    });
  }

  const soilPct = soilBlank / totalRecords;
  if (soilPct > 0.05)
    flags.push({
      severity: 'warning',
      title: `Soil type unassigned on ${Math.round(soilPct * 100)}% of records`,
      detail: 'Those plots carry no soil classification; land-suitability checks fall back to the land type alone.',
    });

  const datePct = dateUsable / totalRecords;
  if (datePct < 0.95)
    flags.push({
      severity: 'warning',
      title: `Planting date usable on only ${Math.round(datePct * 100)}% of records`,
      detail: 'Autumn vs spring compliance cannot be verified for the remainder.',
    });

  if (droppedGps)
    flags.push({
      severity: 'critical',
      title: `${droppedGps.toLocaleString()} rows dropped - unusable GPS`,
      detail: 'A corner was recorded as zero or falls outside the district, so the field cannot be located.',
    });

  if (plantRows > 100 && ratRows > 100) {
    const p = plantIrrYes / plantRows, r = ratIrrYes / ratRows;
    if (Math.abs(p - r) > 0.4)
      flags.push({
        severity: 'warning',
        title: 'Irrigation column unreliable',
        detail: `Marked YES on ${Math.round(p * 100)}% of plant crop but only ${Math.round(r * 100)}% of ratoon - it is tracking crop type, not irrigation.`,
      });
  }

  const nonePct = diseaseNone / totalRecords;
  if (nonePct > 0.95)
    flags.push({
      severity: 'warning',
      title: `Disease recorded as NONE on ${(nonePct * 100).toFixed(1)}% of records`,
      detail: "This is a surveyor's visual check, not a pathology test. Treat disease rates as under-reported.",
    });

  const varieties = Object.keys(varietyHa)
    .map((k) => ({
      name: k,
      areaHa: r1(varietyHa[k]),
      records: varietyRecords[k],
      lowlandSharePct: r1(((varietyLowland[k] || 0) / varietyRecords[k]) * 100),
      maturity: varietyMaturity[k] || 'UNKNOWN',
    }))
    .sort((a, b) => b.areaHa - a.areaHa);

  const baseline = {
    fileName,
    fileSizeMb: `${(fileSize / (1024 * 1024)).toFixed(1)} MB`,
    uploadedAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),

    surveyedAreaHa: r1(areaTotal),
    physicalFields: plotKeys.size,
    growers: growerKeys.size,
    villages: villages.size,
    societies: societies.size,
    varietiesFound: varieties.length,

    landTypeSplit: {
      uplandHa: r1(landHa['UPLAND'] || 0),
      lowlandHa: r1(landHa['LOWLAND'] || 0),
      recordedHa: r1(landRecordedHa),
      unrecordedHa: r1(landUnrecordedHa),
    },
    cropTypeSplit: {
      plantHa: r1(plant), autumnHa: r1(autumn), ratoonHa: r1(ratoon), ratoonIIHa: r1(ratoon2),
    },

    // Plant and autumn become ratoon of the same variety next season and are
    // therefore locked; only finishing ratoon is free to re-plant.
    lockedHa: r1(plant + autumn),
    freeToReplantHa: r1(ratoon + ratoon2),

    dataQualityFlags: flags,
    cleanRecords: totalRecords - droppedGps,
    totalRecords,

    // Detail behind each headline figure, so the cards can be opened up.
    villageBreakdown: [...byVillage.entries()]
      .map(([name, a]) => ({
        name,
        society: a.society || '',
        areaHa: r1(a.areaHa),
        fields: a.fields.size,
        growers: a.growers.size,
        records: a.records,
      }))
      .sort((x, y) => y.areaHa - x.areaHa),

    societyBreakdown: [...bySociety.entries()]
      .map(([name, a]) => ({
        name,
        areaHa: r1(a.areaHa),
        villages: a.villages!.size,
        fields: a.fields.size,
        growers: a.growers.size,
        records: a.records,
      }))
      .sort((x, y) => y.areaHa - x.areaHa),

    varietyBreakdown: varieties,
  };

  // Plots ride alongside the baseline rather than inside it - 178k rows, far too
  // many to sit in a summary object that gets logged and copied.
  const freePlots: FreePlot[] = [];
  let fpi = 0;
  freePlotMap.forEach((v) => {
    const gt = growerTot[v.grower] || 0;
    const vt = villageTot[v.village] || 0;
    freePlots.push({
      id: `p${fpi++}`,
      village: v.village,
      society: v.society,
      grower: v.grower,
      landType: v.landType,
      cropStage: v.cropStage,
      growerLowlandShare: gt > 0 ? Math.round(((growerLow[v.grower] || 0) / gt) * 1000) / 1000 : -1,
      villageLowlandShare: vt > 0 ? Math.round(((villageLow[v.village] || 0) / vt) * 1000) / 1000 : -1,
      areaHa: Math.round(v.areaHa * 1000) / 1000,
      currentVariety: v.currentVariety,
    });
  });

  post({ type: 'progress', pct: 100, label: 'Done' });
  return { baseline, varieties, freePlots };
}

self.onmessage = (e: MessageEvent) => {
  const { buffer, fileName, fileSize } = e.data as {
    buffer: ArrayBuffer; fileName: string; fileSize: number;
  };
  try {
    post({ type: 'done', payload: run(buffer, fileName, fileSize) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
