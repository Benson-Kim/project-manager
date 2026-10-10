"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorToolbar } from "./editor-toolbar";
import { richTextExtensions } from "./extensions";
import { LinkDialog } from "./link-dialog";

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
export interface EditorSurfaceProps {
  bridge: HTMLInputElement;
  initialHtml: string;
  readOnly: boolean;
  inputId?: string;
  labelId?: string;
  errorId?: string;
  invalid: boolean;
  onChange?: (html: string) => void;
}

/** Sets the value past React's value tracker, so React reports the input event. */
function writeBridge(bridge: HTMLInputElement, html: string) {
  if (bridge.value === html) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(bridge, html);
  bridge.dispatchEvent(new Event("input", { bubbles: true }));
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
}: EditorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bridgeDisabled, setBridgeDisabled] = useState(() => bridge.matches(":disabled"));
  const [linkOpen, setLinkOpen] = useState(false);
  const editable = !bridgeDisabled && !readOnly;

  const editorProps = useMemo(
    () => ({
      attributes: {
        ...(inputId ? { id: inputId } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(labelId ? { "aria-labelledby": labelId } : {}),
        ...(errorId ? { "aria-describedby": errorId } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(editable ? {} : { "aria-readonly": "true" }),
        spellcheck: "true",
        class: "rich-text min-h-48 px-3 py-2",
      },
      handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
        if (!isLinkShortcut(event)) return false;
        setLinkOpen(true);
        return true;
      },
    }),
    [inputId, labelId, errorId, invalid, editable],
  );

  const editor = useEditor({
    extensions: richTextExtensions,
    content: initialHtml,
    editable,
    // Mounted on the client only (next/dynamic ssr:false); never render on the server.
    immediatelyRender: false,
    editorProps,
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? "" : e.getHTML();
      writeBridge(bridge, html);
      onChange?.(html);
    },
    onBlur: ({ event }) => {
      // Moving into the toolbar or the table menu is not leaving the field.
      if (containerRef.current?.contains(event.relatedTarget as Node | null)) return;
      bridge.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    },
  });

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
      {editable ? <EditorToolbar editor={editor} onOpenLink={() => setLinkOpen(true)} /> : null}
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
