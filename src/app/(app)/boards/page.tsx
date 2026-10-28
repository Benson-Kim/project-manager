import { auth } from "@/lib/auth/provider";
import { parseListParams } from "@/lib/list-params";
import { listProjectOptions } from "@/modules/projects/repository/projects";
import { listBoards } from "@/modules/boards/repository/boards";
import { BoardsList } from "@/modules/boards/components/boards-list";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const params = parseListParams(raw, {
    columns: ["Name", "ProjectName", "UpdatedAtUtc"],
    default: "Name",
  });
  const projects = await listProjectOptions(session.userId);
  const selected = Number(raw.project);
  const projectId = projects.some((p) => p.id === selected) ? selected : null;
  const rows = await listBoards(params, session.userId, projectId, undefined, {
    withoutProject: raw.project === "none",
  });
  return <BoardsList rows={rows} page={params.page} projects={projects} projectId={projectId} />;
}
