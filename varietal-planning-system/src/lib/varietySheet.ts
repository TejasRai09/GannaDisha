/**
 * The Step 2 variety sheet - written and read in the browser.
 *
 * The cane department does not type 86 variety names. They press Download, get
 * a workbook with every variety the survey found already listed and the
 * measured columns filled in, complete the blanks, and upload it back.
 *
 * Because the variety list comes from whichever survey was loaded in Step 1,
 * the template has to be generated at that moment rather than shipped as a
 * static file. That is why this writes XLSX rather than pointing at an asset.
 *
 * Mirror of build/make_variety_template.py - the column names and the accepted
 * values must stay identical in both, or a sheet produced by one will not load
 * in the other.
 */

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type {
  VarietyRecord,
  LandSuitability,
  PlantingSeason,
  VarietyStage,
  VarietyStrategy,
  AnimalDamageRisk,
  CropDuration,
  RedRotReaction,
} from '../types';

/* ------------------------------------------------------------------ vocabulary */

export const SHEET_LISTS = {
  Stage: ['TRIAL', 'MULTIPLYING', 'COMMERCIAL', 'DECLINING', 'RETIRED', 'REVIEW'],
  Strategy: ['INTRODUCE-NEW', 'EXPAND', 'HOLD', 'REDUCE', 'EXIT'],
  'Land Suitability': ['UPLAND', 'LOWLAND', 'BOTH'],
  'Planting Season': ['SPRING', 'AUTUMN', 'BOTH'],
  'Crop Duration': ['12-MONTH', '18-MONTH'],
  'Red Rot Resistance': ['R', 'MR', 'S'],
  'Animal Damage Risk': ['LOW', 'MEDIUM', 'HIGH'],
} as const;

type ColKind = 'int' | 'num1' | 'text' | 'list';
interface ColSpec {
  header: string;
  width: number;
  kind: ColKind;
  measured: boolean;
  note: string;
}

/** Column order IS the file format. Changing it changes the template. */
export const COLUMNS: ColSpec[] = [
  { header: '#', width: 5, kind: 'int', measured: true, note: 'Rank by area.' },
  { header: 'Variety', width: 22, kind: 'text', measured: true, note: 'Exactly as the ERP spells it. Do not edit - this is how the engine matches your row back to the survey.' },
  { header: 'Area (ha)', width: 12, kind: 'num1', measured: true, note: 'What the survey found on the ground.' },
  { header: '% of Area', width: 10, kind: 'num1', measured: true, note: 'Share of the total command area.' },
  { header: 'Cumulative %', width: 13, kind: 'num1', measured: true, note: 'Running total down the sheet.' },
  { header: 'Lowland % (measured)', width: 19, kind: 'num1', measured: true, note: 'How much of this variety the survey actually found on lowland. Use it to sanity-check the Land Suitability you enter.' },
  { header: 'Survey Records', width: 14, kind: 'int', measured: true, note: 'Rows behind the figure. A handful of records means the area is not reliable.' },
  { header: 'Priority', width: 12, kind: 'text', measured: true, note: 'FILL FIRST covers 95% of your area. The rest is optional.' },

  { header: 'Stage', width: 15, kind: 'list', measured: false, note: 'Where the variety is in its life: TRIAL, MULTIPLYING, COMMERCIAL, DECLINING, RETIRED, or REVIEW if you are not sure yet.' },
  { header: 'Strategy', width: 16, kind: 'list', measured: false, note: 'What you WANT it to do next: EXPAND, HOLD, REDUCE, EXIT, or INTRODUCE-NEW.' },
  { header: 'Land Suitability', width: 17, kind: 'list', measured: false, note: 'Which land it belongs on. BOTH if it grows anywhere. Compare against the measured lowland % on the left.' },
  { header: 'Planting Season', width: 16, kind: 'list', measured: false, note: 'SPRING (Feb-Mar), AUTUMN (Oct-Nov), or BOTH.' },
  { header: 'Crop Duration', width: 14, kind: 'list', measured: false, note: '12-MONTH or 18-MONTH. An 18-month autumn crop holds the field through two seasons - this changes the whole plan.' },
  { header: 'Juice Sucrose %', width: 15, kind: 'num1', measured: false, note: 'Pol in cane, roughly 14 to 20. Leave blank if not known - do NOT put 0.' },
  { header: 'Cane Yield (t/ha)', width: 16, kind: 'num1', measured: false, note: 'Tonnes per hectare, roughly 50 to 110. This is what decides how much sugar the plan is worth.' },
  { header: 'Avg Cane Weight (g)', width: 18, kind: 'int', measured: false, note: 'Single cane weight in grams, roughly 400 to 1200. This is what the farmer notices.' },
  { header: 'Red Rot Resistance', width: 18, kind: 'list', measured: false, note: 'R = resistant, MR = moderately resistant, S = susceptible. An S variety should not be expanded.' },
  { header: 'Animal Damage Risk', width: 18, kind: 'list', measured: false, note: 'LOW, MEDIUM or HIGH. Soft sweet canes get eaten.' },
  { header: 'Farmer Acceptance (1-5)', width: 21, kind: 'int', measured: false, note: '1 = farmers refuse it, 5 = they ask for it. A plan farmers reject is not a plan.' },
  { header: 'Seed Available (qtl)', width: 18, kind: 'int', measured: false, note: 'Quintals of seed of this variety you can actually get hold of for the coming season. 0 is a real answer here.' },
  { header: 'Notes', width: 42, kind: 'text', measured: false, note: 'Anything else worth knowing.' },
];

const HEADER_ROW = 4;
const FIRST_DATA_ROW = HEADER_ROW + 1;
/** Rows are marked FILL FIRST until cumulative area share crosses this. */
const CORE_COVERAGE = 95;

/* ------------------------------------------------------------------ xml utils */

const esc = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Excel rejects most control characters outright.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ------------------------------------------------------------------- styles */
/* Index order below is the contract with the `s=` attributes further down. */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>
<fonts count="7">
<font><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF94A3B8"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF0F766E"/><name val="Calibri"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF9C3"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFB91C1C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFCCFBF1"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="18">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

const S = {
  hdrMeasured: 1, hdrJudged: 2, banner: 3, bannerSub: 4,
  mText: 5, mNum: 6, mInt: 7,
  jText: 8, jNum: 9, jInt: 10, jList: 11,
  priorityCore: 12, varietyName: 13, tiny: 14, guideLabel: 16, guideBody: 17,
} as const;

/* -------------------------------------------------------------- sheet writer */

type CellVal = string | number | null | undefined;

function cell(ref: string, v: CellVal, style: number): string {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  }
  // Inline strings: no sharedStrings part to keep in sync.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

export interface TemplateRow {
  name: string;
  areaHa: number;
  sharePct: number;
  cumPct: number;
  lowlandPct: number;
  records: number;
  priority: string;
}

/** Sort by area, compute shares, and mark the rows that actually matter. */
export function toTemplateRows(varieties: VarietyRecord[]): TemplateRow[] {
  const sorted = [...varieties].sort((a, b) => b.currentAreaHa - a.currentAreaHa);
  const total = sorted.reduce((s, v) => s + v.currentAreaHa, 0) || 1;
  let cum = 0;
  return sorted.map((v) => {
    const sharePct = (v.currentAreaHa / total) * 100;
    cum += sharePct;
    return {
      name: v.name,
      areaHa: Math.round(v.currentAreaHa * 10) / 10,
      sharePct: Math.round(sharePct * 100) / 100,
      cumPct: Math.round(cum * 100) / 100,
      lowlandPct: Math.round((v.measuredLowlandPct ?? 0) * 10) / 10,
      records: v.surveyRecords ?? 0,
      priority: cum <= CORE_COVERAGE ? 'FILL FIRST' : 'optional',
    };
  });
}

function buildDataSheet(rows: TemplateRow[], sourceNote: string): string {
  const ncol = COLUMNS.length;
  const lastCol = colLetter(ncol);
  const lastRow = FIRST_DATA_ROW + rows.length - 1;

  const cols = COLUMNS.map(
    (c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`
  ).join('');

  const out: string[] = [];

  // banner
  out.push(
    `<row r="1" ht="26" customHeight="1">` +
      cell('A1', 'VARIETY INPUT SHEET - Gobind Sugar Mill, Aira', S.banner) +
      Array.from({ length: ncol - 1 }, (_, i) => `<c r="${colLetter(i + 2)}1" s="${S.banner}"/>`).join('') +
      `</row>`
  );
  out.push(
    `<row r="2" ht="18" customHeight="1">` +
      cell(
        'A2',
        'Grey columns come from the survey - do not change them. Fill the teal columns. Rows marked FILL FIRST cover 95% of your area. See the "How to fill this" sheet.',
        S.bannerSub
      ) +
      `</row>`
  );
  out.push(`<row r="3">` + cell('A3', sourceNote, S.tiny) + `</row>`);

  // header
  out.push(
    `<row r="${HEADER_ROW}" ht="34" customHeight="1">` +
      COLUMNS.map((c, i) =>
        cell(`${colLetter(i + 1)}${HEADER_ROW}`, c.header, c.measured ? S.hdrMeasured : S.hdrJudged)
      ).join('') +
      `</row>`
  );

  // data
  rows.forEach((r, ri) => {
    const rn = FIRST_DATA_ROW + ri;
    const vals: CellVal[] = [
      ri + 1, r.name, r.areaHa, r.sharePct, r.cumPct, r.lowlandPct, r.records, r.priority,
      // judgement columns stay empty - that is the point of the template
      ...Array(COLUMNS.length - 8).fill(null),
    ];
    const cells = COLUMNS.map((c, i) => {
      const ref = `${colLetter(i + 1)}${rn}`;
      let s: number;
      if (c.header === 'Variety') s = S.varietyName;
      else if (c.header === 'Priority') s = r.priority === 'FILL FIRST' ? S.priorityCore : S.mText;
      else if (c.measured) s = c.kind === 'int' ? S.mInt : c.kind === 'num1' ? S.mNum : S.mText;
      else s = c.kind === 'int' ? S.jInt : c.kind === 'num1' ? S.jNum : c.kind === 'list' ? S.jList : S.jText;
      return cell(ref, vals[i], s);
    }).join('');
    out.push(`<row r="${rn}">${cells}</row>`);
  });

  // dropdowns + numeric guards
  const dvs: string[] = [];
  COLUMNS.forEach((c, i) => {
    if (c.kind !== 'list') return;
    const opts = (SHEET_LISTS as Record<string, readonly string[]>)[c.header];
    if (!opts) return;
    const L = colLetter(i + 1);
    dvs.push(
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" ` +
        `errorTitle="Not an accepted value" error="${esc('Choose one of: ' + opts.join(', '))}" ` +
        `promptTitle="${esc(c.header)}" prompt="${esc('Pick one of: ' + opts.join(', '))}" ` +
        `sqref="${L}${FIRST_DATA_ROW}:${L}${lastRow}"><formula1>"${esc(opts.join(','))}"</formula1></dataValidation>`
    );
  });
  const guards: [string, number, number][] = [
    ['Juice Sucrose %', 10, 24],
    ['Cane Yield (t/ha)', 20, 160],
    ['Avg Cane Weight (g)', 200, 2000],
    ['Farmer Acceptance (1-5)', 1, 5],
    ['Seed Available (qtl)', 0, 10000000],
  ];
  guards.forEach(([header, lo, hi]) => {
    const i = COLUMNS.findIndex((c) => c.header === header);
    if (i < 0) return;
    const L = colLetter(i + 1);
    dvs.push(
      `<dataValidation type="decimal" operator="between" allowBlank="1" showInputMessage="1" showErrorMessage="1" ` +
        `errorTitle="Out of range" error="${esc(`${header} should be between ${lo} and ${hi}. Leave blank if not known.`)}" ` +
        `sqref="${L}${FIRST_DATA_ROW}:${L}${lastRow}"><formula1>${lo}</formula1><formula2>${hi}</formula2></dataValidation>`
    );
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="2" ySplit="${HEADER_ROW}" topLeftCell="C${FIRST_DATA_ROW}" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="C${FIRST_DATA_ROW}" sqref="C${FIRST_DATA_ROW}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${out.join('')}</sheetData>
<autoFilter ref="A${HEADER_ROW}:${lastCol}${lastRow}"/>
<mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells>
<dataValidations count="${dvs.length}">${dvs.join('')}</dataValidations>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function buildGuideSheet(rows: TemplateRow[], sourceNote: string): string {
  const core = rows.filter((r) => r.priority === 'FILL FIRST').length;
  const lines: [string, string, number][] = [
    ['HOW TO FILL THIS SHEET', '', 16],
    ['', sourceNote, S.guideBody],
    ['What this is for', '', S.guideLabel],
    ['', 'The survey tells us where every field is and what is growing on it. It cannot tell us what a variety is LIKE - how it ratoons, what it yields, whether it survives red rot, how much seed we hold. That has to be written down once, by someone who knows the crop. That is this sheet.', S.guideBody],
    ['What is already done', '', S.guideLabel],
    ['', `All ${rows.length} varieties the survey found are already listed, biggest area first. You do not have to type a single name.`, S.guideBody],
    ['', 'The grey columns are measured facts from the survey. Please do not change them - the Variety column especially, because that is how the system matches your row back to the survey.', S.guideBody],
    ['What you need to do', '', S.guideLabel],
    ['', 'Fill the teal columns. Most are dropdowns - click the cell and a small arrow appears.', S.guideBody],
    ['', `Start with the rows marked FILL FIRST. There are only ${core} of them and they cover 95% of the area. The long tail below can wait.`, S.guideBody],
    ['Two rules', '', S.guideLabel],
    ['', '1. If you do not know a number, LEAVE IT BLANK. Do not put 0. Blank means "nobody has told us yet" and the system will ask for it. A 0 means "we measured it and it is zero", which is a different thing and will quietly spoil the plan.', S.guideBody],
    ['', '2. Seed Available is the exception. There, 0 is a real and useful answer - it means we hold no seed of this variety.', S.guideBody],
    ['A useful cross-check', '', S.guideLabel],
    ['', 'The "Lowland % (measured)" column shows how much of that variety the survey actually found sitting on lowland. If it reads 40% and you mark the variety UPLAND, one of the two is wrong - worth a look before you send the sheet back.', S.guideBody],
    ['COLUMN BY COLUMN', '', S.guideLabel],
  ];
  COLUMNS.forEach((c) => lines.push([c.header, c.note, S.guideBody]));
  lines.push(['ACCEPTED VALUES', '', S.guideLabel]);
  Object.entries(SHEET_LISTS).forEach(([k, v]) => lines.push([k, v.join(' / '), S.guideBody]));
  lines.push(['When you are done', 'Save the file and upload it on Step 2 of the Varietal Planning System. Do not rename the columns or move them around - the system reads them by name.', S.guideBody]);

  const body = lines
    .map(([a, b, st], i) => {
      const r = i + 1;
      const styleA = st === 16 ? 16 : st === S.guideLabel ? S.guideLabel : 0;
      return `<row r="${r}">${cell(`A${r}`, a, styleA)}${cell(`B${r}`, b, S.guideBody)}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:B${lines.length}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="104" customWidth="1"/></cols>
<sheetData>${body}</sheetData>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

/** Build the workbook. Returns bytes ready to hand to a Blob. */
export function buildVarietyTemplate(varieties: VarietyRecord[], surveyName?: string): Uint8Array {
  const rows = toTemplateRows(varieties);
  const core = rows.filter((r) => r.priority === 'FILL FIRST').length;
  const stamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const note =
    `Varieties from ${surveyName || 'the plot survey'} - ${rows.length} found, ` +
    `${core} marked FILL FIRST. Generated ${stamp}.`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000" activeTab="0"/></bookViews>
<sheets><sheet name="Varieties" sheetId="1" r:id="rId1"/><sheet name="How to fill this" sheetId="2" r:id="rId2"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Variety Input Sheet</dc:title>
<dc:creator>Varietal Planning System</dc:creator>
<cp:lastModifiedBy>Varietal Planning System</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`),
    'docProps/app.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Varietal Planning System</Application>
</Properties>`),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/worksheets/sheet1.xml': strToU8(buildDataSheet(rows, note)),
    'xl/worksheets/sheet2.xml': strToU8(buildGuideSheet(rows, note)),
  };

  return zipSync(files, { level: 6 });
}

/* -------------------------------------------------------------- sheet reader */

const norm = (v: string) => v.replace(/\s+/g, '').toUpperCase();

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(xml))) {
    let text = '';
    let t: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((t = tRe.exec(si[1]))) text += t[1];
    out.push(unesc(text));
  }
  return out;
}

const unesc = (s: string) =>
  s.indexOf('&') === -1
    ? s
    : s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, '&');

function refToCol(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** sheet1 -> array of rows, each row a sparse array indexed by column number. */
function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rn = Number(rm[1]);
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[2]))) {
      const attrs = cm[1] ?? cm[3] ?? '';
      const inner = cm[2] ?? '';
      const refM = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!refM) continue;
      const ci = refToCol(refM[1]);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let val = '';
      if (type === 'inlineStr') {
        const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let t: RegExpExecArray | null;
        while ((t = tRe.exec(inner))) val += t[1];
        val = unesc(val);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        val = type === 's' ? shared[Number(v)] ?? '' : unesc(v);
      }
      cells[ci] = val;
    }
    rows[rn] = cells;
  }
  return rows;
}

export interface SheetParseResult {
  /** Judgement values keyed by normalised variety name. */
  values: Map<string, Partial<VarietyRecord>>;
  rowCount: number;
  /** Names in the sheet with no match in the loaded survey. */
  unknownNames: string[];
  /** Rows whose judgement columns were entirely blank. */
  blankRows: number;
  /** Header names the file was missing. */
  missingColumns: string[];
  warnings: string[];
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const pick = <T extends string>(s: string | undefined, allowed: readonly string[]): T | undefined => {
  if (!s) return undefined;
  const u = s.trim().toUpperCase();
  return allowed.includes(u) ? (u as T) : undefined;
};

/** Read a filled-in sheet. Blank cells are left alone, never written as 0. */
export function parseVarietySheet(buffer: ArrayBuffer): SheetParseResult {
  const bytes = new Uint8Array(buffer);

  // Find the sheet by NAME, not by position. The standalone template has the
  // varieties on sheet1, but the combined input workbook opens on "Start Here"
  // - reading sheet1 there would parse the instructions page and find nothing.
  const meta = unzipSync(bytes, {
    filter: (f) =>
      f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels',
  });
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (meta['xl/workbook.xml']) {
    const wbXml = strFromU8(meta['xl/workbook.xml']);
    const relXml = meta['xl/_rels/workbook.xml.rels']
      ? strFromU8(meta['xl/_rels/workbook.xml.rels'])
      : '';
    const sheets = [...wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)]
      .map((m) => ({ name: unesc(m[1]), rid: m[2] }));
    // Prefer a tab whose name mentions varieties; otherwise the first sheet.
    const pick =
      sheets.find((x) => /variet/i.test(x.name)) ?? sheets[0];
    if (pick && relXml) {
      // Attribute order is not fixed: Excel writes Id before Target, openpyxl
      // writes it after. Match the whole element, then read the two attributes
      // out of it independently.
      const rel = [...relXml.matchAll(/<Relationship[^>]*\/?>/g)]
        .map((m) => m[0])
        .find((el) => new RegExp(`Id="${pick.rid}"`).test(el));
      const target = rel ? /Target="([^"]*)"/.exec(rel)?.[1] : undefined;
      if (target) {
        // Targets come as "worksheets/sheet2.xml" or "/xl/worksheets/sheet2.xml".
        const clean = target.replace(/^\//, '').replace(/^xl\//, '');
        sheetPath = `xl/${clean}`;
      }
    }
  }

  const files = unzipSync(bytes, {
    filter: (f) => f.name === 'xl/sharedStrings.xml' || f.name === sheetPath,
  });
  const sheetBytes = files[sheetPath];
  if (!sheetBytes) throw new Error('No sheet found. Please upload the variety input workbook.');
  const shared = files['xl/sharedStrings.xml']
    ? parseSharedStrings(strFromU8(files['xl/sharedStrings.xml']))
    : [];

  const rows = readSheet(strFromU8(sheetBytes), shared);

  // Find the header row rather than trusting row 4 - people insert rows.
  let hdrRow = -1;
  for (let r = 1; r < Math.min(rows.length, 25); r++) {
    const cells = rows[r];
    if (cells && cells.some((c) => c && c.trim() === 'Variety')) { hdrRow = r; break; }
  }
  if (hdrRow < 0) {
    throw new Error('Could not find the header row. Is this the variety template?');
  }

  const colOf = new Map<string, number>();
  rows[hdrRow].forEach((h, i) => { if (h) colOf.set(h.trim(), i); });

  const missingColumns = COLUMNS.filter((c) => !c.measured && !colOf.has(c.header)).map((c) => c.header);

  const values: SheetParseResult['values'] = new Map();
  const unknownNames: string[] = [];
  const warnings: string[] = [];
  let rowCount = 0;
  let blankRows = 0;

  const get = (cells: string[], header: string) => {
    const i = colOf.get(header);
    return i === undefined ? undefined : cells[i];
  };

  for (let r = hdrRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells) continue;
    const name = (get(cells, 'Variety') || '').trim();
    if (!name) continue;
    rowCount++;

    const patch: Partial<VarietyRecord> = {};
    const stage = pick<VarietyStage>(get(cells, 'Stage'), SHEET_LISTS.Stage);
    const strategy = pick<VarietyStrategy>(get(cells, 'Strategy'), SHEET_LISTS.Strategy);
    const land = pick<LandSuitability>(get(cells, 'Land Suitability'), SHEET_LISTS['Land Suitability']);
    const season = pick<PlantingSeason>(get(cells, 'Planting Season'), SHEET_LISTS['Planting Season']);
    const animal = pick<AnimalDamageRisk>(get(cells, 'Animal Damage Risk'), SHEET_LISTS['Animal Damage Risk']);
    const duration = pick<CropDuration>(get(cells, 'Crop Duration'), SHEET_LISTS['Crop Duration']);
    const redRot = pick<RedRotReaction>(get(cells, 'Red Rot Resistance'), SHEET_LISTS['Red Rot Resistance']);

    if (stage) patch.stage = stage;
    if (strategy) patch.strategy = strategy;
    if (land) patch.landSuitability = land;
    if (season) patch.plantingSeason = season;
    if (animal) patch.animalDamageRisk = animal;
    if (duration) patch.cropDuration = duration;
    if (redRot) patch.redRot = redRot;

    const sucrose = num(get(cells, 'Juice Sucrose %'));
    const yieldTha = num(get(cells, 'Cane Yield (t/ha)'));
    const weight = num(get(cells, 'Avg Cane Weight (g)'));
    const accept = num(get(cells, 'Farmer Acceptance (1-5)'));
    const seed = num(get(cells, 'Seed Available (qtl)'));
    const notes = (get(cells, 'Notes') || '').trim();

    if (sucrose !== undefined) patch.juiceSucrosePct = sucrose;
    if (yieldTha !== undefined) patch.caneYieldTha = yieldTha;
    if (weight !== undefined) patch.avgCaneWeightGrams = weight;
    if (accept !== undefined) patch.farmerAcceptance = accept;
    // 0 is meaningful for seed, so it is written whenever the cell is not blank.
    if (seed !== undefined) patch.seedAvailableQtl = seed;
    if (notes) patch.notes = notes;

    if (Object.keys(patch).length === 0) { blankRows++; continue; }
    values.set(norm(name), patch);
  }

  if (missingColumns.length) {
    warnings.push(
      `${missingColumns.length} column(s) missing from the file: ${missingColumns.join(', ')}. Those values were left unchanged.`
    );
  }
  return { values, rowCount, unknownNames, blankRows, missingColumns, warnings };
}

/** Merge parsed values onto the registry. Returns the new list plus a report. */
export function applyVarietySheet(
  varieties: VarietyRecord[],
  parsed: SheetParseResult
): { next: VarietyRecord[]; updated: number; unmatched: string[] } {
  const seen = new Set<string>();
  let updated = 0;
  const next = varieties.map((v) => {
    const patch = parsed.values.get(norm(v.name));
    if (!patch) return v;
    seen.add(norm(v.name));
    updated++;
    return { ...v, ...patch, isEdited: true } as VarietyRecord;
  });
  const unmatched = [...parsed.values.keys()].filter((k) => !seen.has(k));
  return { next, updated, unmatched };
}

/** Hand the workbook to the browser as a download. */
export function downloadVarietyTemplate(varieties: VarietyRecord[], surveyName?: string): string {
  const bytes = buildVarietyTemplate(varieties, surveyName);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `Variety_Input_TEMPLATE_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return fileName;
}
