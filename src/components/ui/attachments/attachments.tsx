"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "../announcer";
import { Button } from "../button";
import { ConfirmDialog } from "../confirm-dialog";
import { SectionHeading } from "../form/section-heading";
import { useToast } from "../toast";
import type { ActionResult } from "@/lib/action";
import { formatDate, formatFileSize } from "@/lib/format";
import { messages } from "@/lib/messages";
import {
  addLocationAction,
  removeAttachmentAction,
  renameAttachmentAction,
} from "@/modules/file-storage/actions";
import {
  ACCEPTED_EXTENSIONS,
  locationHref,
  type AttachmentOwner,
  type AttachmentRow,
} from "@/modules/file-storage/schemas/attachment";
import { LocationDialog, RenameDialog } from "./attachment-dialogs";
import { downloadUrl, preflight, uploadFile } from "./upload-file";

/**
 * A record's attachments (ADR-0026 §10, checklist rows 43–44): uploaded files
 * and locations ("where I put the files"). Reusable by any owner in
 * ATTACHMENT_OWNERS; the rows come from the page (usp_<Owner>_ListFiles) and
 * reload with router.refresh() — the client never fetches them.
 *
 * It lives INSIDE the record's <form>, so:
 *  - the file input has no name (the record's FormData never carries a File);
 *  - change/input/blur events stop here: an upload saves at once, so it must
 *    not mark the record dirty or run the form's blur validation;
 *  - every button is type="button" and the dialogs hold no <form>.
 * In a disabled fieldset its buttons are disabled; downloads still work.
 */
export interface AttachmentsProps {
  owner: AttachmentOwner;
  ownerId: number;
  files: AttachmentRow[];
  /** Add files and locations, and rename (the owner's update permission). */
  canAdd: boolean;
  /** Remove (also the owner's update permission, user decision 2026-10-10). */
  canRemove: boolean;
}

interface Upload {
  key: number;
  name: string;
  percent: number;
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

export function Attachments({ owner, ownerId, files, canAdd, canRemove }: AttachmentsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<AttachmentRow | null>(null);
  const [removing, setRemoving] = useState<AttachmentRow | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = (title: string) => {
    toast({ variant: "success", title });
    announce(title);
  };
  const fail = (name: string, reason: string) =>
    toast({ variant: "error", title: messages.attachments.errors.failedWith(name, reason) });

  /** One file at a time: progress stays readable and the quota is checked in order. */
  async function uploadAll(list: File[]) {
    for (const file of list) {
      const problem = preflight(file);
      if (problem) {
        fail(file.name, problem);
        continue;
      }
      const key = nextKey.current++;
      setUploads((u) => [...u, { key, name: file.name, percent: 0 }]);
      const outcome = await uploadFile(file, owner, ownerId, (percent) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, percent } : x))),
      );
      setUploads((u) => u.filter((x) => x.key !== key));
      if (outcome.ok) {
        confirm(messages.attachments.uploaded(outcome.fileName));
        router.refresh();
      } else {
        fail(file.name, outcome.message);
      }
    }
  }

  /** Runs an action; on success confirms and refreshes, otherwise toasts the error. */
  function run<T>(
    call: () => Promise<ActionResult<T>>,
    success: string,
    name: string,
  ): Promise<{ ok: boolean; fieldErrors?: Record<string, string[]> }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await call();
        if (result.ok) {
          confirm(success);
          router.refresh();
          resolve({ ok: true });
          return;
        }
        if (result.error.fieldErrors) {
          resolve({ ok: false, fieldErrors: result.error.fieldErrors });
          return;
        }
        fail(name, result.error.message);
        resolve({ ok: false });
      });
    });
  }

  const onDrop = (event: React.DragEvent) => {
    if (!canAdd) return;
    event.preventDefault();
    setDragging(false);
    void uploadAll(Array.from(event.dataTransfer.files));
  };

  const empty = files.length === 0 && uploads.length === 0;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="attachments"
      className={`flex flex-col gap-3 rounded-md ${dragging ? "outline-2 outline-dashed outline-accent" : ""}`}
      onChange={stop}
      onInput={stop}
      onBlur={stop}
      onDragOver={(event) => {
        if (!canAdd || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <SectionHeading id={headingId}>{messages.attachments.heading}</SectionHeading>

      {empty ? (
        <p className="px-4 text-sm text-ink-muted">
          {canAdd ? messages.attachments.empty : messages.attachments.emptyReadOnly}
        </p>
      ) : (
        <ul className="flex flex-col px-4" data-testid="attachments-list">
          {uploads.map((u) => (
            <li key={`u${u.key}`} className="flex min-h-11 flex-col justify-center gap-1 py-2">
              <span className="text-sm text-ink">{messages.attachments.uploading(u.name)}</span>
              <progress
                className="h-2 w-full accent-accent"
                max={100}
                value={u.percent}
                aria-label={messages.attachments.uploading(u.name)}
              />
            </li>
          ))}
          {files.map((file) => (
            <AttachmentItem
              key={file.FileAttachmentId}
              owner={owner}
              file={file}
              canRename={canAdd}
              canRemove={canRemove}
              onRename={() => setRenaming(file)}
              onRemove={() => setRemoving(file)}
              onCopied={() => confirm(messages.attachments.copied)}
            />
          ))}
        </ul>
      )}

      {canAdd ? (
        <div className="flex flex-wrap gap-2 px-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPTED_EXTENSIONS.join(",")}
            data-testid="attachments-input"
            onChange={(event) => {
              const list = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void uploadAll(list);
            }}
          />
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            data-testid="attachments-add-file"
          >
            {messages.attachments.addFile}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setAddingLocation(true)}
            data-testid="attachments-add-location"
          >
            {messages.attachments.addLocation}
          </Button>
          {dragging ? (
            <span className="self-center text-sm text-ink-muted">
              {messages.attachments.dropHere}
            </span>
          ) : null}
        </div>
      ) : null}

      <RenameDialog
        name={renaming?.FileName ?? null}
        pending={pending}
        onCancel={() => setRenaming(null)}
        onSave={async (fileName) => {
          const target = renaming!;
          const r = await run(
            () =>
              renameAttachmentAction({
                owner,
                fileAttachmentId: target.FileAttachmentId,
                rowVer: target.RowVer,
                fileName,
              }),
            messages.attachments.renamed,
            target.FileName,
          );
          if (r.ok) setRenaming(null);
          return r;
        }}
      />

      <LocationDialog
        open={addingLocation}
        pending={pending}
        onCancel={() => setAddingLocation(false)}
        onSave={async (fileName, storageLocation) => {
          const r = await run(
            () => addLocationAction({ owner, ownerId, fileName, storageLocation }),
            messages.attachments.locationAdded,
            fileName,
          );
          if (r.ok) setAddingLocation(false);
          return r;
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={messages.attachments.removeTitle(removing?.FileName ?? "")}
        body={messages.attachments.removeBody}
        confirmLabel={messages.attachments.remove}
        pending={pending}
        onConfirm={() => {
          const target = removing!;
          void run(
            () =>
              removeAttachmentAction({
                owner,
                fileAttachmentId: target.FileAttachmentId,
                rowVer: target.RowVer,
              }),
            messages.attachments.removed,
            target.FileName,
          ).then(() => setRemoving(null));
        }}
      />
    </section>
  );
}

function AttachmentItem({
  owner,
  file,
  canRename,
  canRemove,
  onRename,
  onRemove,
  onCopied,
}: {
  owner: AttachmentOwner;
  file: AttachmentRow;
  canRename: boolean;
  canRemove: boolean;
  onRename: () => void;
  onRemove: () => void;
  onCopied: () => void;
}) {
  const location = file.StorageLocation;
  const href = location ? locationHref(location) : null;
  const when = formatDate(file.CreatedAtUtc);
  const details = [
    formatFileSize(file.SizeBytes),
    file.CreatedByName ? messages.attachments.byOn(file.CreatedByName, when) : when,
  ].filter(Boolean);

  return (
    <li
      className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
      data-testid="attachment"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {location === null ? (
          <a
            href={downloadUrl(owner, file.FileAttachmentId)}
            download={file.FileName}
            aria-label={messages.attachments.download(file.FileName)}
            className="inline-flex min-h-11 items-center break-all text-sm font-medium text-accent underline"
          >
            {file.FileName}
          </a>
        ) : (
          <>
            <span className="inline-flex min-h-11 items-center break-all text-sm font-medium text-ink">
              {file.FileName}
            </span>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-accent underline"
              >
                {location}
              </a>
            ) : (
              <span className="break-all text-sm text-ink" data-testid="attachment-location">
                {location}
              </span>
            )}
          </>
        )}
        <span className="text-xs text-ink-muted">{details.join(" · ")}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {location !== null && href === null ? (
          <Button
            variant="ghost"
            aria-label={`${messages.attachments.copy} ${location}`}
            onClick={() => {
              void navigator.clipboard?.writeText(location).then(onCopied, () => undefined);
            }}
          >
            {messages.attachments.copy}
          </Button>
        ) : null}
        {canRename ? (
          <Button
            variant="ghost"
            aria-label={`${messages.attachments.rename} ${file.FileName}`}
            onClick={onRename}
          >
            {messages.attachments.rename}
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            variant="ghost"
            aria-label={`${messages.attachments.remove} ${file.FileName}`}
            onClick={onRemove}
          >
            {messages.attachments.remove}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
