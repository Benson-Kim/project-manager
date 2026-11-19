"use client";

import "./excalidraw-asset-path";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BoardScene } from "../model/scene";
import {
  SceneChangeGate,
  editorTheme,
  toEditorData,
  type EditorAppState,
  type SceneElement,
} from "./excalidraw-scene";

const SCENE_CHANGE_MS = 300;
const UI_OPTIONS = { tools: { image: false } };

type Props = {
  initialScene: BoardScene;
  readOnly: boolean;
  onChange: (scene: BoardScene) => void;
};

type Pending = { elements: readonly SceneElement[]; appState: EditorAppState };

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = () => document.documentElement.getAttribute("data-theme");
const serverTheme = () => null;

export default function WhiteboardCanvas({ initialScene, readOnly, onChange }: Props) {
  const theme = editorTheme(useSyncExternalStore(subscribeTheme, readTheme, serverTheme));
  const [initialData] = useState(() => toEditorData(initialScene) as ExcalidrawInitialDataState);
  const [gate] = useState(() => new SceneChangeGate(initialScene));
  const latestOnSceneChange = useRef(onChange);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latestOnSceneChange.current = onChange;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const scene = gate.take(next.elements, next.appState);
    if (scene) latestOnSceneChange.current(scene);
  }, [gate]);

  useEffect(() => flush, [flush]);

  const handleChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState) => {
      if (!gate.noticed(elements, appState)) return;
      pending.current = { elements, appState };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SCENE_CHANGE_MS);
    },
    [gate, flush],
  );

  return (
    <div
      data-testid="whiteboard-canvas"
      className="h-full w-full [&_.default-sidebar]:hidden [&_.default-sidebar-trigger]:hidden"
    >
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        viewModeEnabled={readOnly}
        theme={theme}
        UIOptions={UI_OPTIONS}
        validateEmbeddable={false}
      />
    </div>
  );
}
