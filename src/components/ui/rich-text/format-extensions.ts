import { Extension, Mark, Node, type CommandProps } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import {
  CELL_SHADES,
  DEFAULT_HIGHLIGHT,
  HIGHLIGHT_COLORS,
  INDENT_MAX,
  TEXT_COLORS,
  indentFromCss,
  indentLevel,
  nearestColor,
  numberingCss,
  type CellShade,
  type HighlightColor,
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
    return [{ tag: "hr[data-page-break]", priority: 60 }];
  },

  renderHTML() {
    return ["hr", { "data-page-break": "true" }];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});

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
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-m": () => this.editor.commands.indent(),
      "Mod-Shift-m": () => this.editor.commands.outdent(),
    };
  },
});
