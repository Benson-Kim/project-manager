import { describe, expect, it } from "vitest";
import { actorAccessSchema, rowAllows } from "../actor-access";

describe("per-row access (ADR-0023)", () => {
  it("parses the ActorAccess column of list rows", () => {
    expect(actorAccessSchema.parse("Contributor")).toBe("Contributor");
    expect(actorAccessSchema.parse(null)).toBeNull();
    expect(actorAccessSchema.safeParse("Owner").success).toBe(false);
  });

  it("gates a row by its level, with the same table as the page buttons", () => {
    const canEditActivity = rowAllows("daily-activities:update");
    expect(canEditActivity({ ActorAccess: "Viewer" })).toBe(false);
    expect(canEditActivity({ ActorAccess: "Contributor" })).toBe(true);
    expect(canEditActivity({ ActorAccess: null })).toBe(false);

    const canEditDeliverable = rowAllows("key-deliverables:update");
    expect(canEditDeliverable({ ActorAccess: "Contributor" })).toBe(false);
    expect(canEditDeliverable({ ActorAccess: "Manager" })).toBe(true);
  });
});
