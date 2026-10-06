# Module prompts — remaining work

Ready-to-paste prompts for the agent sessions that build the rest of the app.
Written 2026-10-06 against `develop` @ `ffaf6e6` (12 modules merged: projects,
stakeholders, suppliers, keywords, key-deliverables, objectives, questions-answers,
assumptions-constraints, parking-lot, daily-activities, todo-items/alerts, auth).

**How to use:** one prompt = one session = one branch = one PR. Paste **§0 Common
rules** first, then the prompt. Run prompts in the wave order below; prompts in the
same wave can run in parallel (max 3 sessions, one worktree each — see
`COORDINATION.md`). Do not start a prompt before the PRs it depends on are merged
to `develop`, and create its worktree from the updated `develop`.

## Order, dependencies, parallel waves

| Wave | Prompt | Branch | Depends on | Migration no. (reserved) |
|---|---|---|---|---|
| 1 | **S1** Security & data fixes (IDOR, stakeholder vocab) | `fix/idor-getbyid` | — | — |
| 1 | **P1** Shared rich-text editor + HTML sanitiser | `feature/rich-text` | — | — |
| 1 | **F1** File attachments (uploads) | `feature/file-storage` | — | 017 |
| 2 | **M1** Meetings — database & server layer | `feature/meetings-data` | S1 | 019 |
| 2 | **R1** Risks & issues — database & server layer | `feature/risks-issues-data` | S1 | 018 |
| 2 | **I1** IT resource planning — database & server layer | `feature/it-resources-data` | S1 | 020 |
| 3 | **M2** Meetings — list + meeting workspace header | `feature/meetings-workspace` | M1, P1 | — |
| 3 | **R2** Risks & issues — UI merged with assumptions | `feature/risks-issues-ui` | R1, P1 | — |
| 3 | **I2** IT resource planning — UI | `feature/it-resources-ui` | I1, P1 | — |
| 4 | **M3** Meetings — participants (attended / apologies) | `feature/meetings-participants` | M2 | — |
| 4 | **N1** Notes — database, server layer, notes workspace | `feature/notes` | P1, S1 | 021 |
| 4 | **FI1** Financials — database & server layer | `feature/financials-data` | F1, S1 | 022 |
| 5 | **M4** Meetings — agenda → discussion → action items, printable minutes | `feature/meetings-minutes` | M3 | — |
| 5 | **FI2** Financials — UI (breakdown, document checklist, tracking export) | `feature/financials-ui` | FI1 | — |
| 5 | **F2** Backup status + GitHub-based restore | `feature/backup-status` | F1 | 023 |
| 6 | **A1** Admin — users & roles | `feature/admin-users` | S1 | — |
| 6 | **A2** Admin — audit viewer, backup status panel, settings | `feature/admin-audit` | A1, F2 | 024 |
| 7 | **RP1** Reports — infrastructure + per-module reports | `feature/reports` | all domain modules | 025 (if needed) |
| 7 | **C1** CI/CD & security automation (GitHub) | `chore/ci-security` | — (any time) | — |
| 8 | **RP2** Reports — detailed project report + dynamic report builder | `feature/reports-builder` | RP1 | — |

Migration numbers are reserved so parallel sessions don't collide (`014`/`015`
already exist twice — do not add more duplicates). If your number is already taken
when you open the PR, take the next free number and say so in the PR. Never edit a
migration that is merged.

**Desktop edition follow-ups** (done in the desktop branch, not by these prompts):
after **F1** merges, the desktop host must set `UPLOADS_DIR` to
`%ProgramData%\Project Manager\Uploads` and include that folder in its backups;
after **F2**, record desktop backups through `usp_Backup_RecordRun`.

---

## §0 Common rules (paste before every prompt)

```text
COMMON RULES — Project Manager rebuild (Next.js 16 App Router + SQL Server 2022, stored procedures only)

WORKSPACE
- You work ONLY inside your worktree folder C:\Users\user\Documents\Coding\Burton\projectmanager-<KEY>
  on branch <BRANCH> (created from origin/develop). Every file read/write and every git/terminal
  command runs inside that folder. Never run git checkout / switch / stash to change branches.
- node_modules is a shared junction: never run npm install / npm ci. If you need a new package,
  write the ADR (ADR-0014 policy) and STOP to ask the coordinator to install it; give the exact
  package names and versions.

READ FIRST (in order): LESSONS.md (repo ROOT — canonical; docs/LESSONS.md is a stale copy),
docs/AGENTS.md, docs/STANDARDS.md (esp. §12 Definition of Done), docs/MODULE-BLUEPRINT.md,
docs/PLAN.md §2/§4/§9/§10, docs/TRACEABILITY.md, docs/source/analysis/ (requirements.md,
access-database.md, excel-workbook.md, hololens-presentation.md — the verified source of truth;
never open or modify the binaries in docs/source/), docs/adr/ (ADR-0001..0020).
Reference implementations: parking-lot (most complete proc pattern) and assumptions-constraints
(src/modules/<m>, src/app/(app)/projects/[id]/<m>/page.tsx, db/procs/<entity>/, e2e/<m>*.spec.ts).

CI / HOSTING FACTS (docs are partly stale)
- The repo is on GitHub; CI is .github/workflows/ci.yml. Open a PULL REQUEST to develop.
  Ignore GitLab-only instructions in older docs (glab, MR templates, Duo flows, Package Registry,
  job-trace scraping, SCHEDULE_JOB). A commit message containing [e2e] runs Playwright in CI.
- The app ALSO ships as an offline Windows desktop app (Electron + local SQL Server Express 2022,
  loopback only). Therefore: no runtime network calls to other hosts (no CDNs, web fonts, external
  APIs); file-system paths only from validated env vars with safe defaults (src/lib/env.ts) — never
  hard-coded Linux paths; downloads via Route Handlers with Content-Disposition; printing via
  window.print + print CSS. List any new env var in .env.example and under
  "Desktop edition impact" in the PR description.

DATABASE STANDARD (apply to every proc you create or touch)
- CREATE OR ALTER, one file per proc in db/procs/<entity>/, SET NOCOUNT ON, SET XACT_ABORT ON.
- Every proc takes @ActorUserId INT and @ActorRole NVARCHAR(50) = NULL. Admin bypasses the
  project check; everyone else must be an active app.ProjectAssignee of the row's project, else
  THROW 50003 'FORBIDDEN_ROW:…'. Child tables resolve the project through their parent chain.
  GetById distinguishes NOT_FOUND (50001) from FORBIDDEN_ROW.
- Validate parents exist and are not deleted (50001/50004) instead of letting FK error 547 escape;
  validate vocabularies with 50004; duplicates 50005. Error format THROW 5000x, N'CODE:message', 1 (ADR-0012).
- Parent/project keys are immutable on Update (accepted but ignored) unless the prompt says otherwise.
- RowVer check INSIDE the transaction; audit row (before/after FOR JSON PATH) in the same transaction.
- List procs exactly per ADR-0016 (+ nullable module filters), LIKE wildcards escaped (ESCAPE N'\'),
  stable final tiebreaker on the PK; when @ProjectId is supplied and the actor is not assigned
  (non-Admin) THROW FORBIDDEN_ROW (parking-lot behaviour).
- Soft delete; deleting a parent soft-deletes its children in the same transaction.
- Seeds are verbatim from access-database.md §4 and their counts are asserted by
  db/verify/seed_counts.sql — do not add or drop seed rows unless the prompt says so.
- Migrations: idempotent, fix-forward, use the number reserved in your prompt. Update db/README.md
  (proc catalogue).

APP STANDARD
- Feature slice src/modules/<module>/{schemas,repository,actions,components}; execProc only;
  zod-parse every row; forward ActorUserId AND ActorRole to every proc.
- Mutations only through action() (src/lib/action.ts) with permission (+ revalidate); sheets
  call router.refresh() (LESSONS §17).
- DataView for every list (never fork it); detail/edit per ADR-0010 (Sheet unless the prompt says
  full route); ConfirmDialog for destructive actions; unsaved-changes guard; forms per ADR-0009.
- All copy in src/lib/messages.ts (tone test enforces it); no hints, tooltips or helper text;
  44 px touch targets; mobile-first from 360 px; WCAG 2.2 AA (axe: 0 serious/critical);
  per-route first-load JS ≤ 170 kB gzip (lazy-load heavy components).
- RBAC: src/lib/auth/rbac.ts. Contributor = read all + create/update on CONTRIBUTOR_WRITE_MODULES,
  never delete. Add your module key there if Contributors may write (append, keep sorted).
- Project-scoped sections live under src/app/(app)/projects/[id]/<segment>/ and are registered in
  src/components/shell/project-sections.ts in BOTH projectSections AND a projectSectionGroups
  array (otherwise the section does not appear in the nav).

SHARED FILES (edited by many sessions — append only, in your own namespace, merge origin/develop
before your final push): src/lib/messages.ts, src/lib/auth/rbac.ts,
src/components/shell/project-sections.ts, playwright.config.ts (testMatch regexes),
db/README.md, db/verify/seed_counts.sql, docs/TRACEABILITY.md.

WORKFLOW
- Baseline first: npm run test and note pre-existing failures (LESSONS §18) so you don't chase them.
- Commit + push small checkpoints often ("[skip ci]"), Conventional Commits. Push before long jobs.
- Before asking for review: npm run lint && npm run typecheck && npm run test && npm run build, then
  self-check against STANDARDS §12. Final push with [e2e] in the message; watch CI to green.
- Tests: Vitest for schemas, repository (mock execProc) and every action path (ok, VALIDATION,
  FORBIDDEN, proc error); Playwright: happy path, validation failure, RBAC denial, axe. Never weaken
  an existing test. Coverage ≥ 80 % on src/modules/** and src/lib/**.
- Record structural decisions as ADRs (docs/adr/, next free number, add to the ADR README).
- PR to develop titled "<type>(<key>): <summary>"; body: what changed, decisions/ADRs, migration
  number, Desktop edition impact, test evidence (CI run links), and a checklist of the prompt's
  acceptance criteria. Update docs/TRACEABILITY.md rows. Append new lessons to LESSONS.md.
- Finish with a STATUS line in the PR: STATUS <ISO date> | <branch> @ <sha> | done | next | blocked.
```

---

## Wave 1

### S1 — Security & data fixes

```text
KEY=security-fixes  BRANCH=fix/idor-getbyid

Goal: close the open High-severity finding docs/security/IDOR-getbyid-procs.md and fix two
data/permission defects found during review. Small, surgical PR.

1. IDOR: the GetById procs of DailyActivity, KeyDeliverable, Keyword, Objective, QuestionAnswer,
   Stakeholder and TodoItem return any row to any signed-in user. Bring each to the reference
   usp_Supplier_GetById pattern (@ActorRole, Admin bypass, NOT_FOUND vs FORBIDDEN_ROW via
   app.ProjectAssignee; TodoItem/DailyActivity may be global — follow the module's existing List
   rules for rows without a project). Update every repository call site listed in the finding doc
   to pass ActorRole, map FORBIDDEN_ROW to notFound() on pages (no existence leak), and add tests:
   Vitest repository param tests + one e2e per module proving a non-assigned Contributor gets 404.
   Also check the List procs of the same modules: where @ProjectId is supplied by a non-assigned
   non-Admin, they must throw FORBIDDEN_ROW or filter — make them consistent with parking-lot.
   Set the finding doc Status to Fixed with the PR link.
2. Stakeholder communication preference: src/modules/stakeholders/schemas/stakeholder.ts offers
   "Meeting" but migration 011's CHECK only allows 'Email','Phone','Meetings' → saving "Meeting"
   fails. Make the app vocabulary match the database ('Meetings'; label from messages), add a test.
3. RBAC review: todo-items is not in CONTRIBUTOR_WRITE_MODULES, so Contributors cannot create
   to-dos although PLAN §9 / §13 say they work their own to-do list. Confirm against PLAN and the
   todo-items e2e specs; if it is a defect, add it (keep sorted) and add a test; if intended,
   write that down in rbac.ts.
4. LESSONS §18 lists pre-existing failing tests (format.test.ts null/undefined formatDate):
   fix them or the code so the suite is green on develop.

Acceptance: all seven GetById procs + call sites fixed with tests; stakeholder "Meetings" saves;
RBAC decision recorded; full test suite green; finding doc closed.
```

### P1 — Shared rich-text editor + HTML sanitiser

```text
KEY=rich-text  BRANCH=feature/rich-text

Goal: one shared, accessible, Word-like rich-text editor and a server-side HTML sanitiser that
Notes, Meetings, Risks, IT resource planning and Financials will reuse (checklist rows 17-20,
42, 56, 62; PLAN §7; SECURITY.md "rich-text sanitised server-side before storage and render").
No module UI in this PR — only the shared building blocks, demo and tests.

Facts: package.json has no editor or sanitiser; no HTML is rendered anywhere today except the
theme script. Seeded Access data already contains rich-text HTML (<div>, <strong>, <em>, <u>,
<font face="…" size=5>, &quot;) in RiskIssue.Description/MitigationPlan,
ItResourceItem.DetailText and Meeting.Description. CSP (src/proxy.ts): nonce + strict-dynamic
scripts, style-src 'self' 'unsafe-inline', font-src 'self' — no remote fonts.

Do:
1. ADR "Rich-text editing and HTML sanitisation" (+ ADR-0014 dependency entries). Recommended
   choice: Tiptap (ProseMirror, MIT) with StarterKit, Underline, Strike, TextStyle+FontFamily,
   a font-size mark, Table (+row/cell/header), TextAlign, Link (http/https/mailto only), and
   sanitize-html (pure JS) on the server. Justify against alternatives (Lexical; in-house
   contenteditable/execCommand is deprecated and has no tables). Stop and ask the coordinator to
   install the packages.
2. src/lib/rich-text/sanitize.ts (server-only): allow-list of tags/attributes/styles matching the
   toolbar (p, br, strong/b, em/i, u, s/strike/del, ul/ol/li, h2-h4, blockquote, table/thead/tbody/
   tr/th/td with colspan/rowspan, a[href] with rel="noopener noreferrer", span with font-family/
   font-size/text-decoration only). Converts legacy Access markup: <div>→<p>, <font face size>→
   span styles, decodes entities. Strips scripts, event handlers, javascript:/data: URLs, style
   expressions, iframes, images (no image upload in scope). Also exports htmlToPlainText() for
   list cards, search snippets and CSV export. 100 % unit-test coverage incl. an XSS corpus
   (OWASP cheat-sheet vectors) and the seeded Access samples.
3. zod helper richTextSchema({ max }) for action schemas: sanitises, enforces a max length on the
   sanitised HTML, and treats an empty document (<p></p>) as null.
4. src/components/ui/rich-text/RichTextEditor (client, lazy-loaded with next/dynamic so pages
   stay under the 170 kB budget): toolbar with bold, italic, underline, strikethrough, bullets,
   numbering, headings, font family (system fonts only: Arial, Calibri, Cambria, Times New Roman,
   Courier New, Segoe UI), font size, text alignment, insert/delete table rows/columns, link,
   undo/redo, clear formatting. Keyboard shortcuts as in Word (Ctrl+B/I/U, Ctrl+Shift+X strike).
   spellcheck enabled and lang from <html>. Works inside our <form>: writes the HTML to a hidden
   input with the field name so action() + useZodForm + unsaved-changes guard work unchanged;
   label/aria wiring via Field; disabled/read-only mode; 44 px toolbar targets; roving tabindex
   toolbar (ARIA toolbar pattern); visible focus; dark mode via tokens.
5. RichTextView (server component) that renders already-sanitised HTML with typography/table
   styles and print styles; sanitises again on render (defence in depth).
6. Add both to the kitchen-sink page; axe e2e on it; Vitest for the schema and sanitiser;
   Playwright: type, format, insert a table, submit, render.
7. Turn on spellcheck/lang for plain Textarea/Input text fields in src/components/ui/form
   (checklist row 42) unless a field opts out (passwords, codes).

Acceptance: ADR merged; editor + view + sanitiser + schema exported from src/components/ui and
src/lib; demo + tests green; first-load JS budget respected; no network requests at runtime.
```

### F1 — File attachments

```text
KEY=file-storage  BRANCH=feature/file-storage  MIGRATION=017

Goal: module #16 part 1 (issue #22, checklist rows 43-44): secure file attachments that any
module can use, plus the "where are the files stored" field. Financials (FI1) is the first real
consumer; daily activities had attachments in Access (tblDailyActivityList.Attachment) and get
them in this PR as the reference integration.

Facts: no app.FileAttachment table, procs or upload code exist; docker-compose mounts an
"uploads" volume but no env var is defined in src/lib/env.ts (scripts/backup.sh reads
UPLOADS_DIR); Server Actions default to a 1 MB body limit and the action() wrapper does not handle
File values; db.ts ProcParams cannot carry bytes (metadata only in SQL). STANDARDS §4 upload rules:
sniff magic bytes, allow-list types, 25 MB cap, store outside the web root under content-hash names,
serve through an authenticated handler with Content-Disposition: attachment + nosniff, AV-scan hook
stub, per-project quota. PLAN §9: Admin, PM, Contributor upload; deletes follow the RBAC matrix
(Contributors never delete).

Do:
1. ADR "File storage" deciding: polymorphic link (EntityName + EntityId, whitelisted entity names)
   vs link tables; upload transport (Route Handler POST with Origin/Sec-Fetch-Site check + session +
   RBAC, streaming to disk, recommended over raising the Server Action body limit); content-hash
   (SHA-256) dedupe and versioning; quota; delete = soft delete of metadata + orphan sweep.
2. Migration 017: app.FileAttachment (FileAttachmentId, ProjectId, EntityName, EntityId,
   OriginalFileName, ContentType (sniffed), SizeBytes, Sha256, StoragePath (relative), Version,
   StorageLocation NVARCHAR(500) NULL = row 44 "where I put the files" free text for files kept
   elsewhere, e.g. a SharePoint/network path, + standard audit/soft-delete/RowVer columns, indexes).
3. Procs usp_FileAttachment_Create / GetById / List (ADR-0016 + @EntityName/@EntityId filters) /
   Update (rename, StorageLocation) / Delete, with the project check through the owning entity.
4. src/lib/env.ts: UPLOADS_DIR (absolute path; default <cwd>/uploads outside .next; validated
   writable at first use, not at build). Storage service src/lib/files/: hash-named sharded paths,
   atomic write (temp + rename), magic-byte sniffing (no new dependency unless justified by ADR),
   allow-list (pdf, docx, xlsx, pptx, png, jpg, txt, csv, msg/eml), 25 MB cap, scan hook stub.
5. Route Handlers: POST /api/files (multipart, streaming, returns the attachment row),
   GET /api/files/[id] (authenticated, RBAC + project check, Content-Disposition attachment,
   nosniff, no caching), and a delete Server Action.
6. Shared <Attachments entity="DailyActivity" entityId projectId canUpload canDelete/> component:
   list (name, size, date, who), upload with progress and drag-and-drop + keyboard alternative,
   download, delete with ConfirmDialog, StorageLocation field; messages; axe clean.
7. Integrate into the daily-activity Sheet. Dockerfile: create /app/uploads owned by the runtime
   user; compose: set UPLOADS_DIR; backup.sh already tars it — verify.
8. Tests: Vitest (sniffing, limits, path traversal, hash naming, schemas, repository, actions);
   Playwright: upload → list → download → delete, rejected type, too large, RBAC denial (Viewer),
   axe.

Out of scope: backup status recording and GitHub restore (F2). Desktop host wiring (coordinator).
Acceptance: attachments work end to end on daily activities; all STANDARDS §4 upload rules met
and tested; ADR merged; PR lists UPLOADS_DIR under Desktop edition impact.
```

---

## Wave 2 — server layers

### M1 — Meetings: database & server layer

```text
KEY=meetings-data  BRANCH=feature/meetings-data  MIGRATION=019

Goal: module #10 (issue #11; checklist rows 12, 13, 53, 54, 72) part 1 of 4 — make the meetings
data layer correct and secure, and expose it through repositories/actions. No UI (M2-M4 build it).

Facts (verify, don't trust): tables from 003_domain_schema.sql — app.Meeting (ProjectId NULL,
Subject, Description, Location, StartDate, StartTime TIME(0), EndTime TIME(0), Conclusion,
NextMeeting, FollowupAction NVARCHAR(255)), MeetingAgendaItem (MeetingId NULL, AgendaItem),
MeetingDiscussionPoint (AgendaItemId NOT NULL, DiscussionPoint), MeetingParticipant (MeetingId
NULL, StakeholderId, IsApology BIT), MeetingActionItem (DiscussionPointId NULL, AgendaItemId NULL,
Action, AssignedToStakeholderId NULL, DueDate). 28 procs exist in db/procs/meeting*/ but none takes
@ActorRole, none checks project assignment, child procs ignore project scope, no parent-exists
validation, Update can move rows across projects/parents, no LIKE escaping, Meeting_Delete does not
cascade. Seeds 008-012 (5/3/3/8/9 rows, asserted) include orphans (meeting 5 has no project,
participants 1 and 3 and agenda 3 have no meeting) — keep them; Admin can still see them.
No columns exist for "Date received" or "Objective" (row 54). TIME(0) comes back from mssql as a
Date — reuse the alertTimeSchema/"HH:mm" pattern from src/modules/todo-items.

Decisions (record in an ADR "Meetings data model"):
- Title = Subject (relabelled "Title" in the UI). "Person responsible" (row 13) = the action
  item's AssignedToStakeholderId, chosen from the meeting project's stakeholders (the only
  responsible-person field in the live Access schema).
- Participants are stakeholders of the meeting's project; IsApology false = attended, true =
  apology (qryMeetingAttendees / qryMeetingApologies).

Do:
1. Migration 019: Meeting.DateReceived DATE NULL, Meeting.Objective NVARCHAR(MAX) NULL;
   SortOrder INT NOT NULL DEFAULT 0 on agenda items, discussion points and action items (backfill
   by Id); MeetingActionItem.MeetingId INT NULL FK (backfill through agenda/discussion) so actions
   can't be orphaned; filtered unique index (MeetingId, StakeholderId) WHERE IsDeleted = 0 on
   participants (check seeds first — no duplicates expected); indexes for list sorts (StartDate).
2. Rewrite all 28 procs to the Common-rules database standard (project check through the parent
   chain; stakeholders must belong to the meeting's project; StartTime < EndTime when both set;
   description/objective/conclusion stored as sanitised HTML is the caller's job — procs store as
   given). Meeting_List: filters @DateFrom/@DateTo, search Subject/Location/Objective (plain text),
   default sort StartDate desc. Meeting_Delete cascades soft delete to all children.
3. New procs: usp_Meeting_GetWorkspace @MeetingId (meeting + agenda + discussion + actions +
   participants; one call — check whether execProc supports multiple recordsets; if not return
   child collections as FOR JSON PATH columns like usp_KeyDeliverable_List's AssigneesJson),
   usp_MeetingParticipant_Set @MeetingId @ParticipantsJson ([{stakeholderId,isApology}] — replaces
   the set, audited), usp_MeetingAgendaItem_Reorder / _DiscussionPoint_Reorder /
   _ActionItem_Reorder (@ParentId @OrderedIdsJson), usp_Meeting_GetAttendees/GetApologies return
   "Name - Position, Organization" labels like the Access queries.
4. src/modules/meetings: schemas (row + form schemas; time "HH:mm"; rich-text fields via P1's
   richTextSchema if merged, otherwise plain strings with max length and a TODO tracked in the PR),
   repository (all procs), actions (create/update/delete meeting; create/update/delete/reorder for
   each child; setParticipants) with permission meetings:* (meetings is already in
   CONTRIBUTOR_WRITE_MODULES), messages namespace meetings.*.
5. Tests: Vitest for every schema, repository function and action path; SQL-level test via the
   db-apply CI job (seed counts unchanged). No e2e yet (no UI) — say so in the PR.

Acceptance: migration + hardened procs + new procs + module server layer with tests; ADR merged;
db/README.md updated; CI green.
```

### R1 — Risks & issues: database & server layer

```text
KEY=risks-issues-data  BRANCH=feature/risks-issues-data  MIGRATION=018

Goal: module #13 (issue #14; checklist row 38) part 1 of 2 — data layer and server slice.

Facts: app.RiskIssue (003:414) has Description, Category, DateIdentified, Status, Priority,
Impact, Probability, MitigationPlan, Owner, DueDate — no Title, no CHECKs. The checklist requires
11 fields: Title, Description, Category, Status (open/in progress/closed), Priority (low/medium/
high), Impact (cost/schedule/scope), Probability (low/medium/high), Mitigation plan, Owner, Due
date, Date identified. Source data (2 rows, seed 015, asserted) uses Category 'Issue', Status
'Closed'/'In Progress', Priority/Probability 'High', Impact 'Low' and holds Access HTML in
Description/MitigationPlan. The 5 procs in db/procs/risk-issue lack @ActorRole/FORBIDDEN_ROW,
let Update move rows across projects, check RowVer outside the transaction, have no filters.
risks-issues is NOT in CONTRIBUTOR_WRITE_MODULES.

Decisions (ADR "Risk & issue vocabularies"):
- Category = Risk | Issue (seed rows are Issues). Status = Open | In Progress | Closed.
  Priority and Probability = Low | Medium | High. Impact = the checklist's dimension list
  Cost | Schedule | Scope; legacy level values ('Low') stay readable (vocab enforced on write only
  for changed fields; show legacy values as-is). Write that rule down explicitly.
- Title required on create/update; the migration backfills existing rows with the first 100
  plain-text characters of Description.
- Contributors may create/update risks (operational module like assumptions) — add the key.

Do:
1. Migration 018: Title NVARCHAR(200) NULL + backfill (then NOT NULL if every row has one),
   indexes for sorts (DueDate, DateIdentified, Priority).
2. Rewrite the 5 procs to the database standard; List filters @Category @Status @Priority, search
   Title/Description(plain)/Owner, sorts Title, DateIdentified, DueDate, Priority, Status.
3. src/modules/risks-issues: schemas (rich-text Description/MitigationPlan via P1 if merged),
   repository, actions (risks-issues:create/update/delete), messages namespace, rbac entry.
4. Tests: Vitest for schemas/repository/actions. db-apply CI must stay green with unchanged seed
   counts.

Acceptance: as above, ADR merged, CI green. UI follows in R2.
```

### I1 — IT resource planning: database & server layer

```text
KEY=it-resources-data  BRANCH=feature/it-resources-data  MIGRATION=020

Goal: module #15 (issue #16; checklist rows 21-22, PPTX slide 1) part 1 of 2, plus the decision
on ExistingSystemInterface (open question Q4 in docs/ux/project-workspace-navigation.md assigns
it to this module).

Facts: app.ItResourceCategory (ProjectId, Resource free text) and app.ItResourceItem
(ItResourceCategoryId, DetailText, Needed BIT); seeds 017/018 = 15/18 rows (asserted) with free-text
category names incl. typos ('IT Infrasturcture', 'IT Local Tech', 'IT Interface', 'New Resource',
'Resource Test') and Access HTML in DetailText. PPTX slide 1: five categories IT Security,
IT Infrastructure, IT Local Techs, User Training, IT Interfaces, each with question lines
("Does this system need to be vetted by security? What needs to be added for Security in the
Devis Techniques", "Does this require a greater capacity on our infrastructure? Purchase added
servers…etc.", "Do the Technicians need to be trained on the new system?", "Does this system
require an interface?", "Who are the users needed to be trained?", "What do the users need to be
trained on?") plus an "Add" button per category; each line has a Needed flag.
qryITResourcePlanning joins project → categories → details. Procs lack @ActorRole/FORBIDDEN_ROW,
Item_List ignores the project, no ordering, no aggregate read, deleting a category leaves its
items. app.ExistingSystemInterface exists (0 source rows, procs exist, no UI);
Access showed it as a project subform (subfrmProjectExistingSystem / qryProjectExistingSystem).
it-resource-planning is not in CONTRIBUTOR_WRITE_MODULES.

Decisions (ADR "IT resource planning model"):
- The five PPTX categories are the canonical set: add CategoryKey (Security, Infrastructure,
  LocalTechs, UserTraining, Interfaces, Other) mapped from the free text by the migration (typos
  map to the right key; 'New Resource'/'Resource Test' → Other); Resource text is kept verbatim.
- Opening a project's IT resource plan ensures the five categories exist (idempotent proc), with
  the PPTX question lines as starter items only for categories that have no items yet.
- ExistingSystemInterface is shown inside IT resource planning, next to the IT Interfaces category
  ("Existing systems & interfaces"); record the Q4 answer in the ADR and the UX doc.

Do:
1. Migration 020: CategoryKey + CHECK, SortOrder on both tables (backfill), unique
   (ProjectId, CategoryKey) for the five canonical keys (filtered: not for Other).
2. Rewrite the category/item/interface procs to the database standard (items resolve the project
   through the category; category delete cascades). New: usp_ItResourcePlan_Get @ProjectId (port
   of qryITResourcePlanning: categories with items, ordered), usp_ItResourcePlan_EnsureDefaults
   @ProjectId, usp_ItResourceItem_Reorder.
3. src/modules/it-resource-planning: schemas (DetailText rich text via P1 if merged), repository,
   actions, messages, rbac (add the key for Contributors).
4. Tests as in the common rules; seed counts unchanged (EnsureDefaults is not a seed).

Acceptance: as above, ADR merged, CI green. UI follows in I2.
```

---

## Wave 3 — first screens

### M2 — Meetings: list + meeting workspace header

```text
KEY=meetings-workspace  BRANCH=feature/meetings-workspace

Goal: part 2 of 4 — the meetings section, the list, and the meeting workspace page with the
meeting header form. Uses M1's server layer and P1's editor.

Do:
1. Register section "Meetings" (segment meetings, Activity group) in project-sections.ts.
2. src/app/(app)/projects/[id]/meetings/page.tsx: DataView list (cards + columns: Title, Date,
   Time start–end, Location, Attendees count) sorted by date desc, filters date range + search,
   primary action "New meeting" creates a draft meeting and navigates to its workspace
   (multiple meetings per project — row 53).
3. ADR-0010 full-route exception: src/app/(app)/projects/[id]/meetings/[meetingId]/page.tsx —
   the meeting workspace. This PR builds its header section (rows 54, 72): Title, Objective
   (reason for the meeting), Date received, Meeting date, Start time and End time (native
   time inputs, end after start), Location (venue), Next meeting, Description (rich text),
   Conclusion (rich text), Follow-up action. Save / delete with ConfirmDialog / conflict handling
   (RowVer) / unsaved-changes guard; guardProjectScope for cross-project deep links;
   breadcrumbs back to the list. Layout leaves a right-hand column (desktop) for participants (M3)
   and a main column for agenda/minutes (M4) — render empty placeholders as headings only (no
   helper text).
4. Tests: Vitest for any new components' logic; Playwright meetings.spec.ts (create → edit header
   → appears in list → delete), validation failure (end before start, empty title),
   meetings-rbac.spec.ts (Viewer read-only, Contributor cannot delete), axe on list and workspace.
   Register the specs in playwright.config.ts.

Acceptance: section visible in nav; list + workspace header complete; e2e green.
```

### R2 — Risks & issues: UI merged with assumptions

```text
KEY=risks-issues-ui  BRANCH=feature/risks-issues-ui

Goal: part 2 of 2 — the risk & issue tracker UI, combined with assumptions & constraints
(checklist row 38: "Risk and Issue Tracker (combine with Assumptions and constraints)").

Decision (ADR, amends ADR-0018/0019 nav): one project section "Risks & assumptions"
(segment risks-issues, Planning group) replacing the separate assumptions-constraints entry.
The page has two tabs (URL ?tab=risks|assumptions, ARIA tabs): "Risks & issues" and
"Assumptions & constraints"; each tab is its own DataView with its own proc (no cross-table
paging). The old /projects/[id]/assumptions-constraints URL redirects to ?tab=assumptions and
keeps working for deep links (?id=). The existing assumptions module is reused, not rewritten.

Do:
1. Risks tab: DataView (columns Title, Category badge, Status badge, Priority, Owner, Due date;
   overdue open items visually marked), toolbar filters Category / Status / Priority + search,
   Sheet editor (ADR-0010) with all 11 fields (Description and Mitigation plan rich text,
   Owner free text with suggestions from project stakeholders, dates via DatePicker).
2. Assumptions tab: mount the existing assumptions-constraints view/sheet unchanged.
3. Update project-sections, messages, dashboard tile link, e2e for assumptions (URLs) without
   weakening them.
4. Playwright risks-issues.spec.ts + -rbac.spec.ts + axe; seeded rows render (HTML sanitised).

Acceptance: both tabs work, old URLs redirect, all e2e green.
```

### I2 — IT resource planning: UI

```text
KEY=it-resources-ui  BRANCH=feature/it-resources-ui

Goal: part 2 of 2 — the IT resource planning screen that matches PPTX slide 1 (rows 21-22:
"all fields editable").

Do:
1. Section "IT resources" (segment it-resource-planning, People & Resources group).
2. Page: calls EnsureDefaults then usp_ItResourcePlan_Get; renders the five categories as
   sections in PPTX order (IT Security, IT Infrastructure, IT Local Techs, User Training,
   IT Interfaces) + "Other" for legacy custom categories. Each line: rich-text detail (P1 editor,
   compact toolbar), Needed switch, reorder (keyboard-accessible move up/down; drag optional per
   ADR-0007), delete (ConfirmDialog). "Add line" per category. Inline editing saves per line with
   optimistic UI only for the Needed toggle (ADR-0009), conflict handling via RowVer.
3. "Existing systems & interfaces" panel next to IT Interfaces: DataView/Sheet CRUD over
   ExistingSystemInterface.
4. Print view (print CSS) — the rptITResourcePlanning equivalent; a Print button.
5. Playwright: add/edit/toggle/reorder/delete lines, validation failure, RBAC (Viewer read-only,
   Contributor no delete), axe.

Acceptance: all PPTX fields editable; e2e green.
```

---

## Wave 4

### M3 — Meetings: participants

```text
KEY=meetings-participants  BRANCH=feature/meetings-participants

Goal: part 3 of 4 — the participant list (rows 13, 54: "A list of participants generated from
the Stakeholder list of that project on the right hand side of the page; can select who
attended the meeting").

Do:
1. Extract the stakeholder picker now duplicated inside key-deliverables
   (repository/stakeholder-options.ts and MultiAssigneeSelect/AssigneeChip in deliverable-form.tsx)
   into the stakeholders module's public exports (ADR-0001 explicitly allows meetings →
   stakeholders picker); make key-deliverables use the shared one with its tests unchanged.
2. Workspace right-hand panel (stacks below the header on mobile): all project stakeholders with
   a tri-state per person — Not invited / Attended / Apology (radio group per row, labelled
   "Name - Position, Organization" like qryMeetingAttendees), counts of attended and apologies,
   search within the list. Saving calls setParticipants (usp_MeetingParticipant_Set) once; RowVer
   conflict handling; unsaved-changes guard.
3. Attendees/apologies are listed in the meeting card on the list page (counts).
4. Playwright: mark attended/apology → persists → counts on the list; RBAC; axe.

Acceptance: participant selection works from project stakeholders only; key-deliverables tests
unchanged and green.
```

### N1 — Notes

```text
KEY=notes  BRANCH=feature/notes  MIGRATION=021

Goal: module #14 (issue #15; rows 17-20, 42, 56, 62) — notes per project that behave like a Word
document with titled tabs and tables (P1 editor).

Facts: app.Note (ProjectId, Title, Content) and app.NoteTab (NoteId, Title, Content, SortOrder);
seed 016 = 7 notes with Title/Content and 0 tabs (asserted). In Access each tblNotes row was one
titled page (frmCreateNotePages). Procs in db/procs/note and note-tab lack @ActorRole/FORBIDDEN_ROW,
NoteTab_List/GetById have no scope, no reorder verb, Note_List searches raw HTML. ADR-0010 makes
the notes editor a full route. notes is already in CONTRIBUTOR_WRITE_MODULES.

Decision (ADR "Notes model"): a Note is a notebook; its pages are NoteTabs (each with a title =
row 19 "a title associated to each tab"). Migration 021 converts each existing Note's
Title/Content into its first NoteTab (Note.Title stays as the notebook title; Note.Content no
longer edited) — update db/verify/seed_counts.sql for NoteTab accordingly (7) and explain why in
the PR. Plain-text search columns maintained by the procs (no HTML LIKE search).

Do:
1. Migration 021 (+ SearchText columns), rewrite note/note-tab procs to the database standard
   (tabs resolve project through the note; cascade delete), add usp_NoteTab_Reorder and
   usp_Note_GetWithTabs.
2. src/modules/notes server slice (rich text via P1).
3. Section "Notes" (segment notes; add a "Records" group per ADR-0019 or the closest existing
   group — record the choice). List page: DataView of notebooks (title, tabs count, updated).
   Full-route workspace /projects/[id]/notes/[noteId]: notebook title, ARIA tablist of pages
   (add, rename, reorder, delete with ConfirmDialog), the P1 editor for the active page with
   explicit Save + unsaved guard (autosave optional only if it keeps RowVer conflict handling).
4. Playwright: create notebook → add pages → format text + table → reorder → reload persists;
   validation; RBAC; axe.

Acceptance: rows 17-20, 42, 56, 62 satisfied; seed verification updated consistently; e2e green.
```

### FI1 — Financials: database & server layer

```text
KEY=financials-data  BRANCH=feature/financials-data  MIGRATION=022

Goal: module #17 (issue #17; rows 23, 24, 64, PPTX slide 2) part 1 of 2.

Facts: app.Financial (ProjectId, ProjectNumber INT, Acquisition, GlGrandLivre, BudgetEnvelope,
Budget MONEY, SpendBy, RecurrentFees MONEY, ContractTimeframe), app.FinancialDocumentType
(9 lookup rows, seed 020, original spellings), app.FinancialDocument (FinancialId,
FinancialDocumentTypeId, IsRequired, ReasonNotCreated; filtered unique per type); seeds 019/020/021
= 2/9/9 rows (asserted). usp_Financial_GetDocumentChecklist exists (port of qryFinancialsExtended).
Procs lack @ActorRole/FORBIDDEN_ROW, Financial_Delete does not cascade, duplicate type surfaces as
an unmapped SQL error, no type list proc. Requirements: document checklist with justification when
skipped; thresholds are "captured as reason fields, not hard rules" (requirements.md:73) — do NOT
enforce a reason. PPTX labels: "Budget Envelop (source de financement)", "Project Number (MSSS
number)", "acquisition", "Budget", "GL Grand Livre (Internal) (A1-Required)", "Recurrent fees",
"Contract timeframe", "Spend bY"; documents DO, Appel d'offre, Montage Financier, DA, DAS,
Demande de Signature, Requisition, A1, Signed Direct Contract; "Reason for not creating the DA or
DAS OR DO?". F1 attachments are merged.

Do:
1. Migration 022 only if needed (e.g. index for sorts); keep the lookup's original spellings in
   data and present display labels from messages.
2. Rewrite financial + financial-document procs to the database standard (documents resolve the
   project through the financial; cascade delete; duplicate → 50005). New:
   usp_FinancialDocumentType_List, usp_FinancialDocument_Set @FinancialId @TypeId @IsRequired
   @ReasonNotCreated @RowVer (upsert one checklist row), checklist proc gains @ActorRole and returns
   attachment counts per document (FileAttachment EntityName 'FinancialDocument').
3. src/modules/financials server slice; rbac: decide whether Contributors edit financials (PLAN §9
   "CRUD on assigned module records") — record the decision.
4. Tests; seed counts unchanged.
```

---

## Wave 5

### M4 — Meetings: agenda → discussion → action items + printable minutes

```text
KEY=meetings-minutes  BRANCH=feature/meetings-minutes

Goal: part 4 of 4 — the minutes themselves (Access chain Meeting → Agenda → Discussion points →
Action items) and the printable minutes (rptMeetingMinutes with subrptMeetingAttendees /
subrptMeetingApologies).

Do:
1. Workspace main column: ordered agenda items (row 72 "Agenda: a field for listing meeting
   topics"); under each, its discussion points; under each discussion point (or directly under an
   agenda item), action items with Action text, Person responsible (single stakeholder Combobox
   from the meeting project's stakeholders — row 13), Due date. Add / edit inline / delete
   (ConfirmDialog) / reorder (keyboard move up/down; drag optional per ADR-0007) at each level;
   rich text only for discussion points; RowVer conflicts per item.
2. Open action items of a meeting appear with their due dates in the workspace summary; overdue
   marked.
3. Print view: /projects/[id]/meetings/[meetingId]/print (print CSS, no app chrome): header fields,
   attendees, apologies, agenda → discussion → actions table (action, person responsible, due
   date), conclusion, follow-up, next meeting. "Print minutes" button (window.print — works in
   browser and desktop edition).
4. Playwright: build a full minutes tree, reorder, delete cascade, print page renders; RBAC; axe
   on workspace and print view.

Acceptance: the five Access meeting tables are fully editable from one workspace; printable minutes.
```

### FI2 — Financials: UI

```text
KEY=financials-ui  BRANCH=feature/financials-ui

Goal: part 2 of 2 — the financial screen of PPTX slide 2 and the "tracking the financials"
export (row 64).

Do:
1. Section "Financials" (segment financials; same group as decided for Notes or People &
   Resources — record it). List page: DataView of the project's financial records (a project can
   have several — seed has 2 for project 2): Project number, Budget envelope, Budget, Recurrent
   fees, Contract timeframe, documents complete n/9.
2. ADR-0010 full-route exception /projects/[id]/financials/[financialId]: "Financial breakdown"
   form with the PPTX labels (money inputs with locale formatting, project number numeric), and
   "Financial documents required?" checklist: the 9 types in SortOrder, each with Required switch,
   Reason for not creating (shown for every row, not enforced), and the shared <Attachments> for
   that document (F1). Save per row via usp_FinancialDocument_Set; conflict handling.
3. Export: Route Handler GET /projects/[id]/financials/export.csv — one row per financial with the
   breakdown fields and one column per document type (Required / Not required + reason), UTF-8
   with BOM (Excel), RFC 4180 quoting, spreadsheet-formula injection neutralised (prefix ' for
   = + - @). Put the CSV writer in src/lib/csv.ts so Reports (RP1) reuse it. No XLSX dependency.
4. Print view of the financial record (rptFinancials equivalent).
5. Playwright: edit breakdown, toggle checklist with reason, attach a file, export downloads,
   RBAC, axe.
```

### F2 — Backup status + GitHub-based restore

```text
KEY=backup-status  BRANCH=feature/backup-status  MIGRATION=023

Goal: module #16 part 2 (rows 43, 65) — every backup and restore rehearsal is recorded and
visible, and restore works with the GitHub-hosted CI.

Facts: .github/workflows/backup.yml backs up an EPHEMERAL seeded SQL Server (not a real DB) and
keeps a 14-day artifact; scripts/backup.sh's GitLab Package Registry upload/prune is skipped on
GitHub; restore.sh / restore-files.sh only know GitLab; restore-rehearsal.sh assumes Linux paths
and default logical names; nothing records runs (no usp_Backup_* procs, no table);
docs/RESTORE-RUNBOOK.md and PLAN §5 are GitLab-centred and PLAN §5 has corrupted lines 163-164/179.
The desktop edition takes its own local verified backups and will record them through the same
procs.

Do:
1. Migration 023: app.BackupRun (BackupRunId, Kind full/diff/log/files/rehearsal/restore,
   Source ci/desktop/manual, StartedAtUtc, FinishedAtUtc, Succeeded, SizeBytes, Location
   NVARCHAR(500), Checksum, Detail NVARCHAR(MAX), audit cols) — transport-agnostic.
2. Procs usp_Backup_RecordRun (EXECUTE-able by the job login), usp_Backup_GetStatus (last
   success per kind, last failure, last rehearsal result, counts over 30 days), usp_Backup_List
   (ADR-0016, Admin only via @ActorRole).
3. Scripts: backup.sh + restore-rehearsal.sh record runs; storage target becomes pluggable
   (GitHub Actions artifact or release asset; keep the GitLab path working only if trivial);
   restore.sh / restore-files.sh fetch from GitHub (gh CLI or REST with a token) and from a local
   folder; rehearsal reads logical file names via RESTORE FILELISTONLY. Workflow: point at a real
   DB when DB_SERVER secrets exist, otherwise keep today's ephemeral smoke test and label it so.
4. Rewrite docs/RESTORE-RUNBOOK.md (web/Docker + desktop sections) and fix PLAN §5.
5. Tests: shellcheck in CI for the scripts; Vitest for any TS; the workflow runs green manually.
```

---

## Wave 6 — administration

### A1 — Admin: users & roles

```text
KEY=admin-users  BRANCH=feature/admin-users

Goal: module #22 (issue #23) part 1 — user and role management for Admins.

Facts: auth.[User] + auth.Role (4 fixed roles; the permission matrix is code in rbac.ts — no
permission tables by design, ADR-0015/0017). Procs exist: usp_User_Create/Update/Deactivate/
SetPassword/BumpSessionVersion/GetById/List, usp_Role_List; SessionVersion bump revokes sessions.
Missing: updateUser repository wrapper, unlock (FailedLoginCount/LockedUntilUtc reset),
last-active-admin guard, self-demotion/self-deactivation guard, admin UI and route.
Any permission "admin:*" is already Admin-only in can().

Do:
1. Procs: guards in Update/Deactivate (cannot remove/deactivate the last active Admin; cannot
   demote/deactivate yourself) as VALIDATION errors; usp_User_Unlock; all audited.
2. Route /admin (nav: Settings area, Admin only; layout-level guard with can(role,"admin:read")
   → notFound for others) with /admin/users: DataView (username, display name, email, role,
   active, locked, must-change), Sheet to create/edit. Create shows a generated one-time password
   once (copy button, MustChangePassword = 1) — same xxxx-xxxx-xxxx-xxxx format as the desktop
   edition; reset password does the same; unlock; deactivate/reactivate; revoke sessions.
   Project assignments are managed on the project charter (existing) — link to it.
3. Tests: Vitest (guards, schemas, actions), Playwright admin-users.spec.ts (create → login as new
   user forced to change password; demote guard; non-admin gets 404), axe.
```

### A2 — Admin: audit viewer, backup status, settings

```text
KEY=admin-audit  BRANCH=feature/admin-audit  MIGRATION=024

Goal: module #22 part 2 — audit log viewer, backup status panel, settings page.

Do:
1. Migration 024: indexes on audit.AuditLog (ActorUserId, OccurredAtUtc) and (Action, OccurredAtUtc).
2. usp_Audit_Search (ADR-0016 + filters actor, action, entity name, entity id, date range;
   Admin only) — read-only; the log is append-only.
3. /admin/audit: DataView with filters; row Sheet shows before/after JSON as a readable diff
   (no raw HTML rendering of values); CSV export through src/lib/csv.ts.
4. /admin/backups: status from usp_Backup_GetStatus (F2) — last successful backup per kind, age
   with warning when older than 26 h, last rehearsal result, recent runs list; link to the runbook.
5. /settings (replace the placeholder): Admins see links to Users, Audit, Backups; everyone sees
   their own account (display name, change password). Do not invent settings without a
   requirement — list candidates in the PR instead.
6. Tests + axe; non-admins get 404 on /admin/*.
```

---

## Wave 7-8 — reports and CI

### RP1 — Reports: infrastructure + per-module reports

```text
KEY=reports  BRANCH=feature/reports  MIGRATION=025 (only if needed)

Goal: module #21 (issue #21; rows 36, 37, 49) part 1 — printable and downloadable reports for
every module (ports of the Access rpt*/qry* listed in access-database.md §5).

Facts: no usp_Report_* procs, no export code (src/lib/csv.ts arrives with FI2), print CSS
precedent in globals.css + key-deliverables PrintButton/Gantt, /reports is a placeholder.
PLAN §9: every role may view, print and download reports (reports:read already allowed).

Do:
1. ADR "Reports": per-module report procs usp_Report_<Module> @ProjectId (ports of qryKeywords,
   qryAssumptionsConstraints, qryFinancialsExtended, qryITResourcePlanning, qryMeetingMinutes +
   attendees/apologies, qryObjectives, qryParkingLotItems, qryStakeholders, qrySuppliers,
   qryQuesAns, qryKeyReqDeliverables, daily activities, to-dos, risks & issues, notes) with the
   project check; report registry in src/modules/reports (key, title, columns, proc, formatter);
   one viewer route /reports/[report]?project= (print layout) + Route Handler CSV download
   (src/lib/csv.ts, rich text via htmlToPlainText) + "Print / Save as PDF" (window.print).
2. /reports page: choose project (type-ahead, usp_Project_Search) and report.
3. Each module page gets a "Report" action linking to its report (small, consistent).
4. Tests: Vitest for registry/formatters/CSV; Playwright: open each report, download CSV,
   print view axe-clean.
```

### RP2 — Reports: detailed project report + dynamic report builder

```text
KEY=reports-builder  BRANCH=feature/reports-builder

Goal: part 2 — rptDetailedProjectReport and rptDynamicReport/frmReportBuilder.

Facts: qryProjectReports selects columns that no longer exist (ProjectOrTask, Keywords,
QProjectPlan, … ITSecurity, Infrastructure) — report only what app.Project and the module tables
hold, and list the dropped columns in the ADR.

Do:
1. usp_Report_DetailedProject @ProjectId: charter + every module section (one call, JSON
   collections). Viewer with print CSS (cover, section headings, page breaks) + CSV bundle (zip
   only if no dependency is needed; otherwise one CSV per section via links).
2. Dynamic report builder at /reports/builder: pick entity (whitelist from the RP1 registry),
   columns, filters (typed per column), sort, project scope; run → DataView preview → print / CSV.
   No dynamic SQL from user input: the builder only chooses among registry columns and calls the
   entity's list/report proc with whitelisted filter parameters. Saved report definitions only if
   cheap (per-user, stored via a proc) — otherwise state in the URL so it can be bookmarked.
3. Tests incl. an injection attempt through filter values; axe.
```

### C1 — CI/CD & security automation (GitHub)

```text
KEY=ci-security  BRANCH=chore/ci-security

Goal: module #23 (issue #24) re-scoped for GitHub Actions.

Facts: .github/workflows/ci.yml (no permissions block, no concurrency, tag-pinned actions,
verify-sources trigger uses array equality so it never fires on docs/source changes),
security.yml (weekly only; npm audit "|| true"; named secret scan but has none), backup.yml
(see F2). renovate.json exists but nothing runs Renovate. No dependabot.yml, CODEOWNERS, PR or
issue templates (.gitlab/ ones were deleted). Stale .gitlab-ci.yml still in the repo. Docs (PLAN
§8/§10/§11, STANDARDS §11, AGENTS.md, LESSONS.md, README link to a root AGENTS.md) describe
GitLab. App connects as sa; SECURITY.md promises an EXECUTE-only DB_APP_USER that was never
created.

Do:
1. Workflows: least-privilege permissions, concurrency groups, timeout-minutes, SHA-pinned
   actions (Renovate keeps them updated), CodeQL + dependency-review on PRs to develop/main,
   gitleaks (or GitHub secret scanning + push protection — document which), blocking npm audit
   (high+) with an allow-list file for accepted advisories, container image scan of the
   Dockerfile, fix verify-sources path filter.
2. Run Renovate (GitHub App recommended — document the one-time install; or a self-hosted
   scheduled workflow with a token secret).
3. .github/pull_request_template.md (Module checklist from STANDARDS §12), issue templates,
   CODEOWNERS. Branch protection + required checks: document the exact settings (repo admin
   applies them).
4. Least-privilege DB login: migration/script creating pm_app_runtime with EXECUTE on dbo.usp_*
   only; compose/.env.example/CI use it for the app; sa only for db-apply.
5. Delete .gitlab-ci.yml; rewrite GitLab sections of PLAN/STANDARDS/AGENTS/LESSONS/README for
   GitHub (keep history notes short); delete the stale docs/LESSONS.md (root is canonical).
6. Deploy jobs: keep them as documented stubs unless a target exists — list what's needed.
```
