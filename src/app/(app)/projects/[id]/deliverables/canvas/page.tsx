import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { listDeliverableOptions } from "@/modules/key-deliverables/repository/key-deliverables";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import {
  defaultWbsFor,
  filterCanvases,
  parseWbsFilter,
  pickCanvas,
  wbsFilterParam,
} from "@/modules/requirements/canvas/canvas-filter";
import { CanvasInspector } from "@/modules/requirements/components/canvas/canvas-inspector";
import { CanvasPicker } from "@/modules/requirements/components/canvas/canvas-picker";
import { CanvasWorkspace } from "@/modules/requirements/components/canvas/canvas-workspace";
import { CanvasForm } from "@/modules/requirements/components/canvas/create-canvas-form";
import { newRequirementType } from "@/modules/requirements/components/register-model";
import { RequirementSheet } from "@/modules/requirements/components/requirement-sheet";
import {
  listCanvasItems,
  listCanvasLinks,
  listCanvases,
} from "@/modules/requirements/repository/canvases";
import {
  getRequirementById,
  listLinkRules,
  listRequirementLinks,
  listRequirementOptions,
} from "@/modules/requirements/repository/requirements";
import { parseProjectId } from "../../project-id";

export const metadata: Metadata = {
  title: `${messages.requirements.canvas.title} — ${messages.app.name}`,
};

/**
 * Requirement canvas (ADR-0061): ?canvas=<id> picks one. The id is only matched against
 * this project's own canvases, so another project's id falls back to the first canvas.
 * ?wbs=<id>|unfiled narrows the picker to one WBS item's canvases; a requested canvas still shows.
 * ?inspect=<requirementId> opens the inspector; another project's requirement opens nothing.
 * ?id=new opens the register's form, which warns when the text matches an item already here.
 */
export default async function RequirementCanvasPage({
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
  const [canvases, allows, deliverableOptions] = await Promise.all([
    orNotFound(listCanvases(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    orNotFound(listDeliverableOptions(projectId, session.userId)),
  ]);
  const filter = parseWbsFilter(raw.wbs);
  const listed = filterCanvases(canvases, filter);
  const canvas = pickCanvas(canvases, listed, raw.canvas);
  const inspectId = Number(raw.inspect);
  const inspecting = Number.isInteger(inspectId) && inspectId > 0;
  const canCreate = allows("requirements:create");
  const isNew = raw.id === "new";
  const [items, links, linkRules, inspectedRaw, inspectedLinks, linkOptions] = canvas
    ? await Promise.all([
        listCanvasItems(canvas.RequirementCanvasId, session.userId),
        listCanvasLinks(canvas.RequirementCanvasId, session.userId),
        listLinkRules(session.userId),
        inspecting ? orNull(getRequirementById(inspectId, session.userId)) : null,
        inspecting ? orNull(listRequirementLinks(inspectId, session.userId)) : null,
        inspecting || (isNew && canCreate)
          ? orNotFound(listRequirementOptions(projectId, session.userId))
          : [],
      ])
    : [[], [], [], null, null, []];
  const inspected = guardProjectScope(inspectedRaw, projectId);
  const canEdit = allows("requirements:update");
  const wbsParam = wbsFilterParam(filter);
  const canvasHref = (extra: Record<string, string> = {}) =>
    `/projects/${projectId}/deliverables/canvas?${new URLSearchParams({
      canvas: String(canvas?.RequirementCanvasId ?? ""),
      ...(wbsParam ? { wbs: wbsParam } : {}),
      ...extra,
    })}`;

  return (
    <>
      <PageHeader
        title={canvas?.Name ?? messages.requirements.canvas.title}
        action={
          canvases.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {canvas && canCreate ? (
                <Link
                  href={canvasHref({ id: "new" })}
                  data-testid="canvas-new-requirement"
                  className={buttonClass("secondary", "compact")}
                >
                  {messages.requirements.newRequirement}
                </Link>
              ) : null}
              <CanvasPicker
                projectId={projectId}
                listed={listed}
                current={canvas}
                filter={filter}
                deliverableOptions={deliverableOptions}
                can={{ create: canCreate, update: canEdit, delete: allows("requirements:delete") }}
              />
            </div>
          ) : undefined
        }
      />
      {canvas ? (
        <>
          <CanvasWorkspace
            key={canvas.RequirementCanvasId}
            canvasId={canvas.RequirementCanvasId}
            items={items}
            links={links}
            linkRules={linkRules}
            canEdit={canEdit}
            inspector={
              inspected && inspectedLinks ? (
                <CanvasInspector
                  key={inspected.RequirementId}
                  projectId={projectId}
                  closeHref={canvasHref()}
                  requirement={inspected}
                  links={inspectedLinks}
                  linkOptions={linkOptions}
                  linkRules={linkRules}
                  deliverableOptions={deliverableOptions}
                  canEdit={canEdit}
                />
              ) : undefined
            }
          />
          <RequirementSheet
            requirement={null}
            links={[]}
            isNew={isNew && canCreate}
            projectId={projectId}
            initialType={newRequirementType(null)}
            initialValidates={[]}
            initialParent={null}
            linkOptions={linkOptions}
            linkRules={linkRules}
            deliverableOptions={deliverableOptions}
            canEdit={isNew ? canCreate : canEdit}
            canDelete={false}
            matchAgainst={items}
          />
        </>
      ) : (
        <EmptyState
          title={
            canvases.length > 0
              ? messages.requirements.canvas.noneForWbs
              : messages.requirements.canvas.none
          }
          body={
            canCreate && canvases.length === 0 ? messages.requirements.canvas.noneBody : undefined
          }
          action={
            canCreate ? (
              <CanvasForm
                projectId={projectId}
                deliverableOptions={deliverableOptions}
                defaultWbsId={defaultWbsFor(filter)}
              />
            ) : undefined
          }
        />
      )}
    </>
  );
}
