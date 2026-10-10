import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/provider";
import { parseLocalWallClock } from "@/lib/local-time";
import { messages } from "@/lib/messages";
import { getDueAlerts } from "@/modules/todo-items/repository/todo-items";

/**
 * GET /api/due-alerts?now=YYYY-MM-DDTHH:mm:ss
 *
 * The open app's alarm poll (useAlertPoller, every 30 s) and the foreground
 * fallback where Web Push is unavailable. `now` is the browser's wall clock:
 * alert dates and times are wall-clock values as the user typed them, so the
 * proc compares against the user's own now (it falls back to UTC when `now` is
 * missing or implausible). Returns the authenticated user's due alerts — the
 * alerts they set and those on their own to-dos. 401 when unauthenticated (SW
 * skips silently). Never throws — returns an empty array on repository errors.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.getSession();
  if (!session) {
    return NextResponse.json([], { status: 401 });
  }

  const localNow = parseLocalWallClock(request.nextUrl.searchParams.get("now"));
  const rows = await getDueAlerts(session.userId, localNow).catch(() => []);
  const alerts = rows.map((r) => ({
    todoAlertId: r.TodoAlertId,
    todoItemId: r.TodoItemId,
    title: r.TodoItem ?? messages.app.untitled,
    rowVer: r.RowVer,
  }));

  return NextResponse.json(alerts);
}
