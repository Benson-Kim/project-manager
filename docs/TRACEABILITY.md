# Traceability Matrix — Excel checklist → module → issue → branch

Source of truth: `Project_.xlsx` (78 rows, fully extracted in
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
| 9 | 2-Acronym(s) | acronyms (keywords) | #8 | feature/acronyms |
| 10 | 3-Key Requirements Deliverables | key-deliverables | #9 | feature/key-deliverables |
| 11 | 4-Objectives | objectives | #10 | feature/objectives |
| 12 | 5-Meeting Minutes | meetings | #11 | feature/meetings |
| 13 | 5.1 "Person Responsible" fed by project stakeholders | meetings | #11 | feature/meetings |
| 14 | 6-Q&A | questions-answers | #12 | feature/questions-answers |
| 15 | 7-Supplier | suppliers | #7 | feature/suppliers |
| 16 | 8-Assumptions/Constraints | assumptions-constraints | #13 | feature/assumptions-constraints |
| 17 | 9-Notes | notes | #15 | feature/notes |
| 18 | 9.1 Notes can create tables | notes | #15 | feature/notes |
| 19 | 9.2 titled tabs | notes | #15 | feature/notes |
| 20 | 9.3 Word-like tools | notes | #15 | feature/notes |
| 21 | 10-IT Resource Planning | it-resource-planning | #16 | feature/it-resource-planning |
| 22 | 10.1 mock-up fields editable | it-resource-planning (PPTX slide 1) | #16 | feature/it-resource-planning |
| 23 | 11-Financials | financials | #17 | feature/financials |
| 24 | 11.1 mock-up fields editable | financials (PPTX slide 2) | #17 | feature/financials |
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
| 42 | Spell check / grammar | notes + foundation (browser spellcheck attrs, lang) | #15, #2 | feature/notes |
| 43 | How do I back up my data? | file-storage-and-backup | #22 | feature/file-storage-and-backup |
| 44 | Field to capture where files are stored | file-storage-and-backup (`app.FileAttachment.StorageLocation`) | #22 | feature/file-storage-and-backup |
| 45 | Virus-check of executable | resolved by web-app architecture (no executable distributed) — documented | #1 | — |
| 46 | Enhanced data availability | foundation (web app + backups + staging/prod) | #2, #22 | feature/foundation |
| 47 | UX user experience | foundation design system + every module (DoD) | #2, all | all |
| 48 | Layout, aesthetics | foundation design system | #2 | feature/foundation |
| 49 | Reports must be downloadable | reports (export routes) | #21 | feature/reports |
| 50 | Check resizing | mobile-first responsive design — every module (DoD) | all | all |
| 51 | Multiple screens (framework + daily list side by side) | foundation (deep-linkable routes) + daily-activities | #2, #19 | feature/foundation |
| 52 | Multiple project instances open at once | foundation (stateless routes, per-tab state) | #2 | feature/foundation |
| 53 | Multiple meeting minutes per project | meetings | #11 | feature/meetings |
| 54 | Meeting minutes extra fields (date received, participant list, title, objective) | meetings | #11 | feature/meetings |
| 55 | Supplier address fields | suppliers | #7 | feature/suppliers |
| 56 | Word-like functions everywhere | notes editor component (shared) | #15 | feature/notes |
| 57 | To-do pop-up alerts w/ date+time, frequency, snooze | todo-alerts | #20 | feature/todo-alerts |
| 58 | Acronyms: search field + rename to "keywords" | acronyms | #8 | feature/acronyms |
| 59 | To-do list predicated on daily activities + filters (to-do, requester) | todo-alerts | #20 | feature/todo-alerts |
| 60 | Portability (installable anywhere) | foundation (Docker/compose/standalone) | #2 | feature/foundation |
| 61 | Import mechanism from the Access database | database-schema-and-procs (seeds from extraction) | #3 | feature/database-schema-and-procs |
| 62 | Font (Microsoft Word) | notes editor (font family/size controls) | #15 | feature/notes |
| 63 | "Potential Additional Requirements" (header) | — header | — | — |
| 64 | Financial tracking spreadsheet equivalent | financials (budget breakdown view/export) | #17 | feature/financials |
| 65 | Export & import data (backups) | file-storage-and-backup (+ admin) | #22, #23 | feature/file-storage-and-backup |
| 66 | Calendar with reminders for to-dos | todo-alerts (calendar view) | #20 | feature/todo-alerts |
| 67 | Gantt from key-deliverable dates (start date required) | key-deliverables | #9 | feature/key-deliverables |
| 68 | "Add ons" (header) | — header | — | — |
| 69 | Project screen add-ons (priority, est. completion, phase, risk level, status) | projects | #5 | feature/projects |
| 70 | Stakeholder screen add-ons (email, comm pref, engagement, role description) | stakeholders | #6 | feature/stakeholders |
| 71 | Key deliverable add-ons (deadline, assigned-to, priority, status) | key-deliverables | #9 | feature/key-deliverables |
| 72 | Meeting minutes add-ons (location, agenda, start/end time, follow-up) | meetings | #11 | feature/meetings |
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

**Coverage check:** every non-header, non-empty row (3–38, 40–62, 64–67,
69–76) is owned by exactly one primary module; cross-cutting rows (41, 47, 50)
are Definition-of-Done items on every module issue and are tracked on epic #1.
