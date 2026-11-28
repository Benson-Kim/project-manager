import { Extension, Mark } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { HEADING_LEVELS } from "@/lib/rich-text/formats";
import {
  isAllowedLinkHref,
  isAllowedLocalPath,
  LOCAL_PATH_LINK_ATTRIBUTES,
} from "@/lib/rich-text/links";
import { NamedHighlight, PageBreak, RichTextFormats, TextColorMark } from "./format-extensions";

/** Word's Ctrl+Shift+X strikethrough, next to Tiptap's own Ctrl+Shift+S. */
const WordShortcuts = Extension.create({
  name: "wordShortcuts",
  addKeyboardShortcuts() {
    return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
  },
});

/** A local folder link (ADR-0075): an <a> with data-local-path and never an href. */
export const LocalPathMark = Mark.create({
  name: "localPath",
  inclusive: false,
  excludes: "link",
  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-local-path"),
        renderHTML: (attributes) => ({ "data-local-path": attributes.path }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "a[data-local-path]",
        getAttrs: (element) =>
          !element.hasAttribute("href") &&
          isAllowedLocalPath(element.getAttribute("data-local-path") ?? "")
            ? null
            : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["a", { ...HTMLAttributes, ...LOCAL_PATH_LINK_ATTRIBUTES }, 0];
  },
});

/**
 * The editor's schema (ADR-0025 table, ADR-0041 formats). Everything it can
 * produce is on the sanitiser's allow-list; code and code blocks are off
 * because neither the toolbar nor the sanitiser carries them. Headings are
 * h2-h6: the page owns h1.
 */
export const richTextExtensions = [
  LocalPathMark,
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
  Image.configure({ allowBase64: false }),
  TextColorMark,
  NamedHighlight,
  PageBreak,
  RichTextFormats,
  WordShortcuts,
];
