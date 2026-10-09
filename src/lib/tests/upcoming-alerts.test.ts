import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUpcomingAlerts } from "../repositories/upcoming-alerts";
import { execProc } from "../db";

vi.mock("../db", () => ({ execProc: vi.fn() }));

const mockExecProc = vi.mocked(execProc);

const baseRow = {
  TodoItemId: 3,
  TodoItem: "Create purchase orders table",
  DueDate: "2024-12-24",
  AlertType: "Overdue",
};

describe("getUpcomingAlerts", () => {
  beforeEach(() => {
    mockExecProc.mockReset();
  });

  it("calls usp_Todo_GetUpcomingAlerts and maps rows", async () => {
    mockExecProc.mockResolvedValue([baseRow]);
    const alerts = await getUpcomingAlerts(7);
    expect(mockExecProc).toHaveBeenCalledWith("usp_Todo_GetUpcomingAlerts", { ActorUserId: 7 });
    expect(alerts).toEqual([
      {
        id: 3,
        title: "Create purchase orders table",
        dueDate: new Date("2024-12-24"),
        alertType: "Overdue",
      },
    ]);
  });

  it("de-duplicates joined alert rows per to-do item and keeps null titles", async () => {
    mockExecProc.mockResolvedValue([
      baseRow,
      { ...baseRow, AlertType: "Overdue" },
      { TodoItemId: 26, TodoItem: null, DueDate: "2025-01-08", AlertType: "Normal" },
    ]);
    const alerts = await getUpcomingAlerts(1);
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toMatchObject({ id: 26, title: null });
  });

  it("rejects malformed rows", async () => {
    mockExecProc.mockResolvedValue([{ TodoItemId: "x" }]);
    await expect(getUpcomingAlerts(1)).rejects.toThrow();
  });
});
