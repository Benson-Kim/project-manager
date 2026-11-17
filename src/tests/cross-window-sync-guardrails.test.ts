import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: a save in one window shows in the app's other windows. The shell listens on the
 * channel, and the shared save paths post to it after every successful save.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const POSTERS = [
  "src/components/ui/form/use-sheet-form-actions.ts",
  "src/components/ui/data-view/datasheet.ts",
  "src/modules/todo-items/components/todo-item-sheet.tsx",
  "src/modules/todo-items/components/todo-occurrence-dialog.tsx",
  "src/modules/todo-items/components/todo-recurrence-section.tsx",
  "src/modules/todo-items/components/todo-view.tsx",
  "src/modules/boards/components/board-form.tsx",
  "src/modules/boards/components/board-confirm.tsx",
  "src/modules/boards/components/board-workspace.tsx",
  "src/modules/bpmn/components/use-diagram-save.ts",
];

const LISTENERS = new Set(["src/components/shell/cross-window-sync.tsx"]);

const sources = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });

describe("cross-window sync", () => {
  it("the app shell mounts the listener", () => {
    expect(read("src/components/shell/app-shell.tsx")).toMatch(/<CrossWindowSync \/>/);
  });

  it("desktop windows share one session, so the channel reaches all of them", () => {
    expect(read("electron/main.ts")).not.toMatch(/partition|fromPartition/);
  });

  it("every view that reloads after a save also tells the other windows", () => {
    const silent = [...sources("src/components"), ...sources("src/modules")].filter(
      (path) =>
        !LISTENERS.has(path) &&
        /router\.refresh\(\);/.test(read(path)) &&
        !read(path).includes('import { notifySaved } from "@/lib/cross-window";'),
    );
    expect(silent).toEqual([]);
  });

  it("no view keeps its own refresh-on-focus", () => {
    const own = [...sources("src/components"), ...sources("src/modules")].filter(
      (path) =>
        /useRefreshOnFocus|addEventListener\("focus"/.test(read(path)) && !LISTENERS.has(path),
    );
    expect(own).toEqual([]);
  });

  it.each(POSTERS)("%s tells the other windows after each save", (path) => {
    const source = read(path);
    expect(source).toContain('import { notifySaved } from "@/lib/cross-window";');
    const refreshes = source.match(/router\.refresh\(\);/g)?.length ?? 0;
    const posts = source.match(/notifySaved\(\);/g)?.length ?? 0;
    expect(posts).toBeGreaterThanOrEqual(path.endsWith("datasheet.ts") ? 1 : refreshes - 1);
    expect(posts).toBeGreaterThan(0);
  });
});
