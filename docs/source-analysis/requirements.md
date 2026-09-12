# Consolidated Requirements — Project Manager Rebuild

Synthesised from the three source artefacts (details in the sibling documents):

- [`access-database.md`](access-database.md) — the existing Access 2010 application (schema, all data, queries, forms, reports, modules)
- [`excel-workbook.md`](excel-workbook.md) — the customer's requirements checklist for the rebuild
- [`hololens-presentation.md`](hololens-presentation.md) — screen mock-ups ("Project Dossier Medical Electronique (DME)") for IT Resource Planning, Financials and Parking Lot Items

## 1. What the current system is

A single-user Microsoft Access application used by a project manager (healthcare IT context, Quebec — French financial terminology such as *Dossier d'Opportunité (DO)*, *Dossier d'Affaires (DA/DAS)*, *Appel d'Offres*, MSSS rules) to track IT projects end-to-end: framework/charter, stakeholders, meetings & minutes, financials, resource planning, risks, daily activities and a to-do list with pop-up alerts (VBA `TodoList Alerts` module + `AutoExec` macro).

## 2. Business entities (from the Access schema + data)

| Entity | Source table(s) | Notes |
|---|---|---|
| Project | `tblProjectFramework` (28 cols) | Charter: name, PM, BA, sponsor, dates, problem statement, current/future state, user impact, mandate, status, financial checkboxes (A1, DA, DAS, PO, Requisition, DO), financing source/cost, recurrent cost, equipment purchase + notes, start/end dates, similar-project flag, document attachments |
| Stakeholder | `tblStakeholders` (16 cols) | Name, department/org, project role + description, phone/ext/mobile/email, location, org title, communication preference (Email/Phone/Meetings), engagement level (High/Medium/Low), notes |
| Third-party supplier | `tbl3rdPartySupplier` (13 cols) | Name, contact person, email, contract start/end, rating, full address (address, city, province/state, country, postal code) |
| Acronym / keyword | `tblAcronyms` | Acronym + meaning per project; requirement 13: add search, rename to "keywords" |
| Key requirement / deliverable | `tblKeyRequirementsDeliverable` | Text, deadline, assigned-to (stakeholder FK), priority, status |
| Objective | `tblProjectObjectives` | Objective text, measurable outcome, target date, owner |
| Meeting minutes | `tblMeetingAgenda`, `tblMeetingDiscussionPoints`, `tblMeetingActionItems`, `tblMeetingParticipants` (orphaned parent `tblMeetingMinutes`) | Meeting → agenda items → discussion points → action items; participants with attended/apologies flags; desired extra fields: date received, meeting location, agenda, time start/end |
| Q&A | `tblInterviewQuestionsAnswers` | Question, answer, category, priority, assigned-to |
| Assumption / constraint | `tblAssumptionsConstraints` | Text, type (Assumption/Constraint), impact, status |
| Risk / issue | `tblRisksIssuesTracker` (12 cols) | Title, description, category, status, probability, impact, severity, owner, mitigation, dates — to be merged/aligned with assumptions & constraints (checklist §16) |
| Note | `tblNotes` + attachment side-table | Rich-text notes per project; must behave like Word: tables, tabs with titles, bold/italic/bullets/strikethrough/fonts |
| IT resource planning | `tblITResourcePlanning` + `tblITResourcePlanningDetails` | Categories: IT Security, IT Infrastructure, IT Local Techs, User Training, IT Interfaces (PPTX SmartArt); per category N detail lines with "needed" flag |
| Financials | `tblFinancials`, `tblProjectFinancialDocuments` + attachments | Budget envelope / financing source, MSSS project number, acquisition type, budget, GL, recurrent fees, contract timeframe, spend-by; document checklist DO / DA / DAS / A1 / Appel d'Offres / Montage Financier / Requisition / Demande de Signature / Signed Direct Contract, with justification when skipped (e.g. non-capitalizable, < 200 000 $ per MSSS rules) |
| Parking lot item | `tblParkingLotItems` | Item text (strikethrough support), follow-up actions, date added, owner |
| Daily activity | `tblDailyActivityList` (17 cols) + attachments | Date, activity, status (`tblActivityStatusType` lookup: Not Started / In Progress / Completed…), requester, time spent, assigned-to |
| To-do item | `tblTodoList` (20 cols) | Derived from projects or daily activities (`ProjectOrActivity`), start/due date, priority (Critical/High/…), status, notes, alert engine: IsAlert, AlertDay, AlertTime, repeat unit/interval, snooze count/max/options, dismissal |
| Report | `qryProjectReports`, `frmReportBuilder`, `rptDynamicReport` + 24 reports | Printable/downloadable reports over any data, incl. detailed project report, meeting minutes, financials, dynamic user-built reports |
| Existing systems / interfaces | `tblExistingSystemsInterfaces` | Systems the project touches / interfaces required |
| (Unused/vestigial) | `tblProjectSummary`, `tblProjectTask`, `tblProjectTaskList`, `tblTaskFramework` | Empty tables — superseded designs; keep out of new model but noted for completeness |

## 3. Relationships (enforced in new schema)

All child entities hang off `Project` (`ProjectID`). Additional chains:
Meeting → Agenda → DiscussionPoints → ActionItems (also linked to Participants);
Financials → FinancialDocuments; ITResourcePlanning → Details; DailyActivity → TodoList.
Two orphaned Access relationships (`tblMeetingMinutes`, `tblFinancialDocuments`) are re-instated as proper parents.

## 4. Functional requirements (Excel checklist, verbatim source in excel-workbook.md)

0. **Projects**: menu items linked to one project; type-ahead project search; a project can have **one or many** project managers, sponsors and business analysts.
1–8. CRUD screens for Stakeholders, Acronyms, Key Requirement Deliverables, Objectives, Meeting Minutes (Person Responsible dropdown fed by project stakeholders), Q&A, Suppliers, Assumptions/Constraints.
9. **Notes**: create tables, titled tabs, Word-like editing tools.
10–11. IT Resource Planning and Financials: all mock-up fields editable (see PPTX).
12. **Parking lot**: strikethrough content, follow-up actions, date added, owner.
13. **Dynamic to-do list** built from the daily activity list; line items orderable in any order.
14. **Daily activity list**: editable fields per video/mock-up.
15. **Reports**: printable reports from any information in the system.
16. **Risk & issue tracker** (merged with assumptions/constraints): title, description, category, status, probability, impact, severity, owner, mitigation.

### "Items to remember" (non-functional / UX)
form-to-form navigation; verify every field; spell/grammar check; **backups + documented restore**; field capturing file storage locations; virus-scan concern for executables (⇒ web app removes this); enhanced data availability; UX & aesthetics; **downloadable reports**; responsive resizing; multiple screens/windows simultaneously (project framework + daily activity list); multiple projects open at once; multiple meeting minutes per project; richer meeting-minutes fields; supplier address fields; Word-like rich text everywhere; **to-do pop-up alerts with date/time, frequency and snooze intervals**; acronym search renamed "keywords"; to-do list predicated on daily activities with filters (to-do, requester); **portability** (installable anywhere ⇒ Docker); **import mechanism from the Access database** (⇒ `db/seed` generated from this extraction).

### Potential additional requirements
financial tracking spreadsheet equivalent; **export/import data (backups)**; calendar with reminders; **Gantt chart** driven by key-requirement deliverable dates (start date required).

### Add-on suggestions (per screen)
Project: priority dropdown, estimated completion date; Stakeholder: email, communication preference, engagement level; Key deliverables: deadline picker, assigned-to, priority, status; Meeting minutes: location, agenda, time start/end; Q&A: category, priority, assigned-to; Supplier: contact person, email, contract dates, rating; Assumptions/Constraints: type, impact, status; Daily activity: time spent, assigned-to. *(Several of these were already added to the Access schema — the extraction confirms they exist as columns.)*

## 5. Roles & security (inferred + required for the web rebuild)

The Access app is single-user (Admin). The web rebuild introduces: **Admin** (users, roles, permissions, audit log, backups, settings), **Project Manager** (full CRUD on own projects), **Contributor/BA** (edit assigned modules), **Viewer** (read-only/report access). RBAC enforced at route, server-action and stored-procedure level; full audit logging.

## 6. Business rules observed in data/queries

- To-do alerting: overdue when `DueDate < today`; "Approaching Deadline" when `DueDate − 2 ≤ today`; excludes Completed/Cancelled (`qryUpcomingAlerts`). Repeating alerts by unit (Hour/Day/…) + interval, max snooze count and snooze options (5/10/15 min).
- Status vocabulary: Not Started / In Progress / Completed (+ Cancelled for to-dos); priorities: Critical / High / Medium / Low.
- Financial documentation depends on cost thresholds (e.g. no DA/DAS if non-capitalizable; < 200 000 $ ⇒ no MSSS documentation) — captured as reason fields, not hard rules.
- Meeting participants marked attended vs apologies drive `qryMeetingAttendees` / `qryMeetingApologies` report sections.
- Reports are project-scoped and selected via a report-selector across all entities (`qryProjectReports` unions the module list).

## 7. Migration data inventory

18 projects, 8 stakeholders, 12 suppliers, 29 acronyms, 8 key deliverables, 6 objectives, 3 meetings (3 agenda, 3 discussion, 9 action items, 8 participants), 12 Q&A, 8 assumptions/constraints, 2 risks, 7 notes, 15+18 resource-planning rows, 2 financials + 9 financial documents, 12 parking-lot items, 13 daily activities, 16 to-dos — full row data in `access-database.md`; converted to `db/seed/*.sql`.
