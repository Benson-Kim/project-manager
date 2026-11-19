import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { guardProjectScope } from "@/lib/project-page-helpers";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { WhiteboardForm } from "@/modules/whiteboard/components/whiteboard-form";
import { WhiteboardWorkspace } from "@/modules/whiteboard/components/whiteboard-workspace";
import { getWhiteboard, listWhiteboards } from "@/modules/whiteboard/repository/whiteboards";
import { parseProjectId } from "../project-id";

const M = messages.whiteboard;

export const metadata: Metadata = { title: `${M.title} — ${messages.app.name}` };

/**
 * ?board=<id> opens one whiteboard. The id is only matched against this project's own boards, so
 * another project's id falls back to the first board here.
 */
export default async function WhiteboardPage({
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
  const [boards, allows] = await Promise.all([
    orNotFound(listWhiteboards(projectId, session.userId)),
    getProjectPermissions(projectId, session.userId),
  ]);
  const picked =
    boards.find((each) => String(each.WhiteboardId) === raw.board) ?? boards[0] ?? null;
  const row = picked
    ? guardProjectScope(await orNull(getWhiteboard(picked.WhiteboardId, session.userId)), projectId)
    : null;
  const can = {
    create: allows("whiteboard:create"),
    update: allows("whiteboard:update"),
    delete: allows("whiteboard:delete"),
  };

  return (
    <>
      <PageHeader title={row?.Name ?? M.title} />
      {row ? (
        <WhiteboardWorkspace
          key={row.WhiteboardId}
          projectId={projectId}
          row={row}
          boards={boards}
          can={can}
        />
      ) : (
        <EmptyState
          title={M.none}
          body={can.create ? M.noneBody : undefined}
          action={
            can.create ? (
              <div className="sm:w-80">
                <WhiteboardForm projectId={projectId} />
              </div>
            ) : undefined
          }
        />
      )}
    </>
  );
}
