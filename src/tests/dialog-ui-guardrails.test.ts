import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: every dialog shares one title bar and one row of buttons. A form that set its own
 * width (sm:w-80) inside the 480 px dialog left its fields short of the edge, and items-stretch
 * pulled its Save button across the whole form.
 */
const DIALOG = "src/components/ui/dialog.tsx";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

/** A top-level function of dialog.tsx, from `head` to its closing brace. */
function fn(head: string): string {
  const text = source(DIALOG);
  const start = text.indexOf(head);
  expect(start, `${DIALOG}: ${head}`).toBeGreaterThan(-1);
  const length = text.slice(start).search(/\r?\n\}\r?\n/);
  expect(length, `${DIALOG}: end of ${head}`).toBeGreaterThan(0);
  return text.slice(start, start + length);
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const usesActions = tsxFiles("src").filter((path) =>
  /import \{[^}]*\bDialogActions\b[^}]*\} from "@\/components\/ui\/dialog"/.test(source(path)),
);

describe("dialogs share one title bar and one row of buttons", () => {
  it("draws the title bar on a subtle band with a line under it", () => {
    const header = fn("function Header(");
    expect(header).toContain("bg-surface-raised");
    expect(header).toContain("border-b border-line");
    expect(header).toContain("<CloseButton />");
  });

  it("puts Cancel before the action, on a row with no band or line of its own", () => {
    const actions = fn("export function DialogActions(");
    expect(actions).toContain("justify-end");
    expect(actions).not.toMatch(/\bbg-|\bborder\b|\bborder-t\b/);
    expect(actions.indexOf("messages.actions.cancel")).toBeLessThan(actions.indexOf("{children}"));
  });

  it("does not clip the dialog box, so a dropdown inside it can reach past its edge", () => {
    const dialog = fn("export function Dialog(");
    expect(dialog).toContain("<Header");
    expect(dialog).not.toContain("overflow-hidden");
  });

  it("is used by the forms that open in a dialog", () => {
    expect(usesActions.length).toBeGreaterThanOrEqual(9);
  });

  it.each(usesActions)(
    "%s lets its fields fill the dialog and keeps its buttons their own size",
    (path) => {
      const text = source(path);
      expect(text).not.toContain("items-stretch");
      expect(text).not.toMatch(/\bsm:w-/);
    },
  );
});
