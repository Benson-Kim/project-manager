"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { normaliseLinkInput } from "@/lib/rich-text/links";
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
  onRemove,
  onOpenChange,
}: {
  open: boolean;
  initialHref: string;
  onApply: (href: string) => void;
  onRemove: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={messages.richText.link}>
      {/* Remounted per opening, so the address starts from the current link. */}
      {open ? <LinkFields initialHref={initialHref} onApply={onApply} onRemove={onRemove} /> : null}
    </Dialog>
  );
}

function LinkFields({
  initialHref,
  onApply,
  onRemove,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onRemove: () => void;
}) {
  const [address, setAddress] = useState(initialHref);
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const href = normaliseLinkInput(address);
    if (href) onApply(href);
    else setInvalid(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={messages.richText.linkAddress}
        name="rich-text-link"
        errors={invalid ? [messages.richText.linkInvalid] : undefined}
      >
        <Input
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {initialHref ? (
          <Button variant="secondary" onClick={onRemove}>
            {messages.richText.removeLink}
          </Button>
        ) : null}
        <Button onClick={apply}>{messages.richText.applyLink}</Button>
      </div>
    </div>
  );
}
