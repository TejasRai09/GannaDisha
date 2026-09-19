"""
Pass 1: stream the workbook once and cache the columns we need as Parquet.

The workbook is ~570 MB of uncompressed sheet XML, so we read it in read-only
streaming mode rather than letting pandas materialise every cell.
"""

import os
import time

import openpyxl
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
XLSX = os.path.join(ROOT, "staff data with plot mapping.xlsx")
CACHE = os.path.join(HERE, "cache")

# Source column index -> output name. The PL_LAT_12 / PL_LON_13 family is
# omitted on purpose: each of those equals its matching corner divided by 60.
COLS = {
    0: "society_code",
    1: "society",
    2: "gc_code",
    3: "gc_name",
    4: "grower_village_code",
    5: "grower_village",
    6: "grower_code",
    7: "grower",
    8: "grower_father",
    9: "plot_village_code",
    10: "plot_village",
    15: "area_ha",
    16: "crop_category",
    17: "variety",
    18: "crop_type",
    19: "plot_percent",
    21: "field_staff",
    22: "entry_date",
    24: "demo_plot",
    25: "plot_serial",
    28: "soil_analysis",
    29: "ratoon_mgmt",
    30: "fertilizer_use",
    31: "crop_condition",
    32: "diseases",
    33: "previous_crop",
    34: "soil_treatment",
    35: "soil_type",
    36: "land_type",
    37: "plant_method",
    38: "lat1",
    39: "lon1",
    40: "lat2",
    41: "lon2",
    42: "lat3",
    43: "lon3",
    44: "lat4",
    45: "lon4",
    54: "village_code",
    55: "village",
    56: "village_staff",
    57: "zonal_incharge",
    58: "zonal_manager",
    60: "region",
    61: "zone_head",
    63: "cane_head",
}


def main():
    os.makedirs(CACHE, exist_ok=True)
    idx = sorted(COLS)
    names = [COLS[i] for i in idx]

    t0 = time.time()
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb.active

    rows = []
    for n, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        rows.append([row[i] if i < len(row) else None for i in idx])
        if n and n % 25000 == 0:
            print(f"  {n:>7,} rows  ({time.time() - t0:5.1f}s)", flush=True)
    wb.close()

    df = pd.DataFrame(rows, columns=names)
    print(f"read {len(df):,} rows in {time.time() - t0:.1f}s")

    # Coordinates and area arrive as a mix of floats, ints and strings.
    for c in ["area_ha", "plot_percent"] + [f"{a}{i}" for i in (1, 2, 3, 4) for a in ("lat", "lon")]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].map(lambda v: v.strip() if isinstance(v, str) else v)

    df["entry_date"] = pd.to_datetime(df["entry_date"], errors="coerce")

    out = os.path.join(CACHE, "plots.parquet")
    df.to_parquet(out, index=False)
    print(f"wrote {out}  ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
