"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { uploadUrl } from "@/components/ui/attachments/upload-file";
import { useToast } from "@/components/ui/toast";
import { extensionOf } from "@/lib/file-names";
import { messages } from "@/lib/messages";
import { sanitizeRichText } from "@/lib/rich-text/sanitize";
import {
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  NOTE_MAX_UPLOAD_BYTES,
  uploadLimitLabel,
} from "@/modules/file-storage/schemas/attachment";
import { dropsImages, prefersClipboardHtml } from "./clipboard-images";
import { EditorToolbar } from "./editor-toolbar";
import { richTextExtensions } from "./extensions";
import { FindBar, type FindRequest } from "./find-bar";
import { FindReplace } from "./find-replace";
import { LinkDialog } from "./link-dialog";

export type ImageUploadTarget = {
  owner: "note" | "daily-activity";
  ownerId: number | null;
};

type PlaceholderMeta =
  { type: "add"; id: string; pos: number; label: string } | { type: "remove"; id: string };

const uploadPlaceholderKey = new PluginKey<DecorationSet>("imageUploadPlaceholder");

const ImageUploadPlaceholder = Extension.create({
  name: "imageUploadPlaceholder",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: uploadPlaceholderKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(uploadPlaceholderKey) as PlaceholderMeta | undefined;
            if (!meta) return next;
            if (meta.type === "add") {
              const widget = Decoration.widget(
                meta.pos,
                () => {
                  const badge = document.createElement("span");
                  badge.className = "rich-text-uploading";
                  badge.setAttribute("data-testid", "rich-text-uploading");
                  badge.textContent = meta.label;
                  return badge;
                },
                { id: meta.id },
              );
              next = next.add(tr.doc, [widget]);
            } else {
              const found = next.find(
                undefined,
                undefined,
                (spec: { id?: string }) => spec.id === meta.id,
              );
              if (found.length > 0) next = next.remove(found);
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

const baseExtensions = [...richTextExtensions, ImageUploadPlaceholder];
const findExtensions = [...baseExtensions, FindReplace];

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const uploadResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    data: z.object({ FileAttachmentId: z.number().int().positive() }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ message: z.string().min(1) }) }),
]);

function eventFiles(transfer: DataTransfer | null | undefined): File[] {
  if (!transfer) return [];
  if (transfer.files.length > 0) return Array.from(transfer.files);
  const files: File[] = [];
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

function imageFileName(file: File): string | null {
  const mime = file.type.split(";")[0]!.trim().toLowerCase();
  const ext = extensionOf(file.name);
  if (mime) {
    const expectedExt = MIME_EXT[mime];
    if (!expectedExt || !(IMAGE_MIME_TYPES as readonly string[]).includes(mime)) return null;
    if (ext && (IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      if (mime === "image/jpeg" ? ext === ".jpg" || ext === ".jpeg" : ext === expectedExt) {
        return file.name;
      }
    }
    const base = ext ? file.name.slice(0, -ext.length) : file.name;
    return `${base.trim() || "pasted-image"}${expectedExt}`;
  }
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext) ? file.name : null;
}

async function postImageFile(
  file: File,
  fileName: string,
  owner: ImageUploadTarget["owner"],
  ownerId: number,
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${uploadUrl(owner, ownerId, fileName)}&inline=1`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const parsed = uploadResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, message: messages.errors.INTERNAL };
    if (parsed.data.ok) {
      return res.ok
        ? { ok: true, id: parsed.data.data.FileAttachmentId }
        : { ok: false, message: messages.errors.INTERNAL };
    }
    return { ok: false, message: parsed.data.error.message };
  } catch {
    return { ok: false, message: messages.errors.INTERNAL };
  }
}

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
  /** Enables pasting and dropping images directly into the editor. */
  imageUpload?: ImageUploadTarget;
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
  imageUpload,
}: EditorSurfaceProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageUploadRef = useRef(imageUpload);
  const toastRef = useRef(toast);
  const nextUploadId = useRef(1);
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

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const noticeDroppedImages = useCallback((html: string) => {
    if (dropsImages(html, sanitizeRichText)) {
      toastRef.current({ variant: "info", title: messages.richText.externalImageDropped });
    }
  }, []);

  const handleImageFiles = useCallback(
    (view: EditorView, files: File[], pos: number): boolean => {
      const target = imageUploadRef.current;
      if (!target || !editable || files.length === 0) return false;
      if (target.ownerId === null) {
        toastRef.current({ variant: "info", title: messages.richText.saveEntryFirst });
        return true;
      }
      const ownerId = target.ownerId;
      const maxBytes = target.owner === "note" ? NOTE_MAX_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
      for (const file of files) {
        const fileName = imageFileName(file);
        if (!fileName) {
          toastRef.current({ variant: "error", title: messages.attachments.errors.imagesOnly });
          continue;
        }
        if (file.size === 0) {
          toastRef.current({ variant: "error", title: messages.attachments.errors.empty });
          continue;
        }
        if (file.size > maxBytes) {
          toastRef.current({
            variant: "error",
            title: messages.attachments.errors.tooLargeAt(uploadLimitLabel(maxBytes)),
          });
          continue;
        }
        const id = `upload-${nextUploadId.current++}`;
        view.dispatch(
          view.state.tr.setMeta(uploadPlaceholderKey, {
            type: "add",
            id,
            pos,
            label: messages.richText.uploadingImage,
          } satisfies PlaceholderMeta),
        );
        void postImageFile(file, fileName, target.owner, ownerId).then((outcome) => {
          const currentEditor = editorRef.current;
          if (!currentEditor || currentEditor.isDestroyed) return;
          const set = uploadPlaceholderKey.getState(currentEditor.state);
          const decos =
            set?.find(undefined, undefined, (spec: { id?: string }) => spec.id === id) ?? [];
          const insertPos = decos[0]?.from ?? currentEditor.state.selection.from;
          if (outcome.ok) {
            const src = `/api/files/${outcome.id}?owner=${target.owner}`;
            currentEditor
              .chain()
              .command(({ tr }) => {
                tr.setMeta(uploadPlaceholderKey, { type: "remove", id } satisfies PlaceholderMeta);
                return true;
              })
              .insertContentAt(insertPos, { type: "image", attrs: { src, alt: "" } })
              .run();
          } else {
            currentEditor.view.dispatch(
              currentEditor.state.tr.setMeta(uploadPlaceholderKey, {
                type: "remove",
                id,
              } satisfies PlaceholderMeta),
            );
            toastRef.current({ variant: "error", title: outcome.message });
          }
        });
      }
      return true;
    },
    [editable],
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
      handlePaste: (view: EditorView, event: ClipboardEvent) => {
        const html = event.clipboardData?.getData("text/html") ?? "";
        const files = prefersClipboardHtml(html) ? [] : eventFiles(event.clipboardData);
        if (files.length === 0 || !imageUploadRef.current || !editable) {
          if (editable) noticeDroppedImages(html);
          return false;
        }
        event.preventDefault();
        return handleImageFiles(view, files, view.state.selection.from);
      },
      handleDrop: (view: EditorView, event: DragEvent, _slice: unknown, moved: boolean) => {
        if (moved) return false;
        const files = eventFiles(event.dataTransfer);
        if (files.length === 0 && editable) {
          noticeDroppedImages(event.dataTransfer?.getData("text/html") ?? "");
        }
        if (files.length === 0 || !imageUploadRef.current || !editable) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        return handleImageFiles(view, files, coords?.pos ?? view.state.selection.from);
      },
    }),
    [
      inputId,
      labelId,
      label,
      errorId,
      invalid,
      editable,
      height,
      setLinkOpen,
      canFind,
      handleImageFiles,
      noticeDroppedImages,
    ],
  );

  const editor = useEditor({
    extensions: findReplace ? findExtensions : baseExtensions,
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
  useEffect(() => {
    imageUploadRef.current = imageUpload;
    toastRef.current = toast;
    editorRef.current = editor;
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

  const currentHref =
    (editor.getAttributes("localPath") as { path?: string }).path ??
    (editor.getAttributes("link") as { href?: string }).href ??
    "";
  const caretOutsideLinks = () =>
    editor.state.selection.empty && !editor.isActive("link") && !editor.isActive("localPath");

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
          if (caretOutsideLinks()) {
            editor
              .chain()
              .insertContent({
                type: "text",
                text: href,
                marks: [{ type: "link", attrs: { href } }],
              })
              .run();
          } else {
            editor
              .chain()
              .extendMarkRange("localPath")
              .unsetMark("localPath")
              .extendMarkRange("link")
              .setLink({ href })
              .run();
          }
        }}
        onApplyLocalPath={(path) => {
          setLinkOpen(false);
          if (caretOutsideLinks()) {
            editor
              .chain()
              .insertContent({
                type: "text",
                text: path,
                marks: [{ type: "localPath", attrs: { path } }],
              })
              .run();
          } else {
            editor
              .chain()
              .extendMarkRange("link")
              .unsetLink()
              .extendMarkRange("localPath")
              .setMark("localPath", { path })
              .run();
          }
        }}
        onRemove={() => {
          setLinkOpen(false);
          editor
            .chain()
            .extendMarkRange("link")
            .unsetLink()
            .extendMarkRange("localPath")
            .unsetMark("localPath")
            .run();
        }}
      />
    </div>
  );
}
