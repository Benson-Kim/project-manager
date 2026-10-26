"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import {
  createNoteTabAction,
  deleteNoteAction,
  deleteNoteTabAction,
  reorderNoteTabsAction,
  updateNoteAction,
  updateNoteTabAction,
} from "../actions";
import { NOTE_PAGES_MAX, NOTE_TITLE_MAX, type NoteRow, type NoteTabRow } from "../schemas/note";

const M = messages.notes;

/** The page-move arrows beside the tab strip; the button carries the accessible name. */
function MoveArrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? (
        <path d="M10 3.5L5.5 8l4.5 4.5" />
      ) : (
        <path d="M6 3.5L10.5 8 6 12.5" />
      )}
    </svg>
  );
}

/**
 * The notebook workspace: rename/delete the notebook, an ARIA tablist of its
 * pages (add, move, delete) and the editor for the active page with an explicit
 * Save. Unsaved edits are guarded on navigation and on switching pages.
 */
export function NotebookWorkspace({
  note,
  tabs,
  views,
  listHref,
  canCreate,
  canUpdate,
  canDelete,
}: {
  note: NoteRow;
  tabs: NoteTabRow[];
  views: Record<number, React.ReactNode>;
  listHref: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<number | null>(tabs[0]?.NoteTabId ?? null);
  const [titleDirty, setTitleDirty] = useState(false);
  const [pageDirty, setPageDirty] = useState(false);
  const [switchTo, setSwitchTo] = useState<number | "new" | null>(null);
  const [confirm, setConfirm] = useState<"page" | "note" | null>(null);
  useUnsavedChangesGuard(titleDirty || pageDirty);

  const full = tabs.length >= NOTE_PAGES_MAX;
  const active = tabs.find((tab) => tab.NoteTabId === activeId) ?? tabs[0] ?? null;
  const activeIndex = active ? tabs.indexOf(active) : -1;

  const run = <T,>(
    call: () => Promise<ActionResult<T>>,
    onOk: (data: T) => void,
    okMessage?: string,
  ) =>
    startTransition(async () => {
      const result = await call();
      if (result.ok) {
        onOk(result.data);
        if (okMessage) toast({ variant: "success", title: okMessage });
        router.refresh();
      } else if (result.error.code === "UNAUTHENTICATED") {
        router.push("/login?reason=expired");
      } else {
        toast({ variant: "error", title: result.error.message });
        if (result.error.code === "CONFLICT" || result.error.code === "NOT_FOUND") router.refresh();
      }
    });

  const select = (id: number) => {
    if (active && id === active.NoteTabId) return;
    if (pageDirty) setSwitchTo(id);
    else setActiveId(id);
  };

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (activeIndex + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (activeIndex - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null || tabs.length === 0) return;
    event.preventDefault();
    const target = tabs[next];
    select(target.NoteTabId);
    document.getElementById(`note-tab-${target.NoteTabId}`)?.focus();
  };

  const saveTitle = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "");
    run(
      () => updateNoteAction({ noteId: note.NoteId, title, rowVer: note.RowVer }),
      () => setTitleDirty(false),
      messages.feedback.saved,
    );
  };

  const savePage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active) return;
    const data = new FormData(event.currentTarget);
    run(
      () =>
        updateNoteTabAction({
          noteTabId: active.NoteTabId,
          title: String(data.get("title") ?? ""),
          content: String(data.get("content") ?? ""),
          rowVer: active.RowVer,
        }),
      () => setPageDirty(false),
      messages.feedback.saved,
    );
  };

  const createPage = () =>
    run(
      () => createNoteTabAction({ noteId: note.NoteId, title: M.newPageTitle(tabs.length + 1) }),
      (tab) => {
        setPageDirty(false);
        setActiveId(tab.NoteTabId);
      },
    );

  const addPage = () => {
    if (pageDirty) setSwitchTo("new");
    else createPage();
  };

  const move = (offset: -1 | 1) => {
    const order = tabs.map((tab) => ({ id: tab.NoteTabId, rowVer: tab.RowVer }));
    const to = activeIndex + offset;
    [order[activeIndex], order[to]] = [order[to], order[activeIndex]];
    run(
      () => reorderNoteTabsAction({ noteId: note.NoteId, order }),
      () => undefined,
    );
  };

  const removePage = () => {
    if (!active) return;
    run(
      () => deleteNoteTabAction({ noteTabId: active.NoteTabId, rowVer: active.RowVer }),
      () => {
        setPageDirty(false);
        setConfirm(null);
        setActiveId(tabs[activeIndex + 1]?.NoteTabId ?? tabs[activeIndex - 1]?.NoteTabId ?? null);
      },
    );
  };

  const removeNote = () =>
    run(
      () => deleteNoteAction({ noteId: note.NoteId, rowVer: note.RowVer }),
      () => {
        setTitleDirty(false);
        setPageDirty(false);
        setConfirm(null);
        router.push(listHref);
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <form
        key={note.RowVer}
        onSubmit={saveTitle}
        onInput={() => setTitleDirty(true)}
        aria-label={M.notebookTitle}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-0 flex-1">
          <Field label={M.notebookTitle} name="title">
            <Input
              name="title"
              maxLength={NOTE_TITLE_MAX}
              defaultValue={note.Title ?? ""}
              readOnly={!canUpdate}
              data-testid="note-title"
            />
          </Field>
        </div>
        {canUpdate ? (
          <Button
            type="submit"
            pending={pending}
            className="min-h-11"
            data-testid="note-title-save"
          >
            {M.saveTitle}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="danger"
            className="min-h-11"
            onClick={() => setConfirm("note")}
            data-testid="note-delete"
          >
            {M.deleteNote}
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={M.pages}
          onKeyDown={onTabKeyDown}
          className="flex min-w-0 flex-wrap gap-1"
        >
          {tabs.map((tab) => {
            const selected = tab.NoteTabId === active?.NoteTabId;
            return (
              <button
                key={tab.NoteTabId}
                type="button"
                role="tab"
                id={`note-tab-${tab.NoteTabId}`}
                aria-selected={selected}
                aria-controls={`note-panel-${tab.NoteTabId}`}
                tabIndex={selected ? 0 : -1}
                data-testid="note-tab"
                onClick={() => select(tab.NoteTabId)}
                className={`min-h-11 max-w-48 truncate rounded-md border px-3 text-sm font-medium ${
                  selected
                    ? "border-accent bg-surface-raised text-ink"
                    : "border-line bg-surface text-ink-muted hover:bg-surface-raised"
                }`}
              >
                {tab.Title ?? M.page}
              </button>
            );
          })}
        </div>
        {/*
          The page moves sit beside the tabs they reorder, as two arrows rather
          than two worded buttons at the far end of the editor (client feedback
          2026-10-26). The name stays on aria-label, so the arrow is still
          announced as "Move page left".
        */}
        {canUpdate ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="secondary"
              aria-label={M.moveLeft}
              title={M.moveLeft}
              className="min-h-11 px-3"
              disabled={pending || pageDirty || activeIndex <= 0}
              onClick={() => move(-1)}
              data-testid="note-page-move-left"
            >
              <MoveArrow direction="left" />
            </Button>
            <Button
              variant="secondary"
              aria-label={M.moveRight}
              title={M.moveRight}
              className="min-h-11 px-3"
              disabled={pending || pageDirty || activeIndex === tabs.length - 1}
              onClick={() => move(1)}
              data-testid="note-page-move-right"
            >
              <MoveArrow direction="right" />
            </Button>
          </div>
        ) : null}
        {canCreate ? (
          <Button
            type="button"
            variant="secondary"
            pending={pending}
            disabled={full}
            className={`min-h-11 ${canUpdate ? "" : "ml-auto"}`}
            onClick={addPage}
            data-testid="note-add-page"
          >
            {M.addPage}
          </Button>
        ) : null}
        {canCreate && full ? (
          <p className="text-sm text-ink-muted">{M.pageLimit(NOTE_PAGES_MAX)}</p>
        ) : null}
      </div>

      {active ? (
        <div
          role="tabpanel"
          id={`note-panel-${active.NoteTabId}`}
          aria-labelledby={`note-tab-${active.NoteTabId}`}
          className="flex flex-col gap-3"
        >
          {canUpdate ? (
            <form
              key={`${active.NoteTabId}-${active.RowVer}`}
              onSubmit={savePage}
              onInput={() => setPageDirty(true)}
              aria-label={M.page}
              className="flex flex-col gap-3"
            >
              <Field label={M.pageTitle} name="title">
                <Input
                  name="title"
                  maxLength={NOTE_TITLE_MAX}
                  defaultValue={active.Title ?? ""}
                  data-testid="note-page-title"
                />
              </Field>
              <Field label={M.page} name="content">
                <RichTextEditor
                  name="content"
                  defaultValue={active.Content}
                  onChange={() => setPageDirty(true)}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  pending={pending}
                  className="min-h-11"
                  data-testid="note-page-save"
                >
                  {M.savePage}
                </Button>
                {canDelete ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="min-h-11"
                    onClick={() => setConfirm("page")}
                    data-testid="note-page-delete"
                  >
                    {M.deletePage}
                  </Button>
                ) : null}
              </div>
            </form>
          ) : (
            <>
              <h2 className="text-base font-medium text-ink">{active.Title ?? M.page}</h2>
              {views[active.NoteTabId]}
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{M.noPages}</p>
      )}

      <ConfirmDialog
        open={confirm === "page"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={M.deletePage}
        body={M.deletePageConfirm(active?.Title ?? M.page)}
        confirmLabel={messages.actions.delete}
        onConfirm={removePage}
        pending={pending}
      />
      <ConfirmDialog
        open={confirm === "note"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={M.deleteNote}
        body={M.deleteNoteConfirm}
        confirmLabel={messages.actions.delete}
        onConfirm={removeNote}
        pending={pending}
      />
      <ConfirmDialog
        open={switchTo !== null}
        onOpenChange={(open) => !open && setSwitchTo(null)}
        title={M.discardTitle}
        body={messages.feedback.unsavedChangesBody}
        confirmLabel={messages.feedback.discard}
        onConfirm={() => {
          setPageDirty(false);
          setSwitchTo(null);
          if (switchTo === "new") createPage();
          else setActiveId(switchTo);
        }}
      />
    </div>
  );
}
