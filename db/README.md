# db/

- `migrations/` — numbered, idempotent DDL (`NNN_description.sql`). Tables, FKs, indexes, constraints.
- `procs/` — one folder per entity, one file per stored procedure (`usp_<Entity>_<Action>.sql`, `CREATE OR ALTER`). **All application data access goes through these procs** — no inline SQL anywhere in the app.
- `seed/` — data migrated from the original Access database. Source of truth: `docs/source-analysis/access-database.md` §4 (full row dump). The remaining seeds are generated in the `database-schema-and-procs` module.

Apply everything to a running SQL Server with:

```sh
./scripts/db-apply.sh            # uses DB_SERVER/DB_USER/DB_PASSWORD env vars
```
