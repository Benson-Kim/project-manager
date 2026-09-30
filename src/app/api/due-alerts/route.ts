import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { getDueAlerts } from "@/modules/todo-items/repository/todo-items";

export const runtime = "nodejs";

/** Foreground fallback for browsers where Web Push is unavailable. */
export async function GET(): Promise<NextResponse> {
  const session = await auth.getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const rows = await getDueAlerts(session.userId).catch(() => []);
  return NextResponse.json(
    rows.map((row) => ({
      todoAlertId: row.TodoAlertId,
      todoItemId: row.TodoItemId,
      title: row.TodoItem ?? messages.app.untitled,
      rowVer: row.RowVer,
    })),
  );
}
