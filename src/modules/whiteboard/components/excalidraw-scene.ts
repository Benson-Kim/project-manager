import { BOARD_SCENE_VERSION, UNSTORED_ELEMENT_TYPES, type BoardScene } from "../model/scene";

/** The element fields the board reads; Excalidraw's elements and stored ones both have them. */
export type SceneElement = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly version: number;
  readonly isDeleted?: boolean;
};

/** The editor state fields the board keeps; the rest (scroll, zoom, selection, tool) is not stored. */
export type EditorAppState = {
  readonly viewBackgroundColor: string;
  readonly gridSize: number;
  readonly gridModeEnabled: boolean;
};

export function toBoardScene(
  elements: readonly SceneElement[],
  appState: EditorAppState,
): BoardScene {
  return {
    version: BOARD_SCENE_VERSION,
    elements: elements
      .filter((element) => !element.isDeleted && !UNSTORED_ELEMENT_TYPES.has(String(element.type)))
      .map((element) => ({ ...element })),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridModeEnabled ? appState.gridSize : null,
    },
  };
}

export function toEditorData(scene: BoardScene) {
  const { viewBackgroundColor, gridSize } = scene.appState;
  return {
    elements: scene.elements,
    appState: {
      viewBackgroundColor,
      gridModeEnabled: gridSize != null,
      ...(gridSize != null && { gridSize }),
    },
    scrollToContent: true,
  };
}

/** Two scenes with the same key hold the same drawing: every element bumps its version on change. */
export function sceneKey(scene: BoardScene): string {
  const { viewBackgroundColor, gridSize } = scene.appState;
  let key = `${viewBackgroundColor}|${gridSize ?? ""}`;
  for (const element of scene.elements) key += `|${String(element.id)}:${String(element.version)}`;
  return key;
}

function editVersion(elements: readonly SceneElement[], appState: EditorAppState): string {
  let total = 0;
  for (const element of elements) total += element.version;
  const grid = appState.gridModeEnabled ? appState.gridSize : "";
  return `${elements.length}|${total}|${appState.viewBackgroundColor}|${grid}`;
}

/**
 * Decides which editor changes reach the board. `noticed` is cheap enough for every Excalidraw
 * change event and ignores scroll, zoom and selection; `take` returns the scene to send, or null
 * when it equals the last one sent.
 */
export class SceneChangeGate {
  private lastSentKey: string;
  private lastSeenVersion: string | null = null;

  constructor(initialScene: BoardScene) {
    this.lastSentKey = sceneKey(initialScene);
  }

  noticed(elements: readonly SceneElement[], appState: EditorAppState): boolean {
    const version = editVersion(elements, appState);
    if (version === this.lastSeenVersion) return false;
    this.lastSeenVersion = version;
    return true;
  }

  take(elements: readonly SceneElement[], appState: EditorAppState): BoardScene | null {
    const scene = toBoardScene(elements, appState);
    const key = sceneKey(scene);
    if (key === this.lastSentKey) return null;
    this.lastSentKey = key;
    return scene;
  }
}

export function editorTheme(dataTheme: string | null): "light" | "dark" {
  return dataTheme === "dark" ? "dark" : "light";
}
