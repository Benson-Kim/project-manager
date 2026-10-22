# Traceability Matrix — Excel checklist → module → issue → branch

Source of truth: `docs/source/Project_.xlsx` (78 rows, fully extracted in
[`source/analysis/excel-workbook.md`](source/analysis/excel-workbook.md), verified
cell-for-cell in [`source/analysis/VERIFICATION.md`](source/analysis/VERIFICATION.md)).
Module ordering & goals: [`PLAN.md`](PLAN.md) §3/§10. Every functional row is
restated as an acceptance criterion in its module issue.

| Row | Checklist item (abridged) | Module | Issue | Branch |
|---|---|---|---|---|
| 1 | "Checklist" (title) | — header | — | — |
| 2 | "Requirements / Status / Comments" (column headers) | — header | — | — |
| 3 | 0-Projects | projects | #5 | feature/projects |
| 4 | 0.1 menu items linked to one project | projects (+ shell/navigation in foundation) | #5, #2 | feature/projects |
| 5 | 0.2 type-ahead project search | projects (`usp_Project_Search`) | #5 | feature/projects |
| 6 | 0.3 one-or-many PMs / sponsors / BAs | projects (M:N `ProjectAssignee`) | #5 | feature/projects |
| 7 | 1-Stakeholder(s) | stakeholders | #6 | feature/stakeholders |
| 8 | (blank sub-row of §1) | stakeholders | #6 | feature/stakeholders |
| 9 | 2-Keyword(s) | keywords (keywords) | #8 | feature/keywords |
| 10 | 3-Key Requirements Deliverables | key-deliverables (the deliverables themselves — see row 67 for the WBS and Gantt); requirements (ADR-0036: a requirement list under each WBS item, text + "met" tick, migration 035 → ADR-0037: requirements are a project-level register at `/projects/[id]/requirements` with five types (`BR`/`SR` needs, `FR`/`NFR`/`TR` solutions), a reference per project and type that is never reused (FR-3), traces solution → need with derived coverage, allocation of one requirement to any number of deliverables with one shared met tick, and its own `requirements:*` permissions; the WBS/Gantt cascade creates solution requirements and its × unallocates rather than deletes; migration 036 moves the 035 rows across as `FR` and drops the old table) | #9 | feature/key-deliverables, feature/wbs-gantt, feature/wbs-requirements |
| 11 | 4-Objectives | objectives | #10 | feature/objectives |
| 12 | 5-Meeting Minutes | meetings (ADR-0028: meeting → agenda → discussion points → actions, participants; migration 024, seed 032; server layer in M1) | #11 | feature/meetings-workspace (M2: section, datasheet list, workspace header); feature/meetings-participants (M3: participants); feature/meetings-minutes (M4: the agenda → discussion points → actions editor with add, inline edit, delete and keyboard reorder, open and overdue actions, and the printed minutes at `/print`, ADR-0028 amendment of 2026-10-15) |
| 13 | 5.1 "Person Responsible" fed by project stakeholders | meetings (the action item's `AssignedToStakeholderId`; the procs accept only a live stakeholder of the meeting's project, ADR-0028 §4) | #11 | feature/meetings-data (M1; UI in M2–M4); feature/meetings-participants (M3: the shared stakeholder picker in the stakeholders module); feature/meetings-minutes (M4: each action's "Person responsible" is the shared `StakeholderSelect` over the project's live stakeholders, "Name - Position, Organization"; printed in the minutes' action tables) |
| 14 | 6-Q&A | questions-answers | #12 | feature/questions-answers |
| 15 | 7-Supplier | suppliers | #7 | feature/suppliers |
| 16 | 8-Assumptions/Constraints | assumptions-constraints | #13 | feature/assumptions-constraints |
| 17 | 9-Notes | notes | #15 | feature/notes |
| 18 | 9.1 Notes can create tables | notes; tables in the shared editor (P1, ADR-0025) | #15 | feature/notes; editor: feature/rich-text |
| 19 | 9.2 titled tabs | notes | #15 | feature/notes |
| 20 | 9.3 Word-like tools | notes; toolbar in the shared editor (P1, ADR-0025) | #15 | feature/notes; editor: feature/rich-text |
| 21 | 10-IT Resource Planning | it-resource-planning | #16 | feature/it-resource-planning |
| 22 | 10.1 mock-up fields editable | it-resource-planning (PPTX slide 1) | #16 | feature/it-resource-planning |
| 23 | 11-Financials | financials: master templates (Settings) + project financials with budget planner, monitoring, CSV export (ADR-0029); document checklist per financial with advisory reasons and attachments, print view, PDF, project CSV (ADR-0030) | #17 | feature/financials-calculator |
| 24 | 11.1 mock-up fields editable | financials Settings tab "Financial breakdown" (PPTX slide 2 fields, ADR-0029); Documents tab "Financial documents required?" with required / reason / files per document (ADR-0030) | #17 | feature/financials-calculator |
| 25 | 12-Parking Lot Items | parking-lot | #18 | feature/parking-lot |
| 26 | 12.1 strikethrough content | parking-lot | #18 | feature/parking-lot |
| 27 | 12.2 mock-up fields editable | parking-lot (PPTX slide 3) | #18 | feature/parking-lot |
| 28 | 12.3 follow-up actions field | parking-lot | #18 | feature/parking-lot |
| 29 | 12.4 record "Date Added" | parking-lot | #18 | feature/parking-lot |
| 30 | 12.5 "Owner" field | parking-lot | #18 | feature/parking-lot |
| 31 | 13-Dynamic To-Do List | todo-alerts | #20 | feature/todo-alerts |
| 32 | 13.1 built from daily activity list | todo-alerts | #20 | feature/todo-alerts |
| 33 | 13.2 line items orderable in any order | todo-alerts | #20 | feature/todo-alerts |
| 34 | 14-Daily Activity List | daily-activities | #19 | feature/daily-activities |
| 35 | 14.2 video fields editable | daily-activities | #19 | feature/daily-activities |
| 36 | 15-Reports | reports | #21 | feature/reports |
| 37 | 15.1 printable reports from any information | reports | #21 | feature/reports |
| 38 | 16-Risk & issue tracker (all 11 fields, merged w/ assumptions) | risks-issues | #14 | feature/risks-issues |
| 39 | "Items to Remember" (section header) | — header | — | — |
| 40 | Navigation form to form | foundation (app shell/nav) + every module | #2 | feature/foundation |
| 41 | Check every field on every form | every module (DoD: field parity vs source) + QA gate | #1 (DoD), all | all |
| 42 | Spell check / grammar | P1: spellcheck in the rich-text editor and on Input/Textarea prose fields (lang from `<html>`) | #15, #2 | feature/rich-text |
| 43 | How do I back up my data? | F1 (ADR-0026): attachment bytes outside SQL in `UPLOADS_DIR`; the desktop mirrors them next to its database copies (`<copy folder>\Uploads`), the server's `scripts/backup.sh` tars them. Scheduled sweep, file restore and GitHub backups: F2 | #22 | feature/file-storage |
| 44 | Field to capture where files are stored | F1 (ADR-0026): an attachment is an uploaded file or a location (`app.FileAttachment.StorageLocation`: a URL, network path or place), on daily activities first | #22 | feature/file-storage |
| 45 | Virus-check of executable | resolved by web-app architecture (no executable distributed) — documented | #1 | — |
| 46 | Enhanced data availability | foundation (web app + backups + staging/prod) | #2, #22 | feature/foundation |
| 47 | UX user experience | foundation design system + every module (DoD) | #2, all | all |
| 48 | Layout, aesthetics | foundation design system | #2 | feature/foundation |
| 49 | Reports must be downloadable | reports (export routes) | #21 | feature/reports |
| 50 | Check resizing | mobile-first responsive design — every module (DoD) | all | all |
| 51 | Multiple screens (framework + daily list side by side) | foundation (deep-linkable routes) + daily-activities | #2, #19 | feature/foundation |
| 52 | Multiple project instances open at once | foundation (stateless routes, per-tab state) | #2 | feature/foundation |
| 53 | Multiple meeting minutes per project | meetings (`usp_Meeting_List` per project; "New meeting" creates a draft, ADR-0028 §10) | #11 | feature/meetings-workspace (M2: the Meetings datasheet per project, "New meeting" opens a draft) |
| 54 | Meeting minutes extra fields (date received, participant list, title, objective) | meetings (`DateReceived`, `Objective`; title = `Subject`; participants from the project's stakeholders via `usp_MeetingParticipant_Set`, ADR-0028 §1, §5) | #11 | feature/meetings-workspace (M2: title, objective, date received on the header); feature/meetings-participants (M3: the right-hand panel lists every project stakeholder, "Name - Position, Organization", as Not invited / Attended / Apology with search and counts, `usp_Meeting_GetRoster`, ADR-0028 amendment; counts on the list) |
| 55 | Supplier address fields | suppliers | #7 | feature/suppliers |
| 56 | Word-like functions everywhere | shared RichTextEditor + RichTextView + server sanitiser (P1, ADR-0025); modules adopt it | #15 | feature/rich-text |
| 57 | To-do pop-up alerts w/ date+time, frequency, snooze | todo-alerts | #20 | feature/todo-alerts |
| 58 | Keywords: search field + rename to "keywords" | keywords | #8 | feature/keywords |
| 59 | To-do list predicated on daily activities + filters (to-do, requester) | todo-alerts | #20 | feature/todo-alerts |
| 60 | Portability (installable anywhere) | foundation (Docker/compose/standalone) | #2 | feature/foundation |
| 61 | Import mechanism from the Access database | database-schema-and-procs (seeds from extraction — delivered, MR !6) | #3 | feature/database-schema-and-procs |
| 62 | Font (Microsoft Word) | shared editor font family (system fonts) and size controls (P1, ADR-0025) | #15 | feature/rich-text |
| 63 | "Potential Additional Requirements" (header) | — header | — | — |
| 64 | Financial tracking spreadsheet equivalent | financials: `Financials Calculated.xlsx` as a calculator (Budget Execution -> Budget tab, Monitoring execution budget -> Monitoring tab, 1-7 years) + CSV export (ADR-0029), project-wide CSV with document columns, print view and PDF (ADR-0030) | #17 | feature/financials-calculator |
| 65 | Export & import data (backups) | file-storage-and-backup (+ admin) | #22, #23 | feature/file-storage-and-backup |
| 66 | Calendar with reminders for to-dos | todo-alerts (calendar view) | #20 | feature/todo-alerts |
| 67 | Gantt from key-deliverable dates (start date required) | key-deliverables (rebuilt 2026-10-13, ADR-0027 — key deliverables are a work breakdown up to 10 levels (codes 1, 1.1, 1.1.1 …, indented) that draws the Gantt at `/projects/[id]/deliverables/gantt`; the WBS is also drawn as the checklist's box diagram (`?view=wbs`, the default: project on top, top-level boxes across, sub-items stacked and indented), where items are added, renamed, deleted and moved by drag and drop, and their dates typed in the box; a WBS \| Gantt switch shares one editor, so a change in either shows in the other at once; add, rename, indent, move and delete in the outline show at once on the chart; start date required, parent dates roll up; bars drag, stretch and draw with the cursor; days / weeks / months scale with the dates in the header and beside each bar; migration 032, seed 031) | #9 | feature/key-deliverables, feature/wbs-gantt |
| 68 | "Add ons" (header) | — header | — | — |
| 69 | Project screen add-ons (priority, est. completion, phase, risk level, status) | projects | #5 | feature/projects |
| 70 | Stakeholder screen add-ons (email, comm pref, engagement, role description) | stakeholders | #6 | feature/stakeholders |
| 71 | Key deliverable add-ons (deadline, assigned-to, priority, status) | key-deliverables (delivered — Sheet form with date picker, stakeholder Combobox, status/priority) | #9 | feature/key-deliverables |
| 72 | Meeting minutes add-ons (location, agenda, start/end time, follow-up) | meetings (existing `Location`, `StartTime`/`EndTime` with end after start, `FollowupAction`; ordered agenda items with `_Reorder`, ADR-0028 §7, §10) | #11 | feature/meetings-workspace (M2: location, start/end time, follow-up on the header); feature/meetings-minutes (M4: the ordered agenda with Move up / Move down, its discussion points and actions, all printed in the minutes) |
| 73 | Q&A add-ons (category, priority, assigned-to) | questions-answers | #12 | feature/questions-answers |
| 74 | Supplier add-ons (contact, email, contract dates, rating, address) | suppliers | #7 | feature/suppliers |
| 75 | Assumptions/constraints add-ons (type, impact, mitigation) | assumptions-constraints | #13 | feature/assumptions-constraints |
| 76 | Daily activity add-ons (time spent, assigned-to, task type, progress %) | daily-activities | #19 | feature/daily-activities |
| 77 | (empty row, status only) | — | — | — |
| 78 | (empty row, status only) | — | — | — |

**PPTX mock-up traceability:** slide 1 (IT Resource Planning + SmartArt
categories) → #16 · slide 2 (Financials $$$, MSSS document workflow — matches
recovered `tblFinancialDocuments` lookup) → #17 · slide 3 (Parking Lot Items)
→ #18.

**Auth/RBAC (module #4, issue #4):** the checklist has no dedicated auth row —
multi-user access + RBAC derive from PLAN §2 (new `auth.*` tables) and §7 and
from cross-cutting rows 46/47. Delivered by MR !8 (`feature/auth-and-rbac`):
Auth.js v5 credentials + argon2id, JWT sessions with SessionVersion revocation
(ADR-0017), IP rate limit + lockout, seeded admin with forced password change,
Login/Logout audit. Deferred: browser-level RBAC-denial spec → #26, full
SecLists top-10k denylist subset → #27.

**Per-project access (S1, wave 1, `fix/idor-getbyid`):** row 6 (req 0.3 "one
or many PMs / sponsors / BAs") now also carries access. Each team member has a
title and, when linked to an account, an access level (Viewer, Contributor or
Manager) for that project only, so one person can manage one project and view
another ([ADR-0021](adr/ADR-0021-per-project-access-levels.md)). Global roles
collapse to Admin and User (migration 017). This also closes the IDOR finding
`docs/security/IDOR-getbyid-procs.md`.

**Client feedback §2–4 (CF, wave 1, `feature/datasheet`, PR #19, migrations 018–021):**
- **Every list module:** list view is an Access-style datasheet with direct
  cell typing, a persistent new-entry row, column reordering and drag-to-resize columns
  and rows (per-user layout) ([ADR-0023](adr/ADR-0023-dataview-datasheet-mode.md)).
- **Dropdowns:** values are Admin-managed lists, editable inline, with optional colours
  that can tint whole rows, e.g. high priority ([ADR-0022](adr/ADR-0022-managed-lookup-lists.md)).
- **Rows 31–34, 59 and 76 (to-dos, daily activities):** a Project column and project filter
  on the cross-project pages. The Daily Activities columns follow the client's order.
- **Row 57, to-do alarms:** they fire on the user's local wall-clock time, with a persistent
  toast, the bell's "Due now" list and a chime.
- **Row 6 (team):** titles are a managed list; per-person permission overrides come
  through the team cog ([ADR-0024](adr/ADR-0024-per-person-permission-overrides.md)); team editing is inline.

**Coverage check:** every non-header, non-empty row (3–38, 40–62, 64–67,
69–76) is owned by exactly one primary module; cross-cutting rows (41, 47, 50)
are Definition-of-Done items on every module issue and are tracked on epic #1.
