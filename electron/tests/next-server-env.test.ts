import { describe, expect, it } from "vitest";
import { nextServerEnv } from "../next-server";

const opts = {
  db: { host: "127.0.0.1", port: 14330, database: "ProjectManager", user: "pm_app", password: "p" },
  authSecret: "s",
};

describe("nextServerEnv: the attachments folder (ADR-0026 §9)", () => {
  it("passes the machine's uploads folder and turns uploads on", () => {
    const env = nextServerEnv({ ...opts, uploadsDir: "C:\\PD\\Uploads" }, 3001, {});
    expect(env.UPLOADS_ENABLED).toBe("true");
    expect(env.UPLOADS_DIR).toBe("C:\\PD\\Uploads");
  });

  it("turns uploads off without the folder, never falling back to the install folder", () => {
    const env = nextServerEnv(opts, 3001, {
      UPLOADS_DIR: "C:\\elsewhere",
      UPLOADS_ENABLED: "true",
    });
    expect(env.UPLOADS_ENABLED).toBe("false");
    expect(env.UPLOADS_DIR).toBe("");
  });

  it("binds to loopback with the machine's database", () => {
    const env = nextServerEnv(opts, 3001, {});
    expect(env).toMatchObject({
      HOSTNAME: "127.0.0.1",
      PORT: "3001",
      DB_SERVER: "127.0.0.1",
      DB_PORT: "14330",
      DB_USER: "pm_app",
      AUTH_URL: "http://127.0.0.1:3001",
    });
  });
});
