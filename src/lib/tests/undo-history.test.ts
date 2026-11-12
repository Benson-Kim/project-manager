import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  forgetTargets,
  nextStep,
  outcomeOf,
  recordStep,
  settleStep,
  type History,
  type UndoStep,
} from "../undo/history";
import { createStep, editStep, recordKey, VersionBook } from "../undo/steps";

const step = (label: string, target = label): UndoStep => ({
  label,
  targets: () => [target],
  undo: async () => "done",
  redo: async () => "done",
});

const labels = (steps: readonly UndoStep[]) => steps.map((s) => s.label);

function recordAll(count: number, history: History = EMPTY_HISTORY): History {
  let next = history;
  for (let i = 1; i <= count; i++) next = recordStep(next, step(`s${i}`));
  return next;
}

describe("page undo history", () => {
  it(`keeps the newest ${HISTORY_LIMIT} changes and no more`, () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(30);
    const history = recordAll(HISTORY_LIMIT + 5);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0].label).toBe("s6");
    expect(nextStep(history, "undo")?.label).toBe(`s${HISTORY_LIMIT + 5}`);
  });

  it(`can make ${HISTORY_LIMIT} undone changes again`, () => {
    let history = recordAll(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      history = settleStep(history, "undo", nextStep(history, "undo")!, "done");
    }
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(HISTORY_LIMIT);
    expect(nextStep(history, "redo")?.label).toBe("s1");
  });

  it("moves an undone step to Redo and a redone one back", () => {
    let history = recordAll(2);
    history = settleStep(history, "undo", nextStep(history, "undo")!, "done");
    expect(labels(history.past)).toEqual(["s1"]);
    expect(labels(history.future)).toEqual(["s2"]);
    history = settleStep(history, "redo", nextStep(history, "redo")!, "done");
    expect(labels(history.past)).toEqual(["s1", "s2"]);
    expect(history.future).toHaveLength(0);
  });

  it("branches: a new change after an undo empties Redo", () => {
    let history = recordAll(3);
    history = settleStep(history, "undo", nextStep(history, "undo")!, "done");
    history = settleStep(history, "undo", nextStep(history, "undo")!, "done");
    expect(history.future).toHaveLength(2);
    history = recordStep(history, step("new"));
    expect(labels(history.past)).toEqual(["s1", "new"]);
    expect(history.future).toHaveLength(0);
  });

  it("on a conflict drops every step on that record, both ways, and keeps the others", () => {
    let history = EMPTY_HISTORY;
    history = recordStep(history, step("a1", "todo:1"));
    history = recordStep(history, step("b", "todo:2"));
    history = recordStep(history, step("a2", "todo:1"));
    history = settleStep(history, "undo", nextStep(history, "undo")!, "done");
    history = settleStep(history, "undo", nextStep(history, "undo")!, "done");
    expect(labels(history.future)).toEqual(["a2", "b"]);
    history = settleStep(history, "undo", nextStep(history, "undo")!, "stale");
    expect(history.past).toHaveLength(0);
    expect(labels(history.future)).toEqual(["b"]);
  });

  it("leaves a step to try again when the server could not be reached", () => {
    const history = recordAll(2);
    expect(settleStep(history, "undo", nextStep(history, "undo")!, "failed")).toBe(history);
  });

  it("forgets the steps on given records only", () => {
    const history = recordStep(recordStep(EMPTY_HISTORY, step("x", "r:1")), step("y", "r:2"));
    expect(labels(forgetTargets(history, ["r:1"]).past)).toEqual(["y"]);
  });

  it("calls a refusal stale only when trying again cannot help", () => {
    const fail = (code: string) =>
      outcomeOf({ ok: false, error: { code: code as never, message: "" } });
    expect(outcomeOf({ ok: true, data: null })).toBe("done");
    for (const code of ["CONFLICT", "NOT_FOUND", "FORBIDDEN", "FORBIDDEN_ROW", "VALIDATION"]) {
      expect(fail(code)).toBe("stale");
    }
    for (const code of ["INTERNAL", "RATE_LIMITED", "UNAUTHENTICATED"]) {
      expect(fail(code)).toBe("failed");
    }
  });
});

interface Row {
  id: number;
  status: string;
  RowVer: string;
}

describe("edit and create steps", () => {
  const ok = <T>(data: T) => ({ ok: true as const, data });
  const conflict = { ok: false as const, error: { code: "CONFLICT" as const, message: "" } };

  function statusEdit(book: VersionBook, write: ReturnType<typeof vi.fn>) {
    return editStep<Row>({
      label: "Status",
      key: recordKey("todo-items", 1),
      row: { id: 1, status: "Open", RowVer: "v1" },
      saved: { status: "Done", RowVer: "v2" },
      before: { status: "Open" },
      after: { status: "Done" },
      book,
      current: (row) => ({ status: row.status }),
      write: write as never,
    });
  }

  it("writes back with the version this user's last save returned", async () => {
    const book = new VersionBook();
    const write = vi.fn(async (row: Row, values: Record<string, string>) =>
      ok({ ...row, ...values, RowVer: row.RowVer === "v2" ? "v3" : "v4" }),
    );
    const edit = statusEdit(book, write);
    expect(await edit.undo()).toBe("done");
    expect(write.mock.calls[0][0].RowVer).toBe("v2");
    expect(write.mock.calls[0][1]).toEqual({ status: "Open" });
    expect(await edit.redo()).toBe("done");
    expect(write.mock.calls[1][0].RowVer).toBe("v3");
    expect(write.mock.calls[1][1]).toEqual({ status: "Done" });
  });

  it("is stale, and writes nothing, when the field no longer holds what the change left", async () => {
    const book = new VersionBook();
    const write = vi.fn();
    const edit = statusEdit(book, write);
    book.wrote(recordKey("todo-items", 1), { id: 1, status: "Blocked", RowVer: "v9" });
    expect(await edit.undo()).toBe("stale");
    expect(write).not.toHaveBeenCalled();
  });

  it("is stale when the server refuses the version (another user's change)", async () => {
    const edit = statusEdit(
      new VersionBook(),
      vi.fn(async () => conflict),
    );
    expect(await edit.undo()).toBe("stale");
  });

  it("takes a new record back by deleting it, and adds it anew on Redo", async () => {
    const book = new VersionBook();
    const remove = vi.fn(async () => ok(null));
    const add = vi.fn(async () => ok({ id: 8, status: "Open", RowVer: "n1" }));
    const created = createStep<Row>({
      label: "new row",
      created: { id: 7, status: "Open", RowVer: "c1" },
      keyOf: (row) => recordKey("todo-items", row.id),
      book,
      remove,
      add,
    });
    expect(created.targets()).toEqual(["todo-items:7"]);
    book.wrote("todo-items:7", { RowVer: "c2" });
    expect(await created.undo()).toBe("done");
    expect(remove).toHaveBeenCalledWith({ id: 7, status: "Open", RowVer: "c2" });
    expect(await created.redo()).toBe("done");
    expect(created.targets()).toEqual(["todo-items:8"]);
  });
});
