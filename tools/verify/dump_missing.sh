#!/bin/sh
# Dump the objects that the pure-stdlib parser missed (found by mdbtools).
set -eu
# Run from the repository root; override MDB/OUT via the environment.
MDB="${MDB:-docs/source/Access_database.mdb}"
OUT="${OUT:-missing-objects}"
[ -f "$MDB" ] || { echo "mdb not found: $MDB (run from the repository root)" >&2; exit 1; }
mkdir -p "$OUT"
echo "== all tables ==" | tee "$OUT/tables.txt"
mdb-tables -1 "$MDB" | tee -a "$OUT/tables.txt"
echo "== all tables incl system ==" >> "$OUT/tables.txt"
mdb-tables -1 -S "$MDB" >> "$OUT/tables.txt" || true
for t in "tblMeetingMinutes" "tblFinancialDocuments" "Switchboard Items"; do
  echo "===== schema: $t"
  mdb-schema -T "$t" "$MDB" mssql | tee "$OUT/schema-$(echo "$t" | tr ' ' '_').sql" || true
  echo "===== data: $t"
  mdb-export "$MDB" "$t" | tee "$OUT/data-$(echo "$t" | tr ' ' '_').csv" || true
done
echo "===== all queries"
mdb-queries -1 "$MDB" | tee "$OUT/queries.txt"
for q in qryDailyItemsAndStatusType qryKeyReqDeliverables qryMeetingParticipants qryProject3rdPartySupplier qryProjectfrmQA qryQuesAns; do
  echo "===== query SQL: $q"
  { echo "-- $q"; mdb-queries "$MDB" "$q"; echo; } | tee "$OUT/qry-$q.sql" || true
done
