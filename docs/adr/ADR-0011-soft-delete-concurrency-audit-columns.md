# ADR-0011 — Soft delete, rowversion concurrency, audit columns

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

An internal PM tool holds slow-changing records with high recovery value (accidental
delete of a project or meeting must be reversible). Multiple users can edit the same
record; last-write-wins silently destroys data.

## Decision

- **Soft delete** for all user-created entities: `IsDeleted BIT NOT NULL DEFAULT 0`,
  `DeletedAtUtc DATETIME2 NULL`, `DeletedBy INT NULL`. `usp_<Entity>_Delete` sets the
  flag (and audits); list/get procs filter `IsDeleted = 0`; unique constraints become
  filtered unique indexes (`WHERE IsDeleted = 0`). Hard delete exists only as an
  Admin purge proc (module #23) and for pure child rows deleted with their parent.
- **Optimistic concurrency**: every entity table has `RowVer ROWVERSION`. Get/List
  procs return it (`CAST(RowVer AS BIGINT) AS RowVer`); update/delete procs require
  `@RowVer BIGINT` and `THROW` `CONFLICT` (ADR-0012) when it no longer matches. The UI
  surfaces a conflict message with a reload affordance — never silent overwrite.
- **Audit columns** on every entity table: `CreatedAtUtc DATETIME2 NOT NULL DEFAULT
  SYSUTCDATETIME()`, `CreatedBy INT NOT NULL`, `UpdatedAtUtc DATETIME2 NULL`,
  `UpdatedBy INT NULL`.
- **Audit rows** are written by the mutation proc itself into `audit.AuditLog`
  (before/after JSON via `FOR JSON PATH`), inside the same transaction, with
  `@ActorUserId` passed from the action context. One source of truth — the app layer
  never writes data-mutation audit rows directly.

## Consequences

Slightly wider tables and stricter update procs; in exchange: recoverability, a
complete who/what/when/before/after trail, and no lost updates.
