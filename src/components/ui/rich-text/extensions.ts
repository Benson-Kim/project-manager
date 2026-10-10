import { Extension } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { isAllowedLinkHref } from "@/lib/rich-text/links";

/** Word's Ctrl+Shift+X strikethrough, next to Tiptap's own Ctrl+Shift+S. */
const WordShortcuts = Extension.create({
  name: "wordShortcuts",
  addKeyboardShortcuts() {
    return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
  },
});

/**
 * The editor's schema (ADR-0025 table). Everything it can produce is on the
 * sanitiser's allow-list; code, code blocks and horizontal rules are off
 * because neither the toolbar nor the sanitiser carries them. Headings start
 * at h2: the page owns h1.
 */
export const richTextExtensions = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    horizontalRule: false,
    heading: { levels: [2, 3, 4] },
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
  WordShortcuts,
];
