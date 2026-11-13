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
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { deleteDiagramAction } from "../actions";
import type { DiagramSummary } from "../schemas/bpmn";
import { DiagramForm } from "./diagram-form";
import type { WithRowVer } from "./use-diagram-save";

const M = messages.bpmn;

type Open = "new" | "rename" | "delete" | null;

/** Switches between the project's diagrams, and creates, renames or deletes one. */
export function DiagramMenu({
  projectId,
  diagrams,
  current,
  can,
  rowVer,
  withRowVer,
}: {
  projectId: number;
  diagrams: readonly DiagramSummary[];
  current: { BpmnDiagramId: number; Name: string };
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
      const result = await deleteDiagramAction({
        diagramId: current.BpmnDiagramId,
        rowVer: rowVer(),
      });
      if (!result.ok) return setError(firstError(result.error));
      setOpen(null);
      router.push(pathname);
    });

  return (
    <>
      <Menu
        label={M.diagrams}
        align="start"
        testId="bpmn-diagram-menu"
        trigger={
          <>
            {M.diagrams}
            <Chevron />
          </>
        }
        triggerClassName={buttonClass("secondary", "compact")}
      >
        {diagrams.map((each) => (
          <MenuButton
            key={each.BpmnDiagramId}
            checked={each.BpmnDiagramId === current.BpmnDiagramId}
            testId="bpmn-diagram-item"
            onClick={() => router.push(`${pathname}?diagram=${each.BpmnDiagramId}`)}
          >
            {each.Name}
          </MenuButton>
        ))}
        {can.create ? (
          <MenuButton testId="bpmn-diagram-new" onClick={() => show("new")}>
            {M.newDiagram}
          </MenuButton>
        ) : null}
        {can.update ? (
          <MenuButton testId="bpmn-diagram-rename" onClick={() => show("rename")}>
            {M.renameDiagram}
          </MenuButton>
        ) : null}
        {can.delete ? (
          <>
            <MenuSeparator />
            <MenuButton
              testId="bpmn-diagram-delete"
              tone="danger"
              icon={<BinIcon />}
              onClick={() => show("delete")}
            >
              {M.deleteDiagram}
            </MenuButton>
          </>
        ) : null}
      </Menu>
      <Dialog open={open === "new"} onOpenChange={toggle("new")} title={M.newDiagram}>
        <DiagramForm projectId={projectId} onDone={() => setOpen(null)} />
      </Dialog>
      <Dialog open={open === "rename"} onOpenChange={toggle("rename")} title={M.renameDiagram}>
        <DiagramForm
          projectId={projectId}
          rename={{
            diagramId: current.BpmnDiagramId,
            name: current.Name,
            withRowVer,
          }}
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
