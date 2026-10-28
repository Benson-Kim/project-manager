# ADR-0042 — Toolbar hover hints in the rich-text editor

Status: Accepted · Date: 2026-10-23 · Session: notes-editor (amends STANDARDS §5.1, ADR-0025)

## Context

The client asked (2026-10-23) for hints on the notes editor's options: most toolbar controls are
icons (lists, alignments, indents, colours, numbering, table, insert), and Word shows each one's
name and shortcut when the pointer rests on it. STANDARDS §5.1 forbids tooltips anywhere, so this
needs a documented exception, as the datasheet's ghost placeholders got (ADR-0023).

The rule exists to keep explanation out of the UI. A control's own name is not an explanation:
it is the label an icon-only button already has for screen readers (`aria-label`), shown to
sighted pointer and keyboard users too.

A native `title` was not used: it never shows on keyboard focus, cannot be dismissed with Escape,
duplicates the name for some screen readers, and its delay and look are the browser's.

## Decision

1. **Scope: the rich-text editor's formatting toolbar only.** Every other part of the app keeps
   the no-hints rule. A hint shows only the control's name and its shortcut, never instructions:
   "Bold (Ctrl+B)", "Numbering style", "Align right (Ctrl+Shift+R)".
2. **One source for the words.** The hint is built from the control's `aria-label` and
   `aria-keyshortcuts` (`hintText()` in `toolbar-model.ts`), so the visible hint and what a
   screen reader announces cannot drift. The hint itself is `aria-hidden`.
3. **Shortcuts are declared on the control.** `aria-keyshortcuts` now covers every toolbar
   shortcut the editor has: lists (Ctrl+Shift+8 / 7), alignments (Ctrl+Shift+L / E / R / J) and
   the Highlight menu's trigger (Ctrl+Shift+H, the default highlight; `Menu` takes an optional
   `shortcut`), besides the ones already there.
4. **Behaviour (WCAG 2.2 SC 1.4.13, content on hover or focus)**, in `toolbar-hint.tsx`:
   - shown after 500 ms of mouse hover, at once when another hint is showing or just was (moving
     along the toolbar), and at once when a control is reached with the keyboard;
   - never for touch, never while a toolbar menu is open, and not for a control just clicked;
   - **hoverable:** it stays while the pointer is over the control, the hint or the gap between
     them; clicks pass through it to the text below (`pointer-events: none`);
   - **dismissible:** Escape hides it without moving focus or the pointer, and the key goes no
     further, so it never also closes the datasheet's editor panel (which would drop the edit).
     A click, Enter, Space or a Ctrl shortcut hides it too;
   - **persistent:** otherwise it stays until the pointer leaves or focus moves.
5. **Placement:** centred under the control, moved sideways to stay inside the window
   (`shiftIntoView`, shared with the menus), above the text in the dropdown layer.

## Consequences

- STANDARDS §5.1 lists this as its second documented exception; the Forbidden table and the
  Definition-of-Done line point to it.
- A new toolbar control gets its hint by having an `aria-label` (it needs one anyway) and, if it
  has a shortcut, `aria-keyshortcuts`.
- Tests: `toolbar-hint.test.ts` (placement, the hoverable area), `rich-text-toolbar.test.ts`
  (hint text), e2e in `rich-text.spec.ts` (hover, Escape, keyboard focus, axe).
