import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Session } from "@/lib/auth/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

const session: Session = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: { getSession: () => Promise.resolve(session), requireSession: async () => session },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
  execProcSets: vi.fn(),
}));

import { saveProjectMathStateAction } from "../actions";
import { getProjectMathState } from "../repository/project-math-state";
import { readProjectMathState, savedOr } from "../schemas/project-math-state";

const rows = z.array(z.object({ id: z.number(), cost: z.string() }));
const seed = [{ id: 1, cost: "100" }];

describe("saved project math", () => {
  beforeEach(() => execProc.mockReset());

  it("keeps a card's saved values only while they fit its shape", () => {
    expect(savedOr(rows, [{ id: 3, cost: "5" }], seed)).toEqual([{ id: 3, cost: "5" }]);
    expect(savedOr(rows, undefined, seed)).toBe(seed);
    expect(savedOr(rows, [{ id: "x" }], seed)).toBe(seed);
    expect(savedOr(rows, "garbage", seed)).toBe(seed);
  });

  it("reads a stored state and treats an unreadable one as nothing saved", () => {
    expect(readProjectMathState('{"currency":"EUR","cards":{"cost":[1]}}')).toEqual({
      currency: "EUR",
      added: [],
      cards: { cost: [1] },
    });
    expect(readProjectMathState("not json")).toBeNull();
    expect(readProjectMathState('{"added":"EUR"}')).toBeNull();
    expect(readProjectMathState(null)).toBeNull();
  });

  it("loads nothing when the project has no saved inputs", async () => {
    execProc.mockResolvedValue([]);
    expect(await getProjectMathState(2, 7)).toEqual({ state: null, rowVer: null });
    execProc.mockResolvedValue([{ StateJson: '{"added":["EUR"]}', RowVer: "12" }]);
    expect(await getProjectMathState(2, 7)).toEqual({
      state: { added: ["EUR"], cards: {} },
      rowVer: 12,
    });
  });

  it("saves as the signed-in user and returns the new version", async () => {
    execProc.mockResolvedValue([{ RowVer: "13", UpdatedAtUtc: new Date() }]);
    const state = { currency: "USD", added: [], cards: { cost: [{ id: 1 }] } };
    expect(await saveProjectMathStateAction({ projectId: 2, state, rowVer: 12 })).toEqual({
      ok: true,
      data: { rowVer: 13 },
    });
    expect(execProc.mock.lastCall).toEqual([
      "usp_ProjectMathState_Save",
      { ProjectId: 2, StateJson: JSON.stringify(state), RowVer: 12, ActorUserId: 7 },
    ]);
  });

  it("refuses a state too large to store", async () => {
    const big = { added: [], cards: { cost: "x".repeat(70000) } };
    const result = await saveProjectMathStateAction({ projectId: 2, state: big });
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });
});
