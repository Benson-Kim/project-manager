import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: the hold asks for its reason before the status is written
 * (ADR-0044), so between the pick and the write there is a moment where the
 * select has moved and the row has not. An uncontrolled select keeps whatever
 * the user chose through that moment and past a cancel, leaving the list
 * showing a status nobody saved — the select has to follow the row.
 */
const FORMS = "src/modules/meetings/components/minutes-forms.tsx";
const TREE = "src/modules/meetings/components/minutes-tree.tsx";
const EDITOR = "src/modules/meetings/components/minutes-editor.tsx";

const source = (path: string) => readFileSync(path, "utf8");

describe("the status a list shows is the status the row has", () => {
  it("lets StatusSelect be controlled", () => {
    expect(source(FORMS)).toContain("{...(value === undefined ? { defaultValue } : { value })}");
  });

  it("gives the list's select the row's status as its value", () => {
    const cell = source(TREE);
    const select = cell.slice(cell.indexOf("export function ActionStatusCell"));
    expect(select).toContain("value={action.Status}");
    // A key that only changes with the status cannot undo a pick the status refused.
    expect(select.slice(0, select.indexOf("</StatusSelect>") + 1)).not.toContain(
      "key={action.Status}",
    );
  });
});

describe("the hold is one write, carrying its reason", () => {
  const editor = source(EDITOR);

  it("defers the hold to the dialog instead of writing it", () => {
    const setStatus = editor.slice(editor.indexOf("const setStatus = useCallback"));
    expect(setStatus).toContain('if (status === "on-hold")');
    expect(setStatus).toContain("setHolding({");
    // Every other status writes straight away, and clears the reason with it.
    expect(setStatus).toContain("writeStatus(id, rowVer, status, name, null);");
  });

  it("sends the status and the reason in the same call", () => {
    const write = editor.slice(editor.indexOf("const writeStatus = useCallback"));
    const call = write.slice(write.indexOf("setActionItemStatusAction({"));
    expect(call.slice(0, call.indexOf("})"))).toContain("onHoldReason: reason");
  });

  it("writes only once the dialog is answered, and never on cancel", () => {
    const dialog = editor.slice(editor.indexOf("<OnHoldReasonDialog"));
    expect(dialog).toContain("onCancel={() => setHolding(null)}");
    const confirm = dialog.slice(dialog.indexOf("onConfirm="));
    expect(confirm).toContain('writeStatus(holding.id, holding.rowVer, "on-hold"');
  });

  it("opens the dialog with the reason that action already carries", () => {
    // One dialog serves every row, so its state has to be keyed to the action.
    const dialog = editor.slice(editor.indexOf("<OnHoldReasonDialog"));
    expect(dialog).toContain("key={holding.id}");
    expect(dialog).toContain("current={holding.current}");
  });

  it("offers both ways out, because the reason is optional", () => {
    const forms = source(FORMS);
    expect(forms).toContain("onClick={() => onConfirm(null)}");
    expect(forms).toContain("onClick={() => onConfirm(reason.trim() || null)}");
  });
});

/**
 * Guardrail: the open and carried-over lists put an action's text and its
 * details on one wrapping row. With a zero flex-basis the row never wraps, so a
 * row with a person, a date, Overdue, its meeting, a status and a reason left the
 * text a few pixels wide and broke it mid-word. The text keeps a basis, and the
 * details move to the next line instead.
 */
describe("an action's text keeps its width in the summary lists", () => {
  const editor = source(EDITOR);

  it.each(["open-action", "carried-over-action"])("%s", (testId) => {
    const row = editor.slice(editor.indexOf(`data-testid="${testId}"`));
    const text = row.slice(row.indexOf("<span"), row.indexOf("{action.Action}"));
    expect(text).toContain("basis-48");
    expect(text).not.toContain("flex-1");
  });
});
