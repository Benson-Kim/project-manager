import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, initialViewOf, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound } from "@/lib/row-access";
import { ChecklistForm } from "@/modules/checklists/components/checklist-form";
import { ChecklistView } from "@/modules/checklists/components/checklist-view";
import { listChecklists, listColumns, listItems } from "@/modules/checklists/repository/checklists";
import { CHECKLIST_ITEM_SORT } from "@/modules/checklists/schemas/checklist";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../project-id";

const M = messages.checklists;

export const metadata: Metadata = { title: `${M.title} — ${messages.app.name}` };

/**
 * Checklists (ADR-0066): ?checklist=<id> opens one. The id is only matched against this project's
 * own checklists, so another project's id falls back to the first checklist here.
 */
export default async function ChecklistsPage({
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
  const listParams = parseListParams(raw, CHECKLIST_ITEM_SORT);

  const [checklists, allows, preference] = await Promise.all([
    orNotFound(listChecklists(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
    getListPreference(session.userId, "checklists").catch(() => null),
  ]);
  const can = {
    create: allows("checklists:create"),
    update: allows("checklists:update"),
    delete: allows("checklists:delete"),
    makeTodo: allows("todo-items:create"),
  };
  const current =
    checklists.find((each) => String(each.ChecklistId) === flat.checklist) ?? checklists[0];

  if (!current) {
    return (
      <>
        <PageHeader title={M.title} />
        <EmptyState
          title={M.none}
          body={M.noneBody}
          action={
            can.create ? (
              <div className="sm:w-80">
                <ChecklistForm projectId={projectId} />
              </div>
            ) : undefined
          }
        />
      </>
    );
  }

  const [columns, rows] = await Promise.all([
    orNotFound(listColumns(current.ChecklistId, session.userId)),
    orNotFound(listItems(current.ChecklistId, listParams, session.userId)),
  ]);

  return (
    <>
      <PageHeader title={current.Name} />
      <div className="mt-3 flex flex-1 flex-col">
        <ChecklistView
          key={current.ChecklistId}
          projectId={projectId}
          checklist={current}
          checklists={checklists}
          columns={columns}
          rows={rows}
          totalCount={rows[0]?.TotalCount ?? 0}
          page={listParams.page}
          initialView={initialViewOf(listParams.view, preference?.viewMode)}
          layout={preference?.layout}
          filtersActive={Boolean(listParams.q)}
          can={can}
        />
      </div>
    </>
  );
}
