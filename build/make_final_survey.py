# -*- coding: utf-8 -*-
"""Build the survey file to upload to the app.

    python build/make_final_survey.py
        -> Gobind_Survey_2026-27_FINAL.xlsx

This is the 2026-27 plot survey with one thing repaired: land type on ratoon
plots. Everything else is passed through untouched.

WHY ONLY LAND TYPE
------------------
The ERP writes UPLAND on all 92,319 ratoon rows without anyone having measured
them, which is why the raw file reads 23.8% lowland while the 34,021 ha that
WAS measured reads 39.5%. The cane team supplied village-level shares on
30 Sep 2026, and those cover 92,317 of the 92,319 ratoon rows.

HOW THE VILLAGE SHARE BECOMES A PLOT VALUE
------------------------------------------
Her figures are per village, and a plot needs one answer. Within each village
the ratoon plots are ordered by plot serial and grower - an arbitrary order,
but a fixed one, so the same input always gives the same output - and marked
LOWLAND until the village's lowland share is used up.

That gets the village total right. It does NOT claim to know which individual
field is low-lying: nothing in any file tells us that. The LANDTYPE_BASIS
column says which of the two each row is, so a measured value is never
mistaken for an estimated one.

WHAT IS DELIBERATELY NOT DONE
-----------------------------
  - Measured land type is never overwritten. A GPS-surveyed plot beats a
    village round number, and 85% of her figures are multiples of ten.
  - The 6,493 ha of ratoon plots that appear in the ratoon register but not in
    this survey are NOT added. Whether they are real or were ploughed out is
    still an open question with the cane team; inventing rows to settle it
    would be the same mistake the ERP made.
"""

import os
import sys
from collections import defaultdict

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "Plot Wise Survey Report 2026-2027.xlsx")
LAND = os.path.join(ROOT, "Village wise Upland and lowland.xlsx")
OUT = os.path.join(ROOT, "Gobind_Survey_2026-27_FINAL.xlsx")

# What the app's parser looks for, by header name. Carrying only these keeps
# the upload to a size a browser can read without complaint.
KEEP = [
    "g_soc_Cd", "so_name", "PL_VILL", "PL_GROW", "PlotVillageName",
    "pl_area", "CROPCATEGORY", "vr_name", "CROPTYPE",
    "DISEASES", "SOILTYPE", "LANDTYPE", "IRRIGRATION",
    "PL_LAT_1", "PL_LON_1", "PL_LAT_2", "PL_LON_2",
    "PL_LAT_3", "PL_LON_3", "PL_LAT_4", "PL_LON_4",
    "PL_PLANT_DT", "UpLoad_YN", "Amity_ErrorDesc",
    "PL_SERIAL",          # not read by the app; kept so rows stay traceable
]
EXTRA = "LANDTYPE_BASIS"


def village_lowland_share() -> dict:
    """{grower village code: lowland %} from the cane team's sheet."""
    wb = openpyxl.load_workbook(LAND, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    hdr = next(i for i, r in enumerate(rows)
               if r and any(str(c).strip() == "PL_VILL" for c in r if c))
    col = {str(c).strip(): j for j, c in enumerate(rows[hdr]) if c}
    wb.close()

    out = {}
    for r in rows[hdr + 1:]:
        if not r:
            continue
        code = r[col["PL_VILL"]]
        if code in (None, ""):
            continue                      # subtotal rows carry no code
        try:
            code = str(int(float(code)))
        except (TypeError, ValueError):
            code = str(code).strip()
        try:
            low = float(r[col["Low land"]])
        except (TypeError, ValueError):
            continue
        out[code] = low
    print(f"  land-type sheet: {len(out)} villages")
    return out


def main() -> None:
    share = village_lowland_share()

    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(it)]
    idx = {h: i for i, h in enumerate(header)}
    missing = [c for c in KEEP if c not in idx]
    if missing:
        sys.exit(f"source is missing columns: {missing}")

    take = [idx[c] for c in KEEP]
    i_ct, i_vill, i_area = idx["CROPTYPE"], idx["PL_VILL"], idx["pl_area"]
    i_ser, i_grow = idx["PL_SERIAL"], idx["PL_GROW"]

    # --- pass 1: collect the ratoon rows, village by village ---------------
    rows = []
    ratoon_by_village = defaultdict(list)
    for r in it:
        rows.append(r)
        if str(r[i_ct]).strip().upper() != "RATOON":
            continue
        code = str(r[i_vill]).strip()
        try:
            code = str(int(float(code)))
        except (TypeError, ValueError):
            pass
        try:
            area = float(r[i_area] or 0)
        except (TypeError, ValueError):
            area = 0.0
        ratoon_by_village[code].append((len(rows) - 1, area,
                                        str(r[i_ser]), str(r[i_grow])))
    wb.close()
    print(f"  survey: {len(rows):,} rows, {len(ratoon_by_village)} villages carry ratoon")

    # --- decide each ratoon row's land type --------------------------------
    assign = {}
    covered = uncovered = 0
    for code, plots in ratoon_by_village.items():
        pct = share.get(code)
        if pct is None:
            for i, _, _, _ in plots:
                assign[i] = None            # left as the ERP wrote it
                uncovered += 1
            continue
        # Fixed order, so the same survey always produces the same file.
        plots.sort(key=lambda p: (p[2], p[3], p[0]))
        target = sum(p[1] for p in plots) * pct / 100.0
        run = 0.0
        for i, area, _, _ in plots:
            if run + area / 2 <= target:    # half-in rounds to the nearer side
                assign[i] = "LOWLAND"
                run += area
            else:
                assign[i] = "UPLAND"
            covered += 1
    print(f"  ratoon rows: {covered:,} given a village share, {uncovered:,} left unchanged")

    # --- write --------------------------------------------------------------
    out = openpyxl.Workbook(write_only=True)
    sh = out.create_sheet("Survey")
    sh.append(KEEP + [EXTRA])
    i_land_out = KEEP.index("LANDTYPE")

    low_ha = tot_ha = 0.0
    for n, r in enumerate(rows):
        vals = [r[i] if i < len(r) else None for i in take]
        land = assign.get(n)
        if land is not None:
            vals[i_land_out] = land
            basis = "VILLAGE-ESTIMATE"
        else:
            basis = ("MEASURED" if str(r[i_ct]).strip().upper() != "RATOON"
                     else "NOT-RECORDED")
        try:
            a = float(r[i_area] or 0)
        except (TypeError, ValueError):
            a = 0.0
        tot_ha += a
        if str(vals[i_land_out]).strip().upper() == "LOWLAND":
            low_ha += a
        sh.append(vals + [basis])
        if n and n % 50000 == 0:
            print(f"    {n:,} rows written", file=sys.stderr)

    out.save(OUT)
    mb = os.path.getsize(OUT) / (1024 * 1024)
    print()
    print(f"wrote {OUT}  ({mb:.1f} MB)")
    print(f"  {len(rows):,} rows, {len(KEEP) + 1} columns")
    print(f"  lowland now {low_ha:,.0f} of {tot_ha:,.0f} ha = {low_ha / tot_ha * 100:.1f}%")
    print(f"  (raw file reads 23.8%; measured-only reads 39.5%)")


if __name__ == "__main__":
    main()
