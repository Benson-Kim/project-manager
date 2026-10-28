import { BOARD_SORT } from "@/modules/boards/schemas/board-rules";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { orNotFound } from "@/lib/row-access";
import { parseListParams } from "@/lib/list-params";
import { listBoards } from "@/modules/boards/repository/boards";
import { listProjectOptions } from "@/modules/projects/repository/projects";
import { BoardsList } from "@/modules/boards/components/boards-list";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const raw = await searchParams;
  const list = parseListParams(raw, BOARD_SORT);
  const [rows, projects] = await Promise.all([
    orNotFound(listBoards(list, session.userId, id)),
    listProjectOptions(session.userId),
  ]);
  const allows = await orNotFound(getProjectPermissions(id, session.userId));
  return (
    <BoardsList
      scoped
      allowCreate={allows("boards:create")}
      rows={rows}
      page={list.page}
      projects={projects}
      projectId={id}
    />
  );
}
