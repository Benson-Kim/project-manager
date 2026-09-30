import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Session } from "./auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 1, username: "dev", role: "Admin" };
vi.mock("./auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("./errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

import { action } from "./action";
import { AppError } from "./errors";

const schema = z.object({ name: z.string().min(1, "Enter a name") });

function makeAction(handler: (input: { name: string }) => Promise<string>) {
  return action({
    name: "test.create",
    schema,
    permission: "suppliers:create",
    revalidate: ["/suppliers", "suppliers-tag"],
    handler: (input) => handler(input),
  });
}

describe("action() wrapper ", () => {
  beforeEach(() => {
    session = { userId: 1, username: "dev", role: "Admin" };
    revalidatePath.mockClear();
    updateTag.mockClear();
  });

  it("returns VALIDATION with fieldErrors and never calls the handler", async () => {
    const handler = vi.fn();
    const run = makeAction(handler);
    const result = await run({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.name).toEqual(["Enter a name"]);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("normalises FormData input", async () => {
    const run = makeAction((input) => Promise.resolve(input.name));
    const fd = new FormData();
    fd.set("name", "Acme");
    const result = await run(fd);
    expect(result).toEqual({ ok: true, data: "Acme" });
  });

  it("returns UNAUTHENTICATED when there is no session", async () => {
    session = null;
    const run = makeAction(() => Promise.resolve("x"));
    const result = await run({ name: "Acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns FORBIDDEN when RBAC denies the permission", async () => {
    session = { userId: 2, username: "viewer", role: "Viewer" };
    const handler = vi.fn();
    const run = makeAction(handler);
    const result = await run({ name: "Acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("revalidates paths and tags on success only", async () => {
    const run = makeAction(() => Promise.resolve("ok"));
    await run({ name: "Acme" });
    expect(revalidatePath).toHaveBeenCalledWith("/suppliers");
    expect(updateTag).toHaveBeenCalledWith("suppliers-tag");

    revalidatePath.mockClear();
    const failing = makeAction(() => Promise.reject(new AppError("NOT_FOUND", "gone")));
    await failing({ name: "Acme" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps AppError codes from the data layer", async () => {
    const run = makeAction(() => Promise.reject(new AppError("CONFLICT", "stale")));
    const result = await run({ name: "Acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });

  it("hides unexpected errors behind INTERNAL", async () => {
    const run = makeAction(() => Promise.reject(new Error("sql stack trace")));
    const result = await run({ name: "Acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.message).not.toContain("sql");
    }
  });

  it("rethrows Next.js control-flow errors (redirect)", async () => {
    const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/suppliers",
    });
    const run = makeAction(() => Promise.reject(redirectErr));
    await expect(run({ name: "Acme" })).rejects.toBe(redirectErr);
  });
});
