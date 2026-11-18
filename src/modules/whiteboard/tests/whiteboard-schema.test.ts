import { describe, expect, it } from "vitest";
import { toBoardScene } from "../components/excalidraw-scene";
import { BOARD_JSON_MAX_LENGTH, BOARD_SCENE_VERSION, EMPTY_BOARD_SCENE } from "../model/scene";
import {
  WHITEBOARD_NAME_MAX,
  boardSceneSchema,
  createWhiteboardInput,
  readBoardScene,
  saveWhiteboardInput,
} from "../schemas/whiteboard";

const scene = (elements: Record<string, unknown>[]) => ({
  version: BOARD_SCENE_VERSION,
  elements,
  appState: { viewBackgroundColor: "#ffffff", gridSize: null },
});
const rect = { id: "a", type: "rectangle", version: 1, x: 0, y: 0 };

describe("readBoardScene", () => {
  it("reads a stored board", () => {
    const stored = scene([rect]);
    expect(readBoardScene(JSON.stringify(stored))).toEqual({ scene: stored, readable: true });
  });

  it.each(["", "not json", "{}", JSON.stringify({ ...scene([]), version: 99 })])(
    "opens %j empty and unreadable, so nothing saves over it",
    (json) => {
      expect(readBoardScene(json)).toEqual({ scene: EMPTY_BOARD_SCENE, readable: false });
    },
  );
});

describe("boardSceneSchema", () => {
  it.each(["image", "embeddable", "iframe"])("refuses %s elements", (type) => {
    expect(boardSceneSchema.safeParse(scene([{ id: "x", type }])).success).toBe(false);
  });

  it("refuses a board over the size limit", () => {
    const big = { ...rect, text: "x".repeat(BOARD_JSON_MAX_LENGTH) };
    expect(boardSceneSchema.safeParse(scene([big])).success).toBe(false);
  });

  it("refuses stored files and unknown top-level fields", () => {
    expect(boardSceneSchema.safeParse({ ...scene([rect]), files: {} }).success).toBe(false);
  });

  it("keeps an element's own fields", () => {
    const parsed = boardSceneSchema.parse(scene([{ ...rect, strokeColor: "#000" }]));
    expect(parsed.elements[0]).toMatchObject({ strokeColor: "#000" });
  });

  it("refuses an element without an id or a type", () => {
    expect(boardSceneSchema.safeParse(scene([{ type: "line" }])).success).toBe(false);
    expect(boardSceneSchema.safeParse(scene([{ id: "a" }])).success).toBe(false);
  });

  it("keeps only the background and grid from appState", () => {
    const appState = { viewBackgroundColor: "#fafafa", gridSize: 20, collaborators: {}, zoom: 2 };
    const parsed = boardSceneSchema.parse({ ...scene([rect]), appState });
    expect(parsed.appState).toEqual({ viewBackgroundColor: "#fafafa", gridSize: 20 });
  });
});

describe("toBoardScene", () => {
  it("leaves out pasted pictures and web embeds so the board still saves", () => {
    const board = toBoardScene(
      [
        { id: "a", version: 1, type: "rectangle" },
        { id: "b", version: 1, type: "image" },
        { id: "c", version: 1, type: "embeddable" },
      ],
      { viewBackgroundColor: "#ffffff", gridSize: 20, gridModeEnabled: false },
    );
    expect(board.elements.map((element) => element.id)).toEqual(["a"]);
    expect(boardSceneSchema.safeParse(board).success).toBe(true);
  });
});

describe("whiteboard inputs", () => {
  it("trims names and keeps them within the limit", () => {
    expect(createWhiteboardInput.parse({ projectId: 1, name: "  Plan  " }).name).toBe("Plan");
    const long = "x".repeat(WHITEBOARD_NAME_MAX + 1);
    expect(createWhiteboardInput.safeParse({ projectId: 1, name: long }).success).toBe(false);
    expect(createWhiteboardInput.safeParse({ projectId: 1, name: "   " }).success).toBe(false);
  });

  it("refuses fields a save does not take", () => {
    const input = { whiteboardId: 1, board: scene([rect]), rowVer: 1 };
    expect(saveWhiteboardInput.safeParse(input).success).toBe(true);
    expect(saveWhiteboardInput.safeParse({ ...input, projectId: 2 }).success).toBe(false);
  });

  it("refuses ids that are not positive whole numbers", () => {
    for (const projectId of [0, -1, 1.5, "abc"]) {
      expect(createWhiteboardInput.safeParse({ projectId, name: "A" }).success).toBe(false);
    }
  });
});
