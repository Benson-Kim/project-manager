import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: both option pickers put an absolutely positioned listbox over the page, and their
 * options commit on mousedown. A panel that stays open after a choice therefore swallows the next
 * click, which is how the first Playwright run of the requirement sheet lost its Save button. The
 * rule for both: choosing closes the panel, and a click on the input reopens it.
 */
const MULTI = "src/components/ui/form/multi-select.tsx";
const COMBO = "src/components/ui/form/combobox.tsx";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

/** The text of a `const <name> = useCallback(…)` declaration, up to its closing line. */
function callback(path: string, name: string): string {
  const text = source(path);
  const start = text.indexOf(`const ${name} = useCallback(`);
  expect(start, `${path}: const ${name} = useCallback(`).toBeGreaterThan(-1);
  const end = text.indexOf("\n  );", start);
  expect(end, `${path}: end of ${name}`).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("an option picker closes its panel when it commits a choice", () => {
  it.each([
    [MULTI, "pick"],
    [COMBO, "select"],
  ])("%s closes the panel in %s()", (path, name) => {
    expect(callback(path, name)).toContain("setOpen(false)");
  });

  it.each([MULTI, COMBO])("%s reopens on a click, not only on focus", (path) => {
    // After a pick the input still has focus, so onFocus cannot bring the panel back.
    expect(source(path)).toContain("onClick={() => setOpen(true)}");
    expect(source(path)).toContain("onFocus={() => setOpen(true)}");
  });

  it.each([MULTI, COMBO])("%s takes the panel out of the tree when it is closed", (path) => {
    expect(source(path)).toContain("hidden={!open || filtered.length === 0}");
  });

  it.each([MULTI, COMBO])("%s floats the panel on the dropdown layer", (path) => {
    // --z-dropdown (55) sits above --z-sheet and --z-dialog, so the panel is not ordered against
    // the overlay it opens inside.
    expect(source(path)).toContain("z-(--z-dropdown)");
    expect(source(path)).not.toContain("z-(--z-dialog)");
  });
});
