# GannaDisha — Varietal Planning System

Three-year sugarcane varietal planning for **Gobind Sugar Mills, Aira** (Lakhimpur Kheri, Uttar Pradesh).

Reads the mill's plot-wise ERP survey and produces a plan down to the individual
plot: which variety to grow, where, and in which year.

---

## No data in this repository

The survey carries grower names, village names and GPS corners for 74,283
growers across 178,635 plots. **None of it is committed here.** The app ships
empty and reads whatever survey is uploaded to it.

To run with real data, place the files yourself:

```
Plot Wise Survey Report 2026-2027.xlsx     project root   (upload via the app)
plan_inputs/                               generated locally, see below
varietal-planning-system/public/baseline.json   optional quick-load file
```

---

## The six screens

| Step | Screen | What it does |
|------|--------|--------------|
| 1 | Baseline Data | Reads the survey. 238,334 records in ~30s, in the browser |
| 2 | Varietal Registry | What each variety *is* — land, season, sucrose, red rot, seed |
| 3 | Agronomic Rules | The mill's own settings: seed rate, ratoon assumptions, caps |
| 4 | Seed & Strategy | Expand / hold / reduce / exit, and how much cane to keep as seed |
| 5 | 3-Year Trajectory | Area, blended sucrose, recovery, and what it is worth |
| 6 | Village Dispatch | Plot-level allocation across three years |

---

## Running it

```bash
cd varietal-planning-system
npm install
npm run dev          # http://localhost:5173
npm run dev -- --host   # also reachable on the LAN, for a tablet
```

Upload the survey `.xlsx` on Step 1. Everything else follows from it.

## Building the input sheets

Python scripts in `build/` generate the Excel files the cane department fills in:

```bash
python build/extract_2627.py        # survey -> parquet cache (~3 min)
python build/make_baseline.py       # -> plan_inputs/baseline.json
python build/make_input_workbook.py # -> the combined input workbook
python build/make_step_inputs.py    # -> Step 3 and Step 4 sheets
```

Documentation generators (`make_steps_1_3_doc.py`, `make_variable_logic_doc.py`)
produce Word documents explaining the engine in plain language.

---

## How it works

The idea the whole system rests on: **a ratoon field cannot change variety.**
A plot runs plant → ratoon → plough out, and while a crop is standing its
variety was decided last season. At Gobind only about 23,300 ha of 56,491 is
free to replant in any year, so that is what a plan can actually touch.

Everything else follows — how fast a variety can spread, how much cane must be
held back as seed rather than crushed, and which plots are available when.

`Varietal Engine - How Every Variable Is Used.docx` (generated, not committed)
documents every input, its formula, and a worked example.

---

## Notes for deployment

- The app is a static Vite build — `npm run build` produces `dist/`.
- Parsing happens entirely in the browser; there is no server-side component.
- `baseline.json` is ~18 MB and optional. The `.xlsx` upload path needs nothing
  pre-loaded.
- Keep the survey files off any public host.

## Stack

React 19 · TypeScript · Tailwind v4 · Vite · fflate (XLSX read/write in-browser)
· recharts · Python/pandas/openpyxl for the offline generators
