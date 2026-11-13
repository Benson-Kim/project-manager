import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = { id: "tx" };
const execProcTx = vi.fn();
const execProc = vi.fn();
const withTransaction = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...a: unknown[]) => execProc(...a) as Promise<unknown[]>,
  execProcSets: vi.fn(),
  execProcTx: (...a: unknown[]) => execProcTx(...a) as Promise<unknown[]>,
  withTransaction: (fn: (t: unknown) => Promise<unknown>) =>
    withTransaction(fn) as Promise<unknown>,
}));

import { setResponsibilityCells } from "../repository/responsibility";

const write = (
  stakeholderId: number,
  roleCode: string | null,
  expectedRoleCode: string | null,
) => ({
  row: { kind: "WbsItem" as const, keyDeliverableId: 5 },
  stakeholderId,
  roleCode,
  expectedRoleCode,
});

const input = (writes: ReturnType<typeof write>[]) => ({ projectId: 1, matrixId: 2, writes });

describe("setResponsibilityCells", () => {
  beforeEach(() => {
    execProcTx.mockReset();
    execProc.mockReset();
    withTransaction.mockReset();
    withTransaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx));
  });

  it("applies every cell inside one transaction, never outside it", async () => {
    execProcTx.mockResolvedValue([{ RoleCode: null, KeyDeliverableRowVer: null }]);
    const out = await setResponsibilityCells(input([write(3, null, "A"), write(4, "A", null)]), 9);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(execProc).not.toHaveBeenCalled();
    expect(execProcTx).toHaveBeenCalledTimes(2);
    expect(execProcTx.mock.calls.map((c) => c[0])).toEqual([tx, tx]);
    expect(
      execProcTx.mock.calls.map((c) => (c[2] as { StakeholderId: number }).StakeholderId),
    ).toEqual([3, 4]);
    expect(execProcTx.mock.calls[0]?.[2]).toMatchObject({
      KeyDeliverableId: 5,
      RoleCode: null,
      ExpectedRoleCode: "A",
      MoveSingle: false,
      ActorUserId: 9,
    });
    expect(out).toHaveLength(2);
  });

  it("stops at the first refused cell and lets the transaction roll back", async () => {
    execProcTx
      .mockResolvedValueOnce([{ RoleCode: null, KeyDeliverableRowVer: null }])
      .mockRejectedValueOnce(new Error("CONFLICT"))
      .mockResolvedValue([{ RoleCode: null, KeyDeliverableRowVer: null }]);
    await expect(
      setResponsibilityCells(
        input([write(3, null, "A"), write(4, "A", null), write(5, "A", null)]),
        9,
      ),
    ).rejects.toThrow("CONFLICT");
    expect(execProcTx).toHaveBeenCalledTimes(2);
  });

  it("refuses an empty change", async () => {
    await expect(setResponsibilityCells(input([]), 9)).rejects.toThrow();
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
