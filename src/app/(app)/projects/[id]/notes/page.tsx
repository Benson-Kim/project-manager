import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { initialViewOf, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { orNotFound } from "@/lib/row-access";
import { NewNoteButton } from "@/modules/notes/components/new-note-button";
import { NotesView } from "@/modules/notes/components/notes-view";
import { listNotes } from "@/modules/notes/repository/notes";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { parseProjectId } from "../project-id";
import { NOTE_SORT } from "@/modules/notes/schemas/note";

export const metadata: Metadata = {
  title: `${messages.notes.title} — ${messages.app.name}`,
};

/** Notes list — /projects/[id]/notes: the project's notebooks; a title opens the workspace. */
export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const listParams = parseListParams(await searchParams, NOTE_SORT);

  const [rows, preference, allows] = await Promise.all([
    orNotFound(listNotes(listParams, session.userId, projectId)),
    getListPreference(session.userId, "notes").catch(() => null),
    getProjectPermissions(projectId, session.userId),
  ]);

  const newNote = allows("notes:create") ? <NewNoteButton projectId={projectId} /> : undefined;

  return (
    <>
      <PageHeader title={messages.notes.title} action={newNote} />
      <div className="mt-3 flex flex-col flex-1">
        <NotesView
          rows={rows}
          totalCount={rows[0]?.TotalCount ?? 0}
          page={listParams.page}
          initialView={initialViewOf(listParams.view, preference?.viewMode)}
          layout={preference?.layout}
          filtersActive={Boolean(listParams.q)}
          newItemAction={newNote}
        />
      </div>
    </>
  );
}
