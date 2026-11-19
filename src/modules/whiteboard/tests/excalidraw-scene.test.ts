import { describe, expect, it } from "vitest";
import {
  SceneChangeGate,
  editorTheme,
  sceneKey,
  toBoardScene,
  toEditorData,
  type EditorAppState,
  type SceneElement,
} from "../components/excalidraw-scene";
import { EMPTY_BOARD_SCENE, type BoardScene } from "../model/scene";

const rect = (id: string, version: number, extra: Record<string, unknown> = {}): SceneElement => ({
  id,
  version,
  type: "rectangle",
  ...extra,
});

const editor = (over: Partial<EditorAppState> = {}): EditorAppState => ({
  viewBackgroundColor: "#ffffff",
  gridSize: 20,
  gridModeEnabled: false,
  ...over,
});

describe("toBoardScene", () => {
  it("drops deleted elements and keeps only the background and grid", () => {
    const appState = { ...editor({ gridModeEnabled: true }), scrollX: 40, zoom: { value: 2 } };
    const scene = toBoardScene([rect("a", 1), rect("b", 3, { isDeleted: true })], appState);

    expect(scene).toEqual({
      version: 1,
      elements: [rect("a", 1)],
      appState: { viewBackgroundColor: "#ffffff", gridSize: 20 },
    });
  });

  it("stores a grid that is off as null", () => {
    expect(toBoardScene([], editor()).appState.gridSize).toBeNull();
  });
});

describe("toEditorData", () => {
  it("turns the stored grid back into the editor's grid mode", () => {
    const on = toEditorData({
      ...EMPTY_BOARD_SCENE,
      appState: { viewBackgroundColor: "#000", gridSize: 10 },
    });
    const off = toEditorData(EMPTY_BOARD_SCENE);

    expect(on.appState).toEqual({
      viewBackgroundColor: "#000",
      gridModeEnabled: true,
      gridSize: 10,
    });
    expect(off.appState).toEqual({ viewBackgroundColor: "#ffffff", gridModeEnabled: false });
  });

  it("round-trips through toBoardScene", () => {
    const scene: BoardScene = {
      version: 1,
      elements: [rect("a", 2)],
      appState: { viewBackgroundColor: "#fafafa", gridSize: 20 },
    };
    const data = toEditorData(scene);
    const back = toBoardScene(data.elements as SceneElement[], { ...editor(), ...data.appState });

    expect(back).toEqual(scene);
  });
});

describe("sceneKey", () => {
  it("changes when an element's version or the background changes", () => {
    const base = toBoardScene([rect("a", 1)], editor());

    expect(sceneKey(toBoardScene([rect("a", 1)], editor()))).toBe(sceneKey(base));
    expect(sceneKey(toBoardScene([rect("a", 2)], editor()))).not.toBe(sceneKey(base));
    expect(
      sceneKey(toBoardScene([rect("a", 1)], editor({ viewBackgroundColor: "#000" }))),
    ).not.toBe(sceneKey(base));
  });
});

describe("SceneChangeGate", () => {
  it("never sends the scene it started from", () => {
    const initial = toBoardScene([rect("a", 1)], editor());
    const gate = new SceneChangeGate(initial);

    expect(gate.noticed([rect("a", 1)], editor())).toBe(true);
    expect(gate.take([rect("a", 1)], editor())).toBeNull();
  });

  it("ignores editor-only changes such as scroll, zoom and selection", () => {
    const gate = new SceneChangeGate(EMPTY_BOARD_SCENE);
    const elements = [rect("a", 1)];

    expect(gate.noticed(elements, editor())).toBe(true);
    expect(gate.noticed(elements, { ...editor(), scrollX: 300 } as EditorAppState)).toBe(false);
    expect(gate.noticed(elements, editor())).toBe(false);
  });

  it("sends each new drawing once", () => {
    const gate = new SceneChangeGate(EMPTY_BOARD_SCENE);

    expect(gate.take([rect("a", 1)], editor())?.elements).toEqual([rect("a", 1)]);
    expect(gate.take([rect("a", 1)], editor())).toBeNull();
    expect(gate.take([rect("a", 2)], editor())?.elements).toEqual([rect("a", 2)]);
  });

  it("notices a deletion, a background change and a grid toggle", () => {
    const gate = new SceneChangeGate(toBoardScene([rect("a", 1)], editor()));
    gate.noticed([rect("a", 1)], editor());

    expect(gate.noticed([rect("a", 2, { isDeleted: true })], editor())).toBe(true);
    expect(
      gate.noticed([rect("a", 2, { isDeleted: true })], editor({ viewBackgroundColor: "#000" })),
    ).toBe(true);
    expect(
      gate.noticed(
        [rect("a", 2, { isDeleted: true })],
        editor({ viewBackgroundColor: "#000", gridModeEnabled: true }),
      ),
    ).toBe(true);
    expect(gate.take([rect("a", 2, { isDeleted: true })], editor())?.elements).toEqual([]);
  });
});

describe("editorTheme", () => {
  it("follows the app's resolved theme", () => {
    expect(editorTheme("dark")).toBe("dark");
    expect(editorTheme("light")).toBe("light");
    expect(editorTheme(null)).toBe("light");
  });
});
