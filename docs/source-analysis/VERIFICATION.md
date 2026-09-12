# Source-Extraction Verification Report

Second-pass verification of `docs/source-analysis/*.md` against the three raw
source artefacts, performed with **independent, industry-standard tooling** —
the original extraction used a hand-written pure-stdlib Jet/ACE parser
(`tools/mdb/`) because the agent workspace proxy blocks npm/PyPI/apt.

## Method

| Artefact | First pass (original session) | Second pass (this verification) |
|---|---|---|
| `Access_database.mdb` | `tools/mdb/mdbread.py` (pure-Python Jet4/ACE reader) | **mdbtools** (`mdb-tables`, `mdb-export`, `mdb-schema`, `mdb-queries`) installed via apt in a GitLab CI job (the workspace proxy blocks package registries; CI has network) |
| `Project_.xlsx` | `tools/mdb/xlsx_dump.py` | **openpyxl** in CI **and** direct stdlib `zipfile`+`ElementTree` XML parse in the workspace |
| `Project_hololens.pptx` | `tools/mdb/pptx_dump.py` | **python-pptx** in CI **and** direct stdlib `zipfile`+`ElementTree` XML parse in the workspace |

Automated checker: [`tools/verify/verify_sources.py`](../../tools/verify/verify_sources.py)
with expectations in [`tools/verify/expected_mdb.json`](../../tools/verify/expected_mdb.json)
(derived from the docs). It asserts: full table list, every table's column list,
every table's row count, data spot-checks, the saved-query list, all Excel
structure (sheet, dimension, validations, merges, cell values, non-empty cell
count) and PPTX structure (slides, titles, key text fragments, properties).

- First CI run (found the discrepancies): pipeline [#2843419146](https://gitlab.com/panga-group2/project-manager/-/pipelines/2843419146) — 82 checks, 2 failures.
- Missing-object dump: pipeline [#2843422704](https://gitlab.com/panga-group2/project-manager/-/pipelines/2843422704), job `dump:missing-objects`.
- Final green run after doc corrections: see the verification pipeline linked in the MR that introduced this file.

## Results

### Access_database.mdb

| Check | Result |
|---|---|
| File identity (5,423,104 bytes, ACE/Access-2010, 4096-byte pages, 1324 pages) | ✅ confirmed by `mdb-ver` |
| 27 originally documented user tables: names, column lists, row counts | ✅ all match mdbtools exactly |
| Full data export | ✅ spot-checks across 7 tables match byte-for-byte; both parsers agree on every shared row |
| 27 originally documented saved queries | ✅ all present |
| Relationships (28 rows in MSysRelationships) | ✅ |
| **Discrepancy 1 — missed live tables** | ❌ → **fixed**: `tblMeetingMinutes` (5 rows), `tblFinancialDocuments` (9 rows, the MSSS document-type lookup) and `Switchboard Items` (0 rows) exist. Their MSysObjects catalog slots carry the `0x8000` (deleted) row flag, which `mdbread.py` skips but mdbtools honours as live. Schemas + full data added to `access-database.md` §2/§4. |
| **Discrepancy 2 — missed saved queries** | ❌ → **fixed**: 6 additional named queries (`qryDailyItemsAndStatusType`, `qryKeyReqDeliverables`, `qryMeetingParticipants`, `qryProject3rdPartySupplier`, `qryProjectfrmQA`, `qryQuesAns`) — SQL recovered via `mdb-queries` and added to `access-database.md` §5. Total named queries: **33**, not 27. |
| Knock-on corrections | The "orphaned relationships" claim was wrong — the `Meeting → Agenda` and `Financials/FinancialDocuments → ProjectFinancialDocuments` chains are intact. `requirements.md` updated: 5 meetings (not 3), document-type lookup data now available for seeding. |

Impact of the recovered data on the rebuild: the **meetings module** now has real
parent-row seed data (subjects, locations, start/end times, conclusions,
follow-ups) and the **financials module** has the authoritative list of the 9
MSSS document types (DA, DAS, Demande de Signature, Dossier d'orpportunite
[sic], Appel d'offer/Call for Tender, Montage Financier, Requisation [sic], A1,
Signed Direct Contract).

Still not extracted (unchanged limitation, inventoried by name only): VBA
module source code (`TodoList Alerts`, `ApplyTextStrikethrough`,
`GetConcatFields`, `Module1`), binary form/report layouts, index definitions.
The behaviour of the alert VBA is recoverable from the `tblTodoList` alert
columns + `qryUpcomingAlerts`, which are fully extracted.

### Project_.xlsx

✅ **Verified 100 % — no discrepancies.** Single sheet `Sheet1`, dimension
`B1:E78`, all 154 non-empty cells match `excel-workbook.md` cell-for-cell
(including all 78 checklist rows), the single list validation
(`" Not Started, In progress, Completed"` over `D3:D78` ranges), 5 merged
ranges, no formulas, no named ranges, 5 embedded images.

### Project_hololens.pptx

✅ **Verified 100 % — no discrepancies.** 3 slides (IT Resource Planning /
Financials $$$ / Parking Lot Items), every paragraph matches
`hololens-presentation.md`, notes slides, SmartArt (IT Security /
IT Infrastructure / IT Local Techs / User Training / IT Interfaces),
document properties, 20 media files, VBA project (16,384 bytes),
14 ActiveX controls.

## How to re-run

```sh
# needs network for apt/pip — run in CI (workspace proxy blocks registries):
apt-get install -y mdbtools && pip install openpyxl python-pptx
python tools/verify/verify_sources.py   # exit 0 = green; writes verify-report.txt
```

A `verify:sources` job (manual) is available in `.gitlab-ci.yml` once the
foundation module is merged.
