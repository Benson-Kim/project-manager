"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu } from "@/components/ui/context-menu";
import { MenuButton } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { notifySaved, onOtherWindowSaved } from "@/lib/cross-window";
import { messages } from "@/lib/messages";
import {
  createCrossLinkAction,
  createPageNoteAction,
  deleteCrossLinkAction,
  deletePageNoteAction,
  listLocationStickiesAction,
  updateCrossLinkAction,
  updatePageNoteAction,
} from "../actions";
import type { CrossLinkItem, EndpointWithLabel } from "../schemas/cross-link";
import {
  isSameEndpoint,
  isWorkspaceScopedModule,
  locationScopeKey,
  normalizeAnchorKey,
  parseLocationFromHref,
  type StickyColor,
} from "../schemas/location";
import type { PageNoteItem } from "../schemas/page-note";
import {
  clearElectronContextMenuHint,
  hasNonEmptySelection,
  isEditableElement,
  readPageEntityFromDom,
  resolveEndpointFromTarget,
  resolveFallbackPageLabel,
  writeElectronContextMenuHint,
} from "./anchor-capture";
import { consumeCrossLinkReturnHop } from "./anchor-slot";
import { CrossLinkMenuContext } from "./context-menu-bridge";
import { CrossLinkDialog } from "./cross-link-dialog";
import { PageNoteDialog } from "./page-note-dialog";
import { PageStickiesStrip } from "./page-stickies-strip";
import {
  clearPendingCrossLink,
  readPendingCrossLink,
  setPendingCrossLink,
  subscribePendingCrossLink,
  type PendingCrossLinkSource,
} from "./pending-link-storage";
import { PendingPortalDock } from "./pending-portal-dock";

type DesktopContextBridge = {
  onAddPageNote?: (listener: () => void) => () => void;
  onAddCrossLink?: (listener: () => void) => () => void;
  onCompleteCrossLink?: (listener: () => void) => () => void;
};

type DesktopWindow = Window & { desktop?: DesktopContextBridge };

function hasDesktopBridge(): boolean {
  return typeof window !== "undefined" && Boolean((window as DesktopWindow).desktop);
}

type NoteDialogState =
  { mode: "create"; endpoint: EndpointWithLabel } | { mode: "edit"; note: PageNoteItem } | null;

type LinkDialogState =
  | { mode: "create"; endA: PendingCrossLinkSource; endB: EndpointWithLabel }
  | { mode: "edit"; link: CrossLinkItem }
  | null;

type DeleteConfirmState =
  { kind: "link"; link: CrossLinkItem } | { kind: "note"; note: PageNoteItem } | null;

function SearchStringReporter({ onChange }: { onChange: (value: string) => void }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    onChange(search);
  }, [onChange, search]);

  return null;
}

function CrossLinkContextHostInner({
  currentUserId,
  children,
}: {
  currentUserId: number | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);
  const lastCaptureRef = useRef<{ endpoint: EndpointWithLabel | null; atMs: number }>({
    endpoint: null,
    atMs: 0,
  });

  const [pageDomState, setPageDomState] = useState<{
    entityId: number | null;
    label: string | null;
    fallbackLabel: string;
  }>({ entityId: null, label: null, fallbackLabel: "Current page" });
  const [mountedAnchorKeys, setMountedAnchorKeys] = useState<Set<string>>(() => new Set());
  const [links, setLinks] = useState<CrossLinkItem[]>([]);
  const [notes, setNotes] = useState<PageNoteItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [pendingSource, setPendingSource] = useState<PendingCrossLinkSource | null>(null);
  const [webMenu, setWebMenu] = useState<{
    at: { x: number; y: number };
    endpoint: EndpointWithLabel;
  } | null>(null);
  const [noteDialog, setNoteDialog] = useState<NoteDialogState>(null);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [arrivalReturn, setArrivalReturn] = useState<{
    returnHref: string;
    returnLabel: string;
  } | null>(null);

  const location = useMemo(
    () => parseLocationFromHref(pathname, search, pageDomState.entityId),
    [pathname, search, pageDomState.entityId],
  );
  const queryEntityId =
    location && isWorkspaceScopedModule(location.moduleKey) ? location.entityId : null;
  const scopeKey = useMemo(
    () =>
      location
        ? locationScopeKey({
            moduleKey: location.moduleKey,
            projectId: location.projectId,
            entityId: queryEntityId,
          })
        : null,
    [location, queryEntityId],
  );

  const currentPageEndpoint = useMemo<EndpointWithLabel | null>(
    () =>
      location
        ? {
            ...location,
            label: pageDomState.fallbackLabel,
          }
        : null,
    [location, pageDomState.fallbackLabel],
  );

  const syncDomTracking = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const domPage = readPageEntityFromDom(root);
    const fallbackLabel = resolveFallbackPageLabel(root, domPage.label);
    setPageDomState((prev) =>
      prev.entityId === domPage.entityId &&
      prev.label === domPage.label &&
      prev.fallbackLabel === fallbackLabel
        ? prev
        : { entityId: domPage.entityId, label: domPage.label, fallbackLabel },
    );
    const nextSlots = new Set<string>();
    const slotEls = root.querySelectorAll<HTMLElement>("[data-cl-slot-key]");
    for (const el of slotEls) {
      const k = normalizeAnchorKey(el.dataset.clSlotKey);
      if (k) nextSlots.add(k);
    }
    setMountedAnchorKeys((prev) => {
      if (prev.size === nextSlots.size && [...prev].every((k) => nextSlots.has(k))) return prev;
      return nextSlots;
    });
  }, []);

  useEffect(() => {
    const id = window.setTimeout(syncDomTracking, 0);
    const root = containerRef.current;
    if (!root || typeof MutationObserver === "undefined") {
      return () => window.clearTimeout(id);
    }
    const observer = new MutationObserver(() => syncDomTracking());
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-cl-slot-key", "data-cl-page-entity", "data-cl-page-label"],
    });
    return () => {
      window.clearTimeout(id);
      observer.disconnect();
    };
  }, [pathname, search, syncDomTracking]);

  // Sync pending cross-link dock across windows + sessionStorage cleanly via async task.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setPendingSource(readPendingCrossLink());
    });
    const stop = subscribePendingCrossLink((next) => {
      if (active) setPendingSource(next);
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  const loadSeqRef = useRef(0);
  const loadLocationStickies = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    if (!location) {
      setLinks([]);
      setNotes([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listLocationStickiesAction({
        moduleKey: location.moduleKey,
        projectId: location.projectId,
        entityId: queryEntityId,
      });
      if (seq !== loadSeqRef.current) return;
      if (res.ok) {
        setLinks(res.data.links);
        setNotes(res.data.notes);
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [location, queryEntityId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLinks([]);
      setNotes([]);
      await loadLocationStickies();
    });
    return () => {
      active = false;
    };
  }, [scopeKey, loadLocationStickies]);

  useEffect(() => onOtherWindowSaved(() => void loadLocationStickies()), [loadLocationStickies]);

  // Arrival return-link banner + scroll & focus highlight for #cl-... hashes.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setArrivalReturn(consumeCrossLinkReturnHop(pathname));
    });
    return () => {
      active = false;
    };
  }, [pathname, search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#cl-")) return;
    const anchorKey = normalizeAnchorKey(hash.slice(4));
    if (!anchorKey) return;
    const root = containerRef.current;
    if (!root) return;

    const target =
      document.getElementById(`cl-${anchorKey}`) ??
      root.querySelector<HTMLElement>(`[data-cl-anchor-key="${CSS.escape(anchorKey)}"]`) ??
      root.querySelector<HTMLElement>(`[data-cl-slot-key="${CSS.escape(anchorKey)}"]`);
    if (!target) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    target.setAttribute("data-cl-highlighted", "true");
    const timer = window.setTimeout(() => {
      target.removeAttribute("data-cl-highlighted");
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [pathname, search, links.length]);

  const openAddPageNote = useCallback(
    (explicit?: EndpointWithLabel | null) => {
      const ep = explicit ?? currentPageEndpoint;
      if (!ep) return;
      setDialogError(null);
      setNoteDialog({ mode: "create", endpoint: ep });
    },
    [currentPageEndpoint],
  );

  const startCrossLink = useCallback(
    (explicit?: EndpointWithLabel | null) => {
      const ep = explicit ?? currentPageEndpoint;
      if (!ep) return;
      const saved = setPendingCrossLink(ep);
      setPendingSource(saved);
    },
    [currentPageEndpoint],
  );

  const completeCrossLink = useCallback(
    (explicit?: EndpointWithLabel | null) => {
      const source = readPendingCrossLink() ?? pendingSource;
      const target = explicit ?? currentPageEndpoint;
      if (!source) {
        toast({ variant: "info", title: messages.crossLinks.pendingExpired });
        return;
      }
      if (!target) return;
      if (isSameEndpoint(source, target)) {
        toast({ variant: "warning", title: messages.crossLinks.selfLinkError });
        return;
      }
      setDialogError(null);
      setLinkDialog({ mode: "create", endA: source, endB: target });
    },
    [pendingSource, currentPageEndpoint, toast],
  );

  const cancelPendingCrossLink = useCallback(() => {
    clearPendingCrossLink();
    setPendingSource(null);
  }, []);

  // Keep dataset.pmContextMenu up to date for Electron's native menu handler.
  useEffect(() => {
    writeElectronContextMenuHint({
      location,
      endpoint: currentPageEndpoint,
      pending: pendingSource,
    });
    return () => clearElectronContextMenuHint();
  }, [location, currentPageEndpoint, pendingSource]);

  // Electron IPC listeners from context menu.
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? (window as DesktopWindow).desktop : undefined;
    if (!bridge) return;
    const recentCaptured = () => {
      const c = lastCaptureRef.current;
      return Date.now() - c.atMs < 30_000 ? c.endpoint : null;
    };
    const stops = [
      bridge.onAddPageNote?.(() => openAddPageNote(recentCaptured())),
      bridge.onAddCrossLink?.(() => startCrossLink(recentCaptured())),
      bridge.onCompleteCrossLink?.(() => completeCrossLink(recentCaptured())),
    ];
    return () => {
      for (const stop of stops) stop?.();
    };
  }, [openAddPageNote, startCrossLink, completeCrossLink]);

  function handleContextMenuCapture(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("nav, header")) {
      lastCaptureRef.current = { endpoint: null, atMs: Date.now() };
      clearElectronContextMenuHint();
      return;
    }
    const endpoint = resolveEndpointFromTarget(
      event.target,
      pathname,
      search,
      containerRef.current,
    );
    lastCaptureRef.current = { endpoint, atMs: Date.now() };
    writeElectronContextMenuHint({
      location,
      endpoint,
      pending: readPendingCrossLink() ?? pendingSource,
    });
  }

  function handleContextMenuBubble(event: React.MouseEvent<HTMLDivElement>) {
    if (hasDesktopBridge()) return;
    if (event.defaultPrevented || event.shiftKey) return;
    if (isEditableElement(event.target) || hasNonEmptySelection()) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el?.closest("nav, header, a[href]")) return;

    const endpoint = resolveEndpointFromTarget(
      event.target,
      pathname,
      search,
      containerRef.current,
    );
    if (!endpoint) return;
    event.preventDefault();
    setWebMenu({ at: { x: event.clientX, y: event.clientY }, endpoint });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (hasDesktopBridge()) return;
    const isMenuKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!isMenuKey || event.defaultPrevented) return;
    if (isEditableElement(event.target)) return;
    const targetEl =
      document.activeElement instanceof Element ? document.activeElement : containerRef.current;
    if (targetEl?.closest("nav, header")) return;
    const endpoint = resolveEndpointFromTarget(targetEl, pathname, search, containerRef.current);
    if (!endpoint) return;
    event.preventDefault();
    const rect = targetEl?.getBoundingClientRect();
    setWebMenu({
      at: rect
        ? { x: Math.round(rect.left + Math.min(48, rect.width / 2)), y: Math.round(rect.bottom) }
        : { x: 48, y: 96 },
      endpoint,
    });
  }

  async function handlePageNoteSubmit(data: { body: string; color: StickyColor }) {
    if (!noteDialog) return;
    setMutationPending(true);
    setDialogError(null);
    try {
      const res =
        noteDialog.mode === "create"
          ? await createPageNoteAction({
              ...noteDialog.endpoint,
              anchorLabel: noteDialog.endpoint.label,
              body: data.body,
              color: data.color,
            })
          : await updatePageNoteAction({
              pageNoteId: noteDialog.note.pageNoteId,
              body: data.body,
              color: data.color,
              rowVer: noteDialog.note.rowVer,
            });
      if (!res.ok) {
        setDialogError(res.error.message);
        return;
      }
      setNoteDialog(null);
      notifySaved();
      toast({ variant: "success", title: messages.crossLinks.savedNoteToast });
      await loadLocationStickies();
    } finally {
      setMutationPending(false);
    }
  }

  async function handleCrossLinkSubmit(data: {
    linkTitle: string;
    noteText: string | null;
    color: StickyColor;
  }) {
    if (!linkDialog) return;
    setMutationPending(true);
    setDialogError(null);
    try {
      const res =
        linkDialog.mode === "create"
          ? await createCrossLinkAction({
              endA: linkDialog.endA,
              endB: linkDialog.endB,
              linkTitle: data.linkTitle,
              noteText: data.noteText,
              color: data.color,
            })
          : await updateCrossLinkAction({
              crossLinkId: linkDialog.link.crossLinkId,
              linkTitle: data.linkTitle,
              noteText: data.noteText,
              color: data.color,
              rowVer: linkDialog.link.rowVer,
            });
      if (!res.ok) {
        setDialogError(res.error.message);
        return;
      }
      if (linkDialog.mode === "create") {
        clearPendingCrossLink();
        setPendingSource(null);
      }
      setLinkDialog(null);
      notifySaved();
      toast({ variant: "success", title: messages.crossLinks.savedLinkToast });
      await loadLocationStickies();
    } finally {
      setMutationPending(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteConfirm) return;
    setMutationPending(true);
    try {
      const res =
        deleteConfirm.kind === "link"
          ? await deleteCrossLinkAction({
              crossLinkId: deleteConfirm.link.crossLinkId,
              rowVer: deleteConfirm.link.rowVer,
            })
          : await deletePageNoteAction({
              pageNoteId: deleteConfirm.note.pageNoteId,
              rowVer: deleteConfirm.note.rowVer,
            });
      if (!res.ok) {
        toast({
          variant: "error",
          title: res.error.message || messages.crossLinks.saveFailedToast,
        });
        return;
      }
      const deletedKind = deleteConfirm.kind;
      setDeleteConfirm(null);
      setNoteDialog(null);
      setLinkDialog(null);
      notifySaved();
      toast({
        variant: "success",
        title:
          deletedKind === "link"
            ? messages.crossLinks.deletedLinkToast
            : messages.crossLinks.deletedNoteToast,
      });
      await loadLocationStickies();
    } finally {
      setMutationPending(false);
    }
  }

  const contextValue = useMemo(
    () => ({
      location,
      pageLabel: pageDomState.fallbackLabel,
      pendingSource,
      links,
      notes,
      loading,
      currentUserId,
      openAddPageNote,
      startCrossLink,
      completeCrossLink,
      cancelPendingCrossLink,
      openEditCrossLink: (link: CrossLinkItem) => {
        setDialogError(null);
        setLinkDialog({ mode: "edit", link });
      },
      openDeleteCrossLink: (link: CrossLinkItem) => setDeleteConfirm({ kind: "link", link }),
      openEditPageNote: (note: PageNoteItem) => {
        setDialogError(null);
        setNoteDialog({ mode: "edit", note });
      },
      openDeletePageNote: (note: PageNoteItem) => setDeleteConfirm({ kind: "note", note }),
      refresh: () => void loadLocationStickies(),
    }),
    [
      location,
      pageDomState.fallbackLabel,
      pendingSource,
      links,
      notes,
      loading,
      currentUserId,
      openAddPageNote,
      startCrossLink,
      completeCrossLink,
      cancelPendingCrossLink,
      loadLocationStickies,
    ],
  );

  const canCompleteInWebMenu =
    Boolean(webMenu) &&
    Boolean(pendingSource) &&
    Boolean(webMenu && pendingSource && !isSameEndpoint(pendingSource, webMenu.endpoint));

  return (
    <CrossLinkMenuContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <SearchStringReporter onChange={setSearch} />
      </Suspense>
      <div
        ref={containerRef}
        onContextMenuCapture={handleContextMenuCapture}
        onContextMenu={handleContextMenuBubble}
        onKeyDown={handleKeyDown}
        className="flex flex-1 flex-col"
      >
        <PageStickiesStrip
          mountedAnchorKeys={mountedAnchorKeys}
          arrivalReturn={arrivalReturn}
          onDismissArrivalReturn={() => setArrivalReturn(null)}
        />
        {children}
      </div>

      {webMenu ? (
        <ContextMenu
          at={webMenu.at}
          label={messages.crossLinks.sectionTitle}
          onClose={() => setWebMenu(null)}
        >
          <MenuButton
            testId="cl-menu-add-link"
            onClick={() => {
              const ep = webMenu.endpoint;
              setWebMenu(null);
              startCrossLink(ep);
            }}
          >
            {messages.crossLinks.addCrossLinkMenu}
          </MenuButton>
          {canCompleteInWebMenu && pendingSource ? (
            <MenuButton
              testId="cl-menu-complete-link"
              onClick={() => {
                const ep = webMenu.endpoint;
                setWebMenu(null);
                completeCrossLink(ep);
              }}
            >
              {messages.crossLinks.completeCrossLinkWithMenu(pendingSource.label.slice(0, 40))}
            </MenuButton>
          ) : null}
          <MenuButton
            testId="cl-menu-add-note"
            onClick={() => {
              const ep = webMenu.endpoint;
              setWebMenu(null);
              openAddPageNote(ep);
            }}
          >
            {messages.crossLinks.addPageNoteMenu}
          </MenuButton>
        </ContextMenu>
      ) : null}

      <PendingPortalDock
        pendingSource={pendingSource}
        currentLocationEndpoint={currentPageEndpoint}
        onCompleteWithEndpoint={(target) => completeCrossLink(target)}
        onCancel={cancelPendingCrossLink}
      />

      <PageNoteDialog
        open={Boolean(noteDialog)}
        mode={noteDialog?.mode === "edit" ? "edit" : "create"}
        anchorLabel={
          noteDialog?.mode === "edit"
            ? (noteDialog.note.anchorLabel ?? contextValue.pageLabel)
            : (noteDialog?.endpoint.label ?? contextValue.pageLabel)
        }
        initialBody={noteDialog?.mode === "edit" ? noteDialog.note.body : ""}
        initialColor={noteDialog?.mode === "edit" ? noteDialog.note.color : "yellow"}
        pending={mutationPending}
        serverError={dialogError}
        onOpenChange={(open) => {
          if (!open) setNoteDialog(null);
        }}
        onSubmit={handlePageNoteSubmit}
        onRequestDelete={
          noteDialog?.mode === "edit"
            ? () => setDeleteConfirm({ kind: "note", note: noteDialog.note })
            : undefined
        }
      />

      <CrossLinkDialog
        open={Boolean(linkDialog)}
        mode={linkDialog?.mode === "edit" ? "edit" : "create"}
        fromLabel={
          linkDialog?.mode === "edit" ? linkDialog.link.endA.label : (linkDialog?.endA.label ?? "")
        }
        toLabel={
          linkDialog?.mode === "edit" ? linkDialog.link.endB.label : (linkDialog?.endB.label ?? "")
        }
        initialTitle={linkDialog?.mode === "edit" ? linkDialog.link.linkTitle : ""}
        initialNote={linkDialog?.mode === "edit" ? linkDialog.link.noteText : null}
        initialColor={linkDialog?.mode === "edit" ? linkDialog.link.color : "yellow"}
        pending={mutationPending}
        serverError={dialogError}
        onOpenChange={(open) => {
          if (!open) setLinkDialog(null);
        }}
        onSubmit={handleCrossLinkSubmit}
        onRequestDelete={
          linkDialog?.mode === "edit"
            ? () => setDeleteConfirm({ kind: "link", link: linkDialog.link })
            : undefined
        }
      />

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
        title={
          deleteConfirm?.kind === "link"
            ? messages.crossLinks.confirmDeleteLinkTitle
            : messages.crossLinks.confirmDeleteNoteTitle
        }
        body={
          deleteConfirm?.kind === "link"
            ? messages.crossLinks.confirmDeleteLinkBody(deleteConfirm.link.linkTitle)
            : messages.crossLinks.confirmDeleteNoteBody
        }
        confirmLabel={messages.crossLinks.deleteAction}
        pending={mutationPending}
        onConfirm={() => void handleConfirmDelete()}
      />
    </CrossLinkMenuContext.Provider>
  );
}

export function CrossLinkContextHost({
  currentUserId,
  children,
}: {
  currentUserId: number | null;
  children: ReactNode;
}) {
  return (
    <CrossLinkContextHostInner currentUserId={currentUserId}>{children}</CrossLinkContextHostInner>
  );
}
