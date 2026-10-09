import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { listUserOptions } from "../repository/user-options";

describe("user options (team editor pick-list, ADR-0021)", () => {
  beforeEach(() => execProc.mockReset());

  it("lists active accounts as ids and display names only", async () => {
    execProc.mockResolvedValue([{ UserId: 4, DisplayName: "Erick Mwangi", Username: "erick" }]);
    expect(await listUserOptions(7)).toEqual([{ UserId: 4, DisplayName: "Erick Mwangi" }]);
    expect(execProc).toHaveBeenCalledWith("usp_User_ListOptions", { ActorUserId: 7, Search: null });
  });
});
