"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { Chevron } from "@/components/ui/chevron";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Select } from "@/components/ui/form/inputs";
import { Menu, MenuButton } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { deleteCanvasAction } from "../../actions";
import { defaultWbsFor, type WbsFilter, wbsFilterParam } from "../../canvas/canvas-filter";
import type { CanvasSummary } from "../../schemas/canvas";
import { CanvasForm, type WbsOption } from "./create-canvas-form";

const M = messages.requirements.canvas;

type Open = "new" | "edit" | "delete" | null;

/** Switches between the listed canvases, filters them by WBS item, and creates, edits or deletes one. */
export function CanvasPicker({
  projectId,
  listed,
  current,
  filter,
  deliverableOptions,
  can,
}: {
  projectId: number;
  listed: readonly CanvasSummary[];
  current: CanvasSummary | null;
  filter: WbsFilter;
  deliverableOptions: readonly WbsOption[];
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("inspect");
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const show = (which: Open) => {
    setError(null);
    setOpen(which);
  };
  const toggle = (which: Exclude<Open, null>) => (isOpen: boolean) => show(isOpen ? which : null);

  const remove = (canvas: CanvasSummary) =>
    startTransition(async () => {
      const result = await deleteCanvasAction({
        canvasId: canvas.RequirementCanvasId,
        rowVer: canvas.RowVer,
      });
      if (!result.ok) return setError(firstError(result.error));
      setOpen(null);
      go({ canvas: null });
    });

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {deliverableOptions.length > 0 ? (
        <div className="w-56 max-w-full">
          <Select
            aria-label={M.wbsFilter}
            data-testid="canvas-wbs-filter"
            value={wbsFilterParam(filter) ?? ""}
            onChange={(event) => go({ wbs: event.target.value || null, canvas: null })}
          >
            <option value="">{M.allWbs}</option>
            <option value="unfiled">{M.unfiled}</option>
            {deliverableOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Menu
        label={M.canvases}
        align="end"
        testId="canvas-picker"
        trigger={
          <>
            {M.canvases}
            <Chevron />
          </>
        }
        triggerClassName={buttonClass("secondary", "compact")}
      >
        {listed.map((each) => (
          <MenuButton
            key={each.RequirementCanvasId}
            checked={each.RequirementCanvasId === current?.RequirementCanvasId}
            testId="canvas-picker-item"
            onClick={() => go({ canvas: String(each.RequirementCanvasId) })}
          >
            {each.Name}
          </MenuButton>
        ))}
        {can.create ? (
          <MenuButton testId="canvas-new" onClick={() => show("new")}>
            {M.newCanvas}
          </MenuButton>
        ) : null}
        {current && can.update ? (
          <MenuButton testId="canvas-edit" onClick={() => show("edit")}>
            {M.editCanvas}
          </MenuButton>
        ) : null}
        {current && can.delete ? (
          <MenuButton testId="canvas-delete" onClick={() => show("delete")}>
            {M.deleteCanvas}
          </MenuButton>
        ) : null}
      </Menu>
      <Dialog open={open === "new"} onOpenChange={toggle("new")} title={M.newCanvas}>
        <CanvasForm
          projectId={projectId}
          deliverableOptions={deliverableOptions}
          defaultWbsId={defaultWbsFor(filter)}
          onSaved={() => setOpen(null)}
        />
      </Dialog>
      {current ? (
        <>
          <Dialog open={open === "edit"} onOpenChange={toggle("edit")} title={M.editCanvas}>
            <CanvasForm
              key={`${current.RequirementCanvasId}-${current.RowVer}`}
              projectId={projectId}
              deliverableOptions={deliverableOptions}
              canvas={current}
              onSaved={() => setOpen(null)}
            />
          </Dialog>
          <ConfirmDialog
            open={open === "delete"}
            onOpenChange={toggle("delete")}
            title={messages.confirmDelete.title(M.entity, current.Name)}
            body={M.deleteBody}
            confirmLabel={messages.actions.delete}
            onConfirm={() => remove(current)}
            pending={pending}
          >
            <ErrorSummary message={error} />
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  );
}
