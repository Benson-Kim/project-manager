# ADR-0025 — Rich-text editing and HTML sanitisation

Status: Accepted · Date: 2026-10-10 · Session: rich-text (P1)

First drafted on 2026-10-07 as ADR-0020 (bf92cdf), before any code. It was renumbered because
develop's ADR-0020 is web push. It also moved from Tiptap v2 to v3, the current major
(3.31.4 on 2026-10-10).

## Context

Notes, Meetings, Risks/Issues, IT resource planning and Financials need a Word-like
rich-text field. Users format with bold, italic, underline, strikethrough, headings, lists,
tables and links. The Access database already stores HTML in
`RiskIssue.Description`/`MitigationPlan`, `ItResourceItem.DetailText` and `Meeting.Description`.
That HTML uses legacy markup: `<div>`, `<strong>`, `<em>`, `<u>`, `<font face="…" size=5>`
(with a line break inside the tag) and entities such as `&quot;`.

Requirements (PLAN §7, SECURITY.md, checklist rows 17–20, 42, 56, 62):

1. There is one shared editor and one server-side sanitiser, and no module forks either.
2. HTML is sanitised on the server before storage AND again on render (defence in depth),
   against an explicit allow-list of tags, attributes and styles.
3. The toolbar has:
   - bold, italic, underline and strikethrough;
   - bullets, numbering and headings;
   - font family (system fonts only) and font size;
   - alignment;
   - inserting and deleting table rows and columns;
   - link (http, https, mailto);
   - undo/redo and clear formatting.
   Shortcuts work as in Word.
4. The editor is lazy-loaded, so pages stay under the 170 kB first-load budget.
5. No runtime network requests: the app also ships offline (Electron + local SQL Server).
6. CSP: nonce + `strict-dynamic` scripts, `style-src 'self' 'unsafe-inline'`,
   `font-src 'self'`.
7. WCAG 2.2 AA: an ARIA toolbar with roving tabindex, visible focus, 44 px targets,
   and spellcheck with the page language.
8. The editor drops into an existing `<form>`. `action()`, `useZodForm` and the
   unsaved-changes guard keep working unchanged.
9. Lists, search snippets and CSV export need plain text (`htmlToPlainText`).
10. Plain `Input`/`Textarea` text fields get spellcheck too (checklist row 42).

## Decision

### Editor: Tiptap v3 (ProseMirror)

Tiptap is a headless framework on ProseMirror. It ships no stylesheet of its own: all
visual styling comes from our tokens in `src/app/globals.css`. It edits and emits HTML,
the format Access already stores. The v3 packages cover the toolbar as follows. Several v2
extensions were folded into kits, so there are fewer packages than in the v2 draft:

| Toolbar need | v3 source |
|---|---|
| Paragraph, bold, italic, **underline**, strike, headings (h2–h4), bullet/ordered lists, blockquote, hard break, **link**, undo/redo | `@tiptap/starter-kit`. v3 includes Underline, Link, ListKeymap, TrailingNode and UndoRedo (v2's History). `code`, `codeBlock` and `horizontalRule` are switched off, because the toolbar and the sanitiser don't carry them. |
| Font family, font size | `@tiptap/extension-text-style`. In v3 it exports `TextStyle`, `FontFamily` and `FontSize` (v2 needed a separate package and a custom font-size mark). |
| Text alignment | `@tiptap/extension-text-align` (paragraphs and headings). |
| Tables (+ row, header, cell) | `@tiptap/extension-table`. In v3 it exports `Table`, `TableRow`, `TableHeader` and `TableCell`; these were four packages in v2. |
| React binding | `@tiptap/react`, with `useEditorState` for toolbar state, because v3 no longer re-renders on every transaction. |

Configuration:
- Link: `openOnClick: false`, `autolink: true`, and `isAllowedUri` accepts only http, https
  and mailto. Rendered links get `rel="noopener noreferrer"` and no `target`.
- Headings: levels 2–4, because the page owns `h1`.
- Extra shortcut: Ctrl+Shift+X strike, the prompt's Word mapping. Tiptap's own Ctrl+Shift+S
  stays as well. Ctrl+B/I/U, Ctrl+Z/Y and the list and alignment shortcuts are Tiptap
  defaults. Ctrl+K opens the link dialog.

### Sanitiser: sanitize-html on the server

`src/lib/rich-text/sanitize.ts` wraps `sanitize-html`, which is pure JavaScript on
htmlparser2 + postcss with no native code and no DOM. Client modules never import it; a
guardrail test enforces that. Its exports:
- `sanitizeRichText(html)`: allow-list `p br strong b em i u s strike del ul ol li h2 h3 h4
  blockquote table thead tbody tr th td a span`.
  - `td`/`th` keep `colspan`/`rowspan`.
  - `a` keeps `href` (http/https/mailto only, plus relative and `#` links) and is given
    `rel="noopener noreferrer"`.
  - `span` keeps only `font-family`, `font-size` and `text-decoration`.
  - `p` and `h2`–`h4` keep only `text-align`.
  - Every style value is matched against a strict pattern, so `url()`, `expression()`,
    `;` and quotes cannot get through.
  - Legacy markup is converted: `<div>`→`<p>`, `<font face size>`→`<span>` with
    `font-family`/`font-size` (HTML sizes 1–7 map to 8/10/12/14/18/24/36 pt).
  - Everything else is dropped: `script`, `style`, `iframe`, `img`, `object`, forms, event
    handlers, `javascript:`/`data:`/`vbscript:` URLs, comments. The text inside a
    stripped wrapper is kept; for `script`/`style` it is not.
- `htmlToPlainText(html)`: sanitises first, then turns block ends into line breaks and
  decodes the few entities sanitize-html emits.

Alternative considered: **DOMPurify**. On the server it needs a DOM (jsdom), which is a
much larger dependency tree than htmlparser2 + postcss, and that weight would also ship in
the offline desktop build.

### One schema for client and server

Form schemas are shared between the browser and the action (ADR-0009). Importing
sanitize-html into them would ship it to every page with a form. So `richTextSchema({ max,
required })` lives in the isomorphic `src/lib/rich-text/schema.ts` and receives the
sanitiser through `installRichTextSanitizer`:
- `sanitize.ts` installs itself when it loads. `src/lib/action.ts` loads it, so every
  action parse sanitises. `RichTextView` loads it too.
- A **server-side parse without an installed sanitiser throws**, so the server fails
  closed.
- In the browser the schema only validates: emptiness, and the length of the not-yet-
  sanitised HTML. The server parses again and is authoritative.
- An empty document (`<p></p>`, empty paragraphs and spans, `&nbsp;`) becomes `null`.
  The max length applies to the sanitised HTML.

### Components

- `RichTextEditor` (`src/components/ui/rich-text/`, client) is a light wrapper.
  - It owns a hidden **bridge input** that carries the field name and holds the HTML from
    the first render. A form submitted before the editor chunk arrives still sends the
    stored value.
  - It loads the Tiptap editor with `next/dynamic` (`ssr: false`).
  - Each edit sets the bridge input's value and dispatches a bubbling `input` event, so a
    fieldset's `onChange` marks the form dirty.
  - Leaving the editor dispatches `focusout` on the bridge, so `useZodForm` validates the
    field on blur.
  - An enclosing disabled `<fieldset>` makes the editor read-only, as it does native
    inputs.
- `RichTextView` (server component) sanitises again and renders with typography, table
  and print styles (`.rich-text` in `globals.css`).

### Spellcheck on plain inputs (checklist row 42)

`Textarea`, and `Input` with a text-like type (`text`, `search`, or no type), default to
`spellCheck`. A field opts out with `spellCheck={false}`; usernames and codes do. Password,
email and number inputs are never spell-checked by browsers. `lang` comes from `<html>`
(`en`) by inheritance; no field overrides it.

### Alternatives considered

- **Lexical (Meta, MIT).** Its model is JSON-first. HTML import/export
  (`@lexical/html`) needs a DOM, which on the server means jsdom, and our storage format
  and the Access data are HTML. Its tables are a separate plugin with less mature
  merge/split handling than prosemirror-tables.
- **Quill 2.** Formats are emitted as `ql-*` classes unless every format is reconfigured
  as an inline-style attributor. Its table module is basic (no header cells, no
  colspan/rowspan).
- **In-house `contenteditable` + `document.execCommand`.** `execCommand` is deprecated,
  produces different markup per engine, and has no tables. Every toolbar behaviour would
  be ours to build and make accessible.

### ADR-0014 dependency entries

Approved by the user on 2026-10-10. The lockfile was written with npm 10.9.2, CI's npm
(see the npm-10 note in the hand-off and LESSONS).

| Package | Version | Kind | Why |
|---|---|---|---|
| `@tiptap/core` | `3.31.4` | runtime | Editor core (peer of the extensions) |
| `@tiptap/pm` | `3.31.4` | runtime | ProseMirror packages (peer of core) |
| `@tiptap/react` | `3.31.4` | runtime | React binding |
| `@tiptap/starter-kit` | `3.31.4` | runtime | Text, lists, headings, underline, link, undo/redo |
| `@tiptap/extension-text-style` | `3.31.4` | runtime | TextStyle, FontFamily, FontSize |
| `@tiptap/extension-text-align` | `3.31.4` | runtime | Paragraph and heading alignment |
| `@tiptap/extension-table` | `3.31.4` | runtime | Table, row, header and cell |
| `sanitize-html` | `2.18.0` | runtime | Server-side allow-list sanitiser |
| `@types/sanitize-html` | `2.16.2` | dev | Types (sanitize-html ships none) |

Why these are **exact pins**, unlike the caret ranges elsewhere:
- Tiptap packages declare each other as exact-version peers (e.g. `@tiptap/react@3.31.4`
  peers on `@tiptap/core@3.31.4`), so the seven move together in one reviewed bump.
- `sanitize-html` is a security gate, so a version change is a reviewed change that
  re-runs the XSS corpus.

All of them are MIT and pure JavaScript, with no install scripts that build native code
and no network access at runtime. No `serverExternalPackages` entry is needed.

## Consequences

- **Bundle.** Tiptap + ProseMirror (with prosemirror-tables and linkifyjs) build to one chunk
  of about 142 kB gzip (measured 2026-10-10). It loads only when an editor mounts, so it
  adds nothing to a route's first-load JS; a page that shows an editor downloads it after
  first paint. `sanitize-html` is in no browser chunk.
  - Measured while doing this: first-load JS was already above the 170 kB target before
    this change (`/` about 205 kB, `/projects` and `/todo` about 310 kB gzip). That is a
    separate follow-up, not caused by this ADR.
- **CSP.** Formatting is written as inline `style` attributes, and Tiptap injects one
  small `<style>` element for ProseMirror's base rules. Both are allowed by
  `style-src 'self' 'unsafe-inline'`. There is no eval, no remote script and no remote
  font.
- **Security.** Stored HTML passes the allow-list on the way in (`richTextSchema` inside
  `action()`) and on the way out (`RichTextView`). The unit corpus (OWASP XSS
  cheat-sheet vectors and the seeded Access samples) pins the behaviour.
- **Data.** Legacy Access HTML is converted the first time a record is saved through the
  editor. Until then, render converts it on the fly. No migration rewrites stored HTML.
- **Accessibility.**
  - The toolbar is `role="toolbar"` with one tab stop; arrows, Home and End move along it.
  - Toggles expose `aria-pressed`.
  - The editing surface is `role="textbox"` + `aria-multiline`, labelled by its `Field`.
  - Spellcheck is on in the editor and in plain text fields.
- **Consumers.** Modules use `richTextSchema` in their form schema, `RichTextEditor` in the
  sheet, `RichTextView` on read-only and print views, and `htmlToPlainText` for cards, CSV
  and search.
  - Repositories pass stored rich-text columns through `sanitizeRichText` before a sheet
    receives them. The editor's own parser keeps text but drops unknown markup such as
    `<font face>`, so legacy formatting survives only when it arrives converted.
