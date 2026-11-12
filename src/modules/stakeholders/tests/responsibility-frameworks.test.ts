import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESPONSIBILITY_FRAMEWORK_CODES,
  RESPONSIBILITY_FRAMEWORKS,
  assigneeRole,
  frameworkRole,
  isResponsibilityFrameworkCode,
  responsibilityFramework,
} from "../schemas/responsibility-frameworks";

const migration = readFileSync(
  join(process.cwd(), "db", "migrations", "071_responsibility_matrices.sql"),
  "utf8",
);

function seededFrameworks() {
  return [...migration.matchAll(/\(N'(\w+)', N'(WbsItem|Decision)', (\d+)\)/g)].map((m) => ({
    code: m[1],
    defaultRowKind: m[2],
    sortOrder: Number(m[3]),
  }));
}

function seededRoles() {
  return [
    ...migration.matchAll(/\(N'(\w+)', N'(\w+)', N'(\w+)', ([01]), ([01]), ([01]), (\d+)\)/g),
  ].map((m) => ({
    framework: m[1],
    code: m[2],
    abbrev: m[3],
    onePerRow: m[4] === "1",
    requiredPerRow: m[5] === "1",
    isAssigneeRole: m[6] === "1",
    sortOrder: Number(m[7]),
  }));
}

describe("responsibility framework registry", () => {
  it("lists the nine frameworks in seed order", () => {
    expect(RESPONSIBILITY_FRAMEWORKS.map((f) => f.code)).toEqual([
      ...RESPONSIBILITY_FRAMEWORK_CODES,
    ]);
    expect(seededFrameworks()).toEqual(
      RESPONSIBILITY_FRAMEWORKS.map((f, i) => ({
        code: f.code,
        defaultRowKind: f.defaultRowKind,
        sortOrder: i + 1,
      })),
    );
  });

  it("mirrors every seeded role, flag for flag and in order", () => {
    const fromRegistry = RESPONSIBILITY_FRAMEWORKS.flatMap((f) =>
      f.roles.map((r, i) => ({
        framework: f.code,
        code: r.code,
        abbrev: r.abbrev,
        onePerRow: r.onePerRow,
        requiredPerRow: r.requiredPerRow,
        isAssigneeRole: r.isAssigneeRole,
        sortOrder: i + 1,
      })),
    );
    expect(fromRegistry).toHaveLength(42);
    expect(seededRoles()).toEqual(fromRegistry);
  });

  it.each(RESPONSIBILITY_FRAMEWORKS)("$code has exactly one assignee role", (framework) => {
    expect(framework.roles.filter((r) => r.isAssigneeRole)).toHaveLength(1);
    expect(assigneeRole(framework).isAssigneeRole).toBe(true);
  });

  it.each(RESPONSIBILITY_FRAMEWORKS)("$code has a required role and unique codes", (framework) => {
    expect(framework.roles.some((r) => r.requiredPerRow)).toBe(true);
    expect(new Set(framework.roles.map((r) => r.code)).size).toBe(framework.roles.length);
    expect(new Set(framework.roles.map((r) => r.abbrev)).size).toBe(framework.roles.length);
  });

  it("names the single-holder roles of each framework", () => {
    const single = Object.fromEntries(
      RESPONSIBILITY_FRAMEWORKS.map((f) => [
        f.code,
        f.roles.filter((r) => r.onePerRow).map((r) => r.code),
      ]),
    );
    expect(single).toEqual({
      RACI: ["ACCOUNTABLE"],
      DACI: ["DRIVER", "APPROVER"],
      RAPID: ["DECIDE"],
      DARE: [],
      RASCI: ["ACCOUNTABLE"],
      RACI_VS: ["ACCOUNTABLE"],
      ARPA: ["ACCOUNTABLE"],
      MOCHA: ["MANAGER", "OWNER", "APPROVER"],
      RATSI: ["AUTHORITY"],
    });
  });

  it("looks frameworks and roles up by code", () => {
    expect(isResponsibilityFrameworkCode("RACI_VS")).toBe(true);
    expect(isResponsibilityFrameworkCode("raci")).toBe(false);
    const daci = responsibilityFramework("DACI");
    expect(daci.defaultRowKind).toBe("Decision");
    expect(frameworkRole(daci, "APPROVER")?.abbrev).toBe("A");
    expect(frameworkRole(daci, "ACCOUNTABLE")).toBeUndefined();
  });
});
