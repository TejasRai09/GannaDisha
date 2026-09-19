# -*- coding: utf-8 -*-
"""Plot-wise planting allocation for 2027-28.

Turns the plan's variety targets into an actual instruction per plot and per
village: what to plant, where, and under what condition.

The logic in four steps:

1. WHAT IS LOCKED. A plot currently carrying a plant or autumn crop becomes a
   ratoon of the same variety next season - its variety cannot be changed. A
   plot currently in ratoon reaches the end of its cycle (except a small share
   kept for a second ratoon) and is free to re-plant. So only part of the area
   is allocatable at all.

2. WHAT EACH VARIETY STILL NEEDS. required new planting = target area minus the
   area that carries over on its own. Negative means the variety is already
   above target and gets no new plots.

3. WHO IS ELIGIBLE FOR WHAT. Every free plot is matched against the land rules.
   LOWLAND is recorded reliably, so those plots get one answer. UPLAND in the
   ERP means "upland or midland", so a plot there gets an unconditional answer
   where both readings agree, and an IF/ELSE answer where they do not.

4. ASSIGNMENT. Villages are processed in turn; within a village, free plots go
   to whichever eligible variety has the largest remaining need, so a village
   ends up with a few varieties in meaningful blocks rather than a scatter.
   Plots currently on an exit variety (Co 0238, unclassified 'Others') are
   allocated first, since those are the ones the plan most wants replaced.

Outputs (plan_outputs/):
  Plot_Allocation_2027-28.xlsx   village plans, priority actions, method
  allocation_plots_<scenario>.csv  every allocated plot, for filtering in Excel
"""

import math
import os
import sys

import numpy as np
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots_2627.parquet")
INP = os.path.join(ROOT, "plan_inputs")
SEEDF = os.path.join(ROOT, "Seed Availbility.xlsx")
OUTD = os.path.join(ROOT, "plan_outputs")
OUTF = os.path.join(OUTD, "Plot_Allocation_2027-28.xlsx")

RATOON2_CARRY = 0.036       # measured from the survey itself
SEED_QTL_PER_HA = 65.0

HDR_FILL = PatternFill("solid", fgColor="1F4E5F")
HDR_FONT = Font(color="FFFFFF", bold=True, size=11)
TITLE_FONT = Font(bold=True, size=14, color="1F4E5F")
COND_FILL = PatternFill("solid", fgColor="FFEB9C")
OK_FILL = PatternFill("solid", fgColor="C6EFCE")
ACT_FILL = PatternFill("solid", fgColor="FFC7CE")
_s = Side(style="thin", color="D9D9D9")
THIN = Border(left=_s, right=_s, top=_s, bottom=_s)

# variety -> (upland verdict, midland verdict, lowland verdict, note)
LAND_RULES = {
    "CO0118":    ("OK",      "OK",      "CAUTION", "Backbone upland/midland variety"),
    "COLK94184": ("AVOID",   "CAUTION", "OK",      "Primary lowland variety"),
    "CO98014":   ("CAUTION", "OK",      "OK",      "Semi-lowland / drought tolerant"),
    "CO0238":    ("AVOID",   "AVOID",   "AVOID",   "EXIT - red rot"),
    "COLK14201": ("OK",      "CAUTION", "AVOID",   "Autumn 18-month; midland only if it drains in 1-2 days"),
    "COS13231":  ("AVOID",   "CAUTION", "OK",      "Second lowland variety"),
    "COS13235":  ("OK",      "OK",      "AVOID",   "Upland/midland diversifier"),
    "CO15023":   ("OK",      "OK",      "AVOID",   "Highest sucrose"),
    "COLK16202": ("CAUTION", "OK",      "CAUTION", "Midland; seed multiplication"),
    "COS17231":  ("OK",      "OK",      "AVOID",   "Red-rot resistant successor to Co 0238"),
    "COS18231":  ("OK",      "OK",      "AVOID",   "Under evaluation"),
    "COS19231":  ("OK",      "OK",      "CAUTION", "Seed multiplication"),
}
EXIT_VARIETIES = {"CO0238"}
AUTUMN_ONLY = {"COLK14201"}


def norm(v):
    return str(v).replace(" ", "").upper() if v is not None else ""


def sheet(wb, name, headers, widths=None):
    ws = wb.create_sheet(name)
    for j, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=j, value=h)
        c.fill, c.font, c.border = HDR_FILL, HDR_FONT, THIN
        c.alignment = Alignment(wrap_text=True, vertical="center")
    if widths:
        for j, w in enumerate(widths, 1):
            ws.column_dimensions[ws.cell(row=1, column=j).column_letter].width = w
    ws.freeze_panes = "A2"
    return ws


def put(ws, r, values, fill=None, fill_col=None):
    for j, v in enumerate(values, 1):
        if isinstance(v, float):
            v = round(v, 2)
        c = ws.cell(row=r, column=j, value=v)
        c.border = THIN
    if fill:
        ws.cell(row=r, column=fill_col or len(values)).fill = fill


def load_targets(scenario):
    """Year-1 (2027-28) target area per variety for the chosen scenario."""
    if scenario == "DOC":
        d = pd.read_excel(os.path.join(INP, "D_Plan_Targets.xlsx"), sheet_name="Targets")
        out = {}
        for r in d.itertuples():
            v = str(r[1]).strip()
            if v.upper() in ("TOTAL", "NAN", "OTHERS") or not v:
                continue
            out[norm(v)] = float(r[4])
        return out, "Guiding Document Year-1 targets"
    raw = pd.read_excel(SEEDF, sheet_name=0, header=None)
    out = {}
    for _, r in raw.iterrows():
        name = r[1]
        if not isinstance(name, str) or not name.strip() or "Total" in name or name.strip().startswith("OTH"):
            continue
        try:
            val = float(r[12])
        except (TypeError, ValueError):
            continue
        if not math.isfinite(val) or val <= 0:
            continue
        out[norm(name)] = val
    return out, "Mill Seed Availability proposal 2027-28"


def build_plots(df):
    """Collapse grower rows onto physical plots and mark what is re-plantable."""
    lat = df[["lat1", "lat2", "lat3", "lat4"]].to_numpy(float)
    lon = df[["lon1", "lon2", "lon3", "lon4"]].to_numpy(float)
    ok = ~((lat == 0).any(1) | (lon == 0).any(1) | np.isnan(lat).any(1) | np.isnan(lon).any(1))
    d = df[ok].copy()
    key = pd.MultiIndex.from_arrays(
        [np.round(lat[ok], 6)[:, i] for i in range(4)] + [np.round(lon[ok], 6)[:, i] for i in range(4)])
    d["pid"] = pd.factorize(key)[0]

    g = d.groupby("pid").agg(
        society=("society", "first"), village=("plot_village", "first"),
        variety=("vnorm", "first"), crop_type=("crop_type", "first"),
        land_type=("land_type", "first"), area=("area_ha", "sum"),
        growers=("grower", lambda s: "; ".join(sorted(set(str(x) for x in s if str(x).strip()))[:4])),
        n_growers=("grower", "nunique"),
    ).reset_index()
    g["free"] = g.crop_type.isin(["RATOON", "RATOON II"])
    return g


def allocate(plots, targets):
    """Assign a recommended variety to every re-plantable plot."""
    # --- step 1/2: what carries over on its own, and what each variety needs
    locked = plots[~plots.free]
    carry_over = locked.groupby("variety").area.sum().to_dict()
    ratoon_carry = (plots[plots.crop_type == "RATOON"]
                    .groupby("variety").area.sum() * RATOON2_CARRY).to_dict()
    need = {}
    for v, tgt in targets.items():
        persists = carry_over.get(v, 0.0) + ratoon_carry.get(v, 0.0)
        need[v] = max(0.0, tgt - persists)
    need_original = dict(need)   # the loop below consumes `need` as it assigns

    # --- step 3: eligibility per land reading
    def eligible(land):
        out = []
        for v in need:
            rule = LAND_RULES.get(v)
            if rule is None:
                continue
            u, m, l, _ = rule
            verdict = {"UPLAND": u, "MIDLAND": m, "LOWLAND": l}[land]
            if verdict != "AVOID":
                out.append((v, verdict))
        return out

    # --- step 4: assign, exit-variety plots first, village by village
    free = plots[plots.free].copy()
    free["priority"] = np.where(free.variety.isin(EXIT_VARIETIES), 0,
                        np.where(~free.variety.isin(targets), 1, 2))
    free = free.sort_values(["village", "priority", "area"], ascending=[True, True, False])

    # For every free plot we produce TWO answers, because the ERP's "UPLAND"
    # covers both true upland and midland:
    #     rec_up  = what to plant if the field is genuinely upland
    #     rec_mid = what to plant if the field is actually midland
    # Where the two agree, no one has to visit the field. Where they differ,
    # the supervisor decides on the spot using the drainage test.
    # Requirement is consumed once per plot, on the primary (upland) answer,
    # so the fulfilment totals stay honest.
    rec_up, rec_mid, same, why = [], [], [], []
    for row in free.itertuples():
        if row.land_type == "LOWLAND":
            cands = eligible("LOWLAND")
            pick = pick_best(cands, need) or fallback(cands)
            rec_up.append(pick); rec_mid.append(pick); same.append("LAND TYPE KNOWN")
            why.append("Lowland is recorded reliably - one answer, no field check")
        else:
            u = pick_best(eligible("UPLAND"), need) or fallback(eligible("UPLAND"))
            m = pick_best(eligible("MIDLAND"), need) or fallback(eligible("MIDLAND"))
            rec_up.append(u); rec_mid.append(m)
            if u == m:
                same.append("YES - same either way")
                why.append("Same variety suits upland and midland - no field check needed")
            else:
                same.append("NO - CHECK DRAINAGE")
                why.append("Answer depends on drainage: water gone same day = upland, "
                           "standing 1-2 days = midland")
            pick = u
        if pick:
            need[pick] = max(0.0, need.get(pick, 0.0) - row.area)

    free["rec_upland"] = rec_up
    free["rec_midland"] = rec_mid
    free["same"] = same
    free["reason"] = why
    free["needs_check"] = free["same"] == "NO - CHECK DRAINAGE"
    free["recommend"] = free["rec_upland"]        # primary, used for totals
    return free, need, carry_over, need_original


def fallback(cands):
    """When every target is already met, still give a sensible variety."""
    for v, verdict in cands:
        if verdict == "OK" and v not in EXIT_VARIETIES:
            return v
    for v, verdict in cands:
        if v not in EXIT_VARIETIES:
            return v
    return None


def pick_best(cands, need, exclude=None):
    """Whichever eligible variety has the largest unmet requirement."""
    best, best_need = None, 0.0
    for v, verdict in cands:
        if v == exclude:
            continue
        n = need.get(v, 0.0)
        # a variety that is merely tolerated loses to one that is recommended
        score = n * (1.0 if verdict == "OK" else 0.5)
        if score > best_need:
            best, best_need = v, score
    return best


def main():
    scenario = (sys.argv[1].upper() if len(sys.argv) > 1 else "MILL")
    if scenario not in ("DOC", "MILL"):
        raise SystemExit("usage: python build/allocate.py [DOC|MILL]")
    os.makedirs(OUTD, exist_ok=True)

    df = pd.read_parquet(CACHE)
    df["vnorm"] = df.variety.map(norm)
    name_of = dict(zip(df.vnorm, df.variety))
    plots = build_plots(df)
    targets, scen_label = load_targets(scenario)

    free, need, carry_over, need0 = allocate(plots, targets)
    disp = lambda v: name_of.get(v, v) if v else "(no target needs this land type)"

    # consume the need as area is assigned, for the fulfilment report
    assigned = free.groupby("recommend").area.sum().to_dict()

    wb = Workbook(); wb.remove(wb.active)

    # ---------------- How to use ----------------
    ws = wb.create_sheet("How_to_use")
    ws.cell(row=1, column=1, value="PLOT-WISE PLANTING PLAN 2027-28").font = TITLE_FONT
    lines = [
        "Scenario used: " + scen_label,
        "",
        "WHAT THIS IS",
        "For every field that becomes free to re-plant in 2027-28, this gives the variety to plant.",
        "",
        "WHY NOT EVERY FIELD APPEARS",
        "A field carrying a plant or autumn crop this year becomes a ratoon of the SAME variety next",
        "year. Its variety cannot be changed. Only fields finishing their ratoon cycle are listed.",
        "",
        "THE THREE COLUMNS THAT MATTER",
        "  Recommend    - the variety to plant",
        "  Condition    - if filled, plant the recommended variety ONLY if this condition holds",
        "  Alternative  - what to plant instead when the condition does not hold",
        "",
        "WHY SOME ROWS HAVE A CONDITION",
        "Our ERP records land as UPLAND or LOWLAND only. 'UPLAND' covers both true upland and",
        "midland, and a few varieties behave differently on the two. Where the recommendation is the",
        "same either way, there is no condition. Where it differs, the field must be checked for",
        "drainage first - the condition column tells the supervisor exactly what to look for.",
        "",
        "SHEETS",
        "  Village_Plan      - hectares of each variety to plant, village by village (give to field staff)",
        "  Priority_Actions  - fields on exit varieties and CoLK 14201 wrongly on lowland",
        "  Fulfilment        - how much of each variety target this allocation achieves",
        "  Seed_By_Variety   - seed quantity implied, at 65 qtl/ha",
        "  Method            - the rules and assumptions used",
        "",
        "A full plot-by-plot list is written alongside as a CSV (one row per field).",
        "",
        "This is a recommendation for the cane department, not a commitment - grower consent,",
        "seed logistics and local knowledge still apply.",
    ]
    for i, ln in enumerate(lines, 3):
        ws.cell(row=i, column=1, value=ln)
    ws.column_dimensions["A"].width = 100

    # ---------------- Village_Plan (both branches) ----------------
    agree = free[~free.needs_check]
    diff = free[free.needs_check]

    vp = (agree.groupby(["society", "village", "rec_upland"])
          .agg(ha=("area", "sum"), plots=("pid", "count")).reset_index()
          .sort_values(["society", "village", "ha"], ascending=[True, True, False]))
    ws = sheet(wb, "Village_Plan_Simple",
               ["Society", "Village", "Variety to plant", "Area (ha)", "No. of fields",
                "Plant as autumn?"],
               [20, 26, 17, 12, 13, 18])
    ws.cell(row=1, column=1).comment = None
    for i, r in enumerate(vp.itertuples(), 2):
        if not r.rec_upland:
            continue
        put(ws, i, [r.society, r.village, disp(r.rec_upland), float(r.ha), int(r.plots),
                    "YES - autumn (Oct-Nov)" if r.rec_upland in AUTUMN_ONLY else ""],
            fill=OK_FILL, fill_col=3)

    vc = (diff.groupby(["society", "village", "rec_upland", "rec_midland"])
          .agg(ha=("area", "sum"), plots=("pid", "count")).reset_index()
          .sort_values(["society", "village", "ha"], ascending=[True, True, False]))
    ws = sheet(wb, "Village_Plan_IF_ELSE",
               ["Society", "Village", "Area (ha)", "No. of fields",
                "IF field drains SAME DAY (upland) -> plant",
                "IF water stands 1-2 DAYS (midland) -> plant",
                "How the supervisor decides"],
               [18, 24, 11, 12, 27, 28, 34])
    for i, r in enumerate(vc.itertuples(), 2):
        put(ws, i, [r.society, r.village, float(r.ha), int(r.plots),
                    disp(r.rec_upland), disp(r.rec_midland),
                    "Walk the field after heavy rain. Water gone by evening = upland. "
                    "Still standing next day or the day after = midland."])
        ws.cell(row=i, column=5).fill = OK_FILL
        ws.cell(row=i, column=6).fill = COND_FILL

    # ---------------- Priority_Actions ----------------
    ws = sheet(wb, "Priority_Actions",
               ["Priority", "Society", "Village", "Current variety", "Crop type",
                "Area (ha)", "Growers", "Action required"],
               [10, 18, 24, 14, 11, 10, 40, 46])
    r = 2
    ck_low = plots[(plots.variety == "COLK14201") & (plots.land_type == "LOWLAND")]
    for row in ck_low.sort_values("area", ascending=False).itertuples():
        put(ws, r, ["1 - VERIFY", row.society, row.village, disp(row.variety), row.crop_type,
                    float(row.area), row.growers,
                    "CoLK 14201 on land recorded LOWLAND. Verify drainage; if water stands, "
                    "do not re-plant this variety here."], fill=ACT_FILL, fill_col=8)
        r += 1
    ex = plots[plots.variety.isin(EXIT_VARIETIES) & plots.free]
    for row in ex.sort_values("area", ascending=False).head(500).itertuples():
        put(ws, r, ["2 - REPLACE", row.society, row.village, disp(row.variety), row.crop_type,
                    float(row.area), row.growers,
                    "Exit variety, cycle ending - re-plant with the variety shown in Village_Plan."],
            fill=ACT_FILL, fill_col=8)
        r += 1
    lock = plots[plots.variety.isin(EXIT_VARIETIES) & ~plots.free]
    ws.cell(row=r + 1, column=1,
            value="Note: a further %.0f ha of exit-variety cane is plant/autumn crop this season and "
                  "becomes ratoon in 2027-28 - it cannot be replaced without ploughing out standing cane."
                  % lock.area.sum()).font = Font(italic=True, color="9C0006")

    # ---------------- Branch_Impact ----------------
    ws = sheet(wb, "Branch_Impact",
               ["Item", "Area (ha)", "Fields", "Meaning"], [40, 13, 11, 56])
    tot_free = float(free.area.sum())
    ag_ha, df_ha = float(agree.area.sum()), float(diff.area.sum())
    rows_bi = [
        ("Total area free to re-plant", tot_free, len(free), "Everything this plan covers"),
        ("Land type already known (LOWLAND)", float(free[free.land_type == "LOWLAND"].area.sum()),
         int((free.land_type == "LOWLAND").sum()), "Recorded reliably - one answer"),
        ("Same variety either way", ag_ha, len(agree),
         "Upland and midland give the SAME answer - plant without visiting"),
        ("Answer depends on drainage", df_ha, len(diff),
         "Supervisor must check the field before planting - see Village_Plan_IF_ELSE"),
    ]
    for i, rr in enumerate(rows_bi, 2):
        put(ws, i, list(rr), fill=COND_FILL if rr[0].startswith("Answer depends") else None, fill_col=2)
    r_bi = len(rows_bi) + 3
    title_row_bi = ws.cell(row=r_bi, column=1, value="WHAT CHANGES IF THE AMBIGUOUS LAND TURNS OUT TO BE MIDLAND")
    title_row_bi.font = Font(bold=True, size=12, color="1F4E5F")
    r_bi += 1
    put(ws, r_bi, ["Variety", "If treated as UPLAND (ha)", "If treated as MIDLAND (ha)", "Difference"])
    for c in range(1, 5):
        ws.cell(row=r_bi, column=c).font = Font(bold=True)
    r_bi += 1
    up_tot = diff.groupby("rec_upland").area.sum()
    mid_tot = diff.groupby("rec_midland").area.sum()
    for v in sorted(set(list(up_tot.index) + list(mid_tot.index)), key=lambda x: -float(up_tot.get(x, 0))):
        if not v:
            continue
        a, b = float(up_tot.get(v, 0)), float(mid_tot.get(v, 0))
        put(ws, r_bi, [disp(v), a, b, b - a])
        r_bi += 1

    # ---------------- Fulfilment ----------------
    ws = sheet(wb, "Fulfilment",
               ["Variety", "Target 2027-28 (ha)", "Carries over by itself (ha)",
                "New planting needed (ha)", "Allocated by this plan (ha)", "Shortfall (ha)"],
               [15, 17, 22, 20, 21, 14])
    r = 2
    for v, tgt in sorted(targets.items(), key=lambda kv: -kv[1]):
        co = carry_over.get(v, 0.0) + plots[(plots.variety == v) & (plots.crop_type == "RATOON")].area.sum() * RATOON2_CARRY
        nd = need0.get(v, 0.0)          # requirement BEFORE allocation
        al = assigned.get(v, 0.0)
        put(ws, r, [disp(v), tgt, co, nd, al, max(0.0, nd - al)],
            fill=OK_FILL if al >= nd - 1 else COND_FILL, fill_col=6)
        r += 1

    # ---------------- Seed_By_Variety ----------------
    ws = sheet(wb, "Seed_By_Variety",
               ["Variety", "Area to plant (ha)", "Seed required (qtl) @65/ha", "Autumn planting?"],
               [16, 18, 26, 16])
    r = 2
    for v, ha in sorted(assigned.items(), key=lambda kv: -kv[1]):
        if not v:
            continue
        put(ws, r, [disp(v), float(ha), float(ha) * SEED_QTL_PER_HA,
                    "YES (Oct-Nov)" if v in AUTUMN_ONLY else "normal season"])
        r += 1

    # ---------------- Method ----------------
    ws = wb.create_sheet("Method")
    ws.cell(row=1, column=1, value="HOW THIS ALLOCATION WAS CALCULATED").font = TITLE_FONT
    m = [
        "Scenario: " + scen_label,
        "",
        "1. LOCKED AREA",
        "   Fields in plant or autumn crop become ratoon of the same variety in 2027-28.",
        "   Locked area: %.0f ha across %d fields." % (plots[~plots.free].area.sum(), (~plots.free).sum()),
        "",
        "2. FREE AREA",
        "   Fields in ratoon finish their cycle, except %.1f%% kept for a second ratoon" % (100 * RATOON2_CARRY),
        "   (rate measured from this survey, not assumed).",
        "   Free to re-plant: %.0f ha across %d fields." % (plots[plots.free].area.sum(), plots.free.sum()),
        "",
        "3. WHAT EACH VARIETY NEEDS",
        "   new planting needed = target area  -  area that carries over on its own",
        "",
        "4. LAND ELIGIBILITY",
        "   LOWLAND is recorded reliably -> one answer.",
        "   UPLAND means upland OR midland -> an unconditional answer where both readings agree,",
        "   otherwise a condition plus an alternative.",
        "",
        "5. ASSIGNMENT ORDER",
        "   Village by village. Within a village, fields on exit varieties are allocated first,",
        "   then unclassified varieties, then the rest. Each field goes to the eligible variety",
        "   with the largest remaining requirement, so villages receive varieties in blocks.",
        "   A variety that is merely tolerated on that land scores half of one that is recommended.",
        "",
        "IMPORTANT CAVEAT ON LOWLAND",
        "   This model assumes a plant crop becomes a ratoon next season, so plant-crop fields are",
        "   treated as locked. On lowland that assumption is doubtful: lowland is 96% plant crop and",
        "   only 3.8% ratoon, which suggests lowland cane is ploughed out and re-planted every year",
        "   rather than ratooned. If so, far more lowland is actually available than the 494 ha this",
        "   model frees, and the CoLK 94184 / CoS 13231 shortfalls below would largely disappear.",
        "   VERIFY THIS WITH THE CANE DEPARTMENT before acting on the lowland numbers.",
        "",
        "LIMITATIONS - please read",
        "   - Seed logistics are modelled mill-wide, not village by village.",
        "   - Grower consent and local practice are not modelled.",
        "   - Based on the June survey extract; the fuller July extract has about 2,832 ha more.",
        "   - Where a field's drainage is unknown, the condition column must be resolved in the",
        "     field before planting. This affects the varieties listed in Land_Action.",
    ]
    for i, ln in enumerate(m, 3):
        ws.cell(row=i, column=1, value=ln)
    ws.column_dimensions["A"].width = 100

    wb.save(OUTF)

    csvf = os.path.join(OUTD, "allocation_plots_%s.csv" % scenario.lower())
    out = free[["society", "village", "growers", "n_growers", "area", "variety",
                "crop_type", "land_type", "rec_upland", "rec_midland", "same", "reason"]].copy()
    out["variety"] = out.variety.map(disp)
    out["rec_upland"] = out.rec_upland.map(lambda v: disp(v) if v else "")
    out["rec_midland"] = out.rec_midland.map(lambda v: disp(v) if v else "")
    out.columns = ["Society", "Village", "Growers", "No. growers", "Area (ha)", "Current variety",
                   "Current crop type", "Land type (ERP)",
                   "IF UPLAND (drains same day) -> plant",
                   "IF MIDLAND (water 1-2 days) -> plant",
                   "Same answer?", "How to decide"]
    out.to_csv(csvf, index=False, encoding="utf-8-sig")

    print("scenario           : %s" % scen_label)
    print("allocation workbook: %s" % OUTF)
    print("plot-level CSV     : %s  (%s rows)" % (csvf, format(len(out), ",")))
    print("\nlocked (cannot change) : {:>9,.0f} ha".format(plots[~plots.free].area.sum()))
    gross = plots[plots.free].area.sum()
    rat_only = plots[plots.crop_type == "RATOON"].area.sum()
    print("free to re-plant (gross): {:>9,.0f} ha  in {:,} fields".format(gross, int(plots.free.sum())))
    print("  less {:.1f}% staying on as ratoon II : {:>6,.0f} ha".format(
        100 * RATOON2_CARRY, rat_only * RATOON2_CARRY))
    print("net expected re-planting: {:>9,.0f} ha".format(gross - rat_only * RATOON2_CARRY))
    print("same answer either way : {:>9,.0f} ha  in {:,} fields  (no visit needed)".format(
        free.loc[~free.needs_check, "area"].sum(), int((~free.needs_check).sum())))
    print("depends on drainage    : {:>9,.0f} ha  in {:,} fields  (IF/ELSE given)".format(
        free.loc[free.needs_check, "area"].sum(), int(free.needs_check.sum())))
    print("\ntop allocations:")
    for v, ha in sorted(assigned.items(), key=lambda kv: -kv[1])[:8]:
        if v:
            print("   {:14s} {:>8,.0f} ha   ({:,.0f} qtl seed)".format(disp(v), ha, ha * SEED_QTL_PER_HA))
    short = [(disp(v), need[v] - assigned.get(v, 0)) for v in need if need[v] - assigned.get(v, 0) > 1]
    if short:
        print("\nunmet requirement:")
        for v, s in sorted(short, key=lambda x: -x[1])[:8]:
            print("   {:14s} {:>8,.0f} ha short".format(v, s))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
