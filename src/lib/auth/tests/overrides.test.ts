import { describe, expect, it } from "vitest";
import { rowAllows } from "../actor-access";
import { allowsWithOverrides, type PermissionOverride } from "../rbac";

const overrides: PermissionOverride[] = [
  { module: "parking-lot", verb: "create", allowed: false },
  { module: "parking-lot", verb: "delete", allowed: true },
];

describe("per-person permission overrides (ADR-0024)", () => {
  it("an override decides for a member, both ways", () => {
    expect(allowsWithOverrides("Contributor", overrides, "parking-lot:create")).toBe(false);
    expect(allowsWithOverrides("Contributor", overrides, "parking-lot:delete")).toBe(true);
  });

  it("without an override the level decides; other sections are untouched", () => {
    expect(allowsWithOverrides("Contributor", overrides, "parking-lot:update")).toBe(true);
    expect(allowsWithOverrides("Contributor", overrides, "keywords:delete")).toBe(false);
    expect(allowsWithOverrides("Viewer", [], "keywords:create")).toBe(false);
  });

  it("a non-member (no level) gains nothing from an override", () => {
    expect(allowsWithOverrides(null, overrides, "parking-lot:delete")).toBe(false);
  });

  it("the datasheet row gate reads the row's grants and revokes", () => {
    const canAdd = rowAllows("parking-lot:create");
    const canDelete = rowAllows("parking-lot:delete");
    const row = {
      ActorAccess: "Contributor" as const,
      ActorGrants: "delete",
      ActorRevokes: "create",
    };
    expect(canAdd(row)).toBe(false);
    expect(canDelete(row)).toBe(true);
    expect(rowAllows("parking-lot:update")(row)).toBe(true);
    expect(canDelete({ ActorAccess: "Contributor" })).toBe(false);
    expect(canDelete({ ActorAccess: null, ActorGrants: "delete" })).toBe(false);
  });
});
