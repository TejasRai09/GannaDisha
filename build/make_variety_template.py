# -*- coding: utf-8 -*-
"""Build the Step 2 variety workbook - the sheet the cane department fills in.

The survey (Step 1) measures the land. It cannot tell us what a variety IS:
how it ratoons, what it yields, whether it stands red rot, how much seed the
mill actually holds. That is agronomy knowledge, and it has to be typed in
once by someone who knows it.

This writes that sheet with every variety the survey found already listed, so
nobody has to transcribe 86 names by hand. The measured columns come pre-filled
and locked; the judgement columns are blank, with dropdowns so a typo cannot
enter the engine.

    python build/make_variety_template.py

Outputs into plan_inputs/:
    Variety_Input_TEMPLATE.xlsx   blank - this is the one to hand to the team
    Variety_Input_SAMPLE.xlsx     filled with INVENTED numbers, to test upload

The SAMPLE file is test data. Every agronomic value in it is synthetic. It
exists to exercise the upload path, not to plan anything.
"""

import datetime
import os
import random
import subprocess
import sys

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots_2627.parquet")
OUT_DIR = os.path.join(ROOT, "plan_inputs")

# Filling every variety is pointless - the tail is a rounding error. Rows are
# marked FILL FIRST until the cumulative area share crosses this line.
CORE_COVERAGE = 0.95

# --- the vocabulary the engine accepts -------------------------------------
# Kept here so the dropdown, the sample generator and the app parser cannot
# drift apart. If a value changes, it changes in one place.
LISTS = {
    "Stage": ["TRIAL", "MULTIPLYING", "COMMERCIAL", "DECLINING", "RETIRED", "REVIEW"],
    "Strategy": ["INTRODUCE-NEW", "EXPAND", "HOLD", "REDUCE", "EXIT"],
    "Land Suitability": ["UPLAND", "LOWLAND", "BOTH"],
    "Planting Season": ["SPRING", "AUTUMN", "BOTH"],
    "Crop Duration": ["12-MONTH", "18-MONTH"],
    "Red Rot Resistance": ["R", "MR", "S"],
    "Animal Damage Risk": ["LOW", "MEDIUM", "HIGH"],
}

# (header, width, kind, note shown in the guide sheet)
MEASURED_COLS = [
    ("#", 5, "int", "Rank by area."),
    ("Variety", 22, "text", "Exactly as the ERP spells it. Do not edit - this is how the engine matches your row back to the survey."),
    ("Area (ha)", 12, "num1", "What the 2026-27 survey found on the ground."),
    ("% of Area", 10, "pct1", "Share of the total command area."),
    ("Cumulative %", 13, "pct1", "Running total down the sheet."),
    ("Lowland % (measured)", 19, "pct1", "How much of this variety the survey actually found on lowland. Use it to sanity-check the Land Suitability you enter."),
    ("Survey Records", 14, "int", "Rows behind the figure. A handful of records means the area is not reliable."),
    ("Priority", 12, "text", "FILL FIRST covers 95% of your area. The rest is optional."),
]

JUDGED_COLS = [
    ("Stage", 15, "list", "Where the variety is in its life: TRIAL, MULTIPLYING, COMMERCIAL, DECLINING, RETIRED, or REVIEW if you are not sure yet."),
    ("Strategy", 16, "list", "What you WANT it to do next: EXPAND, HOLD, REDUCE, EXIT, or INTRODUCE-NEW."),
    ("Land Suitability", 17, "list", "Which land it belongs on. BOTH if it grows anywhere. Compare against the measured lowland % on the left."),
    ("Planting Season", 16, "list", "SPRING (Feb-Mar), AUTUMN (Oct-Nov), or BOTH."),
    ("Crop Duration", 14, "list", "12-MONTH or 18-MONTH. An 18-month autumn crop holds the field through two seasons - this changes the whole plan."),
    ("Juice Sucrose %", 15, "num1", "Pol in cane, roughly 14 to 20. Leave blank if not known - do NOT put 0."),
    ("Cane Yield (t/ha)", 16, "num1", "Tonnes per hectare, roughly 50 to 110. This is what decides how much sugar the plan is worth."),
    ("Avg Cane Weight (g)", 18, "int", "Single cane weight in grams, roughly 400 to 1200. This is what the farmer notices."),
    ("Red Rot Resistance", 18, "list", "R = resistant, MR = moderately resistant, S = susceptible. An S variety should not be expanded."),
    ("Animal Damage Risk", 18, "list", "LOW, MEDIUM or HIGH. Soft sweet canes get eaten."),
    ("Farmer Acceptance (1-5)", 21, "int", "1 = farmers refuse it, 5 = they ask for it. A plan farmers reject is not a plan."),
    ("Seed Available (qtl)", 18, "int", "Quintals of seed of this variety you can actually get hold of for the coming season. 0 is a real answer here."),
    ("Notes", 42, "text", "Anything else worth knowing."),
]

# --- styling ---------------------------------------------------------------
INK = "1F2937"
HDR_MEASURED = "334155"   # slate - the columns they must not touch
HDR_JUDGED = "0F766E"     # teal  - the columns they fill
BAND_MEASURED = "F1F5F9"
BAND_JUDGED = "FFFFFF"
BAND_CORE = "FEF9C3"      # highlight on the FILL FIRST marker
THIN = Side(style="thin", color="CBD5E1")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def load_varieties() -> pd.DataFrame:
    if not os.path.exists(CACHE):
        print("cache missing - extracting from the workbook first (about 70s) ...")
        subprocess.run([sys.executable, os.path.join(HERE, "extract_2627.py")], check=True)
    df = pd.read_parquet(CACHE)

    total = df.area_ha.sum()
    g = (
        df.groupby("variety")
        .agg(area_ha=("area_ha", "sum"), records=("variety", "size"))
        .reset_index()
    )
    low = df.assign(_low=df.land_type.eq("LOWLAND")).groupby("variety")._low.mean()
    g["lowland_pct"] = g.variety.map(low) * 100
    g = g[g.area_ha > 0].sort_values("area_ha", ascending=False).reset_index(drop=True)
    g["share_pct"] = g.area_ha / total * 100
    g["cum_pct"] = g.share_pct.cumsum()
    g["priority"] = ["FILL FIRST" if c <= CORE_COVERAGE * 100 else "optional" for c in g.cum_pct]
    return g


def sample_values(name: str, area: float, lowland_pct: float, rng: random.Random) -> dict:
    """INVENTED agronomic values, deterministic per variety.

    Nothing here is a real measurement. The ranges are plausible so that charts
    and totals downstream look sane while the upload path is being tested; the
    numbers themselves mean nothing and must never reach a real plan.
    """
    stage = "COMMERCIAL" if area > 500 else ("REVIEW" if area > 50 else "TRIAL")
    strategy = "HOLD"
    if area > 5000:
        strategy = rng.choice(["HOLD", "REDUCE"])
    elif area > 300:
        strategy = rng.choice(["EXPAND", "HOLD"])
    else:
        strategy = rng.choice(["INTRODUCE-NEW", "EXPAND", "HOLD"])

    # Let the measured split suggest the land rule, so the sample is at least
    # self-consistent with the survey it came from.
    if lowland_pct >= 35:
        land = "LOWLAND"
    elif lowland_pct >= 15:
        land = "BOTH"
    else:
        land = "UPLAND"

    season = rng.choice(["SPRING", "SPRING", "BOTH", "AUTUMN"])
    duration = "18-MONTH" if season == "AUTUMN" else "12-MONTH"

    return {
        "Stage": stage,
        "Strategy": strategy,
        "Land Suitability": land,
        "Planting Season": season,
        "Crop Duration": duration,
        "Juice Sucrose %": round(rng.uniform(15.5, 19.2), 1),
        "Cane Yield (t/ha)": round(rng.uniform(58, 98), 1),
        "Avg Cane Weight (g)": int(rng.uniform(550, 1050)),
        "Red Rot Resistance": rng.choice(["R", "MR", "MR", "S"]),
        "Animal Damage Risk": rng.choice(["LOW", "MEDIUM", "MEDIUM", "HIGH"]),
        "Farmer Acceptance (1-5)": rng.randint(2, 5),
        "Seed Available (qtl)": int(max(0, rng.gauss(area * 0.9, area * 0.4))),
        "Notes": "SAMPLE - invented value, not a measurement",
    }


def build(df: pd.DataFrame, filled: bool, path: str, source_note: str) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Varieties"

    cols = MEASURED_COLS + JUDGED_COLS
    n_measured = len(MEASURED_COLS)
    ncol = len(cols)

    # --- banner ---
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncol)
    t = ws.cell(row=1, column=1)
    t.value = (
        "VARIETY INPUT - SAMPLE (TEST DATA, DO NOT USE FOR PLANNING)"
        if filled
        else "VARIETY INPUT SHEET - Gobind Sugar Mill, Aira"
    )
    t.font = Font(bold=True, size=14, color="FFFFFF")
    t.fill = PatternFill("solid", fgColor="B91C1C" if filled else "0F766E")
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncol)
    s = ws.cell(row=2, column=1)
    s.value = (
        "Every agronomic number below is INVENTED for testing the upload. It is not a measurement."
        if filled
        else "Grey columns come from the survey - do not change them. Fill the teal columns. "
        "Rows marked FILL FIRST cover 95% of your area. See the 'How to fill this' sheet."
    )
    s.font = Font(size=10, italic=True, color="7F1D1D" if filled else "475569")
    s.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 18

    ws.cell(row=3, column=1).value = source_note
    ws.cell(row=3, column=1).font = Font(size=9, color="94A3B8")

    # --- header row ---
    HDR = 4
    for i, (label, width, _kind, _note) in enumerate(cols, start=1):
        c = ws.cell(row=HDR, column=i)
        c.value = label
        c.font = Font(bold=True, size=10, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=HDR_MEASURED if i <= n_measured else HDR_JUDGED)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[HDR].height = 34

    # --- data rows ---
    rng = random.Random(20260916)  # deterministic: same sample file every run
    first = HDR + 1
    for r, row in enumerate(df.itertuples(), start=first):
        vals = {
            "#": r - HDR,
            "Variety": row.variety,
            "Area (ha)": round(float(row.area_ha), 1),
            "% of Area": round(float(row.share_pct), 2),
            "Cumulative %": round(float(row.cum_pct), 2),
            "Lowland % (measured)": round(float(row.lowland_pct), 1),
            "Survey Records": int(row.records),
            "Priority": row.priority,
        }
        if filled:
            vals.update(
                sample_values(row.variety, float(row.area_ha), float(row.lowland_pct), rng)
            )

        for i, (label, _w, kind, _note) in enumerate(cols, start=1):
            c = ws.cell(row=r, column=i)
            v = vals.get(label)
            if v is not None:
                c.value = v
            c.border = BORDER
            c.font = Font(size=10, color=INK, bold=(label == "Variety"))
            measured = i <= n_measured
            fill = BAND_MEASURED if measured else BAND_JUDGED
            if label == "Priority" and row.priority == "FILL FIRST":
                fill = BAND_CORE
            c.fill = PatternFill("solid", fgColor=fill)
            if kind == "num1":
                c.number_format = "0.0"
                c.alignment = Alignment(horizontal="right")
            elif kind == "pct1":
                c.number_format = "0.0"
                c.alignment = Alignment(horizontal="right")
            elif kind == "int":
                c.number_format = "#,##0"
                c.alignment = Alignment(horizontal="right")
            elif kind == "list":
                c.alignment = Alignment(horizontal="center")
            else:
                c.alignment = Alignment(horizontal="left")

    last = first + len(df) - 1

    # --- dropdowns on the judgement columns ---
    for i, (label, _w, kind, _note) in enumerate(cols, start=1):
        if kind != "list":
            continue
        opts = ",".join(LISTS[label])
        dv = DataValidation(
            type="list",
            formula1=f'"{opts}"',
            allow_blank=True,
            showDropDown=False,          # False = DO show the arrow (openpyxl quirk)
            errorTitle="Not an accepted value",
            error=f"Choose one of: {', '.join(LISTS[label])}",
            promptTitle=label,
            prompt=f"Pick one of: {', '.join(LISTS[label])}",
        )
        ws.add_data_validation(dv)
        col = get_column_letter(i)
        dv.add(f"{col}{first}:{col}{last}")

    # numeric guards, so a slipped decimal is caught at entry rather than by the engine
    for label, lo, hi in [
        ("Juice Sucrose %", 10, 24),
        ("Cane Yield (t/ha)", 20, 160),
        ("Avg Cane Weight (g)", 200, 2000),
        ("Farmer Acceptance (1-5)", 1, 5),
        ("Seed Available (qtl)", 0, 10_000_000),
    ]:
        i = [c[0] for c in cols].index(label) + 1
        dv = DataValidation(
            type="decimal",
            operator="between",
            formula1=lo,
            formula2=hi,
            allow_blank=True,
            errorTitle="Out of range",
            error=f"{label} should be between {lo} and {hi}. Leave blank if not known.",
        )
        ws.add_data_validation(dv)
        col = get_column_letter(i)
        dv.add(f"{col}{first}:{col}{last}")

    ws.freeze_panes = ws.cell(row=first, column=3)
    ws.auto_filter.ref = f"A{HDR}:{get_column_letter(ncol)}{last}"

    _guide_sheet(wb, cols, n_measured, len(df), source_note)
    wb.save(path)


def _guide_sheet(wb, cols, n_measured, n_var, source_note):
    """Plain-language instructions. Assume the reader has not seen the app."""
    g = wb.create_sheet("How to fill this")
    g.column_dimensions["A"].width = 26
    g.column_dimensions["B"].width = 104

    def line(a, b="", bold=False, size=10, color=INK, gap=False):
        r = g.max_row + (2 if gap else 1)
        ca, cb = g.cell(row=r, column=1), g.cell(row=r, column=2)
        ca.value, cb.value = a, b
        ca.font = Font(bold=True, size=size, color=color)
        cb.font = Font(size=size, color=color)
        cb.alignment = Alignment(wrap_text=True, vertical="top")
        return r

    line("HOW TO FILL THIS SHEET", "", bold=True, size=14, color="0F766E")
    line("", source_note)

    line("What this is for", "", gap=True)
    line("", "The survey tells us where every field is and what is growing on it. It cannot tell us what a "
             "variety is LIKE - how it ratoons, what it yields, whether it survives red rot, how much seed we "
             "hold. That has to be written down once, by someone who knows the crop. That is this sheet.")

    line("What is already done", "", gap=True)
    line("", f"All {n_var} varieties the survey found are already listed, biggest area first. You do not have "
             "to type a single name.")
    line("", "The grey columns are measured facts from the survey. Please do not change them - the Variety "
             "column especially, because that is how the system matches your row back to the survey.")

    line("What you need to do", "", gap=True)
    line("", "Fill the teal columns. Most are dropdowns - click the cell and a small arrow appears.")
    line("", "Start with the rows marked FILL FIRST. There are only a handful and they cover 95% of the "
             "area. The long tail below them is tiny and can wait.")

    line("Two rules", "", gap=True)
    line("", "1. If you do not know a number, LEAVE IT BLANK. Do not put 0. Blank means 'nobody has told us "
             "yet' and the system will ask for it. A 0 means 'we measured it and it is zero', which is a "
             "different thing and will quietly spoil the plan.")
    line("", "2. Seed Available is the exception. There, 0 is a real and useful answer - it means we hold no "
             "seed of this variety.")

    line("A useful cross-check", "", gap=True)
    line("", "The 'Lowland % (measured)' column shows how much of that variety the survey actually found "
             "sitting on lowland. If it reads 40% and you mark the variety UPLAND, one of the two is wrong - "
             "worth a look before you send the sheet back.")

    line("COLUMN BY COLUMN", "", gap=True)
    line("", "")
    for i, (label, _w, _kind, note) in enumerate(cols, start=1):
        r = line(label, note)
        g.cell(row=r, column=1).fill = PatternFill(
            "solid", fgColor=BAND_MEASURED if i <= n_measured else "CCFBF1"
        )

    line("Accepted values", "", gap=True)
    for k, v in LISTS.items():
        line(k, " / ".join(v))

    line("When you are done", "", gap=True)
    line("", "Save the file and upload it on Step 2 of the Varietal Planning System. Do not rename the "
             "columns or move them around - the system reads them by name.")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    df = load_varieties()
    stamp = datetime.datetime.now().strftime("%d %b %Y")
    note = (
        f"Varieties from the 2026-27 plot survey - {len(df)} found, "
        f"{int((df.priority == 'FILL FIRST').sum())} marked FILL FIRST. Generated {stamp}."
    )

    blank = os.path.join(OUT_DIR, "Variety_Input_TEMPLATE.xlsx")
    sample = os.path.join(OUT_DIR, "Variety_Input_SAMPLE.xlsx")
    build(df, filled=False, path=blank, source_note=note)
    build(df, filled=True, path=sample, source_note=note + "  SAMPLE DATA - INVENTED, NOT MEASURED.")

    core = df[df.priority == "FILL FIRST"]
    print(f"varieties      {len(df):>6}")
    print(f"FILL FIRST     {len(core):>6}   covering {core.share_pct.sum():.1f}% of area")
    print(f"optional tail  {len(df) - len(core):>6}   covering {df.share_pct.sum() - core.share_pct.sum():.1f}%")
    for p in (blank, sample):
        print(f"  wrote {p}  ({os.path.getsize(p) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
