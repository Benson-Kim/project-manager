import type { Metadata } from "next";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, initialViewOf, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getListPreference } from "@/lib/repositories/view-preference";
import { NewNoteButton } from "@/modules/notes/components/new-note-button";
import { NotesView } from "@/modules/notes/components/notes-view";
import { listNotes } from "@/modules/notes/repository/notes";
import { filteredProjectId, parseProjectFilter } from "@/modules/projects/project-options";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { listProjectOptions } from "@/modules/projects/repository/projects";

export const metadata: Metadata = {
  title: `${messages.notes.title} — ${messages.app.name}`,
};

/**
 * Global notes page (top-level nav, /notes): every notebook the actor may read,
 * from their projects and from the project-less shared space (migration 038,
 * ADR-0035 amendment). `?project=<id>|none` narrows the list. New notebook goes
 * to the filtered project, or to the shared space when no project is filtered.
 */
export default async function GlobalNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const raw = await searchParams;
  const listParams = parseListParams(raw);

  const projectOptions = await listProjectOptions(session.userId);
  const projectFilter = parseProjectFilter(flattenSearchParams(raw).project, projectOptions);
  const targetProjectId = filteredProjectId(projectFilter);

  const [rows, preference, allows] = await Promise.all([
    listNotes(listParams, session.userId, targetProjectId, undefined, {
      withoutProject: projectFilter.kind === "none",
    }),
    getListPreference(session.userId, "notes").catch(() => null),
    getProjectPermissions(targetProjectId, session.userId),
  ]);

  const newNote = allows("notes:create") ? (
    <NewNoteButton projectId={targetProjectId} />
  ) : undefined;

  return (
    <>
      {/* The top bar shows the title; the page still needs its heading for assistive tech. */}
      <h1 className="sr-only">{messages.notes.title}</h1>
      {newNote ? <div className="flex justify-end pt-3">{newNote}</div> : null}
      <div className="mt-3 flex flex-col flex-1">
        <NotesView
          rows={rows}
          totalCount={rows[0]?.TotalCount ?? 0}
          page={listParams.page}
          initialView={initialViewOf(listParams.view, preference?.viewMode)}
          layout={preference?.layout}
          filtersActive={Boolean(listParams.q) || projectFilter.kind !== "all"}
          projectFilterOptions={projectOptions}
          emptyBody={messages.notes.emptyBodyAll}
          newItemAction={newNote}
        />
      </div>
    </>
  );
}
