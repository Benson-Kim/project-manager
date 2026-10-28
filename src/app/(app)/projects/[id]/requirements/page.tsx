import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, initialViewOf, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { listDeliverableOptions } from "@/modules/key-deliverables/repository/key-deliverables";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { RequirementSheet } from "@/modules/requirements/components/requirement-sheet";
import { RequirementsView } from "@/modules/requirements/components/requirements-view";
import { newRequirementType, registerType } from "@/modules/requirements/components/register-model";
import {
  getRequirementById,
  listRequirementOptions,
  listRequirements,
} from "@/modules/requirements/repository/requirements";
import { parseValidatesParam } from "@/modules/requirements/schemas/requirement-form";
import { parseProjectId } from "../project-id";
import { REQUIREMENT_SORT } from "@/modules/requirements/schemas/requirement";

export const metadata: Metadata = {
  title: `${messages.requirements.title} — ${messages.app.name}`,
};

/**
 * The project's requirement register (ADR-0037) — composition root: it loads the requirements
 * module's list and the key-deliverables module's picker options, and passes both as plain props,
 * so neither module imports the other. ?type= filters and starts a new row's type; ?id=<n>|new
 * opens the sheet; ?validates= carries the merge's selected needs into a new solution; ?parent=
 * carries the requirement a new sub-requirement goes under (ADR-0048), which also fixes its type.
 * Default sort: catalog type order, then the tree path (BR-1, BR-1.1, SR-1, FR-1…).
 */
export default async function RequirementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw, REQUIREMENT_SORT);
  const filterType = registerType(flat.type);

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;
  const sheetOpen = isNew || (selectedId !== null && Number.isInteger(selectedId));

  const parentId = isNew && flat.parent ? Number(flat.parent) : null;
  const wantsParent = parentId !== null && Number.isInteger(parentId) && parentId > 0;

  const [rows, preference, selectedRaw, parentRaw, allows, deliverableOptions, needOptions] =
    await Promise.all([
      orNotFound(listRequirements(listParams, session.userId, projectId, filterType)),
      getListPreference(session.userId, "requirements").catch(() => null),
      selectedId && Number.isInteger(selectedId) && selectedId > 0
        ? orNull(getRequirementById(selectedId, session.userId))
        : null,
      // Only read when a sub-requirement is actually being created; the sheet names the parent and
      // takes its type from it, so a bad ?parent= must read as not found rather than as a root.
      wantsParent ? orNull(getRequirementById(parentId, session.userId)) : null,
      getProjectPermissions(projectId, session.userId),
      orNotFound(listDeliverableOptions(projectId, session.userId)),
      // Only the sheet picks needs to validate.
      sheetOpen ? orNotFound(listRequirementOptions(projectId, session.userId)) : [],
    ]);

  // A deep link to a requirement from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);
  const initialParent = guardProjectScope(parentRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("requirements:create");
  const canEdit = allows("requirements:update");
  const canDelete = allows("requirements:delete");
  const filtersActive = Boolean(listParams.q) || filterType !== null;

  const newRequirementLink = (
    <Link
      // Without dropping ?parent=, the header's own link would open a new row under whatever
      // sub-requirement was last added. This link always creates a root requirement.
      href={buildNewEntityHref(`/projects/${projectId}/requirements`, {
        ...flat,
        parent: undefined,
      })}
      data-testid="new-requirement"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.requirements.newRequirement}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.requirements.title}
        action={canCreate ? newRequirementLink : undefined}
      />
      <div className="mt-3 flex flex-1 flex-col">
        <RequirementsView
          projectId={projectId}
          canCreate={canCreate}
          canPackage={allows("boards:create")}
          rows={rows}
          totalCount={totalCount}
          page={listParams.page}
          initialView={initialViewOf(listParams.view, preference?.viewMode)}
          layout={preference?.layout}
          filtersActive={filtersActive}
          filterType={filterType}
          deliverableOptions={deliverableOptions}
          newRequirementAction={canCreate ? newRequirementLink : undefined}
        />
      </div>
      <RequirementSheet
        requirement={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        initialType={initialParent?.RequirementType ?? newRequirementType(filterType)}
        initialValidates={parseValidatesParam(flat.validates)}
        initialParent={initialParent}
        needOptions={needOptions}
        deliverableOptions={deliverableOptions}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
