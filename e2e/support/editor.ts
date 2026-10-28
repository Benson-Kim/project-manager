import { expect, type Locator } from "@playwright/test";

interface TiptapDom {
  editor: {
    state: {
      selection: {
        $from: {
          depth: number;
          parent: { textContent: string };
          node(depth: number): { type: { name: string } };
        };
      };
    };
  };
}

/**
 * Waits until the editor itself has its caret where the test expects it. The editor takes a
 * caret move from the browser's selectionchange a task later, and it puts its own selection
 * back about 20 ms after a menu pick returns focus to it; keys sent before that land in the
 * wrong place. `where` names the caret's block text, or a node it must be inside.
 */
export async function caretAt(editor: Locator, where: { text: string } | { inside: string }) {
  const caret = () =>
    editor.evaluate((el) => {
      const { $from } = (el as unknown as TiptapDom).editor.state.selection;
      const path: string[] = [];
      for (let depth = $from.depth; depth > 0; depth -= 1) path.push($from.node(depth).type.name);
      return { text: $from.parent.textContent, path };
    });
  if ("text" in where) await expect.poll(async () => (await caret()).text).toBe(where.text);
  else await expect.poll(async () => (await caret()).path).toContain(where.inside);
}
