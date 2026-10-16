import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { requiredLevel } from "@/lib/auth/rbac";
import { ATTACHMENT_OWNER_CONFIG, ownerConfig } from "../repository/owners";
import { ATTACHMENT_OWNERS } from "../schemas/attachment";

/**
 * The owner registry must match the database and the access guardrail
 * (ADR-0026 §1): every owner's six procs exist in its folder, the folder is
 * checked by src/tests/proc-access-levels.test.ts against the same permission
 * module, and its levels are Viewer to read and the module's write level to edit.
 */
const guardrail = readFileSync(path.join("src", "tests", "proc-access-levels.test.ts"), "utf8");

describe.each(ATTACHMENT_OWNERS.map((owner) => [owner, ownerConfig(owner)] as const))(
  "attachment owner %s",
  (_owner, config) => {
    it.each(Object.values(config.procs))("%s exists in its folder", (proc) => {
      const file = path.join("db", "procs", config.folder, `${proc}.sql`);
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8")).toContain(`CREATE OR ALTER PROCEDURE dbo.${proc}`);
    });

    it("its procs take the id parameter the repository sends", () => {
      for (const proc of [config.procs.canAdd, config.procs.add, config.procs.list]) {
        const source = readFileSync(path.join("db", "procs", config.folder, `${proc}.sql`), "utf8");
        expect(source, proc).toMatch(new RegExp(`@${config.idParam}\\s+INT`));
      }
    });

    it("its add proc locks the live owner, then checks access, inside the transaction", () => {
      // A move or delete between the check and the insert would charge the wrong quota bucket,
      // or attach to a deleted owner (ADR-0026 §6).
      const source = readFileSync(
        path.join("db", "procs", config.folder, `${config.procs.add}.sql`),
        "utf8",
      ).replace(/--.*$/gm, "");
      const begin = source.indexOf("BEGIN TRAN");
      const lock = source.search(/WITH\s*\(\s*UPDLOCK\s*,\s*HOLDLOCK\s*\)/);
      const access = source.search(/EXEC\s+dbo\.usp_\w+_AssertAccess/);
      expect(begin, "BEGIN TRAN").toBeGreaterThan(-1);
      expect(lock, "owner read WITH (UPDLOCK, HOLDLOCK)").toBeGreaterThan(begin);
      expect(access, "access check under the lock").toBeGreaterThan(lock);
    });

    it("its folder is covered by the access guardrail with the same module", () => {
      const section = config.permissions.update.split(":")[0];
      expect(config.permissions.read).toBe(`${section}:read`);
      expect(guardrail).toMatch(new RegExp(`"?${config.folder}"?:\\s*"${section}"`));
    });

    it("reads at Viewer; adds, renames and removes at the module's update level", () => {
      // The update level is the section's own: Contributor for daily activities, Manager for
      // financials (not a Contributor module, ADR-0029). Never the section's delete permission.
      expect(requiredLevel(config.permissions.read)).toBe("Viewer");
      expect(config.permissions.update).toMatch(/:update$/);
      expect(requiredLevel(config.permissions.update)).not.toBe("Viewer");
    });
  },
);

it("every owner key has exactly one registry entry", () => {
  expect(Object.keys(ATTACHMENT_OWNER_CONFIG).sort()).toEqual([...ATTACHMENT_OWNERS].sort());
});
