"use client";

import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorToolbar } from "./editor-toolbar";
import { richTextExtensions } from "./extensions";
import { FindBar, type FindRequest } from "./find-bar";
import { FindReplace } from "./find-replace";
import { LinkDialog } from "./link-dialog";

const findExtensions = [...richTextExtensions, FindReplace];

/**
 * The Tiptap half of RichTextEditor (ADR-0025), loaded lazily. It keeps the
 * wrapper's bridge input in step so the surrounding form needs no changes:
 *   - each edit sets the input's value and fires a bubbling `input` event, so
 *     a fieldset's onChange marks the form dirty;
 *   - leaving the editor fires `focusout` on the input, so useZodForm's
 *     onBlur validates the field by name;
 *   - a disabled input (prop or enclosing <fieldset disabled>) makes the
 *     editor read-only.
 */
/**
 * How tall the writing area may grow. A `field` or a `panel` has a ceiling and
 * scrolls inside it, so one long field cannot push the rest of a form off the
 * screen. A `page` is the whole writing surface (a notebook page): it grows with
 * its text and the page scrolls, which is what keeps the toolbar in view.
 */
export type EditorHeight = "field" | "panel" | "page";

/** Print lifts a ceiling so nothing is cut off on paper. */
const BOUNDED = "overflow-y-auto print:max-h-none print:overflow-visible";

const HEIGHTS: Record<EditorHeight, string> = {
  field: `min-h-48 max-h-[min(24rem,60dvh)] ${BOUNDED}`,
  panel: `min-h-[min(24rem,50dvh)] max-h-[min(32rem,70dvh)] ${BOUNDED}`,
  page: "min-h-48",
};

export interface EditorSurfaceProps {
  bridge: HTMLInputElement;
  initialHtml: string;
  readOnly: boolean;
  inputId?: string;
  labelId?: string;
  errorId?: string;
  invalid: boolean;
  onChange?: (html: string) => void;
  label?: string;
  autoFocus?: boolean;
  height?: EditorHeight;
  /** Ctrl+F finds and Ctrl+H replaces in the text (a notebook page). */
  findReplace?: boolean;
  /** Opens the find bar on this text. */
  findSeed?: string;
}

/** Sets the value past React's value tracker, so React reports the input event. */
function writeBridge(bridge: HTMLInputElement, html: string) {
  if (bridge.value === html) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(bridge, html);
  bridge.dispatchEvent(new Event("input", { bubbles: true }));
}

function findShortcut(event: KeyboardEvent): "find" | "replace" | null {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  return key === "f" ? "find" : key === "h" ? "replace" : null;
}

/** A short one-line selection seeds the search. */
function selectedText(state: EditorState) {
  const { from, to, empty } = state.selection;
  const text = empty ? "" : state.doc.textBetween(from, to, "\n");
  return text.length <= 100 && !text.includes("\n") ? text : "";
}

function isLinkShortcut(event: KeyboardEvent) {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "k"
  );
}

export function EditorSurface({
  bridge,
  initialHtml,
  readOnly,
  inputId,
  labelId,
  errorId,
  invalid,
  onChange,
  label,
  autoFocus = false,
  height = "field",
  findReplace = false,
  findSeed,
}: EditorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bridgeDisabled, setBridgeDisabled] = useState(() => bridge.matches(":disabled"));
  const [linkOpen, setLinkOpenState] = useState(false);
  // Set in the handlers: focus enters the dialog before a passive effect could copy the state.
  const linkOpenRef = useRef(false);
  const setLinkOpen = useCallback((open: boolean) => {
    linkOpenRef.current = open;
    setLinkOpenState(open);
  }, []);
  const editable = !bridgeDisabled && !readOnly;
  const canFind = findReplace && editable;
  const [findRequest, setFindRequest] = useState<FindRequest | null>(() =>
    canFind && findSeed ? { replace: false, seed: findSeed, id: 1 } : null,
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        ...(inputId ? { id: inputId } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(labelId ? { "aria-labelledby": labelId } : {}),
        ...(label ? { "aria-label": label } : {}),
        ...(errorId ? { "aria-describedby": errorId } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(editable ? {} : { "aria-readonly": "true" }),
        spellcheck: "true",
        class: `rich-text ${HEIGHTS[height]} px-3 py-2`,
      },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        const find = canFind ? findShortcut(event) : null;
        if (find) {
          setFindRequest((prev) => ({
            replace: find === "replace",
            seed: selectedText(view.state),
            id: (prev?.id ?? 0) + 1,
          }));
          return true;
        }
        if (!isLinkShortcut(event)) return false;
        setLinkOpen(true);
        return true;
      },
    }),
    [inputId, labelId, label, errorId, invalid, editable, height, setLinkOpen, canFind],
  );

  const editor = useEditor({
    extensions: findReplace ? findExtensions : richTextExtensions,
    content: initialHtml,
    editable,
    autofocus: autoFocus ? "end" : false,
    // Mounted on the client only (next/dynamic ssr:false); never render on the server.
    immediatelyRender: false,
    editorProps,
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? "" : e.getHTML();
      writeBridge(bridge, html);
      onChange?.(html);
    },
  });

  // Native, not React: a React handler would also hear blurs inside the portalled link dialog.
  // Moving between the text, the toolbar, the table menu and the link dialog stays in the field.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onFocusOut = (event: FocusEvent) => {
      if (linkOpenRef.current || container.contains(event.relatedTarget as Node | null)) return;
      bridge.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    };
    container.addEventListener("focusout", onFocusOut);
    return () => container.removeEventListener("focusout", onFocusOut);
  }, [editor, bridge]);

  // Follow the bridge's disabled state: its own attribute and an enclosing fieldset's.
  useEffect(() => {
    const sync = () => setBridgeDisabled(bridge.matches(":disabled"));
    const observer = new MutationObserver(sync);
    observer.observe(bridge, { attributes: true, attributeFilter: ["disabled"] });
    for (let fieldset = bridge.closest("fieldset"); fieldset;) {
      observer.observe(fieldset, { attributes: true, attributeFilter: ["disabled"] });
      fieldset = fieldset.parentElement?.closest("fieldset") ?? null;
    }
    return () => observer.disconnect();
  }, [bridge]);

  useEffect(() => {
    // false: switching modes is not an edit, so no update event (no dirty form).
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // <label for> cannot focus a contenteditable; do it for the Field's label.
  useEffect(() => {
    if (!editor || !inputId) return;
    const label = document.querySelector(`label[for="${CSS.escape(inputId)}"]`);
    const focus = () => editor.commands.focus();
    label?.addEventListener("click", focus);
    return () => label?.removeEventListener("click", focus);
  }, [editor, inputId]);

  if (!editor) {
    return (
      <div
        aria-hidden="true"
        className="min-h-[14.75rem] rounded-md border border-line bg-surface"
      />
    );
  }

  const currentHref = (editor.getAttributes("link") as { href?: string }).href ?? "";

  return (
    <div
      ref={containerRef}
      className={`rounded-md border ${invalid ? "border-danger" : "border-line"} ${editable ? "bg-surface" : "bg-surface-sunken"}`}
    >
      {canFind && findRequest ? (
        // One sticky block, so the find bar stays under the toolbar as a long page scrolls.
        <div className="sticky top-[var(--editor-toolbar-top,0px)] z-10">
          <EditorToolbar editor={editor} onOpenLink={() => setLinkOpen(true)} />
          <FindBar editor={editor} request={findRequest} onClose={() => setFindRequest(null)} />
        </div>
      ) : editable ? (
        <EditorToolbar editor={editor} onOpenLink={() => setLinkOpen(true)} />
      ) : null}
      <EditorContent editor={editor} />
      <LinkDialog
        open={linkOpen}
        initialHref={currentHref}
        onOpenChange={setLinkOpen}
        // No .focus() here: the dialog still traps focus; on close it returns
        // focus to its opener (the text for Ctrl+K and mouse use).
        onApply={(href) => {
          setLinkOpen(false);
          if (editor.state.selection.empty && !editor.isActive("link")) {
            editor
              .chain()
              .insertContent({
                type: "text",
                text: href,
                marks: [{ type: "link", attrs: { href } }],
              })
              .run();
          } else {
            editor.chain().extendMarkRange("link").setLink({ href }).run();
          }
        }}
        onRemove={() => {
          setLinkOpen(false);
          editor.chain().extendMarkRange("link").unsetLink().run();
        }}
      />
    </div>
  );
}
