import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Session } from "../auth/types";

const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

let session: Session | null = { userId: 1, username: "dev", role: "Admin" };
vi.mock("../auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("../errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

import { action } from "../action";
import { AppError, type AppErrorCode } from "../errors";
import { messages } from "../messages";
import { resetRateLimits } from "../rate-limit";
import { richTextSchema } from "../rich-text/schema";

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

  it("parses nothing before the session: invalid input without one is UNAUTHENTICATED", async () => {
    session = null;
    const parse = vi.fn((value: unknown) => value);
    const run = action({
      name: "test.costly",
      schema: z.preprocess(parse, schema),
      permission: "suppliers:create",
      handler: async (input) => input.name,
    });
    const result = await run({ name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(parse).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN when the global role lacks the permission (admin module)", async () => {
    session = { userId: 2, username: "member", role: "User" };
    const handler = vi.fn();
    const run = action({
      name: "test.admin",
      schema,
      permission: "admin:update",
      handler: (input) => handler(input),
    });
    const result = await run({ name: "Acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("derives the permission from the parsed input when given a function (ADR-0026)", async () => {
    session = { userId: 2, username: "member", role: "User" };
    const handler = vi.fn<(input: { name: string }) => Promise<string>>().mockResolvedValue("ok");
    const permissionOf = vi.fn((input: { name: string }) =>
      input.name === "secret" ? ("admin:update" as const) : ("suppliers:update" as const),
    );
    const run = action({
      name: "test.dynamic",
      schema,
      permission: permissionOf,
      handler: (input) => handler(input),
    });

    const denied = await run({ name: "secret" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();

    expect(await run({ name: "Acme" })).toEqual({ ok: true, data: "ok" });
    expect(permissionOf).toHaveBeenLastCalledWith({ name: "Acme" });
  });

  it("never derives a permission from input that fails validation", async () => {
    const permissionOf = vi.fn(() => "suppliers:update" as const);
    const run = action({
      name: "test.dynamic",
      schema,
      permission: permissionOf,
      handler: vi.fn(),
    });
    await run({ name: "" });
    expect(permissionOf).not.toHaveBeenCalled();
  });

  it("lets a User through to the handler; the proc decides per project (ADR-0021)", async () => {
    session = { userId: 2, username: "member", role: "User" };
    const run = makeAction(() =>
      Promise.reject(
        new AppError("FORBIDDEN_ROW", "Your access to this project does not allow this"),
      ),
    );
    const result = await run({ name: "Acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN_ROW");
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

  it("revalidates a route pattern as a page, so every rendered instance is invalidated", async () => {
    const run = action({
      name: "test.pattern",
      schema,
      permission: "suppliers:create",
      revalidate: ["/projects/[id]/meetings", "/projects/[id]/meetings/[meetingId]", "/projects"],
      handler: () => Promise.resolve("ok"),
    });
    await run({ name: "Acme" });
    expect(revalidatePath.mock.calls).toEqual([
      ["/projects/[id]/meetings", "page"],
      ["/projects/[id]/meetings/[meetingId]", "page"],
      ["/projects"],
    ]);
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

  it("sanitises rich-text fields: the wrapper loads the sanitiser (ADR-0025)", async () => {
    // This file never imports the sanitiser; action.ts must install it.
    const run = action({
      name: "test.richText",
      schema: z.object({ body: richTextSchema({ max: 100 }) }),
      permission: "suppliers:create",
      handler: (input) => Promise.resolve(input.body),
    });
    const fd = new FormData();
    fd.set("body", '<div>Hi<img src=x onerror="alert(1)"><script>alert(1)</script></div>');
    expect(await run(fd)).toEqual({ ok: true, data: "<p>Hi</p>" });
  });
});

describe("failure references and logging", () => {
  let logged: unknown[][] = [];
  let logSpy: { mockRestore: () => void };

  beforeEach(() => {
    session = { userId: 7, username: "zephyrine", role: "Admin" };
    logged = [];
    logSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  /** The one log line a failure writes, as its prefix and its fields. */
  function onlyLine(): Record<string, unknown> {
    expect(logged).toHaveLength(1);
    const [prefix, fields] = logged[0];
    expect(prefix).toBe("[action] failed:");
    return fields as Record<string, unknown>;
  }

  it("logs one line for an unexpected error and puts its reference in the message", async () => {
    const run = makeAction(() => Promise.reject(new Error("sql stack trace")));
    const result = await run({ name: "Acme" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = onlyLine();
    expect(Object.keys(fields).sort()).toEqual([
      "action",
      "code",
      "reason",
      "reference",
      "stack",
      "userId",
    ]);
    expect(fields).toMatchObject({
      action: "test.create",
      code: "INTERNAL",
      userId: 7,
      reason: "sql stack trace",
    });
    const reference = fields.reference as string;
    expect(reference).toMatch(/^[0-9a-f]{8}$/);
    expect(result.error.message).toBe(messages.errors.internalWithReference(reference));
    expect(result.error.message).toContain(reference);
    expect(result.error.message).not.toContain("sql");
  });

  it("gives every failure its own reference", async () => {
    const run = makeAction(() => Promise.reject(new Error("boom")));
    await run({ name: "Acme" });
    await run({ name: "Acme" });

    const references = logged.map((call) => (call[1] as { reference: string }).reference);
    expect(references).toHaveLength(2);
    expect(references[0]).not.toBe(references[1]);
  });

  it("logs no input, no form data and no session field beyond the user id", async () => {
    const run = action({
      name: "test.secrets",
      schema: z.object({ name: z.string(), pin: z.string() }),
      permission: "suppliers:create",
      handler: () => Promise.reject(new Error("handler failed")),
    });
    const fd = new FormData();
    fd.set("name", "Acme Holdings");
    fd.set("pin", "s3cret-pin-value");

    await run(fd);

    const line = JSON.stringify(logged);
    expect(line).toContain('"userId":7');
    for (const value of ["Acme Holdings", "s3cret-pin-value", "zephyrine"]) {
      expect(line).not.toContain(value);
    }
  });

  it("keeps a mapped code's own copy and logs the proc's reason, not the user", async () => {
    const run = makeAction(() =>
      Promise.reject(new AppError("CONFLICT", "RowVer mismatch on Supplier 42")),
    );
    const result = await run({ name: "Acme" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(messages.errors.CONFLICT);
    expect(result.error.message).not.toContain("RowVer");
    const fields = onlyLine();
    // An AppError is a business failure, not a bug: no stack.
    expect(Object.keys(fields).sort()).toEqual(["action", "code", "reason", "reference", "userId"]);
    expect(fields).toMatchObject({ code: "CONFLICT", reason: "RowVer mismatch on Supplier 42" });
    expect(fields.reference).toMatch(/^[0-9a-f]{8}$/);
  });

  it("never lets a proc's validation text reach the client (LESSONS §30)", async () => {
    const run = makeAction(() =>
      Promise.reject(new AppError("VALIDATION", "This line has transactions")),
    );
    const result = await run({ name: "Acme" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(messages.errors.VALIDATION);
    expect(onlyLine().reason).toBe("This line has transactions");
  });

  it("treats an unmapped code as an application failure, so no proc text leaks", async () => {
    const run = makeAction(() =>
      Promise.reject(new AppError("TEAPOT" as unknown as AppErrorCode, "proc said too much")),
    );
    const result = await run({ name: "Acme" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const reference = onlyLine().reference as string;
    expect(result.error.message).toBe(messages.errors.internalWithReference(reference));
    expect(result.error.message).not.toContain("proc said too much");
  });

  it("logs the refused permission as the reason and tells the user nothing more", async () => {
    session = { userId: 2, username: "member", role: "User" };
    const handler = vi.fn();
    const run = action({
      name: "test.admin",
      schema,
      permission: "admin:update",
      handler: (input) => handler(input),
    });
    const result = await run({ name: "Acme" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(messages.errors.FORBIDDEN);
    expect(onlyLine()).toMatchObject({
      action: "test.admin",
      code: "FORBIDDEN",
      userId: 2,
      reason: "admin:update",
    });
  });

  it("logs an unauthenticated call without a user id", async () => {
    session = null;
    const run = makeAction(() => Promise.resolve("x"));
    const result = await run({ name: "Acme" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(messages.errors.UNAUTHENTICATED);
    expect(onlyLine()).toMatchObject({ code: "UNAUTHENTICATED", userId: undefined });
  });

  it("logs a throttled call with a reference and no reason", async () => {
    const previous = process.env.RATE_LIMIT_ACTIONS_PER_MINUTE;
    process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = "1";
    resetRateLimits();
    session = { userId: 4243, username: "busy", role: "User" };
    const run = makeAction((input) => Promise.resolve(input.name));
    try {
      await run({ name: "first" });
      await run({ name: "second" });
      const fields = onlyLine();
      expect(Object.keys(fields).sort()).toEqual(["action", "code", "reference", "userId"]);
      expect(fields).toMatchObject({ code: "RATE_LIMITED", userId: 4243 });
    } finally {
      process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = previous;
      resetRateLimits();
    }
  });

  it("does not log a schema failure: the form shows it per field", async () => {
    const run = makeAction(vi.fn());
    const result = await run({ name: "" });

    expect(result.ok).toBe(false);
    expect(logged).toEqual([]);
  });
});

describe("throttle (ADR-0031)", () => {
  it("refuses the call over the per-minute limit with RATE_LIMITED", async () => {
    const previous = process.env.RATE_LIMIT_ACTIONS_PER_MINUTE;
    process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = "1";
    resetRateLimits();
    session = { userId: 4242, username: "busy", role: "User" };
    const run = makeAction(async (input) => input.name);
    try {
      expect(await run({ name: "first" })).toEqual({ ok: true, data: "first" });
      const second = await run({ name: "second" });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("RATE_LIMITED");
    } finally {
      process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = previous;
      resetRateLimits();
    }
  });

  it("never parses the input of a throttled call", async () => {
    const previous = process.env.RATE_LIMIT_ACTIONS_PER_MINUTE;
    process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = "1";
    resetRateLimits();
    session = { userId: 4244, username: "busy", role: "User" };
    const parse = vi.fn((value: unknown) => value);
    const run = action({
      name: "test.costly",
      schema: z.preprocess(parse, schema),
      permission: "suppliers:create",
      handler: async (input) => input.name,
    });
    try {
      await run({ name: "first" });
      const second = await run({ name: "second" });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("RATE_LIMITED");
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      process.env.RATE_LIMIT_ACTIONS_PER_MINUTE = previous;
      resetRateLimits();
    }
  });
});
