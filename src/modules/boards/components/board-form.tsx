"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
export const control =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-ink";
export function BoardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function BoardForm({
  title,
  children,
  save,
  close,
  readOnly = false,
}: {
  title: string;
  children: React.ReactNode;
  save: (data: FormData) => Promise<ActionResult<unknown>>;
  close: () => void;
  readOnly?: boolean;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
      title={title}
    >
      <form
        className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setError("");
          start(async () => {
            try {
              const result = await save(data);
              if (result.ok) close();
              else
                setError(
                  [
                    result.error.message,
                    ...Object.values(result.error.fieldErrors ?? {}).flat(),
                  ].join(" "),
                );
            } catch {
              setError(messages.errors.INTERNAL);
            }
          });
        }}
      >
        {children}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={pending} onClick={close}>
            {messages.boards.ui.cancel}
          </Button>
          <Button type="submit" pending={pending} disabled={readOnly}>
            {messages.boards.ui.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export const text = (data: FormData, key: string) => String(data.get(key) ?? "");
export const optionalNumber = (data: FormData, key: string) =>
  text(data, key) ? Number(text(data, key)) : null;

export const isoDate = (date: Date | null) =>
  date ? new Date(date).toISOString().slice(0, 10) : "";
