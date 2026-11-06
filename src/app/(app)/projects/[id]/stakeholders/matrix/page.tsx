import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { StakeholderMatrix } from "@/modules/stakeholders/components/stakeholder-matrix";
import { StakeholderSheet } from "@/modules/stakeholders/components/stakeholder-sheet";
import {
  getStakeholderById,
  getStakeholderMatrix,
} from "@/modules/stakeholders/repository/stakeholders";
import { STAKEHOLDER_LISTS } from "@/modules/stakeholders/schemas/stakeholder";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.stakeholders.matrix.title} — ${messages.app.name}`,
};

/** The project's stakeholders on the power/interest grid; ?id=<n> opens one in the sheet. */
export default async function StakeholderMatrixPage({
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

  const raw = flattenSearchParams(await searchParams);
  const isNew = raw.id === "new";
  const selectedId = raw.id && /^\d+$/.test(raw.id) ? Number(raw.id) : null;

  const [register, allows, selectedRaw, lookup] = await Promise.all([
    orNotFound(getStakeholderMatrix(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    selectedId ? orNull(getStakeholderById(selectedId, session.userId)) : null,
    loadLookupLists(STAKEHOLDER_LISTS, session),
  ]);
  // A deep link to a stakeholder from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);
  const canEdit = allows("stakeholders:update");
  const canCreate = allows("stakeholders:create");

  return (
    <>
      <PageHeader
        title={messages.stakeholders.matrix.title}
        action={
          <Link
            href={`/projects/${projectId}/stakeholders`}
            data-testid="list-link"
            className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
          >
            {messages.stakeholders.matrix.listLink}
          </Link>
        }
      />
      <LookupListsScope {...lookup}>
        <div className="mt-3 pb-8">
          <StakeholderMatrix projectId={projectId} register={register} canEdit={canEdit} />
        </div>
        <StakeholderSheet
          stakeholder={selected}
          isNew={isNew && canCreate}
          projectId={projectId}
          canEdit={isNew ? canCreate : canEdit}
          canDelete={allows("stakeholders:delete")}
        />
      </LookupListsScope>
    </>
  );
}
