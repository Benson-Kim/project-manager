import { describe, it, expect } from "vitest";
import { buildNewEntityHref, guardProjectScope } from "../project-page-helpers";

describe("buildNewEntityHref", () => {
  it("adds id=new to an empty param set", () => {
    expect(buildNewEntityHref("/projects/1/stakeholders", {})).toBe(
      "/projects/1/stakeholders?id=new",
    );
  });

  it("preserves existing params and replaces old id", () => {
    const result = buildNewEntityHref("/projects/1/suppliers", { q: "acme", id: "5" });
    expect(result).toContain("q=acme");
    expect(result).toContain("id=new");
    expect(result).not.toContain("id=5");
  });

  it("uses a custom paramName for deliverables (d=new)", () => {
    expect(buildNewEntityHref("/projects/1/deliverables", {}, "d")).toBe(
      "/projects/1/deliverables?d=new",
    );
  });

  it("skips undefined values in raw params", () => {
    const result = buildNewEntityHref("/p/1/s", { q: undefined });
    expect(result).toBe("/p/1/s?id=new");
  });

  it("excludes the paramName key regardless of value", () => {
    const result = buildNewEntityHref("/p/1/s", { id: "99", view: "list" });
    expect(result).toContain("id=new");
    expect(result).toContain("view=list");
    expect(result).not.toContain("id=99");
  });
});

describe("guardProjectScope", () => {
  it("returns the entity when ProjectId matches", () => {
    const entity = { ProjectId: 42, Name: "X" };
    expect(guardProjectScope(entity, 42)).toBe(entity);
  });

  it("returns null when ProjectId differs", () => {
    expect(guardProjectScope({ ProjectId: 99, Name: "X" }, 42)).toBeNull();
  });

  it("returns null when entity ProjectId is null (nullable FK schema)", () => {
    expect(guardProjectScope({ ProjectId: null, Name: "X" }, 42)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(guardProjectScope(null, 42)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(guardProjectScope(undefined, 42)).toBeNull();
  });
});
