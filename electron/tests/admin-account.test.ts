import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAdminAccount, resetAdminPassword } from "../admin-account";

const db = vi.hoisted(() => ({ queries: [] as string[], activeAdmins: 0 }));

vi.mock("../db", () => {
  const request = () => {
    const req = {
      input: () => req,
      query: async (text: string) => {
        db.queries.push(text);
        if (text.includes("COUNT(*)")) return { recordset: [{ n: db.activeAdmins }] };
        return { recordset: [{ outcome: "created" }] };
      },
    };
    return req;
  };
  return {
    sql: { NVarChar: "NVarChar" },
    connect: async () => ({ request, close: async () => undefined }),
  };
});

const argon2 = { argon2id: 2, hash: async () => "$argon2id$v=19$fake" };
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const target = {
  host: "127.0.0.1",
  port: 1433,
  user: "pm",
  password: "x",
  database: "ProjectManager",
};

beforeEach(() => {
  db.queries.length = 0;
});

describe("ensureAdminAccount", () => {
  it("creates the administrator and hands it the migrated to-dos and alerts", async () => {
    db.activeAdmins = 0;
    const password = await ensureAdminAccount(target, argon2, log as never);
    expect(password).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);
    const save = db.queries.find((q) => q.includes("BEGIN TRAN")) ?? "";
    expect(save).toMatch(/UPDATE app\.TodoItem SET CreatedBy = @adminId WHERE CreatedBy = 0;/);
    expect(save).toMatch(/UPDATE app\.TodoAlert SET CreatedBy = @adminId WHERE CreatedBy = 0;/);
    expect(save.indexOf("UPDATE app.TodoItem")).toBeLessThan(save.indexOf("COMMIT"));
  });

  it("leaves everything alone when an administrator exists", async () => {
    db.activeAdmins = 1;
    expect(await ensureAdminAccount(target, argon2, log as never)).toBeNull();
    expect(db.queries.some((q) => q.includes("TodoItem"))).toBe(false);
  });
});

describe("resetAdminPassword", () => {
  it("also hands over to-dos still owned by nobody", async () => {
    await resetAdminPassword(target, argon2, log as never);
    expect(db.queries.some((q) => q.includes("UPDATE app.TodoItem SET CreatedBy = @adminId"))).toBe(
      true,
    );
  });
});
