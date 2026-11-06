"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { itemConnection } from "../../canvas/board-model";
import { canvasGaps, itemKey } from "../../canvas/gaps";
import type { Point } from "../../canvas/layout";
import type { CanvasItem, CanvasLink } from "../../schemas/canvas";
import type { LinkRule } from "../../schemas/link-rules";
import { CanvasBoard, type CanvasView } from "./canvas-board";

const M = messages.requirements.canvas;
import { RepositoryList } from "./repository-list";
import { useCanvasLinks } from "./use-canvas-links";
import { useCanvasNodes } from "./use-canvas-nodes";

/**
 * The three panes. The inspector, built on the server from ?inspect=, takes the third column.
 * Opening one swaps the address in place, so this keeps its key and the board keeps its state.
 */
export function CanvasWorkspace({
  canvasId,
  items,
  links,
  linkRules,
  canEdit,
  inspector,
}: {
  canvasId: number;
  items: readonly CanvasItem[];
  links: readonly CanvasLink[];
  linkRules: readonly LinkRule[];
  canEdit: boolean;
  inspector?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const inspect = (requirementId: number) => {
    const next = new URLSearchParams(search);
    next.set("inspect", String(requirementId));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { shown, reveal, hide, move, autoLayout, toggleCollapse } = useCanvasNodes(canvasId, items);
  const { connect, disconnect } = useCanvasLinks();
  const gaps = useMemo(() => canvasGaps(shown, links), [shown, links]);

  const linkFor = (sourceKey: string, targetKey: string) =>
    itemConnection(shown, links, linkRules, sourceKey, targetKey);
  const link = (sourceKey: string, targetKey: string) => {
    const made = linkFor(sourceKey, targetKey);
    if (made) void connect(made);
  };

  const dropItem = (key: string, point: Point) => {
    const item = shown.find((row) => itemKey(row.Kind, row.ItemId) === key);
    if (!item) return;
    if (!item.OnCanvas) void reveal(item, point);
    setSelectedKey(key);
  };

  const [view, setView] = useState<CanvasView>("board");
  const [printRequest, setPrintRequest] = useState(0);
  const print = () => {
    setView("preview");
    setPrintRequest((count) => count + 1);
  };
  useEffect(() => {
    if (view === "board") return;
    // The full-screen/preview overlay is a CSS layer inside <main> (its own stacking context), so it
    // cannot out-stack the app-shell header. Mark the root, as native fullscreen marks :root:fullscreen,
    // and the header steps aside for it.
    const root = document.documentElement;
    root.dataset.canvasFullscreen = "true";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setView("board");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      delete root.dataset.canvasFullscreen;
    };
  }, [view]);

  const viewButton = (testId: string, label: string, onClick: () => void) => (
    <Button type="button" variant="secondary" data-testid={testId} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <div
      data-canvas-view={view}
      className={
        view === "board"
          ? "flex min-h-0 flex-1 flex-col"
          : "fixed inset-0 z-(--z-fullscreen) flex flex-col bg-surface"
      }
    >
      <div
        role="toolbar"
        aria-label={M.views}
        className={`flex justify-end gap-1 px-2 py-1 print:hidden ${
          view === "board" ? "border-t border-line" : ""
        }`}
      >
        {view === "preview" ? (
          <>
            {viewButton("canvas-print", M.print, print)}
            {viewButton("canvas-close-preview", M.closePreview, () => setView("board"))}
          </>
        ) : (
          <>
            {view === "full"
              ? viewButton("canvas-exit-full-page", M.exitFullPage, () => setView("board"))
              : viewButton("canvas-full-page", M.fullPage, () => setView("full"))}
            {viewButton("canvas-preview", M.preview, () => setView("preview"))}
            {viewButton("canvas-print", M.print, print)}
          </>
        )}
      </div>
      <div
        data-canvas-panes
        className={`grid min-h-0 flex-1 grid-cols-1 ${
          view === "board" ? "border-t border-line lg:h-[calc(100dvh-12.5rem)]" : ""
        } ${inspector ? "lg:grid-cols-[20rem_1fr_22rem]" : "lg:grid-cols-[20rem_1fr]"}`}
      >
        <RepositoryList
          items={shown}
          gaps={gaps}
          canEdit={canEdit}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onReveal={(item) => void reveal(item)}
        />
        <div data-testid="canvas-board" data-canvas-page className="h-[60dvh] min-w-0 lg:h-full">
          <CanvasBoard
            view={view}
            printRequest={printRequest}
            items={shown}
            links={links}
            gaps={gaps}
            canEdit={canEdit}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onMove={(moves) => void move(moves)}
            onHide={(item) => void hide(item)}
            onDropItem={dropItem}
            onAutoLayout={() => void autoLayout()}
            canLink={(sourceKey, targetKey) => linkFor(sourceKey, targetKey) !== null}
            onLink={link}
            onUnlink={(saved) => void disconnect(saved)}
            onInspect={inspect}
            onToggleCollapse={(item) => void toggleCollapse(item)}
          />
        </div>
        {inspector}
      </div>
    </div>
  );
}
