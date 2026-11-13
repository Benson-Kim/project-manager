import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { BpmnWorkspace } from "@/modules/bpmn/components/bpmn-workspace";
import { ListEditorHost } from "@/components/ui/form/list-select";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { DiagramForm } from "@/modules/bpmn/components/diagram-form";
import { getDiagram, listDiagrams } from "@/modules/bpmn/repository/diagrams";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../project-id";

const M = messages.bpmn;

export const metadata: Metadata = { title: `${M.title} — ${messages.app.name}` };

/**
 * BPMN diagrams (ADR-0064): ?diagram=<id> opens one. The id is only matched against this project's
 * own diagrams, so another project's id falls back to the first diagram here.
 */
export default async function BpmnPage({
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
  const [diagrams, allows, lookup] = await Promise.all([
    orNotFound(listDiagrams(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    loadLookupLists(["bpmn.step-status"], session),
  ]);
  const picked =
    diagrams.find((each) => String(each.BpmnDiagramId) === raw.diagram) ?? diagrams[0] ?? null;
  const row = picked
    ? guardProjectScope(await orNull(getDiagram(picked.BpmnDiagramId, session.userId)), projectId)
    : null;
  const can = {
    create: allows("bpmn:create"),
    update: allows("bpmn:update"),
    delete: allows("bpmn:delete"),
  };

  return (
    <>
      <PageHeader title={row?.Name ?? M.title} />
      {row ? (
        <LookupListsScope {...lookup}>
          <ListEditorHost>
            <BpmnWorkspace
              key={row.BpmnDiagramId}
              projectId={projectId}
              row={row}
              diagrams={diagrams}
              can={can}
            />
          </ListEditorHost>
        </LookupListsScope>
      ) : (
        <EmptyState
          title={M.none}
          body={can.create ? M.noneBody : undefined}
          action={
            can.create ? (
              <div className="sm:w-80">
                <DiagramForm projectId={projectId} />
              </div>
            ) : undefined
          }
        />
      )}
    </>
  );
}
