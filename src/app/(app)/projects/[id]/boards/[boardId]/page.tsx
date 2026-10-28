import { notFound } from "next/navigation";
import { BoardPage } from "@/modules/boards/components/board-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; boardId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id, boardId } = await params;
  const projectId = Number(id);
  if (!Number.isSafeInteger(projectId) || projectId < 1) notFound();
  return <BoardPage boardId={boardId} projectId={projectId} query={await searchParams} />;
}
