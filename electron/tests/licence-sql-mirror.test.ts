import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ inputs: [] as [string, unknown][], proc: "", closed: 0 }));
const pool = vi.hoisted(() => {
  const request = {
    input(name: string, _type: unknown, value: unknown) {
      calls.inputs.push([name, value]);
      return request;
    },
    execute: vi.fn(async (proc: string) => {
      calls.proc = proc;
      return { recordset: [{ State: JSON.stringify({ licence: { a: 1 }, mark: { at: 5 } }) }] };
    }),
  };
  return {
    request: () => request,
    close: vi.fn(async () => {
      calls.closed++;
    }),
  };
});

vi.mock("../db", () => ({
  connect: vi.fn(async () => pool),
  sql: { Char: () => "char", NVarChar: () => "nvarchar", MAX: 0 },
}));

import { SqlLicenceMirror } from "../licence/sql-mirror";

const target = { database: "ProjectManager" } as never;

describe("SqlLicenceMirror", () => {
  beforeEach(() => {
    calls.inputs.length = 0;
    calls.closed = 0;
  });

  it("reads one machine's state and fills missing parts with null", async () => {
    const mirror = new SqlLicenceMirror(target, "m".repeat(64));
    await expect(mirror.read()).resolves.toEqual({
      licence: { a: 1 },
      checkIn: null,
      mark: { at: 5 },
    });
    expect(calls.proc).toBe("dbo.usp_Licence_Get");
    expect(calls.inputs[0]).toEqual(["MachineHash", "m".repeat(64)]);
    expect(calls.closed).toBe(1);
  });

  it("saves the state as JSON for that machine and always closes the pool", async () => {
    const mirror = new SqlLicenceMirror(target, "m".repeat(64));
    await mirror.write({ licence: 1, checkIn: null, mark: 2 } as never);
    expect(calls.proc).toBe("dbo.usp_Licence_Save");
    expect(calls.inputs[1]).toEqual(["State", '{"licence":1,"checkIn":null,"mark":2}']);
    expect(calls.closed).toBe(1);
  });
});
