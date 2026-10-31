import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { messages } from "@/lib/messages";
import type { ProjectPermissions } from "@/modules/projects/repository/project-access";
import { notePrintHref, notesListHref } from "../note-links";
import type { NoteWorkspace } from "../schemas/note";
import { NotebookWorkspace } from "./notebook-workspace";

/**
 * The body of both notebook routes (/projects/[id]/notes/[noteId] and
 * /notes/[noteId]): the way back to its list, the title, the print link and the
 * workspace.
 * `allows` is bound to the notebook's project, or to the shared space.
 * Readers without update get the pages rendered on the server.
 */
export function NotebookPage({
  workspace,
  allows,
}: {
  workspace: NoteWorkspace;
  allows: ProjectPermissions;
}) {
  const { note, sections, tabs } = workspace;
  const listHref = notesListHref(note.ProjectId);
  const canUpdate = allows("notes:update");
  const views = canUpdate
    ? {}
    : Object.fromEntries(
        tabs.map((tab) => [tab.NoteTabId, <RichTextView key={tab.NoteTabId} html={tab.Content} />]),
      );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href={listHref}
        data-testid="notes-back"
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
      >
        {messages.notes.backToList}
      </Link>
      <PageHeader
        title={note.Title ?? messages.notes.untitled}
        action={
          <Link
            href={notePrintHref(note)}
            data-testid="note-print-link"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
          >
            {messages.notes.print}
          </Link>
        }
      />
      <NotebookWorkspace
        note={note}
        sections={sections}
        tabs={tabs}
        views={views}
        listHref={listHref}
        canCreate={allows("notes:create")}
        canUpdate={canUpdate}
        canDelete={allows("notes:delete")}
      />
    </div>
  );
}
