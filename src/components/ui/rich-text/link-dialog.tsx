"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { parseLinkInput } from "@/lib/rich-text/links";
import { messages } from "@/lib/messages";

/**
 * Link address dialog (Ctrl+K or the toolbar's Link button). No <form>: the
 * dialog renders in a portal but React events still bubble to the editor's
 * form, and a nested submit would reach the form's onSubmit. Enter applies.
 */
export function LinkDialog({
  open,
  initialHref,
  onApply,
  onApplyLocalPath,
  onRemove,
  onOpenChange,
}: {
  open: boolean;
  initialHref: string;
  onApply: (href: string) => void;
  /** Without it, a folder path is refused like any other invalid address. */
  onApplyLocalPath?: (path: string) => void;
  onRemove: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={messages.richText.link}>
      {/* Remounted per opening, so the address starts from the current link. */}
      {open ? (
        <LinkFields
          initialHref={initialHref}
          onApply={onApply}
          onApplyLocalPath={onApplyLocalPath}
          onRemove={onRemove}
          onCancel={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function LinkFields({
  initialHref,
  onApply,
  onApplyLocalPath,
  onRemove,
  onCancel,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onApplyLocalPath?: (path: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState(initialHref);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const target = parseLinkInput(address);
    if (target.kind === "url") onApply(target.href);
    else if (target.kind === "localPath" && onApplyLocalPath) onApplyLocalPath(target.path);
    else if (target.kind === "refused" && target.reason === "executable")
      setError(messages.richText.localPathBlocked);
    else setError(messages.richText.linkInvalid);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={messages.richText.linkAddress}
        name="rich-text-link"
        errors={error ? [error] : undefined}
      >
        {/* type="text": a url input refuses a folder path such as C:\Projects. */}
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
      </Field>
      <DialogActions onCancel={onCancel}>
        {initialHref ? (
          <Button variant="secondary" onClick={onRemove}>
            {messages.richText.removeLink}
          </Button>
        ) : null}
        <Button onClick={apply}>{messages.richText.applyLink}</Button>
      </DialogActions>
    </div>
  );
}
