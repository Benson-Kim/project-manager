"use client";

import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFullPage } from "@/components/shell/use-full-page";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { readDiagram, type FlowKind } from "../model/diagram";
import { addPool, addShape, NEW_POOL, type Point } from "../model/edit";
import { diagramSvg } from "../model/svg";
import type { DiagramRow, DiagramSummary } from "../schemas/bpmn";
import { newId } from "./board-model";
import { BpmnBoard, type BoardView } from "./bpmn-board";
import { DiagramMenu } from "./diagram-menu";
import { downloadBpmnXml, downloadPng, svgDataUrl } from "./export";
import { Palette, type PaletteItem } from "./palette";
import { useDiagramEditor } from "./use-diagram-editor";
import { useDiagramSave, type SaveStatus } from "./use-diagram-save";

const M = messages.bpmn;

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: M.saved,
  unsaved: M.unsaved,
  saving: M.saving,
  failed: M.saveFailed,
  conflict: M.conflict,
  tooLarge: M.tooLarge,
};

interface WorkspaceProps {
  projectId: number;
  row: DiagramRow;
  diagrams: readonly DiagramSummary[];
  can: { create: boolean; update: boolean; delete: boolean };
}

/** One diagram open for drawing: the palette, the canvas, saving, print and export. */
export function BpmnWorkspace(props: WorkspaceProps) {
  return (
    <ReactFlowProvider>
      <Workspace {...props} />
    </ReactFlowProvider>
  );
}

function Workspace({ projectId, row, diagrams, can }: WorkspaceProps) {
  const [{ diagram: initial, readable }] = useState(() => readDiagram(row.DiagramJson));
  const canEdit = can.update && readable;
  const editor = useDiagramEditor(initial);
  const saver = useDiagramSave(row.BpmnDiagramId, row.RowVer, editor.diagram, canEdit);
  const [connector, setConnector] = useState<FlowKind>("sequence");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [view, setView] = useState<BoardView>("board");
  useFullPage(view !== "board", () => setView("board"));
  const { screenToFlowPosition } = useReactFlow();
  const boardRef = useRef<HTMLDivElement>(null);

  const place = (item: PaletteItem, at: Point) => {
    const id = newId(item === "pool" ? "pool" : "shape");
    editor.change((d) =>
      item === "pool"
        ? addPool(
            d,
            { x: at.x - NEW_POOL.width / 2, y: at.y - NEW_POOL.laneHeight },
            { pool: id, lanes: [newId("lane"), newId("lane")] },
            { pool: M.newPoolName, lane: M.laneName },
          )
        : addShape(d, item, at, id),
    );
    setSelected(new Set([id]));
  };

  const placeInView = (item: PaletteItem) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const centre = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const step = (editor.diagram.shapes.length % 8) * 16;
    place(item, { x: centre.x + step, y: centre.y + step });
  };

  const printSrc = useMemo(() => svgDataUrl(diagramSvg(editor.diagram).svg), [editor.diagram]);
  const printImage = useRef<HTMLImageElement>(null);
  const [printRequest, setPrintRequest] = useState(0);
  useEffect(() => {
    if (printRequest === 0) return;
    let cancelled = false;
    const ready = printImage.current?.decode() ?? Promise.resolve();
    void ready
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) window.print();
      });
    return () => {
      cancelled = true;
    };
  }, [printRequest]);
  const print = () => {
    setView("preview");
    setPrintRequest((count) => count + 1);
  };

  const viewButton = (testId: string, label: string, onClick: () => void) => (
    <Button type="button" size="compact" variant="secondary" data-testid={testId} onClick={onClick}>
      {label}
    </Button>
  );

  const notice = !readable ? M.unreadable : !can.update ? M.readOnly : null;
  const problem =
    saver.status === "failed" || saver.status === "conflict" || saver.status === "tooLarge";

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
        className={`flex flex-wrap items-center gap-2 px-2 py-1 print:hidden ${view === "board" ? "border-t border-line" : ""}`}
      >
        {view !== "preview" ? (
          <DiagramMenu
            projectId={projectId}
            diagrams={diagrams}
            current={row}
            can={can}
            rowVer={saver.rowVer}
            adoptRowVer={saver.adoptRowVer}
          />
        ) : null}
        {canEdit ? (
          <p
            data-testid="bpmn-save-status"
            data-status={saver.status}
            role={problem ? "alert" : "status"}
            className={`text-xs ${problem ? "text-danger" : "text-ink-muted"}`}
          >
            {STATUS_TEXT[saver.status]}
          </p>
        ) : notice ? (
          <p className="text-xs text-ink-muted">{notice}</p>
        ) : null}
        {saver.status === "conflict"
          ? viewButton("bpmn-reload", M.reload, () => window.location.reload())
          : null}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {view === "preview" ? (
            <>
              {viewButton("bpmn-print", M.print, print)}
              {viewButton("bpmn-close-preview", M.closePreview, () => setView("board"))}
            </>
          ) : (
            <>
              {canEdit ? viewButton("bpmn-save", M.save, () => void saver.saveNow()) : null}
              {viewButton(
                "bpmn-export-png",
                M.exportPng,
                () => void downloadPng(editor.diagram, row.Name),
              )}
              {viewButton("bpmn-export-xml", M.exportXml, () =>
                downloadBpmnXml(editor.diagram, row.Name),
              )}
              {view === "full"
                ? viewButton("bpmn-exit-full-page", M.exitFullPage, () => setView("board"))
                : viewButton("bpmn-full-page", M.fullPage, () => setView("full"))}
              {viewButton("bpmn-preview", M.preview, () => setView("preview"))}
              {viewButton("bpmn-print", M.print, print)}
            </>
          )}
        </div>
      </div>
      <div
        data-canvas-panes
        className={`grid min-h-0 flex-1 grid-cols-1 ${
          view === "board"
            ? "border-t border-line lg:h-[calc(100dvh-12.5rem)] lg:flex-none lg:grid-rows-[minmax(0,1fr)]"
            : ""
        } ${canEdit ? "lg:grid-cols-[12rem_1fr]" : ""}`}
      >
        {canEdit ? (
          <Palette connector={connector} onConnector={setConnector} onAdd={placeInView} />
        ) : null}
        <div ref={boardRef} data-testid="bpmn-board" className="h-[65dvh] min-w-0 lg:h-full">
          <BpmnBoard
            editor={editor}
            canEdit={canEdit}
            view={view}
            connector={connector}
            selected={selected}
            onSelect={(update) => setSelected(update)}
            onPlace={place}
          />
        </div>
        <div
          data-canvas-page
          className={view === "preview" ? "block bg-white" : "hidden print:block"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL; printing skips background images */}
          <img
            ref={printImage}
            src={printSrc}
            alt={row.Name}
            data-testid="bpmn-print-image"
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
