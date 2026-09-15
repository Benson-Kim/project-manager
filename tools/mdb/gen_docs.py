#!/usr/bin/env python3
"""Generate docs/source/analysis markdown from the JSON dumps produced by
mdbread.py / xlsx_dump.py / pptx_dump.py."""
import json, sys, re, datetime
sys.path.insert(0, '.')
from mdbread import Mdb

OUT = "../../docs/source/analysis"

ACCESS_TO_MSSQL = {
    "BOOL": "BIT", "BYTE": "TINYINT", "INT": "SMALLINT", "LONG": "INT",
    "MONEY": "MONEY", "FLOAT": "REAL", "DOUBLE": "FLOAT", "DATETIME": "DATETIME2",
    "BINARY": "VARBINARY(510)", "TEXT": "NVARCHAR(255)", "OLE": "VARBINARY(MAX)",
    "MEMO": "NVARCHAR(MAX)", "GUID": "UNIQUEIDENTIFIER", "NUMERIC": "DECIMAL(28,6)",
    "COMPLEX": "INT (FK to attachment table)", "BIGINT": "BIGINT",
}

def esc(v):
    if v is None:
        return ""
    s = str(v)
    s = s.replace("|", "\\|").replace("\r\n", "<br>").replace("\n", "<br>").replace("\r", "<br>")
    return s

def md_table(headers, rows):
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        out.append("| " + " | ".join(esc(c) for c in r) + " |")
    return "\n".join(out)

def gen_access():
    d = json.load(open("/tmp/work/mdb_dump.json"))
    m = Mdb("../../docs/source/Access_database.mdb")
    g = m.data_pages_by_table()
    so = m.read_tdef(2)
    objs = m.table_rows(so, g.get(2, []))
    names = {r["Id"]: r["Name"] for r in objs}

    L = []
    L.append("# Access_database.mdb — Complete Extraction\n")
    L.append("Source file: `Access_database.mdb` (5,423,104 bytes, ACE format — \"Standard ACE DB\", "
             "version byte `0x03` = Access 2010 file format, 4096-byte pages, 1324 pages).\n")
    L.append("> Extraction method: the CI environment has no network access to install `mdbtools`, so the "
             "file was parsed with a purpose-built pure-Python Jet4/ACE reader (`tools/mdb/mdbread.py`). "
             "For **every table the number of extracted rows exactly matches the row count declared in the "
             "table definition page**, and no field decoding errors remained. Limitations: VBA module source, "
             "form/report layouts (stored in binary `MSysAccessStorage` streams) and index definitions are "
             "inventoried by name but their binary payloads are not decompiled.\n")

    # ---- inventory ----
    L.append("## 1. Object inventory (from MSysObjects, 244 objects)\n")
    inv = {}
    for r in objs:
        inv.setdefault(r["Type"], []).append(r["Name"])
    type_names = {1: "Local table", 2: "Database", 3: "Container", 5: "Query (QueryDef)",
                  8: "Relationship layout", 6: "Linked table", -32768: "Form", -32766: "Macro",
                  -32764: "Report", -32761: "Module", -32757: "Database property blob"}
    for t in sorted(inv, key=lambda x: (x < 0, abs(x))):
        L.append(f"### Type {t} — {type_names.get(t, 'Other')} ({len(inv[t])})\n")
        L.append(", ".join(f"`{n}`" for n in sorted(inv[t])) + "\n")

    # ---- schema ----
    tables = sorted([(r["Id"], r["Name"]) for r in objs
                     if r["Type"] == 1 and not r["Name"].startswith(("MSys", "~", "f_"))],
                    key=lambda x: x[1])
    att = sorted([(r["Id"], r["Name"]) for r in objs
                  if r["Type"] == 1 and r["Name"].startswith("f_")], key=lambda x: x[1])

    L.append("## 2. Table schemas (data dictionary)\n")
    L.append("Suggested SQL Server type mapping is included per column (used by `db/migrations`).\n")
    for tid, name in tables:
        t = d[name]
        L.append(f"### `{name}` ({len(t['rows'])} rows)\n")
        rows = [(c["name"], c["type"], c["size"] if c["type"] == "TEXT" else "",
                 "fixed" if c["fixed"] else "var", ACCESS_TO_MSSQL.get(c["type"], "?"))
                for c in t["cols"]]
        L.append(md_table(["Column", "Access type", "Size (bytes, UTF-16)", "Storage", "SQL Server type"], rows) + "\n")

    L.append("### Attachment (complex-column) side tables\n")
    L.append("Access 2010 attachment columns are stored in hidden `f_*` tables (from `MSysComplexColumns`):\n")
    cc = m.read_tdef(18)
    ccrows = m.table_rows(cc, g.get(18, []))
    rows = [(r["ColumnName"], names.get(r["FlatTableID"], r["FlatTableID"]),
             names.get(r["ConceptualTableID"], r["ConceptualTableID"])) for r in ccrows]
    L.append(md_table(["Attachment column", "Hidden storage table", "Owning table"], rows) + "\n")

    # ---- relationships ----
    L.append("## 3. Relationships (MSysRelationships, 28 rows)\n")
    L.append("`grbit` flags: `0x0` = enforced RI, `0x1000000` (16777216) = left-join display, "
             "`0x2` = don't enforce, `0x100` = cascade update, `0x1000` = cascade delete.\n")
    rel = d["MSysRelationships"]["rows"]
    rows = [(r["szObject"], r["szColumn"], "→", r["szReferencedObject"], r["szReferencedColumn"], r["grbit"])
            for r in rel if not r["szObject"].startswith("MSys")]
    L.append(md_table(["Child table", "Child column", "", "Parent table", "Parent column", "grbit"], rows) + "\n")
    L.append("> **Orphaned relationships:** `tblMeetingMinutes` and `tblFinancialDocuments` appear as relationship "
             "endpoints but no longer exist as tables — they were deleted/renamed at some point "
             "(`tblMeetingAgenda`/`tblProjectFinancialDocuments` are their successors). The rebuild re-instates "
             "a proper `MeetingMinutes` parent entity.\n")

    # ---- data ----
    L.append("## 4. Full data export (all rows, all user tables)\n")
    for tid, name in tables:
        t = d[name]
        L.append(f"### `{name}` — {len(t['rows'])} rows\n")
        if not t["rows"]:
            L.append("_(empty table)_\n")
            continue
        cols = [c["name"] for c in t["cols"]]
        rows = [[r.get(c) for c in cols] for r in t["rows"]]
        L.append(md_table(cols, rows) + "\n")

    # ---- queries ----
    L.append("## 5. Saved queries (MSysQueries, reconstructed)\n")
    L.append("Access stores QueryDefs as attribute rows. Reconstruction below: `5` = FROM table, `6` = SELECT "
             "column (Name1 = alias), `7` = JOIN (Flag 1=INNER 2=LEFT 3=RIGHT), `8` = WHERE, `9` = GROUP BY, "
             "`11` = HAVING, `12` = ORDER BY, `3` = parameter. UI-generated `~sq_*` record-source queries for "
             "forms/reports are listed but not expanded.\n")
    byq = {}
    for r in d["MSysQueries"]["rows"]:
        byq.setdefault(r["ObjectId"], []).append(r)
    def order_key(r):
        o = r.get("Order")
        try: return int(str(o), 16)
        except Exception: return 0
    for oid in sorted(byq, key=lambda o: (names.get(o) or "").lower()):
        qname = names.get(oid)
        if not qname:
            continue
        if qname.startswith("~"):
            continue
        rows = sorted(byq[oid], key=order_key)
        sel, frm, joins, where, group, having, orderby, params = [], [], [], [], [], [], [], []
        for r in rows:
            a = r["Attribute"]
            if a == 5 and r.get("Name1"):
                frm.append(r["Name1"] + (f" AS {r['Name2']}" if r.get("Name2") else ""))
            elif a == 6:
                e = r.get("Expression") or ""
                if r.get("Name1"): e += f" AS [{r['Name1']}]"
                if e: sel.append(e)
            elif a == 7:
                jt = {1: "INNER JOIN", 2: "LEFT JOIN", 3: "RIGHT JOIN"}.get(r.get("Flag"), "JOIN")
                joins.append(f"{r.get('Name1')} {jt} {r.get('Name2')} ON {r.get('Expression')}")
            elif a == 8 and r.get("Expression"): where.append(r["Expression"])
            elif a == 9 and r.get("Expression"): group.append(r["Expression"])
            elif a == 11 and r.get("Expression"): having.append(r["Expression"])
            elif a == 12 and r.get("Expression"):
                orderby.append(r["Expression"] + (" DESC" if r.get("Name1") == "DESC" else ""))
            elif a == 3 and (r.get("Name1") or r.get("Expression")):
                params.append(f"{r.get('Name1') or ''} {r.get('Expression') or ''}".strip())
        L.append(f"### `{qname}`\n")
        sql = "SELECT " + (",\n       ".join(sel) if sel else "*")
        sql += "\nFROM " + (", ".join(frm) if frm else "(joined tables below)")
        for j in joins: sql += "\n  " + j
        if where: sql += "\nWHERE " + " AND ".join(where)
        if group: sql += "\nGROUP BY " + ", ".join(group)
        if having: sql += "\nHAVING " + " AND ".join(having)
        if orderby: sql += "\nORDER BY " + ", ".join(orderby)
        if params: sql = "-- PARAMETERS: " + "; ".join(params) + "\n" + sql
        L.append("```sql\n" + sql + "\n```\n")
    ui_q = sorted(n for n in (names.get(o) for o in byq) if n and n.startswith("~"))
    L.append("### UI record-source queries (`~sq_*`, not expanded)\n")
    L.append(", ".join(f"`{n}`" for n in ui_q) + "\n")

    open(f"{OUT}/access-database.md", "w").write("\n".join(L))
    print("access-database.md written", len("\n".join(L)), "chars")

def gen_xlsx():
    x = json.load(open("/tmp/work/xlsx_dump.json"))
    L = []
    L.append("# Project_.xlsx — Complete Extraction\n")
    L.append("Requirements checklist workbook for the rebuild of the Access project-management system.\n")
    L.append("## Document properties\n")
    L.append(md_table(["Property", "Value"], sorted(x["doc_props"].items())) + "\n")
    s = x["sheets"]["Sheet1"]
    L.append(f"## Sheet `Sheet1` (dimension `{s['dimension']}`)\n")
    L.append("### Data validation\n")
    for v in s["validations"]:
        L.append(f"- Type `{v['type']}`, ranges `{v['sqref']}`, list: `{v['formula1']}` "
                 "(the Status column is a dropdown: Not Started / In progress / Completed)\n")
    L.append("### Merged cells\n")
    L.append(", ".join(f"`{m}`" for m in s["merges"]) + "\n")
    L.append("### Full cell contents\n")
    L.append("Layout: column B = section / requirement, C = sub-requirement detail, D = status, E = comments.\n")
    def key(ref):
        m = re.match(r"([A-Z]+)(\d+)", ref)
        col = 0
        for ch in m.group(1): col = col * 26 + ord(ch) - 64
        return (int(m.group(2)), col)
    rows = []
    byrow = {}
    for ref in s["cells"]:
        r, c = key(ref)
        byrow.setdefault(r, {})[ref[0]] = s["cells"][ref]
    for r in sorted(byrow):
        cells = byrow[r]
        rows.append((r, (cells.get("B") or {}).get("v"), (cells.get("C") or {}).get("v"),
                     (cells.get("D") or {}).get("v"), (cells.get("E") or {}).get("v")))
    L.append(md_table(["Row", "B (section / requirement)", "C (detail)", "D (status)", "E (comments)"], rows) + "\n")
    forms = [(ref, c["f"]) for ref, c in s["cells"].items() if c.get("f")]
    L.append("### Formulas\n")
    L.append((md_table(["Cell", "Formula"], forms) if forms else "_No formulas in the workbook._") + "\n")
    L.append("### Named ranges\n")
    L.append(("None defined." if not x["defined_names"] else md_table(["Name", "Ref"], [(n["name"], n["ref"]) for n in x["defined_names"]])) + "\n")
    L.append("### Embedded media\n")
    L.append("`xl/media/image1..5.png` — screenshots embedded via `drawing1.xml` (prototype/reference images, no text layer).\n")
    open(f"{OUT}/excel-workbook.md", "w").write("\n".join(L))
    print("excel-workbook.md written")

def gen_pptx():
    p = json.load(open("/tmp/work/pptx_dump.json"))
    L = []
    L.append("# Project_hololens.pptx — Complete Extraction\n")
    L.append("Despite the filename, this deck is **\"Project Dossier Medical Electronique (DME)\"** — mock-ups / "
             "worked examples of three screens of the project-management system (IT Resource Planning, "
             "Financials, Parking Lot Items) filled in with data from a real hospital IT project.\n")
    L.append("## Document properties\n")
    L.append(md_table(["Property", "Value"], [(k, v if not isinstance(v, list) else ", ".join(v))
                                              for k, v in p["doc_props"].items()]) + "\n")
    for i, s in enumerate(p["slides"], 1):
        L.append(f"## Slide {i} (`{s['file']}`)\n")
        L.append("### All text (paragraph order)\n")
        for para in s["paragraphs"]:
            L.append(f"- {esc(para)}")
        L.append("")
        for t in s["tables"]:
            L.append("### Table\n")
            L.append(md_table(t[0], t[1:]) + "\n")
    L.append("## Notes slides\n")
    for k, v in sorted(p["notes"].items()):
        L.append(f"- Slide {k} notes: " + "; ".join(esc(x) for x in v))
    L.append("\n## SmartArt diagram (`ppt/diagrams/data1.xml`, slide 1)\n")
    L.append("Five-node diagram of IT resource-planning concerns:\n")
    for para in p["diagrams"].get("ppt/diagrams/data1.xml", []):
        L.append(f"- {esc(para)}")
    L.append("\n## Embedded automation\n")
    L.append(f"- VBA project: {p['vba']} — the deck's \"Add Button\" elements add rows dynamically; "
             "confirms the slides are an interactive mock-up of data-entry screens.")
    L.append(f"- ActiveX controls: {len(p['activex'])} (command buttons used by the mock-up).")
    L.append("- Media: 20 images (PNG/WMF/SVG) — screenshots and clip-art, no additional text content.")
    open(f"{OUT}/hololens-presentation.md", "w").write("\n".join(L))
    print("hololens-presentation.md written")

if __name__ == "__main__":
    gen_access(); gen_xlsx(); gen_pptx()
