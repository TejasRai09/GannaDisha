"""One command for the whole planning pipeline.

  python run_plan.py

Reads the filled workbooks in plan_inputs/ plus the 2026-27 survey cache and
writes plan_outputs/Varietal_Plan_Outcome.xlsx. Re-run any time a workbook or
the survey changes. To regenerate blank templates: python build/make_templates.py
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


def step(script):
    print("== %s" % script)
    r = subprocess.run([sys.executable, os.path.join(ROOT, script)])
    if r.returncode:
        raise SystemExit("failed at %s" % script)


if not os.path.exists(os.path.join(ROOT, "build", "cache", "plots_2627.parquet")):
    step("build/extract_2627.py")
if not os.path.isdir(os.path.join(ROOT, "plan_inputs")):
    step("build/make_templates.py")
step("build/plan_engine.py")
