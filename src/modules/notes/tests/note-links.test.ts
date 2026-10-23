import { describe, expect, it } from "vitest";
import { NOTES_HREF, noteHref, notesListHref } from "../note-links";

describe("note links", () => {
  it("puts a project's notebooks under the project", () => {
    expect(notesListHref(2)).toBe("/projects/2/notes");
    expect(noteHref({ NoteId: 4, ProjectId: 2 })).toBe("/projects/2/notes/4");
  });

  it("puts project-less notebooks in the shared space at /notes", () => {
    expect(notesListHref(null)).toBe(NOTES_HREF);
    expect(noteHref({ NoteId: 4, ProjectId: null })).toBe("/notes/4");
  });
});
