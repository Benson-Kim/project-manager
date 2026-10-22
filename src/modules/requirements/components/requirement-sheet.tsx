"use client";

import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Sheet } from "@/components/ui/dialog";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import { messages } from "@/lib/messages";
import type { RequirementOption, RequirementRow } from "../schemas/requirement";
import { requirementRef } from "../schemas/requirement-rules";
import { typeLabel, type RequirementType } from "../schemas/requirement-types";
import { RequirementForm } from "./requirement-form";

/**
 * The register's detail/edit sheet, URL-synced via ?id= (a numeric id or "new"). Closing clears
 * the merge link's parameters too, so re-opening a new requirement starts empty.
 */
export function RequirementSheet({
  requirement,
  isNew,
  projectId,
  initialType,
  initialValidates,
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
  needOptions: RequirementOption[];
  deliverableOptions: MultiSelectOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { update } = useListUrlState();
  const close = () => update({ id: null, validates: null });
  const open = isNew || requirement !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={
        requirement
          ? messages.requirements.typeWithRef(
              typeLabel(requirement.RequirementType),
              requirementRef(requirement.RequirementType, requirement.Number),
            )
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
