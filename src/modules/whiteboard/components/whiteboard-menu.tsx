"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BinIcon } from "@/components/ui/action-icons";
import { buttonClass } from "@/components/ui/button-styles";
import { Chevron } from "@/components/ui/chevron";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Menu, MenuButton, MenuSeparator } from "@/components/ui/menu";
import { notifySaved } from "@/lib/cross-window";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { deleteWhiteboardAction } from "../actions";
import type { WhiteboardSummary } from "../schemas/whiteboard";
import type { WithRowVer } from "./use-whiteboard-save";
import { WhiteboardForm } from "./whiteboard-form";

const M = messages.whiteboard;

type Open = "new" | "rename" | "delete" | null;

/** Switches between the project's whiteboards, and creates, renames or deletes one. */
export function WhiteboardMenu({
  projectId,
  boards,
  current,
  can,
  rowVer,
  withRowVer,
}: {
  projectId: number;
  boards: readonly WhiteboardSummary[];
  current: { WhiteboardId: number; Name: string };
  can: { create: boolean; update: boolean; delete: boolean };
  rowVer: () => number;
  withRowVer: WithRowVer;
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
      const result = await deleteWhiteboardAction({
        whiteboardId: current.WhiteboardId,
        rowVer: rowVer(),
      });
      if (!result.ok) return setError(firstError(result.error));
      notifySaved();
      setOpen(null);
      router.push(pathname);
    });

  return (
    <>
      <Menu
        label={M.boards}
        align="start"
        testId="whiteboard-menu"
        trigger={
          <>
            {M.boards}
            <Chevron />
          </>
        }
        triggerClassName={buttonClass("secondary", "compact")}
      >
        {boards.map((each) => (
          <MenuButton
            key={each.WhiteboardId}
            checked={each.WhiteboardId === current.WhiteboardId}
            testId="whiteboard-item"
            onClick={() => router.push(`${pathname}?board=${each.WhiteboardId}`)}
          >
            {each.Name}
          </MenuButton>
        ))}
        {can.create ? (
          <MenuButton testId="whiteboard-new" onClick={() => show("new")}>
            {M.newBoard}
          </MenuButton>
        ) : null}
        {can.update ? (
          <MenuButton testId="whiteboard-rename" onClick={() => show("rename")}>
            {M.renameBoard}
          </MenuButton>
        ) : null}
        {can.delete ? (
          <>
            <MenuSeparator />
            <MenuButton
              testId="whiteboard-delete"
              tone="danger"
              icon={<BinIcon />}
              onClick={() => show("delete")}
            >
              {M.deleteBoard}
            </MenuButton>
          </>
        ) : null}
      </Menu>
      <Dialog open={open === "new"} onOpenChange={toggle("new")} title={M.newBoard}>
        <WhiteboardForm projectId={projectId} onDone={() => setOpen(null)} />
      </Dialog>
      <Dialog open={open === "rename"} onOpenChange={toggle("rename")} title={M.renameBoard}>
        <WhiteboardForm
          projectId={projectId}
          rename={{ whiteboardId: current.WhiteboardId, name: current.Name, withRowVer }}
          onDone={() => setOpen(null)}
        />
      </Dialog>
      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={toggle("delete")}
        title={messages.confirmDelete.title(M.entity, current.Name)}
        body={M.deleteBody}
        confirmLabel={messages.actions.delete}
        onConfirm={remove}
        pending={pending}
      >
        <ErrorSummary message={error} />
      </ConfirmDialog>
    </>
  );
}
