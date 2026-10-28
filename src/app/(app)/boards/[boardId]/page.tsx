import { BoardPage } from "@/modules/boards/components/board-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <BoardPage boardId={(await params).boardId} query={await searchParams} />;
}
