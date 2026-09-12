import { describe, expect, it } from "vitest";
import {
  activityStatusSchema,
  createActivityStatusInput,
} from "../lib/repositories/activity-status";

describe("activity-status schemas", () => {
  it("accepts a valid row", () => {
    const row = { ActivityStatusId: 1, Name: "In Progress", SortOrder: 2 };
    expect(activityStatusSchema.parse(row)).toEqual(row);
  });

  it("rejects an empty name on create", () => {
    expect(() => createActivityStatusInput.parse({ name: "  ", sortOrder: 0 })).toThrow();
  });

  it("defaults sortOrder to 0", () => {
    expect(createActivityStatusInput.parse({ name: "Completed" }).sortOrder).toBe(0);
  });

  it("rejects non-integer ids", () => {
    expect(() =>
      activityStatusSchema.parse({ ActivityStatusId: 1.5, Name: "x", SortOrder: 0 }),
    ).toThrow();
  });
});
