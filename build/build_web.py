"""
Pass 2: turn the cached rows into the binary payload the map loads.

One workbook row is a *grower's share* of a plot, not a plot: 207k rows collapse
onto 146k distinct quadrilaterals, some shared by up to 14 growers. We key on the
rounded geometry so each polygon is drawn once and carries its growers with it.

Outputs (web/data/):
  geom.bin     Float64  n * 8   lon/lat of the 4 corners
  attrs.bin    Int32    n * 13  dictionary indices + grower slice
  measures.bin Float32  n * 2   geometric hectares, summed stated hectares
  growers.bin  Int32/F32        one record per original row
  meta.json    string dictionaries, village index, bounds
"""

import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots.parquet")
OUT = os.path.join(ROOT, "web", "data")

R = 6371000.0


def encode(series):
    """Dictionary-encode a string column -> (list_of_values, int32 codes)."""
    s = series.fillna("").astype(str).str.strip()
    cat = pd.Categorical(s)
    return list(cat.categories), cat.codes.astype(np.int32)


def main():
    os.makedirs(OUT, exist_ok=True)
    df = pd.read_parquet(CACHE)

    lat = df[["lat1", "lat2", "lat3", "lat4"]].to_numpy(float)
    lon = df[["lon1", "lon2", "lon3", "lon4"]].to_numpy(float)

    # A corner of 0 means "never captured"; anything outside the district is a
    # typo we cannot repair, so both are dropped rather than drawn in the sea.
    ok = ~((lat == 0).any(1) | (lon == 0).any(1))
    ok &= ((lat > 27) & (lat < 29) & (lon > 80) & (lon < 82)).all(1)
    dropped = int((~ok).sum())
    df, lat, lon = df[ok].reset_index(drop=True), lat[ok], lon[ok]

    # Geometric area via shoelace on a local equirectangular projection.
    lat0 = np.deg2rad(lat.mean(1, keepdims=True))
    x = np.deg2rad(lon) * R * np.cos(lat0)
    y = np.deg2rad(lat) * R
    shoelace = 0.5 * np.abs(
        sum(x[:, i] * y[:, (i + 1) % 4] - x[:, (i + 1) % 4] * y[:, i] for i in range(4))
    )
    df["calc_ha"] = shoelace / 10000.0

    # Group rows onto their physical polygon.
    key = pd.MultiIndex.from_arrays(
        [np.round(lat, 6)[:, i] for i in range(4)] + [np.round(lon, 6)[:, i] for i in range(4)]
    )
    df["plot_id"] = pd.factorize(key)[0]

    # Order rows so each plot's growers sit in one contiguous slice.
    order = np.argsort(df["plot_id"].to_numpy(), kind="stable")
    df, lat, lon = df.iloc[order].reset_index(drop=True), lat[order], lon[order]
    pid = df["plot_id"].to_numpy()
    first = np.r_[True, pid[1:] != pid[:-1]]
    starts = np.flatnonzero(first)
    counts = np.diff(np.r_[starts, len(df)])
    n = len(starts)

    # Per-plot representative row = the largest shareholder.
    rep = df.iloc[starts]

    # --- dictionaries -----------------------------------------------------
    dicts, codes = {}, {}
    plot_fields = [
        ("village", "plot_village"),
        ("society", "society"),
        ("gate", "gc_name"),
        ("variety", "variety"),
        ("crop_category", "crop_category"),
        ("crop_type", "crop_type"),
        ("field_staff", "field_staff"),
        ("village_staff", "village_staff"),
        ("zonal_incharge", "zonal_incharge"),
        ("zonal_manager", "zonal_manager"),
        ("zone_head", "zone_head"),
        ("region", "region"),
        ("soil_type", "soil_type"),
        ("land_type", "land_type"),
        ("plant_method", "plant_method"),
        ("crop_condition", "crop_condition"),
    ]
    for name, col in plot_fields:
        dicts[name], codes[name] = encode(rep[col])

    # Plot-level variety/crop_type: the variety covering the most area.
    attr_order = [
        "village", "society", "gate", "variety", "crop_category", "crop_type",
        "field_staff", "village_staff", "zonal_incharge", "zonal_manager",
        "zone_head", "region", "soil_type", "land_type", "plant_method",
        "crop_condition",
    ]
    attrs = np.zeros((n, len(attr_order) + 2), np.int32)
    for i, name in enumerate(attr_order):
        attrs[:, i] = codes[name]
    attrs[:, -2] = starts
    attrs[:, -1] = counts

    measures = np.zeros((n, 2), np.float32)
    measures[:, 0] = rep["calc_ha"].to_numpy()
    measures[:, 1] = df.groupby("plot_id", sort=True)["area_ha"].sum().to_numpy()

    geom = np.zeros((n, 8), np.float64)
    for i in range(4):
        geom[:, i * 2] = lon[starts, i]
        geom[:, i * 2 + 1] = lat[starts, i]

    # --- grower records (one per original row) ----------------------------
    gdicts, gcodes = {}, {}
    for name, col in [("grower", "grower"), ("father", "grower_father"),
                      ("variety", "variety"), ("crop_type", "crop_type"),
                      ("field_staff", "field_staff")]:
        gdicts[name], gcodes[name] = encode(df[col])

    gi = np.zeros((len(df), 6), np.int32)
    gi[:, 0] = gcodes["grower"]
    gi[:, 1] = gcodes["father"]
    gi[:, 2] = gcodes["variety"]
    gi[:, 3] = gcodes["crop_type"]
    gi[:, 4] = gcodes["field_staff"]
    gi[:, 5] = pd.to_numeric(df["grower_code"], errors="coerce").fillna(-1).to_numpy(np.int32)

    gf = np.zeros((len(df), 3), np.float32)
    gf[:, 0] = pd.to_numeric(df["area_ha"], errors="coerce").fillna(0)
    gf[:, 1] = pd.to_numeric(df["plot_percent"], errors="coerce").fillna(0)
    days = (df["entry_date"] - pd.Timestamp("2020-01-01")).dt.days
    gf[:, 2] = days.fillna(-1).to_numpy()

    # --- village index for search / fly-to --------------------------------
    cx, cy = geom[:, 0::2].mean(1), geom[:, 1::2].mean(1)
    vil = pd.DataFrame({"v": codes["village"], "x": cx, "y": cy, "ha": measures[:, 0]})
    agg = vil.groupby("v").agg(x=("x", "mean"), y=("y", "mean"), ha=("ha", "sum"), n=("x", "size"))
    villages = [
        {"name": dicts["village"][int(v)], "x": round(r.x, 5), "y": round(r.y, 5),
         "n": int(r.n), "ha": round(r.ha, 1)}
        for v, r in agg.iterrows()
    ]
    villages.sort(key=lambda d: d["name"])

    meta = {
        "n": n,
        "rows": len(df),
        "dropped": dropped,
        "attr_order": attr_order + ["grower_start", "grower_count"],
        "dicts": dicts,
        "grower_dicts": gdicts,
        "villages": villages,
        "bounds": [float(cx.min()), float(cy.min()), float(cx.max()), float(cy.max())],
        "epoch": "2020-01-01",
    }

    geom.tofile(os.path.join(OUT, "geom.bin"))
    attrs.tofile(os.path.join(OUT, "attrs.bin"))
    measures.tofile(os.path.join(OUT, "measures.bin"))
    gi.tofile(os.path.join(OUT, "growers_i.bin"))
    gf.tofile(os.path.join(OUT, "growers_f.bin"))
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"), ensure_ascii=False)

    print(f"plots: {n:,}   grower rows: {len(df):,}   dropped: {dropped:,}")
    print(f"villages: {len(villages)}   varieties: {len(dicts['variety'])}")
    for fn in ["geom.bin", "attrs.bin", "measures.bin", "growers_i.bin", "growers_f.bin", "meta.json"]:
        print(f"  {fn:16s} {os.path.getsize(os.path.join(OUT, fn)) / 1e6:7.2f} MB")


if __name__ == "__main__":
    main()
