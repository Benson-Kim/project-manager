"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input, Select } from "@/components/ui/form/inputs";
import { useUnsavedChangesGuard } from "@/components/ui/form/use-unsaved-changes-guard";
import { RichTextEditor } from "@/components/ui/rich-text/rich-text-editor";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import {
  createNoteSectionAction,
  createNoteTabAction,
  deleteNoteAction,
  deleteNoteSectionAction,
  deleteNoteTabAction,
  moveNoteTabAction,
  reorderNoteSectionsAction,
  reorderNoteTabsAction,
  ungroupNoteSectionsAction,
  updateNoteAction,
  updateNoteSectionAction,
  updateNoteTabAction,
} from "../actions";
import { groupPages, swapInOrder } from "../notebook-model";
import {
  NOTE_PAGES_MAX,
  NOTE_TITLE_MAX,
  type NoteRow,
  type NoteSectionRow,
  type NoteTabRow,
} from "../schemas/note";
import { MoveButtons, TabStrip } from "./note-tab-strip";

const M = messages.notes;

type Confirm = "page" | "note" | "tab" | "ungroup";

/**
 * The notebook workspace: rename/delete the notebook, its tabs when it has any
 * (ADR-0053: add, rename, move, delete, remove all), the pages of the open tab
 * (add, move, move to another tab, delete) and the editor for the open page with
 * an explicit Save. Unsaved page edits are guarded on navigation and on anything
 * that would replace the page form.
 */
export function NotebookWorkspace({
  note,
  sections,
  tabs,
  views,
  listHref,
  canCreate,
  canUpdate,
  canDelete,
}: {
  note: NoteRow;
  sections: NoteSectionRow[];
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
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [titleDirty, setTitleDirty] = useState(false);
  const [pageDirty, setPageDirty] = useState(false);
  const [afterDiscard, setAfterDiscard] = useState<(() => void) | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [renaming, setRenaming] = useState(false);
  const dirty = titleDirty || pageDirty;
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    function onBeforeNavigate(event: Event) {
      if (!dirty) return;
      event.preventDefault();
      const detail = (event as CustomEvent<{ resume?: unknown }>).detail;
      const resume = typeof detail?.resume === "function" ? (detail.resume as () => void) : null;
      setAfterDiscard(() => () => {
        setTitleDirty(false);
        resume?.();
      });
    }
    window.addEventListener("before-navigate", onBeforeNavigate);
    return () => window.removeEventListener("before-navigate", onBeforeNavigate);
  }, [dirty]);

  const groups = groupPages(sections, tabs);
  const group =
    groups.find((g) => g.section && g.section.NoteSectionId === activeSectionId) ?? groups[0];
  const section = group.section;
  const sectionIndex = section ? sections.indexOf(section) : -1;
  const pages = group.pages;
  const active = pages.find((page) => page.NoteTabId === activeId) ?? pages[0] ?? null;
  const activeIndex = active ? pages.indexOf(active) : -1;
  const lastOfTab = section !== null && pages.length <= 1;
  const full = tabs.length >= NOTE_PAGES_MAX;
  const tabOrder = sections.map((s) => ({ id: s.NoteSectionId, rowVer: s.RowVer }));

  /** Runs next now, or after the user agrees to discard the open page's edits. */
  const guard = (next: () => void) => {
    if (pageDirty) setAfterDiscard(() => next);
    else next();
  };

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

  const selectSection = (id: number) => {
    if (id === section?.NoteSectionId) return;
    guard(() => {
      setActiveSectionId(id);
      setActiveId(null);
    });
  };

  const selectPage = (id: number) => {
    if (id === active?.NoteTabId) return;
    guard(() => setActiveId(id));
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

  const addPage = () =>
    guard(() =>
      run(
        () =>
          createNoteTabAction({
            noteId: note.NoteId,
            title: M.newPageTitle(pages.length + 1),
            sectionId: section?.NoteSectionId,
          }),
        (page) => {
          setPageDirty(false);
          setActiveId(page.NoteTabId);
        },
      ),
    );

  const movePage = (offset: -1 | 1) => {
    if (!active) return;
    const order = swapInOrder(
      tabs.map((page) => ({ id: page.NoteTabId, rowVer: page.RowVer })),
      active.NoteTabId,
      pages[activeIndex + offset].NoteTabId,
    );
    run(
      () => reorderNoteTabsAction({ noteId: note.NoteId, order }),
      () => undefined,
    );
  };

  const movePageToTab = (sectionId: number) => {
    if (!active) return;
    run(
      () => moveNoteTabAction({ noteTabId: active.NoteTabId, sectionId, rowVer: active.RowVer }),
      () => {
        setActiveSectionId(sectionId);
        setActiveId(active.NoteTabId);
      },
    );
  };

  const removePage = () => {
    if (!active) return;
    run(
      () => deleteNoteTabAction({ noteTabId: active.NoteTabId, rowVer: active.RowVer }),
      () => {
        setPageDirty(false);
        setConfirm(null);
        setActiveId(pages[activeIndex + 1]?.NoteTabId ?? pages[activeIndex - 1]?.NoteTabId ?? null);
      },
    );
  };

  const addTab = () =>
    guard(() =>
      run(
        () =>
          createNoteSectionAction({
            noteId: note.NoteId,
            title: M.newTabTitle(sections.length + 1),
            pageTitle: M.firstPageTitle,
          }),
        (created) => {
          setPageDirty(false);
          setActiveSectionId(created.NoteSectionId);
          if (section || !active) setActiveId(created.FirstPageId);
        },
      ),
    );

  const moveTab = (offset: -1 | 1) => {
    if (!section) return;
    const order = swapInOrder(
      tabOrder,
      section.NoteSectionId,
      sections[sectionIndex + offset].NoteSectionId,
    );
    run(
      () => reorderNoteSectionsAction({ noteId: note.NoteId, order }),
      () => undefined,
    );
  };

  const renameTab = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!section) return;
    const title = String(new FormData(event.currentTarget).get("title") ?? "");
    run(
      () =>
        updateNoteSectionAction({
          sectionId: section.NoteSectionId,
          title,
          rowVer: section.RowVer,
        }),
      () => setRenaming(false),
      messages.feedback.saved,
    );
  };

  const removeTab = () => {
    if (!section) return;
    const next = sections[sectionIndex + 1] ?? sections[sectionIndex - 1] ?? null;
    run(
      () => deleteNoteSectionAction({ sectionId: section.NoteSectionId, rowVer: section.RowVer }),
      () => {
        setPageDirty(false);
        setConfirm(null);
        setActiveSectionId(next?.NoteSectionId ?? null);
        setActiveId(null);
      },
    );
  };

  const removeTabs = () =>
    run(
      () => ungroupNoteSectionsAction({ noteId: note.NoteId, order: tabOrder }),
      () => {
        setConfirm(null);
        setActiveSectionId(null);
      },
    );

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

  const addTabButton = canCreate ? (
    <Button
      type="button"
      variant="secondary"
      pending={pending}
      disabled={section !== null && full}
      className="min-h-11"
      onClick={addTab}
      data-testid="note-add-tab"
    >
      {M.addTab}
    </Button>
  ) : null;

  const pagesBody = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TabStrip
          level="page"
          label={M.pages}
          items={pages.map((page) => ({ id: page.NoteTabId, title: page.Title ?? M.page }))}
          activeId={active?.NoteTabId ?? null}
          onSelect={selectPage}
          idPrefix="note-tab-"
          panelPrefix="note-panel-"
          testId="note-tab"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canUpdate ? (
            <MoveButtons
              leftLabel={M.moveLeft}
              rightLabel={M.moveRight}
              canLeft={!pending && !pageDirty && activeIndex > 0}
              canRight={
                !pending && !pageDirty && activeIndex >= 0 && activeIndex < pages.length - 1
              }
              onMove={movePage}
              testId="note-page-move"
            />
          ) : null}
          {canUpdate && active && sections.length > 1 ? (
            <Select
              aria-label={M.moveToTab}
              title={lastOfTab ? M.lastPageOfTab : M.moveToTab}
              value=""
              disabled={pending || pageDirty || lastOfTab}
              onChange={(event) => movePageToTab(Number(event.target.value))}
              className="min-h-11 w-auto"
              data-testid="note-page-move-to-tab"
            >
              <option value="" disabled>
                {M.moveToTab}
              </option>
              {sections
                .filter((s) => s !== section)
                .map((s) => (
                  <option key={s.NoteSectionId} value={s.NoteSectionId}>
                    {s.Title}
                  </option>
                ))}
            </Select>
          ) : null}
          {canCreate ? (
            <Button
              type="button"
              variant="secondary"
              pending={pending}
              disabled={full}
              className="min-h-11"
              onClick={addPage}
              data-testid="note-add-page"
            >
              {M.addPage}
            </Button>
          ) : null}
          {section ? null : addTabButton}
        </div>
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
                    disabled={lastOfTab}
                    title={lastOfTab ? M.lastPageOfTab : undefined}
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
    </>
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

      {section ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line">
            <TabStrip
              level="section"
              label={M.tabs}
              items={sections.map((s) => ({ id: s.NoteSectionId, title: s.Title }))}
              activeId={section.NoteSectionId}
              onSelect={selectSection}
              idPrefix="note-section-"
              panelPrefix="note-section-panel-"
              testId="note-section"
            />
            <div className="ml-auto flex flex-wrap items-center gap-2 pb-1">
              {canUpdate ? (
                <>
                  <MoveButtons
                    leftLabel={M.moveTabLeft}
                    rightLabel={M.moveTabRight}
                    canLeft={!pending && sectionIndex > 0}
                    canRight={!pending && sectionIndex < sections.length - 1}
                    onMove={moveTab}
                    testId="note-section-move"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => setRenaming(true)}
                    data-testid="note-tab-rename"
                  >
                    {M.renameTab}
                  </Button>
                </>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={sections.length <= 1}
                  title={sections.length <= 1 ? M.lastTab : undefined}
                  onClick={() => setConfirm("tab")}
                  data-testid="note-tab-delete"
                >
                  {M.deleteTab}
                </Button>
              ) : null}
              {canUpdate ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={pending || pageDirty}
                  onClick={() => setConfirm("ungroup")}
                  data-testid="note-tabs-remove"
                >
                  {M.removeTabs}
                </Button>
              ) : null}
              {addTabButton}
            </div>
          </div>
          <div
            role="tabpanel"
            id={`note-section-panel-${section.NoteSectionId}`}
            aria-labelledby={`note-section-${section.NoteSectionId}`}
            className="flex flex-col gap-6"
          >
            {pagesBody}
          </div>
        </>
      ) : (
        pagesBody
      )}

      <Dialog open={renaming} onOpenChange={setRenaming} title={M.renameTab}>
        {section ? (
          <form
            key={`${section.NoteSectionId}-${section.RowVer}`}
            onSubmit={renameTab}
            className="flex flex-col gap-3"
          >
            <Field label={M.tabTitle} name="title">
              <Input
                name="title"
                required
                maxLength={NOTE_TITLE_MAX}
                defaultValue={section.Title}
                data-testid="note-tab-title"
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                pending={pending}
                className="min-h-11"
                data-testid="note-tab-save"
              >
                {M.saveTab}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

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
        open={confirm === "tab"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={M.deleteTab}
        body={M.deleteTabConfirm(section?.Title ?? M.tab, pages.length)}
        confirmLabel={messages.actions.delete}
        onConfirm={removeTab}
        pending={pending}
      />
      <ConfirmDialog
        open={confirm === "ungroup"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={M.removeTabs}
        body={M.removeTabsConfirm}
        confirmLabel={M.removeTabs}
        onConfirm={removeTabs}
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
        open={afterDiscard !== null}
        onOpenChange={(open) => !open && setAfterDiscard(null)}
        title={M.discardTitle}
        body={messages.feedback.unsavedChangesBody}
        confirmLabel={messages.feedback.discard}
        onConfirm={() => {
          const next = afterDiscard;
          setPageDirty(false);
          setAfterDiscard(null);
          next?.();
        }}
      />
    </div>
  );
}
