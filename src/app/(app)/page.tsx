import type { Metadata } from "next";
import { messages } from "@/lib/messages";
import { TodoScreen } from "./todo/todo-screen";

export const metadata: Metadata = {
  title: `${messages.home.title} — ${messages.app.name}`,
};

/** The dashboard: the person's to-do calendar across projects, and a new to-do from any day. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TodoScreen raw={await searchParams} calendarOnly />;
}
