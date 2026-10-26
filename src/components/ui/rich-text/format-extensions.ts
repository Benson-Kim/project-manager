import {
  Extension,
  Mark,
  Node,
  canInsertNode,
  isNodeSelection,
  type CommandProps,
} from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  CELL_SHADES,
  DEFAULT_HIGHLIGHT,
  HIGHLIGHT_COLORS,
  INDENT_MAX,
  PAGE_BREAK_VALUE,
  TEXT_COLORS,
  indentFromCss,
  indentLevel,
  nearestColor,
  isLegalNumbering,
  numberingCss,
  type CellShade,
  type HighlightColor,
  type NumberingType,
  type TextColor,
} from "@/lib/rich-text/formats";

/**
 * Editor half of the ADR-0041 formats. Every attribute is stored by name (data-color,
 * data-shade, data-indent) and checked against the shared vocabulary on the way in, so the
 * document holds nothing the sanitiser would drop. Pasted CSS colours and margins are mapped to
 * the nearest name and level.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: TextColor) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
    richTextFormats: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setCellShade: (shade: CellShade | null) => ReturnType;
      setNumbering: (numbering: Numbering) => ReturnType;
    };
  }
}

/** Text colour: `<span data-color="red">`; a pasted `color:` style maps to the nearest name. */
export const TextColorMark = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => nearestColor(element.getAttribute("data-color"), TEXT_COLORS),
        renderHTML: (attributes) =>
          attributes.color ? { "data-color": attributes.color as string } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-color]",
        getAttrs: (element) =>
          nearestColor(element.getAttribute("data-color"), TEXT_COLORS) ? null : false,
      },
      {
        style: "color",
        getAttrs: (value) => {
          const color = nearestColor(value, TEXT_COLORS);
          return color ? { color } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/** Highlighter: `<mark data-color="yellow">`; Ctrl+Shift+H toggles the default colour. */
export const NamedHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: DEFAULT_HIGHLIGHT,
        parseHTML: (element): HighlightColor =>
          nearestColor(
            element.getAttribute("data-color") ?? element.style.backgroundColor,
            HIGHLIGHT_COLORS,
          ) ?? DEFAULT_HIGHLIGHT,
        renderHTML: (attributes) => ({ "data-color": attributes.color as string }),
      },
    };
  },
}).configure({ multicolor: true });

/** A page break for print: `<hr data-page-break="true">`, parsed before the plain rule. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [
      {
        tag: "hr[data-page-break]",
        priority: 60,
        getAttrs: (element) =>
          element.getAttribute("data-page-break") === PAGE_BREAK_VALUE ? null : false,
      },
    ];
  },

  renderHTML() {
    return ["hr", { "data-page-break": PAGE_BREAK_VALUE }];
  },

  addCommands() {
    return {
      // As Tiptap's setHorizontalRule: insert, then put the cursor in the block after, adding a
      // paragraph when there is none, so typing or the next insert never replaces the break.
      setPageBreak:
        () =>
        ({ chain, state }) => {
          if (!canInsertNode(state, state.schema.nodes[this.name])) return false;
          const current = chain();
          if (isNodeSelection(state.selection)) {
            current.insertContentAt(state.selection.$to.pos, { type: this.name });
          } else {
            current.insertContent({ type: this.name });
          }
          return current
            .command(({ tr, dispatch }) => {
              if (!dispatch) return true;
              const { $to } = tr.selection;
              if ($to.nodeAfter?.isTextblock) {
                tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
              } else if ($to.nodeAfter?.isBlock) {
                tr.setSelection(NodeSelection.create(tr.doc, $to.pos));
              } else if (!$to.nodeAfter) {
                const paragraph = state.schema.nodes.paragraph.create();
                tr.insert($to.end(), paragraph);
                tr.setSelection(TextSelection.create(tr.doc, $to.end() + 1));
              }
              tr.scrollIntoView();
              return true;
            })
            .run();
        },
    };
  },
});

export type Numbering = { type: NumberingType } | { start: number };

const LISTS = ["bulletList", "orderedList"];

/** The list the position sits directly in (the innermost one), with its position. */
export function innermostList($pos: ResolvedPos): { node: ProseMirrorNode; pos: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (LISTS.includes(node.type.name)) return { node, pos: $pos.before(depth) };
  }
  return null;
}

/** Sets the numbering of the innermost ordered list at the selection; outer lists keep theirs. */
export function setInnermostNumbering(tr: Transaction, numbering: Numbering): boolean {
  const list = innermostList(tr.selection.$from);
  if (list?.node.type.name !== "orderedList") return false;
  tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, ...numbering });
  return true;
}

const INDENTED = ["paragraph", "heading"];

/** Moves every paragraph and heading in the selection by `delta` levels; false if none moved. */
function shiftIndent(delta: 1 | -1, { tr, state, dispatch }: CommandProps): boolean {
  let changed = false;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!INDENTED.includes(node.type.name)) return true;
    const current = indentLevel(node.attrs.indent);
    const next = Math.min(INDENT_MAX, Math.max(0, current + delta));
    if (next !== current) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
      changed = true;
    }
    return false;
  });
  if (changed && dispatch) dispatch(tr);
  return changed;
}

/**
 * Indent levels on paragraphs and headings (`data-indent`, Ctrl+M / Ctrl+Shift+M as in Word;
 * inside a list they nest or lift the item), table cell shading (`data-shade`) and the CSS
 * list-style-type that an ordered list's numbering type needs past the stylesheet's reset.
 */
export const RichTextFormats = Extension.create({
  name: "richTextFormats",

  addGlobalAttributes() {
    return [
      {
        types: INDENTED,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) =>
              indentLevel(element.getAttribute("data-indent")) ||
              indentFromCss(element.style.marginLeft),
            renderHTML: (attributes) => {
              const level = indentLevel(attributes.indent);
              return level > 0 ? { "data-indent": String(level) } : {};
            },
          },
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          shade: {
            default: null,
            parseHTML: (element) =>
              nearestColor(
                element.getAttribute("data-shade") ?? element.style.backgroundColor,
                CELL_SHADES,
              ),
            renderHTML: (attributes) =>
              attributes.shade ? { "data-shade": attributes.shade as string } : {},
          },
        },
      },
      {
        types: ["orderedList"],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: () => null,
            renderHTML: (attributes) => {
              if (isLegalNumbering(attributes.type as string)) {
                return { "data-numbering": "legal" };
              }
              const css = attributes.type === "1" ? null : numberingCss(attributes.type);
              return css ? { style: `list-style-type:${css}` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent: () => (props) =>
        props.editor.isActive("listItem")
          ? props.commands.sinkListItem("listItem")
          : shiftIndent(1, props),
      outdent: () => (props) =>
        props.editor.isActive("listItem")
          ? props.commands.liftListItem("listItem")
          : shiftIndent(-1, props),
      setCellShade:
        (shade) =>
        ({ commands }) =>
          commands.setCellAttribute("shade", shade),
      // A paragraph or a bullet list becomes a numbered list first, as in Word.
      setNumbering:
        (numbering) =>
        ({ tr, commands, dispatch }) => {
          const numbered = innermostList(tr.selection.$from)?.node.type.name === "orderedList";
          if (!numbered && !commands.toggleOrderedList()) return false;
          return dispatch ? setInnermostNumbering(tr, numbering) : true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-m": () => this.editor.commands.indent(),
      "Mod-Shift-m": () => this.editor.commands.outdent(),
    };
  },
});
