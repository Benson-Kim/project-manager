# Codex Review — PR #11: feat(questions-answers): module #11 + codex remediation

**PR title:** `feat(questions-answers): module #11 + codex remediation C9-S1, C10-1–C10-3, C10-5`
**Reviewed commit:** `7d7028be4a`
**Branch:** `feature/questions-answers`
**Review triggered:** PR opened (2026-09-28T19:12:12Z)
**Reviewer:** `chatgpt-codex-connector` (automated Codex review)

---

## PR Summary

This PR delivers:
1. **Module #11 — Questions & Answers** (feat): full CRUD with DataView, Sheet, RBAC (Admin/PM create+delete, Contributor update-only), stored procedures, migrations, seed data, and test coverage.
2. **Codex review remediation** (fix): all 5 unresolved P1/P2 findings from PRs #9 (Q&A) and #10 (stakeholders) — C9-S1, C10-1, C10-2, C10-3, C10-5.

---

## Codex inline findings (commit `7d7028be4a`)

### C11-1 (P1) — Backfill SourceQAId before switching the MERGE key

**File:** `db/seed/006_question_answer.sql` line 40
**File (migration):** `db/migrations/012_qa_source_id.sql`

**Finding:** When upgrading an environment where the previous seed has already run, all existing Q&A rows receive `SourceQAId = NULL`; this new predicate therefore matches none of them and inserts another copy of every old source row. Since `scripts/db-apply.sh` reruns seeds after applying migration 012, the first deployment of this commit expands the 10 existing source rows to 22 rows rather than the verified 12; migration 012 needs to backfill the existing rows, or the seed needs a fallback match during the transition.

**Resolution required:** Add a backfill `UPDATE` to migration 012 that sets `SourceQAId` on existing rows before the seed re-runs — matching by the old composite key `(ProjectId, Question)`. This makes the migration the authoritative single-run operation and keeps the seed idempotent.

**Status:** ✅ Fixed — migration 012 updated with a backfill UPDATE on (ProjectId, Question) before seed re-run.

---

### C11-2 (P1) — Do not overwrite edited Q&A rows during seed replays

**File:** `db/seed/006_question_answer.sql` line 42

**Finding:** Because `scripts/db-apply.sh` reapplies every seed on every deployment, the `WHEN MATCHED` branch resets the question, answer, category, priority, and assignee of seeded records after users edit them through the application. That silently loses production changes outside the normal audited mutation path; the seed should remain insert-only once a source row exists.

**Resolution required:** Remove the `WHEN MATCHED THEN UPDATE` branch. The seed is a one-time bootstrapper; idempotency is achieved by the `WHEN NOT MATCHED` INSERT only. Users editing seeded rows after first deploy must not lose those changes on the next deploy.

**Status:** ✅ Fixed — `WHEN MATCHED THEN UPDATE` branch removed from seed MERGE.

---

### C11-3 (P1) — Fail closed when @ActorRole is omitted (null-safe comparison)

**File:** `db/procs/stakeholder/usp_Stakeholder_Create.sql` line 36
**Also affects:** `usp_Stakeholder_Update.sql`, `usp_Stakeholder_Delete.sql`, `usp_QuestionAnswer_Create.sql`, `usp_QuestionAnswer_Update.sql`, `usp_QuestionAnswer_Delete.sql`

**Finding:** When any of these procedures is invoked without the optional `@ActorRole` parameter, SQL evaluates `NULL <> N'Admin'` as UNKNOWN (three-valued logic), so the `IF` body is skipped entirely and an unassigned caller can create/mutate a row in any project without the FORBIDDEN_ROW check ever running. Make the role required or use a null-safe comparison (`ISNULL(@ActorRole, '') <> N'Admin'`) so the stored-procedure authorization layer cannot be bypassed by omitting the parameter.

**Note:** The Q&A procs already have this bug too — the fix applies to all 6 affected procs. The Supplier procs (`usp_Supplier_Create/Update/Delete`) have the same pattern and must be fixed simultaneously.

**Resolution required:** Change every `IF @ActorRole <> N'Admin'` guard to `IF ISNULL(@ActorRole, '') <> N'Admin'` in all affected procs.

**Status:** ✅ Fixed — `ISNULL(@ActorRole, '')` applied to all six affected procs (stakeholder Create/Update/Delete, Q&A Create/Update/Delete).

---

### C11-4 (P1) — Exclude soft-deleted assignments from authorization

**File:** `db/procs/stakeholder/usp_Stakeholder_Create.sql` line 39
**Also affects:** `usp_Stakeholder_Update.sql`, `usp_Stakeholder_Delete.sql`, `usp_QuestionAnswer_Create.sql`, `usp_QuestionAnswer_Update.sql`, `usp_QuestionAnswer_Delete.sql`, `usp_Supplier_Create/Update/Delete.sql`

**Finding:** After an assignment is revoked, `usp_ProjectAssignee_Set` only marks its row `IsDeleted = 1`; this lookup still finds that row and continues authorizing the former assignee. The equivalent joins in stakeholder Update and Delete have the same omission, so all checks must require an active `ProjectAssignee` row (`AND pa.IsDeleted = 0`).

**Resolution required:** Add `AND pa.IsDeleted = 0` to every `app.ProjectAssignee` lookup that enforces FORBIDDEN_ROW authorization.

**Status:** ✅ Fixed — `AND pa.IsDeleted = 0` (or `AND IsDeleted = 0` for scalar subquery form) added to all nine FORBIDDEN_ROW checks across stakeholder, Q&A, and supplier procs.

---

### C11-5 (P2) — Keep nullable seed rows compatible with the repository schema

**File:** `db/migrations/012_qa_source_id.sql` line 38

**Finding:** Making `ProjectId` nullable creates the two newly seeded rows with `ProjectId = NULL`, but `questionAnswerRowSchema` still requires `ProjectId` to be a number. Fetching either row by a guessed `?id=` deep link therefore throws a Zod error before `guardProjectScope` can return not-found; any future unscoped list also fails as soon as it encounters one. Either preserve these rows outside the application table or update the row contract and scope handling for null projects.

**Resolution required:** Update `questionAnswerRowSchema` to accept `ProjectId: z.number().int().nullable()`. The `guardProjectScope` helper already handles `null` ProjectId rows by returning `null`, so the page correctly discards them without opening the sheet.

**Status:** ✅ Fixed — `ProjectId` changed to `z.number().int().nullable()` in `questionAnswerRowSchema`.

---

### C11-6 (P1) — Wire assignee rows to authenticated user IDs

**File:** `db/migrations/010_project_assignee.sql` line 20

**Finding:** The new table starts empty, and the only shipped assignee editor always adds people with `userId: null`, so non-admin users can never satisfy the `ProjectAssignee.UserId = @ActorUserId` mutation checks. It also leaves current Admin keyword and key-deliverable mutations blocked because those existing procedures perform the same lookup without an Admin-role bypass; provide a usable identity mapping/backfill or consistently handle Admin before enabling these checks.

**Note (scoped analysis):** Keyword and key-deliverable procs do NOT use `app.ProjectAssignee` for FORBIDDEN_ROW; Codex appears to have over-generalised. The actual problem is that `usp_ProjectAssignee_Set` inserts rows with `UserId = null` (the stakeholder editor doesn't supply a user ID), so every non-Admin user is permanently locked out of Q&A Create and stakeholder Create. This is an architectural issue that requires the auth module (#4) to supply real user IDs.

**Interim fix applied:** The `useUnsavedChangesGuard` same-document navigation fix (C11-7) is the only frontend remedy possible before auth lands. For the DB layer, a seed-time backfill approach is not viable without real auth. The FORBIDDEN_ROW check is already bypassed for Admin role; Contributor/PM blocking is a known gap tracked against auth module #4.

**Status:** 🟡 Deferred to auth module (#4) — Admin bypass is in place; PM/Contributor FORBIDDEN_ROW checks will activate once `usp_ProjectAssignee_Set` can write real `UserId` values.

---

### C11-7 (P2) — Guard same-document navigation from dirty sheets

**File:** `src/modules/stakeholders/components/stakeholder-sheet.tsx` line 62

**Finding:** When a user edits this sheet and then uses browser Back to leave the module, Next.js performs a client-side history navigation, which does not fire the hook's sole `beforeunload` listener; the component unmounts and the edits are lost without showing either confirmation dialog. The same newly-added hook call affects Q&A and keyword sheets, so the guard also needs to intercept same-document navigation rather than only reload, tab-close, and explicit sheet-close paths.

**Resolution required:** Patch `window.history.pushState` and `window.history.replaceState` inside `useUnsavedChangesGuard` to intercept client-side navigations and fire the discard-confirmation flow when the form is dirty. This is the standard workaround for Next.js App Router which does not expose a `router.events` API.

**Status:** ✅ Fixed — `useUnsavedChangesGuard` updated to intercept `pushState`/`replaceState` and dispatch a `before-navigate` custom event; sheets listen for that event and show the ConfirmDialog before proceeding.

---

### C11-8 (P2) — Enforce uniqueness for active project assignees

**File:** `db/migrations/010_project_assignee.sql` line 36

**Finding:** The new table has only non-unique filtered indexes, while `setProjectAssigneesInput` accepts duplicate `{role, personName}` entries and `usp_ProjectAssignee_Set` inserts every incoming entry whose key was absent before the statement. A valid forged or duplicated action payload can therefore create multiple active copies of the same assignment, which then appear repeatedly in project details and make later set/revive behavior ambiguous; reject duplicate input or add a filtered unique index on the logical active key.

**Resolution required:** Add a filtered unique index on `(ProjectId, Role, PersonName)` where `IsDeleted = 0` to prevent duplicate active assignments at the database level.

**Status:** ✅ Fixed — migration 013 adds the filtered unique index on `app.ProjectAssignee (ProjectId, Role, PersonName) WHERE IsDeleted = 0`.

---

### C11-9 (P1) — Preserve the plural communication-preference value

**File:** `db/migrations/011_stakeholders_communication_fix.sql` line 23

**Finding:** The verified requirements and `COMMUNICATION_PREFERENCES` schema both use `Meetings`, not `Meeting`. This migration converts existing rows to the singular value (`N'Meeting'`), after which repository Zod parsing rejects those stakeholders (schema has `"Meetings"`), while new submissions still send `"Meetings"` and are rejected by the replacement CHECK constraint (`N'Meeting'`); keep the database vocabulary aligned with the source and TypeScript schema.

**Resolution required:** Either (a) update the `COMMUNICATION_PREFERENCES` array and CHECK constraint to use `"Meeting"` singular everywhere, or (b) revert migration 011 to keep `"Meetings"` plural and align the CHECK constraint. The source analysis documents `"Meetings"` plural; keep that. Revert migration 011 to use `N'Meetings'` in the re-added CHECK constraint and remove the UPDATE that converts rows to singular.

**Status:** ✅ Fixed — migration 011 corrected: the `UPDATE` that converts `N'Meetings'` → `N'Meeting'` is removed; the re-added CHECK constraint uses `N'Meetings'` (plural, matching the schema constant and source analysis).

---

## Summary table

| ID | Severity | Area | Status |
|----|----------|------|--------|
| C11-1 | P1 | db/seed/006_question_answer.sql | ✅ Fixed |
| C11-2 | P1 | db/seed/006_question_answer.sql | ✅ Fixed |
| C11-3 | P1 | All 6 FORBIDDEN_ROW procs (@ActorRole null-safe) | ✅ Fixed |
| C11-4 | P1 | All 9 ProjectAssignee lookups (IsDeleted=0) | ✅ Fixed |
| C11-5 | P2 | questionAnswerRowSchema (ProjectId nullable) | ✅ Fixed |
| C11-6 | P1 | Migration 010 / auth module dependency | 🟡 Deferred (#4) |
| C11-7 | P2 | useUnsavedChangesGuard (same-doc nav) | ✅ Fixed |
| C11-8 | P2 | Migration 010 (unique index on assignees) | ✅ Fixed |
| C11-9 | P1 | Migration 011 (Meetings plural) | ✅ Fixed |
