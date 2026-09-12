#!/usr/bin/env python3
"""Minimal pure-stdlib reader for Microsoft Access Jet4/ACE (.mdb/.accdb) files.
Implements the on-disk format as documented in the mdbtools HACKING notes.
Read-only, best-effort: tables, columns, types, rows, memo (LVAL) data.
Written because the extraction environment had no network access to install
mdbtools; kept in the repo for provenance / re-runs of the data migration.
"""
import struct, sys, datetime

PAGE = 4096

TYPES = {
    0x01: "BOOL", 0x02: "BYTE", 0x03: "INT", 0x04: "LONG", 0x05: "MONEY",
    0x06: "FLOAT", 0x07: "DOUBLE", 0x08: "DATETIME", 0x09: "BINARY",
    0x0A: "TEXT", 0x0B: "OLE", 0x0C: "MEMO", 0x0F: "GUID", 0x10: "NUMERIC",
    0x12: "COMPLEX", 0x13: "BIGINT",
}

def u16(b, o): return struct.unpack_from("<H", b, o)[0]
def u32(b, o): return struct.unpack_from("<I", b, o)[0]

def decode_text(raw):
    if len(raw) >= 2 and raw[0] == 0xFF and raw[1] == 0xFE:
        out, pos, compressed = [], 2, True
        while pos < len(raw):
            if compressed:
                b = raw[pos]
                if b == 0x00:
                    compressed = False; pos += 1
                else:
                    out.append(chr(b)); pos += 1
            else:
                if pos + 1 >= len(raw):
                    break
                ch = raw[pos] | (raw[pos+1] << 8)
                if ch == 0x0000:
                    compressed = True
                else:
                    out.append(chr(ch))
                pos += 2
        return "".join(out)
    try:
        return raw.decode("utf-16-le")
    except Exception:
        return raw.decode("latin-1", "replace")

def jet_date(val):
    try:
        d = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=val)
        return d.isoformat(sep=" ")
    except Exception:
        return repr(val)

class Mdb:
    def __init__(self, path):
        self.data = open(path, "rb").read()
        self.npages = len(self.data) // PAGE
        self.version = self.data[0x14]
        self.tdef_cache = {}

    def page(self, n):
        return self.data[n*PAGE:(n+1)*PAGE]

    # ---- TDEF ----
    def read_tdef(self, pg):
        if pg in self.tdef_cache:
            return self.tdef_cache[pg]
        buf = self.page(pg)
        if buf[0] != 0x02:
            return None
        nxt = u32(buf, 4)
        chain = bytes(buf)
        seen = {pg}
        while nxt and nxt not in seen and nxt < self.npages:
            seen.add(nxt)
            p = self.page(nxt)
            if p[0] != 0x02:
                break
            chain += p[8:]
            nxt = u32(p, 4)
        t = {}
        t["page"] = pg
        t["num_rows"] = u32(chain, 0x10)
        t["autonumber"] = u32(chain, 0x14)
        t["table_type"] = chain[0x28]
        t["max_cols"] = u16(chain, 0x29)
        t["num_var_cols"] = u16(chain, 0x2B)
        t["num_cols"] = u16(chain, 0x2D)
        t["num_idx"] = u32(chain, 0x2F)
        t["num_real_idx"] = u32(chain, 0x33)
        pos = 0x3F + t["num_real_idx"] * 12
        cols = []
        for _ in range(t["num_cols"]):
            c = chain[pos:pos+25]
            col = {
                "type": c[0],
                "type_name": TYPES.get(c[0], "UNKNOWN_%02x" % c[0]),
                "col_num": c[5],
                "offset_V": u16(c, 7),
                "row_col_num": u16(c, 9),
                "misc": u16(c, 11),
                "flags": c[15],
                "fixed": bool(c[15] & 0x01),
                "offset_F": u16(c, 21),
                "size": u16(c, 23),
            }
            cols.append(col)
            pos += 25
        for col in cols:
            nlen = u16(chain, pos); pos += 2
            col["name"] = chain[pos:pos+nlen].decode("utf-16-le", "replace")
            pos += nlen
        cols.sort(key=lambda c: c["col_num"])
        t["cols"] = cols
        self.tdef_cache[pg] = t
        return t

    # ---- rows ----
    def data_pages_by_table(self):
        groups = {}
        for n in range(1, self.npages):
            p = self.page(n)
            if p[0] == 0x01 and p[1] == 0x01:
                if p[4:8] == b"LVAL":
                    continue
                groups.setdefault(u32(p, 4), []).append(n)
        return groups

    def rows_on_page(self, n):
        p = self.page(n)
        nrows = u16(p, 0x0C)
        out = []
        prev = PAGE
        for i in range(nrows):
            off = u16(p, 0x0E + 2*i)
            start = off & 0x1FFF
            deleted = bool(off & 0x8000)
            lookup = bool(off & 0x4000)
            end = prev
            prev = start
            if deleted or lookup:
                continue
            if start >= end or end > PAGE:
                continue
            out.append(p[start:end])
        return out

    def rows_on_page_all(self, n):
        """slot-order rows including placeholders for deleted slots"""
        p = self.page(n)
        nrows = u16(p, 0x0C)
        out = []
        prev = PAGE
        for i in range(nrows):
            off = u16(p, 0x0E + 2*i)
            start = off & 0x1FFF
            end = prev
            prev = start
            out.append(p[start:end] if start < end <= PAGE else b"")
        return out

    def lval(self, memo_raw):
        if len(memo_raw) < 12:
            return None
        ln = u32(memo_raw, 0)
        size = ln & 0x00FFFFFF
        if ln & 0x80000000:
            return memo_raw[12:12+size]
        ptr = u32(memo_raw, 4)
        row = ptr & 0xFF
        pgn = ptr >> 8
        if ln & 0x40000000:
            rows = self.rows_on_page_all(pgn)
            if row < len(rows):
                return rows[row][:size]
            return None
        out = b""
        while pgn and len(out) < size:
            rows = self.rows_on_page_all(pgn)
            if row >= len(rows):
                break
            r = rows[row]
            nxt = u32(r, 0)
            out += r[4:]
            row = nxt & 0xFF
            pgn = nxt >> 8
        return out[:size]

    def crack(self, tdef, row):
        cols = tdef["cols"]
        if len(row) < 2:
            return None
        row_cols = u16(row, 0)
        if row_cols == 0 or row_cols > 255:
            return None
        bitmask_sz = (row_cols + 7) // 8
        mask = row[len(row)-bitmask_sz:]
        var_offsets = []
        if tdef["num_var_cols"] > 0:
            if len(row) < bitmask_sz + 4:
                return None
            row_varcols = u16(row, len(row) - bitmask_sz - 2)
            base = len(row) - bitmask_sz - 2
            if row_varcols > 255:
                return None
            for i in range(row_varcols + 1):
                var_offsets.append(u16(row, base - 2*(i+1)))
        rec = {}
        for col in cols:
            cn = col["col_num"]
            notnull = False
            if cn < row_cols and cn // 8 < len(mask):
                notnull = bool(mask[cn // 8] & (1 << (cn % 8)))
            if col["type"] == 0x01:  # BOOL stored in null mask
                rec[col["name"]] = notnull
                continue
            if not notnull:
                rec[col["name"]] = None
                continue
            if col["fixed"]:
                start = 2 + col["offset_F"]
                raw = row[start:start+col["size"]]
                rec[col["name"]] = self.value(col, raw)
            else:
                vi = col["offset_V"]
                if not var_offsets or vi + 1 >= len(var_offsets) + 0 or vi >= len(var_offsets) - 1:
                    rec[col["name"]] = None
                    continue
                start, end = var_offsets[vi], var_offsets[vi+1]
                if start > end or end > len(row):
                    rec[col["name"]] = None
                    continue
                rec[col["name"]] = self.value(col, row[start:end])
        return rec

    def value(self, col, raw):
        t = col["type"]
        try:
            if t == 0x02: return raw[0]
            if t == 0x03: return struct.unpack("<h", raw[:2])[0]
            if t == 0x04: return struct.unpack("<i", raw[:4])[0]
            if t == 0x05: return struct.unpack("<q", raw[:8])[0] / 10000
            if t == 0x06: return struct.unpack("<f", raw[:4])[0]
            if t == 0x07: return struct.unpack("<d", raw[:8])[0]
            if t == 0x08: return jet_date(struct.unpack("<d", raw[:8])[0])
            if t == 0x0A: return decode_text(raw)
            if t == 0x0C:
                data = self.lval(raw)
                return decode_text(data) if data is not None else None
            if t == 0x0B:
                data = self.lval(raw)
                return "<OLE %d bytes>" % (len(data) if data else 0)
            if t == 0x0F:
                import uuid
                return str(uuid.UUID(bytes_le=bytes(raw[:16])))
            if t == 0x10:
                sign = raw[0]
                n = int.from_bytes(raw[1:17], "big")
                return ("-" if sign else "") + str(n)
            if t == 0x13: return struct.unpack("<q", raw[:8])[0]
            if t == 0x12: return u32(raw, 0)
            return raw.hex()
        except Exception as e:
            return "<err %s: %s>" % (e, raw.hex())

    def table_rows(self, tdef, pages):
        rows = []
        for n in pages:
            for raw in self.rows_on_page(n):
                r = self.crack(tdef, raw)
                if r is not None:
                    rows.append(r)
        return rows


def main():
    m = Mdb(sys.argv[1])
    print("version byte:", hex(m.version), "pages:", m.npages)
    groups = m.data_pages_by_table()
    sysobj = m.read_tdef(2)
    print("MSysObjects cols:", [(c["name"], c["type_name"], c["fixed"], c["offset_F"], c["size"]) for c in sysobj["cols"]])
    rows = m.table_rows(sysobj, groups.get(2, []))
    print("MSysObjects rows:", len(rows))
    for r in rows:
        print({k: r.get(k) for k in ("Id", "ParentId", "Name", "Type", "Flags")})

if __name__ == "__main__":
    main()
