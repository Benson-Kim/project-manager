import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CARDS_PER_PACKAGE } from "../schemas/board-rules";
import { packageRequirementsInput } from "../schemas/board-package";
const execProc = vi.fn();
vi.mock("@/lib/db", () => ({ execProc: (...args: unknown[]) => execProc(...args) }));
import { listPackagingRequirementOptions, packageRequirements } from "../repository/board-package";
const input = { boardId: 3, boardColumnId: 4, requirementIds: [21, 22] };
beforeEach(() => execProc.mockReset());
describe("requirement packaging contract and repository", () => {
  it("accepts the cap and rejects empty, oversized and invalid-id selections", () => {
    expect(
      packageRequirementsInput.safeParse({
        ...input,
        requirementIds: Array.from({ length: MAX_CARDS_PER_PACKAGE }, (_, i) => i + 1),
      }).success,
    ).toBe(true);
    for (const requirementIds of [
      [],
      [0],
      [-1],
      [1.5],
      Array.from({ length: MAX_CARDS_PER_PACKAGE + 1 }, (_, i) => i + 1),
    ]) {
      expect(packageRequirementsInput.safeParse({ ...input, requirementIds }).success).toBe(false);
    }
  });
  it("pins the exact atomic-package arguments and parses the result counts", async () => {
    execProc.mockResolvedValue([{ AddedCards: 1, SkippedCards: 1 }]);
    expect(
      await packageRequirements(
        { ...input, boardSprintId: 5, createdBy: 999, title: "Injected" } as typeof input,
        7,
      ),
    ).toEqual({ AddedCards: 1, SkippedCards: 1 });
    expect(execProc.mock.calls).toEqual([
      [
        "usp_BoardCard_Package",
        {
          BoardId: 3,
          BoardColumnId: 4,
          BoardSprintId: 5,
          RequirementIds: "[21,22]",
          ActorUserId: 7,
        },
      ],
    ]);
  });
  it("defaults to the backlog, skips duplicates in-proc and refuses result drift", async () => {
    execProc.mockResolvedValue([{ AddedCards: 0, SkippedCards: 2 }]);
    expect(await packageRequirements(input, 7)).toEqual({ AddedCards: 0, SkippedCards: 2 });
    expect(execProc.mock.calls[0][1].BoardSprintId).toBeNull();
    execProc.mockResolvedValue([{ AddedCards: "wrong", SkippedCards: 0 }]);
    await expect(packageRequirements(input, 7)).rejects.toThrow();
  });
  it("validates before sending any mutation", async () => {
    await expect(packageRequirements({ ...input, requirementIds: [] }, 7)).rejects.toThrow();
    expect(execProc).not.toHaveBeenCalled();
  });
  it("reads every live type with hierarchical references through its own proc", async () => {
    execProc.mockResolvedValue(
      ["BR", "SR", "FR", "NFR", "TR"].map((type, i) => ({
        RequirementId: i + 1,
        RequirementType: type,
        Ref: `${type}-1.2`,
        Requirement: `${type} work`,
      })),
    );
    const options = await listPackagingRequirementOptions(2, 7);
    expect(options.map((option) => option.ref)).toEqual([
      "BR-1.2",
      "SR-1.2",
      "FR-1.2",
      "NFR-1.2",
      "TR-1.2",
    ]);
    expect(execProc.mock.calls).toEqual([
      ["usp_Requirement_ListPackagingOptions", { ProjectId: 2, ActorUserId: 7 }],
    ]);
    execProc.mockResolvedValue([{ RequirementId: "invalid" }]);
    await expect(listPackagingRequirementOptions(2, 7)).rejects.toThrow();
  });
});
