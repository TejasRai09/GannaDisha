# -*- coding: utf-8 -*-
"""Generate 'Step 1 - Baseline Data - Explained.docx'.

A plain-language explanation of what the first screen of the planning app is
for, why it exists, and every calculation it performs. Written for a reader at
about class 10 level - no prior knowledge of sugar milling or computers.

Figures are from the 2026-27 survey so every worked example can be checked on
a calculator.
"""

import os

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Step 1 - Baseline Data - Explained.docx")

GREEN = RGBColor(0x05, 0x96, 0x69)
GREY = RGBColor(0x60, 0x60, 0x60)

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


# ============================== TITLE ==============================
p("STEP 1 - BASELINE DATA", bold=True, size=26, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER)
p("What this screen is for, and every calculation it does", size=14, color=GREY,
  align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_paragraph()
p("Cane Varietal Planning System  |  Gobind Sugar Mill, Aira", align=WD_ALIGN_PARAGRAPH.CENTER)
p("Written so anyone can follow it. Every number here can be checked on a calculator.",
  size=10, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_page_break()

# ============================== PART 0 ==============================
h(1, "Part 0. The whole idea in one page")

p("The mill wants to change which types of sugarcane its farmers grow. That change "
  "takes three years. Before you can plan a journey, you must know where you are "
  "standing. Step 1 is how the system finds out where it is standing.")

box("THINK OF IT LIKE THIS", [
    "Before a builder renovates a building, he first measures it:",
    "",
    "   how many rooms are there?",
    "   which rooms are empty?",
    "   which rooms have tenants who cannot be moved yet?",
    "",
    "He cannot plan anything until he knows those three things.",
    "",
    "Step 1 does exactly this for the mill's farmland.",
])

p("Step 1 answers three questions, and nothing else:")
bullet("Which variety of cane is growing, how much of it, and where?", b="1. What is in the ground? ")
bullet("Some fields can be changed next season. Most cannot. Which are which?",
       b="2. What can I change next season? ")
bullet("A plan must be given to real people in real villages. Which villages, which farmers?",
       b="3. Who and where? ")

p("Everything the system does later is built on these answers.")

# ============================== PART 1 ==============================
h(1, "Part 1. Why we cannot skip this step")

p("Someone might say: we already know roughly what is grown, why measure it again "
  "every year? Three reasons.")

lead("Reason 1 - the plan is a subtraction sum. ",
     "A target says 'we want 6,270 hectares of CoLK 14201 next year'. To know how much "
     "to plant, you must subtract what you already have. Without today's figure, the "
     "target is just a wish with no action attached to it.")

lead("Reason 2 - most land is not available. ",
     "This is the part people find surprising, and it is explained fully in Part 3. "
     "Only about four fields out of every ten can be changed next season. If you plan "
     "as though all of it is available, the plan cannot be carried out.")

lead("Reason 3 - a plan has to reach a village. ",
     "Telling the cane department 'plant 4,379 hectares of CoLK 14201' is useless. "
     "Telling them 'Adlishpur village: 342 hectares' is an instruction someone can "
     "actually follow. Step 1 provides the village names and sizes that make this possible.")

# ============================== PART 2 ==============================
h(1, "Part 2. What the survey file actually contains")

p("Once a year, in May and June, mill staff walk the fields and record what they find. "
  "That record is a spreadsheet with 238,334 lines in it.")

h(2, "The one thing people get wrong")

p("ONE LINE IN THE FILE IS NOT ONE FIELD.")

p("One line is ONE FARMER'S SHARE of one field. When three brothers farm a single "
  "field together, that one field appears three times in the file - once for each "
  "brother - and each line records only that brother's portion.")

box("WORKED EXAMPLE - a real field in Chahamalpur village", [
    "The whole field measures 0.976 hectares. Three farmers share it:",
    "",
    "   DHARAM PAL   50%   ->  0.976 x 50/100  =  0.488 ha",
    "   DARBARI      30%   ->  0.976 x 30/100  =  0.293 ha",
    "   RAM VILASH   20%   ->  0.976 x 20/100  =  0.195 ha",
    "                                              ---------",
    "   THREE lines in the file, but ONE field       0.976 ha",
])

p("If you forget this and simply count lines, you will think the mill has far more "
  "fields than it really does. The next part shows how the system avoids that mistake.")

# ============================== PART 3 ==============================
h(1, "Part 3. The six calculations")

# ---- 1 ----
h(2, "Calculation 1 - Turning lines into real fields")

p("Every line carries the GPS position of the field's four corners. If two lines have "
  "exactly the same four corners, they are the same piece of land.")

formula("same four corners  =  one physical field")
formula("238,334 lines  ->  178,635 real fields")

lead("Why this matters: ", "counting lines would overstate the number of fields by "
     "about a third. The total AREA is unaffected, because the shares add up correctly. "
     "But a question like 'how many fields can I change?' must be answered with the "
     "field count, never the line count.")

# ---- 2 ----
h(2, "Calculation 2 - Adding up the land")

formula("farmer's area  =  whole field area  x  his percentage / 100")
formula("total area  =  add up every line  =  56,491 hectares")

p("This total is important beyond itself: it becomes the number we divide by whenever "
  "we want a percentage later. When the system says a variety covers 32% of the land, "
  "it means that variety's area divided by 56,491.")

# ---- 3 ----
h(2, "Calculation 3 - The lock (the most important calculation in the system)")

p("Sugarcane is unusual. After you cut it, the roots left in the ground grow again by "
  "themselves. That free second crop is called a RATOON. And here is the crucial point:")

box("THE RULE THAT CONTROLS EVERYTHING", [
    "A ratoon is ALWAYS the same variety as the crop before it.",
    "",
    "So a field planted this year is committed to that same variety next year,",
    "whether the mill likes it or not. Nobody can change it. The field is LOCKED.",
    "",
    "Only when the ratoon finishes and the field is ploughed up",
    "can a different variety be planted.",
])

p("So the system sorts every field into locked or free:")

table(["What it is now", "Area", "What happens next season", "Can we change it?"], [
    ["PLANT crop", "28,118 ha", "becomes ratoon of the same variety", "NO - locked"],
    ["AUTUMN crop", "3,609 ha", "becomes ratoon of the same variety", "NO - locked"],
    ["RATOON", "22,469 ha", "finishes, field is ploughed", "YES - free"],
    ["RATOON II", "843 ha", "finishes, field is ploughed", "YES - free"],
], widths=[1.4, 1.0, 2.5, 1.4])

formula("LOCKED = 28,118 + 3,609 = 33,178 ha   (58.7%)")
formula("FREE   = 22,469 +   843 = 23,312 ha   (41.3%)")

p("That second number - 23,312 hectares - is called the REPLANT BUDGET.", bold=True)

box("WHAT THE REPLANT BUDGET MEANS", [
    "Next season, no matter what anyone decides:",
    "",
    "   - no matter how good the plan is",
    "   - no matter how much seed is available",
    "   - no matter how much money is spent",
    "",
    "at most 23,312 hectares can be changed. That is 41 out of every 100",
    "hectares. The other 59 are already committed.",
    "",
    "Any plan asking for more than 23,312 ha is simply impossible,",
    "and the system says so immediately instead of pretending otherwise.",
], colour="FEF3C7")

# ---- 4 ----
h(2, "Calculation 4 - Sorting the land by whether it floods")

formula("upland   =  43,051 ha   (76.2%)     free-draining")
formula("lowland  =  13,439 ha   (23.8%)     water stands in monsoon")

p("This decides WHICH variety is allowed on WHICH free field. Some varieties die if "
  "water stands on them; others are bred for exactly that. A free field on lowland "
  "cannot be given CoLK 14201 no matter what the target says, because that variety "
  "fails under waterlogging.")

# ---- 5 ----
h(2, "Calculation 5 - What is grown today")

formula("area of a variety  =  add up every line of that variety")
formula("share of a variety  =  its area / 56,491 x 100")

p("This is the starting point of the three-year journey. The system calls it Year 0. "
  "Every later year is measured against it, and every safety limit - such as 'no "
  "variety may cover more than 40% of the land' - is checked against these figures.")

# ---- 6 ----
h(2, "Calculation 6 - Counting the people and places")

table(["What", "Count", "Why the plan needs it"], [
    ["Villages", "334", "The plan is issued village by village"],
    ["Co-op societies", "7", "Seed is distributed through these"],
    ["Bonded growers", "74,283", "The people who actually decide what to plant"],
    ["Varieties found", "86", "Every one has to be classified or retired"],
], widths=[1.5, 1.0, 3.6])

p("A note on counting farmers: a grower's code number repeats between villages, so "
  "grower number 159 in one village is a different person from grower number 159 in "
  "another. The system therefore identifies a farmer by society + village + code "
  "together, never by the code alone.")

# ============================== PART 4 ==============================
h(1, "Part 4. The one equation the whole engine runs on")

p("Everything above comes together in a single relationship. For any variety, next "
  "season's area is:")

formula("Next year's area  =  Locked  +  Carry-over  +  New planting")

table(["Term", "What it means", "Who decides it"], [
    ["Locked", "Its plant and autumn crop, which becomes ratoon automatically", "Nobody - it just happens"],
    ["Carry-over", "The small share of its ratoon that takes a second ratoon", "Mostly the farmer"],
    ["New planting", "Fresh planting on land that came free", "THE MILL - this is the decision"],
], widths=[1.2, 3.2, 1.7])

p("And it must obey one limit:")

formula("Total new planting of all varieties  <=  23,312 ha")

box("WHY THIS EQUATION IS THE WHOLE SYSTEM", [
    "Look at the three terms on the right.",
    "",
    "   Locked      - Step 1 measures it",
    "   Carry-over  - Step 1 measures it",
    "   New planting - THIS IS THE ONLY THING ANYONE DECIDES",
    "",
    "Step 1 hands over every term except the last one.",
    "Steps 3, 4, 5 and 6 exist only to work out that last term.",
])

# ============================== PART 5 ==============================
h(1, "Part 5. What the later screens take from Step 1")

table(["Screen", "What it uses from Step 1"], [
    ["2 - Varietal Registry", "The 86 varieties found, with their current areas, to fill the list"],
    ["3 - Agronomic Rules", "The total area, used as the denominator for every percentage limit"],
    ["4 - Seed & Strategy", "Each variety's current area - the base that seed multiplication grows from"],
    ["5 - Three-Year Results", "Year 0 composition, and the total area every safety limit is checked against"],
    ["6 - Village Dispatch", "The free fields themselves, each with its village and land type. These are literally the things being allocated"],
], widths=[1.7, 4.6])

# ============================== PART 6 ==============================
h(1, "Part 6. What Step 1 deliberately does NOT do")

p("Step 1 makes no decisions and no predictions. It has no opinion about what should "
  "be planted. It only measures.")

p("This separation is deliberate and important. If measuring and planning were mixed "
  "together, you could no longer tell whether a number on the screen is something the "
  "mill OBSERVED or something the mill INTENDS. Keeping them apart means every figure "
  "on Step 1 can be trusted as a fact, and every figure after it is clearly a choice.")

box("THE SIMPLE VERSION", [
    "Step 1  =  the photograph taken before any work begins.",
    "Steps 2-6  =  deciding what to change, and by how much.",
])

# ============================== PART 7 ==============================
h(1, "Part 7. Every formula on one page")

table(["What is being worked out", "How"], [
    ["A farmer's share of a field", "field area x his percentage / 100"],
    ["Real field count", "lines sharing the same four GPS corners count as one"],
    ["Total surveyed area", "add up every line = 56,491 ha"],
    ["Locked area", "plant crop + autumn crop = 33,178 ha"],
    ["Replant budget (free area)", "ratoon + ratoon II = 23,312 ha"],
    ["Share of a variety", "its area / total area x 100"],
    ["Average field size", "total area / number of fields = 0.32 ha"],
    ["Next year's area of a variety", "locked + carry-over + new planting"],
    ["The limit on the plan", "total new planting <= 23,312 ha"],
], widths=[2.5, 4.0])

# ============================== GLOSSARY ==============================
h(1, "Part 8. Words used in this document")

table(["Word", "Meaning"], [
    ["Variety", "A type of sugarcane, like a breed of cattle. Each one has its own sweetness, its own weaknesses, and its own preferred soil. Names look like 'Co 0118' or 'CoLK 14201'."],
    ["Hectare (ha)", "A measure of land: 100 metres by 100 metres. About 2.5 acres, or 4 bigha."],
    ["Plant crop", "The first year's crop, grown from pieces of cane stem that were planted by hand."],
    ["Ratoon", "The second crop, which grows back by itself from the roots left after cutting. It is free, but it is always the same variety as before."],
    ["Ratoon II", "A third crop from the same roots. Fewer farmers take one."],
    ["Autumn crop", "Cane planted in October-November. It stands about 18 months instead of 12, so it grows bigger."],
    ["Locked field", "A field whose variety cannot be changed next season, because it will be a ratoon of what is already there."],
    ["Replant budget", "The total land that becomes free to plant afresh next season. Here, 23,312 hectares."],
    ["Upland / Lowland", "Whether water drains away or stands on the field during the monsoon. It decides which varieties can survive there."],
    ["Command area", "All the land whose cane this mill is entitled to buy - roughly 57,000 hectares."],
    ["Survey", "The count done every May and June, recording what is growing in every field."],
    ["Society", "A co-operative of cane growers. The mill works through seven of them."],
], widths=[1.4, 5.0])

doc.save(OUT)
print("saved:", OUT)
