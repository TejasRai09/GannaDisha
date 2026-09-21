# -*- coding: utf-8 -*-
"""Turn the ERP plot survey into the small JSON the planning app loads.

The survey workbook is ~78 MB and 238k rows - far too heavy to open in a
browser. This does the reading once, in Python, and writes a file of a few
hundred KB that the app can ingest instantly.

    python build/make_baseline.py

Output: plan_inputs/baseline.json

The JSON's `baseline` object matches the BaselineData interface in
src/types/index.ts field for field. If that interface changes, change this too.
"""

import datetime
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots_2627.parquet")
SURVEY = os.environ.get("SURVEY_XLSX") or os.path.join(
    ROOT, "Plot Wise Survey Report 2026-2027.xlsx"
)
OUT_DIR = os.path.join(ROOT, "plan_inputs")
OUT = os.path.join(OUT_DIR, "baseline.json")

# A plot's GPS corners must sit inside the district for the polygon to be usable.
LAT_RANGE = (27.0, 29.0)
LON_RANGE = (80.0, 82.0)


def load_survey() -> pd.DataFrame:
    """Prefer the Parquet cache; build it from the workbook if absent."""
    if not os.path.exists(CACHE):
        print("cache missing - extracting from the workbook first (about 70s) ...")
        subprocess.run([sys.executable, os.path.join(HERE, "extract_2627.py")], check=True)
    df = pd.read_parquet(CACHE)
    df["vnorm"] = df.variety.astype(str).str.replace(" ", "", regex=False).str.upper()
    return df


def gps_valid_mask(df: pd.DataFrame) -> np.ndarray:
    lat = df[["lat1", "lat2", "lat3", "lat4"]].to_numpy(float)
    lon = df[["lon1", "lon2", "lon3", "lon4"]].to_numpy(float)
    bad = (
        (lat == 0).any(1)
        | (lon == 0).any(1)
        | np.isnan(lat).any(1)
        | np.isnan(lon).any(1)
        | ~((lat > LAT_RANGE[0]) & (lat < LAT_RANGE[1])).all(1)
        | ~((lon > LON_RANGE[0]) & (lon < LON_RANGE[1])).all(1)
    )
    return ~bad


def count_physical_plots(df: pd.DataFrame, ok: np.ndarray) -> int:
    """Rows are grower shares; identical GPS corners mean one physical field."""
    lat = df[["lat1", "lat2", "lat3", "lat4"]].to_numpy(float)[ok]
    lon = df[["lon1", "lon2", "lon3", "lon4"]].to_numpy(float)[ok]
    key = pd.MultiIndex.from_arrays(
        [np.round(lat[:, i], 6) for i in range(4)] + [np.round(lon[:, i], 6) for i in range(4)]
    )
    return int(pd.factorize(key)[0].max() + 1)


def breakdowns(df: pd.DataFrame, ok: np.ndarray, varieties: list) -> dict:
    """The detail tables behind the headline figures on Step 1.

    Every metric card on that screen opens into one of these. The browser
    worker builds them when a survey is uploaded; this builds the same three
    tables, to the same shape, for the copy that ships with the deployment.
    Without them the cards open onto an empty panel, which reads as a card
    that does not open at all.
    """
    d = df.copy()

    # A field is a set of GPS corners, not a row - rows are grower shares, and
    # several of them can describe one physical field.
    lat = d[["lat1", "lat2", "lat3", "lat4"]].to_numpy(float)
    lon = d[["lon1", "lon2", "lon3", "lon4"]].to_numpy(float)
    corners = pd.MultiIndex.from_arrays(
        [np.round(lat[:, i], 6) for i in range(4)] + [np.round(lon[:, i], 6) for i in range(4)]
    )
    d["_field"] = pd.factorize(corners)[0]
    d.loc[~ok, "_field"] = -1          # no usable GPS: not a countable field
    d["_grower"] = (
        d.society_code.astype(str) + "/" + d.grower_village_code.astype(str)
        + "/" + d.grower_code.astype(str)
    )

    def fields(g):
        return int(g[g >= 0].nunique())

    vil = (
        d.groupby("plot_village")
        .agg(
            society=("society", "first"),
            areaHa=("area_ha", "sum"),
            fields=("_field", fields),
            growers=("_grower", "nunique"),
            records=("area_ha", "size"),
        )
        .reset_index()
        .rename(columns={"plot_village": "name"})
        .sort_values("areaHa", ascending=False)
    )

    soc = (
        d.groupby("society")
        .agg(
            areaHa=("area_ha", "sum"),
            villages=("plot_village", "nunique"),
            fields=("_field", fields),
            growers=("_grower", "nunique"),
            records=("area_ha", "size"),
        )
        .reset_index()
        .rename(columns={"society": "name"})
        .sort_values("areaHa", ascending=False)
    )

    return {
        "villageBreakdown": [
            {
                "name": str(r.name), "society": str(r.society),
                "areaHa": round(float(r.areaHa), 1),
                "fields": int(r.fields), "growers": int(r.growers),
                "records": int(r.records),
            }
            for r in vil.itertuples(index=False)
        ],
        "societyBreakdown": [
            {
                "name": str(r.name), "areaHa": round(float(r.areaHa), 1),
                "villages": int(r.villages), "fields": int(r.fields),
                "growers": int(r.growers), "records": int(r.records),
            }
            for r in soc.itertuples(index=False)
        ],
        "varietyBreakdown": varieties,
    }


def build_quality_flags(df: pd.DataFrame, dropped: int) -> list:
    """Only report what the data actually shows - no fixed list of warnings."""
    flags = []
    total = len(df)

    # Reported first: it is the largest figure on the panel, and a 0.6% GPS drop
    # listed above a 39% upload failure misleads about where the data is weak.
    if "upload_yn" in df.columns:
        failed = df[df.upload_yn.astype(str).str.strip() == "0"]
        if len(failed):
            pct = len(failed) / total * 100
            top = ""
            if "upload_error" in df.columns:
                vc = failed.upload_error.astype(str).str.strip().value_counts().head(2)
                top = "; ".join(f"{k} ({v:,})" for k, v in vc.items())
            flags.append({
                "severity": "warning",
                "title": f"ERP upload failed on {pct:.0f}% of records - {failed.area_ha.sum():,.1f} ha",
                "detail": (
                    f"{len(failed):,} rows carry UpLoad_YN = 0"
                    + (f". Mostly: {top}" if top else "")
                    + ". These rows are KEPT and counted in full - the cane is in the ground whether "
                      "or not the row reached Amity. Treat it as a warning about ERP record-keeping, "
                      "not about the survey."
                ),
            })

    recorded_lt = df[df.crop_type != "RATOON"]
    unrecorded_ha = float(df.area_ha.sum() - recorded_lt.area_ha.sum())
    if unrecorded_ha > 0:
        rec_ha = float(recorded_lt.area_ha.sum())
        low_ha = float(recorded_lt[recorded_lt.land_type == "LOWLAND"].area_ha.sum())
        low_pct = low_ha / rec_ha * 100 if rec_ha else 0
        flags.append({
            "severity": "warning",
            "title": f"Land type not recorded on {unrecorded_ha:,.1f} ha of ratoon",
            "detail": (
                "The ERP leaves LANDTYPE blank on every RATOON row, so those plots default to "
                f"UPLAND. The split shown is measured on the {rec_ha:,.1f} ha where the value "
                f"actually exists, giving {low_pct:.1f}% lowland. Counting the ratoon land as "
                "upland would have shown about 24% instead."
            ),
        })

    blank_soil = float((df.soil_type.astype(str).str.upper().isin(["NONE", "", "NAN"])).mean())
    if blank_soil > 0.05:
        flags.append({
            "severity": "warning",
            "title": f"Soil type unassigned on {blank_soil * 100:.0f}% of records",
            "detail": "Those plots carry no soil classification; land-suitability checks fall back to the land type alone.",
        })

    usable_date = float((df.plant_date > pd.Timestamp("1990-01-01")).mean())
    if usable_date < 0.95:
        flags.append({
            "severity": "warning",
            "title": f"Planting date usable on only {usable_date * 100:.0f}% of records",
            "detail": "Autumn vs spring compliance cannot be verified for the remainder.",
        })

    if dropped:
        flags.append({
            "severity": "critical",
            "title": f"{dropped:,} rows dropped - unusable GPS",
            "detail": "A corner was recorded as zero or falls outside the district, so the field cannot be located.",
        })

    # The irrigation column tracks crop type rather than irrigation - a known defect.
    plant_irr = df.loc[df.crop_type == "PLANT", "irrigation"].astype(str).str.upper().eq("YES").mean()
    rat_irr = df.loc[df.crop_type.isin(["RATOON", "RATOON II"]), "irrigation"].astype(str).str.upper().eq("YES").mean()
    if pd.notna(plant_irr) and pd.notna(rat_irr) and abs(plant_irr - rat_irr) > 0.4:
        flags.append({
            "severity": "warning",
            "title": "Irrigation column unreliable",
            "detail": f"Marked YES on {plant_irr * 100:.0f}% of plant crop but only {rat_irr * 100:.0f}% of ratoon - it is tracking crop type, not irrigation.",
        })

    disease_none = float(df.diseases.astype(str).str.upper().eq("NONE").mean())
    if disease_none > 0.95:
        flags.append({
            "severity": "warning",
            "title": f"Disease recorded as NONE on {disease_none * 100:.1f}% of records",
            "detail": "This is a surveyor's visual check, not a pathology test. Treat disease rates as under-reported.",
        })

    if total == 0:
        flags.append({"severity": "critical", "title": "No records found", "detail": "The survey contained no usable rows."})
    return flags


# Crop stage codes used in the compact plot rows.
STAGE_CODE = {"PLANT": 0, "AUTUMN": 1, "RATOON": 2, "RATOON II": 3}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    df = load_survey()

    ok = gps_valid_mask(df)
    dropped = int((~ok).sum())
    total_records = int(len(df))

    ct = df.groupby("crop_type").area_ha.sum()
    plant = float(ct.get("PLANT", 0.0))
    autumn = float(ct.get("AUTUMN", 0.0))
    ratoon = float(ct.get("RATOON", 0.0))
    ratoon2 = float(ct.get("RATOON II", 0.0))

    # Land type is recorded on plant, autumn and ratoon II, but on NO ratoon row -
    # a field does not become upland when it ratoons, the column is simply not
    # filled. Averaging those in drags lowland from ~39% down to ~24%.
    recorded = df[df.crop_type != "RATOON"]
    lt = recorded.groupby("land_type").area_ha.sum()
    upland = float(lt.get("UPLAND", 0.0))
    lowland = float(lt.get("LOWLAND", 0.0))
    land_recorded = float(recorded.area_ha.sum())
    land_unrecorded = float(df.area_ha.sum() - land_recorded)

    # A grower code repeats across villages, so identity is the composite key.
    growers = int(df.groupby(["society_code", "grower_village_code", "grower_code"]).ngroups)

    size_mb = os.path.getsize(SURVEY) / (1024 * 1024) if os.path.exists(SURVEY) else 0.0

    baseline = {
        "fileName": os.path.basename(SURVEY),
        "fileSizeMb": f"{size_mb:.1f} MB",
        "uploadedAt": datetime.datetime.now().strftime("%d %b %Y, %H:%M"),

        "surveyedAreaHa": round(float(df.area_ha.sum()), 1),
        "physicalFields": count_physical_plots(df, ok),
        "growers": growers,
        "villages": int(df.plot_village.nunique()),
        "societies": int(df.society.nunique()),
        "varietiesFound": int(df.variety.nunique()),

        "landTypeSplit": {
            "uplandHa": round(upland, 1),
            "lowlandHa": round(lowland, 1),
            "recordedHa": round(land_recorded, 1),
            "unrecordedHa": round(land_unrecorded, 1),
        },
        "cropTypeSplit": {
            "plantHa": round(plant, 1),
            "autumnHa": round(autumn, 1),
            "ratoonHa": round(ratoon, 1),
            "ratoonIIHa": round(ratoon2, 1),
        },

        # Plant and autumn crops become ratoon of the same variety next season,
        # so their area is locked. Only finishing ratoon is free to re-plant.
        "lockedHa": round(plant + autumn, 1),
        "freeToReplantHa": round(ratoon + ratoon2, 1),

        "dataQualityFlags": build_quality_flags(df, dropped),
        "cleanRecords": total_records - dropped,
        "totalRecords": total_records,
    }

    # Varieties ride along so Step 2 can be populated from the same file.
    vs = (
        df.groupby("variety")
        .agg(areaHa=("area_ha", "sum"), records=("variety", "size"))
        .reset_index()
        .sort_values("areaHa", ascending=False)
    )
    # CROPCATEGORY is the UP maturity class and is consistent per variety.
    maturity_by_variety = (
        df.groupby("variety").crop_category
        .agg(lambda x: x.mode().iat[0] if len(x.mode()) else "UNKNOWN")
        .to_dict()
    )
    land_by_variety = (
        df.assign(_low=df.land_type.eq("LOWLAND"))
        .groupby("variety")
        ._low.mean()
        .to_dict()
    )
    varieties = [
        {
            "name": str(r.variety),
            "areaHa": round(float(r.areaHa), 1),
            "records": int(r.records),
            "lowlandSharePct": round(float(land_by_variety.get(r.variety, 0.0)) * 100, 1),
            "maturity": str(maturity_by_variety.get(r.variety, "UNKNOWN")),
        }
        for r in vs.itertuples()
        if float(r.areaHa) > 0
    ]

    # The detail tables behind each metric card. They need `varieties`, which is
    # why this happens here rather than inside the `baseline` literal above.
    baseline.update(breakdowns(df, ok, varieties))

    # Plots finishing ratoon, for Step 6. Stored as index arrays against three
    # dictionaries rather than 62k objects - 1.9 MB instead of 9.3 MB, which is
    # the difference between a file the app can load and one it cannot.
    # Every plot, not only the ones finishing now. A plant crop today is not free
    # this season, but it comes free once its ratoons are done - which is what
    # Years 2 and 3 are planted on.
    allp = df[df.crop_type.isin(["PLANT", "AUTUMN", "RATOON", "RATOON II"])]
    ff = allp[gps_valid_mask(allp)]
    fkey = pd.MultiIndex.from_arrays(
        [np.round(ff[c].to_numpy(float), 6) for c in
         ["lat1", "lat2", "lat3", "lat4", "lon1", "lon2", "lon3", "lon4"]]
    )
    ff = ff.assign(_k=pd.factorize(fkey)[0])
    gp = ff.groupby("_k").agg(
        village=("plot_village", "first"), society=("society", "first"),
        grower=("grower_code", "first"), land=("land_type", "first"),
        area=("area_ha", "sum"), variety=("variety", "first"),
        crop=("crop_type", "first"),
    )
    # Land type measured per grower and per village, from rows that carry it.
    # The app infers each ratoon plot's land type from these.
    meas = df[df.crop_type != "RATOON"].copy()
    meas["_low"] = meas.land_type.eq("LOWLAND") * meas.area_ha
    g_share = (meas.groupby("grower_code")._low.sum() / meas.groupby("grower_code").area_ha.sum()).to_dict()
    v_share = (meas.groupby("plot_village")._low.sum() / meas.groupby("plot_village").area_ha.sum()).to_dict()

    vil = sorted({str(x) for x in gp.village})
    soc = sorted({str(x) for x in gp.society})
    var = sorted({str(x) for x in gp.variety})
    vi = {v: i for i, v in enumerate(vil)}
    si = {v: i for i, v in enumerate(soc)}
    vr = {v: i for i, v in enumerate(var)}
    free_plots = {
        "villages": vil, "societies": soc, "varieties": var,
        # village, society, grower, land (0 upland / 1 lowland), area, variety
        # village, society, grower, land (0 upland / 1 lowland / 2 not recorded),
        # area, variety, grower lowland share, village lowland share, crop stage
        "rows": [
            [
                vi[str(r.village)], si[str(r.society)], str(r.grower),
                2 if str(r.crop) == "RATOON" else (1 if str(r.land) == "LOWLAND" else 0),
                round(float(r.area), 3), vr[str(r.variety)],
                round(float(g_share.get(r.grower, -1)), 3) if r.grower in g_share else -1,
                round(float(v_share.get(r.village, -1)), 3) if r.village in v_share else -1,
                STAGE_CODE.get(str(r.crop), 0),
            ]
            for r in gp.itertuples()
        ],
    }

    payload = {
        "schemaVersion": 2,
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": os.path.basename(SURVEY),
        "baseline": baseline,
        "varieties": varieties,
        "freePlots": free_plots,
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)

    kb = os.path.getsize(OUT) / 1024
    print(f"wrote {OUT}  ({kb:.0f} KB)")
    print(f"  surveyed area   {baseline['surveyedAreaHa']:>12,.1f} ha")
    print(f"  physical fields {baseline['physicalFields']:>12,}")
    print(f"  growers         {baseline['growers']:>12,}")
    print(f"  villages        {baseline['villages']:>12,}   societies {baseline['societies']}")
    print(f"  varieties       {baseline['varietiesFound']:>12,}")
    print(f"  locked          {baseline['lockedHa']:>12,.1f} ha")
    print(f"  free to replant {baseline['freeToReplantHa']:>12,.1f} ha")
    print(f"  plots           {len(free_plots['rows']):>12,}")
    print(f"  quality flags   {len(baseline['dataQualityFlags'])}")
    for fl in baseline["dataQualityFlags"]:
        print(f"    [{fl['severity']}] {fl['title']}")


if __name__ == "__main__":
    main()
