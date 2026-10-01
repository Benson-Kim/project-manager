import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/provider";
import { getDueAlerts } from "@/modules/todo-items/repository/todo-items";
import { messages } from "@/lib/messages";

/**
 * GET /api/due-alerts
 *
 * Called by the Web Push dispatch server to retrieve due alerts for a user, and
 * used as a foreground fallback for browsers where Web Push is unavailable.
 * Returns a JSON array of alerts whose AlertDay has been reached and
 * AlertTime ≤ now (UTC), scoped to the authenticated user.
 * Returns 401 when unauthenticated (SW skips silently).
 * Never throws — returns an empty array on repository errors.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth.getSession();
  if (!session) {
    return NextResponse.json([], { status: 401 });
  }

  const rows = await getDueAlerts(session.userId).catch(() => []);
  const alerts = rows.map((r) => ({
    todoAlertId: r.TodoAlertId,
    todoItemId: r.TodoItemId,
    title: r.TodoItem ?? messages.app.untitled,
    rowVer: r.RowVer,
  }));

  return NextResponse.json(alerts);
}
