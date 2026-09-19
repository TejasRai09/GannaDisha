# -*- coding: utf-8 -*-
"""Generate 'Varietal Planning System - Complete Guide.docx'.

A ground-up explainer of the whole system - the six input workbooks, every
formula the engine computes, and the logic behind each decision - written so a
reader with school-level mathematics can follow every step.

All numbers quoted are from the 2026-27 survey cache and the first engine run;
regenerate after major data changes so the worked examples stay honest.
"""

import os

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "Varietal Planning System - Complete Guide.docx")

TEAL = RGBColor(0x1F, 0x4E, 0x5F)
GREY = RGBColor(0x60, 0x60, 0x60)

doc = Document()
st = doc.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(11)


def h(level, text):
    doc.add_heading(text, level=level)


def p(text, bold=False, italic=False, size=None, color=None, align=None):
    par = doc.add_paragraph()
    run = par.add_run(text)
    run.bold, run.italic = bold, italic
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    if align:
        par.alignment = align
    return par


def lead(bold_part, rest):
    par = doc.add_paragraph()
    par.add_run(bold_part).bold = True
    par.add_run(rest)


def bullet(text, bold_lead=None):
    par = doc.add_paragraph(style="List Bullet")
    if bold_lead:
        par.add_run(bold_lead).bold = True
    par.add_run(text)


def formula(text):
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = par.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(10.5)
    run.font.color.rgb = TEAL
    run.bold = True


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)


def example(title, lines):
    """A shaded worked-example box."""
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    cell = t.rows[0].cells[0]
    shade(cell, "EEF5F8")
    par = cell.paragraphs[0]
    par.add_run("WORKED EXAMPLE - " + title).bold = True
    for ln in lines:
        cp = cell.add_paragraph()
        run = cp.add_run(ln)
        run.font.name = "Consolas"
        run.font.size = Pt(10)
    doc.add_paragraph()


def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    for j, htxt in enumerate(headers):
        c = t.rows[0].cells[j]
        c.text = ""
        run = c.paragraphs[0].add_run(htxt)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(10)
        shade(c, "1F4E5F")
    for row in rows:
        cells = t.add_row().cells
        for j, v in enumerate(row):
            cells[j].text = ""
            run = cells[j].paragraphs[0].add_run(str(v))
            run.font.size = Pt(10)
    if widths:
        for j, w in enumerate(widths):
            for r in t.rows:
                r.cells[j].width = Inches(w)
    doc.add_paragraph()


# ============================= TITLE PAGE =============================
p("THE VARIETAL PLANNING SYSTEM", bold=True, size=26, color=TEAL,
  align=WD_ALIGN_PARAGRAPH.CENTER)
p("A Complete Guide - every file, every formula, every decision",
  size=14, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_paragraph()
p("Gobind Sugar Mills Limited, Aira - Three-Year Varietal Plan 2027-28 to 2029-30",
  align=WD_ALIGN_PARAGRAPH.CENTER)
p("Prepared August 2026  |  Companion to the Varietal Plan Guiding Document (Rev. July 2026)",
  size=10, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)
p("CONFIDENTIAL - for internal mill management, agronomy and cane department use only.",
  bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_page_break()

# ============================= CH 0: TERMS =============================
h(1, "0. Five things to know before anything else")
p("This guide assumes no prior knowledge of sugar milling. These five terms appear "
  "everywhere; everything else is defined where it first appears, and again in the "
  "glossary at the end (Chapter 9).")
bullet("A crop grown from freshly planted cane pieces. The pieces themselves are "
       "called setts (a cut piece of cane with buds that sprout).",
       bold_lead="Plant crop: ")
bullet("After a cane crop is harvested, the stubble left in the ground regrows into "
       "a second crop by itself - free, no re-planting. That regrowth is the ratoon. "
       "It can happen twice (ratoon II). Critically: a ratoon is ALWAYS the same "
       "variety as the original crop - you cannot change variety until the field is "
       "ploughed out and freshly planted.",
       bold_lead="Ratoon: ")
bullet("A cultivated type of sugarcane, like breeds of cattle. Each variety has its "
       "own sugar content, disease resistance, and tolerance of waterlogging. Names "
       "like 'Co 0118' or 'CoLK 14201' identify the breeding institute and year.",
       bold_lead="Variety: ")
bullet("The unit of land area: 100 m x 100 m = 10,000 square metres (about 2.5 "
       "acres, or 4 bigha). The mill's command area - all land whose cane it buys - "
       "is about 57,000 ha.",
       bold_lead="Hectare (ha): ")
bullet("Of every 100 kg of cane crushed, roughly 10.5 kg becomes sugar. That ratio "
       "is the recovery %. Cane juice sweetness is measured as PoL % (sucrose in "
       "juice). Higher-sucrose varieties directly mean more sugar from the same "
       "cane - which is why variety choice is worth money.",
       bold_lead="Recovery / PoL: ")

# ============================= CH 1: GOAL =============================
h(1, "1. What this whole system is for")
h(2, "1.1 The problem")
p("The mill's ~57,000 ha grows a dozen main varieties across ~178,000 individual "
  "plots farmed by ~74,000 growers. Three problems exist today:")
bullet("Two varieties (Co 0118 at 32% and CoLK 94184 at 20%) cover half the area. "
       "If a disease breaks either one, half the mill's cane is at risk at once.",
       bold_lead="Concentration risk. ")
bullet("Co 0238 (9% of area) is reported susceptible to a new, aggressive strain of "
       "red rot - a fungal disease that rots the cane from inside. The plan exits "
       "it completely by 2028-29.",
       bold_lead="Disease. ")
bullet("The highest-sugar variety available (Co 15023, ~18.5% sucrose) occupies "
       "only 1.5% of area. Every hectare moved to it raises mill recovery.",
       bold_lead="Money left on the table. ")
h(2, "1.2 The destination")
p("The guiding document fixes area targets for every variety for three seasons "
  "(chapter 6 shows the full table). By 2029-30: no variety above 25%, Co 0238 gone, "
  "CoLK 14201 at 16% on upland/midland autumn blocks, Co 15023 at 12%, and recovery "
  "up from ~10.5% toward ~11%. On 100 lakh quintals of cane, that improvement is "
  "worth roughly 50,000-80,000 extra quintals of sugar per year.")
h(2, "1.3 Why a plan on paper is not enough")
p("A target says WHERE to go. It does not move a single plot. Every season, each of "
  "~178,000 plots either continues as ratoon (variety locked) or is freshly planted "
  "(variety choosable) - and each fresh planting needs seed of the new variety to "
  "physically exist near that village. The system in this guide is the machinery "
  "that connects the paper plan to those 178,000 individual decisions, and checks "
  "every season whether reality is drifting off the plan.")
h(2, "1.4 The control loop")
p("The system is a loop that runs once per season:")
formula("SURVEY (where are we?)  ->  ENGINE (compare with plan)  ->  "
        "ACTIONS (seed allocation, corrections)  ->  next SURVEY ...")
bullet("The ERP survey records what is actually planted, plot by plot (Chapter 2).")
bullet("Six Excel workbooks A-F hold everything the survey cannot know: the plan "
       "targets, variety science, seed logistics, field knowledge (Chapter 3).")
bullet("The engine (one command: python run_plan.py) reads survey + workbooks and "
       "writes one outcome workbook with pass/fail verdicts (Chapters 4-5).")
bullet("People act on the verdicts; the next survey shows whether it worked.")

# ============================= CH 2: SURVEY =============================
h(1, "2. The raw material: the ERP plot survey")
h(2, "2.1 What one row of the survey means")
p("The 2026-27 survey file has 238,334 rows and 62 columns. ONE ROW IS NOT ONE "
  "FIELD. One row is one grower's SHARE of one field. When brothers or neighbours "
  "farm one field jointly, the field appears once per grower, and the column "
  "pL_PERCENT says what share of it belongs to that grower. The area column "
  "(pl_area) holds only that grower's slice:")
formula("grower's area (ha) = full plot area x pL_PERCENT / 100")
example("a real plot in Chahamalpur village", [
    "The plot's full surveyed area is 0.976 ha. Three growers share it:",
    "  DHARAM PAL   50%  ->  0.976 x 0.50 = 0.488 ha   (his survey row)",
    "  DARBARI      30%  ->  0.976 x 0.30 = 0.293 ha   (his survey row)",
    "  RAM VILASH   20%  ->  0.976 x 0.20 = 0.195 ha   (his survey row)",
    "                                       -----------",
    "  Three rows, one physical field       0.976 ha total",
])
p("Check performed on the whole file: for 96.6% of physical plots the shares add up "
  "to exactly 100%. The exceptions (about 5,500 plots over 100%, 470 under) are "
  "listed as data-entry corrections for the ERP team.")
h(2, "2.2 From rows to physical plots")
p("Because a shared field repeats once per grower, counting rows overcounts fields. "
  "The system groups rows whose four GPS corners are identical - same corners, same "
  "physical field. Result: 238,334 rows collapse into 178,635 physical plots. All "
  "plot-level checks (like 'is this plot on lowland?') work on physical plots; all "
  "grower-level outputs (like seed distribution lists) work on rows.")
h(2, "2.3 Where the GPS area formula comes from")
p("Each row carries four GPS corner points (PL_LAT_1/PL_LON_1 ... PL_LAT_4/"
  "PL_LON_4), tracing the field's boundary. Two steps turn those into an area.")
lead("Step 1 - degrees to metres. ", "GPS positions are angles (degrees of latitude "
     "and longitude), not distances. Converting: one degree of latitude is always "
     "about 111.1 km. One degree of longitude shrinks as you move away from the "
     "equator (the circles of longitude get smaller toward the poles) - at our "
     "latitude of 28 degrees N it is 111.1 x cos(28) = about 98.1 km.")
formula("x (metres east)  = longitude x 111,100 x cos(latitude)")
formula("y (metres north) = latitude  x 111,100")
lead("Step 2 - the Shoelace formula. ", "With the four corners as (x1,y1)...(x4,y4) "
     "in metres, the area of any four-sided shape is:")
formula("Area = 1/2 x | x1(y2-y4) + x2(y3-y1) + x3(y4-y2) + x4(y1-y3) |")
p("It is called the shoelace formula because the multiplication pattern criss-"
  "crosses like a shoelace. The vertical bars mean 'take the positive value'.")
example("shoelace on a simple rectangle", [
    "A rectangular field 100 m x 50 m, corners (0,0) (100,0) (100,50) (0,50):",
    "Area = 1/2 x | 0(0-50) + 100(50-0) + 100(50-0) + 0(0-50) |",
    "     = 1/2 x | 0 + 5000 + 5000 + 0 |  =  5,000 m2  =  0.5 ha   correct.",
])
h(2, "2.4 The second area: tape measurements")
p("The surveyor also walks the field with a tape and records the four side lengths "
  "in metres (PL_DIM_1..4). A four-sided field with sides a, b, c, d has area of at "
  "most (Brahmagupta's formula, with s = half the perimeter):")
formula("s = (a+b+c+d)/2      Area = sqrt( (s-a)(s-b)(s-c)(s-d) )")
example("same rectangle from its sides", [
    "Sides 100, 50, 100, 50  ->  s = (100+50+100+50)/2 = 150",
    "Area = sqrt( (150-100)(150-50)(150-100)(150-50) )",
    "     = sqrt( 50 x 100 x 50 x 100 ) = sqrt(25,000,000) = 5,000 m2 = 0.5 ha",
])
h(2, "2.5 Which area does the ERP actually use? (a finding)")
p("We tested all three area sources against each other across the whole file:")
table(["Comparison", "Agreement within 20%"],
      [["ERP pl_area  vs  area from tape measurements", "92.2% of plots"],
       ["ERP pl_area  vs  area from GPS polygon", "58.8% of plots"]])
p("Conclusion: the ERP's official area comes from the TAPE, not the GPS. The GPS "
  "corners are rougher (a surveyor standing near, not exactly on, each corner). So "
  "the system uses GPS for WHERE a plot is (mapping, land class), and the ERP "
  "pl_area for HOW BIG it is (all hectare totals). Never mix the two roles.")
h(2, "2.6 The land-type limitation that created workbook B")
p("The ERP's LANDTYPE field permits only two values. In 2026-27: UPLAND on 180,240 "
  "rows (76% of area), LOWLAND on 58,094 rows (24%). But the plan document "
  "allocates varieties across THREE classes - Upland, Midland, Lowland - expecting "
  "roughly 20-25% / 35-40% / 38-42% of the command area. Two problems follow:")
bullet("Everything the ERP calls UPLAND actually mixes true upland and midland - "
       "and the plan treats those differently (e.g. CoLK 14201 is safe on midland "
       "ONLY if the field drains within 2-3 days of heavy rain).")
bullet("The ERP flag itself is unstable: the 2025-26 file marked only 1.7% of plots "
       "LOWLAND; 2026-27 marks 24%. The way surveyors use the flag changed, so it "
       "is a hint, not ground truth.")
p("Workbook B (Chapter 3) exists to supply the missing classification.")

# ============================= CH 3: WORKBOOKS =============================
h(1, "3. The six input workbooks - what each contributes")
p("Everything the engine needs that is NOT in the ERP survey lives in six Excel "
  "files in the plan_inputs folder. Yellow cells are to be filled by the team; "
  "grey cells are pre-filled from the survey or the guiding document and only need "
  "verification. Sheet names and column headings must never be renamed - the "
  "engine finds data by those exact names.")

h(2, "3.A  A_Master_Reference.xlsx - who and where")
lead("What it is: ", "the identity backbone - all 7 societies, 102 purchasing "
     "centres and 334 villages with their ERP codes, exported from the survey.")
lead("Why codes matter: ", "names repeat and get misspelled ('BHAUAPUR KHURD' can "
     "be typed five ways) but codes are unique. Every join between files happens "
     "on codes; names are only for humans. A village is identified by the PAIR "
     "(society code, village code) - village 12 in AIRA is a different village "
     "from village 12 in NANPARA.")
lead("Contribution to the decision: ", "none directly - it prevents wrong joins, "
     "which silently corrupt every other number. The team only verifies spellings.")

h(2, "3.B  B_Village_Land_Classification.xlsx - the missing land variable")
lead("What it is: ", "one row per village (all 334 pre-filled with their survey "
     "statistics); the field team fills each village's dominant drainage class.")
p("The classes and the rule for choosing, straight from the plan document:")
table(["Class", "Physical definition", "Rule of thumb after heavy monsoon rain"],
      [["UPLAND", "light/medium soil, free-draining", "no standing water"],
       ["MIDLAND", "loam to clay-loam", "water drains within 1-2 days"],
       ["LOWLAND", "heavy clay, waterlogging-prone", "water stands 5-30+ days"],
       ["MIXED", "village genuinely splits", "explain split in Remarks"]])
lead("The helper column: ", "'ERP Lowland %' shows how the ERP currently records "
     "that village. A village the team calls UPLAND but the ERP records 60% "
     "LOWLAND deserves a second look - in either direction.")
lead("How the engine uses it once filled: ", "every survey plot recorded UPLAND "
     "that sits in a village classified MIDLAND is re-labelled midland. That "
     "unlocks the three-class arithmetic the whole plan is written in: the "
     "upland/midland split of targets, and the 'do not plant CoLK 14201 in fields "
     "holding water beyond 2-3 days' rule.")
lead("Contribution to the decision: ", "THE critical unlock. Until B is filled, "
     "the engine reports it as a data gap and every midland-based target stays "
     "unverifiable. This workbook is the project's current bottleneck.")

h(2, "3.C  C_Variety_Master.xlsx - the science of each variety")
lead("What it is: ", "one row per variety with its agronomic properties. The 12 "
     "plan varieties are pre-filled from the guiding document, including the "
     "mill's field override for CoLK 14201 (upland/midland autumn ONLY - fails "
     "under waterlogging, whatever published literature says). Around 30 further "
     "varieties found in the survey are listed blank for the agronomy team to "
     "classify or mark EXIT.")
p("What each column means and how it is used:")
table(["Column", "Meaning", "Used by the engine for"],
      [["Juice Sucrose %", "sugar concentration in cane juice", "PoL projection (E12)"],
       ["NMC", "millable canes per hectare - countable stalks at harvest; more stalks = more yield", "demo-plot comparison (F)"],
       ["Ratoonability", "how well the variety regrows after harvest", "reference"],
       ["Red Rot (R/MR/S)", "Resistant / Moderately Resistant / Susceptible", "expansion eligibility"],
       ["Waterlogging", "tolerance of standing water", "land-match rules"],
       ["Land Suitability", "U, M, L or combinations - where it may be planted", "allocation rules"],
       ["Planting Season", "SPRING / AUTUMN / BOTH (CoLK 14201: AUTUMN, 18-month crop)", "calendar checks"],
       ["Strategic Direction", "EXPAND / MAINTAIN / REDUCE / EXIT / SEED-MULT / EVALUATE", "trajectory"]])
lead("Contribution to the decision: ", "supplies the numbers inside the PoL "
     "projection and the rules for which variety is allowed on which land.")

h(2, "3.D  D_Plan_Targets.xlsx - the destination and the hard rules")
lead("What it is: ", "the guiding document's Part A table (hectare targets per "
     "variety for Y0-Y3) plus its six hard constraints. Pre-filled exactly; edited "
     "only when management formally revises the plan.")
p("The six constraints and the reason each exists:")
table(["Constraint", "Value", "Why it exists"],
      [["Any variety, any year", "max 40%", "hard monoculture stop - the Co 0238 lesson"],
       ["Any variety by Year 3", "max 25%", "planned diversification level"],
       ["Lowland coverage floor", ">= 28%", "CoLK 94184 + CoS 13231 + Co 98014 must cover the waterlogged belt or that area has no safe variety"],
       ["CoLK 14201 on lowland", "0 ha", "mill field testing: it fails under waterlogging - the plan's single most important risk"],
       ["Red rot in any retained variety", "< 2%", "above it, emergency reduction is triggered"],
       ["Command area", "57,000 ha", "totals must reconcile every year"]])
lead("Contribution to the decision: ", "the yardstick. Every engine verdict is a "
     "comparison of survey reality against this workbook.")

h(2, "3.E  E_Seed_and_Transition.xlsx - how fast change can physically happen")
lead("What it is: ", "the physics of varietal change. Sugarcane is propagated by "
     "planting cane pieces, so expanding a variety requires physically multiplying "
     "its cane, season by season. Three sheets:")
bullet("Parameters - the five system-wide numbers (each explained in Chapter 4 "
       "where it is used): seed_consumption_pct (13), sett_multiplication_ratio "
       "(5.5), budchip_multiplication_ratio (17.5), ratoon2_carry_pct (3.6, "
       "derived from the survey itself), others_sucrose_pct (16.8).")
bullet("SeedPlots - per expanding variety: what fraction of its current area is "
       "set aside as seed plots (cane grown to be cut into seed, not crushed), "
       "and by which method - SETT (conventional: 1 ha of seed plot plants 5-6 ha "
       "next season) or BUDCHIP (nursery technique: 1 ha plants 15-20 ha).")
bullet("Procurement - external seed committed from research institutions (IISR "
       "Lucknow, UPCSR Shahjahanpur, SBI Karnal), in hectare-equivalents, with an "
       "MoU status column the cane department keeps current.")
lead("Contribution to the decision: ", "feeds the seed feasibility check (E11) - "
     "the difference between a target that is wished for and one that is possible.")

h(2, "3.F  F_KPI_Actuals.xlsx - the scoreboard")
lead("What it is: ", "the actual results, filled progressively each season; the "
     "loop is not closed until these numbers exist.")
bullet("MillLab_Monthly - the lab's monthly PoL % and recovery % during crushing "
       "(Oct-Apr rows pre-created for all four seasons). Verifies whether the "
       "varietal shift is actually lifting recovery.")
bullet("DemoPlot_NMC - harvest stalk counts at the demonstration plots. The plan's "
       "specific test: CoLK 14201's NMC must beat the Co 0118 baseline by at "
       "least 5% on upland/midland.")
bullet("DiseaseSurvey - the April and August pathology rounds (village x variety "
       "counts). Feeds the 2% emergency threshold with proper survey data rather "
       "than the ERP's incidental disease column.")
lead("Contribution to the decision: ", "turns the plan's promises into measured "
     "facts, and triggers the plan's own emergency rules.")

# ============================= CH 4: ENGINE =============================
h(1, "4. The engine - every check, every formula")
p("Running 'python run_plan.py' executes the checks below in order and writes "
  "plan_outputs/Varietal_Plan_Outcome.xlsx. Nothing is hidden: every sheet in the "
  "outcome corresponds to a numbered check here, with the exact formula. The "
  "engine never invents a missing value - anything absent becomes a line in the "
  "Data_Gaps sheet instead of a silent guess.")

h(2, "E1. Name normalisation (the invisible but vital step)")
p("The ERP writes variety names inconsistently ('COLK  9709' with two spaces, "
  "'COLK 9709' with one). Before any comparison, every name has its spaces "
  "removed and is uppercased: 'CoLK 14201' -> 'COLK14201'. Without this, the same "
  "variety would be counted as two and every total would be wrong.")

h(2, "E2. Actual composition (sheet Baseline_Y0)")
formula("area of variety V = sum of pl_area over all rows with variety V")
formula("share of V (%) = area of V / total area x 100")
p("Current result: total 56,491 ha. Largest: Co 0118 = 18,029 ha = 31.9%. Each "
  "variety's row also shows: its area recorded on LOWLAND, its area planted as "
  "AUTUMN crop, and its red rot rate - the three facts the plan cares most about.")
p("The sheet also proves the plan document's own base table was honest: every "
  "variety matches the survey within ~30 ha (except one - see Chapter 5).")

h(2, "E3. Cap checks (sheet Targets_vs_Actual)")
formula("Year-3 share of V = target area of V in Y3 / 57,000 x 100")
p("Verdict per variety: PASS if <= 25%, WARN if 25-40%, FAIL if > 40%. Applied to "
  "today's actuals too: current maximum is 31.9% (Co 0118) - under the hard cap, "
  "above the Y3 target, exactly as the plan intends to fix by reduction.")

h(2, "E4. Lowland coverage floor (Summary flag)")
formula("lowland coverage % = (area of COLK 94184 + COS 13231 + CO 98014) / total x 100")
p("These three are the only varieties safe on waterlogged land. If their combined "
  "share falls below 28%, part of the lowland belt has no safe variety to plant. "
  "Current: (11,322 + 2,062 + 6,495) / 56,491 = 35.2% -> PASS.")

h(2, "E5. CoLK 14201 lowland exposure (Summary flag + Compliance sheet)")
formula("exposure = sum of pl_area where variety = COLK14201 AND land type = LOWLAND")
p("Target is ZERO (constraint D). Current: 370.5 ha across 158 villages - a FAIL. "
  "The Compliance sheet lists every affected village with its hectares, sorted "
  "worst-first (Pairuwa 26.1 ha, Sujai Kunda 22.0, Sissiya 19.6, ...), so the "
  "cane department can hand each supervisor a named list. Important nuance: 80% "
  "of those rows are freshly PLANTED crop - this is happening now, not a leftover.")

h(2, "E6. Red rot rate per variety (Summary flag)")
formula("red rot % of V = rows of V with DISEASES = REDROT / all rows of V x 100")
p("Threshold: 2% (constraint D). Current worst among varieties with 500+ plots: "
  "CO 05011 at 1.10% -> all PASS. Notably Co 0238 - the variety being exited FOR "
  "red rot - shows only 0.63% in the survey. Chapter 5 discusses what that means.")

h(2, "E7. The replant budget (sheet Replant_Budget) - the plan's reality check")
p("The single most important idea in the whole engine. A variety target can only "
  "be reached through fields that are FREE TO RE-PLANT - and a field is only free "
  "when its plant-ratoon cycle ends. The cycle: plant crop (year 1) -> ratoon "
  "(year 2) -> usually plough-out, occasionally ratoon II (year 3) -> plough-out.")
bullet("Fields currently PLANT or AUTUMN crop: next season they become ratoon of "
       "the SAME variety. Locked. That is 33,178 ha today.")
bullet("Fields currently RATOON: their cycle ends this year, EXCEPT the small "
       "share kept for a second ratoon. Mostly free.")
bullet("Fields currently RATOON II: cycle definitely ends. All free (843 ha).")
p("The share kept for a second ratoon is not guessed - it is measured from the "
  "survey itself:")
formula("carry = ratoon II area / (ratoon area + ratoon II area) "
        "= 843 / 23,312 = 3.6%")
formula("replant budget = ratoon area x (1 - 0.036) + ratoon II area "
        "= 21,660 + 843 = 22,503 ha")
p("Against that budget, the plan's Year-1 demands:")
formula("net increases required = sum over varieties of max(0, Y1 target - current area)")
p("= 8,965 ha (CoLK 14201 +1,936, Co 15023 +2,625, CoS 13231 +1,938, and the "
  "smaller programmes). Verdict: 8,965 <= 22,503 -> FEASIBLE. The same sheet also "
  "shows the exits (Co 0238 and Others shrinking, 8,305 ha) which free area "
  "within that budget.")
example("why 'locked' matters - a single plot", [
    "A plot planted with Co 0238 in spring 2026 is PLANT crop in the 2026-27",
    "survey. In 2027-28 it will be Co 0238 RATOON - the mill cannot change it.",
    "Its first chance to become CoS 17231 is the 2028-29 planting. This is why",
    "the plan needs THREE years, and why exits are 'no fresh planting + no new",
    "ratoon' rather than instant removal.",
])

h(2, "E8. Seed feasibility (sheet Seed_Plan)")
p("Expanding a variety needs physical seed cane. For each expanding variety:")
formula("own capacity = base area x seed plot fraction x multiplication ratio")
formula("total capacity = own capacity + external procurement (workbook E)")
formula("PASS if total capacity >= (Y1 target - current area)")
example("CoS 17231 (Bismil) - a PASS", [
    "base 128 ha x 40% seed plots = 51 ha of seed plots",
    "x 17.5 (bud chip ratio)      = 895 ha plantable next season",
    "+ 175 ha from UPCSR          = 1,070 ha total capacity",
    "needed: 500 - 128 = 372 ha   ->  1,070 >= 372  PASS",
])
example("CoS 19231 (Lahidi) - a FAIL the document missed", [
    "The guiding document estimated its base at ~50 ha. The survey found",
    "only 5.15 ha actually planted.",
    "own: 5.15 x 100% x 5.5  = 28 ha",
    "+ 75 ha UPCSR breeder seed = 103 ha total capacity",
    "needed: 200 - 5 = 195 ha  ->  103 < 195  FAIL",
    "Options: bud-chip it (5.15 x 17.5 = 90, still short), procure more,",
    "or lower the Year-1 target. The engine caught this automatically.",
])
p("Current verdicts: CoLK 14201, Co 15023, CoS 17231, CoS 18231 PASS; "
  "CoLK 16202 FAIL (short ~243 ha) and CoS 19231 FAIL (short ~92 ha).")

h(2, "E9. Seed consumption context (parameter, not yet a check)")
p("12-14% of all planted area is consumed every year just producing seed - about "
  "7,300 ha of the command area works as the seed engine. The "
  "seed_consumption_pct parameter (13) carries this for future versions that "
  "will net seed area out of crushing forecasts.")

h(2, "E10. PoL projection (sheet PoL_Projection)")
p("A weighted average - each variety contributes its sweetness in proportion to "
  "its area:")
formula("blended PoL = sum(area of V x sucrose of V) / sum(area of V)")
p("Sucrose values come from workbook C; unclassified 'Others' use the "
  "others_sucrose_pct parameter (16.8). Results: Y0 17.48 -> Y1 17.50 -> Y2 17.53 "
  "-> Y3 17.56. Read the DELTA (+0.08 over three years from composition alone), "
  "not the level: the document's baseline of ~17.1 additionally discounts "
  "disease-damaged Co 0238 cane, which this formula does not model. Both agree on "
  "the direction and the destination band (~17.5-17.7).")
example("weighted average in miniature", [
    "Imagine only two varieties: 60 ha at 17.0% and 40 ha at 18.5%:",
    "blended = (60 x 17.0 + 40 x 18.5) / 100 = (1020 + 740) / 100 = 17.6%",
    "Shift 20 ha from the first to the second:",
    "blended = (40 x 17.0 + 60 x 18.5) / 100 = 17.9%  - same land, more sugar.",
])

h(2, "E11. Village land classes from workbook B (activates when B is filled)")
p("Once the field team fills B: plots recorded UPLAND in a village classified "
  "MIDLAND are re-labelled MIDLAND. The engine then reports the true three-class "
  "split of the command area, verifies the document's assumed 20-25 / 35-40 / "
  "38-42 shares, and can enforce 'CoLK 14201 only where drainage <= 2 days'. "
  "Until then, the Data_Gaps sheet reports '0 of 334 villages classified'.")

h(2, "E12. Data gaps (sheet Data_Gaps)")
p("Honesty about what the numbers stand on. Currently listed: no MIDLAND class "
  "(workbook B unfilled); soil type blank on 39% of rows; usable planting date on "
  "only 61.5%; 1,311 rows with broken GPS; mill lab sheet empty; CoS 19231 base "
  "far below the document's estimate. A verdict built on a gap is flagged, never "
  "silently computed.")

# ============================= CH 5: FINDINGS =============================
h(1, "5. What the first run found (August 2026)")
table(["Check", "Result", "Verdict"],
      [["CoLK 14201 on lowland = 0 ha", "370.5 ha in 158 villages", "FAIL"],
       ["Lowland coverage >= 28%", "35.2%", "PASS"],
       ["Red rot < 2% every variety", "worst 1.10%", "PASS"],
       ["No variety > 40%", "max 31.9% (Co 0118)", "PASS"],
       ["Y1 expansion fits replant budget", "8,965 of 22,503 ha", "PASS"],
       ["Seed capacity covers Y1 targets", "CoLK 16202 & CoS 19231 short", "FAIL"]])
h(2, "5.1 The three findings that need management attention")
lead("1 - The plan's top risk is already real. ", "The document states CoLK "
     "14201's base is 'entirely in upland/midland'. The survey says 89.6% is - "
     "and 370.5 ha (10.4%) sits on recorded lowland, mostly as FRESH planting. "
     "Before expanding the variety 2.5x, the 158-village list in the Compliance "
     "sheet needs ground verification: either the fields are actually fine (and "
     "the ERP flag is wrong) or seed allocation is leaking into the wrong blocks.")
lead("2 - Two seed programmes do not add up. ", "CoLK 16202 is ~243 ha short of "
     "its Year-1 target and CoS 19231 ~92 ha short - the latter because its real "
     "base is 5 ha, not the ~50 ha the document assumed. Fix by more procurement, "
     "bud-chip multiplication, or lowering the Year-1 targets - but decide before "
     "the autumn 2027 planting, not after.")
lead("3 - The survey does not show a red rot crisis. ", "Co 0238's recorded rate "
     "is 0.63% - sixth-worst, below the plan's own 2% trigger. This does NOT "
     "prove the plan wrong: the ERP disease column is a surveyor's glance, not a "
     "pathology test, and the regional Tarai-belt evidence may simply not have "
     "arrived in Aira yet. But the mill is about to uproot 4,800 ha on the "
     "strength of that threat - the April/August pathology rounds (workbook F) "
     "should confirm it with proper sampling first.")
h(2, "5.2 A quieter but strategic gap: autumn planting")
p("The plan's flagship expansion (CoLK 14201 to 9,000 ha) is specifically an "
  "AUTUMN, 18-month crop. Today only 376 ha of it (8.9% of its area) is autumn-"
  "planted. Reaching the target means a ~24x scale-up of autumn planting of this "
  "variety - a bigger operational change than the hectare number suggests, "
  "affecting seed timing, planting calendars and the crushing schedule.")

# ============================= CH 6: TARGETS TABLE =============================
h(1, "6. The destination in numbers (from workbook D)")
table(["Variety", "Y0 2026-27", "Y1 2027-28", "Y2 2028-29", "Y3 2029-30", "Direction"],
      [["Co 0118", "18,033", "17,000", "15,500", "14,000", "reduce to 24.6%"],
       ["CoLK 94184", "11,338", "11,000", "9,500", "7,500", "reduce, keep lowland anchor"],
       ["Co 98014", "6,499", "6,000", "5,500", "5,000", "slight reduction"],
       ["Co 0238", "4,815", "2,000", "0", "0", "EXIT by 2028-29"],
       ["CoLK 14201", "3,565", "5,500", "8,000", "9,000", "major expansion (autumn, U/M)"],
       ["CoS 13231", "2,062", "4,000", "5,000", "5,500", "lowland expansion"],
       ["CoS 13235", "1,691", "2,500", "3,000", "2,500", "moderate"],
       ["Co 15023", "847", "3,500", "5,500", "7,000", "major expansion (quality)"],
       ["CoLK 16202", "267", "1,200", "2,500", "3,000", "seed multiplication"],
       ["CoS 17231", "128", "500", "1,500", "2,000", "red-rot-resistant successor"],
       ["CoS 18231", "93", "250", "600", "700", "evaluation"],
       ["CoS 19231", "50*", "200", "400", "800", "seed mult. (*survey found 5 ha)"],
       ["Others", "7,812", "3,500", "0", "0", "EXIT by 2028-29"],
       ["TOTAL", "57,000", "57,000", "57,000", "57,000", ""]],
      widths=[1.1, 0.9, 0.9, 0.9, 0.9, 1.9])

# ============================= CH 7: ANNUAL CYCLE =============================
h(1, "7. The annual operating cycle - who does what, when")
table(["When", "What happens", "System action"],
      [["June-July", "ERP plot survey completes", "Re-extract survey; run engine; new outcome workbook"],
       ["August", "Mid-season disease round (pathology team)", "Fill F:DiseaseSurvey; engine checks 2% trigger"],
       ["October", "Post-survey review (management)", "Compare actual vs plan in Targets_vs_Actual; agree corrections; revise D only if formal"],
       ["October-April", "Crushing season", "Mill lab fills F:MillLab_Monthly; recovery tracking"],
       ["Autumn (Oct-Nov)", "AUTUMN planting window (CoLK 14201)", "Seed allocation per village - upland/midland blocks only"],
       ["April", "Pre-planting: seed availability check; supervisor briefing", "Seed_Plan sheet drives procurement top-ups; Compliance list briefed to field staff"],
       ["Spring", "Main planting", "Fresh plantings follow the allocation; no new Co 0238"],
       ["Year-end", "Plan revision if varieties over/under-perform", "Update C (attributes) and D (targets); re-run"]],
      widths=[1.0, 2.6, 2.9])
p("One command drives every 'system action': python run_plan.py. It re-reads "
  "whatever changed - survey or workbooks - and rewrites the outcome workbook.")

# ============================= CH 8: NOT BUILT YET =============================
h(1, "8. What the system does not do yet (planned next steps)")
bullet("Workbook B is unfilled - the declared bottleneck. Until the 334 villages "
       "are classified, midland arithmetic is impossible.",
       bold_lead="Village classification: ")
bullet("The engine currently JUDGES the plan (feasible? compliant?). The natural "
       "end state is that it also GENERATES the village-by-village planting "
       "allocation for the coming season - 'this village: X ha CoLK 14201 from "
       "these seed plots' - which becomes possible the moment B is filled.",
       bold_lead="Allocation generator: ")
bullet("The interactive plot map and the plan engine share data but not screens; "
       "a compliance layer on the map (e.g. the 370 ha painted red) is a "
       "straightforward addition.",
       bold_lead="Map integration: ")
bullet("Recovery projections use juice sucrose as the lever; a full CCS model "
       "(fibre, purity, extraction) would need mill lab inputs from F over at "
       "least one full season.",
       bold_lead="CCS modelling: ")

# ============================= CH 9: GLOSSARY =============================
h(1, "9. Glossary")
terms = [
    ("AICRP", "All India Co-ordinated Research Project - multi-location variety trials whose data backs official variety claims."),
    ("Autumn planting", "Planting in Oct-Nov. The crop stands ~18 months (vs ~12 for spring), growing bigger; CoLK 14201 is managed this way."),
    ("Bud chip", "Nursery technique: single buds are cut from cane and raised as seedlings; multiplies seed 15-20x per season vs 5-6x for setts."),
    ("CCS", "Commercial Cane Sugar - the sugar actually recoverable from cane, combining sucrose, purity and fibre."),
    ("Command area", "All land whose cane the mill is entitled to buy: ~57,000 ha here."),
    ("Crushing season", "October-April, when the mill runs and buys cane."),
    ("Drainage class", "How fast a field sheds standing water; decides which varieties survive there (see workbook B)."),
    ("ERP", "The mill's business software; source of the plot survey."),
    ("Grower", "A registered farmer supplying cane; identified by society + village + grower code."),
    ("Hectare (ha)", "100 m x 100 m = 10,000 m2 = about 2.47 acres."),
    ("Lakh / quintal", "1 lakh = 100,000. 1 quintal = 100 kg. '100 lakh quintals' = 1 million tonnes of cane."),
    ("MoU", "Memorandum of Understanding - the seed supply agreement signed with a research institute."),
    ("NMC", "Number of Millable Canes per hectare - stalks thick enough to crush, counted at harvest. More stalks = more yield."),
    ("Pathotype", "A strain of a disease organism. A variety resistant to old strains can be susceptible to a new one - the Co 0238 story."),
    ("Plant crop", "First-year crop grown from planted setts."),
    ("PoL %", "Sucrose concentration measured in juice (polarimeter reading) - the standard sweetness measure."),
    ("Ratoon / Ratoon II", "Regrowth crop from stubble after harvest; second regrowth = ratoon II. Same variety, zero planting cost, somewhat lower yield."),
    ("Recovery %", "Sugar produced / cane crushed x 100. The mill's single most-watched number."),
    ("Red rot", "Fungal disease (Colletotrichum falcatum) that rots cane internally; spreads through infected seed and soil."),
    ("Sett", "A cut piece of cane with 2-3 buds, planted to grow a new crop; also the unit of conventional seed multiplication."),
    ("Sett multiplication ratio", "How many hectares one hectare of seed plot can plant next season: 5-6 conventionally."),
    ("Seed plot", "A field grown to produce planting material, not crushing cane; inspected and disease-managed to keep seed pure."),
    ("Shoelace formula", "The standard formula for the area of any polygon from its corner coordinates (Chapter 2.3)."),
    ("Smut / RSD / wilt", "Other cane diseases recorded in the survey's disease column."),
    ("Society", "Cane growers' co-operative; the mill's administrative unit above villages (7 here)."),
    ("Sucrose", "The sugar molecule itself; what the mill crystallises and sells."),
    ("UPCSR / IISR / SBI", "The research institutes releasing varieties: UP Council of Sugarcane Research (Shahjahanpur), Indian Institute of Sugarcane Research (Lucknow), Sugarcane Breeding Institute (Coimbatore/Karnal)."),
]
table(["Term", "Meaning"], terms, widths=[1.5, 5.0])

# ============================= CH 10: FILES =============================
h(1, "10. Appendix - files and commands")
p("Folder layout (project root):")
table(["Path", "What it is"],
      [["plan_inputs/A_...  to  F_...xlsx", "the six input workbooks (this guide, Chapter 3)"],
       ["plan_outputs/Varietal_Plan_Outcome.xlsx", "the engine's output - regenerated on every run"],
       ["Plot Wise Survey Report 2026-2027 1.xlsx", "the ERP survey (source of all actuals)"],
       ["Varietal Plan Guiding Document.docx", "the strategy this system executes"],
       ["build/  +  run_plan.py", "the engine code"],
       ["web/  +  serve.py", "the interactive plot map (separate guide in README)"]],
      widths=[3.0, 3.5])
p("The three commands:")
table(["Command", "When"],
      [["python build/extract_2627.py", "once, whenever a new survey file arrives"],
       ["python run_plan.py", "any time an input workbook or the survey changed - rewrites the outcome"],
       ["python build/make_templates.py", "only to regenerate BLANK templates - it OVERWRITES filled workbooks, back them up first"]],
      widths=[2.6, 3.9])
p("Rules that keep the system trustworthy:", bold=True)
bullet("Never rename sheets or column headings in the six workbooks.")
bullet("Never edit grey (pre-filled) cells except to correct a verified error.")
bullet("Keep one master copy of each workbook; merge team edits into it rather "
       "than circulating parallel versions.")
bullet("Treat the outcome workbook as read-only - it is overwritten on every run; "
       "copy it out if a dated snapshot is needed for a review meeting.")

doc.save(OUT)
print("saved:", OUT)
