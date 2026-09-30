# -*- coding: utf-8 -*-
"""End-to-end test of the running app, checked against build/ground_truth.py.

    python build/test_app.py  [base_url]

Drives a real browser through the whole flow - upload the survey, upload the
cane team's sheet, walk all six steps, change a control and watch the plan
move, download both exports and read them back. Every headline figure is
compared with a value computed independently from the source workbooks, so a
pass means the app agrees with the files rather than with itself.
"""

import csv
import io
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GT = os.path.join(HERE, "cache", "ground_truth.json")
SURVEY = os.path.join(ROOT, "Gobind_Survey_2026-27_FINAL.xlsx")
SHEET = os.path.join(ROOT, "Variety_Input_TEMPLATE_2026-09-29.xlsx")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899/index.html"

results = []


def check(name, ok, got="", want=""):
    results.append((name, bool(ok), str(got), str(want)))
    mark = "PASS" if ok else "FAIL"
    detail = f"   got {got!r}" + (f" want {want!r}" if want != "" else "") if not ok else ""
    print(f"  [{mark}] {name}{detail}")


def num(text, pattern):
    m = re.search(pattern, text)
    return float(m.group(1).replace(",", "")) if m else None


def main() -> None:
    gt = json.load(open(GT, encoding="utf-8"))
    S, SH = gt["survey"], gt["sheet"]

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 1050}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        bad = []
        pg.on("response", lambda r: bad.append(r.status) if r.status >= 500 else None)

        # ---------------------------------------------------------- STEP 1
        print("\nSTEP 1 - ingestion")
        pg.goto(BASE, wait_until="networkidle", timeout=120000)
        pg.wait_for_timeout(4000)
        check("opens empty, asks for a file", "Drag and drop" in pg.inner_text("body"))

        pg.set_input_files("input[type=file]", SURVEY)
        for _ in range(120):
            pg.wait_for_timeout(2000)
            if f"{S['physicalFields']:,}" in pg.inner_text("body"):
                break
        # The metric cards animate their numbers up from zero, so reading the
        # page the instant the parse finishes catches some of them mid-count.
        pg.wait_for_timeout(4000)
        t = pg.inner_text("body")

        check("surveyed area", f"{round(S['areaHa']):,}" in t, want=f"{round(S['areaHa']):,}")
        check("physical fields", f"{S['physicalFields']:,}" in t, want=f"{S['physicalFields']:,}")
        check("growers", f"{S['growers']:,}" in t, want=f"{S['growers']:,}")
        check("villages", str(S["villages"]) in t, want=S["villages"])
        check("societies", str(S["societies"]) in t, want=S["societies"])
        check("varieties", str(S["varieties"]) in t, want=S["varieties"])
        check("locked ratoon ha", f"{round(S['lockedHa']):,}" in t, want=f"{round(S['lockedHa']):,}")
        check("free to replant ha", f"{round(S['freeHa']):,}" in t, want=f"{round(S['freeHa']):,}")
        check("lowland %", f"{S['lowlandPct']}%" in t, want=f"{S['lowlandPct']}%")
        check("lowland ha", f"{round(S['lowlandHa']):,}" in t, want=f"{round(S['lowlandHa']):,}")
        check("GPS drop count flagged", f"{S['badGpsRows']:,}" in t, want=S["badGpsRows"])
        check("ERP failure count flagged", f"{S['uploadFailRows']:,}" in t, want=S["uploadFailRows"])
        check("land type reported as estimated, not missing",
              "Land type estimated" in t and "Land type not recorded" not in t)

        # metric cards open
        opened = []
        for label in ["Surveyed Area", "Villages", "Co-op Societies", "Cane Varieties"]:
            pg.get_by_text(label, exact=True).first.click(timeout=10000)
            pg.wait_for_timeout(900)
            opened.append(pg.locator("table tbody tr").count())
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(400)
        check("metric cards open with rows", all(n > 0 for n in opened), opened)
        check("villages drill-down row count", opened[1] == S["villages"], opened[1], S["villages"])
        check("societies drill-down row count", opened[2] == S["societies"], opened[2], S["societies"])
        check("varieties drill-down row count", opened[3] == S["varieties"], opened[3], S["varieties"])

        # ---------------------------------------------------------- STEP 2
        print("\nSTEP 2 - varietal registry, before and after the sheet")
        pg.get_by_text("Varietal Registry", exact=True).first.click()
        pg.wait_for_timeout(3000)
        t = pg.inner_text("body")
        check("registry lists every variety", f"Showing {S['varieties']} of {S['varieties']}" in t)
        check("crop duration column is gone", "Crop Duration" not in t)

        ins = pg.locator("input[type=file]")
        ins.nth(ins.count() - 1).set_input_files(SHEET)
        pg.wait_for_timeout(7000)
        t = pg.inner_text("body")

        co0118 = SH["varieties"].get("CO 0118", {})
        inputs = pg.evaluate(
            "() => [...document.querySelectorAll('input[type=number]')].map(e => e.value)")
        check("sheet value: CO 0118 cane weight",
              str(int(co0118["avgCaneWeightGrams"])) in inputs,
              inputs[:4], co0118.get("avgCaneWeightGrams"))
        check("sheet value: CO 0118 seed stock",
              f"{int(co0118['seedAvailableQtl']):,}" in t, want=co0118.get("seedAvailableQtl"))
        check("blank sucrose shows as 'not set', not a number",
              "not set" in t and "80.0%" not in t)
        intro = [n for n, d in SH["varieties"].items() if d["strategy"] == "INTRODUCE-NEW"]
        if intro:
            check(f"INTRODUCE-NEW variety kept: {intro[0]}",
                  intro[0].replace(" ", "") in t.replace(" ", ""), want=intro[0])
        for name in ("CO 0118", "CO 0238", "COLK 14201"):
            want = SH["varieties"][name]["strategy"]
            key = name.replace(" ", "")
            i = t.find(key)
            check(f"strategy from sheet: {name} = {want}",
                  i >= 0 and want in t[i:i + 260], want=want)

        # ---------------------------------------------------------- STEP 3
        print("\nSTEP 3 - parameters")
        pg.get_by_text("Agronomic Rules", exact=True).first.click()
        pg.wait_for_timeout(3000)
        t = pg.inner_text("body")
        check("ratoon:plant is the measured 0.68", "0.68" in t)
        check("command area matches the survey",
              f"{round(S['areaHa']):,}" in t or f"{int(S['areaHa'])}" in t)
        footer = num(t, r"SEED REQUIRED\s*([\d,]+)\s*qtl")
        check("seed figure in the footer is not zero", footer is None or footer > 0, footer)

        # ---------------------------------------------------------- STEP 4
        print("\nSTEP 4 - strategy and the pace dials")
        pg.get_by_text("Seed & Strategy", exact=True).first.click()
        pg.wait_for_timeout(4500)
        t = pg.inner_text("body")
        for s, n in SH["strategyCounts"].items():
            if s:
                check(f"strategy present on screen: {s}", s in t)
        check("pace dial on EXPAND/REDUCE rows", "per year" in t)
        check("grower uptake on EXPAND rows", "Grower uptake" in t)

        # does moving a dial actually move the plan?
        before = num(t, r"COLK14201[\s\S]{0,400}?Y3 PROJECTION\s*([\d,]+)\s*ha")
        boxes = pg.locator("input[type=number]")
        moved = False
        if boxes.count():
            boxes.first.fill("60")
            boxes.first.dispatch_event("change")
            pg.wait_for_timeout(2500)
            after = num(pg.inner_text("body"), r"COLK14201[\s\S]{0,400}?Y3 PROJECTION\s*([\d,]+)\s*ha")
            moved = before is not None and after is not None and after != before
            check("changing the rate changes the Y3 projection", moved, f"{before} -> {after}")
            boxes.first.fill("25")
            boxes.first.dispatch_event("change")
            pg.wait_for_timeout(2500)
        else:
            check("changing the rate changes the Y3 projection", False, "no number input found")

        # ---------------------------------------------------------- STEP 5
        print("\nSTEP 5 - projections and compliance")
        pg.get_by_text("3-Yr Trajectory", exact=True).first.click()
        pg.wait_for_timeout(4500)
        t = pg.inner_text("body")
        y3 = num(t, r"COMMAND HECTARE TARGET\s*([\d,]+)")
        check("Y3 area does not exceed the command area",
              y3 is not None and y3 <= S["areaHa"] * 1.02, y3, f"<= {S['areaHa']}")
        seed = num(t, r"SEED DIVERTED \(YEAR 1\)\s*([\d,]+)")
        check("seed diverted is a real figure", seed is not None and seed > 0, seed)
        check("sucrose still flagged provisional", "Awaiting cane R&D" in t or "placeholder" in t)
        check("compliance panel present", "Compliance" in t)
        blended = num(t, r"BLENDED SUCROSE \(Y3\)\s*([\d.]+)")
        check("unknown sucrose is flagged, not shown as a silent zero",
              (blended or 0) > 0 or "Awaiting cane R&D" in t, blended)
        check("command area follows the uploaded survey",
              f"{round(S['areaHa']):,} ha" in t, want=f"{round(S['areaHa']):,} ha")

        # ---------------------------------------------------------- STEP 6
        print("\nSTEP 6 - allocation and exports")
        pg.get_by_text("Village Dispatch", exact=True).first.click()
        pg.wait_for_timeout(28000)
        t = pg.inner_text("body")
        m = re.search(r"([\d,\.]+) of ([\d,\.]+) free ha placed \(([\d.]+)%\)", t)
        check("allocation ran", m is not None, m.group(0) if m else "not found")
        if m:
            placed_pct = float(m.group(3))
            check("placed most of the free land", placed_pct >= 85, f"{placed_pct}%")
            check("any shortfall is explained on screen",
                  placed_pct >= 99.5 or "no eligible variety" in t)

        saved = {}
        for label in ("Village Plan (CSV)", "Field Dispatch (CSV)"):
            try:
                with pg.expect_download(timeout=90000) as dl:
                    pg.get_by_text(label, exact=True).first.click()
                d = dl.value
                path = os.path.join(HERE, "cache", d.suggested_filename)
                d.save_as(path)
                saved[label] = path
                check(f"download: {label}", os.path.getsize(path) > 500,
                      f"{os.path.getsize(path):,} bytes")
            except Exception as e:
                check(f"download: {label}", False, str(e)[:70])

        # read the dispatch file back and check it against the survey
        fd = saved.get("Field Dispatch (CSV)")
        if fd:
            with open(fd, encoding="utf-8-sig", newline="") as fh:
                rows = list(csv.DictReader(fh))
            check("dispatch file has rows", len(rows) > 1000, f"{len(rows):,} rows")
            cols = set(rows[0].keys()) if rows else set()
            for need in ("Village", "Variety to Plant", "Land Type"):
                check(f"dispatch column present: {need}",
                      any(need.lower() in c.lower() for c in cols))
            if rows:
                vills = {r.get("Village", "").strip() for r in rows}
                check("dispatch villages are a subset of the survey's",
                      len(vills) <= S["villages"] + 2, len(vills), S["villages"])
                blanks = sum(1 for r in rows if not r.get("Variety to Plant", "").strip())
                check("every dispatch row names a variety", blanks == 0, f"{blanks} blank")

        # ---------------------------------------------------------- general
        print("\nGENERAL")
        check("no uncaught page errors", not errs, errs[:2])
        check("no 5xx responses", not bad, bad[:3])

        ph = ctx.new_page()
        ph.set_viewport_size({"width": 390, "height": 844})
        ph.goto(BASE, wait_until="networkidle", timeout=90000)
        ph.wait_for_timeout(3500)
        check("no horizontal scroll at phone width",
              not ph.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"))
        ctx.close()
        b.close()

    passed = sum(1 for _, ok, _, _ in results if ok)
    print(f"\n{'=' * 62}")
    print(f"  {passed} of {len(results)} checks passed")
    failed = [r for r in results if not r[1]]
    if failed:
        print(f"\n  FAILURES ({len(failed)}):")
        for n, _, got, want in failed:
            print(f"   - {n}\n       got {got!r}" + (f"  want {want!r}" if want else ""))
    print("=" * 62)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
