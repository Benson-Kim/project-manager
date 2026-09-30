import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/provider";
import { getPushConfig } from "@/lib/push/config";
import { upsertAlertSubscription } from "@/modules/todo-items/repository/alert-subscriptions";
import { pushSubscriptionInput } from "@/modules/todo-items/schemas/alert-subscription";

export const runtime = "nodejs";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!getPushConfig()) return NextResponse.json({ error: "Web Push is not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = pushSubscriptionInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });

  try {
    await upsertAlertSubscription(parsed.data, session.userId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[alerts] subscription persistence failed:", error);
    return NextResponse.json({ error: "Unable to save alert subscription" }, { status: 500 });
  }
}
