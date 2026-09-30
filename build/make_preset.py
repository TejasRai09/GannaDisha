# -*- coding: utf-8 -*-
"""Build the worked scenario the app opens with.

    python build/make_preset.py     ->  plan_inputs/preset.json

Two sources, and the rule between them is simple: the survey says what is in
the ground, the cane team says what each variety is like.

    from the survey        area, share, maturity, measured lowland %, records
    from the filled sheet  strategy, stage, land suitability, planting season,
                           cane yield, cane weight, red rot, animal damage,
                           farmer acceptance, seed available

VARIETY_SHEET is the template the cane team returns (Fawzia, 29 Sep 2026).
Where a row is present there, its judged values win outright - nothing is
inferred over the top of a figure somebody actually supplied. Where the sheet
has no row, or leaves a cell blank, the fallbacks below fill in so the engine
still has something to run on.

Juice sucrose is the one field the sheet does not yet carry. It stays a
class-level placeholder and stays named in `provisionalFields`, so Steps 2 and
5 keep saying on screen that the recovery figure is an illustration. Remove it
from that list the day the PoL values arrive - and not before.
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

# The cane team's returned template. Its judged columns override everything
# inferred here.
VARIETY_SHEET = os.path.join(ROOT, "Variety_Input_TEMPLATE_2026-09-29.xlsx")

# Only used where the sheet is silent.
SEED_PLOT_SHARE = 0.02
BY_CLASS = {
    "EARLY":    {"sucrose": 17.5, "yield": 72.0, "caneWeight": 900},
    "GENERAL":  {"sucrose": 16.8, "yield": 68.0, "caneWeight": 950},
    "REJECTED": {"sucrose": 15.5, "yield": 55.0, "caneWeight": 800},
}

# Sucrose alone. Cane yield, cane weight and red rot came back filled on
# 29 Sep 2026, so they are no longer provisional and the on-screen notice no
# longer names them.
PROVISIONAL = ["juiceSucrosePct"]

# Year-on-year rates, per Fawzia's request that expansion and reduction stop
# being constants buried in the engine. These are the defaults the sheet does
# not yet carry a column for; Step 4 exposes them per variety.
DEFAULT_EXPAND_YOY = 25.0
DEFAULT_REDUCE_YOY = 25.0

# Model B: a grower asked to take a variety he does not already run gives it
# one plot, not a share of his holding - the median grower at Gobind farms
# 0.43 ha across two plots, so a percentage of land cannot be expressed. What
# limits a variety's spread is how many growers start, which is what this is.
# Driven off farmer acceptance (1-5) because the cane team has already scored
# every variety on it.
UPTAKE_BY_ACCEPTANCE = {1: 2.0, 2: 4.0, 3: 7.0, 4: 11.0, 5: 16.0}


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


def read_sheet() -> dict:
    """The cane team's filled template, keyed by normalised variety name.

    Returns {} if the sheet is not there, so the generator still runs on a
    machine that has only the survey.
    """
    if not os.path.exists(VARIETY_SHEET):
        print(f"  (no variety sheet at {os.path.basename(VARIETY_SHEET)} - inferring instead)")
        return {}

    import openpyxl
    wb = openpyxl.load_workbook(VARIETY_SHEET, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    # The header is not on row 1 - the sheet carries a title block above it.
    hdr = next(i for i, r in enumerate(rows)
               if r and any(str(c).strip() == "Variety" for c in r if c))
    cols = {str(c).strip(): i for i, c in enumerate(rows[hdr]) if c}
    wb.close()

    def cell(row, name):
        i = cols.get(name)
        if i is None or i >= len(row):
            return None
        v = row[i]
        return None if v is None or str(v).strip() == "" else v

    def num(row, name):
        v = cell(row, name)
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    out = {}
    for row in rows[hdr + 1:]:
        if not row or not cell(row, "Variety"):
            continue
        out[norm(cell(row, "Variety"))] = {
            "strategy":          cell(row, "Strategy"),
            "stage":             cell(row, "Stage"),
            "landSuitability":   cell(row, "Land Suitability"),
            "plantingSeason":    cell(row, "Planting Season"),
            "caneYieldTha":      num(row, "Cane Yield (t/ha)"),
            "avgCaneWeightGrams": num(row, "Avg Cane Weight (g)"),
            "redRot":            cell(row, "Red Rot Resistance"),
            "animalDamageRisk":  cell(row, "Animal Damage Risk"),
            "farmerAcceptance":  num(row, "Farmer Acceptance (1-5)"),
            "seedAvailableQtl":  num(row, "Seed Available (qtl)"),
            "juiceSucrosePct":   num(row, "Juice Sucrose %"),
            "notes":             cell(row, "Notes"),
        }
    print(f"  variety sheet: {len(out)} rows read from {os.path.basename(VARIETY_SHEET)}")
    return out


def build_varieties(df: pd.DataFrame, judged: dict) -> list:
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


        # Adoption as a stand-in for acceptance: a variety many growers have
        # taken up is one they are willing to grow. Compressed, or the whole
        # tail below the top two or three scores 1.
        accept = 1 + 4 * (float(r.growers) / max_growers) ** 0.4
        accept = int(min(5, max(1, round(accept))))

        # Fallback only - the sheet's answer wins below. Crop duration used to
        # be derived here too; Fawzia confirmed 12 months for every variety at
        # Gobind, so the field is gone rather than guessed.
        autumn_pct = float(r.autumnShare) * 100
        season = "BOTH" if autumn_pct >= 12 else "SPRING"

        sheet = judged.get(norm(name), {})

        def pick(field, fallback):
            """The sheet wins wherever it has an answer."""
            v = sheet.get(field)
            return fallback if v in (None, "", "None") else v

        # Judged by the cane team; inferred only where they left a blank.
        land = pick("landSuitability", land)
        season = pick("plantingSeason", season)
        red_rot = pick("redRot", "MR" if maturity != "REJECTED" else "S")
        animal = pick("animalDamageRisk", "LOW")
        accept = int(pick("farmerAcceptance", accept))
        yield_tha = float(pick("caneYieldTha", cls["yield"]))
        cane_wt = int(float(pick("avgCaneWeightGrams", cls["caneWeight"])))
        sucrose = float(pick("juiceSucrosePct", cls["sucrose"]))

        # Seed the mill can actually lay hands on. Falls back to a share of
        # standing cane only where the sheet is silent.
        seed_qtl = pick("seedAvailableQtl", None)
        seed_qtl = (round(float(r.areaHa) * SEED_PLOT_SHARE * yield_tha * 10)
                    if seed_qtl is None else int(float(seed_qtl)))

        # "OTH EARLY", "OTH GENERAL", "OTH REJECTED" are the survey's catch-all
        # buckets, not varieties. Nothing without a name can be multiplied -
        # there is no seed plot for a mixture.
        is_bucket = name.upper().startswith("OTH ")

        if sheet.get("strategy"):
            strategy = str(sheet["strategy"]).strip().upper()
            stage = str(pick("stage", "REVIEW")).strip().upper()
            why = "Set by the cane team, 29 Sep 2026."
            if is_bucket and strategy == "EXPAND":
                # A survey bucket cannot be expanded whatever the sheet says.
                strategy = "HOLD"
                why = "Survey catch-all, not a single variety - cannot be multiplied."
        elif maturity == "REJECTED":
            stage, strategy = "RETIRED", "EXIT"
            why = "Rejected class in the survey - not to be replanted."
        elif share_pct >= 1:
            stage = "COMMERCIAL"
            strategy = "HOLD"
            why = "Commercial and stable at its current share."
        else:
            stage, strategy = "REVIEW", "HOLD"
            why = "Under 1% of area - hold and watch."

        out.append({
            "id": slug(name),
            "name": name,

            # measured from the survey
            "currentAreaHa": round(float(r.areaHa), 1),
            "measuredLowlandPct": round(low_pct, 1),
            "surveyRecords": int(r.records),
            "growers": int(r.growers),
            "maturity": maturity,

            # judged by the cane team
            "landSuitability": land,
            "plantingSeason": season,
            "caneYieldTha": yield_tha,
            "avgCaneWeightGrams": cane_wt,
            "redRot": red_rot,
            "animalDamageRisk": animal,
            "farmerAcceptance": accept,
            "seedAvailableQtl": seed_qtl,

            # still provisional
            "juiceSucrosePct": sucrose,

            "stage": stage,
            "strategy": strategy,
            "notes": str(pick("notes", why)),
        })

    return out


def build_strategies(varieties: list) -> dict:
    """Step 4's settings, including the two rates Fawzia asked to expose.

    `yoyChangePct` is how fast a variety moves each year when it is expanding
    or reducing. Until now that rate lived as a constant inside the engine and
    appeared on no screen, which meant the plan's pace was nobody's decision.

    `growerUptakePct` is the share of growers who take a variety they do not
    already run, in its first year. It is the ceiling on new area, and it is
    the number that actually governs spread: at Gobind the median grower farms
    0.43 ha across two plots, so a trial is one plot rather than a slice of a
    holding, and a single trial plot yields enough seed to plant several times
    that grower's whole land the following year. What limits a variety is
    therefore how many growers start, not how much each gives it.
    """
    # More cane held back as seed where we intend to grow, less where we do not.
    preset = {
        "EXPAND": ("AGGRESSIVE", 70),
        "HOLD":   ("BALANCED", 50),
        "REDUCE": ("MATURE", 30),
        "EXIT":   ("MATURE", 0),
    }
    out = {}
    for v in varieties:
        strat = v["strategy"]
        p, pct = preset.get(strat, ("BALANCED", 50))

        if strat == "EXPAND" or strat == "INTRODUCE-NEW":
            yoy = DEFAULT_EXPAND_YOY
        elif strat == "REDUCE":
            yoy = DEFAULT_REDUCE_YOY
        else:
            yoy = 0.0

        out[v["id"]] = {
            "varietyId": v["id"],
            "strategy": strat,
            "retentionPreset": p,
            "retentionPct": pct,
            "yoyChangePct": yoy,
            "growerUptakePct": UPTAKE_BY_ACCEPTANCE.get(
                int(v.get("farmerAcceptance") or 3), 7.0
            ),
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
    judged = read_sheet()
    varieties = build_varieties(df, judged)
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
