import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import { AppError } from "@/lib/errors";
import { listParamsSchema } from "@/lib/list-params";
import { getAuditEntry, listAuditLog } from "../repository/audit-log";
import { auditEntryIdParam } from "../schemas/audit-log";

function dbAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    AuditLogId: "41", // tedious returns BIGINT as a string
    ActorUserId: 1,
    ActorName: "Admin",
    ActorUsername: "admin",
    Action: "Update",
    EntityName: "app.Project",
    EntityId: "3",
    IpAddress: null,
    OccurredAtUtc: new Date("2026-11-04T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => execProc.mockReset());

describe("listAuditLog", () => {
  it("forwards the ADR-0016 params 1:1 with the actor", async () => {
    execProc.mockResolvedValue([]);
    await listAuditLog(listParamsSchema.parse({ q: "50%", page: "3" }), 9);
    expect(execProc).toHaveBeenCalledWith(
      "usp_Audit_List",
      expect.objectContaining({ ActorUserId: 9, ProjectId: null, Search: "50%", Page: 3 }),
    );
  });

  it("returns the page's rows and the proc's TotalCount", async () => {
    execProc.mockResolvedValue([
      { ...dbAuditRow(), TotalCount: "52" },
      { ...dbAuditRow({ AuditLogId: "40", ActorUserId: null }), TotalCount: "52" },
    ]);
    const { rows, totalCount } = await listAuditLog(listParamsSchema.parse({}), 1);
    expect(totalCount).toBe(52);
    expect(rows.map((r) => r.AuditLogId)).toEqual([41, 40]);
    expect(rows[0]).not.toHaveProperty("TotalCount");
  });

  it("reads an empty page as no entries", async () => {
    execProc.mockResolvedValue([]);
    await expect(listAuditLog(listParamsSchema.parse({}), 1)).resolves.toEqual({
      rows: [],
      totalCount: 0,
    });
  });
});

describe("getAuditEntry", () => {
  it("passes the id and the actor, and keeps both sides", async () => {
    execProc.mockResolvedValue([dbAuditRow({ BeforeJson: '{"A":1}', AfterJson: '{"A":2}' })]);
    const entry = await getAuditEntry(41, 7);
    expect(execProc).toHaveBeenCalledWith("usp_Audit_GetById", { AuditLogId: 41, ActorUserId: 7 });
    expect(entry).toMatchObject({ AuditLogId: 41, BeforeJson: '{"A":1}', AfterJson: '{"A":2}' });
  });

  it("is NOT_FOUND when the proc returns nothing", async () => {
    execProc.mockResolvedValue([]);
    await expect(getAuditEntry(41, 7)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAuditEntry(41, 7)).rejects.toBeInstanceOf(AppError);
  });
});

describe("auditEntryIdParam", () => {
  it("accepts a plain positive id", () => {
    expect(auditEntryIdParam.parse("41")).toBe(41);
  });

  it.each(["0", "-1", "1e3", "0x10", " 7", "7.5", "", "1234567890123456"])("refuses %j", (raw) => {
    expect(auditEntryIdParam.safeParse(raw).success).toBe(false);
  });
});
