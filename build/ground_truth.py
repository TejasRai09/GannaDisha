# -*- coding: utf-8 -*-
"""Independent expected values for the app, computed from the raw files.

    python build/ground_truth.py  ->  build/cache/ground_truth.json

Deliberately does NOT reuse the app's logic or the other build scripts. It
reads the final survey workbook and the cane team's sheet with pandas and
openpyxl and works the figures out from scratch, so a test that compares the
two is checking the app rather than checking itself.
"""

import json
import os
import re
import zipfile
from collections import defaultdict

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SURVEY = os.path.join(ROOT, "Gobind_Survey_2026-27_FINAL.xlsx")
SHEET = os.path.join(ROOT, "Variety_Input_TEMPLATE_2026-09-29.xlsx")
OUT = os.path.join(HERE, "cache", "ground_truth.json")

LAT = (27.0, 29.0)
LON = (80.0, 82.0)


def read_survey() -> dict:
    wb = openpyxl.load_workbook(SURVEY, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    h = [str(c).strip() if c is not None else "" for c in next(it)]
    i = {c: j for j, c in enumerate(h) if c}

    rows = 0
    area = 0.0
    crop_ha = defaultdict(float)
    land_ha = defaultdict(float)
    var_ha = defaultdict(float)
    basis_ha = defaultdict(float)
    villages, societies, growers, varieties = set(), set(), set(), set()
    fields = set()
    bad_gps = 0
    upload_fail = 0

    def f(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    for r in it:
        if not r or not r[i["vr_name"]]:
            continue
        rows += 1
        a = f(r[i["pl_area"]])
        area += a
        crop = str(r[i["CROPTYPE"]] or "").strip().upper()
        land = str(r[i["LANDTYPE"]] or "").strip().upper()
        basis = str(r[i["LANDTYPE_BASIS"]] or "").strip().upper()
        variety = str(r[i["vr_name"]]).strip()

        crop_ha[crop] += a
        var_ha[variety] += a
        varieties.add(variety)
        villages.add(str(r[i["PlotVillageName"]]).strip())
        societies.add(str(r[i["so_name"]]).strip())
        growers.add(f"{r[i['g_soc_Cd']]}|{r[i['PL_VILL']]}|{r[i['PL_GROW']]}")
        basis_ha[basis] += a
        if basis != "NOT-RECORDED" and land:
            land_ha[land] += a

        lats = [f(r[i[f"PL_LAT_{k}"]]) for k in (1, 2, 3, 4)]
        lons = [f(r[i[f"PL_LON_{k}"]]) for k in (1, 2, 3, 4)]
        ok = (all(LAT[0] < x < LAT[1] for x in lats)
              and all(LON[0] < x < LON[1] for x in lons))
        if ok:
            fields.add(tuple(round(x, 6) for x in lats + lons))
        else:
            bad_gps += 1
        # `0 or ""` is "" in Python, and UpLoad_YN is the integer 0 on a
        # failed row - the falsy idiom silently reported no failures at all.
        uy = r[i["UpLoad_YN"]]
        if uy is not None and str(uy).strip() in ("0", "0.0"):
            upload_fail += 1
    wb.close()

    locked = crop_ha["PLANT"] + crop_ha["AUTUMN"]
    free = crop_ha["RATOON"] + crop_ha["RATOON II"]
    low = land_ha.get("LOWLAND", 0.0)
    up = land_ha.get("UPLAND", 0.0)

    return {
        "rows": rows,
        "areaHa": round(area, 1),
        "physicalFields": len(fields),
        "growers": len(growers),
        "villages": len(villages),
        "societies": len(societies),
        "varieties": len(varieties),
        "lockedHa": round(locked, 1),
        "freeHa": round(free, 1),
        "lowlandHa": round(low, 1),
        "uplandHa": round(up, 1),
        "lowlandPct": round(low / (low + up) * 100, 1),
        "badGpsRows": bad_gps,
        "uploadFailRows": upload_fail,
        "cropHa": {k: round(v, 1) for k, v in sorted(crop_ha.items())},
        "basisHa": {k: round(v, 1) for k, v in sorted(basis_ha.items())},
        "topVarieties": [
            {"name": k, "areaHa": round(v, 1)}
            for k, v in sorted(var_ha.items(), key=lambda x: -x[1])[:10]
        ],
    }


def read_sheet() -> dict:
    wb = openpyxl.load_workbook(SHEET, data_only=True)
    ws = wb["Varieties"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = next(k for k, r in enumerate(rows)
               if r and any(str(c).strip() == "Variety" for c in r if c))
    h = [str(c).strip() if c is not None else "" for c in rows[hdr]]
    i = {c: j for j, c in enumerate(h) if c}
    wb.close()

    out, strat = {}, defaultdict(int)
    for r in rows[hdr + 1:]:
        if not r or not r[i["Variety"]]:
            continue
        name = str(r[i["Variety"]]).strip()

        def g(col):
            j = i.get(col)
            if j is None or j >= len(r):
                return None
            v = r[j]
            return None if v is None or str(v).strip() == "" else v

        s = str(g("Strategy") or "").upper()
        strat[s] += 1
        out[name] = {
            "strategy": s,
            "landSuitability": str(g("Land Suitability") or ""),
            "caneYieldTha": g("Cane Yield (t/ha)"),
            "avgCaneWeightGrams": g("Avg Cane Weight (g)"),
            "redRot": str(g("Red Rot Resistance") or ""),
            "farmerAcceptance": g("Farmer Acceptance (1-5)"),
            "seedAvailableQtl": g("Seed Available (qtl)"),
            "juiceSucrosePct": g("Juice Sucrose %"),
        }
    return {"varieties": out, "strategyCounts": dict(strat)}


def main() -> None:
    gt = {"survey": read_survey(), "sheet": read_sheet()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(gt, fh, indent=1)

    s = gt["survey"]
    print(f"wrote {OUT}\n")
    print("SURVEY")
    for k in ("rows", "areaHa", "physicalFields", "growers", "villages",
              "societies", "varieties", "lockedHa", "freeHa", "lowlandPct",
              "badGpsRows", "uploadFailRows"):
        print(f"  {k:<16} {s[k]:>12,}")
    print(f"  crop split       {s['cropHa']}")
    print(f"  land basis       {s['basisHa']}")
    print("\nSHEET")
    print(f"  varieties        {len(gt['sheet']['varieties'])}")
    print(f"  strategy counts  {gt['sheet']['strategyCounts']}")
    blank = sum(1 for v in gt["sheet"]["varieties"].values() if v["juiceSucrosePct"] is None)
    print(f"  sucrose blank on {blank} of {len(gt['sheet']['varieties'])}")


if __name__ == "__main__":
    main()
