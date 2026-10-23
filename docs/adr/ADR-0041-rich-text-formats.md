# ADR-0041 — Rich-text formats: colours by name, highlights, shading, indents, numbering, more headings

Status: Accepted · Date: 2026-10-23 · Session: notes-editor (amends ADR-0025)

## Context

The client asked (2026-10-23) for more of Word's formatting in the shared editor: font colours,
backgrounds, highlights, different indentation, numbering styles and more heading levels, so that
notes, and later their printed PDFs, look professional. ADR-0025's allow-list carried none of
these. The editor is shared by every module (ADR-0025 §1), so whatever it can produce must pass
the one server-side sanitiser and render the same in a list, a sheet, a print view and both
themes.

Two constraints shaped the choice:

- **Contrast in both themes.** Stored HTML is shown in light mode, dark mode and on paper. No
  colour reaches WCAG AA contrast (4.5:1) on both a white and a dark surface. Inline
  `color: #1f3864` text, readable on paper, would vanish on the dark surface.
- **The sanitiser checks values.** ADR-0025 allows a few style properties against strict patterns.
  Free CSS colours would mean parsing `color`, `background` and `rgb()` in user input.

## Decision

### Colours are stored as names, not CSS values

- `src/lib/rich-text/formats.ts` (pure, used by the client and the server) is the vocabulary:
  - text colours: red, orange, yellow, green, blue, purple, grey;
  - highlights: yellow, green, blue, pink, orange, purple, grey;
  - table cell shading: grey, blue, green, yellow, orange, red, purple.
- The markup holds the name: `<span data-color="red">`, `<mark data-color="yellow">`,
  `<td data-shade="blue">`.
- `globals.css` paints each name with the existing tone tokens (`--tone-*-ink` for text,
  `--tone-*-soft` for shading) and new highlighter tokens (`--hl-*`), each with a light and a dark
  value. Print resets them to the light values, so a page printed from dark mode keeps its
  colours.
- A CSS colour arriving from Word, a browser paste or Access `<font color>` is mapped to the
  nearest name (`nearestColor`: hue family, then a fallback order). Black, white and near-greys
  map to "automatic", which is the theme's ink.
- Rejected: free colours (inline `color`/`background-color`). They fail contrast in one of the
  themes, and the sanitiser would have to parse CSS colours.

### What the toolbar gains

| Control | Markup | Notes |
|---|---|---|
| Text colour menu | `span[data-color]` | `TextColorMark`; "Automatic" removes it |
| Highlight menu, Ctrl+Shift+H | `mark[data-color]` | `@tiptap/extension-highlight`, its colour attribute rewritten to names |
| Cell shading menu (in a table) | `td/th[data-shade]` | global attribute on table cells |
| Increase / decrease indent, Ctrl+M / Ctrl+Shift+M | `p/h*[data-indent="1..8"]` | Word's shortcuts; in a list they nest or lift the item. A pasted margin maps to a level (36 pt = 1) |
| Numbering style menu | `ol[type][style=list-style-type]` | 1, a, A, i, I, plus "Start numbering at" (`start`, 1-9999). The inline list-style-type is needed past the stylesheet's `list-style` reset |
| Text style select | `h2`-`h6` | "Heading 1"-"Heading 5"; the page owns `h1` |
| Insert menu | `hr`, `hr[data-page-break]` | A page break is a dashed line on screen and a new page in print |

- Tiptap's colour and background-colour extensions (`@tiptap/extension-text-style`) are not
  used, because they write CSS values.
- The `Menu` primitive gains `menuitemradio` items with `aria-checked`, so a menu shows the
  current colour or style, and `align="start"` for menus on the toolbar's left half.

### Sanitiser

- New tags: `h5`, `h6`, `mark`, `hr`.
- New attributes, each value checked by a transform against `formats.ts`:
  - `data-color` on `span` and `mark`;
  - `data-shade` on cells;
  - `data-indent` on `p` and `h2`-`h6`, including legacy `div` and `h1`;
  - `start` and `type` on `ol`, plus the `list-style-type` the type implies;
  - `data-page-break` on `hr`.
- Anything else is dropped, and the output stays a fixed point. A value outside the vocabulary
  is removed rather than left empty.
- `h5`/`h6` are no longer folded into `h4`.

### Dependency (ADR-0014)

Approved by the user on 2026-10-23. The lockfile was written with npm 10.

| Package | Version | Kind | Why |
|---|---|---|---|
| `@tiptap/extension-highlight` | `3.31.4` | runtime | Highlight mark with commands, Ctrl+Shift+H and `==text==` input rule; exact pin like the other Tiptap packages |

## Consequences

- One place to extend the vocabulary: add a name in `formats.ts`, then its rule, swatch, tokens
  and label. `src/tests/rich-text-formats-css.test.ts` fails until every one exists.
- Users get seven colours per control rather than any colour. In exchange, the colours read in
  both themes and on paper, and axe checks the dark view in `e2e/rich-text.spec.ts`.
- Colours from Word are approximated. A pasted Word highlight written as a `background` style on a
  `span` (rather than `<mark>`) is not kept, because a style rule cannot tell a highlighted run
  from a shaded cell.
- Existing documents are unchanged. Access `<font color>` now renders with its nearest colour
  where it used to lose it.
- Tests:
  - `src/lib/tests/rich-text-formats.test.ts`: the colour mapping, indents and list starts;
  - `rich-text-sanitize.test.ts`: kept markup, dropped values, and XSS vectors aimed at the new
    attributes;
  - `src/tests/rich-text-formats-css.test.ts`: the stylesheet guardrail;
  - e2e round trip with computed styles in light and dark.
