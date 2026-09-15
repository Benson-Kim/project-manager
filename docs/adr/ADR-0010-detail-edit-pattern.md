# ADR-0010 — Detail/edit: bottom sheet on mobile, side panel on desktop

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

List modules need one way to view/edit a record. Choices were separate detail routes,
centred dialogs, or contextual panels. Mobile-first (360 px) plus "keep the list
context" favours sheets/panels; full routes cost a navigation and lose list state;
centred dialogs are cramped for record forms on phones.

## Decision

- Opening a record from a list opens the shared `Sheet` primitive: **bottom sheet on
  < md** (full-width, drag/close affordance, safe-area padded) and **right side panel
  on ≥ md** (fixed 480 px). The same component instance serves view and edit; edit is
  the default content for simple entities, view-with-Edit-button for rich ones.
- The open record is reflected in the URL (`?id=123`) so refresh/back/deep-links work;
  closing the sheet clears the param and returns focus to the originating row.
- **Exceptions (decided now):** complex composite editors get a full route under the
  module — #5 project charter, #11 meeting workspace, #15 notes editor, #17 financial
  document workflow, #9 Gantt view, #21 report viewers. Everything else uses the sheet.
- Destructive actions inside the sheet use the one `ConfirmDialog` pattern: explicit
  object name, danger button labelled with the verb ("Delete"), cancel is the default
  focus, never a browser `confirm()`.

## Consequences

List state (search/filters/scroll) survives record work; one focus-management
implementation. Module issues state which pattern applies (sheet vs full route) in
their Standards-compliance section.
