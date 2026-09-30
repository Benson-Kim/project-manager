import { z } from "zod";
import { execProc } from "../db";

const rowSchema = z.object({
  TodoItemId: z.number().int(),
  TodoItem: z.string().nullable(),
  DueDate: z.coerce.date(),
  AlertType: z.string(),
});

export interface UpcomingAlert {
  id: number;
  title: string | null;
  dueDate: Date;
  alertType: string;
}

/**
 * Upcoming/overdue to-do alerts for the header bell (shell spec, issue #28)
 * via usp_Todo_GetUpcomingAlerts (port of qryUpcomingAlerts, owned by module
 * #20). The proc joins TodoAlert rows, so de-duplicate per to-do item. Known
 * gap: the proc has no per-user scoping — the list is global (tracked in #20).
 */
export async function getUpcomingAlerts(actorUserId: number): Promise<UpcomingAlert[]> {
  const rows = await execProc("usp_Todo_GetUpcomingAlerts", { ActorUserId: actorUserId });
  const seen = new Set<number>();
  const alerts: UpcomingAlert[] = [];
  for (const raw of rows) {
    const row = rowSchema.parse(raw);
    if (seen.has(row.TodoItemId)) continue;
    seen.add(row.TodoItemId);
    alerts.push({
      id: row.TodoItemId,
      title: row.TodoItem,
      dueDate: row.DueDate,
      alertType: row.AlertType,
    });
  }
  return alerts;
}
