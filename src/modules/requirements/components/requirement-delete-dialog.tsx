"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { messages } from "@/lib/messages";
import { requirementDeleteImpactAction } from "../actions";
import type { ChildAction, DeleteImpactRow, RequirementRow } from "../schemas/requirement";
import { deleteImpactText, promoteConsequence, type RegisterRow } from "./register-model";

const M = messages.requirements;

export interface DeleteChoice {
  childAction: ChildAction;
  expectedDeleteCount?: number;
}

interface RequirementDeleteDialogProps {
  requirement: RegisterRow & Pick<RequirementRow, "RequirementId">;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: DeleteChoice) => void;
  pending: boolean;
}

/** Mounted on open, so the impact it reads is fresh each time. Keeping the items is the default. */
export function RequirementDeleteDialog({
  requirement,
  onOpenChange,
  onConfirm,
  pending,
}: RequirementDeleteDialogProps) {
  const [cascade, setCascade] = useState(false);
  const [impact, setImpact] = useState<DeleteImpactRow[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void requirementDeleteImpactAction({ requirementId: requirement.RequirementId }).then(
      (result) => {
        if (!live) return;
        if (result.ok) setImpact(result.data);
        else setFailure(result.error.message ?? messages.errors.INTERNAL);
      },
    );
    return () => {
      live = false;
    };
  }, [requirement.RequirementId]);

  const body = !cascade
    ? promoteConsequence(requirement)
    : (failure ?? (impact ? deleteImpactText(impact) : M.deleteImpactLoading));

  const keepLabel = requirement.ChildCount > 0 ? M.promoteAndDelete : messages.actions.delete;

  const confirm = () => {
    if (!cascade) return onConfirm({ childAction: "Orphan" });
    if (impact === null) return;
    onConfirm({
      childAction: "Delete",
      expectedDeleteCount: impact.filter((r) => r.Fate === "Deleted").length,
    });
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={M.deleteTitle(requirement.Ref)}
      body={body}
      confirmLabel={cascade ? M.deleteWithChildren : keepLabel}
      onConfirm={confirm}
      pending={pending || (cascade && impact === null)}
    >
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">{M.deleteChoice}</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="requirement-delete-choice"
            data-testid="requirement-delete-orphan"
            checked={!cascade}
            onChange={() => setCascade(false)}
          />
          {M.deleteChoiceOrphan}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="requirement-delete-choice"
            data-testid="requirement-delete-cascade"
            checked={cascade}
            onChange={() => setCascade(true)}
          />
          {M.deleteChoiceCascade}
        </label>
      </fieldset>
    </ConfirmDialog>
  );
}
