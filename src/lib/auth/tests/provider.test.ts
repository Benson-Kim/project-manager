import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors";
import type { AppToken } from "../config";

vi.mock("../config", () => ({ auth: vi.fn() }));
vi.mock("../session-stamp", () => ({ getSessionStamp: vi.fn() }));

import { auth as authJs } from "../config";
import { auth } from "../provider";
import { getSessionStamp } from "../session-stamp";

const mockAuthJs = vi.mocked(authJs as unknown as () => Promise<unknown>);
const mockStamp = vi.mocked(getSessionStamp);

const appToken: AppToken = {
  userId: 7,
  username: "pm",
  role: "User",
  sessionVersion: 3,
  mustChangePassword: false,
};

describe("auth provider (Auth.js-backed, ADR-0017 revocation stamp)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null when Auth.js has no session", async () => {
    mockAuthJs.mockResolvedValue(null);
    expect(await auth.getSession()).toBeNull();
  });

  it("returns the contract session when the stamp matches", async () => {
    mockAuthJs.mockResolvedValue({ appToken });
    mockStamp.mockResolvedValue({ sessionVersion: 3, isActive: true, mustChangePassword: false });
    expect(await auth.getSession()).toEqual({ userId: 7, username: "pm", role: "User" });
  });

  it("returns null for a token minted with a role retired by ADR-0021", async () => {
    mockAuthJs.mockResolvedValue({ appToken: { ...appToken, role: "ProjectManager" } });
    mockStamp.mockResolvedValue({ sessionVersion: 3, isActive: true, mustChangePassword: false });
    expect(await auth.getSession()).toBeNull();
  });

  it("returns null when the SessionVersion was bumped (revoked)", async () => {
    mockAuthJs.mockResolvedValue({ appToken });
    mockStamp.mockResolvedValue({ sessionVersion: 4, isActive: true, mustChangePassword: false });
    expect(await auth.getSession()).toBeNull();
  });

  it("returns null when the user was deactivated", async () => {
    mockAuthJs.mockResolvedValue({ appToken });
    mockStamp.mockResolvedValue({ sessionVersion: 3, isActive: false, mustChangePassword: false });
    expect(await auth.getSession()).toBeNull();
  });

  it("returns null when the user no longer exists", async () => {
    mockAuthJs.mockResolvedValue({ appToken });
    mockStamp.mockResolvedValue(null);
    expect(await auth.getSession()).toBeNull();
  });

  it("requireSession throws UNAUTHENTICATED when absent", async () => {
    mockAuthJs.mockResolvedValue(null);
    await expect(auth.requireSession()).rejects.toThrowError(AppError);
    await expect(auth.requireSession()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
