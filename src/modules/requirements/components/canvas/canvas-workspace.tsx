"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useFullPage } from "@/components/shell/use-full-page";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { PLAIN_STYLE } from "@/lib/connector-style";
import { messages } from "@/lib/messages";
import { itemConnection, type BranchStart } from "../../canvas/board-model";
import { canvasGaps, itemKey } from "../../canvas/gaps";
import type { Point } from "../../canvas/layout";
import { savedLink, stepBack, undoApplies, type CanvasUndo } from "../../canvas/undo";
import type { CanvasItem, CanvasLink } from "../../schemas/canvas";
import type { LinkRule } from "../../schemas/link-rules";
import { CanvasBoard, type CanvasView } from "./canvas-board";

const M = messages.requirements.canvas;
import { RepositoryList } from "./repository-list";
import { useCanvasLinks } from "./use-canvas-links";
import { useCanvasLinkStyles } from "./use-canvas-link-styles";
import { useCanvasNodes } from "./use-canvas-nodes";
import { useCanvasUndo } from "./use-canvas-undo";
import { WalkthroughView } from "./walkthrough-view";

/**
 * The three panes. The inspector, built on the server from ?inspect=, takes the third column.
 * Opening one swaps the address in place, so this keeps its key and the board keeps its state.
 */
export function CanvasWorkspace({
  canvasId,
  items,
  links: savedLinks,
  linkRules,
  canEdit,
  newRequirementHref,
  inspector,
}: {
  canvasId: number;
  items: readonly CanvasItem[];
  links: readonly CanvasLink[];
  linkRules: readonly LinkRule[];
  canEdit: boolean;
  newRequirementHref?: string;
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
  const history = useCanvasUndo();
  const { shown, reveal, hide, move, autoLayout, toggleCollapse, restore } = useCanvasNodes(
    canvasId,
    items,
    history.remember,
  );
  const { connect, disconnect } = useCanvasLinks(history.remember);
  const { links, setLook } = useCanvasLinkStyles(canvasId, savedLinks, history.remember);
  const gaps = useMemo(() => canvasGaps(shown, links), [shown, links]);

  const linkFor = (sourceKey: string, targetKey: string) =>
    itemConnection(shown, links, linkRules, sourceKey, targetKey);
  const link = (sourceKey: string, targetKey: string) => {
    const made = linkFor(sourceKey, targetKey);
    if (made) void connect(made);
  };
  const branch = async (sourceKey: string, targetKey: string, from: BranchStart) => {
    const made = linkFor(sourceKey, targetKey);
    if (!made || !(await connect(made))) return;
    void setLook(
      {
        UpstreamKind: made.up.Kind,
        UpstreamId: made.up.ItemId,
        DownstreamId: made.down.ItemId,
        LinkStatus: "Proposed",
        RowVer: 0,
      },
      { style: PLAIN_STYLE, branchFromId: from.fromId, branchAt: from.at },
      false,
    );
  };

  const applies = (step: CanvasUndo) => undoApplies(step, shown, links, linkRules);
  const back = (step: CanvasUndo) => stepBack(step, shown, links, linkRules);
  /** Applies a step from Undo or Redo; the hook keeps its step back, so the write remembers none. */
  const apply = (step: CanvasUndo | null) => {
    if (step?.kind === "nodes") restore(step.before);
    if (step?.kind === "unlink") {
      const saved = savedLink(links, step.upKey, step.downId);
      if (saved) void disconnect(saved, false);
    }
    if (step?.kind === "relink") {
      const made = linkFor(step.upKey, step.downKey);
      if (made) void connect(made, false);
    }
    if (step?.kind === "style") {
      const saved = savedLink(links, step.upKey, step.downId);
      if (saved) void setLook(saved, step.before, false);
    }
  };
  const undo = () => {
    if (canEdit) apply(history.undo(applies, back));
  };
  const redo = () => {
    if (canEdit) apply(history.redo(applies, back));
  };

  const dropItem = (key: string, point: Point) => {
    const item = shown.find((row) => itemKey(row.Kind, row.ItemId) === key);
    if (!item) return;
    if (!item.OnCanvas) void reveal(item, point);
    setSelectedKey(key);
  };

  const [view, setView] = useState<CanvasView>("board");
  const [printRequest, setPrintRequest] = useState(0);
  const [walkthrough, setWalkthrough] = useState(false);
  const showWalkthrough = walkthrough && view !== "preview";
  const print = () => {
    setView("preview");
    setPrintRequest((count) => count + 1);
  };
  useFullPage(view !== "board", () => setView("board"));

  const viewButton = (testId: string, label: string, onClick: () => void) => (
    <Button type="button" variant="secondary" data-testid={testId} onClick={onClick}>
      {label}
    </Button>
  );
  const printButton = (
    <PrintButton
      label={M.print}
      testId="canvas-print"
      variant="secondary"
      className="min-h-10"
      onPrint={print}
    />
  );

  return (
    <div
      data-canvas-view={view}
      data-cl-page-entity={canvasId}
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
            {printButton}
            {viewButton("canvas-close-preview", M.closePreview, () => setView("board"))}
          </>
        ) : (
          <>
            {view === "full"
              ? viewButton("canvas-exit-full-page", M.exitFullPage, () => setView("board"))
              : viewButton("canvas-full-page", M.fullPage, () => setView("full"))}
            {viewButton("canvas-preview", M.preview, () => setView("preview"))}
            {viewButton(
              "canvas-walkthrough",
              walkthrough ? M.walkthrough.close : M.walkthrough.open,
              () => setWalkthrough((open) => !open),
            )}
            {printButton}
          </>
        )}
      </div>
      <div
        data-canvas-panes
        className={`grid min-h-0 flex-1 grid-cols-1 ${
          view === "board"
            ? "border-t border-line lg:h-[calc(100dvh-12.5rem)] lg:flex-none lg:grid-rows-[minmax(0,1fr)]"
            : ""
        } ${inspector ? "lg:grid-cols-[20rem_1fr_22rem]" : "lg:grid-cols-[20rem_1fr]"} ${
          showWalkthrough ? "print:hidden" : ""
        }`}
      >
        <RepositoryList
          items={shown}
          gaps={gaps}
          canEdit={canEdit}
          newRequirementHref={newRequirementHref}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onReveal={(item) => void reveal(item)}
        />
        <div
          data-testid="canvas-board"
          data-canvas-page={showWalkthrough ? undefined : true}
          className="h-[60dvh] min-w-0 lg:h-full"
        >
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
            onUndo={undo}
            canUndo={history.canUndo(applies)}
            onRedo={redo}
            canRedo={history.canRedo(applies)}
            canLink={(sourceKey, targetKey) => linkFor(sourceKey, targetKey) !== null}
            onLink={link}
            onBranch={(sourceKey, targetKey, from) => void branch(sourceKey, targetKey, from)}
            onUnlink={(saved) => void disconnect(saved)}
            onStyle={(saved, look) => void setLook(saved, look)}
            onInspect={inspect}
            onToggleCollapse={(item) => void toggleCollapse(item)}
          />
        </div>
        {inspector}
      </div>
      {showWalkthrough && (
        <WalkthroughView items={shown} links={links} onClose={() => setWalkthrough(false)} />
      )}
    </div>
  );
}
