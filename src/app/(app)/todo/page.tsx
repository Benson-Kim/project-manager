import type { Metadata } from "next";
import { messages } from "@/lib/messages";
import { TodoScreen } from "./todo-screen";

export const metadata: Metadata = {
  title: `${messages.todoItems.title} — ${messages.app.name}`,
};

/** Global to-do page (top-level nav, /todo): the person's to-dos across projects. */
export default async function GlobalTodoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TodoScreen raw={await searchParams} calendarOnly={false} />;
}
