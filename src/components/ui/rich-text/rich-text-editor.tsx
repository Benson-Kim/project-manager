"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useFieldContext } from "@/components/ui/form/field";

/**
 * Word-like rich-text field (ADR-0025). This wrapper is light; the Tiptap
 * editor is a separate chunk loaded on mount, so pages keep their first-load
 * budget. The wrapper owns a hidden bridge input carrying the field name and
 * the HTML from the first render, so the form submits the stored value even
 * before the editor arrives; the editor keeps it current (see editor-surface).
 * Server half: richTextSchema in the form schema, RichTextView for display.
 *
 * Usage, inside a form:
 *   <Field label={…} name="description" errors={form.errors.description}>
 *     <RichTextEditor name="description" defaultValue={row?.Description} />
 *   </Field>
 */
const EditorSurface = dynamic(() => import("./editor-surface").then((m) => m.EditorSurface), {
  ssr: false,
  loading: () => <EditorPlaceholder />,
});

export interface RichTextEditorProps {
  /** Form field name; the HTML is submitted under it. */
  name: string;
  /** Stored HTML. Pass it through the server sanitiser first (legacy markup). */
  defaultValue?: string | null;
  /** Not editable and not submitted (an enclosing disabled fieldset does the same). */
  disabled?: boolean;
  /** Not editable, still submitted. */
  readOnly?: boolean;
  /** Called with the HTML after each edit ("" when the document is empty). */
  onChange?: (html: string) => void;
  /** Test hook on the wrapper. */
  testId?: string;
}

export function RichTextEditor({
  name,
  defaultValue,
  disabled = false,
  readOnly = false,
  onChange,
  testId,
}: RichTextEditorProps) {
  const field = useFieldContext();
  // State, not a ref: the editor mounts once the bridge exists, and reads it.
  const [bridge, setBridge] = useState<HTMLInputElement | null>(null);

  return (
    <div data-rich-text={name} data-testid={testId}>
      {/* type=text (hidden attribute), not type=hidden: React only reports
          input events from text-like inputs, and fieldset onChange relies on them. */}
      <input
        ref={setBridge}
        type="text"
        hidden
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
      />
      {bridge ? (
        <EditorSurface
          bridge={bridge}
          initialHtml={defaultValue ?? ""}
          readOnly={readOnly}
          inputId={field?.inputId}
          labelId={field?.labelId}
          errorId={field?.invalid ? field.errorId : undefined}
          invalid={field?.invalid ?? false}
          onChange={onChange}
        />
      ) : (
        <EditorPlaceholder />
      )}
    </div>
  );
}

/** Same footprint as the editor, so nothing jumps when it arrives. */
function EditorPlaceholder() {
  return (
    <div aria-hidden="true" className="min-h-[14.75rem] rounded-md border border-line bg-surface" />
  );
}
