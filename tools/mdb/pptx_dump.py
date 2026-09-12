#!/usr/bin/env python3
"""Dump all text from every slide, notes, tables, diagrams of a .pptx using only stdlib."""
import zipfile, sys, json, re
import xml.etree.ElementTree as ET

A = "http://schemas.openxmlformats.org/drawingml/2006/main"

def paragraphs(root):
    """Return list of paragraph strings from any drawingml tree."""
    paras = []
    for p in root.iter("{%s}p" % A):
        parts = []
        for el in p.iter():
            tag = el.tag.split("}")[-1]
            if tag == "t" and el.text:
                parts.append(el.text)
            elif tag == "br":
                parts.append("\n")
        s = "".join(parts)
        if s.strip():
            paras.append(s)
    return paras

def tables(root):
    tbls = []
    for tbl in root.iter("{%s}tbl" % A):
        rows = []
        for tr in tbl.findall("{%s}tr" % A):
            row = []
            for tc in tr.findall("{%s}tc" % A):
                row.append(" ".join(paragraphs(tc)))
            rows.append(row)
        tbls.append(rows)
    return tbls

def main(path):
    z = zipfile.ZipFile(path)
    out = {"slides": [], "notes": {}, "diagrams": {}, "doc_props": {}, "vba": None, "activex": []}
    slide_names = sorted([n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)],
                         key=lambda n: int(re.search(r"\d+", n).group()))
    for n in slide_names:
        root = ET.fromstring(z.read(n))
        out["slides"].append({"file": n, "paragraphs": paragraphs(root), "tables": tables(root)})
    for n in sorted(z.namelist()):
        m = re.match(r"ppt/notesSlides/notesSlide(\d+)\.xml$", n)
        if m:
            out["notes"][m.group(1)] = paragraphs(ET.fromstring(z.read(n)))
        if re.match(r"ppt/diagrams/data\d+\.xml$", n):
            out["diagrams"][n] = paragraphs(ET.fromstring(z.read(n)))
    for p in ("docProps/core.xml", "docProps/app.xml"):
        if p in z.namelist():
            root = ET.fromstring(z.read(p))
            for el in root.iter():
                tag = el.tag.split("}")[-1]
                if el.text and el.text.strip() and tag not in ("TitlesOfParts", "HeadingPairs", "vector", "lpstr", "variant", "i4"):
                    out["doc_props"].setdefault(tag, el.text.strip())
            # titles of parts
            titles = [el.text for el in root.iter("{http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes}lpstr") if el.text]
            if titles:
                out["doc_props"]["parts"] = titles
    if "ppt/vbaProject.bin" in z.namelist():
        out["vba"] = "present (%d bytes)" % len(z.read("ppt/vbaProject.bin"))
    for n in z.namelist():
        if re.match(r"ppt/activeX/activeX\d+\.xml$", n):
            root = ET.fromstring(z.read(n))
            out["activex"].append({ "file": n, "attrs": dict(root.attrib) })
    json.dump(out, open(sys.argv[2], "w"), indent=1)
    print("slides:", len(out["slides"]), "notes:", len(out["notes"]), "diagrams:", len(out["diagrams"]))

if __name__ == "__main__":
    main(sys.argv[1])
