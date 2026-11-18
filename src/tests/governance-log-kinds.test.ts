import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOVERNANCE_LOG_KINDS, GOVERNANCE_LOGS } from "@/modules/meetings/governance-logs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const kindsIn = (sql: string) => [...sql.matchAll(/LogKind = N'(\w+)'/g)].map((m) => m[1]);
const sorted = (kinds: readonly string[]) => [...new Set(kinds)].sort();

describe("governance log kinds stay in step", () => {
  const registry = sorted(GOVERNANCE_LOG_KINDS);

  it("the registry describes every kind once", () => {
    expect(sorted(GOVERNANCE_LOGS.map((log) => log.kind))).toEqual(registry);
    expect(GOVERNANCE_LOGS).toHaveLength(GOVERNANCE_LOG_KINDS.length);
  });

  it("matches the CHECK on app.MeetingActionLogLink", () => {
    const check = /CHECK \(LogKind IN \(([^)]*)\)\)/.exec(
      read("db/migrations/080_meeting_action_log_links.sql"),
    );
    expect(check).not.toBeNull();
    expect(sorted([...check![1].matchAll(/N'(\w+)'/g)].map((m) => m[1]))).toEqual(registry);
  });

  it("matches the branches of the link proc and the workspace read", () => {
    expect(
      sorted(kindsIn(read("db/procs/meeting-action-item/usp_MeetingActionItem_SetLogLinks.sql"))),
    ).toEqual(registry);
    expect(sorted(kindsIn(read("db/procs/meeting/usp_Meeting_GetWorkspace.sql")))).toEqual(
      registry,
    );
  });
});
