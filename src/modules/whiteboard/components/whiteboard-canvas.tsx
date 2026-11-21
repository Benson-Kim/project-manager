"use client";

import "./excalidraw-asset-path";
import {
  Excalidraw,
  exportToSvg,
  getCommonBounds,
  getVisibleSceneBounds,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { BoardScene } from "../model/scene";
import {
  SceneChangeGate,
  editorTheme,
  toEditorData,
  type EditorAppState,
  type SceneElement,
} from "./excalidraw-scene";
import { SidewaysScrollbar, type SidewaysSource } from "./sideways-scrollbar";

const SCENE_CHANGE_MS = 300;
const UI_OPTIONS = { tools: { image: false } };

/** What the toolbar asks of the board once it has loaded. */
export type BoardControls = {
  scrollToContent: () => void;
  /** Passes on the change still waiting to be reported; the board as drawn, or null if none was. */
  flush: () => BoardScene | null;
  /** The whole drawing as SVG markup, on a white background, for printing. */
  toSvg: () => Promise<string>;
};

type Props = {
  initialScene: BoardScene;
  readOnly: boolean;
  onChange: (scene: BoardScene) => void;
  onReady?: (controls: BoardControls) => void;
};

type Pending = { elements: readonly SceneElement[]; appState: EditorAppState };

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function sidewaysFrom(api: ExcalidrawImperativeAPI): SidewaysSource {
  return {
    read: () => {
      const elements = api.getSceneElements();
      const [left, , right] = getVisibleSceneBounds(api.getAppState());
      if (elements.length === 0) return { content: null, view: { start: left, end: right } };
      const [x1, , x2] = getCommonBounds(elements);
      return { content: { start: x1, end: x2 }, view: { start: left, end: right } };
    },
    moveTo: (viewStart) => api.updateScene({ appState: { scrollX: -viewStart } }),
    subscribe: (onChange) => api.onChange(() => onChange()),
  };
}

const readTheme = () => document.documentElement.getAttribute("data-theme");
const serverTheme = () => null;

export default function WhiteboardCanvas({ initialScene, readOnly, onChange, onReady }: Props) {
  const theme = editorTheme(useSyncExternalStore(subscribeTheme, readTheme, serverTheme));
  const [initialData] = useState(() => toEditorData(initialScene) as ExcalidrawInitialDataState);
  const [gate] = useState(() => new SceneChangeGate(initialScene));
  const latestOnSceneChange = useRef(onChange);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sideways, setSideways] = useState<SidewaysSource | null>(null);
  const boardId = useId();

  useEffect(() => {
    latestOnSceneChange.current = onChange;
  });

  const flush = useCallback((): BoardScene | null => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    if (!next) return null;
    const scene = gate.take(next.elements, next.appState);
    if (scene) latestOnSceneChange.current(scene);
    return scene ?? null;
  }, [gate]);

  useEffect(() => () => void flush(), [flush]);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState) => {
      if (!gate.noticed(elements, appState)) return;
      pending.current = { elements, appState };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SCENE_CHANGE_MS);
    },
    [gate, flush],
  );

  const handleApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setSideways(sidewaysFrom(api));
      onReady?.({
        flush,
        scrollToContent: () =>
          api.scrollToContent(undefined, { fitToContent: true, animate: true }),
        toSvg: async () => {
          const svg = await exportToSvg({
            elements: api.getSceneElements(),
            appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
            files: api.getFiles(),
            exportPadding: 16,
          });
          return new XMLSerializer().serializeToString(svg);
        },
      });
    },
    [onReady, flush],
  );

  return (
    <div
      data-testid="whiteboard-canvas"
      className="flex h-full w-full flex-col [&_.default-sidebar]:hidden [&_.default-sidebar-trigger]:hidden"
    >
      <div id={boardId} className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={handleApi}
          initialData={initialData}
          onChange={handleChange}
          viewModeEnabled={readOnly}
          theme={theme}
          UIOptions={UI_OPTIONS}
          validateEmbeddable={false}
        />
      </div>
      {sideways && <SidewaysScrollbar source={sideways} controls={boardId} />}
    </div>
  );
}
