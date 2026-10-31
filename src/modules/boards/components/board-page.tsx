import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { orNotFound } from "@/lib/row-access";
import { getBoard, listBoardAssignees } from "@/modules/boards/repository/boards";
import { listProjectOptions } from "@/modules/projects/repository/projects";
import { LookupListsScope } from "@/modules/lookup-lists/components/lookup-lists-scope";
import { loadLookupLists } from "@/modules/lookup-lists/queries/load-lookup-lists";
import { BoardWorkspace } from "@/modules/boards/components/board-workspace";
export async function BoardPage({
  boardId,
  projectId,
  query,
}: {
  boardId: string;
  projectId?: number;
  query: Record<string, string | undefined>;
}) {
  const session = await auth.requireSession();
  const id = Number(boardId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const planning = query.view === "plan";
  const board = await orNotFound(
    getBoard(
      {
        boardId: id,
        view: planning ? "plan" : "board",
        cardsPerList: 200,
        search: query.q?.slice(0, 100),
      },
      session.userId,
    ),
  );
  if (projectId !== undefined && board.header.ProjectId !== projectId) notFound();
  const [assignees, projects, lookup] = await Promise.all([
    listBoardAssignees(id, session.userId),
    listProjectOptions(session.userId),
    loadLookupLists(["key-deliverable.priority"], session),
  ]);
  return (
    <LookupListsScope {...lookup}>
      <BoardWorkspace
        board={board}
        assignees={assignees}
        projects={projects}
        planning={planning}
        basePath={projectId ? `/projects/${projectId}/boards/${id}` : `/boards/${id}`}
      />
    </LookupListsScope>
  );
}
