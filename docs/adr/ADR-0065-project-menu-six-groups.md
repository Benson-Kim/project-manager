# ADR-0065: Project menu in the client's six groups

- Status: Accepted. Choices not in the client's list are ours and can be changed.
- Date: 2026-11-12
- Module: shell (project section nav). Amends ADR-0019 (group list) and ADR-0046 decision 1 (Requirements as its own one-link group)

## Context

The client sent the headers they want for a project's menu, six groups with the pages under each:

1. Strategy & Financials: Projects, Objectives, Financials (Budget, Monitoring, Documents, Settings), Performance Analytics (was Project math)
2. Requirements & Deliverables: Key Deliverables (WBS/Gantt), Requirements Tracker, Dynamic Requirements Board
3. Execution: Kanban/Scrum Board, Checklist/Integrated Board, Daily Activities, To-do & Alerts, Calendar
4. Governance: Decision Log, Risks & Issues, Assumptions & Constraints, Parking Lot, Q&A
5. Workspace: Interactive Whiteboard, BPMN, Meeting Minutes, Notes, Daily activity list, To do list
6. Communication: Stakeholder Matrix, Stakeholders Comms, Suppliers, Keywords; IT Resource Planning marked "Remove"

The menu had six other groups (Overview, Requirements, Planning, People & Resources, Financials, Activity).

## Decision

1. The client's six groups, in their order and with their names, are the fixed project menu
   (`src/components/shell/project-sections.ts`). Each group lists its pages in the client's order. No
   per-user or per-project renaming of headings.
2. Page names follow the client where they name the page differently: Project overview, Key
   deliverables (WBS/Gantt), Requirements tracker, Dynamic requirements board, Daily activities, To-do
   & alerts, Meeting minutes, Performance analytics, Stakeholder matrix, Stakeholder comms. The names
   are shared with the page headings and the team permission grid where the page has one key; the
   to-do entry has its own menu name so the grid can still tell to-dos from to-do alerts.
3. Pages that are not built (Interactive Whiteboard, IT Resource Planning) are left out of the menu,
   not shown as dead links. A page joins the menu when it ships, in the place the list gives it, as
   Checklists did under Execution after the boards.
4. The canvas (`deliverables/canvas`) and the stakeholder matrix (`stakeholders/matrix`) get their own
   entries. A section nested under another section's route is the only current one on its routes.
5. Every page is listed once. The Workspace's "Daily activity list" and "To do list" are the user's own
   lists across projects, already in the left sidebar; the project's daily activities and to-dos sit
   under Execution.
6. Responsibility (the RACI matrices, not in the client's list) sits under Communication after the
   stakeholder pages.
7. The Financials views stay a labelled sub-list inside Strategy & Financials, so "Settings" still reads
   as the financial's settings.

## Consequences

- Every group now has two or more pages, so each is a disclosure; the overview is one click further away
  (also reachable from the project switcher and breadcrumbs).
- A unit test checks every built page appears in exactly one group, the six names and orders, and the
  nested-route rule; e2e checks the group buttons, the Financials sub-list and the two new entries.
