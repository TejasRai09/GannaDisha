# -*- coding: utf-8 -*-
"""Build the worked scenario the app opens with.

    python build/make_preset.py     ->  plan_inputs/preset.json

Why this exists
---------------
Signing in and finding six empty screens tells a manager nothing. This fills
Steps 2, 3 and 4 so the app opens on a complete, working three-year plan and
the trajectory and the plot-level dispatch have something to compute from.

Measured against assumed
------------------------
Most of what Step 2 asks for is already in the survey, and is taken from it:

    maturity            CROPCATEGORY, as recorded
    landSuitability     inferred from where the variety is actually grown
    plantingSeason      inferred from its autumn share
    cropDuration        18-month where the variety is planted in autumn
    farmerAcceptance    from how many growers have taken it up
    currentAreaHa       measured
    seedAvailableQtl    computed from standing area (see SEED_PLOT_SHARE)
    stage, strategy     follow from the above under stated rules

Four fields are not in the survey and cannot be derived from it:

    juiceSucrosePct  avgCaneWeightGrams  caneYieldTha  redRot

Those are the cane R&D inputs the mill has yet to supply. They are written
here as class-level placeholders so the engine has something to run on, and
they are listed in `provisionalFields` so the app can say plainly on screen
that they are not mill figures. Do not quote a recovery number that comes out
of this file as the mill's own until those four are filled in for real.
"""

import datetime
import json
import os
import subprocess
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots_2627.parquet")
OUT_DIR = os.path.join(ROOT, "plan_inputs")
OUT = os.path.join(OUT_DIR, "preset.json")

# Share of a variety's standing area the mill would run as seed nursery. Two
# per cent is a working figure, not a mill policy - it is what makes seed a
# real constraint on expansion rather than a formality. The plant team head
# owns this number.
SEED_PLOT_SHARE = 0.02

# Placeholders by maturity class, pending the cane R&D inputs.
BY_CLASS = {
    "EARLY":    {"sucrose": 17.5, "yield": 72.0, "caneWeight": 900},
    "GENERAL":  {"sucrose": 16.8, "yield": 68.0, "caneWeight": 950},
    "REJECTED": {"sucrose": 15.5, "yield": 55.0, "caneWeight": 800},
}
PROVISIONAL = ["juiceSucrosePct", "avgCaneWeightGrams", "caneYieldTha", "redRot"]

# Red rot has driven UP varietal policy for several seasons and Co 0238 is the
# variety it was driven by. Naming it is the one agronomic call made here; it
# is why 0238 comes up REDUCE rather than HOLD, and the cane team should
# confirm or overturn it along with the rest.
RED_ROT_SUSCEPTIBLE = {"CO0238"}


def norm(name: str) -> str:
    return str(name).replace(" ", "").upper()


def slug(name: str) -> str:
    out, prev_dash = [], False
    for ch in str(name).lower():
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


def load() -> pd.DataFrame:
    if not os.path.exists(CACHE):
        print("cache missing - extracting from the workbook first ...")
        subprocess.run([sys.executable, os.path.join(HERE, "extract_2627.py")], check=True)
    return pd.read_parquet(CACHE)


def build_varieties(df: pd.DataFrame) -> list:
    total_ha = float(df.area_ha.sum())

    df = df.assign(
        _low=df.land_type.eq("LOWLAND"),
        _autumn=df.crop_type.eq("AUTUMN"),
        _grower=(
            df.society_code.astype(str) + "/" + df.grower_village_code.astype(str)
            + "/" + df.grower_code.astype(str)
        ),
    )

    g = (
        df.groupby("variety")
        .agg(
            areaHa=("area_ha", "sum"),
            records=("variety", "size"),
            growers=("_grower", "nunique"),
            lowShare=("_low", "mean"),
            autumnShare=("_autumn", "mean"),
            maturity=("crop_category", lambda x: x.mode().iat[0] if len(x.mode()) else "UNKNOWN"),
        )
        .reset_index()
        .sort_values("areaHa", ascending=False)
    )
    g = g[g.areaHa > 0]

    max_growers = float(g.growers.max()) or 1.0
    out = []

    for r in g.itertuples(index=False):
        name = str(r.variety)
        maturity = str(r.maturity)
        cls = BY_CLASS.get(maturity, BY_CLASS["GENERAL"])
        share_pct = float(r.areaHa) / total_ha * 100
        low_pct = float(r.lowShare) * 100

        # Where it is actually grown, rather than where a note says it belongs.
        if low_pct >= 55:
            land = "LOWLAND"
        elif low_pct <= 20:
            land = "UPLAND"
        else:
            land = "BOTH"

        # An autumn crop holds the field about 18 months, which is why this
        # matters beyond bookkeeping - it changes when the plot comes free.
        autumn_pct = float(r.autumnShare) * 100
        season = "BOTH" if autumn_pct >= 12 else "SPRING"
        duration = "18-MONTH" if autumn_pct >= 12 else "12-MONTH"

        # Adoption as a stand-in for acceptance: a variety many growers have
        # taken up is one they are willing to grow. Compressed, or the whole
        # tail below the top two or three scores 1.
        accept = 1 + 4 * (float(r.growers) / max_growers) ** 0.4
        accept = int(min(5, max(1, round(accept))))

        red_rot = "S" if (norm(name) in RED_ROT_SUSCEPTIBLE or maturity == "REJECTED") else "MR"

        # Seed comes off standing cane, so what a variety can plant next year
        # is set by what it occupies this year.
        seed_qtl = round(float(r.areaHa) * SEED_PLOT_SHARE * cls["yield"] * 10)

        # "OTH EARLY", "OTH GENERAL", "OTH REJECTED" are the survey's catch-all
        # buckets, not varieties. They can be held or retired, but nothing can
        # be expanded that has no name - there is no seed plot for a mixture.
        is_bucket = name.upper().startswith("OTH ")

        if maturity == "REJECTED":
            stage, strategy = "RETIRED", "EXIT"
            why = "Rejected class in the survey - not to be replanted."
        elif share_pct >= 1:
            stage = "COMMERCIAL"
            if red_rot == "S":
                strategy = "REDUCE"
                why = "Red rot susceptible - step down rather than hold."
            elif share_pct >= 30:
                # 30% is not the mill's 40% cap, it is the point at which a
                # plan should already be steering away from it.
                strategy = "REDUCE"
                why = (
                    f"{share_pct:.0f}% of the command area on one variety, against a "
                    f"40% cap - diversify before it reaches the ceiling."
                )
            elif is_bucket:
                strategy = "HOLD"
                why = "Survey catch-all, not a single variety - cannot be multiplied."
            elif maturity == "EARLY" and share_pct <= 15:
                strategy = "EXPAND"
                why = "Established early variety with room to grow - takes area off the leaders."
            else:
                strategy = "HOLD"
                why = "Commercial and stable at its current share."
        else:
            stage = "REVIEW"
            if red_rot == "S":
                strategy, why = "REDUCE", "Red rot susceptible."
            else:
                strategy = "HOLD"
                why = "Under 1% of area - too small to judge on area alone; hold and watch."

        out.append({
            "id": slug(name),
            "name": name,
            "currentAreaHa": round(float(r.areaHa), 1),

            # measured
            "measuredLowlandPct": round(low_pct, 1),
            "surveyRecords": int(r.records),
            "maturity": maturity,
            "landSuitability": land,
            "plantingSeason": season,
            "cropDuration": duration,
            "farmerAcceptance": accept,
            "seedAvailableQtl": seed_qtl,
            "animalDamageRisk": "LOW",

            # provisional - see PROVISIONAL
            "juiceSucrosePct": cls["sucrose"],
            "avgCaneWeightGrams": cls["caneWeight"],
            "caneYieldTha": cls["yield"],
            "redRot": red_rot,

            "stage": stage,
            "strategy": strategy,
            "notes": why,
        })

    return out


def build_strategies(varieties: list) -> dict:
    # More cane held back as seed where we intend to grow, less where we do not.
    preset = {
        "EXPAND": ("AGGRESSIVE", 70),
        "HOLD":   ("BALANCED", 50),
        "REDUCE": ("MATURE", 30),
        "EXIT":   ("MATURE", 0),
    }
    out = {}
    for v in varieties:
        p, pct = preset.get(v["strategy"], ("BALANCED", 50))
        out[v["id"]] = {
            "varietyId": v["id"],
            "strategy": v["strategy"],
            "retentionPreset": p,
            "retentionPct": pct,
        }
    return out


def build_parameters(df: pd.DataFrame) -> dict:
    """The mill's settings, moved onto what the survey measured where it can be.

    The three changed from the app's defaults are ratoonToPlantRatio,
    ratoonIICarryRatePct and commandAreaHa; each is replaced by the figure this
    season's survey actually shows. The rest are policy, and stay where the
    mill set them.
    """
    ha = df.groupby("crop_type").area_ha.sum()
    plant = float(ha.get("PLANT", 0)) + float(ha.get("AUTUMN", 0))
    ratoon = float(ha.get("RATOON", 0))
    ratoon2 = float(ha.get("RATOON II", 0))

    return {
        "seedRateQtlPerHa": 65,
        "defaultMultiplicationFactor": 8,
        "seedPurchaseCeilingHa": 35,
        "testPlotSizeHa": 5,
        "budType": "DOUBLE BUD",

        "ratoonsTaken": 2,
        # Measured: of the area in ratoon, this much goes on to a second.
        "ratoonIICarryRatePct": round(ratoon2 / ratoon * 100, 1) if ratoon else 3.6,
        # Measured 0.68 against the 0.90 the mill's proposal assumed - about
        # 4,000 ha of difference in what has to be replanted.
        "ratoonToPlantRatio": round(ratoon / plant, 2) if plant else 0.9,

        "maxVarietyConcentrationPct": 40,
        "villageLevelConcentrationCapPct": 60,
        "lowlandCoverageFloorPct": 28,
        "redRotEmergencyThresholdPct": 2,

        "juiceToRecoveryFactor": 0.635,
        "annualCaneCrushMT": 1350000,
        "sugarPriceRsPerKg": 38,

        "commandAreaHa": round(float(df.area_ha.sum())),
        "planningHorizonYears": 3,
        "baseYear": "2026-27",
    }


def main() -> None:
    df = load()
    varieties = build_varieties(df)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "provisional": True,
        "provisionalFields": PROVISIONAL,
        "seedPlotSharePct": SEED_PLOT_SHARE * 100,
        "note": (
            "Sucrose, cane weight, cane yield and red rot reaction are placeholders "
            "by maturity class, pending the cane R&D inputs. Everything else is "
            "measured from the 2026-27 survey or follows from it."
        ),
        "varieties": varieties,
        "parameters": build_parameters(df),
        "strategies": build_strategies(varieties),
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)

    counts = {}
    for v in varieties:
        counts[v["strategy"]] = counts.get(v["strategy"], 0) + 1
    area = {}
    for v in varieties:
        area[v["strategy"]] = area.get(v["strategy"], 0.0) + v["currentAreaHa"]

    print(f"wrote {OUT}  ({os.path.getsize(OUT) / 1024:.0f} KB)")
    print(f"  varieties      {len(varieties):>6}")
    for k in ("EXPAND", "HOLD", "REDUCE", "EXIT"):
        print(f"  {k:<14} {counts.get(k, 0):>6}   {area.get(k, 0.0):>10,.1f} ha")
    p = payload["parameters"]
    print(f"  ratoon:plant   {p['ratoonToPlantRatio']:>6}   ratoon II carry {p['ratoonIICarryRatePct']}%")
    print(f"  command area   {p['commandAreaHa']:>6,} ha")


if __name__ == "__main__":
    main()
