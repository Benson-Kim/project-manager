"use client";

import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFullPage } from "@/components/shell/use-full-page";
import { Button } from "@/components/ui/button";
import { useDragGesture } from "@/components/ui/drag/use-pointer-drag";
import { SaveDot } from "@/components/ui/save-dot";
import { HistoryButtons } from "@/components/undo/history-buttons";
import { useLendHistory } from "@/components/undo/page-history";
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
import { StepInspector } from "./step-inspector";
import { MatrixView, SwimlaneView } from "./step-views";
import { useDiagramEditor } from "./use-diagram-editor";
import { useDiagramSave, type SaveStatus } from "./use-diagram-save";

const M = messages.bpmn;

const LAYOUTS = ["canvas", "swimlanes", "matrix"] as const;
type Layout = (typeof LAYOUTS)[number];

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
  useLendHistory(canEdit ? { label: M.diagramChange, ...editor } : null);
  const [connector, setConnector] = useState<FlowKind>("sequence");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [view, setView] = useState<BoardView>("board");
  const [layout, setLayout] = useState<Layout>("canvas");
  useFullPage(view !== "board", () => setView("board"));
  const { screenToFlowPosition } = useReactFlow();
  const boardRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);

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
  const paletteDrag = useDragGesture<PaletteItem, Point>({
    enabled: canEdit,
    locate: (x, y) => {
      const under = document.elementFromPoint(x, y);
      return under && boardRef.current?.contains(under) ? { x, y } : null;
    },
    same: (a, b) => (a === null) === (b === null),
    onDrop: (item, at) => place(item, screenToFlowPosition(at)),
  });

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

  const selectedShape =
    selected.size === 1
      ? (editor.diagram.shapes.find((shape) => selected.has(shape.id)) ?? null)
      : null;

  const selectOne = (id: string) => setSelected(new Set([id]));
  const palette = canEdit && layout === "canvas";

  const notice = !readable ? M.unreadable : !can.update ? M.readOnly : null;
  const problem =
    saver.status === "failed" || saver.status === "conflict" || saver.status === "tooLarge";

  useEffect(() => {
    const panes = panesRef.current;
    if (!panes || view !== "board") return;
    const fit = () =>
      panes.style.setProperty(
        "--panes-top",
        `${panes.getBoundingClientRect().top + window.scrollY}px`,
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [view, layout]);

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
        {!canEdit && notice ? <p className="text-xs text-ink-muted">{notice}</p> : null}
        {view !== "preview" ? (
          <div role="group" aria-label={M.layouts.label} className="flex items-center gap-1">
            {LAYOUTS.map((each) => (
              <Button
                key={each}
                type="button"
                size="compact"
                variant={layout === each ? "primary" : "secondary"}
                aria-pressed={layout === each}
                data-testid={`bpmn-layout-${each}`}
                onClick={() => setLayout(each)}
              >
                {M.layouts[each]}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {view === "preview" ? (
            <>
              {viewButton("bpmn-print", M.print, print)}
              {viewButton("bpmn-close-preview", M.closePreview, () => setView("board"))}
            </>
          ) : (
            <>
              {canEdit && problem ? (
                <p
                  data-testid="bpmn-save-status"
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
                  testId="bpmn-save-status"
                  status={saver.status}
                />
              ) : null}
              {saver.status === "conflict"
                ? viewButton("bpmn-reload", M.reload, () => window.location.reload())
                : null}
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
        ref={panesRef}
        data-canvas-panes
        className={`grid min-h-0 flex-1 grid-cols-1 ${
          view === "board"
            ? "border-t border-line lg:h-[calc(100dvh-var(--panes-top,12.5rem)-1rem)] lg:flex-none lg:grid-rows-[minmax(0,1fr)]"
            : ""
        } ${palette ? "lg:grid-cols-[12rem_1fr_16rem]" : "lg:grid-cols-[1fr_16rem]"}`}
      >
        {palette ? (
          <Palette
            connector={connector}
            onConnector={setConnector}
            onAdd={placeInView}
            drag={paletteDrag}
          />
        ) : null}
        {layout === "canvas" ? (
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
        ) : (
          <div
            data-testid="bpmn-step-view"
            data-layout={layout}
            className="flex min-h-[65dvh] min-w-0 flex-col overflow-y-auto lg:min-h-0 print:hidden"
          >
            {canEdit ? (
              <div className="flex justify-end gap-1 px-2 pt-2">
                <HistoryButtons history={editor} labels={M} testId="bpmn" />
              </div>
            ) : null}
            {layout === "swimlanes" ? (
              <SwimlaneView
                diagram={editor.diagram}
                selectedId={selectedShape?.id ?? null}
                onSelect={selectOne}
              />
            ) : (
              <MatrixView
                diagram={editor.diagram}
                selectedId={selectedShape?.id ?? null}
                onSelect={selectOne}
              />
            )}
          </div>
        )}
        <StepInspector
          key={selectedShape?.id ?? "none"}
          editor={editor}
          shape={selectedShape}
          canEdit={canEdit}
          onDeleted={() => setSelected(new Set())}
        />
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
