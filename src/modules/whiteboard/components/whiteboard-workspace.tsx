"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveDot } from "@/components/ui/save-dot";
import { messages } from "@/lib/messages";
import { readBoardScene, type WhiteboardRow, type WhiteboardSummary } from "../schemas/whiteboard";
import { useWhiteboardSave, type SaveStatus } from "./use-whiteboard-save";
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
          {canEdit ? (
            <Button
              type="button"
              size="compact"
              variant="secondary"
              data-testid="whiteboard-save-now"
              onClick={() => void saver.saveNow()}
            >
              {M.save}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="h-[calc(100dvh-14rem)] min-h-96 border-t border-line">
        <WhiteboardCanvas initialScene={initial} readOnly={!canEdit} onChange={setScene} />
      </div>
    </div>
  );
}
