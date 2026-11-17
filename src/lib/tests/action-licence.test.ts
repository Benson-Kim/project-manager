import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LicenceStatus } from "../licence/policy";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("../auth/provider", () => ({
  auth: { requireSession: async () => ({ userId: 1, username: "dev", role: "User" }) },
}));

let status: LicenceStatus = "off";
vi.mock("../licence/gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../licence/gate")>()),
  currentLicenceStatus: async () => status,
}));

import { action } from "../action";
import { licenceMessages } from "../licence/messages";
import { resetRateLimits } from "../rate-limit";

const INACTIVE = ["expired", "reconnect", "unlicensed"] as const satisfies readonly LicenceStatus[];

function makeAction(handler: () => Promise<string>, licence?: "read") {
  return action({
    name: "test.lookup",
    schema: z.object({}),
    permission: "projects:read",
    ...(licence ? { licence } : {}),
    handler,
  });
}

describe("action() licence gate", () => {
  beforeEach(() => {
    status = "off";
    resetRateLimits();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each(INACTIVE)(
    "refuses an action with a read permission but no read marker when the licence is %s",
    async (inactive) => {
      status = inactive;
      const handler = vi.fn(async () => "ran");
      const result = await makeAction(handler)({});
      expect(result).toEqual({
        ok: false,
        error: { code: "LICENCE_INACTIVE", message: licenceMessages.inactive },
      });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(INACTIVE)("runs an action marked as a read while the licence is %s", async (inactive) => {
    status = inactive;
    const handler = vi.fn(async () => "ran");
    expect(await makeAction(handler, "read")({})).toEqual({ ok: true, data: "ran" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each(["off", "active"] as const)(
    "runs both kinds of action when the licence is %s",
    async (open) => {
      status = open;
      expect(await makeAction(async () => "ran")({})).toEqual({ ok: true, data: "ran" });
      expect(await makeAction(async () => "ran", "read")({})).toEqual({ ok: true, data: "ran" });
    },
  );
});
