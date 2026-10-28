# ADR-0049 — The desktop right-click menu: spelling, grammar and a switch

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** nothing. Corrects item 8 of `docs/client-feedback-2026-10-23.md`, which said the
  browser's own menu already offered spelling: Electron has no right-click menu of its own, so the
  desktop app showed nothing.

## Context

The client asked for spelling and grammar in the right-click menu, and a way to switch checking
off. Chromium's spell checker was already underlining words in every field that sets
`spellcheck`, but nothing offered the fixes. Chromium has no grammar checker.

## Decisions

1. **One menu, built in the main process** (`electron/context-menu.ts`, a pure template like the
   tray's): the spellings for a misspelt word and *Add to dictionary*, then grammar fixes for the
   paragraph, then Cut, Copy, Paste, Select all, then *Check spelling and grammar*. A page gets
   Copy and Copy link only.
2. **Grammar is Harper** (`harper.js`, Apache-2.0, English only, runs offline from a 20 MB
   WebAssembly file). Nothing leaves the PC. Its spelling lints are dropped: the built-in checker
   owns spelling and the user's dictionary.
3. **Harper runs in its own utility process**, because it holds about 300 MB once loaded. It starts
   when the window gains focus and stops after 30 minutes without use, and with the switch off.
   The menu waits at most 1.5 s for it; until it has loaded the menu says so instead of waiting.
4. **The paragraph at the caret is what gets checked.** A script run in the page reads it from the
   focused text box or rich-text editor; a fix selects the same span again, only if the paragraph
   still reads the same, and types the fix through the editor (`insertText`), so React and the
   rich-text editor see an ordinary edit and undo works. A field that turns spell checking off
   (sign-in, link, password) gets neither grammar nor the switch.
5. **The English is the Windows user's**: their first English language, else British, for both the
   spelling dictionary and Harper's dialect. The app ships one interface locale, so its own locale
   is always en-US and is not used.
6. **The switch is per Windows user** (`settings.json`, `checkSpelling`, on by default).

## Consequences

- The installer grows by the WebAssembly file; the browser edition is unchanged, since a browser
  has its own menu.
- The first right-click after a long idle offers no grammar for a few seconds.
