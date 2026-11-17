import type { Session } from "@/lib/auth/types";
import type { AppErrorCode } from "@/lib/errors";
import { isSameOrigin, json } from "@/lib/files/http";
import { allowsChanges, currentLicenceStatus } from "@/lib/licence/gate";
import { errorMessage, licenceMessages } from "@/lib/licence/messages";
import { getFileSession } from "./session";

/**
 * The only way to write a Route Handler under /api/files (ADR-0026 §3). Those
 * routes are outside the proxy matcher (bodies stream), so this applies the
 * proxy's gate to every one of them, before the handler runs:
 *  - same-origin (Sec-Fetch-Site, then Origin) for anything but GET and HEAD;
 *  - a session, refusing one that must still change its password;
 *  - a licence that allows changes, for anything but GET and HEAD.
 * The handler then checks the owner's access. src/tests/file-routes.test.ts
 * fails any route file under src/app/api/files whose method handlers are not
 * built with fileRoute. Server only.
 */
export type FileHandler<Context> = (
  request: Request,
  session: Session,
  context: Context,
) => Promise<Response>;

const refuse = (status: number, code: AppErrorCode) =>
  json({ ok: false, error: { code, message: errorMessage(code) } }, status);

export function fileRoute<Context = unknown>(handler: FileHandler<Context>) {
  return async (request: Request, context: Context): Promise<Response> => {
    const safe = request.method === "GET" || request.method === "HEAD";
    if (!safe && !isSameOrigin(request.headers)) return refuse(403, "FORBIDDEN");
    const session = await getFileSession();
    if (!session) return refuse(401, "UNAUTHENTICATED");
    if (!safe && !allowsChanges(await currentLicenceStatus())) {
      return json(
        { ok: false, error: { code: "LICENCE_INACTIVE", message: licenceMessages.inactive } },
        403,
      );
    }
    return handler(request, session, context);
  };
}
