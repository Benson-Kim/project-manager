"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view/data-view";
import { Dialog, Sheet } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/form/combobox";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select, Switch, Textarea } from "@/components/ui/form/inputs";
import { useZodForm } from "@/components/ui/form/use-zod-form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Toolbar } from "@/components/ui/toolbar";
import { useToast } from "@/components/ui/toast";
import { useAnnouncer } from "@/components/ui/announcer";
import { messages } from "@/lib/messages";

const demoSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(50),
  category: z.string().min(1, "Choose a category"),
});

interface DemoRow {
  id: number;
  name: string;
  status: string;
  owner: string;
}

const demoRows: DemoRow[] = [
  { id: 1, name: "Network refresh", status: "In progress", owner: "Dana" },
  { id: 2, name: "HoloLens pilot", status: "Not started", owner: "Rachid" },
  { id: 3, name: "Data centre move", status: "Completed", owner: "Mei" },
];

export function KitchenSink() {
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const form = useZodForm(demoSchema);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Kitchen sink"
        action={
          <Button onClick={() => toast({ variant: "success", title: messages.feedback.saved })}>
            Success toast
          </Button>
        }
      />

      <div className="flex flex-col gap-8 pb-8">
        <section aria-labelledby="ks-buttons">
          <h2 id="ks-buttons" className="mb-3 text-base font-semibold text-ink">
            Buttons
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button pending>Pending</Button>
            <Button
              variant="secondary"
              onClick={() => toast({ variant: "error", title: messages.errors.INTERNAL })}
            >
              Error toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast({
                  variant: "info",
                  title: messages.feedback.deleted,
                  action: { label: messages.actions.undo, onAction: () => announce("Restored") },
                })
              }
            >
              Undo toast
            </Button>
            <Button variant="secondary" onClick={() => announce("Announcement test")}>
              Announce
            </Button>
          </div>
        </section>

        <section aria-labelledby="ks-form">
          <h2 id="ks-form" className="mb-3 text-base font-semibold text-ink">
            Form
          </h2>
          <form
            noValidate
            onBlur={form.onBlur}
            data-testid="ks-form"
            className="flex max-w-md flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const valid = form.validate(e.currentTarget);
              setSummary(valid ? null : messages.errors.VALIDATION);
              if (valid) toast({ variant: "success", title: messages.feedback.saved });
            }}
          >
            <ErrorSummary message={summary} />
            <Field label="Name" name="name" errors={form.errors.name}>
              <Input name="name" />
            </Field>
            <Field label="Category" name="category" errors={form.errors.category}>
              <Select name="category" defaultValue="">
                <option value="" disabled>
                  {messages.list.filter}
                </option>
                <option value="a">Category A</option>
                <option value="b">Category B</option>
              </Select>
            </Field>
            <Field label="Notes" name="notes">
              <Textarea name="notes" />
            </Field>
            <Field label="Due date" name="due">
              <DatePicker name="due" />
            </Field>
            <Field label="Owner" name="owner">
              <Combobox
                name="owner"
                options={[
                  { value: "1", label: "Dana" },
                  { value: "2", label: "Rachid" },
                  { value: "3", label: "Mei" },
                ]}
              />
            </Field>
            <Switch name="active" label="Active" defaultChecked />
            <div>
              <Button type="submit">{messages.actions.save}</Button>
            </div>
          </form>
        </section>

        <section aria-labelledby="ks-overlays">
          <h2 id="ks-overlays" className="mb-3 text-base font-semibold text-ink">
            Overlays
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Open confirm
            </Button>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="Dialog title"
            description="One sentence of context."
          >
            <Button onClick={() => setDialogOpen(false)}>{messages.actions.close}</Button>
          </Dialog>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Sheet title">
            <p className="text-sm text-ink-muted">Record detail and edit forms render here.</p>
          </Sheet>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={messages.confirmDelete.title("record", "Demo")}
            body={messages.confirmDelete.body}
            confirmLabel={messages.actions.delete}
            onConfirm={() => {
              setConfirmOpen(false);
              toast({ variant: "success", title: messages.feedback.deleted });
            }}
          />
        </section>

        <section aria-labelledby="ks-states">
          <h2 id="ks-states" className="mb-3 text-base font-semibold text-ink">
            States
          </h2>
          <div className="flex flex-col gap-3">
            <EmptyState title={messages.list.emptyTitle} body="Create the first record." />
            <ErrorState
              title={messages.list.errorTitle}
              onRetry={() => announce(messages.app.retry)}
            />
            <ListSkeleton rows={2} />
          </div>
        </section>

        <section aria-labelledby="ks-dataview">
          <h2 id="ks-dataview" className="mb-3 text-base font-semibold text-ink">
            DataView
          </h2>
          <Toolbar>
            <label className="flex-1">
              <span className="sr-only">{messages.list.search}</span>
              <Input name="q" type="search" placeholder={messages.list.search} />
            </label>
          </Toolbar>
          <div className="mt-3">
            <DataView
              moduleKey="kitchen-sink"
              rows={demoRows}
              totalCount={demoRows.length}
              page={1}
              initialView="grid"
              getRowId={(row) => row.id}
              getRowLabel={(row) => row.name}
              renderCard={(row) => (
                <div>
                  <p className="text-sm font-semibold text-ink">{row.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">{row.status}</p>
                </div>
              )}
              columns={[
                { key: "name", header: "Name", priority: 1, render: (r) => r.name },
                { key: "status", header: "Status", priority: 2, render: (r) => r.status },
                { key: "owner", header: "Owner", priority: 3, render: (r) => r.owner },
              ]}
              onOpen={(row) => toast({ variant: "info", title: row.name })}
              bulkActions={(ids, clear) => (
                <Button
                  variant="danger"
                  onClick={() => {
                    toast({ variant: "success", title: messages.feedback.deleted });
                    clear();
                  }}
                >
                  {messages.actions.delete} ({ids.length})
                </Button>
              )}
              empty={<EmptyState title={messages.list.emptyTitle} />}
            />
          </div>
        </section>
      </div>
    </>
  );
}
