# -*- coding: utf-8 -*-
"""Generate 'Varietal Engine - Logic and Calculations.docx'.

A complete, current walkthrough of how the engine turns the survey into the two
output files - every step, every formula, every number - written for a reader at
about class 10 level. Nothing is assumed known: each term is explained where it
first appears.

All figures are from the run of 2 September 2026 (after the three bug fixes),
so the arithmetic in the worked examples can be checked on a calculator.
"""

import os

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Varietal Engine - Logic and Calculations.docx")

TEAL = RGBColor(0x1F, 0x4E, 0x5F)
GREY = RGBColor(0x60, 0x60, 0x60)
RED = RGBColor(0x9C, 0x00, 0x06)
GREEN = RGBColor(0x00, 0x61, 0x00)

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
    r.font.color.rgb = TEAL
    r.bold = True


def shade(cell, hexc):
    tcPr = cell._tc.get_or_add_tcPr()
    e = OxmlElement("w:shd")
    e.set(qn("w:val"), "clear")
    e.set(qn("w:fill"), hexc)
    tcPr.append(e)


def box(title, lines, colour="EEF5F8"):
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
        shade(c, "1F4E5F")
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


# =============================== TITLE ===============================
p("THE VARIETAL ENGINE", bold=True, size=26, color=TEAL, align=WD_ALIGN_PARAGRAPH.CENTER)
p("How it works - every step, every calculation", size=14, color=GREY,
  align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_paragraph()
p("Gobind Sugar Mills Limited, Aira  |  Three-Year Varietal Plan 2027-28 to 2029-30",
  align=WD_ALIGN_PARAGRAPH.CENTER)
p("Figures from the run of 2 September 2026. Every number below can be checked on a calculator.",
  size=10, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER)
p("CONFIDENTIAL - internal use only.", bold=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_page_break()

# =============================== PART 0 ===============================
h(1, "Part 0. Read this first")
p("This document explains a computer program we call the engine. You do not need to "
  "know computers or sugar milling to follow it. Every word is explained when it first "
  "appears, and every calculation is shown with real numbers.")

h(2, "0.1 Seven words you need")
table(["Word", "What it means"], [
    ["Variety", "A type of sugarcane, like a breed of cattle. 'Co 0118' and 'CoLK 14201' are two different varieties. Each has its own sweetness and its own weaknesses."],
    ["Hectare (ha)", "A measure of land. 100 metres by 100 metres. About 2.5 acres, or 4 bigha."],
    ["Plot / field", "One piece of land where cane grows. The mill has about 178,635 of them."],
    ["Plant crop", "Cane grown from freshly planted pieces of cane stem. Year 1 of a field's life."],
    ["Ratoon", "After cutting the cane, the roots left in the soil grow again by themselves. That free second crop is a ratoon. IT IS ALWAYS THE SAME VARIETY as before."],
    ["Sucrose / PoL", "How sweet the cane juice is, as a percentage. Higher means more sugar per tonne of cane."],
    ["Survey", "Once a year, mill staff walk every field and record what is growing there. That record is our starting data."],
], widths=[1.2, 5.3])

h(2, "0.2 The one idea that explains everything")
p("If you remember only one thing, remember this:")
box("THE RULE THAT CONTROLS THE WHOLE PLAN", [
    "You CANNOT change the variety in a field whenever you want.",
    "",
    "  Year 1  field is PLANT crop     -> variety is fixed",
    "  Year 2  it becomes RATOON       -> SAME variety, still fixed",
    "  Year 3  ratoon ends, field is ploughed -> NOW you can change",
    "",
    "So each year only the fields finishing their cycle can be changed.",
    "Everything the engine does is built around this single fact.",
], colour="FFF2CC")

h(2, "0.3 What the engine is for")
p("The mill has a three-year plan saying how much of each variety it wants. But a plan on "
  "paper does not move a single field. The engine does two jobs:")
bullet("Is this plan even possible? Is there enough land free? Enough seed? Does it break "
       "any safety rule?", b="Job 1 - CHECK. ")
bullet("For each of the 62,696 fields that become free next year, which variety should be "
       "planted there?", b="Job 2 - DECIDE. ")
p("Job 1 produces one file. Job 2 produces another. Parts 4 and 5 of this document explain "
  "them one at a time.")

# =============================== PART 1 ===============================
h(1, "Part 1. What goes in")
p("The engine reads seven things. Not all of them are equally important today - the honest "
  "position is shown in the last column.")
table(["#", "File", "What the engine takes from it", "Status"], [
    ["1", "Plot Wise Survey Report 2026-27", "238,334 rows describing every field", "Used fully. But see the warning below"],
    ["2", "D_Plan_Targets.xlsx", "How many hectares of each variety the plan wants, and 6 safety rules", "Used fully"],
    ["3", "Seed Availbility.xlsx", "The mill's own proposal for next year, plus seed required and available", "Used fully"],
    ["4", "C_Variety_Master.xlsx", "The sweetness (sucrose %) of each variety", "Only 1 column of 14 is read"],
    ["5", "E_Seed_and_Transition.xlsx", "Two settings used in the maths", "Only 1 sheet of 3 is read"],
    ["6", "Land rules (inside the program)", "Which variety may be planted on which type of land", "Sits in the program code, not in Excel - should be moved"],
    ["7", "A, B and F workbooks", "Nothing", "Empty or unused today"],
], widths=[0.3, 1.7, 2.5, 2.0])

box("WARNING ABOUT THE SURVEY FILE", [
    "The Excel survey we use was produced on 20 June 2026, while surveying was",
    "still going on. A later file dated 22 July 2026 has more:",
    "",
    "    Excel file (June)  238,334 rows   56,491 hectares",
    "    Text file  (July)  251,723 rows   59,323 hectares",
    "    Difference         +13,389 rows   +2,832 hectares",
    "",
    "So every total in this document is about 2,832 hectares too low.",
    "We still use the Excel file because the July file is missing the land type,",
    "disease and variety-name columns that the engine needs.",
], colour="FFE0E0")

# =============================== PART 2 ===============================
h(1, "Part 2. Preparing the data (4 steps)")

h(2, "Step 1 - Make the variety names match")
p("People type the same variety name in different ways. The computer would treat these as "
  "two different varieties and every total would be wrong. So first we remove all spaces "
  "and make everything capital letters.")
formula('"CoLK 14201"  ->  "COLK14201"          "COLK  9709"  ->  "COLK9709"')

h(2, "Step 2 - Understand what one row means")
p("This is the step people get wrong most often.")
p("ONE ROW IS NOT ONE FIELD. One row is ONE FARMER'S SHARE of one field. When three "
  "brothers farm one field together, that field appears three times - once per brother - "
  "and each row holds only that brother's portion.")
formula("farmer's area = full field area  x  his percentage / 100")
box("WORKED EXAMPLE - a real field in Chahamalpur village", [
    "The whole field is 0.976 hectares. Three farmers share it:",
    "",
    "   DHARAM PAL   50%   ->  0.976 x 50/100  =  0.488 ha",
    "   DARBARI      30%   ->  0.976 x 30/100  =  0.293 ha",
    "   RAM VILASH   20%   ->  0.976 x 20/100  =  0.195 ha",
    "                                              ---------",
    "   3 rows in the file, but only ONE field     0.976 ha",
])
p("We checked this across the whole file: on 96.6% of fields the percentages add up to "
  "exactly 100. That confirms we have understood the data correctly.")

h(2, "Step 3 - Throw out unusable rows")
p("Each row carries the GPS position of the field's four corners. Some rows have a corner "
  "recorded as zero, or a position outside the district. Those fields cannot be located, "
  "so we remove them.")
formula("238,334 rows  -  1,311 unusable  =  237,023 rows we can use")

h(2, "Step 4 - Join the shares back into fields")
p("If three rows have exactly the same four corners, they are the same piece of land. We "
  "group them together and add up the shares.")
formula("237,023 farmer rows  ->  178,635 real fields")
p("From here on, when this document says 'field' it means one of these 178,635.")

# =============================== PART 3 ===============================
h(1, "Part 3. The four numbers everything depends on")

h(2, "3.1 How much land is in each stage of its cycle")
p("Remember the rule from Part 0. We sort all the land by which stage it is in:")
table(["Stage now", "Area", "What happens next year", "Can we change it?"], [
    ["PLANT crop", "28,118 ha", "becomes ratoon of the same variety", "NO - locked"],
    ["AUTUMN crop", "3,609 ha", "becomes ratoon of the same variety", "NO - locked"],
    ["RATOON", "22,469 ha", "cycle finishes, field is ploughed", "YES - free"],
    ["RATOON II", "843 ha", "cycle finishes, field is ploughed", "YES - free"],
    ["TOTAL", "56,491 ha", "", ""],
], widths=[1.3, 1.1, 2.4, 1.5])

h(2, "3.2 The ratoon-again rate")
p("Not every ratoon field is ploughed. A few farmers take a second ratoon. We do not guess "
  "this number - we measure it from the survey itself:")
formula("rate = ratoon II area  /  (ratoon area + ratoon II area)")
formula("     = 843.21  /  23,312.4  =  0.036  =  3.6%")

h(2, "3.3 The replant budget - the most important number in the system")
p("This is how much land actually becomes available to plant something new next year.")
formula("budget = ratoon x (1 - 0.036)  +  ratoon II")
formula("       = 22,469 x 0.964  +  843")
formula("       = 21,660 + 843  =  22,503 hectares")
p("Everything the plan wants to do next year has to fit inside these 22,503 hectares. "
  "Nothing else is available, no matter how much seed or money there is.")

h(2, "3.4 The seed rate")
p("To plant one hectare you need a certain weight of cane stems as seed. We did not assume "
  "this - we worked it backwards from the mill's own Seed Availability sheet and checked it "
  "on all 11 rows:")
formula("624,000 quintals  /  9,600 hectares  =  65 quintals per hectare")
p("(A quintal is 100 kg.)")

# =============================== PART 4 ===============================
h(1, "Part 4. Job 1 - CHECKING the plan")
p("These calculations produce the first output file, Varietal_Plan_Outcome.xlsx.")
p("An important note before we start: there are TWO different plans for next year, and they "
  "disagree. The engine therefore does every calculation twice, once for each.")
table(["", "Scenario A", "Scenario B"], [
    ["Comes from", "The Guiding Document", "The mill's Seed Availability sheet"],
    ["Co 0118", "17,000 ha (reduce)", "18,240 ha (increase)"],
    ["Co 0238", "2,000 ha", "3,990 ha"],
    ["CoS 13235", "2,500 ha", "8,550 ha"],
    ["Co 15023", "3,500 ha", "1,140 ha"],
], widths=[1.3, 2.4, 2.6])

h(2, "Check 1 - How much of each variety is there today?")
formula("area of a variety = add up the area of every field growing it")
formula("share % = area of the variety / 56,491 x 100")
box("WORKED EXAMPLE - Co 0118", [
    "Total area of Co 0118 fields  =  18,029 ha",
    "Share  =  18,029 / 56,491 x 100  =  31.9%",
])

h(2, "Check 2 - How much new planting does the plan need?")
p("For each variety, if the target is bigger than what we have now, the difference has to be "
  "newly planted. If the target is smaller, nothing needs planting (it will shrink by itself).")
formula("need = target  -  what we have now      (but never less than zero)")
formula("total need = add this up for every variety")
box("RESULT", [
    "Scenario A (Document)  :  8,965 hectares needed",
    "Scenario B (Mill)      : 11,969 hectares needed",
])

h(2, "Check 3 - Is the plan possible?")
formula("POSSIBLE if   need  <=  budget")
box("WORKED EXAMPLE", [
    "Scenario A :   8,965  <=  22,503   ->  YES, possible",
    "Scenario B :  11,969  <=  22,503   ->  YES, possible",
    "",
    "So land is NOT the problem for either plan.",
])

h(2, "Check 4 - Is any one variety too big?")
p("If one variety covers too much of the mill's land and a disease attacks it, the mill loses "
  "a huge amount at once. So the plan sets limits.")
formula("share in year 3 = year-3 target / 57,000 x 100")
p("PASS if 25% or less. WARNING between 25% and 40%. FAIL above 40%. "
  "The biggest today is Co 0118 at 31.9% - above the target but below the hard limit.")

h(2, "Check 5 - Is there enough cover for the wet land?")
p("Some fields flood in the monsoon. Only three varieties survive there. If those three "
  "together fall below 28% of the mill's land, part of the wet area would have nothing safe "
  "to plant.")
formula("(CoLK 94184 + CoS 13231 + Co 98014)  /  total  x  100")
box("WORKED EXAMPLE", [
    "( 11,322  +  2,062  +  6,495 )  /  56,491  x  100",
    "=  19,879 / 56,491 x 100",
    "=  35.2%      Needs to be 28% or more   ->  PASS",
])

h(2, "Check 6 - Is CoLK 14201 growing where it should not?")
p("The mill's own field testing found this variety dies if water stands on it. The plan "
  "therefore says: zero hectares of it on wet land.")
formula("add up area where variety = CoLK 14201 AND land = LOWLAND")
box("RESULT - THIS ONE FAILS", [
    "Found: 370.5 hectares, spread over 158 villages.",
    "The target is ZERO, so this is a FAIL.",
    "",
    "Worse: most of it was planted recently, not left over from before.",
    "The engine lists all 158 villages so supervisors can be sent to check.",
], colour="FFE0E0")

h(2, "Check 7 - Is any variety getting diseased?")
formula("disease % = fields of that variety with red rot  /  all its fields  x  100")
p("The plan says: if any variety crosses 2%, act immediately. Today the worst is Co 05011 at "
  "1.10%, and Co 0238 - the variety being removed BECAUSE of red rot - shows only 0.63%. "
  "That does not prove the plan wrong; the survey's disease column is only a quick look by a "
  "surveyor, not a laboratory test. It means a proper disease survey is needed.")

h(2, "Check 8 - Is there enough seed?")
p("Seed is needed only for the freshly planted part, not the ratoon part.")
formula("seed needed (quintals) = area to plant  x  65")
box("WORKED EXAMPLE - CoS 13235, the only variety short of seed", [
    "Area to be planted        =  4,500 hectares",
    "Seed needed  =  4,500 x 65  =  292,500 quintals",
    "Seed available            =  288,643 quintals",
    "                              ----------------",
    "Short by                  =    3,857 quintals",
], colour="FFF2CC")

h(2, "Check 9 - Will the cane get sweeter?")
p("Each variety has its own sweetness. The mill's overall sweetness is the average of all "
  "varieties, but weighted - a variety covering more land counts for more.")
formula("blended sweetness = sum of (area x sweetness)  /  sum of areas")
box("WORKED EXAMPLE - understanding a weighted average", [
    "Suppose only 2 varieties existed:",
    "   60 ha at 17.0% sweetness",
    "   40 ha at 18.5% sweetness",
    "",
    "blended = (60 x 17.0 + 40 x 18.5) / (60 + 40)",
    "        = (1020 + 740) / 100",
    "        = 17.6%",
    "",
    "Now move 20 ha from the first variety to the second:",
    "blended = (40 x 17.0 + 60 x 18.5) / 100  =  17.9%",
    "",
    "Same land. Sweeter cane. That is the whole point of the plan.",
])
p("Real answer for the mill: 17.52% today, 17.50% under Scenario A, 17.51% under Scenario B.")

# =============================== PART 5 ===============================
h(1, "Part 5. Job 2 - DECIDING what to plant")
p("These calculations produce the second output file, Plot_Allocation_2027-28.xlsx.")

h(2, "Step 1 - What arrives by itself, without planting anything")
p("Some of next year's area needs no action: locked fields simply continue as ratoon of the "
  "same variety, plus the small share that takes a second ratoon.")
formula("arrives by itself = locked area  +  ratoon area x 0.036")
box("WORKED EXAMPLE - Co 0118", [
    "Locked (plant + autumn crop)   =  8,592 ha  (approximately)",
    "This much will simply be there next year without doing anything.",
])

h(2, "Step 2 - What still has to be planted")
formula("still to plant = target  -  what arrives by itself")
box("WORKED EXAMPLES", [
    "Co 0118      :  18,240 - 8,592.54  =   9,647.46 ha to plant",
    "CoLK 94184   :   8,550 - 7,302.20  =   1,247.80 ha to plant",
    "CoLK 14201   :   6,270 - 1,890.58  =   4,379.42 ha to plant",
    "CoS 13231    :   3,990 - 1,220.63  =   2,769.37 ha to plant",
])

h(2, "Step 3 - The IF rule (this is the clever part)")
p("Here is a real problem. The plan needs THREE kinds of land - dry (upland), medium "
  "(midland), and wet (lowland). But our computer system only records TWO: upland and "
  "lowland. There is no midland at all.")
p("The old solution was to send teams to all 334 villages to classify them. That would take "
  "months. Instead we do this:")
box("THE IF RULE", [
    "For every field the system calls UPLAND, we ask TWO questions:",
    "",
    "   Question A: if this field is really dry upland, what should we plant?",
    "   Question B: if this field is really midland, what should we plant?",
    "",
    "   If both answers are the SAME  ->  just plant it. No visit needed.",
    "   If the answers are DIFFERENT  ->  someone must check the field first.",
], colour="FFF2CC")
p("This is worth doing because most of the time the two answers agree:")
box("HOW MUCH WORK THIS SAVES", [
    "Land recorded as UPLAND            =  43,051 ha",
    "Both answers the same (no visit)   =  26,596 ha",
    "Answers differ (visit needed)      =  16,455 ha",
    "",
    "Only 5 varieties out of 12 are affected. So instead of checking",
    "everything, teams only visit where the answer actually changes.",
])
p("When a field does need checking, the plan does not just say 'go and look'. It gives the "
  "supervisor a complete instruction:")
table(["Column", "Example"], [
    ["Recommend", "CoLK 14201"],
    ["Condition", "ONLY if the field drains within 1-2 days after heavy rain"],
    ["Alternative", "CoS 13231  (plant this instead if water stands longer)"],
], widths=[1.3, 4.6])

h(2, "Step 4 - Choosing the variety for each field")
p("The program goes village by village. Inside a village it deals first with fields growing a "
  "variety being removed, because those are the most urgent. For each free field it scores "
  "every variety that is allowed on that land:")
formula("score = how much of that variety is still needed  x  suitability")
p("Suitability is 1.0 if the variety is recommended for that land, and 0.5 if it is only "
  "tolerated. The variety with the highest score wins the field.")
box("THE STEP THAT IS EASY TO FORGET", [
    "After a field is given to a variety, we must SUBTRACT that field's",
    "area from what that variety still needs:",
    "",
    "    still needed  =  still needed  -  area of this field",
    "",
    "Without this subtraction the same variety keeps winning every field.",
    "This was a real bug: Co 0118 took all 23,163 hectares before it was fixed.",
], colour="FFF2CC")

h(2, "Step 5 - Working out the seed")
formula("seed for a variety (quintals) = hectares allocated  x  65")
box("THE ACTUAL PLAN FOR 2027-28", [
    "Co 0118     9,648 ha  x 65  =   627,131 quintals",
    "CoS 13235   7,511 ha  x 65  =   488,245 quintals",
    "CoLK 14201  4,380 ha  x 65  =   284,687 quintals   (autumn planting)",
    "Co 15023      914 ha  x 65  =    59,397 quintals",
    "CoS 13231     427 ha  x 65  =    27,729 quintals",
    "Co 98014      283 ha  x 65  =    18,385 quintals",
])

# =============================== PART 6 ===============================
h(1, "Part 6. What comes out")
table(["File", "What it holds", "Who uses it"], [
    ["Varietal_Plan_Outcome.xlsx", "11 sheets. All nine checks, both scenarios, the villages needing a visit, the 158 villages with CoLK 14201 on wet land", "Management"],
    ["Plot_Allocation_2027-28.xlsx", "6 sheets. Village-by-village planting plan, urgent actions with farmer names, seed quantities", "Cane department"],
    ["allocation_plots_mill.csv", "62,696 rows - one line per field, with Recommend, Condition and Alternative", "Field supervisors"],
], widths=[2.0, 3.2, 1.3])

h(2, "6.1 Where the allocation ends up")
table(["Variety", "Hectares", "Villages", "Note"], [
    ["Co 0118", "9,648", "259", ""],
    ["CoS 13235", "7,511", "239", ""],
    ["CoLK 14201", "4,380", "71", "must be planted in autumn (Oct-Nov)"],
    ["Co 15023", "914", "46", "the sweetest variety"],
    ["CoS 13231", "427", "129", "for wet land"],
    ["Co 98014", "283", "8", ""],
], widths=[1.3, 1.0, 1.0, 3.2])

h(2, "6.2 Two things the engine refuses to do, on purpose")
lead("It will not plant Co 0238. ", "The mill's proposal asks for 3,990 hectares of it, but "
     "the land rules mark this variety as 'never plant' because it is being removed for red "
     "rot. Rather than quietly planting it, the engine leaves 436 hectares unfilled and shows "
     "the contradiction.")
lead("It cannot fill the wet-land targets. ", "CoLK 94184 is 1,248 ha short and CoS 13231 is "
     "2,343 ha short. The reason is that only 494 hectares of wet land becomes free next year.")
box("BUT PLEASE CHECK THIS ONE", [
    "Our model assumes: plant crop -> ratoon -> then free.",
    "",
    "On wet land that assumption looks wrong. The survey shows wet land is",
    "96% plant crop and only 3.8% ratoon - which suggests wet fields are",
    "ploughed and re-planted EVERY year instead of being ratooned.",
    "",
    "If that is true, far more wet land is actually available and these two",
    "shortages mostly disappear. The cane department should confirm.",
], colour="FFE0E0")

# =============================== PART 7 ===============================
h(1, "Part 7. Three mistakes that were found and fixed")
p("These were real errors in the program. They are listed so that anyone checking old "
  "printouts knows why the numbers changed.")
table(["#", "The mistake", "Effect", "Now"], [
    ["1", "The plan has a row called 'Others' pooling all minor varieties. The program looked for a variety actually named 'Others', found none, treated it as zero, and concluded 3,500 ha had to be planted - when in fact 7,147 ha of minor varieties must SHRINK to 3,500.",
     "Scenario A showed 12,465 ha instead of 8,965 ha", "Fixed"],
    ["2", "When a field was given to a variety, the program forgot to reduce that variety's remaining requirement.",
     "Co 0118 was assigned all 23,163 ha; every other variety got nothing", "Fixed"],
    ["3", "The Fulfilment sheet subtracted the allocated area twice - once inside the requirement and once again in the shortfall column.",
     "CoS 13231 shortage shown as 1,916 ha instead of 2,343 ha", "Fixed"],
], widths=[0.3, 3.0, 1.8, 0.6])
p("After fixing, every row of the Fulfilment sheet was re-checked by hand: target minus what "
  "arrives by itself now equals what has to be planted, on all eight varieties.")

# =============================== PART 8 ===============================
h(1, "Part 8. What the engine still cannot do")
bullet("It compares plans against a survey that is about 2,832 hectares incomplete. A full "
       "extract has been requested.", b="The data is not final. ")
bullet("Which variety may go on which land sits inside the program code, not in the Excel "
       "workbook. An agronomist cannot change it without a programmer.", b="The land rules are hidden. ")
bullet("Nobody has yet entered a single recovery figure, so the engine cannot prove the plan "
       "is working.", b="No results are being recorded. ")
bullet("Nothing stops the program making one whole village a single variety. A village-level "
       "limit would spread the risk better.", b="No village-level safety limit. ")
bullet("The program does not know whether a village has enough seed nearby - it works with "
       "mill-wide totals only.", b="Seed is not tracked by village. ")

# =============================== PART 9 ===============================
h(1, "Part 9. Every formula on one page")
table(["What", "Formula"], [
    ["Farmer's share of a field", "field area x percentage / 100"],
    ["Ratoon-again rate", "ratoon II / (ratoon + ratoon II) = 3.6%"],
    ["Replant budget", "ratoon x (1 - 0.036) + ratoon II = 22,503 ha"],
    ["Share of a variety", "area of variety / total area x 100"],
    ["New planting needed", "target - what arrives by itself (never below zero)"],
    ["Plan is possible?", "total need <= replant budget"],
    ["Year-3 concentration", "year-3 target / 57,000 x 100  (limit 25%, hard limit 40%)"],
    ["Wet-land cover", "(CoLK 94184 + CoS 13231 + Co 98014) / total x 100  (at least 28%)"],
    ["Disease rate", "diseased fields of a variety / all its fields x 100  (limit 2%)"],
    ["Seed needed", "hectares to plant x 65 quintals"],
    ["Blended sweetness", "sum(area x sweetness) / sum(area)"],
    ["Arrives by itself", "locked area + ratoon area x 0.036"],
    ["Field score in allocation", "still needed x suitability (1.0 recommended, 0.5 tolerated)"],
    ["After each assignment", "still needed = still needed - area of that field"],
], widths=[2.0, 4.5])

h(1, "Part 10. How to run it")
table(["Command", "When to use it"], [
    ["python build/extract_2627.py", "Only when a new survey file arrives. Takes about a minute."],
    ["python run_plan.py", "After changing any input. Produces the checking file."],
    ["python build/allocate.py MILL", "Produces the planting plan using the mill's proposal."],
    ["python build/allocate.py DOC", "Same, but using the Guiding Document's targets."],
], widths=[2.4, 4.1])
p("Rules that keep the numbers trustworthy:", bold=True)
bullet("Never rename a sheet or a column heading in the input workbooks - the program finds "
       "data by those exact names.")
bullet("Keep one master copy of each workbook. Do not circulate separate copies and edit them "
       "in parallel.")
bullet("The two output files are rewritten every run. Save a dated copy before a meeting.")

doc.save(OUT)
print("saved:", OUT)
