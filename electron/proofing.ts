/** One grammar problem in a paragraph, with UTF-16 offsets into that paragraph's text. */
export interface GrammarIssue {
  start: number;
  end: number;
  problem: string;
  message: string;
  /** What the problem text would read after each suggested fix ("" removes it). */
  fixes: string[];
}

/** The shape of a Harper lint this module reads; a structural type so tests need no WebAssembly. */
export interface LintLike {
  lint_kind(): string;
  message(): string;
  get_problem_text(): string;
  span(): { start: number; end: number };
  suggestions(): { kind(): number; get_replacement_text(): string }[];
}

const REPLACE = 0;
const REMOVE = 1;

/** Spelling is left to the built-in checker, which underlines it and owns the dictionary. */
const LEFT_TO_SPELLCHECK = new Set(["Spelling"]);

/** Harper counts characters (code points); the page counts UTF-16 units. */
function utf16Offset(text: string, chars: number): number {
  let offset = 0;
  for (let i = 0; i < chars && offset < text.length; i++) {
    offset += text.codePointAt(offset)! > 0xffff ? 2 : 1;
  }
  return offset;
}

export function toIssues(text: string, lints: LintLike[]): GrammarIssue[] {
  return lints
    .filter((lint) => !LEFT_TO_SPELLCHECK.has(lint.lint_kind()))
    .map((lint) => {
      const span = lint.span();
      const problem = lint.get_problem_text();
      const fixes = lint.suggestions().map((s) => {
        const kind = s.kind();
        if (kind === REMOVE) return "";
        return kind === REPLACE ? s.get_replacement_text() : problem + s.get_replacement_text();
      });
      return {
        start: utf16Offset(text, span.start),
        end: utf16Offset(text, span.end),
        problem,
        message: lint.message(),
        fixes: [...new Set(fixes)].filter((fix) => fix !== problem),
      };
    })
    .filter((issue) => issue.fixes.length > 0);
}

/**
 * The English the PC's user writes: their first English language in Windows, else British. The
 * app ships one interface locale, so the app's own locale is always en-US and says nothing.
 */
export function writtenEnglish(preferred: string[]): string {
  return preferred.find((language) => /^en(-|$)/i.test(language)) ?? "en-GB";
}

/** The spell-check dictionary for that English, when the checker has one. */
export function spellingLanguage(english: string, available: string[]): string | null {
  const lower = available.map((language) => language.toLowerCase());
  const at = lower.indexOf(english.toLowerCase());
  if (at >= 0) return available[at];
  const fallback = lower.indexOf("en-gb");
  return fallback >= 0 ? available[fallback] : null;
}

/** Harper's English for that language; anything else gets British English. */
export function dialectFor(locale: string): string {
  const region = locale.split("-")[1]?.toUpperCase();
  const byRegion: Record<string, string> = {
    US: "American",
    AU: "Australian",
    CA: "Canadian",
    IN: "Indian",
  };
  return byRegion[region ?? ""] ?? "British";
}

const MAX_FIXES = 6;
const LABEL_CHARS = 32;

function quoted(text: string): string {
  const short = text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text;
  return `“${short.replace(/&/g, "&&")}”`;
}

export interface GrammarFix {
  label: string;
  start: number;
  end: number;
  text: string;
}

/** The fixes the menu offers: the problem under the caret first, two fixes per problem at most. */
export function grammarFixes(issues: GrammarIssue[], caret: number): GrammarFix[] {
  const distance = (issue: GrammarIssue) =>
    caret < issue.start ? issue.start - caret : Math.max(caret - issue.end, 0);
  return [...issues]
    .sort((a, b) => distance(a) - distance(b) || a.start - b.start)
    .flatMap((issue) =>
      issue.fixes.slice(0, 2).map((text) => ({
        label: text
          ? `${quoted(issue.problem)} → ${quoted(text)}`
          : `Delete ${quoted(issue.problem)}`,
        start: issue.start,
        end: issue.end,
        text,
      })),
    )
    .slice(0, MAX_FIXES);
}

export interface Paragraph {
  text: string;
  caret: number;
}

/**
 * Runs inside the page, serialised, so it must not reach anything outside itself. Finds the
 * paragraph the caret is in, in the focused text box or rich-text editor, unless the field turns
 * spell checking off (sign-in, link and password fields do). Without `select` it
 * returns that paragraph and where the caret sits in it; with `select` it selects that part of
 * the same paragraph, provided the paragraph still reads `select.text`.
 */
export function paragraphAtCaret(
  select: { text: string; start: number; end: number } | null,
): Paragraph | boolean | null {
  const field = document.activeElement;
  if (
    field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement && (field.type === "text" || field.type === "search"))
  ) {
    if (!field.spellcheck) return null;
    const value = field.value;
    const caret = field.selectionStart ?? 0;
    const from = value.lastIndexOf("\n", caret - 1) + 1;
    const lineEnd = value.indexOf("\n", caret);
    const text = value.slice(from, lineEnd < 0 ? value.length : lineEnd);
    if (!select) return { text, caret: caret - from };
    if (text !== select.text) return false;
    field.setSelectionRange(from + select.start, from + select.end);
    return true;
  }
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  if (!selection || !anchor) return null;
  const start = anchor instanceof Element ? anchor : anchor.parentElement;
  const root = start?.closest("[contenteditable]:not([contenteditable='false'])");
  if (!start || !(root instanceof HTMLElement) || !root.spellcheck) return null;
  const block = start.closest("p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre");
  const scope = block && root.contains(block) ? block : root;
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  const text = nodes.map((node) => node.data).join("");
  if (!select) {
    const before = document.createRange();
    before.setStart(scope, 0);
    before.setEnd(anchor, selection.anchorOffset);
    return { text, caret: before.toString().length };
  }
  if (text !== select.text || !nodes.length) return false;
  const point = (offset: number): [Text, number] => {
    let left = offset;
    for (const node of nodes) {
      if (left <= node.data.length) return [node, left];
      left -= node.data.length;
    }
    const last = nodes[nodes.length - 1];
    return [last, last.data.length];
  };
  const range = document.createRange();
  range.setStart(...point(select.start));
  range.setEnd(...point(select.end));
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
