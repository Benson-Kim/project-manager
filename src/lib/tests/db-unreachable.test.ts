import { describe, expect, it } from "vitest";
import { isUnreachable } from "../db";

/** mssql errors as the driver names them (only src/lib/db.ts may import mssql). */
const driverError = (name: string, props: Record<string, unknown> = {}) =>
  Object.assign(new Error(name), { name, ...props });

describe("isUnreachable", () => {
  it("a connection that fails, times out or drops", () => {
    expect(isUnreachable(driverError("ConnectionError", { code: "ESOCKET" }))).toBe(true);
    expect(isUnreachable(driverError("RequestError", { code: "ETIMEOUT" }))).toBe(true);
    expect(isUnreachable(driverError("RequestError", { code: "ECONNCLOSED" }))).toBe(true);
    expect(isUnreachable(driverError("RequestError", { code: "ENOTOPEN" }))).toBe(true);
  });

  it("not a proc's own error or a bad request", () => {
    expect(isUnreachable(driverError("RequestError", { code: "EREQUEST", number: 50004 }))).toBe(
      false,
    );
    expect(isUnreachable(new Error("boom"))).toBe(false);
    expect(isUnreachable(null)).toBe(false);
  });
});
