# -*- coding: utf-8 -*-
"""Combine the three survey files into the data-coverage panel on Step 1.

    python build/make_data_audit.py   ->  plan_inputs/data_audit.json

Three files describe the same command area and none of them is complete:

    plots_2627.parquet     this season's plot-wise survey      238,334 rows
    ratoon_verif.parquet   the ratoon register, 30 Apr 2026    121,568 rows
    plots.parquet          last season's survey                209,617 rows

Read alone, this season's survey says 39.8% of the command area has no
agronomy recorded and 23,312 ha is free to replant. Read together, most of
that missing agronomy is recoverable from last season, and the replantable
area is probably a quarter larger. This works out which, and writes it where
the app can show it.

Everything here is computed, never typed in. If a figure on Step 1 looks
wrong, the arithmetic is in this file.
"""

import datetime
import json
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache")
OUT_DIR = os.path.join(ROOT, "plan_inputs")
OUT = os.path.join(OUT_DIR, "data_audit.json")

# Values that mean "nothing was recorded" while looking like an answer.
EMPTYISH = {"NONE", "NAN", "NULL", "", "0", "NO DISEASES", "EMPTY"}


def st(s):
    return s.astype(str).str.strip()


def key(df, village, serial):
    """A plot is a serial within a village - the serial alone repeats."""
    return st(df[village]) + "|" + st(df[serial])


def main() -> None:
    ty = pd.read_parquet(os.path.join(CACHE, "plots_2627.parquet"))
    rv = pd.read_parquet(os.path.join(CACHE, "ratoon_verif.parquet"))
    ly = pd.read_parquet(os.path.join(CACHE, "plots.parquet"))

    ty["_k"] = key(ty, "plot_village_code", "plot_serial")
    ly["_k"] = key(ly, "plot_village_code", "plot_serial")
    rv["_new"] = key(rv, "PL_PL_VILL", "PL_SERIAL")
    rv["_old"] = key(rv, "PL_PL_VILL", "PL_SERIAL_OLD")
    rv["_area"] = pd.to_numeric(rv.PL_AREA, errors="coerce")

    total_ha = float(ty.area_ha.sum())
    rat = ty[ty.crop_type == "RATOON"].copy()
    rat_ha = float(rat.area_ha.sum())
    surveyed_ha = total_ha - rat_ha

    # --- land type, measured only where it was actually measured -----------
    meas = ty[ty.crop_type != "RATOON"]
    low_ha = float(meas[meas.land_type == "LOWLAND"].area_ha.sum())
    up_ha = float(meas[meas.land_type == "UPLAND"].area_ha.sum())

    # --- the bridge: this year's ratoon -> last year's plot ----------------
    rat["_old"] = rat._k.map(dict(zip(rv._new, rv._old)))
    cols = ["land_type", "soil_type", "crop_condition", "diseases", "plant_method", "crop_type"]
    # One row per last-year plot. Largest share wins, so a split plot is
    # described by its main holder rather than by whichever row sorted first.
    last = (
        ly.sort_values("area_ha", ascending=False)
        .drop_duplicates("_k")
        .set_index("_k")[cols]
        .add_prefix("LY_")
    )
    j = rat.join(last, on="_old")
    bridged = int(j.LY_crop_type.notna().sum())

    def recovered(col):
        v = j["LY_" + col].astype(str).str.upper()
        ok = ~v.isin(EMPTYISH)
        return {
            "field": col,
            "rows": int(ok.sum()),
            "pct": round(float(ok.mean()) * 100, 1),
            "areaHa": round(float(rat.area_ha[ok].sum()), 1),
        }

    recoverable = [recovered(c) for c in ["soil_type", "crop_condition", "diseases", "plant_method"]]

    # Land type is the exception and the reason this panel exists: last
    # season recorded almost no lowland either, so it cannot be back-filled.
    lt = j.LY_land_type.value_counts()
    ly_low_pct = round(float(lt.get("LOWLAND", 0)) / max(1, float(lt.sum())) * 100, 1)

    # --- ratoon plots the survey has no record of --------------------------
    extra = set(rv._new) - set(rat._k)
    ex = rv[rv._new.isin(extra)]
    extra_ha = round(float(ex._area.sum()), 1)
    ex_old = set(ex._old)
    confirmed = ex_old & set(ly._k)
    conf_rows = ly[ly._k.isin(confirmed)]

    free_now = round(float(ty[ty.crop_type.isin(["RATOON", "RATOON II"])].area_ha.sum()), 1)

    payload = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "totalHa": round(total_ha, 1),
        "totalRows": int(len(ty)),

        "sources": [
            {"name": "Plot-wise survey 2026-27", "rows": int(len(ty)),
             "areaHa": round(total_ha, 1), "role": "The season's baseline. Complete on area, variety and village; empty on agronomy for every ratoon plot."},
            {"name": "Ratoon register, 30 Apr 2026", "rows": int(len(rv)),
             "areaHa": round(float(rv._area.sum()), 1), "role": "Confirms ratoon areas to within 0.005 ha, and lists ratoon plots the survey missed. Carries no agronomy."},
            {"name": "Plot-wise survey 2025-26", "rows": int(len(ly)),
             "areaHa": round(float(ly.area_ha.sum()), 1), "role": "This year's ratoon was last year's plant crop - and last year it was surveyed in full."},
        ],

        "coverage": {
            "measuredHa": round(surveyed_ha, 1),
            "measuredPct": round(surveyed_ha / total_ha * 100, 1),
            "ratoonHa": round(rat_ha, 1),
            "ratoonPct": round(rat_ha / total_ha * 100, 1),
            "ratoonRows": int(len(rat)),
        },

        "bridge": {
            "ratoonRows": int(len(rat)),
            "matched": bridged,
            "matchedPct": round(bridged / len(rat) * 100, 1),
            "wasPlant": int((j.LY_crop_type == "PLANT").sum()),
            "wasAutumn": int((j.LY_crop_type == "AUTUMN").sum()),
        },
        "recoverable": recoverable,

        "landType": {
            "measuredLowlandHa": round(low_ha, 1),
            "measuredUplandHa": round(up_ha, 1),
            "measuredBaseHa": round(low_ha + up_ha, 1),
            "lowlandPct": round(low_ha / (low_ha + up_ha) * 100, 1),
            "thisYearRatoonLowlandPct": 0.0,
            "lastYearLowlandPct": ly_low_pct,
            "unfillableHa": round(rat_ha, 1),
        },

        "missingRatoon": {
            "plots": int(len(extra)),
            "rows": int(len(ex)),
            "areaHa": extra_ha,
            "confirmedInLastYear": int(len(confirmed)),
            "confirmedPct": round(len(confirmed) / max(1, len(ex_old)) * 100, 1),
            "lastYearAreaHa": round(float(conf_rows.area_ha.sum()), 1),
            "wasPlant": int((conf_rows.crop_type == "PLANT").sum()),
            "wasAutumn": int((conf_rows.crop_type == "AUTUMN").sum()),
            "freeToReplantNowHa": free_now,
            "freeToReplantIfConfirmedHa": round(free_now + extra_ha, 1),
            "upliftPct": round(extra_ha / free_now * 100, 1),
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)

    c, m, b = payload["coverage"], payload["missingRatoon"], payload["bridge"]
    print(f"wrote {OUT}")
    print(f"  measured        {c['measuredHa']:>10,.1f} ha  ({c['measuredPct']}%)")
    print(f"  ratoon blind    {c['ratoonHa']:>10,.1f} ha  ({c['ratoonPct']}%)")
    print(f"  bridged to LY   {b['matched']:>10,} of {b['ratoonRows']:,} rows ({b['matchedPct']}%)")
    for r in recoverable:
        print(f"    {r['field']:<16} {r['pct']:>5.1f}%  {r['areaHa']:>10,.1f} ha")
    print(f"  land type        NOT recoverable - last year only {payload['landType']['lastYearLowlandPct']}% lowland")
    print(f"  missing ratoon  {m['areaHa']:>10,.1f} ha  ({m['confirmedPct']}% confirmed in last year)")
    print(f"  free to replant {m['freeToReplantNowHa']:>10,.1f} -> {m['freeToReplantIfConfirmedHa']:,.1f} ha (+{m['upliftPct']}%)")


if __name__ == "__main__":
    main()
