"use client";

import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Sheet } from "@/components/ui/dialog";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import { messages } from "@/lib/messages";
import type { RequirementOption, RequirementRow } from "../schemas/requirement";
import { type RequirementType } from "../schemas/requirement-types";
import { typeCell } from "./register-model";
import { RequirementForm } from "./requirement-form";

/**
 * The register's detail/edit sheet, URL-synced via ?id= (a numeric id or "new"). Closing clears
 * the merge link's and the sub-requirement link's parameters too, so re-opening a new requirement
 * starts empty rather than under whatever row the last one hung off (ADR-0048).
 */
export function RequirementSheet({
  requirement,
  isNew,
  projectId,
  initialType,
  initialValidates,
  initialParent,
  needOptions,
  deliverableOptions,
  canEdit,
  canDelete,
}: {
  requirement: RequirementRow | null;
  isNew: boolean;
  projectId: number;
  initialType: RequirementType;
  initialValidates: readonly number[];
  /** ?parent=: the requirement a new one goes under, already scoped to this project. */
  initialParent: RequirementRow | null;
  needOptions: RequirementOption[];
  deliverableOptions: MultiSelectOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { update } = useListUrlState();
  const close = () => update({ id: null, validates: null, parent: null });
  const open = isNew || requirement !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={
        requirement
          ? messages.requirements.typeWithRef(typeCell(requirement), requirement.Ref)
          : initialParent
            ? messages.requirements.addSubRequirementUnder(initialParent.Ref)
            : messages.requirements.newRequirement
      }
    >
      {open ? (
        // Remounted per record, so the picked chips and type never carry over to another row.
        <RequirementForm
          key={requirement?.RequirementId ?? "new"}
          requirement={requirement}
          projectId={projectId}
          initialType={initialType}
          initialValidates={initialValidates}
          initialParent={initialParent}
          needOptions={needOptions}
          deliverableOptions={deliverableOptions}
          canEdit={canEdit}
          canDelete={canDelete}
          onDone={close}
        />
      ) : null}
    </Sheet>
  );
}
