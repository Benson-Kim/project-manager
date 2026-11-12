import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { messages } from "@/lib/messages";
import { parseProjectId } from "../project-id";
import { ProjectTodosScreen } from "../todos/project-todos-screen";

export const metadata: Metadata = {
  title: `${messages.projects.calendarSection} — ${messages.app.name}`,
};

/** The project's calendar section: its to-dos by month, and a new to-do from any day. */
export default async function ProjectCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();
  return <ProjectTodosScreen projectId={projectId} raw={await searchParams} calendarOnly />;
}
