import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const { AppError } = await import("./errors");
const { isRowUnavailable, orNotFound, orNull } = await import("./row-access");

// Braces matter: a function returned from beforeEach runs as teardown.
beforeEach(() => {
  notFound.mockClear();
});

describe("isRowUnavailable", () => {
  it("is true for NOT_FOUND and FORBIDDEN_ROW only", () => {
    expect(isRowUnavailable(new AppError("NOT_FOUND", "x"))).toBe(true);
    expect(isRowUnavailable(new AppError("FORBIDDEN_ROW", "x"))).toBe(true);
    expect(isRowUnavailable(new AppError("CONFLICT", "x"))).toBe(false);
    expect(isRowUnavailable(new Error("boom"))).toBe(false);
    expect(isRowUnavailable(null)).toBe(false);
  });
});

describe("orNull", () => {
  it("passes the value through", async () => {
    await expect(orNull(Promise.resolve(7))).resolves.toBe(7);
  });

  it("maps an absent or inaccessible record to null (no existence leak)", async () => {
    await expect(orNull(Promise.reject(new AppError("NOT_FOUND", "x")))).resolves.toBeNull();
    await expect(orNull(Promise.reject(new AppError("FORBIDDEN_ROW", "x")))).resolves.toBeNull();
  });

  it("rethrows every other error", async () => {
    await expect(orNull(Promise.reject(new AppError("INTERNAL", "x")))).rejects.toThrow("x");
  });
});

describe("orNotFound", () => {
  it("passes the value through", async () => {
    await expect(orNotFound(Promise.resolve([1]))).resolves.toEqual([1]);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders the 404 page for an inaccessible project", async () => {
    await expect(orNotFound(Promise.reject(new AppError("FORBIDDEN_ROW", "x")))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("rethrows every other error without a 404", async () => {
    await expect(orNotFound(Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    expect(notFound).not.toHaveBeenCalled();
  });
});
