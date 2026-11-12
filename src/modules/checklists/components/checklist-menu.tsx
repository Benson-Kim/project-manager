"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { Chevron } from "@/components/ui/chevron";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Menu, MenuButton } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { deleteChecklistAction } from "../actions";
import type { Checklist } from "../schemas/checklist";
import { ChecklistForm } from "./checklist-form";

const M = messages.checklists;

type Open = "new" | "rename" | "delete" | null;

/** Switches between the project's checklists, and creates, renames or deletes one. */
export function ChecklistMenu({
  projectId,
  checklists,
  current,
  can,
}: {
  projectId: number;
  checklists: readonly Checklist[];
  current: Checklist;
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const show = (which: Open) => {
    setError(null);
    setOpen(which);
  };
  const toggle = (which: Exclude<Open, null>) => (isOpen: boolean) => show(isOpen ? which : null);

  const remove = () =>
    startTransition(async () => {
      const result = await deleteChecklistAction({
        checklistId: current.ChecklistId,
        rowVer: current.RowVer,
      });
      if (!result.ok) return setError(firstError(result.error));
      setOpen(null);
      router.push(pathname);
    });

  return (
    <>
      <Menu
        label={M.picker}
        align="start"
        testId="checklist-menu"
        trigger={
          <>
            {current.Name}
            <Chevron />
          </>
        }
        triggerClassName={buttonClass("secondary", "compact")}
      >
        {checklists.map((each) => (
          <MenuButton
            key={each.ChecklistId}
            checked={each.ChecklistId === current.ChecklistId}
            testId="checklist-item"
            onClick={() => router.push(`${pathname}?checklist=${each.ChecklistId}`)}
          >
            {each.Name}
          </MenuButton>
        ))}
        {can.create ? (
          <MenuButton testId="checklist-new" onClick={() => show("new")}>
            {M.newChecklist}
          </MenuButton>
        ) : null}
        {can.update ? (
          <MenuButton testId="checklist-rename" onClick={() => show("rename")}>
            {M.rename}
          </MenuButton>
        ) : null}
        {can.delete ? (
          <MenuButton testId="checklist-delete" onClick={() => show("delete")}>
            {M.delete}
          </MenuButton>
        ) : null}
      </Menu>
      <Dialog open={open === "new"} onOpenChange={toggle("new")} title={M.createTitle}>
        <ChecklistForm projectId={projectId} onDone={() => setOpen(null)} />
      </Dialog>
      <Dialog open={open === "rename"} onOpenChange={toggle("rename")} title={M.renameTitle}>
        <ChecklistForm projectId={projectId} rename={current} onDone={() => setOpen(null)} />
      </Dialog>
      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={toggle("delete")}
        title={messages.confirmDelete.title(M.entity, current.Name)}
        body={M.deletePrompt(current.Name)}
        confirmLabel={messages.actions.delete}
        onConfirm={remove}
        pending={pending}
      >
        <ErrorSummary message={error} />
      </ConfirmDialog>
    </>
  );
}
