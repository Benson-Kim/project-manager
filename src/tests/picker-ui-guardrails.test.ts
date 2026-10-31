import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: both option pickers float a listbox over the page, and their
 * options commit on mousedown. A panel that stays open after a choice therefore swallows the next
 * click, which is how the first Playwright run of the requirement sheet lost its Save button. The
 * rule for both: choosing closes the panel, and a click on the input reopens it.
 */
const MULTI = "src/components/ui/form/multi-select.tsx";
const COMBO = "src/components/ui/form/combobox.tsx";
const MENU = "src/components/ui/menu.tsx";

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

  it("places the multi-select's panel against the whole field, so opening up never covers a chip", () => {
    expect(source(MULTI)).toContain("usePopoverPlacement(fieldRef, listRef");
    expect(source(MULTI)).toContain('<div ref={fieldRef} className="relative">');
  });

  it("draws the multi-select's chips inside the box, before the text", () => {
    const multi = source(MULTI);
    expect(multi.indexOf("<ChipTag")).toBeGreaterThan(multi.indexOf("flex min-h-11 flex-wrap"));
    expect(multi.search(/<input\s+ref=\{inputRef\}/)).toBeGreaterThan(multi.indexOf("<ChipTag"));
    expect(multi).toContain('e.key === "Backspace" && query === ""');
  });

  it.each([MULTI, COMBO, MENU])(
    "%s lets the shared placement put its panel in the window, so no scrolling box squeezes it",
    (path) => {
      // A panel placed inside its box (absolute, bottom-full) is cut by any form or sheet that
      // scrolls, and flips up into a two-row strip in a short dialog.
      const text = source(path);
      expect(text).toContain("usePopoverPlacement(");
      expect(text).toMatch(/className="fixed z-\(--z-dropdown\)/);
      expect(text).not.toContain("bottom-full");
      expect(text).not.toContain("absolute z-(--z-dropdown)");
    },
  );

  it.each([MULTI, COMBO])("%s floats the panel on the dropdown layer", (path) => {
    // --z-dropdown (55) sits above --z-sheet and --z-dialog, so the panel is not ordered against
    // the overlay it opens inside.
    expect(source(path)).toContain("z-(--z-dropdown)");
    expect(source(path)).not.toContain("z-(--z-dialog)");
  });
});
