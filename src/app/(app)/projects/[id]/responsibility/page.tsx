import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { listDecisionOptions } from "@/modules/decisions/repository/decisions";
import { listDeliverableOptions } from "@/modules/key-deliverables/repository/key-deliverables";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { ResponsibilityView } from "@/modules/stakeholders/components/responsibility-view";
import {
  listResponsibilityCells,
  listResponsibilityMatrices,
} from "@/modules/stakeholders/repository/responsibility";
import { listStakeholderOptions } from "@/modules/stakeholders/repository/stakeholder-options";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.responsibility.title} — ${messages.app.name}`,
};

export default async function ResponsibilityPage({
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

  const raw = (await searchParams).m;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);

  const [matrices, allows, stakeholders] = await Promise.all([
    orNotFound(listResponsibilityMatrices(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    orNotFound(listStakeholderOptions(projectId, session.userId)),
  ]);

  const selected = matrices.find((m) => m.id === requested) ?? matrices[0] ?? null;

  const [grid, rows] = selected
    ? await Promise.all([
        orNotFound(listResponsibilityCells({ projectId, matrixId: selected.id }, session.userId)),
        selected.rowKind === "WbsItem"
          ? orNotFound(listDeliverableOptions(projectId, session.userId))
          : orNotFound(listDecisionOptions(projectId, session.userId)),
      ])
    : [{ members: [], cells: [] }, []];

  return (
    <>
      <PageHeader title={messages.responsibility.title} />
      <ResponsibilityView
        key={selected?.id ?? 0}
        projectId={projectId}
        matrices={matrices}
        selected={selected}
        members={grid.members}
        cells={grid.cells}
        rows={rows}
        stakeholders={stakeholders}
        canCreate={allows("stakeholders:create")}
        canEdit={allows("stakeholders:update")}
        canDelete={allows("stakeholders:delete")}
      />
    </>
  );
}
