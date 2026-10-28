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
  const list = parseListParams(await searchParams, {
    columns: ["Name", "ProjectName", "UpdatedAtUtc"],
    default: "Name",
  });
  const [rows, projects] = await Promise.all([
    orNotFound(listBoards(list, session.userId, id)),
    listProjectOptions(session.userId),
  ]);
  return <BoardsList rows={rows} page={list.page} projects={projects} projectId={id} />;
}
