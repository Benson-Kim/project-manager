"use client";

import { useState } from "react";
import { Button } from "../button";
import { Dialog } from "../dialog";
import { Field } from "../form/field";
import { Input } from "../form/inputs";
import { messages } from "@/lib/messages";
import { STORAGE_LOCATION_MAX } from "@/modules/file-storage/schemas/attachment";

/**
 * The attachment dialogs (ADR-0026 §10). They open from inside a record's
 * <form>, and React events bubble through portals (LESSONS §21), so there is
 * NO <form> here: Enter in a field saves, and the inputs carry no name.
 */
type FieldErrors = Partial<Record<"fileName" | "storageLocation", string[]>>;

interface SaveResult {
  ok: boolean;
  fieldErrors?: FieldErrors;
}

function onEnter(save: () => void) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }
  };
}

function DialogButtons({
  pending,
  onCancel,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {messages.actions.cancel}
      </Button>
      <Button onClick={onSave} pending={pending} data-testid="attachment-dialog-save">
        {messages.actions.save}
      </Button>
    </div>
  );
}

export function RenameDialog({
  name,
  pending,
  onCancel,
  onSave,
}: {
  /** The current name; null closes the dialog. */
  name: string | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (fileName: string) => Promise<SaveResult>;
}) {
  return (
    <Dialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={messages.attachments.renameTitle}
    >
      {name !== null ? (
        <RenameFields
          key={name}
          initial={name}
          pending={pending}
          onCancel={onCancel}
          onSave={onSave}
        />
      ) : null}
    </Dialog>
  );
}

function RenameFields({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (fileName: string) => Promise<SaveResult>;
}) {
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = () => {
    if (!value.trim()) {
      setErrors({ fileName: [messages.attachments.errors.nameRequired] });
      return;
    }
    void onSave(value).then((r) => setErrors(r.fieldErrors ?? {}));
  };
  return (
    <>
      <Field label={messages.attachments.name} name="fileName" errors={errors.fileName}>
        <Input
          value={value}
          maxLength={255}
          autoFocus
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onEnter(save)}
          data-testid="attachment-rename-input"
        />
      </Field>
      <DialogButtons pending={pending} onCancel={onCancel} onSave={save} />
    </>
  );
}

export function LocationDialog({
  open,
  pending,
  onCancel,
  onSave,
}: {
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (fileName: string, storageLocation: string) => Promise<SaveResult>;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={messages.attachments.locationTitle}
    >
      {open ? <LocationFields pending={pending} onCancel={onCancel} onSave={onSave} /> : null}
    </Dialog>
  );
}

function LocationFields({
  pending,
  onCancel,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: (fileName: string, storageLocation: string) => Promise<SaveResult>;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = () => {
    const next: FieldErrors = {};
    if (!name.trim()) next.fileName = [messages.attachments.errors.nameRequired];
    if (!location.trim()) next.storageLocation = [messages.attachments.errors.locationRequired];
    setErrors(next);
    if (next.fileName || next.storageLocation) return;
    void onSave(name, location).then((r) => setErrors(r.fieldErrors ?? {}));
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label={messages.attachments.name} name="fileName" errors={errors.fileName}>
        <Input
          value={name}
          maxLength={255}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onEnter(save)}
          data-testid="attachment-location-name"
        />
      </Field>
      <Field
        label={messages.attachments.location}
        name="storageLocation"
        errors={errors.storageLocation}
      >
        <Input
          value={location}
          maxLength={STORAGE_LOCATION_MAX}
          spellCheck={false}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={onEnter(save)}
          data-testid="attachment-location-value"
        />
      </Field>
      <DialogButtons pending={pending} onCancel={onCancel} onSave={save} />
    </div>
  );
}
