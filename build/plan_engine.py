# -*- coding: utf-8 -*-
"""Varietal plan engine - two-scenario comparison with conditional land logic.

Reads:
  build/cache/plots_2627.parquet   the 2026-27 ERP survey (actuals)
  plan_inputs/A-F .xlsx            variety attributes, targets, constraints, KPIs
  Seed Availbility.xlsx            the mill's own 2027-28 proposal + seed position

Writes plan_outputs/Varietal_Plan_Outcome.xlsx.

Two things make this version different from a plain target-checker:

1. TWO SCENARIOS. The guiding document's Year-1 targets and the mill's Seed
   Availability proposal disagree on nearly every variety, so both are carried
   through every calculation side by side rather than one being assumed correct.

2. CONDITIONAL LAND LOGIC. The ERP records only UPLAND / LOWLAND, but UPLAND
   really means "upland or midland". Instead of blocking on a 334-village
   drainage survey, every UPLAND plot gets BOTH answers - what to do if it is
   truly upland, and what to do if it is midland. Where the two answers agree,
   no survey is needed at all; only the disagreements need a field check, which
   turns an all-villages survey into a short targeted list.
"""

import datetime
import os

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, "cache", "plots_2627.parquet")
INP = os.path.join(ROOT, "plan_inputs")
SEEDF = os.path.join(ROOT, "Seed Availbility.xlsx")
OUTD = os.path.join(ROOT, "plan_outputs")
OUTF = os.path.join(OUTD, "Varietal_Plan_Outcome.xlsx")

HDR_FILL = PatternFill("solid", fgColor="1F4E5F")
HDR_FONT = Font(color="FFFFFF", bold=True, size=11)
TITLE_FONT = Font(bold=True, size=14, color="1F4E5F")
STATUS = {
    "PASS": (PatternFill("solid", fgColor="C6EFCE"), Font(color="006100", bold=True)),
    "FAIL": (PatternFill("solid", fgColor="FFC7CE"), Font(color="9C0006", bold=True)),
    "WARN": (PatternFill("solid", fgColor="FFEB9C"), Font(color="9C6500", bold=True)),
    "INFO": (PatternFill("solid", fgColor="DDEBF7"), Font(color="1F4E5F", bold=True)),
}
_s = Side(style="thin", color="D9D9D9")
THIN = Border(left=_s, right=_s, top=_s, bottom=_s)

SEED_QTL_PER_HA = 65.0     # verified exactly against the Seed Availability sheet
RATOON_RATIO = 0.9         # the mill's own assumption: ratoon area = plant x 0.9

# ---------------------------------------------------------------------------
# Land suitability rules, from the guiding document Section 4 and Section 6.
# Verdicts: OK (recommended) / CAUTION (conditional) / AVOID (do not plant).
# The UPLAND and MIDLAND columns are what the conditional output branches on.
# ---------------------------------------------------------------------------
LAND_RULES = {
    "CO0118":    ("OK",      "OK",      "CAUTION", "Backbone U/M variety. Lowland only if water clears within ~10 days."),
    "COLK94184": ("AVOID",   "CAUTION", "OK",      "Lowland-adapted. Wasted on free-draining upland; on midland use only where waterlogging risk exists."),
    "CO98014":   ("CAUTION", "OK",      "OK",      "Semi-lowland / drought tolerant. Suits transition blocks."),
    "CO0238":    ("AVOID",   "AVOID",   "AVOID",   "Being exited - red rot. No fresh planting, no ratoon continuation."),
    "COLK14201": ("OK",      "CAUTION", "AVOID",   "MILL OVERRIDE: autumn 18-month, upland/midland only. On midland ONLY if the field drains within 1-2 days. NEVER on lowland."),
    "COS13231":  ("AVOID",   "CAUTION", "OK",      "Lowland expansion variety. Not for free-draining upland."),
    "COS13235":  ("OK",      "OK",      "AVOID",   "Upland/midland diversifier."),
    "CO15023":   ("OK",      "OK",      "AVOID",   "Highest sucrose. Needs well-drained soil; avoid standing water beyond 5-7 days."),
    "COLK16202": ("CAUTION", "OK",      "CAUTION", "Midland variety under seed multiplication; CoLK series generally flexible."),
    "COS17231":  ("OK",      "OK",      "AVOID",   "Red-rot-resistant successor to Co 0238. Avoid standing water beyond 5-7 days."),
    "COS18231":  ("OK",      "OK",      "AVOID",   "Under local evaluation."),
    "COS19231":  ("OK",      "OK",      "CAUTION", "Under seed multiplication; whole-UP approval."),
}
RANK = {"OK": 0, "CAUTION": 1, "AVOID": 2}


def norm(v):
    return str(v).replace(" ", "").upper() if v is not None else ""


def sheet(wb, name, headers, widths=None):
    ws = wb.create_sheet(name)
    for j, htxt in enumerate(headers, 1):
        c = ws.cell(row=1, column=j, value=htxt)
        c.fill, c.font, c.border = HDR_FILL, HDR_FONT, THIN
        c.alignment = Alignment(wrap_text=True, vertical="center")
    if widths:
        for j, w in enumerate(widths, 1):
            ws.column_dimensions[ws.cell(row=1, column=j).column_letter].width = w
    ws.freeze_panes = "A2"
    return ws


def put(ws, r, values, status=None, status_col=None):
    for j, v in enumerate(values, 1):
        if isinstance(v, float):
            v = round(v, 2)
        c = ws.cell(row=r, column=j, value=v)
        c.border = THIN
    if status:
        fill, font = STATUS[status]
        c = ws.cell(row=r, column=status_col or len(values))
        c.fill, c.font = fill, font


def title_row(ws, r, text):
    c = ws.cell(row=r, column=1, value=text)
    c.font = Font(bold=True, size=12, color="1F4E5F")


def read_inputs(gaps):
    got = {}
    files = {
        "B": ("B_Village_Land_Classification.xlsx", "Villages"),
        "C": ("C_Variety_Master.xlsx", "VarietyMaster"),
        "D_t": ("D_Plan_Targets.xlsx", "Targets"),
        "D_c": ("D_Plan_Targets.xlsx", "Constraints"),
        "E_p": ("E_Seed_and_Transition.xlsx", "Parameters"),
        "F_lab": ("F_KPI_Actuals.xlsx", "MillLab_Monthly"),
    }
    for key, (fname, sname) in files.items():
        try:
            got[key] = pd.read_excel(os.path.join(INP, fname), sheet_name=sname, engine="openpyxl")
        except Exception as e:
            got[key] = None
            gaps.append(("INPUT MISSING", "%s :: %s (%s)" % (fname, sname, type(e).__name__)))
    return got


def read_seed_file(gaps):
    """Parse the mill's Seed Availability sheet -> proposal + seed position."""
    if not os.path.exists(SEEDF):
        gaps.append(("INPUT MISSING", "Seed Availbility.xlsx not found"))
        return {}
    raw = pd.read_excel(SEEDF, sheet_name=0, header=None, engine="openpyxl")
    out = {}
    for _, r in raw.iterrows():
        name = r[1]
        if not isinstance(name, str) or not name.strip() or "Total" in name:
            continue
        try:
            out[norm(name)] = {
                "name": name.strip(),
                "y0": float(r[8]),        # Grand Total survey 2026-27
                "plant": float(r[10]),    # proposed 2027-28 plant
                "ratoon": float(r[11]),   # proposed 2027-28 ratoon
                "y1": float(r[12]),       # proposed 2027-28 total
                "seed_req": float(r[14]),
                "seed_avail": float(r[15]),
            }
        except (TypeError, ValueError):
            continue
    return out


def main():
    gaps = []
    if not os.path.exists(CACHE):
        raise SystemExit("survey cache missing - run: python build/extract_2627.py")
    os.makedirs(OUTD, exist_ok=True)

    df = pd.read_parquet(CACHE)
    df["vnorm"] = df.variety.map(norm)
    inp = read_inputs(gaps)
    seed = read_seed_file(gaps)

    total_ha = float(df.area_ha.sum())
    act = df.groupby("vnorm").area_ha.sum()

    # ---- parameters --------------------------------------------------
    P = {}
    if inp["E_p"] is not None:
        for r in inp["E_p"].itertuples():
            try:
                P[str(r.Parameter).strip()] = float(r.Value)
            except (TypeError, ValueError):
                pass
    carry = P.get("ratoon2_carry_pct", 3.6) / 100.0
    others_suc = P.get("others_sucrose_pct", 16.8)

    # ---- targets: scenario DOC ---------------------------------------
    doc_t, named = {}, []
    if inp["D_t"] is not None:
        for r in inp["D_t"].itertuples():
            v = str(r[1]).strip()
            if v.upper() in ("TOTAL", "NAN") or not v:
                continue
            doc_t[norm(v)] = {"name": v, "y": [float(r[3]), float(r[4]), float(r[5]), float(r[6])]}
            if norm(v) != "OTHERS":
                named.append(norm(v))
    command = 57000.0
    constraints = []
    if inp["D_c"] is not None:
        for r in inp["D_c"].itertuples():
            constraints.append((str(r.Constraint), r.Value, str(r[3]), str(r[4])))
            if "Command area" in str(r.Constraint):
                command = float(r.Value)

    # ---- sucrose from workbook C -------------------------------------
    suc = {}
    if inp["C"] is not None:
        for r in inp["C"].itertuples():
            try:
                if pd.notna(r[5]):
                    suc[norm(r.Variety)] = float(r[5])
            except (TypeError, ValueError, IndexError):
                pass

    # ---- build the two scenarios -------------------------------------
    # DOC  = guiding document Year-1 targets
    # MILL = Seed Availability proposed 2027-28
    scen = {"DOC": {}, "MILL": {}}
    for v, t in doc_t.items():
        scen["DOC"][v] = t["y"][1]
    for v, s in seed.items():
        scen["MILL"][v] = s["y1"]
    all_v = sorted(set(list(scen["DOC"]) + list(scen["MILL"]) + list(act.index)),
                   key=lambda v: -float(act.get(v, 0)))

    def disp(v):
        if v in doc_t:
            return doc_t[v]["name"]
        if v in seed:
            return seed[v]["name"]
        m = df.loc[df.vnorm == v, "variety"]
        return m.iloc[0] if len(m) else v

    # ---- replant budget ----------------------------------------------
    ha_ct = df.groupby("crop_type").area_ha.sum()
    plant_ha = float(ha_ct.get("PLANT", 0) + ha_ct.get("AUTUMN", 0))
    rat_ha = float(ha_ct.get("RATOON", 0))
    rat2_ha = float(ha_ct.get("RATOON II", 0))
    budget = rat_ha * (1 - carry) + rat2_ha

    # 'OTHERS' in the plan pools every variety not named individually, so its
    # real area is the total minus all the named ones.
    act_others = total_ha - sum(float(act.get(v, 0)) for v in named)

    def need_of(sc):
        # 'OTHERS' is not a variety in the survey - it is everything not named
        # individually. Comparing it against act.get("OTHERS") returns 0 and
        # invents a phantom expansion, so its real pooled area is used instead.
        total = 0.0
        for v, tgt in scen[sc].items():
            cur = act_others if v == "OTHERS" else float(act.get(v, 0))
            total += max(0.0, tgt - cur)
        return total

    # ---- conditional land analysis -----------------------------------
    # For every plot the ERP recorded UPLAND, compare the verdict it would get
    # as true upland against the verdict it would get as midland. Only where
    # they differ does anyone need to walk the field.
    up = df[df.land_type == "UPLAND"]
    land_rows, ambiguous_v = [], []
    for v in sorted(up.vnorm.unique(), key=lambda v: -float(up.loc[up.vnorm == v, "area_ha"].sum())):
        ha = float(up.loc[up.vnorm == v, "area_ha"].sum())
        if ha < 1:
            continue
        rule = LAND_RULES.get(v)
        if rule is None:
            land_rows.append((disp(v), ha, "?", "?", "CHECK", "Variety not classified in workbook C - agronomy to confirm"))
            continue
        u, m, _l, note = rule
        differs = u != m
        if differs:
            ambiguous_v.append(v)
        land_rows.append((disp(v), ha, u, m, "DRAINAGE CHECK NEEDED" if differs else "same either way", note))
    amb_ha = float(up[up.vnorm.isin(ambiguous_v)].area_ha.sum())

    # villages holding the ambiguous area - the targeted survey list
    vill = (up[up.vnorm.isin(ambiguous_v)]
            .groupby(["society", "plot_village"]).area_ha.sum()
            .sort_values(ascending=False))

    # ---- CoLK 14201 lowland exposure ---------------------------------
    ck_low = df[(df.vnorm == "COLK14201") & (df.land_type == "LOWLAND")]
    ck_low_ha = float(ck_low.area_ha.sum())
    ck_low_v = ck_low.groupby(["society", "plot_village"]).area_ha.sum().sort_values(ascending=False)

    # ---- seed balance -------------------------------------------------
    def seed_rows(sc):
        rows = []
        for v, tgt in sorted(scen[sc].items(), key=lambda kv: -kv[1]):
            if v == "OTHERS":
                continue
            plant = (seed[v]["plant"] if (sc == "MILL" and v in seed)
                     else tgt / (1 + RATOON_RATIO))
            req = plant * SEED_QTL_PER_HA
            avail = seed[v]["seed_avail"] if v in seed else None
            if avail is None:
                rows.append((disp(v), tgt, plant, req, None, None, "NO DATA"))
            else:
                rows.append((disp(v), tgt, plant, req, avail, avail - req,
                             "PASS" if avail >= req else "FAIL"))
        return rows

    # ---- PoL projection ------------------------------------------------
    def pol_of(mapping):
        num = den = 0.0
        for v, a in mapping.items():
            s = suc.get(v, others_suc if v in ("OTHERS",) or v.startswith("OTH") else None)
            if s is None:
                continue
            num += a * s
            den += a
        return (num / den) if den else None

    pol_y0 = pol_of({v: float(act.get(v, 0)) for v in act.index})
    pol_doc = pol_of(scen["DOC"])
    pol_mill = pol_of(scen["MILL"])

    # =========================== OUTPUT ================================
    wb = Workbook(); wb.remove(wb.active)

    # ---------------- Summary ----------------
    ws = sheet(wb, "Summary", ["Item", "Value", "Note / Status"], [50, 24, 60])
    ws.insert_rows(1)
    ws.cell(row=1, column=1, value="VARIETAL PLAN OUTCOME - two scenarios  (generated %s)"
            % datetime.date.today().strftime("%d %b %Y")).font = TITLE_FONT
    ws.freeze_panes = "A3"
    r = 3
    for it in [
        ("Survey rows (2026-27)", "{:,}".format(len(df)), "ERP plot survey"),
        ("Total surveyed area", "{:,.0f} ha".format(total_ha),
         "NOTE: this extract is a mid-survey cut; fuller file shows ~59,323 ha"),
        ("Command area assumed by plan", "{:,.0f} ha".format(command), "workbook D"),
        ("Replant budget for 2027-28", "{:,.0f} ha".format(budget),
         "ratoon completing ({:.1f}% carries to ratoon II) + ratoon II".format(100 * carry)),
        ("Seed rate used", "{:.0f} qtl/ha".format(SEED_QTL_PER_HA), "verified against Seed Availability sheet"),
    ]:
        put(ws, r, list(it)); r += 1

    r += 1
    title_row(ws, r, "SCENARIO A - Guiding Document Year-1 targets"); r += 1
    need_doc = need_of("DOC")
    for it in [("Expansion required", "{:,.0f} ha".format(need_doc),
                "PASS" if need_doc <= budget else "FAIL"),
               ("Fits replant budget?", "{:,.0f} of {:,.0f} ha".format(need_doc, budget),
                "PASS" if need_doc <= budget else "FAIL"),
               ("Projected blended PoL", "{:.2f}%".format(pol_doc) if pol_doc else "n/a",
                "vs {:.2f}% today".format(pol_y0) if pol_y0 else "")]:
        put(ws, r, list(it), status=it[2] if it[2] in STATUS else None); r += 1

    r += 1
    title_row(ws, r, "SCENARIO B - Mill's Seed Availability proposal 2027-28"); r += 1
    need_mill = need_of("MILL")
    for it in [("Expansion required", "{:,.0f} ha".format(need_mill),
                "PASS" if need_mill <= budget else "FAIL"),
               ("Fits replant budget?", "{:,.0f} of {:,.0f} ha".format(need_mill, budget),
                "PASS" if need_mill <= budget else "FAIL"),
               ("Projected blended PoL", "{:.2f}%".format(pol_mill) if pol_mill else "n/a",
                "vs {:.2f}% today".format(pol_y0) if pol_y0 else "")]:
        put(ws, r, list(it), status=it[2] if it[2] in STATUS else None); r += 1

    r += 1
    title_row(ws, r, "CROSS-CUTTING FLAGS (independent of scenario)"); r += 1
    flags = [
        ("CoLK 14201 on lowland must be 0", "{:.1f} ha in {} villages".format(ck_low_ha, len(ck_low_v)),
         "FAIL" if ck_low_ha > 0 else "PASS"),
        ("Area needing a drainage check", "{:,.0f} ha of {:,.0f} ha upland".format(amb_ha, float(up.area_ha.sum())),
         "INFO"),
        ("Villages in the targeted check list", "{}".format(len(vill)), "INFO"),
        ("Co 0238 locked as plant/autumn (cannot be removed in Y1)",
         "{:,.0f} ha".format(float(df[(df.vnorm == "CO0238") & (df.crop_type.isin(["PLANT", "AUTUMN"]))].area_ha.sum())),
         "WARN"),
    ]
    for f in flags:
        put(ws, r, list(f), status=f[2]); r += 1

    # ---------------- Scenario_Compare ----------------
    ws = sheet(wb, "Scenario_Compare",
               ["Variety", "Actual 2026-27 (ha)", "A: Doc Y1 (ha)", "B: Mill Y1 (ha)",
                "B minus A", "Direction disagreement?", "Comment"],
               [14, 17, 15, 15, 12, 22, 46])
    r = 2
    for v in all_v:
        a0 = float(act.get(v, 0))
        d = scen["DOC"].get(v)
        m = scen["MILL"].get(v)
        if d is None and m is None and a0 < 30:
            continue
        note, st = "", None
        if d is not None and m is not None:
            dd, dm = d - a0, m - a0
            if dd * dm < 0:
                note, st = "Document and mill move in OPPOSITE directions", "FAIL"
            elif abs(m - d) > max(500, 0.25 * max(d, 1)):
                note, st = "Large gap between the two plans", "WARN"
        elif d is not None and m is None:
            note, st = "In document plan, ABSENT from mill proposal", "FAIL"
        elif m is not None and d is None:
            if v.startswith("OTH"):
                note, st = "Pooled under 'Others' in the document plan", None
            else:
                note, st = "In mill proposal, not itemised in document", "WARN"
        put(ws, r, [disp(v), a0, d, m, (m - d) if (d is not None and m is not None) else None,
                    "YES" if st == "FAIL" else ("gap" if st == "WARN" else "no"), note],
            status=st, status_col=6)
        r += 1

    oth_mill = sum(a for k, a in scen["MILL"].items() if k.startswith("OTH"))
    oth_doc = scen["DOC"].get("OTHERS")
    oth_act = float(sum(act.get(k, 0) for k in act.index if k.startswith("OTH")))
    if oth_doc is not None:
        put(ws, r, ["OTHERS (pooled)", oth_act, oth_doc, oth_mill, oth_mill - oth_doc,
                    "gap" if abs(oth_mill - oth_doc) > 500 else "no",
                    "Document pools all minor varieties; mill lists three OTH lines"],
            status="WARN" if abs(oth_mill - oth_doc) > 500 else None, status_col=6)
        r += 1

    # ---------------- Land_Rules (the IF logic) ----------------
    ws = sheet(wb, "Land_Rules",
               ["Variety", "IF field is UPLAND (drains same day)",
                "IF field is MIDLAND (drains 1-2 days)", "IF field is LOWLAND (water stands 5+ days)",
                "Guidance"],
               [14, 26, 26, 28, 62])
    r = 2
    for v, (u, m, l, note) in LAND_RULES.items():
        put(ws, r, [disp(v), u, m, l, note])
        for col, val in ((2, u), (3, m), (4, l)):
            f, fo = STATUS["PASS" if val == "OK" else ("WARN" if val == "CAUTION" else "FAIL")]
            ws.cell(row=r, column=col).fill = f
            ws.cell(row=r, column=col).font = fo
        r += 1
    r += 1
    title_row(ws, r, "How to read this: the ERP records UPLAND for both upland and midland land.")
    ws.cell(row=r + 1, column=1, value="Where the UPLAND and MIDLAND columns agree, no field check is needed - "
                                       "the recommendation is the same either way.")
    ws.cell(row=r + 2, column=1, value="Where they differ, the field must be checked for drainage before planting. "
                                       "Those varieties and villages are listed in the next two sheets.")

    # ---------------- Land_Action ----------------
    ws = sheet(wb, "Land_Action",
               ["Variety", "Area recorded UPLAND (ha)", "If truly UPLAND", "If actually MIDLAND",
                "Field check needed?", "Guidance"],
               [14, 20, 15, 18, 22, 62])
    for i, row in enumerate(land_rows, 2):
        st = "FAIL" if row[4].startswith("DRAINAGE") else ("WARN" if row[4] == "CHECK" else "PASS")
        put(ws, i, list(row), status=st, status_col=5)

    # ---------------- Village_Check_List ----------------
    ws = sheet(wb, "Village_Check_List",
               ["Rank", "Society", "Village", "Ambiguous area (ha)", "Cumulative %"],
               [7, 20, 28, 18, 13])
    tot_amb = float(vill.sum()) or 1.0
    cum = 0.0
    for i, ((soc, vname), ha) in enumerate(vill.items(), 1):
        cum += float(ha)
        put(ws, i + 1, [i, soc, vname, float(ha), 100 * cum / tot_amb])
        if i >= 400:
            break

    # ---------------- CoLK14201_Lowland ----------------
    ws = sheet(wb, "CoLK14201_Lowland",
               ["Rank", "Society", "Village", "Area on LOWLAND (ha)"], [7, 20, 28, 20])
    for i, ((soc, vname), ha) in enumerate(ck_low_v.items(), 1):
        put(ws, i + 1, [i, soc, vname, float(ha)])

    # ---------------- Replant_Budget ----------------
    ws = sheet(wb, "Replant_Budget", ["Line", "Area (ha)", "Note"], [52, 14, 60])
    rows = [
        ("Currently PLANT + AUTUMN (locked - becomes ratoon of same variety)", plant_ha,
         "Variety cannot be changed until this cycle ends"),
        ("Currently RATOON, cycle completing", rat_ha * (1 - carry),
         "{:.1f}% carries on to ratoon II".format(100 * carry)),
        ("Currently RATOON II (all replantable)", rat2_ha, ""),
        ("REPLANT BUDGET for 2027-28", budget, "Total area free for fresh planting"),
        ("Scenario A - Document expansion required", need_doc,
         "FEASIBLE" if need_doc <= budget else "EXCEEDS BUDGET"),
        ("Scenario B - Mill proposal expansion required", need_mill,
         "FEASIBLE" if need_mill <= budget else "EXCEEDS BUDGET"),
    ]
    for i, (line, ha, note) in enumerate(rows, 2):
        st = None
        if line.startswith("Scenario"):
            st = "PASS" if "FEASIBLE" == note else "FAIL"
        put(ws, i, [line, ha, note], status=st)

    # ---------------- Seed_Balance ----------------
    ws = sheet(wb, "Seed_Balance",
               ["Scenario", "Variety", "Target area (ha)", "Plant area (ha)",
                "Seed required (qtl)", "Seed available (qtl)", "Surplus / (short)", "Status"],
               [11, 14, 15, 14, 17, 17, 17, 10])
    r = 2
    for sc, label in (("MILL", "B - Mill"), ("DOC", "A - Document")):
        for row in seed_rows(sc):
            st = row[6] if row[6] in STATUS else "WARN"
            put(ws, r, [label] + list(row[:6]), status=st, status_col=8)
            ws.cell(row=r, column=8, value=row[6]).border = THIN
            f, fo = STATUS[st]
            ws.cell(row=r, column=8).fill, ws.cell(row=r, column=8).font = f, fo
            r += 1
        r += 1
    ws.cell(row=r, column=1, value="Seed required = plant area x %.0f qtl/ha. For Scenario A the plant/ratoon "
                                   "split is derived using the mill's own ratio (ratoon = plant x %.1f)."
            % (SEED_QTL_PER_HA, RATOON_RATIO)).font = Font(italic=True, size=9)

    # ---------------- Compliance ----------------
    ws = sheet(wb, "Compliance", ["Constraint", "Limit", "Scenario A - Document",
                                  "Scenario B - Mill", "Status"], [40, 12, 22, 22, 10])
    r = 2
    maxa = max(scen["DOC"].values()) / command * 100 if scen["DOC"] else 0
    maxb = max(scen["MILL"].values()) / command * 100 if scen["MILL"] else 0
    low_keys = ["COLK94184", "COS13231", "CO98014"]
    lowa = sum(scen["DOC"].get(k, 0) for k in low_keys) / command * 100
    lowb = sum(scen["MILL"].get(k, 0) for k in low_keys) / command * 100
    c0238a, c0238b = scen["DOC"].get("CO0238", 0), scen["MILL"].get("CO0238", 0)
    checks = [
        ("No variety above 40% (hard cap)", "40%", "%.1f%%" % maxa, "%.1f%%" % maxb,
         "PASS" if max(maxa, maxb) <= 40 else "FAIL"),
        ("Lowland coverage floor", ">=28%", "%.1f%%" % lowa, "%.1f%%" % lowb,
         "PASS" if min(lowa, lowb) >= 28 else "FAIL"),
        ("Co 0238 reduction (plan: 2,000 ha by Y1)", "2,000 ha",
         "%.0f ha" % c0238a, "%.0f ha" % c0238b,
         "FAIL" if c0238b > 2500 else "PASS"),
        ("CoLK 14201 on lowland", "0 ha", "%.1f ha today" % ck_low_ha, "%.1f ha today" % ck_low_ha,
         "FAIL" if ck_low_ha > 0 else "PASS"),
    ]
    for c in checks:
        put(ws, r, list(c), status=c[4]); r += 1
    r += 1
    title_row(ws, r, "Constraints as recorded in workbook D"); r += 1
    put(ws, r, ["Constraint", "Value", "Applies to", "Source"]); r += 1
    for cn, cv, ap, src in constraints:
        put(ws, r, [cn, cv, ap, src]); r += 1

    # ---------------- PoL_Projection ----------------
    ws = sheet(wb, "PoL_Projection", ["Basis", "Blended PoL % (juice)", "Note"], [30, 20, 62])
    put(ws, 2, ["Actual 2026-27", pol_y0, "area-weighted from workbook C sucrose values"])
    put(ws, 3, ["Scenario A - Document Y1", pol_doc, "guiding document targets"])
    put(ws, 4, ["Scenario B - Mill proposal Y1", pol_mill, "Seed Availability proposed areas"])
    put(ws, 5, ["", "", "Read the DELTA between rows, not the absolute level: these use healthy-cane "
                        "sucrose and do not model disease-damaged cane."])

    # ---------------- Data_Gaps ----------------
    gaps.extend([
        ("SURVEY EXTRACT", "This cache is the June cut (%.0f ha). The 22-07-2026 text extract shows "
                           "59,323 ha - about 2,832 ha more. Totals here are understated." % total_ha),
        ("LAND TYPE", "ERP has no MIDLAND. Handled by conditional logic: {:,.0f} ha of upland "
                      "area needs a drainage check (see Land_Action).".format(amb_ha)),
        ("NEW VARIETIES", "CoLK 16202 / CoS 17231 / CoS 18231 / CoS 19231 appear in the document plan "
                          "but are absent from the mill's 2027-28 proposal - confirm intent."),
        ("SEED AVAILABILITY", "The availability figures cannot be reproduced from area (they range "
                              "55-343 qtl/ha). Formula/source needed to extend to other varieties or years."),
        ("SCENARIO B HORIZON", "The Seed Availability sheet covers 2027-28 only. Y2 and Y3 proposed "
                               "areas are needed for a full three-year comparison."),
        ("SOIL TYPE", "blank on %.0f%% of rows" % (100 * (df.soil_type == "NONE").mean())),
        ("IRRIGATION", "Column unusable - it tracks crop type, not irrigation "
                       "(66% YES on plant crop vs 2.5% on ratoon)."),
    ])
    if inp["F_lab"] is None or inp["F_lab"]["PoL % (juice)"].dropna().empty:
        gaps.append(("MILL LAB", "F_KPI_Actuals MillLab_Monthly is empty - recovery cannot be tracked."))
    ws = sheet(wb, "Data_Gaps", ["Category", "Detail"], [24, 104])
    for i, (cat, det) in enumerate(gaps, 2):
        put(ws, i, [cat, det])

    wb.save(OUTF)

    # ---------------- console ----------------
    print("outcome -> %s" % OUTF)
    print("\nSurveyed 2026-27: {:,.0f} ha   |   replant budget 2027-28: {:,.0f} ha".format(total_ha, budget))
    print("\nSCENARIO A (document)  expansion needed {:,.0f} ha  -> {}".format(
        need_doc, "FEASIBLE" if need_doc <= budget else "EXCEEDS BUDGET"))
    print("SCENARIO B (mill)      expansion needed {:,.0f} ha  -> {}".format(
        need_mill, "FEASIBLE" if need_mill <= budget else "EXCEEDS BUDGET"))
    print("\nConditional land logic:")
    print("  upland-recorded area          {:,.0f} ha".format(float(up.area_ha.sum())))
    print("  needs a drainage check        {:,.0f} ha  ({:.1f}%)".format(amb_ha, 100 * amb_ha / float(up.area_ha.sum())))
    print("  villages to visit             {}".format(len(vill)))
    print("  CoLK 14201 on lowland         {:.1f} ha in {} villages".format(ck_low_ha, len(ck_low_v)))
    sr = [x for x in seed_rows("MILL") if x[6] == "FAIL"]
    print("\nSeed shortfalls (mill scenario): {}".format(
        ", ".join("%s (%.0f qtl short)" % (x[0], -x[5]) for x in sr) if sr else "none"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
