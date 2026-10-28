import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/provider";
import { orNotFound } from "@/lib/row-access";
import { getBoardById } from "@/modules/boards/repository/boards";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const session = await auth.requireSession();
  const { id, boardId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(boardId) || !Number.isSafeInteger(Number(boardId)))
    notFound();
  const board = await orNotFound(getBoardById(Number(boardId), session.userId));
  if (board.ProjectId !== Number(id)) notFound();
  redirect(`/boards/${board.BoardId}`);
}
