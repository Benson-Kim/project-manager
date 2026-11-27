"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { FULLSCREEN_FRAME, useFullscreen } from "@/components/shell/use-fullscreen";
import { Button } from "@/components/ui/button";
import { usePrintWhenReady } from "@/components/ui/print-button";
import { SaveDot } from "@/components/ui/save-dot";
import { messages } from "@/lib/messages";
import { readBoardScene, type WhiteboardRow, type WhiteboardSummary } from "../schemas/whiteboard";
import { useWhiteboardSave, type SaveStatus } from "./use-whiteboard-save";
import type { BoardControls } from "./whiteboard-canvas";
import { WhiteboardMenu } from "./whiteboard-menu";

const M = messages.whiteboard;

const WhiteboardCanvas = dynamic(() => import("./whiteboard-canvas"), { ssr: false });

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: M.saved,
  unsaved: M.unsaved,
  saving: M.saving,
  failed: M.saveFailed,
  conflict: M.conflict,
  tooLarge: M.tooLarge,
};

const keepPicture = () => {};

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Prints the drawing as one picture once it has loaded; a new job each time Print is pressed. */
function usePrintBoard(board: BoardControls | null) {
  const [job, setJob] = useState<{ src: string; id: number; ready: boolean } | null>(null);
  usePrintWhenReady(job?.ready ?? false, keepPicture);
  const print = async () => {
    if (!board) return;
    const src = svgDataUrl(await board.toSvg());
    setJob((last) => ({ src, id: (last?.id ?? 0) + 1, ready: false }));
  };
  const onImageLoad = (image: HTMLImageElement) => {
    const id = job?.id;
    void image
      .decode()
      .catch(() => undefined)
      .then(() => setJob((last) => (last && last.id === id ? { ...last, ready: true } : last)));
  };
  return { job, print, onImageLoad };
}

/** One whiteboard open for drawing, saved a moment after each change. */
export function WhiteboardWorkspace({
  projectId,
  row,
  boards,
  can,
}: {
  projectId: number;
  row: WhiteboardRow;
  boards: readonly WhiteboardSummary[];
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const [{ scene: initial, readable }] = useState(() => readBoardScene(row.BoardJson));
  const canEdit = can.update && readable;
  const [scene, setScene] = useState(initial);
  const saver = useWhiteboardSave(row.WhiteboardId, row.RowVer, scene, canEdit);
  const problem =
    saver.status === "failed" || saver.status === "conflict" || saver.status === "tooLarge";
  const fullscreen = useFullscreen();
  const [board, setBoard] = useState<BoardControls | null>(null);
  const printing = usePrintBoard(board);
  const toolButton = (testId: string, label: string, onClick: () => void) => (
    <Button
      type="button"
      size="compact"
      variant="secondary"
      data-testid={testId}
      disabled={!board}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div
      data-fullscreen={fullscreen.active}
      data-cl-page-entity={row.WhiteboardId}
      data-cl-page-label={row.Name}
      className={
        fullscreen.active ? `${FULLSCREEN_FRAME} flex flex-col` : "flex min-h-0 flex-1 flex-col"
      }
    >
      <div
        role="toolbar"
        aria-label={M.title}
        className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-1 print:hidden"
      >
        <WhiteboardMenu
          projectId={projectId}
          boards={boards}
          current={row}
          can={can}
          rowVer={saver.rowVer}
          withRowVer={saver.withRowVer}
        />
        {!canEdit ? <p className="text-xs text-ink-muted">{M.readOnly}</p> : null}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {canEdit && problem ? (
            <p
              data-testid="whiteboard-save-status"
              data-status={saver.status}
              role="alert"
              className="text-xs text-danger"
            >
              {STATUS_TEXT[saver.status]}
            </p>
          ) : canEdit ? (
            <SaveDot
              pending={saver.status !== "saved"}
              label={STATUS_TEXT[saver.status]}
              testId="whiteboard-save-status"
              status={saver.status}
            />
          ) : null}
          {saver.status === "conflict" ? (
            <Button
              type="button"
              size="compact"
              variant="secondary"
              data-testid="whiteboard-reload"
              onClick={() => window.location.reload()}
            >
              {M.reload}
            </Button>
          ) : null}
          {toolButton("whiteboard-back-to-content", M.backToContent, () =>
            board?.scrollToContent(),
          )}
          {toolButton("whiteboard-print", M.print, () => void printing.print())}
          <Button
            type="button"
            size="compact"
            variant="secondary"
            aria-pressed={fullscreen.active}
            data-testid="whiteboard-fullscreen"
            onClick={() => void fullscreen.toggle()}
          >
            {fullscreen.label}
          </Button>
          {canEdit ? (
            <Button
              type="button"
              size="compact"
              variant="secondary"
              data-testid="whiteboard-save-now"
              onClick={() => void saver.saveNow(board?.flush() ?? undefined)}
            >
              {M.save}
            </Button>
          ) : null}
        </div>
      </div>
      <div
        className={`border-t border-line print:hidden ${fullscreen.active ? "min-h-0 flex-1" : "h-[calc(100dvh-14rem)] min-h-96"}`}
      >
        <WhiteboardCanvas
          initialScene={initial}
          readOnly={!canEdit}
          onChange={setScene}
          onReady={setBoard}
        />
      </div>
      {printing.job ? (
        <div className="hidden bg-white print:block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL; printing skips background images */}
          <img
            key={printing.job.id}
            src={printing.job.src}
            alt={row.Name}
            data-testid="whiteboard-print-image"
            onLoad={(event) => printing.onImageLoad(event.currentTarget)}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
