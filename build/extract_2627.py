"""Pass 1 for the 2026-27 survey: stream the workbook into a Parquet cache.

Column names follow the business names in the mill's data dictionary. Columns
present in the file but absent from the dictionary are kept with their raw ERP
names and flagged in the profile.
"""

import os
import time

import openpyxl
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
XLSX = os.environ.get("SURVEY_XLSX") or os.path.join(
    ROOT, "Plot Wise Survey Report 2026-2027.xlsx"
)
CACHE = os.path.join(HERE, "cache")

# Columns are found by HEADER NAME, not position.
#
# The 2026-27 export changed shape between August and September: a G_LOCK column
# appeared at position 12 and shifted everything after it one to the right, plus
# three columns were appended. Reading by position silently produced garbage -
# soil type where land type should be, and so on. Names are stable; order is not.
#
# Each entry lists the accepted header spellings, first match wins.
COL_NAMES = {
    "society_code": ["g_soc_Cd"], "society": ["so_name"],
    "centre_code": ["g_cnt_Cd"], "centre": ["c_name"],
    "grower_village_code": ["PL_VILL"], "grower_village": ["v_name"],
    "grower_code": ["PL_GROW"], "grower": ["g_name"], "grower_father": ["g_father"],
    "plot_village_code": ["PL_PLVILL"], "plot_village": ["PlotVillageName"],
    "dim1_m": ["PL_DIM_1"], "dim2_m": ["PL_DIM_2"],
    "dim3_m": ["PL_DIM_3"], "dim4_m": ["PL_DIM_4"],
    "area_ha": ["pl_area"], "total_area_raw": ["PL_T_AREA"],
    "variety_cat_code": ["vr_catg"], "crop_category": ["CROPCATEGORY"],
    "variety_code": ["PL_VAR"], "variety": ["vr_name"],
    "plant_ratoon_flag": ["pl_rpflag"], "crop_type": ["CROPTYPE"],
    "plot_percent": ["pL_PERCENT"], "surveyor_code": ["PL_SUPVCD"], "surveyor": ["cl_name"],
    "entry_date": ["PL_ENTDT"], "entry_time": ["PL_ENTTIME"],
    "irrigation_code": ["PL_IRRIG"], "demo_plot": ["DEMOPLOT"], "plot_serial": ["PL_SERIAL"],
    "detrashing_raw": ["PL_DETRESSING"], "soil_analysis": ["SOILANALEYSIS"],
    "cond_code": ["PL_COND"], "ratoon_mgmt": ["RATOONMANAGEMENT"], "tag_raw": ["PL_TAG"],
    "fertilizer_use": ["FERTILIZERUSE"], "crop_cond_code": ["PL_CRP_COND"],
    "crop_condition": ["CROPCONDITION"], "aw_raw": ["PL_AW"], "diseases": ["DISEASES"],
    "soil_code": ["PL_SOIL"], "soil_type": ["SOILTYPE"], "land_type": ["LANDTYPE"],
    "irrig_code2": ["pl_Irrigration"], "irrigation": ["IRRIGRATION"],
    "mixcrop_code": ["pl_Mixcrop"], "mixcrop": ["MIXCROP"],
    "intercrop_code": ["pl_Intercrop"], "intercrop": ["INTERCROP"],
    "plant_method_code": ["PL_PLN_METHOD"], "plant_method": ["PLANTMETHOD"],
    "lat1": ["PL_LAT_1"], "lon1": ["PL_LON_1"], "lat2": ["PL_LAT_2"], "lon2": ["PL_LON_2"],
    "lat3": ["PL_LAT_3"], "lon3": ["PL_LON_3"], "lat4": ["PL_LAT_4"], "lon4": ["PL_LON_4"],
    "plant_date": ["PL_PLANT_DT"], "gpl_no": ["PL_GPLNO"],
}

# Present only from the September 2026 export onward. Missing is fine.
OPTIONAL_COL_NAMES = {
    "upload_yn": ["UpLoad_YN"],
    "upload_error": ["Amity_ErrorDesc"],
}


def resolve_columns(header_row) -> dict:
    """Map our field names onto this workbook's actual column positions."""
    pos = {}
    for i, cell in enumerate(header_row):
        if cell is None:
            continue
        pos.setdefault(str(cell).strip().lower(), i)
    out, missing = {}, []
    for field, names in COL_NAMES.items():
        for nm in names:
            if nm.lower() in pos:
                out[field] = pos[nm.lower()]
                break
        else:
            missing.append(field)
    for field, names in OPTIONAL_COL_NAMES.items():
        for nm in names:
            if nm.lower() in pos:
                out[field] = pos[nm.lower()]
                break
    if missing:
        raise SystemExit(
            "These columns were not found in the workbook: "
            + ", ".join(missing)
            + " | headers present: "
            + ", ".join(sorted(pos))
        )
    return out


NUMERIC = ["dim1_m", "dim2_m", "dim3_m", "dim4_m", "area_ha", "plot_percent",
           "lat1", "lon1", "lat2", "lon2", "lat3", "lon3", "lat4", "lon4"]


def main():
    os.makedirs(CACHE, exist_ok=True)
    t0 = time.time()
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb.active

    header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    colmap = resolve_columns(header)
    names = list(colmap)
    idx = [colmap[f] for f in names]
    print(f"  resolved {len(names)} columns by header name")

    rows = []
    for n, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        rows.append([row[i] if i < len(row) else None for i in idx])
        if n and n % 50000 == 0:
            print(f"  {n:>7,} rows ({time.time()-t0:5.1f}s)", flush=True)
    wb.close()

    df = pd.DataFrame(rows, columns=names)
    for c in NUMERIC:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    # The ERP export mixes ints and strings inside the same text column (grower
    # names, codes), so normalise every non-numeric column to str for Parquet.
    keep = set(NUMERIC) | {"entry_date", "plant_date"}
    for c in df.columns:
        if c in keep:
            continue
        df[c] = df[c].map(
            lambda v: "" if v is None else (v.strip() if isinstance(v, str) else str(v))
        )
    for c in ("entry_date", "plant_date"):
        df[c] = pd.to_datetime(df[c], errors="coerce")

    out = os.path.join(CACHE, "plots_2627.parquet")
    df.to_parquet(out, index=False)
    print(f"read {len(df):,} rows in {time.time()-t0:.1f}s -> {out} "
          f"({os.path.getsize(out)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
