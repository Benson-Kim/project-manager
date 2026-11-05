import { messages } from "@/lib/messages";
import type { AuditLogRow } from "./schemas/audit-log";

const A = messages.settings.audit;

/**
 * A stored name in words: "app.MeetingActionItem" -> "Meeting action item", "SetPassword" ->
 * "Set password". The schema prefix goes; an acronym ("NFR", "RACI") keeps its capitals.
 */
export function humanize(name: string): string {
  const bare = name.slice(name.lastIndexOf(".") + 1);
  const words = bare
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean);
  return words
    .map((word, i) => {
      if (word.length > 1 && word === word.toUpperCase()) return word;
      const lower = word.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

/** Who made the change: a name, the id of a user who is gone, or the system itself. */
export function actorText(row: Pick<AuditLogRow, "ActorUserId" | "ActorName" | "ActorUsername">) {
  if (row.ActorUserId === null) return A.system;
  return row.ActorName ?? row.ActorUsername ?? A.formerUser(row.ActorUserId);
}

/** What changed: the record's kind in words and its id. */
export function entityText(row: Pick<AuditLogRow, "EntityName" | "EntityId">): string {
  const kind = humanize(row.EntityName);
  return row.EntityId ? `${kind} #${row.EntityId}` : kind;
}

export interface AuditDiffRow {
  field: string;
  before: string | null;
  after: string | null;
  changed: boolean;
}

/** One side of an entry as named values. Text that isn't a JSON object is kept whole, never lost. */
function fieldsOf(json: string | null): Map<string, unknown> {
  if (json === null || json.trim() === "") return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return new Map([["value", json]]);
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return new Map(Object.entries(parsed));
  }
  return new Map([["value", parsed]]);
}

function display(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Before and after, field by field, in the order the entry records them: the before side's fields
 * first, then any only the after side has. A field missing on one side reads as no value, so a
 * create shows every field as changed and a delete every field as gone.
 */
export function diffAudit(beforeJson: string | null, afterJson: string | null): AuditDiffRow[] {
  const before = fieldsOf(beforeJson);
  const after = fieldsOf(afterJson);
  const fields = [...before.keys(), ...[...after.keys()].filter((key) => !before.has(key))];
  return fields.map((field) => {
    const was = display(before.get(field));
    const now = display(after.get(field));
    return { field, before: was, after: now, changed: was !== now };
  });
}
