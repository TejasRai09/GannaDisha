# -*- coding: utf-8 -*-
"""Generate 'Varietal Planning System - Steps 1 to 3 - Explained.docx'.

Everything settled about the first three screens: what each is for, why it
exists, every calculation it performs, and what is still missing. Written for a
reader at about class 10 level - no prior knowledge of sugar milling or
computers assumed.

Every figure is from the 2026-27 plot survey, so each worked example can be
checked on a calculator against the mill's own data.

    python build/make_steps_1_3_doc.py
"""

import os

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Varietal Planning System - Steps 1 to 3 - Explained.docx")

GREEN = RGBColor(0x05, 0x96, 0x69)
GREY = RGBColor(0x60, 0x60, 0x60)
RED = RGBColor(0xB9, 0x1C, 0x1C)
AMBER = RGBColor(0xB4, 0x53, 0x09)

doc = Document()
doc.styles["Normal"].font.name = "Calibri"
doc.styles["Normal"].font.size = Pt(11)


def h(level, text):
    doc.add_heading(text, level=level)


def p(text, bold=False, italic=False, size=None, color=None, align=None):
    par = doc.add_paragraph()
    r = par.add_run(text)
    r.bold, r.italic = bold, italic
    if size:
        r.font.size = Pt(size)
    if color:
        r.font.color.rgb = color
    if align:
        par.alignment = align
    return par


def lead(b, rest):
    par = doc.add_paragraph()
    par.add_run(b).bold = True
    par.add_run(rest)


def bullet(text, b=None):
    par = doc.add_paragraph(style="List Bullet")
    if b:
        par.add_run(b).bold = True
    par.add_run(text)


def num(text, b=None):
    par = doc.add_paragraph(style="List Number")
    if b:
        par.add_run(b).bold = True
    par.add_run(text)


def formula(text):
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = par.add_run(text)
    r.font.name = "Consolas"
    r.font.size = Pt(10.5)
    r.font.color.rgb = GREEN
    r.bold = True


def shade(cell, hexc):
    tcPr = cell._tc.get_or_add_tcPr()
    e = OxmlElement("w:shd")
    e.set(qn("w:val"), "clear")
    e.set(qn("w:fill"), hexc)
    tcPr.append(e)


def box(title, lines, colour="ECFDF5"):
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    c = t.rows[0].cells[0]
    shade(c, colour)
    c.paragraphs[0].add_run(title).bold = True
    for ln in lines:
        cp = c.add_paragraph()
        r = cp.add_run(ln)
        r.font.name = "Consolas"
        r.font.size = Pt(10)
    doc.add_paragraph()


def note(title, lines, colour="FEF3C7"):
    """Prose callout - for warnings and caveats rather than figures."""
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    c = t.rows[0].cells[0]
    shade(c, colour)
    c.paragraphs[0].add_run(title).bold = True
    for ln in lines:
        cp = c.add_paragraph()
        cp.add_run(ln).font.size = Pt(10)
    doc.add_paragraph()


def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    for j, x in enumerate(headers):
        c = t.rows[0].cells[j]
        c.text = ""
        r = c.paragraphs[0].add_run(x)
        r.bold = True
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        r.font.size = Pt(10)
        shade(c, "059669")
    for row in rows:
        cells = t.add_row().cells
        for j, v in enumerate(row):
            cells[j].text = ""
            rr = cells[j].paragraphs[0].add_run(str(v))
            rr.font.size = Pt(10)
    if widths:
        for j, w in enumerate(widths):
            for r in t.rows:
                r.cells[j].width = Inches(w)
    doc.add_paragraph()


def rule():
    doc.add_paragraph("_" * 74).alignment = WD_ALIGN_PARAGRAPH.CENTER


# ============================== TITLE ==============================
p("VARIETAL PLANNING SYSTEM", bold=True, size=26, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER)
p("Steps 1 to 3 - what each screen does, and why", size=14, color=GREY,
  align=WD_ALIGN_PARAGRAPH.CENTER)
p("Gobind Sugar Mill, Aira - Lakhimpur Kheri, Uttar Pradesh", size=11, color=GREY,
  align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_paragraph()

p("This document explains the first three screens of the planning app in plain "
  "language. You do not need to know anything about computers to read it, and "
  "you do not need to know anything about sugarcane either - both are explained "
  "as we go.")
p("Every number in this document comes from the mill's own 2026-27 plot survey. "
  "Nothing is invented. If a calculation is shown, you can check it on a "
  "calculator.")

box("THE THREE SCREENS IN ONE LINE EACH", [
    "Step 1  BASELINE DATA     - measures the land.      What IS there?",
    "Step 2  VARIETY REGISTRY  - describes the varieties. What are they LIKE?",
    "Step 3  AGRONOMIC RULES   - sets the rules.          What are we ALLOWED to do?",
])

p("That order matters. You cannot describe a variety before you know how much of "
  "it exists. You cannot set a rule about concentration before you know what is "
  "concentrated. Each screen depends on the one before it.")

doc.add_page_break()

# ============================== BACKGROUND ==============================
h(1, "Before we start: four ideas you need")

h(2, "1. A ratoon is a second harvest from the same roots")
p("When you plant sugarcane, you do not plant seed like wheat. You cut a mature "
  "cane into pieces, and each piece has a bud on it. Those pieces are called "
  "setts. You bury them and they sprout.")
p("When you harvest that crop, you do not dig up the roots. You cut the cane at "
  "ground level and leave the stubble in the soil. It grows again by itself. "
  "That second growth is called a RATOON.")
box("THE LIFE OF ONE FIELD", [
    "Year 1   PLANT CROP   you planted setts",
    "Year 2   RATOON I     it grew back on its own, no planting, no seed cost",
    "Year 3   RATOON II    it grew back again (rare at Gobind - see Step 3)",
    "         then you plough it out and plant something new",
])
p("Two things follow from this, and they drive the entire plan:")
bullet("A ratoon is ALWAYS the same variety as the crop before it. The roots are "
       "the same plant. You cannot change your mind.", "The variety is locked. ")
bullet("Each ratoon yields less than the one before, because the stubble weakens "
       "and gaps open in the rows. Eventually it stops paying, and you replant.",
       "It gets weaker. ")

h(2, "2. Only some of the land is free each year")
p("Because a ratoon field is locked to its variety, you cannot change what grows "
  "there. So in any given year, only part of the mill's area is actually "
  "available for a new decision.")
p("This is the single most important idea in the whole system. If the mill has "
  "56,490 hectares, you are not planning 56,490 hectares. You are planning only "
  "the part that is free.")

h(2, "3. Autumn and Spring are two different planting windows")
table(["", "Spring planting", "Autumn planting"],
      [["When", "February - March", "October - November"],
       ["How long in the field", "About 12 months", "About 18 months"],
       ["Setts used", "Double bud", "Single bud"],
       ["Effect", "One season in the field", "Holds the field through two seasons"]],
      [1.6, 2.2, 2.2])
p("An 18-month autumn crop occupies its field far longer than a 12-month spring "
  "crop. That changes how long the field is locked, which changes how much land "
  "is free next year.")

h(2, "4. Seed multiplies - it does not appear")
p("You cannot buy enough seed of a new variety to plant thousands of hectares. "
  "Breeding institutes sell small quantities. So the mill grows its own seed: "
  "plant a small plot, harvest it, and use that cane as seed for a bigger plot "
  "next year.")
formula("1 hectare of seed plot  ->  about 8 hectares next year")
p("This is why a new variety takes years to arrive, no matter how good it is. "
  "Step 3 explains the arithmetic.")

doc.add_page_break()

# ============================== STEP 1 ==============================
p("STEP 1", bold=True, size=20, color=GREEN)
h(1, "Baseline Data - measuring the land")

h(2, "What this screen is for")
p("Every plan needs a starting point. Before you can decide what to grow next "
  "year, you must know exactly what is growing now, where it is, and how much of "
  "it there is.")
p("Step 1 does one job: it reads the mill's plot survey and turns 238,334 rows of "
  "raw data into a handful of numbers a person can actually think about.")

h(2, "Where the data comes from")
p("Every year, between May and June, surveyors walk the mill's command area. For "
  "each plot they record who farms it, how big it is, what variety is planted, "
  "whether it is plant crop or ratoon, what kind of land it is, and the GPS "
  "corners of the field.")
p("97.6% of all survey records were entered in May and June. That is the survey "
  "window, and it matters: the plan has to be made after the survey is in, and "
  "before the autumn planting season starts in October.")

box("THE SURVEY FILE", [
    "Format      Excel workbook (.xlsx), about 78 MB",
    "Rows        238,334",
    "Columns     62",
    "Coverage    the whole Gobind command area",
])

h(2, "The first calculation: rows are not fields")
p("A single physical field can appear as several rows. If three brothers share "
  "one plot, the survey records three rows - one per grower - each with the same "
  "GPS corners.")
p("So the app groups rows by their four GPS corner points. Rows with identical "
  "corners are one field.")
formula("238,334 survey rows  ->  178,635 physical fields")
p("If we had counted rows as fields, every field-based number in the plan would "
  "be wrong by about a third.")

h(2, "What the screen reports")
table(["What", "Figure", "What it means"],
      [["Surveyed area", "56,490.6 ha", "Total land growing cane for this mill"],
       ["Physical fields", "178,635", "Separate pieces of land"],
       ["Growers", "74,283", "Farmers supplying the mill"],
       ["Villages", "334", "Villages in the command area"],
       ["Societies", "7", "Cane societies"],
       ["Varieties", "86", "Different cane varieties found"]],
      [1.5, 1.3, 3.2])

h(2, "The most important calculation: locked versus free")
p("This is the number the whole plan rests on. The survey records each field's "
  "crop stage. From that we can work out which land is available for a new "
  "decision, and which is not.")

table(["Crop stage", "Area", "Share", "Status"],
      [["PLANT", "29,374.8 ha", "52.0%", "Locked - becomes ratoon next year"],
       ["AUTUMN", "3,803.4 ha", "6.7%", "Locked - becomes ratoon next year"],
       ["RATOON", "22,469.2 ha", "39.8%", "Free - finishing its cycle"],
       ["RATOON II", "843.2 ha", "1.5%", "Free - finishing its cycle"]],
      [1.4, 1.4, 0.9, 2.5])

p("Group those together and you get the two numbers that matter:")
box("THE REPLANT BUDGET", [
    "LOCKED   = PLANT + AUTUMN      = 33,178 ha   (58.7%)",
    "FREE     = RATOON + RATOON II  = 23,312 ha   (41.3%)",
    "",
    "Only 23,312 ha is actually available for a new varietal decision.",
])
p("Read that last line again. The mill has 56,490 hectares, but next year's plan "
  "can only touch 23,312 of them. Everything else is already committed to a "
  "variety that was chosen last year and cannot be changed.")

h(2, "Land type: upland and lowland")
table(["Land type", "Area", "Share"],
      [["Upland (well drained)", "43,051.4 ha", "76.2%"],
       ["Lowland (waterlogs)", "13,439.2 ha", "23.8%"]],
      [2.4, 1.6, 1.2])
p("This split matters because not every variety tolerates waterlogging. A "
  "variety that drowns in lowland cannot be planted there, however good it is "
  "elsewhere. Step 3 sets a minimum share of lowland-capable varieties.")

h(2, "Variety concentration")
p("Of 86 varieties found, a handful dominate completely:")
table(["Rank", "Variety", "Area", "Share", "Running total"],
      [["1", "CO 0118", "18,029.0 ha", "31.9%", "31.9%"],
       ["2", "COLK 94184", "11,321.9 ha", "20.0%", "51.9%"],
       ["3", "CO 98014", "6,495.3 ha", "11.5%", "63.4%"],
       ["4", "CO 0238", "4,812.6 ha", "8.5%", "72.0%"],
       ["5", "COLK 14201", "3,564.5 ha", "6.3%", "78.3%"]],
      [0.7, 1.4, 1.3, 0.9, 1.3])
p("The top 5 varieties cover 78.3% of the area. The top 12 cover 95.3%. The "
  "remaining 74 varieties share less than 5% between them.")
note("WHY CONCENTRATION IS A RISK", [
    "If nearly a third of the mill's cane is one variety, and that variety is hit "
    "by a disease such as red rot, roughly a third of the crop is at risk at once. "
    "This is why Step 3 has a concentration cap. It is not a theoretical worry - "
    "it is the reason varietal planning exists as a discipline.",
])

h(2, "Data quality flags")
p("The app does not pretend the data is perfect. It reports what it finds:")
table(["Flag", "What it means for the plan"],
      [["Soil type unassigned on 39% of records",
        "Land-suitability checks fall back to land type alone"],
       ["Planting date usable on only 62% of records",
        "Autumn vs spring compliance cannot be verified for the rest"],
       ["1,311 rows dropped - unusable GPS",
        "A corner was zero or outside the district, so the field cannot be located"],
       ["Irrigation column unreliable",
        "It is tracking crop type, not irrigation - a known ERP defect"],
       ["Disease recorded as NONE on 98.8% of records",
        "This is a surveyor's eye check, not a lab test. Treat disease as under-reported"]],
      [2.6, 3.6])
p("These are honest warnings, not errors in the app. A plan built on data with "
  "known gaps is still useful - but only if you know where the gaps are.")

doc.add_page_break()

# ============================== STEP 2 ==============================
p("STEP 2", bold=True, size=20, color=GREEN)
h(1, "Variety Registry - describing the varieties")

h(2, "What this screen is for")
p("Step 1 measured the land. It can tell you that CO 0118 covers 18,029 hectares. "
  "It cannot tell you whether CO 0118 is any good.")
p("The survey knows nothing about how a variety behaves - how much sugar it "
  "carries, whether it survives waterlogging, whether it resists red rot, how "
  "much seed the mill holds. None of that is in the ERP, because nobody measures "
  "it plot by plot. It lives in the heads of the cane department.")

box("THE DIFFERENCE BETWEEN STEP 1 AND STEP 2", [
    "Step 1 is MEASUREMENT.  The survey counted it. Nobody can argue with it.",
    "Step 2 is JUDGEMENT.    Somebody who knows the crop has to say so.",
])

h(2, "The governing rule")
p("No variety may leave Step 2 unclassified.", bold=True)
p("If the app does not know whether a variety belongs on upland or lowland, it "
  "cannot decide which free field to put it on. An unclassified variety is not "
  "a small gap - it is a variety the planner cannot use at all.")
p("There is a companion rule that protects the mill from over-confidence:")
p("You cannot expand what you have not characterised.", bold=True)
p("A variety missing its essential facts is capped at trial scale. It can exist, "
  "it can be multiplied on mill land, but the allocator will not hand it real "
  "farmer fields until somebody says where it belongs.")

h(2, "What the app needs to know about each variety")
p("These were worked out by asking a different question from the usual one. "
  "Instead of 'what could we know about a cane variety' - which is a very long "
  "list - we asked 'what does each later screen actually need in order to "
  "calculate'. That gives a much shorter list.")

p("Measured automatically from the survey (nobody types these):", bold=True)
table(["Field", "Meaning"],
      [["Current area", "Hectares found by the survey"],
       ["Share of area", "Percentage of the command area"],
       ["Lowland % measured", "How much of it the survey actually found on lowland"],
       ["Survey records", "How many rows support the figure"]],
      [1.9, 4.3])

p("Entered by the cane department:", bold=True)
table(["Field", "Why it is needed", "What breaks without it"],
      [["Stage", "Where it is in its life", "Cannot tell a trial from a failure"],
       ["Strategy", "Where you WANT it to go", "No direction of travel"],
       ["Land suitability", "Upland / lowland / both", "Cannot place it on any field"],
       ["Planting season", "Spring / autumn / both", "Cannot tell which window"],
       ["Crop duration", "12 or 18 month", "Cannot compute how long the field is locked"],
       ["Juice sucrose %", "Sugar in the cane", "No recovery projection"],
       ["Cane yield t/ha", "Tonnes per hectare", "No tonnage - plan has no value"],
       ["Avg cane weight", "Grams per cane", "Cannot see the farmer's economics"],
       ["Red rot reaction", "R / MR / S", "Cannot block a vulnerable expansion"],
       ["Animal damage risk", "Low / medium / high", "Soft canes get eaten"],
       ["Farmer acceptance", "1 to 5", "A plan farmers reject is not a plan"],
       ["Seed available", "Quintals held", "No starting stock for the pipeline"],
       ["Notes", "Anything else", "-"]],
      [1.5, 2.1, 2.6])

note("WHY NOT MORE FIELDS?", [
    "An earlier draft of this list had 22 fields. It was cut to 13 on purpose.",
    "A form with 22 boxes is a form nobody finishes. Fields were dropped where "
    "they duplicated something else (waterlogging tolerance is already implied by "
    "'lowland'), where they belong elsewhere (seed rate is a mill-wide setting, "
    "not a variety trait), or where no calculation uses them yet.",
    "Two fields were dropped for a better reason than tidiness.",
    "'Ratoons taken' was going to be a variety field until the survey was checked. "
    "It is mill policy, not a variety trait - see Step 3.",
    "'Seed multiplier' was removed for the same kind of reason. The multiplication "
    "factor is not a property of the cane at all: it is the ratio between how "
    "densely the mill plants its own nursery and how densely the farmer plants his "
    "field. The farmer plants closer together, so the same seed cane covers less "
    "ground than nursery arithmetic suggests. Since it is the same two spacings for "
    "every variety, asking the cane department for it 86 times would invite 86 "
    "guesses at one number. It belongs in Step 3.",
])

h(2, "How the data actually gets in")
p("The cane department does not type 86 variety names into a screen. That was "
  "the first design decision, and everything else followed from it.")
num("They press Download Template. The app builds an Excel file containing every "
    "variety the survey found, already listed, with the measured columns already "
    "filled in.")
num("They fill in the blank columns. Most are dropdown lists, so a typing mistake "
    "cannot get in.")
num("They press Upload Sheet. The app reads it back and matches each row to the "
    "survey by variety name.")

p("The template is built fresh each time from whichever survey is loaded, not "
  "shipped as a fixed file. If next year's survey finds 91 varieties, the "
  "template will have 91 rows.")

h(2, "The idea that makes the sheet fillable")
p("Asking someone to fill 86 rows is asking them not to do it. So the sheet "
  "sorts varieties largest first and marks the ones that matter:")
box("FILL FIRST", [
    "FILL FIRST      11 varieties  ->  94.2% of the command area",
    "optional        75 varieties  ->   5.8%",
])
p("Eleven rows, not eighty-six. The remaining 75 varieties average 44 hectares "
  "each. They are marked optional and can wait.")

h(2, "A rule worth understanding: blank is not zero")
note("BLANK MEANS 'NOBODY HAS TOLD US YET'. ZERO MEANS 'WE MEASURED IT AND IT IS ZERO'.", [
    "These are completely different, and confusing them quietly ruins a plan.",
    "If a variety's sucrose is unknown and somebody types 0, the app will believe "
    "that variety carries no sugar at all, and will plan against it. If it is left "
    "blank, the app knows it does not know, and asks.",
    "There is one deliberate exception. For Seed Available, 0 is a real and useful "
    "answer - it means the mill holds no seed of that variety.",
])
p("The sheet says this in plain words on its instruction page, and the app "
  "enforces it: uploading a blank template changes nothing at all.")

h(2, "A cross-check built into the sheet")
p("The column 'Lowland % (measured)' sits immediately next to 'Land Suitability'. "
  "One is what the survey found; the other is what the expert says.")
p("If a variety reads 37% lowland and somebody marks it UPLAND, the contradiction "
  "is visible while they are typing, not three screens later. CO 98014 is exactly "
  "this case - the survey found 37.1% of it on lowland.")

doc.add_page_break()

# ============================== STEP 3 ==============================
p("STEP 3", bold=True, size=20, color=GREEN)
h(1, "Agronomic Rules - what we are allowed to do")

h(2, "What this screen is for")
p("Step 1 gave us facts about the land. Step 2 gave us facts about the varieties. "
  "Neither tells you what you are permitted to do with them.")
p("Step 3 holds the numbers that are neither measured nor per-variety. They are "
  "mill policy: how much seed a hectare needs, how fast a variety may multiply, "
  "how much of one variety the mill will tolerate before it becomes a disease "
  "risk.")
p("This is where the argument happens. Steps 1 and 2 are not arguable - they are "
  "data. Step 3 is where judgement becomes a number you can turn.", italic=True)

h(2, "Group 1 - Seed and multiplication")
table(["Setting", "Default", "What it controls"],
      [["Seed rate", "65 qtl/ha", "How much seed cane one hectare needs"],
       ["Bud type", "Double bud", "Single bud uses about 30% less"],
       ["Multiplication factor", "8x", "1 ha of seed plants 8 ha next year"],
       ["Seed purchase ceiling", "35 ha", "Most that can be bought from the breeder"],
       ["Test plot size", "5 ha", "Size of a first trial"]],
      [1.8, 1.1, 3.3])

p("The bud type is a single toggle with a large effect:")
formula("effective seed rate = double bud ? 65 : 65 x 0.7 = 45.5 qtl/ha")

p("And the multiplication chain is the reason new varieties take years:")
box("HOW FAST A NEW VARIETY CAN ARRIVE", [
    "Year 0    buy up to      35 ha of seed from the institute",
    "Year 1    35  x 8   =   280 ha",
    "Year 2    280 x 8   = 2,240 ha",
    "",
    "Two cycles to reach 2,240 ha. This is arithmetic, not opinion.",
])
p("No amount of enthusiasm shortens this. If a variety is wanted at scale in "
  "three years, the seed plot has to exist today.")

p("Where the multiplication factor really comes from", bold=True)
p("It is tempting to treat 8x as a fact about the cane. It is not. It is the ratio "
  "between two planting densities: how many setts per metre the mill plants in its "
  "own nursery, and how many the farmer plants in his field.")
p("The farmer plants closer together. So the same quantity of seed cane covers less "
  "ground in his field than the nursery arithmetic would suggest, and the effective "
  "multiplication drops. That is the whole explanation.")
note("WHY THIS MATTERS FOR THE APP", [
    "Because it is the same two spacings for every variety, the multiplication "
    "factor is one mill-wide setting - not a column on the variety sheet. It was "
    "removed from Step 2 for exactly this reason.",
    "The real spacing figures are still to be confirmed with the plant team head. "
    "Once they are known, the factor should be derived from them rather than typed "
    "in, so that changing nursery practice moves the number automatically.",
])

h(2, "Group 2 - Crop cycle: the replant budget")
p("These two settings decide how much land is free each year. They are the most "
  "important numbers on the screen.")
table(["Setting", "Default", "Meaning"],
      [["Ratoons taken", "2", "How many ratoons before ploughing out"],
       ["Ratoon : Plant ratio", "0.9", "Ratoon hectares for every 1 planted"],
       ["Ratoon II carry rate", "3.6%", "Share of ratoon I going to a second ratoon"]],
      [1.9, 1.0, 3.3])

p("From these three the app works out what share of land must be freshly planted "
  "each year. The reasoning is simple. Call the fresh-planted area P. For every "
  "hectare planted, r hectares are standing in ratoon. Of those, a fraction "
  "'carry' go on to a second ratoon. So the total standing area is:")
formula("total = P + rP + carry x rP = P x (1 + r x (1 + carry))")
p("Turn that around and you get the share that must be freshly planted:")
formula("fresh plant share = 1 / (1 + r x (1 + carry))")

p("Worked with the default settings:")
box("AT THE DEFAULTS  (r = 0.9, carry = 3.6%)", [
    "fresh = 1 / (1 + 0.9 x 1.036) = 1 / 1.9324 = 0.5175  ->  51.7%",
    "",
    "locked            = 56,491 x 0.517 = 29,234 ha",
    "free to replant   = 56,491 x 0.483 = 27,257 ha",
])

h(2, "The check that matters: do the defaults match reality?")
p("The app can compare these settings against what the survey actually measured. "
  "The survey knows the real ratio: divide ratoon area by plant area.")
box("WHAT THE SURVEY ACTUALLY SHOWS", [
    "ratoon I / plant   = 22,469 / 33,178  = 0.677    (default says 0.90)",
    "ratoon II / ratoon = 843 / 22,469     = 3.75%    (default says 3.60%)",
])
p("Put the measured figures into the same formula:")
box("AT THE MEASURED VALUES  (r = 0.68, carry = 3.8%)", [
    "fresh = 1 / (1 + 0.68 x 1.038) = 0.586  ->  58.6%",
    "",
    "free to replant   = 23,375 ha",
    "survey actually   = 23,312 ha        difference: 63 ha out of 23,312",
])
p("The formula reproduces the survey almost exactly - but only when the measured "
  "ratio is used. The default of 0.9 is 17% wrong, and it overstates free land by "
  "nearly 4,000 hectares.")

note("WHERE 0.9 CAME FROM", [
    "0.9 is the target in the mill's guiding document - what SHOULD happen. 0.677 "
    "is what DOES happen. Neither is a mistake; they answer different questions.",
    "But the engine has to be told which one to plan against. Planning at 0.9 "
    "overstates locked land and understates the replant budget. The screen now has "
    "a 'Use measured values' button so the survey figure is one click away.",
])

h(2, "How many ratoons does Gobind actually take?")
p("This was going to be a per-variety setting until the survey was checked. It is "
  "not. It is mill policy, and the data is unambiguous:")
box("SURVIVAL THROUGH THE CYCLE", [
    "plant + autumn  ->  ratoon I  :  67.7%   (22,469 of 33,178 ha)",
    "ratoon I        ->  ratoon II :   3.8%   (843 of 22,469 ha)",
])
p("96% of ratoon fields are ploughed out after the first ratoon. Gobind takes ONE "
  "ratoon in practice, whatever the policy says. And it is not a variety trait - "
  "across every variety above 500 hectares, ratoon II sits between 0.2% and 3.6%. "
  "No variety stands out as a better ratooner.")
p("Two consequences follow. First, a field is free in year 3, not year 4 - the "
  "plan is more flexible than a three-year lock would suggest. Second, 'ratoons "
  "taken' belongs on this screen as one mill-wide setting, not as a column on the "
  "variety sheet.")

h(2, "Group 3 - Limits and rules")
p("These are the safety rails. They are locked to the manager role.")
table(["Rule", "Default", "What it prevents"],
      [["Max variety concentration", "40%", "One variety dominating the whole mill"],
       ["Village concentration cap", "60%", "One variety dominating a single village"],
       ["Lowland coverage floor", "28%", "Too little flood-tolerant cane"],
       ["Red rot quarantine trigger", "2%", "Too much area on susceptible varieties"]],
      [2.2, 1.0, 3.0])

formula("variety cap in hectares = 40% x 56,491 = 22,596 ha")
p("CO 0118 currently stands at 18,029 ha, which is 31.9%. It is inside the cap, "
  "with 4,567 hectares of headroom.")

p("The village cap exists because the mill-wide cap can pass while a single "
  "village is planted almost entirely to one variety - and that is where an "
  "outbreak actually starts.")

h(2, "Group 4 - Scope")
table(["Setting", "Default", "Note"],
      [["Command area", "57,000 ha", "Survey measured 56,490.6 - within 1%"],
       ["Planning horizon", "3 years", "Can be set from 1 to 5"],
       ["Base year", "2026-27", "The season the survey describes"]],
      [1.8, 1.2, 3.2])

h(2, "How the defaults compare with the survey")
table(["Setting", "Default", "Survey shows", "Verdict"],
      [["Command area", "57,000 ha", "56,490.6 ha", "Fine - within 1%"],
       ["Ratoon II carry rate", "3.6%", "3.75%", "Good - nearly exact"],
       ["Max concentration", "40%", "31.9% (CO 0118)", "Passing, 4,567 ha headroom"],
       ["Ratoon : Plant ratio", "0.90", "0.68", "WRONG - overstates free land"],
       ["Lowland floor", "28%", "23.8% actual", "IN BREACH by 2,378 ha"]],
      [1.7, 1.0, 1.4, 2.2])

note("TWO THINGS TO DECIDE", [
    "1. The ratoon ratio. Plan against the target (0.9) or the measured reality "
    "(0.68)? This changes the replant budget by nearly 4,000 hectares, which "
    "changes everything downstream.",
    "2. The lowland floor is set to 28% but the mill measures 23.8% - short by "
    "2,378 hectares. Every scenario will fail this check on day one. Either the "
    "28% is aspirational and should be marked as such, or the mill is genuinely "
    "under-covered on lowland and that is a finding in its own right.",
])
p("It is worth saying that whoever set these defaults knew the crop. A carry rate "
  "of 3.6% against a measured 3.75% is not a guess.")

doc.add_page_break()

# ============================== HONEST STATUS ==============================
h(1, "What is built, and what is not")
p("A plan document that only describes the good parts is not much use. This is "
  "the honest position as of this writing.")

h(2, "Working")
bullet("Reads the 78 MB survey in the browser in about 15 seconds, with no "
       "technical preparation needed from the user.", "Step 1. ")
bullet("Every headline figure can be clicked open to see the rows behind it.",
       "Step 1. ")
bullet("Excel template generated from the loaded survey, filled in and uploaded "
       "back, with dropdowns and range checks.", "Step 2. ")
bullet("Blank cells never overwrite existing values - uploading a blank template "
       "changes nothing.", "Step 2. ")
bullet("All crop-cycle settings now drive the engine, with a live readout of the "
       "replant budget they produce and a one-click comparison against the survey.",
       "Step 3. ")

h(2, "Not yet built")
bullet("Stage is stored for every variety but there is no control to edit it "
       "on the screen yet.", "Step 2. ")
bullet("The contradiction check (declared land suitability against measured "
       "lowland share) exists in the Excel sheet but not yet in the app.", "Step 2. ")
bullet("No coverage meter showing what share of the registry is still "
       "unclassified.", "Step 2. ")
bullet("The scale guard is agreed but not implemented - nothing yet stops an "
       "uncharacterised variety being expanded.", "Step 2. ")
bullet("The village concentration cap is wired but inert - it needs the Step 6 "
       "allocation, which does not exist yet.", "Step 3. ")
bullet("The multiplication factor is still typed in as 8x rather than derived from "
       "nursery and farmer planting density - the real spacings are not yet "
       "confirmed.", "Step 3. ")
bullet("Steps 4, 5 and 6 are not yet defined.", "Later. ")

h(2, "Known approximations")
note("THE FREE-TO-REPLANT FORMULA", [
    "The formula treats all land currently in ratoon as free to replant. That is "
    "the definition Step 1 uses, and it reproduces the survey figure exactly.",
    "Strictly, in a two-ratoon system a ratoon I field is not free - it is going on "
    "to ratoon II. At Gobind's actual carry rate of 3.8% the difference is about "
    "840 hectares and invisible. But if that slider were ever pushed towards 20%, "
    "the model would overstate free land. Worth knowing before it is moved.",
])
note("CANE YIELD IS THE BIGGEST GAP IN THE DATA", [
    "The sheet now has a column for cane yield in tonnes per hectare, but the mill "
    "may not hold that figure per variety.",
    "Without it the engine can compare plans on area and on sugar recovery, but it "
    "cannot say what a plan is actually WORTH, because the payoff is tonnage "
    "multiplied by recovery. A variety with 18.5% sucrose and poor yield can lose "
    "to one with 17% sucrose and heavy cane. This is worth chasing in the "
    "cane-weighment records.",
])

doc.add_page_break()

# ============================== GLOSSARY ==============================
h(1, "Glossary")
table(["Term", "Meaning"],
      [["Plant crop", "A field grown from setts you planted"],
       ["Ratoon", "Regrowth from the stubble of a harvested crop - same variety, no replanting"],
       ["Sett", "A piece of cane with a bud on it, used instead of seed"],
       ["Single / double bud", "How many buds per sett. Single uses about 30% less cane"],
       ["Autumn planting", "Planted Oct-Nov, about 18 months in the field"],
       ["Spring planting", "Planted Feb-Mar, about 12 months in the field"],
       ["Locked area", "Land whose variety cannot be changed next year"],
       ["Free to replant", "Land finishing its cycle - available for a new decision"],
       ["Upland", "Well-drained land"],
       ["Lowland", "Land that waterlogs; needs tolerant varieties"],
       ["Quintal (qtl)", "100 kilograms"],
       ["Sucrose %", "Sugar content of the juice, roughly 14 to 20"],
       ["Recovery", "Sugar actually extracted, as a share of cane crushed"],
       ["Red rot", "A fungal disease. R = resistant, MR = moderate, S = susceptible"],
       ["Multiplication factor", "How many hectares 1 ha of seed can plant next year"],
       ["Command area", "All the land supplying cane to this mill"],
       ["Society", "A cane growers' co-operative within the command area"]],
      [1.9, 4.3])

rule()
p("Generated from the 2026-27 plot survey. Every figure in this document can be "
  "checked against that file.", size=9, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)

doc.save(OUT)
print(f"wrote {OUT}")
print(f"  {os.path.getsize(OUT)/1024:.0f} KB")
