"use client";

import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Sheet } from "@/components/ui/dialog";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import { messages } from "@/lib/messages";
import type { CanvasItem } from "../schemas/canvas";
import type { LinkRule } from "../schemas/link-rules";
import type { RequirementOption, RequirementRow } from "../schemas/requirement";
import type { RequirementLink } from "../schemas/requirement-link";
import { type RequirementType } from "../schemas/requirement-types";
import { typeCell } from "./register-model";
import { RequirementForm } from "./requirement-form";
import { RequirementLinks } from "./requirement-links";

/**
 * The register's detail/edit sheet, URL-synced via ?id= (a numeric id or "new"). Closing clears
 * the merge link's and the sub-requirement link's parameters too, so re-opening a new requirement
 * starts empty rather than under whatever row the last one hung off (ADR-0048).
 */
export function RequirementSheet({
  requirement,
  links,
  isNew,
  projectId,
  initialType,
  initialValidates,
  initialParent,
  linkOptions,
  linkRules,
  deliverableOptions,
  canEdit,
  canDelete,
  matchAgainst,
}: {
  requirement: RequirementRow | null;
  links: readonly RequirementLink[];
  isNew: boolean;
  projectId: number;
  initialType: RequirementType;
  initialValidates: readonly number[];
  /** ?parent=: the requirement a new one goes under, already scoped to this project. */
  initialParent: RequirementRow | null;
  linkOptions: RequirementOption[];
  linkRules: readonly LinkRule[];
  deliverableOptions: MultiSelectOption[];
  canEdit: boolean;
  canDelete: boolean;
  matchAgainst?: readonly Pick<CanvasItem, "Ref" | "Title">[];
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
        <>
          <RequirementForm
            key={requirement?.RequirementId ?? "new"}
            requirement={requirement}
            projectId={projectId}
            initialType={initialType}
            initialValidates={initialValidates}
            initialParent={initialParent}
            linkOptions={linkOptions}
            linkRules={linkRules}
            deliverableOptions={deliverableOptions}
            canEdit={canEdit}
            canDelete={canDelete}
            onDone={close}
            matchAgainst={matchAgainst}
          />
          {requirement ? (
            <RequirementLinks
              key={requirement.RequirementId}
              requirement={requirement}
              links={links}
              linkOptions={linkOptions}
              linkRules={linkRules}
              deliverableOptions={deliverableOptions}
              canEdit={canEdit}
            />
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
