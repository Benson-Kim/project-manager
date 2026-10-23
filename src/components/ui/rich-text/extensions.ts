import { Extension } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { HEADING_LEVELS } from "@/lib/rich-text/formats";
import { isAllowedLinkHref } from "@/lib/rich-text/links";
import { NamedHighlight, PageBreak, RichTextFormats, TextColorMark } from "./format-extensions";

/** Word's Ctrl+Shift+X strikethrough, next to Tiptap's own Ctrl+Shift+S. */
const WordShortcuts = Extension.create({
  name: "wordShortcuts",
  addKeyboardShortcuts() {
    return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
  },
});

/**
 * The editor's schema (ADR-0025 table, ADR-0041 formats). Everything it can
 * produce is on the sanitiser's allow-list; code and code blocks are off
 * because neither the toolbar nor the sanitiser carries them. Headings are
 * h2-h6: the page owns h1.
 */
export const richTextExtensions = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    heading: { levels: [...HEADING_LEVELS] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => isAllowedLinkHref(url),
      HTMLAttributes: { rel: "noopener noreferrer", target: null },
    },
  }),
  TextStyle,
  FontFamily,
  FontSize,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TextColorMark,
  NamedHighlight,
  PageBreak,
  RichTextFormats,
  WordShortcuts,
];
