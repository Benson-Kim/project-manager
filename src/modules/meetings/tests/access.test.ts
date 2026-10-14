import { describe, expect, it } from "vitest";
import { rowAllows } from "@/lib/auth/actor-access";
import { canInProject } from "@/lib/auth/rbac";

/**
 * Who may do what with meetings inside a project (ADR-0021, ADR-0028 §2): the
 * page's buttons and the datasheet's cells follow these, and the procs check
 * the same levels. A Contributor writes but never deletes; a Viewer reads.
 */
describe("meeting access by project level", () => {
  it.each([
    ["Viewer", false, false, false],
    ["Contributor", true, true, false],
    ["Manager", true, true, true],
  ] as const)("%s: create %s, update %s, delete %s", (level, create, update, del) => {
    expect(canInProject(level, "meetings:read")).toBe(true);
    expect(canInProject(level, "meetings:create")).toBe(create);
    expect(canInProject(level, "meetings:update")).toBe(update);
    expect(canInProject(level, "meetings:delete")).toBe(del);
  });

  it("gates datasheet cells per row, with a member's overrides", () => {
    const canEdit = rowAllows("meetings:update");
    expect(canEdit({ ActorAccess: "Viewer", ActorGrants: null, ActorRevokes: null })).toBe(false);
    expect(canEdit({ ActorAccess: "Viewer", ActorGrants: "update", ActorRevokes: null })).toBe(
      true,
    );
    expect(canEdit({ ActorAccess: "Contributor", ActorGrants: null, ActorRevokes: "update" })).toBe(
      false,
    );
    expect(canEdit({ ActorAccess: null, ActorGrants: null, ActorRevokes: null })).toBe(false);
  });
});
