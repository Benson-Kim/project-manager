#!/usr/bin/env python3
"""Dump every sheet/cell/formula/named range/validation/comment of an .xlsx using only stdlib."""
import zipfile, sys, json, re
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

def txt(el):
    return "".join(el.itertext()) if el is not None else None

def main(path):
    z = zipfile.ZipFile(path)
    out = {"sheets": {}, "shared_strings": [], "defined_names": [], "doc_props": {}}

    # shared strings
    sst = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            sst.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    out["shared_strings_count"] = len(sst)

    # workbook: sheet names, defined names
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    sheets = []
    for sh in wb.iter("{%s}sheet" % NS["m"]):
        sheets.append({"name": sh.get("name"), "sheetId": sh.get("sheetId"),
                       "rid": sh.get("{%s}id" % NS["r"])})
    for dn in wb.iter("{%s}definedName" % NS["m"]):
        out["defined_names"].append({"name": dn.get("name"), "ref": dn.text})

    # rels: rid -> target
    rels = {}
    root = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in root:
        rels[rel.get("Id")] = rel.get("Target")

    for sh in sheets:
        target = "xl/" + rels[sh["rid"]].lstrip("/")
        root = ET.fromstring(z.read(target))
        cells = {}
        for c in root.iter("{%s}c" % NS["m"]):
            ref = c.get("r"); t = c.get("t", "n")
            f = c.find("m:f", NS); v = c.find("m:v", NS)
            is_ = c.find("m:is", NS)
            val = None
            if t == "s" and v is not None:
                val = sst[int(v.text)]
            elif t == "inlineStr":
                val = txt(is_)
            elif v is not None:
                val = v.text
            entry = {}
            if val is not None: entry["v"] = val
            if f is not None: entry["f"] = txt(f)
            if t not in ("n", "s"): entry["t"] = t
            if entry: cells[ref] = entry
        dv = []
        for d in root.iter("{%s}dataValidation" % NS["m"]):
            dv.append({"sqref": d.get("sqref"), "type": d.get("type"),
                       "formula1": txt(d.find("m:formula1", NS))})
        merges = [mc.get("ref") for mc in root.iter("{%s}mergeCell" % NS["m"])]
        out["sheets"][sh["name"]] = {"cells": cells, "validations": dv, "merges": merges,
                                     "dimension": next((d.get("ref") for d in root.iter("{%s}dimension" % NS["m"])), None)}

    # comments
    for n in z.namelist():
        if re.match(r"xl/comments\d*\.xml", n):
            root = ET.fromstring(z.read(n))
            out.setdefault("comments", []).extend(
                {"ref": c.get("ref"), "text": txt(c)} for c in root.iter("{%s}comment" % NS["m"]))

    # doc props
    for p in ("docProps/core.xml", "docProps/app.xml"):
        if p in z.namelist():
            root = ET.fromstring(z.read(p))
            for el in root.iter():
                tag = el.tag.split("}")[-1]
                if el.text and el.text.strip():
                    out["doc_props"][tag] = el.text.strip()
    json.dump(out, open(sys.argv[2], "w"), indent=1)
    print("sheets:", [s["name"] for s in sheets])
    for name, s in out["sheets"].items():
        print(name, "cells:", len(s["cells"]), "dim:", s["dimension"], "validations:", len(s["validations"]))

if __name__ == "__main__":
    main(sys.argv[1])
