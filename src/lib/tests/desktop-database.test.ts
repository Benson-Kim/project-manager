import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "../action";
import { signInWithDatabase } from "../desktop-database";
import { messages } from "../messages";

const denied: ActionResult<never> = { ok: false, error: { code: "UNAUTHENTICATED", message: messages.auth.loginFailed } };

describe("desktop sign-in preflight", () => {
  it("keeps browser sign-in working without a desktop bridge", async () => {
    const signIn = vi.fn().mockResolvedValue(denied);
    const checking = vi.fn();
    expect(await signInWithDatabase(undefined, signIn, checking)).toBe(denied);
    expect(signIn).toHaveBeenCalledOnce();
    expect(checking).not.toHaveBeenCalled();
  });

  it("supports an older desktop bridge without database preflight", async () => {
    const signIn = vi.fn().mockResolvedValue(denied);
    expect(await signInWithDatabase({}, signIn, vi.fn())).toBe(denied);
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("waits for recovery and sends credentials to authentication only once", async () => {
    let finish!: (ready: boolean) => void;
    const ensureDatabase = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const signIn = vi.fn().mockResolvedValue(denied);
    const checking = vi.fn();
    const result = signInWithDatabase({ ensureDatabase }, signIn, checking);
    expect(checking).toHaveBeenLastCalledWith(true);
    expect(signIn).not.toHaveBeenCalled();
    expect(ensureDatabase).toHaveBeenCalledWith();
    finish(true);
    expect(await result).toBe(denied);
    expect(signIn).toHaveBeenCalledOnce();
    expect(checking.mock.calls).toEqual([[true], [false]]);
  });

  it("does not submit credentials when recovery is declined or fails", async () => {
    const signIn = vi.fn().mockResolvedValue(denied);
    const checking = vi.fn();
    expect(await signInWithDatabase({ ensureDatabase: vi.fn().mockResolvedValue(false) }, signIn, checking)).toEqual({
      ok: false, error: { code: "INTERNAL", message: messages.auth.connectionFailed },
    });
    expect(signIn).not.toHaveBeenCalled();
    expect(checking).toHaveBeenLastCalledWith(false);
  });

  it("handles IPC failure without falling through to authentication", async () => {
    const signIn = vi.fn().mockResolvedValue(denied);
    const checking = vi.fn();
    const result = await signInWithDatabase({ ensureDatabase: vi.fn().mockRejectedValue(new Error("offline")) }, signIn, checking);
    expect(result.ok).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
    expect(checking).toHaveBeenLastCalledWith(false);
  });

  it("does not retry authentication failures or consume more login attempts", async () => {
    const ensureDatabase = vi.fn().mockResolvedValue(true);
    const signIn = vi.fn().mockResolvedValue(denied);
    expect(await signInWithDatabase({ ensureDatabase }, signIn, vi.fn())).toBe(denied);
    expect(signIn).toHaveBeenCalledOnce();
    expect(ensureDatabase).toHaveBeenCalledOnce();
  });

  it("preserves the successful server redirect", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    const signIn = vi.fn().mockRejectedValue(redirect);
    const checking = vi.fn();
    await expect(signInWithDatabase({ ensureDatabase: vi.fn().mockResolvedValue(true) }, signIn, checking)).rejects.toBe(redirect);
    expect(checking).toHaveBeenLastCalledWith(false);
    expect(signIn).toHaveBeenCalledOnce();
  });
});
