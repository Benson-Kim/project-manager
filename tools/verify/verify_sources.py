#!/usr/bin/env python3
"""Independent verification of docs/source/analysis extraction.

Cross-checks the three source artefacts with *industry-standard tooling*
(mdbtools, openpyxl, python-pptx) against the facts recorded in
docs/source/analysis/*.md (encoded in tools/verify/expected_mdb.json and
inline below). The original extraction used a hand-written pure-stdlib
parser (tools/mdb/), so this script is the independent second opinion.

Run from the REPOSITORY ROOT (needs network to install tooling):
    apt-get install -y mdbtools && pip install openpyxl python-pptx
    python tools/verify/verify_sources.py

The three artefacts default to docs/source/; override for an out-of-tree copy:
    python tools/verify/verify_sources.py --mdb /path/to/Access_database.mdb

Exit code 0 = all checks passed. A report is written to verify-report.txt.
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys

# Defaults resolve from the repository root (docs/source/); override on the CLI.
SOURCE_DIR = "docs/source"
MDB = f"{SOURCE_DIR}/Access_database.mdb"
XLSX = f"{SOURCE_DIR}/Project_.xlsx"
PPTX = f"{SOURCE_DIR}/Project_hololens.pptx"

report = []
failures = []


def check(name, ok, detail=""):
    line = f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else "")
    report.append(line)
    print(line)
    if not ok:
        failures.append(name)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def verify_mdb():
    exp = json.load(open("tools/verify/expected_mdb.json"))
    tables = set(run(["mdb-tables", "-1", MDB]).splitlines()) - {""}
    exp_tables = set(exp["tables"])
    check("mdb: user table list matches docs (30 tables)", tables == exp_tables,
          f"missing={sorted(exp_tables - tables)} extra={sorted(tables - exp_tables)}")

    for tname, spec in sorted(exp["tables"].items()):
        out = run(["mdb-export", MDB, tname])
        rows = list(csv.reader(io.StringIO(out)))
        header, data = rows[0], rows[1:]
        check(f"mdb: {tname} columns match docs", header == spec["columns"],
              f"got {header}" if header != spec["columns"] else "")
        check(f"mdb: {tname} row count = {spec['row_count']}", len(data) == spec["row_count"],
              f"got {len(data)}")

    # spot-check individual values recorded in docs/source/analysis/access-database.md
    for sc in exp["spot_checks"]:
        out = run(["mdb-export", MDB, sc["table"]])
        rows = list(csv.reader(io.StringIO(out)))
        header, data = rows[0], rows[1:]
        pk_i, col_i = header.index(sc["pk"]), header.index(sc["column"])
        val = next((r[col_i] for r in data if r[pk_i] == sc["pk_value"]), None)
        check(f"mdb: {sc['table']}.{sc['column']} (pk={sc['pk_value']}) == {sc['expected']!r}",
              val == sc["expected"], f"got {val!r}")

    # saved queries
    try:
        qnames = set(run(["mdb-queries", "-1", MDB]).split("\n")) - {""}
        named = {q for q in qnames if not q.startswith("~")}
        check("mdb: 33 named saved queries match docs", named == set(exp["queries"]),
              f"missing={sorted(set(exp['queries']) - named)} extra={sorted(named - set(exp['queries']))}")
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        check("mdb: saved query list (mdb-queries)", False, f"tool unavailable: {e}")


def verify_xlsx():
    import openpyxl
    wb = openpyxl.load_workbook(XLSX)
    check("xlsx: single sheet 'Sheet1'", wb.sheetnames == ["Sheet1"])
    ws = wb["Sheet1"]
    check("xlsx: dimension B1:E78", ws.calculate_dimension() == "B1:E78",
          ws.calculate_dimension())
    dvs = list(ws.data_validations.dataValidation)
    check("xlsx: 1 list validation (Not Started/In progress/Completed)",
          len(dvs) == 1 and dvs[0].type == "list"
          and dvs[0].formula1 == '" Not Started, In progress, Completed"',
          f"{[(d.type, d.formula1) for d in dvs]}")
    merges = {str(m) for m in ws.merged_cells.ranges}
    check("xlsx: merged cells match docs",
          merges == {"B2:C2", "B1:E1", "B39:E39", "B63:E63", "B68:E68"}, sorted(merges))
    spot = {
        "B1": "Checklist",
        "C5": "0.2-The system must have a responsive field where the actor can type the "
              "beginning of the project name and it will find the name in the drop down list.",
        "B39": "Items to Remember",
        "B58": "Create a Search field under keywords.",
        "B63": "Potential Additional Requirements",
        "B68": "Add ons",
        "E64": "Will provide the prototype if needed",
    }
    for ref, expval in spot.items():
        check(f"xlsx: cell {ref}", ws[ref].value == expval, repr(ws[ref].value))
    n = sum(1 for row in ws.iter_rows() for c in row if c.value is not None)
    check("xlsx: 154 non-empty cells", n == 154, str(n))


def verify_pptx():
    from pptx import Presentation
    prs = Presentation(PPTX)
    check("pptx: 3 slides", len(prs.slides) == 3, str(len(prs.slides)))
    titles = []
    for slide in prs.slides:
        texts = [p.text for shape in slide.shapes if shape.has_text_frame
                 for p in shape.text_frame.paragraphs if p.text.strip()]
        titles.append(texts[0] if texts else "")
    check("pptx: slide titles = IT Resource Planning / Financials $$$ / Parking Lot Items",
          titles == ["IT Resource Planning", "Financials $$$", "Parking Lot Items"], str(titles))
    s2 = "\n".join(p.text for sh in prs.slides[1].shapes if sh.has_text_frame
                   for p in sh.text_frame.paragraphs)
    for frag in ["Budget Envelop (source de financement)", "PMT EIRI", "1018732",
                 "DAS (Dossier Affaire Simplifier):", "Montage Financier:",
                 "900,000$ exploitation Non-Cap"]:
        check(f"pptx: slide 2 contains {frag!r}", frag in s2)
    s3 = "\n".join(p.text for sh in prs.slides[2].shapes if sh.has_text_frame
                   for p in sh.text_frame.paragraphs)
    check("pptx: slide 3 has all 10 parking-lot items",
          all(f"{i}-" in s3 for i in range(1, 11)))
    check("pptx: title property", prs.core_properties.title ==
          "Project Dossier Medical Electronic (DME)", prs.core_properties.title)


def _parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mdb", default=MDB, help=f"Access database (default: {MDB})")
    ap.add_argument("--xlsx", default=XLSX, help=f"Excel workbook (default: {XLSX})")
    ap.add_argument("--pptx", default=PPTX, help=f"PowerPoint deck (default: {PPTX})")
    ap.add_argument("--report", default="verify-report.txt",
                    help="report output path (default: verify-report.txt)")
    return ap.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    MDB, XLSX, PPTX = args.mdb, args.xlsx, args.pptx
    for label, path in (("mdb", MDB), ("xlsx", XLSX), ("pptx", PPTX)):
        if not os.path.exists(path):
            sys.exit(f"{label} artefact not found: {path} (run from the repository root)")
    verify_mdb()
    verify_xlsx()
    verify_pptx()
    report.append("")
    report.append(f"TOTAL: {len(report) - 2} checks, {len(failures)} failures")
    print(report[-1])
    with open(args.report, "w") as f:
        f.write("\n".join(report) + "\n")
    sys.exit(1 if failures else 0)
