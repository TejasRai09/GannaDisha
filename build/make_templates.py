"""Generate the six plan-input workbooks (A-F) into plan_inputs/.

Each workbook is pre-filled from the 2026-27 survey cache and the guiding
document wherever the value already exists; yellow cells are what the plant
team fills in. Sheet and column names are contract: the plan engine reads
them back, so they must not be renamed.
"""

import os

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots_2627.parquet")
OUT = os.path.join(ROOT, "plan_inputs")

HDR_FILL = PatternFill("solid", fgColor="1F4E5F")
HDR_FONT = Font(color="FFFFFF", bold=True, size=11)
TITLE_FONT = Font(bold=True, size=14, color="1F4E5F")
FILL_INPUT = PatternFill("solid", fgColor="FFF2CC")   # yellow = plant team fills
FILL_PRE = PatternFill("solid", fgColor="F5F5F5")     # grey  = pre-filled
_side = Side(style="thin", color="D9D9D9")
THIN = Border(left=_side, right=_side, top=_side, bottom=_side)


def sheet(wb, name, headers, widths=None):
    ws = wb.create_sheet(name)
    for j, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=j, value=h)
        c.fill, c.font, c.border = HDR_FILL, HDR_FONT, THIN
        c.alignment = Alignment(wrap_text=True, vertical="center")
    if widths:
        for j, w in enumerate(widths, 1):
            ws.column_dimensions[ws.cell(row=1, column=j).column_letter].width = w
    ws.freeze_panes = "A2"
    return ws


def fill_row(ws, r, values, input_cols=()):
    for j, v in enumerate(values, 1):
        c = ws.cell(row=r, column=j, value=v)
        c.border = THIN
        c.fill = FILL_INPUT if j in input_cols else FILL_PRE


def instructions(wb, title, lines):
    ws = wb.create_sheet("Instructions", 0)
    ws.cell(row=1, column=1, value=title).font = TITLE_FONT
    ws.cell(row=2, column=1, value="Gobind Sugar Mill, Aira - Three-Year Varietal Plan").font = Font(italic=True, color="666666")
    r = 4
    for ln in lines:
        ws.cell(row=r, column=1, value=ln)
        r += 1
    ws.cell(row=r + 1, column=1, value="Colour legend:").font = Font(bold=True)
    a = ws.cell(row=r + 2, column=1, value="   YELLOW cells = to be filled by plant team")
    a.fill = FILL_INPUT
    b = ws.cell(row=r + 3, column=1, value="   GREY cells = pre-filled from survey / plan document (verify, edit only if wrong)")
    b.fill = FILL_PRE
    ws.cell(row=r + 5, column=1, value="Do NOT rename sheets or column headers - the plan engine reads them by name.").font = Font(bold=True, color="9C0006")
    ws.column_dimensions["A"].width = 110


def dv_list(ws, col_letter, options, n, allow_blank=True):
    dv = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=allow_blank)
    ws.add_data_validation(dv)
    dv.add(col_letter + "2:" + col_letter + str(n + 1))


# ----------------------------------------------------------------- reference data
# From the guiding document (Section 2.1, 4, 5 Part A, 7.2). Sucrose values are
# the document's stated/estimated juice sucrose midpoints.
DOC_VARIETIES = [
    # name, maturity, sucrose, nmc, ratoon, redrot, waterlog, drought, land, season, direction, note
    ("CO 0118",    "EARLY",    17.6, "GOOD",      "GOOD",      "MR", "MODERATE",  "MODERATE", "U/M", "BOTH",   "MAINTAIN",  "Backbone upland/midland; cap 25-30%"),
    ("COLK 94184", "EARLY",    17.5, "MODERATE",  "EXCELLENT", "MR", "EXCELLENT", "GOOD",     "L/M", "BOTH",   "REDUCE",    "Primary lowland anchor; keep >=10% through Y3"),
    ("CO 98014",   "EARLY",    17.0, "GOOD",      "MODERATE",  "MR", "MODERATE",  "GOOD",     "L/M", "BOTH",   "MAINTAIN",  "Semi-lowland / drought-tolerant"),
    ("CO 0238",    "EARLY",    18.7, "MODERATE",  "POOR",      "S",  "MODERATE",  "MODERATE", "M",   "BOTH",   "EXIT",      "Red rot susceptible (new pathotype); exit by 2028-29"),
    ("COLK 14201", "LONG-18M", 17.5, "EXCELLENT", "GOOD",      "R",  "POOR",      "GOOD",     "U/M", "AUTUMN", "EXPAND",    "MILL OVERRIDE: upland/midland autumn ONLY - fails under waterlogging"),
    ("COS 13231",  "EARLY",    17.2, "GOOD",      "GOOD",      "R",  "EXCELLENT", "MODERATE", "L",   "BOTH",   "EXPAND",    "Second lowland variety; target 10% Y3"),
    ("COS 13235",  "EARLY",    17.2, "GOOD",      "GOOD",      "R",  "MODERATE",  "MODERATE", "U/M", "BOTH",   "EXPAND",    "Upland/midland diversifier"),
    ("CO 15023",   "EARLY",    18.5, "GOOD",      "GOOD",      "MR", "MODERATE",  "MODERATE", "U/M", "BOTH",   "EXPAND",    "Highest sucrose in portfolio; main recovery lever"),
    ("COLK 16202", "EARLY",    17.2, "UNKNOWN",   "UNKNOWN",   "R",  "GOOD",      "MODERATE", "M",   "BOTH",   "SEED-MULT", "IISR Lucknow; review AICRP data Year 2"),
    ("COS 17231",  "EARLY",    18.0, "GOOD",      "UNKNOWN",   "R",  "MODERATE",  "MODERATE", "M",   "BOTH",   "SEED-MULT", "Bismil - bred against current red rot pathotype"),
    ("COS 18231",  "EARLY",    None, "UNKNOWN",   "UNKNOWN",   "UNKNOWN", "UNKNOWN", "UNKNOWN", "U/M", "BOTH", "EVALUATE", "UPCSR; local evaluation Year 1"),
    ("COS 19231",  "EARLY",    17.2, "GOOD",      "GOOD",      "R",  "MODERATE",  "MODERATE", "M",   "BOTH",   "SEED-MULT", "Lahidi, Rasbhari lineage; whole-UP approval"),
]

TARGETS = [  # variety, land, Y0, Y1, Y2, Y3
    ("CO 0118",    "M/U", 18033, 17000, 15500, 14000),
    ("COLK 94184", "L",   11338, 11000,  9500,  7500),
    ("CO 98014",   "L/M",  6499,  6000,  5500,  5000),
    ("CO 0238",    "M",    4815,  2000,     0,     0),
    ("COLK 14201", "M/U",  3565,  5500,  8000,  9000),
    ("COS 13231",  "L",    2062,  4000,  5000,  5500),
    ("COS 13235",  "M/U",  1691,  2500,  3000,  2500),
    ("CO 15023",   "M/U",   847,  3500,  5500,  7000),
    ("COLK 16202", "M",     267,  1200,  2500,  3000),
    ("COS 17231",  "M",     128,   500,  1500,  2000),
    ("COS 18231",  "M/U",     93,   250,   600,   700),
    ("COS 19231",  "M/U",     50,   200,   400,   800),
    ("OTHERS",     "MIX",  7812,  3500,     0,     0),
]

SEED_PLOTS = [  # variety, fraction %, method, note (doc 7.2)
    ("COLK 14201", 30, "SETT",    "Self-sufficient from Y1; upland/midland blocks only"),
    ("CO 15023",   35, "SETT",    "Top operational priority; SBI Karnal top-up"),
    ("COLK 16202", 30, "SETT",    "IISR Lucknow supplement 200-300 ha"),
    ("COS 17231",  40, "BUDCHIP", "UPCSR origin; bud chip accelerates 1:15-20"),
    ("COS 18231",  30, "SETT",    "Evaluate Year 1 before aggressive expansion"),
    ("COS 19231", 100, "SETT",    "All Year-1 area as seed plots"),
]

PROCUREMENT = [  # variety, institution, season, planned ha, note
    ("COLK 16202", "ICAR-IISR Lucknow",   "2027-28", 250, "Doc: 200-300 ha"),
    ("COS 17231",  "UPCSR Shahjahanpur",  "2027-28", 175, "Doc: 150-200 ha"),
    ("COS 18231",  "UPCSR Shahjahanpur",  "2027-28",  65, "Doc: 50-80 ha"),
    ("COS 19231",  "UPCSR Shahjahanpur",  "2027-28",  75, "Doc: 50-100 ha breeder seed"),
    ("CO 15023",   "SBI Karnal / region mills", "2027-28", 1500, "Doc: remainder beyond own multiplication"),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    df = pd.read_parquet(CACHE)
    df["vnorm"] = df.variety.str.replace(" ", "", regex=False)

    # ---------------- A: master reference ----------------
    wb = Workbook(); wb.remove(wb.active)
    instructions(wb, "A - Master Reference", [
        "Reference lists exported from the 2026-27 ERP survey.",
        "Plant team: verify names and spellings; correct only where the ERP is wrong.",
        "These identify societies, centres and villages used by every other workbook.",
    ])
    ws = sheet(wb, "Societies", ["Society Code", "Society Name", "Survey Rows", "Area (ha)"], [14, 26, 14, 12])
    g = df.groupby(["society_code", "society"], sort=True).agg(rows=("society", "size"), ha=("area_ha", "sum")).reset_index()
    for i, r in enumerate(g.itertuples(), 2):
        fill_row(ws, i, [r.society_code, r.society, r.rows, round(r.ha, 1)])
    ws = sheet(wb, "Centres", ["Society", "Centre Code", "Centre Name", "Survey Rows", "Area (ha)"], [22, 12, 26, 12, 12])
    g = df.groupby(["society", "centre_code", "centre"], sort=True).agg(rows=("society", "size"), ha=("area_ha", "sum")).reset_index()
    for i, r in enumerate(g.itertuples(), 2):
        fill_row(ws, i, [r.society, r.centre_code, r.centre, r.rows, round(r.ha, 1)])
    ws = sheet(wb, "Villages", ["Society", "Village Code", "Village Name", "Survey Rows", "Area (ha)"], [22, 12, 30, 12, 12])
    g = df.groupby(["society", "plot_village_code", "plot_village"], sort=True).agg(rows=("society", "size"), ha=("area_ha", "sum")).reset_index()
    for i, r in enumerate(g.itertuples(), 2):
        fill_row(ws, i, [r.society, r.plot_village_code, r.plot_village, r.rows, round(r.ha, 1)])
    wb.save(os.path.join(OUT, "A_Master_Reference.xlsx"))

    # ---------------- B: village land classification ----------------
    wb = Workbook(); wb.remove(wb.active)
    instructions(wb, "B - Village Land / Drainage Classification", [
        "THE most important workbook. The ERP records only UPLAND/LOWLAND, but the",
        "3-year plan allocates varieties across UPLAND / MIDLAND / LOWLAND.",
        "For every village, the field team classifies the DOMINANT drainage class:",
        "   UPLAND  = free-draining, no standing water after rain",
        "   MIDLAND = loam/clay-loam, drains within 1-2 days of heavy rain",
        "   LOWLAND = water stands 5-30+ days in monsoon",
        "   MIXED   = village genuinely splits across classes (explain in Remarks)",
        "'ERP Lowland %' shows how the ERP currently records that village - use it as",
        "a cross-check, not as the answer.",
        "Rule of thumb (plan Section 6): drains in 1-2 days = Upland/Midland;",
        "3-7 days = borderline; 7+ days = Lowland.",
    ])
    ws = sheet(wb, "Villages", [
        "Society", "Village Code", "Village Name", "Surveyed Plots", "Area (ha)",
        "ERP Lowland %", "Drainage Class", "Days Water Stands (monsoon)",
        "Assessed By", "Assessment Date", "Remarks"],
        [20, 11, 28, 13, 11, 13, 16, 16, 18, 15, 30])
    g = (df.groupby(["society", "plot_village_code", "plot_village"], sort=True)
           .agg(rows=("society", "size"), ha=("area_ha", "sum"),
                low=("land_type", lambda s: 100 * (s == "LOWLAND").mean()))
           .reset_index())
    for i, r in enumerate(g.itertuples(), 2):
        fill_row(ws, i, [r.society, r.plot_village_code, r.plot_village, r.rows,
                         round(r.ha, 1), round(r.low, 1), None, None, None, None, None],
                 input_cols=(7, 8, 9, 10, 11))
    dv_list(ws, "G", ["UPLAND", "MIDLAND", "LOWLAND", "MIXED"], len(g))
    wb.save(os.path.join(OUT, "B_Village_Land_Classification.xlsx"))

    # ---------------- C: variety master ----------------
    wb = Workbook(); wb.remove(wb.active)
    instructions(wb, "C - Variety Master (attributes)", [
        "One row per variety. The 12 plan varieties are pre-filled from the guiding",
        "document (Section 4) - agronomy team verifies and corrects.",
        "Remaining varieties found in the survey are listed below them with blanks:",
        "classify them, or set Strategic Direction = EXIT to fold into 'Others'.",
        "Do NOT edit the Variety column - names must match the ERP survey exactly.",
        "CoLK 14201 row carries the mill's field override (upland/midland autumn only).",
    ])
    hdrs = ["Variety", "Surveyed 2026-27 (ha)", "In Plan Doc?", "Maturity", "Juice Sucrose %",
            "NMC", "Ratoonability", "Red Rot", "Waterlogging", "Drought",
            "Land Suitability", "Planting Season", "Strategic Direction", "Source / Notes"]
    ws = sheet(wb, "VarietyMaster", hdrs, [14, 15, 10, 11, 12, 11, 12, 9, 12, 11, 12, 12, 15, 44])
    ha_by = df.groupby("vnorm").area_ha.sum()
    row = 2
    doc_norm = set()
    for (v, mat, suc, nmc, rat, rr, wl, dr, land, seas, direc, note) in DOC_VARIETIES:
        n = v.replace(" ", ""); doc_norm.add(n)
        fill_row(ws, row, [v, round(float(ha_by.get(n, 0)), 1), "YES", mat, suc, nmc, rat, rr, wl, dr, land, seas, direc, note],
                 input_cols=(4, 5, 6, 7, 8, 9, 10, 11, 12, 13))
        row += 1
    others = (df[~df.vnorm.isin(doc_norm)].groupby(["variety", "vnorm"]).area_ha.sum()
                .reset_index().sort_values("area_ha", ascending=False))
    for r in others.itertuples():
        if r.area_ha < 30:
            continue
        fill_row(ws, row, [r.variety, round(r.area_ha, 1), "NO"] + [None] * 10 + ["Not in plan document - classify or EXIT"],
                 input_cols=(4, 5, 6, 7, 8, 9, 10, 11, 12, 13))
        row += 1
    n = row - 1
    dv_list(ws, "D", ["EARLY", "GENERAL", "LONG-18M", "MIXED"], n)
    for col in ("F", "G", "I", "J"):
        dv_list(ws, col, ["EXCELLENT", "GOOD", "MODERATE", "POOR", "UNKNOWN"], n)
    dv_list(ws, "H", ["R", "MR", "S", "UNKNOWN"], n)
    dv_list(ws, "K", ["U", "M", "L", "U/M", "L/M", "U/M/L", "ANY"], n)
    dv_list(ws, "L", ["SPRING", "AUTUMN", "BOTH", "ANY"], n)
    dv_list(ws, "M", ["EXPAND", "MAINTAIN", "REDUCE", "EXIT", "SEED-MULT", "EVALUATE", "CLASSIFY"], n)
    wb.save(os.path.join(OUT, "C_Variety_Master.xlsx"))

    # ---------------- D: plan targets ----------------
    wb = Workbook(); wb.remove(wb.active)
    instructions(wb, "D - Three-Year Area Targets & Constraints", [
        "Pre-filled from the guiding document Section 5 Part A (revised July 2026).",
        "Edit ONLY when management formally revises the plan.",
        "OTHERS pools every variety not named above it.",
        "Constraints sheet: hard rules the plan engine checks every run.",
    ])
    ws = sheet(wb, "Targets", ["Variety", "Land Type (plan)", "Y0 2026-27 (ha)",
                               "Y1 2027-28 (ha)", "Y2 2028-29 (ha)", "Y3 2029-30 (ha)", "Notes"],
               [14, 14, 15, 15, 15, 15, 34])
    for i, (v, land, y0, y1, y2, y3) in enumerate(TARGETS, 2):
        fill_row(ws, i, [v, land, y0, y1, y2, y3, None], input_cols=(7,))
    fill_row(ws, len(TARGETS) + 2, ["TOTAL", "-", 57000, 57000, 57000, 57000, "Command area held constant"])
    ws2 = sheet(wb, "Constraints", ["Constraint", "Value", "Unit", "Applies To", "Source"],
                [42, 10, 8, 34, 22])
    cons = [
        ("Hard cap - any single variety", 40, "%", "All varieties, every year", "Doc cover page / S5"),
        ("Target max share by Year 3", 25, "%", "All varieties", "Doc S1 / S5"),
        ("Lowland coverage floor", 28, "%", "COLK 94184 + COS 13231 + CO 98014", "Doc S9 / S10"),
        ("CoLK 14201 area on LOWLAND", 0, "ha", "COLK 14201", "Doc S9 - most critical risk"),
        ("Red rot emergency threshold", 2, "%", "Any retained variety", "Doc S10 annual review"),
        ("Command area", 57000, "ha", "Totals every year", "Doc S2"),
    ]
    for i, c in enumerate(cons, 2):
        fill_row(ws2, i, list(c))
    wb.save(os.path.join(OUT, "D_Plan_Targets.xlsx"))

    # ---------------- E: seed & transition ----------------
    rat = df.crop_type.isin(["RATOON", "RATOON II"])
    carry = 100 * df[df.crop_type == "RATOON II"].area_ha.sum() / max(df[rat].area_ha.sum(), 1)
    wb = Workbook(); wb.remove(wb.active)
    instructions(wb, "E - Seed Multiplication & Transition Parameters", [
        "Parameters: the levers of how fast varietal change can physically happen.",
        "SeedPlots: what fraction of each expanding variety's area is set aside as",
        "seed plots (doc Section 7.2).",
        "Procurement: external breeder/foundation seed committed from institutions.",
        "Update Status as MoUs are signed and material arrives.",
    ])
    ws = sheet(wb, "Parameters", ["Parameter", "Value", "Unit", "Source / Note"], [34, 10, 8, 52])
    params = [
        ("seed_consumption_pct", 13, "%", "Share of planted area consumed as seed yearly (doc: 12-14%)"),
        ("sett_multiplication_ratio", 5.5, "x", "1 ha seed plot -> 5-6 ha commercial (doc 7.1)"),
        ("budchip_multiplication_ratio", 17.5, "x", "Bud chip 1:15-20 (doc 7.1)"),
        ("ratoon2_carry_pct", round(carry, 1), "%", "Share of ratoon area kept for 2nd ratoon (survey-derived)"),
        ("others_sucrose_pct", 16.8, "%", "Assumed juice sucrose for unclassified Others"),
    ]
    for i, p in enumerate(params, 2):
        fill_row(ws, i, list(p), input_cols=(2,))
    ws = sheet(wb, "SeedPlots", ["Variety", "Base Area (ha)", "Seed Plot Fraction %", "Method", "Notes"],
               [14, 14, 18, 12, 52])
    for i, (v, frac, meth, note) in enumerate(SEED_PLOTS, 2):
        fill_row(ws, i, [v, round(float(ha_by.get(v.replace(" ", ""), 0)), 1), frac, meth, note],
                 input_cols=(3, 4))
    dv_list(ws, "D", ["SETT", "BUDCHIP"], len(SEED_PLOTS))
    ws = sheet(wb, "Procurement", ["Variety", "Source Institution", "Season", "Planned (ha equiv.)", "Status", "Notes"],
               [14, 26, 10, 16, 14, 34])
    for i, (v, inst, seas, ha, note) in enumerate(PROCUREMENT, 2):
        fill_row(ws, i, [v, inst, seas, ha, "PLANNED", note], input_cols=(4, 5, 6))
    dv_list(ws, "E", ["PLANNED", "MOU-SIGNED", "RECEIVED", "CANCELLED"], len(PROCUREMENT))
    wb.save(os.path.join(OUT, "E_Seed_and_Transition.xlsx"))

    # ---------------- F: KPI actuals ----------------
    wb = Workbook(); wb.remove(wb.active)
    instructions(wb, "F - KPI Actuals (mill lab, demo plots, disease rounds)", [
        "Filled progressively through each season - these are the plan scoreboard.",
        "MillLab_Monthly: crushing-season lab averages (Oct-Apr rows pre-created).",
        "DemoPlot_NMC: harvest NMC counts at the 10-15 upland/midland demo sites",
        "(target: CoLK 14201 NMC >= +5% vs Co 0118 baseline).",
        "DiseaseSurvey: April and August pathology rounds, counts per village-variety.",
    ])
    ws = sheet(wb, "MillLab_Monthly", ["Season", "Month", "Cane Crushed (qtl)", "PoL % (juice)", "Recovery %", "Remarks"],
               [12, 10, 16, 13, 12, 30])
    r = 2
    for season in ("2026-27", "2027-28", "2028-29", "2029-30"):
        for m in ("Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"):
            fill_row(ws, r, [season, m, None, None, None, None], input_cols=(3, 4, 5, 6))
            r += 1
    ws = sheet(wb, "DemoPlot_NMC", ["Season", "Village", "Plot Serial", "Variety", "Land Type",
                                    "NMC per ha", "Single Cane Wt (kg)", "Harvest Date", "Remarks"],
               [10, 24, 14, 13, 11, 12, 16, 13, 26])
    for i in range(2, 62):
        fill_row(ws, i, [None] * 9, input_cols=tuple(range(1, 10)))
    dv_list(ws, "E", ["UPLAND", "MIDLAND", "LOWLAND"], 60)
    ws = sheet(wb, "DiseaseSurvey", ["Season", "Round", "Village", "Variety", "Plots Surveyed",
                                     "Red Rot (n)", "Smut (n)", "Other Disease (n)", "Survey Date", "Surveyor"],
               [10, 10, 24, 13, 13, 11, 9, 14, 12, 20])
    for i in range(2, 202):
        fill_row(ws, i, [None] * 10, input_cols=tuple(range(1, 11)))
    dv_list(ws, "B", ["APRIL", "AUGUST"], 200)
    wb.save(os.path.join(OUT, "F_KPI_Actuals.xlsx"))

    for f in sorted(os.listdir(OUT)):
        print("  %-42s %8.1f KB" % (f, os.path.getsize(os.path.join(OUT, f)) / 1024))


if __name__ == "__main__":
    main()
