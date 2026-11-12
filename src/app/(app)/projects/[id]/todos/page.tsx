import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { messages } from "@/lib/messages";
import { parseProjectId } from "../project-id";
import { ProjectTodosScreen } from "./project-todos-screen";

export const metadata: Metadata = {
  title: `${messages.todoItems.title} — ${messages.app.name}`,
};

/**
 * To-do list (project-scoped section under /projects/[id]/todos, ADR-0018);
 * DataView + search + status/priority filters, or the calendar (?view=calendar).
 * Default sort: DueDate asc.
 */
export default async function TodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();
  return <ProjectTodosScreen projectId={projectId} raw={await searchParams} calendarOnly={false} />;
}
