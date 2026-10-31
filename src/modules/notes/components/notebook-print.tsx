import Link from "next/link";
import { PrintButton } from "@/components/ui/print-button";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { messages } from "@/lib/messages";
import { noteHref } from "../note-links";
import { groupPages } from "../notebook-model";
import type { NoteWorkspace } from "../schemas/note";

const M = messages.notes;

/*
 * Portrait A4 as a named page, so the Gantt keeps its landscape @page. Each tab
 * starts on a new sheet; a heading never ends a sheet. A page's own headings
 * sit a step below its title, so the notebook, tab, page order reads at a glance.
 */
const PRINT_CSS = `
@page notes { size: A4 portrait; margin: 15mm 12mm; }
[data-print-page="notes"] .rich-text h2 { font-size: 1.125rem; }
[data-print-page="notes"] .rich-text h3 { font-size: 1rem; }
[data-print-page="notes"] .rich-text h4 { font-size: 0.9375rem; }
@media print {
  [data-print-page="notes"] { page: notes; }
  [data-print-page="notes"] :is(h1, h2, h3) { break-after: avoid; }
  [data-print-page="notes"] [data-print-tab] + [data-print-tab] { break-before: page; }
}
`;

/**
 * A notebook on paper, for both print routes: its title, then each tab's name
 * and pages (ADR-0053), or just the pages when it has no tabs. It renders on
 * paper on screen too, so what you see is what prints; the button is
 * window.print over the same stylesheet, in the browser and the desktop app.
 */
export function NotebookPrint({ workspace }: { workspace: NoteWorkspace }) {
  const { note, sections, tabs } = workspace;
  const PageHeading = sections.length > 0 ? "h3" : "h2";

  return (
    <main
      data-print-page="notes"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-ink sm:px-6 print:max-w-none print:p-0"
    >
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={noteHref(note)}
          data-testid="note-print-back"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
        >
          {M.backToNotebook}
        </Link>
        <PrintButton label={M.printNow} testId="note-print" />
      </div>

      <article className="flex flex-col gap-8" data-testid="printed-note">
        <h1 className="text-3xl font-semibold wrap-anywhere">{note.Title ?? M.untitled}</h1>
        {tabs.length === 0 ? (
          <p className="text-sm text-ink-muted">{M.noPages}</p>
        ) : (
          groupPages(sections, tabs).map(({ section, pages }) => (
            <section
              key={section?.NoteSectionId ?? 0}
              data-print-tab=""
              data-testid="print-note-tab"
              className="flex flex-col gap-6"
            >
              {section ? (
                <h2 className="border-b border-line pb-1 text-2xl font-semibold wrap-anywhere">
                  {section.Title}
                </h2>
              ) : null}
              {pages.map((page) => (
                <section
                  key={page.NoteTabId}
                  data-testid="print-note-page"
                  className="flex flex-col gap-2"
                >
                  <PageHeading className="text-xl font-semibold wrap-anywhere">
                    {page.Title ?? M.page}
                  </PageHeading>
                  <RichTextView html={page.Content} />
                </section>
              ))}
            </section>
          ))
        )}
      </article>
    </main>
  );
}
