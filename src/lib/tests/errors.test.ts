import { describe, expect, it } from "vitest";
import { AppError, appErrorFromProc, isAppError } from "../errors";

describe("appErrorFromProc ", () => {
  it("maps registered THROW numbers to codes and strips the code prefix", () => {
    const err = appErrorFromProc(50001, "NOT_FOUND:Supplier not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Supplier not found");
  });

  it("maps every registered number", () => {
    expect(appErrorFromProc(50002, "CONFLICT:x").code).toBe("CONFLICT");
    expect(appErrorFromProc(50003, "FORBIDDEN_ROW:x").code).toBe("FORBIDDEN_ROW");
    expect(appErrorFromProc(50004, "VALIDATION:x").code).toBe("VALIDATION");
    expect(appErrorFromProc(50005, "DUPLICATE:x").code).toBe("DUPLICATE");
  });

  it("keeps the raw message when no code prefix is present", () => {
    expect(appErrorFromProc(50001, "gone").message).toBe("gone");
  });

  it("degrades unregistered numbers to INTERNAL without leaking the message", () => {
    const err = appErrorFromProc(50099, "SECRET:internal detail");
    expect(err.code).toBe("INTERNAL");
    expect(err.message).not.toContain("internal detail");
  });

  it("isAppError narrows correctly", () => {
    expect(isAppError(new AppError("NOT_FOUND", "x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });
});
