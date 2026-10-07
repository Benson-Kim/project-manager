# ADR-0020 — Rich-text editing and HTML sanitisation

Status: Accepted · Date: 2026-10-10 · Session: rich-text

## Context

Several modules — Notes, Meetings, Risks/Issues, IT resource planning, and Financials —
require a Word-like rich-text editor so that users can format field content with bold,
italic, underline, strikethrough, headings, bulleted/numbered lists, tables, and links.
The Access source database already stores HTML in several fields
(`RiskIssue.Description`, `RiskIssue.MitigationPlan`, `ItResourceItem.DetailText`,
`Meeting.Description`) including legacy `<div>`, `<font face size>`, `<strong>`,
`<em>`, `<u>` and decoded HTML entities.

Requirements (from PLAN.md §7, SECURITY.md, and checklist rows 17–20, 42, 56, 62):

1. One shared editor component and server-side HTML sanitiser reusable across all
   modules; no per-module fork.
2. Rich-text HTML must be sanitised server-side before storage AND again on render
   (defence in depth), with an explicit allow-list of tags, attributes and styles.
3. The toolbar must cover: bold, italic, underline, strikethrough, bulleted lists,
   numbered lists, headings (h2–h4), font family (system fonts only), font size,
   text alignment, insert/delete table rows/columns, link (http/https/mailto),
   undo/redo, clear formatting. Word-compatible keyboard shortcuts.
4. The editor must lazy-load (next/dynamic) so pages respect the 170 kB gzip budget.
5. No runtime network requests — the app ships as an offline Windows desktop
   application (Electron + local SQL Server Express). No CDN fonts, no remote APIs.
6. CSP: `script-src 'nonce-… 'strict-dynamic'`; `style-src 'self' 'unsafe-inline'`;
   `font-src 'self'` — no remote fonts. The editor must not inject `<script>` or
   external style tags.
7. WCAG 2.2 AA: roving-tabindex toolbar (`role="toolbar"`), visible focus, 44 px
   toolbar targets, spellcheck enabled with `lang` from `<html>`.
8. The component works inside existing `<form>` + `action()` + `useZodForm` patterns:
   writes HTML to a hidden `<input>` so FormData capture is unchanged.
9. Plain text extraction (`htmlToPlainText`) is needed for list cards, search
   snippets and CSV export.
10. Spellcheck must be enabled on plain `<Textarea>` and `<Input type="text">` fields
    project-wide (checklist row 42).

## Decision

### Editor: Tiptap (ProseMirror-based)

**Chosen: Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`) + purpose-built
extensions.**

Tiptap is a headless, ProseMirror-based rich-text framework. The StarterKit extension
bundle covers paragraph, bold, italic, strike, code, blockquote, bullet list, ordered
list, headings, hard break, horizontal rule, history (undo/redo). Additional
first-party extensions cover the remaining requirements:

| Requirement | Tiptap extension |
|---|---|
| Underline | `@tiptap/extension-underline` |
| Font family (system fonts) | `@tiptap/extension-text-style` + `@tiptap/extension-font-family` |
| Font size | `@tiptap/extension-text-style` (FontSize custom mark, ~20 lines) |
| Text alignment | `@tiptap/extension-text-align` |
| Table + row/col/header | `@tiptap/extension-table` + `@tiptap/extension-table-row` + `@tiptap/extension-table-cell` + `@tiptap/extension-table-header` |
| Link (http/https/mailto) | `@tiptap/extension-link` |

Headless design means no injected CSS files from the package; all styles come from
project Tailwind tokens (`src/app/globals.css` `@layer utilities`). No CDN resources.

### Sanitiser: sanitize-html

**Chosen: `sanitize-html` (MIT, pure JS, server-only).**

`sanitize-html` is a battle-tested allow-list HTML sanitiser. Pure JavaScript — no
native bindings, no compile step, works in both the Node.js server environment and the
offline Electron shell without additional toolchain requirements.

The sanitise function in `src/lib/rich-text/sanitize.ts` is annotated
`"use server"` / `"server-only"` and:
- Maintains an explicit allow-list of tags (p, br, strong, b, em, i, u, s, strike, del,
  ul, ol, li, h2, h3, h4, blockquote, table, thead, tbody, tr, th, td, a, span).
- Allows only the attributes and styles the toolbar can produce.
- Converts legacy Access HTML: `<div>` → `<p>`, `<font face="…" size="N">` → `<span>`
  with inline `font-family` / `font-size` styles.
- Forces `rel="noopener noreferrer"` on `<a>` and blocks `javascript:` / `data:` hrefs.
- Strips everything else: `<script>`, `<iframe>`, `<img>`, `<style>`, event handlers,
  CSS `expression()`, etc.

### Alternatives considered

**Lexical (Meta, MIT)**
Strong community, React-native API. However: Lexical's `LexicalComposer` and
reconciler add ~80 kB gzip on top of Tiptap's ~75 kB; the table plugin is in
experimental state (as of October 2026); the serialisation model is JSON-first (HTML
export requires a conversion pass), which adds friction when the storage format is
HTML (matching what the Access DB already contains).

**In-house `contenteditable` / `document.execCommand`**
`execCommand` is formally deprecated in all browsers and produces inconsistent markup
across engines. No table support. Significant accessibility work required for each
toolbar button. Not a viable path for a production application.

**Quill v2**
Mature, but produces `<span class="ql-…">` wrapper classes that leak through
serialisation and need stripping. Virtual-DOM diffing is proprietary and harder to
maintain than ProseMirror's well-specified node model.

### ADR-0014 dependency entries

New runtime packages required:

| Package | Version range | Justification |
|---|---|---|
| `@tiptap/react` | `^2` | ProseMirror/React editor core |
| `@tiptap/starter-kit` | `^2` | StarterKit bundle |
| `@tiptap/extension-underline` | `^2` | Underline mark |
| `@tiptap/extension-text-style` | `^2` | TextStyle base for colour/font-size/family |
| `@tiptap/extension-font-family` | `^2` | Font family mark |
| `@tiptap/extension-text-align` | `^2` | Paragraph text alignment |
| `@tiptap/extension-table` | `^2` | Table node + commands |
| `@tiptap/extension-table-row` | `^2` | Table row node |
| `@tiptap/extension-table-cell` | `^2` | Table cell node |
| `@tiptap/extension-table-header` | `^2` | Table header cell |
| `@tiptap/extension-link` | `^2` | Link mark with href validation |
| `sanitize-html` | `^2` | Server-side HTML allow-list sanitiser |
| `@types/sanitize-html` | `^2` | TypeScript definitions (devDependency) |

These packages have no native bindings, no external network requirements, and MIT
licences (Tiptap extensions are under the MIT licence as of their 2.x releases).

### Spellcheck on plain inputs (checklist row 42)

The `<Input>` and `<Textarea>` components in `src/components/ui/form/inputs.tsx` will
gain `spellCheck` defaulting to `true` and `lang` inherited from the `<html>` element
(no override needed — browsers read the root lang). Fields that must opt out (passwords,
codes, identifiers) pass `spellCheck={false}` explicitly (e.g. the password `<Input>`
in the login form already uses `type="password"` which disables spellcheck natively).

## Consequences

- **Bundle**: Tiptap + ProseMirror is ~75–80 kB gzip. The editor component is wrapped
  in `next/dynamic({ ssr: false })` so it is excluded from SSR and from the first-load
  JS of any page that mounts it. Pages that do not use the editor are unaffected.
  Pages that do must stay under the 170 kB gzip budget including the editor; if a page
  cannot, it must lazy-load the page section itself as a second dynamic import.
- **CSP**: Tiptap writes styles via inline `style` attributes on nodes (font size,
  family, alignment). The existing `style-src 'unsafe-inline'` policy permits this.
  No eval, no external scripts, no remote fonts.
- **Security**: sanitize-html is the server-side gate before every DB write and every
  server render. No trusted HTML ever reaches the browser without passing through the
  allow-list. XSS coverage is proven by the unit test corpus (OWASP cheat-sheet
  vectors + seeded Access samples).
- **Offline / Electron**: both packages are pure JS; `npm ci` bundles them in the
  Electron app without any native module caveat. `serverExternalPackages` is NOT
  needed (unlike `argon2`).
- **Accessibility**: WCAG 2.2 AA toolbar pattern via `role="toolbar"` + roving tabindex
  (matching the existing `src/components/ui/toolbar.tsx` shell; the rich-text toolbar
  is a separate component because its roving-tabindex domain is editor-only).
  spellcheck/lang on plain inputs satisfies checklist row 42.
