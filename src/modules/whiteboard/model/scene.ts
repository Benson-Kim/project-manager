export const BOARD_SCENE_VERSION = 1 as const;

export const BOARD_JSON_MAX_LENGTH = 800_000;

/** Pictures and web embeds load content from outside the board, so a board never stores them. */
export const UNSTORED_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  "image",
  "embeddable",
  "iframe",
]);

export type BoardAppState = {
  viewBackgroundColor: string;
  gridSize?: number | null;
};

export type BoardScene = {
  version: typeof BOARD_SCENE_VERSION;
  elements: readonly Record<string, unknown>[];
  appState: BoardAppState;
};

export const EMPTY_BOARD_SCENE: BoardScene = {
  version: BOARD_SCENE_VERSION,
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
};
