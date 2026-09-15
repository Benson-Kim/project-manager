import { expireTag, revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "./auth/provider";
import { can } from "./auth/rbac";
import type { Permission, Session } from "./auth/types";
import { AppError, type AppErrorCode } from "./errors";
import { messages } from "./messages";

/**
 * Typed Server Action wrapper (ADR-0003): validate → authenticate → authorise
 * → execute → map errors → revalidate. Handlers pass ctx.session.userId to the
 * repository; mutation procs write the audit row in-transaction (ADR-0011).
 * Never throws to the client (redirect() excepted — Next rethrows it).
 */
export type ActionErrorCode = AppErrorCode;

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> };
    };

export interface ActionContext {
  session: Session;
}

export interface ActionOptions<TSchema extends z.ZodType, TOutput> {
  /** Diagnostic name, e.g. "suppliers.create". */
  name: string;
  /** Input schema — the single validation source (shared with the client form). */
  schema: TSchema;
  /** RBAC permission, e.g. "suppliers:create" (ADR-0015). */
  permission: Permission;
  /** Paths (starting with "/") and tags to revalidate on success. */
  revalidate?: string[];
  handler: (input: z.output<TSchema>, ctx: ActionContext) => Promise<TOutput>;
}

function isRedirectLike(err: unknown): boolean {
  // next/navigation redirect() and notFound() throw control-flow errors that
  // must propagate. Their digest starts with NEXT_.
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_")
  );
}

export function action<TSchema extends z.ZodType, TOutput>(
  options: ActionOptions<TSchema, TOutput>,
): (rawInput: unknown) => Promise<ActionResult<TOutput>> {
  return async function run(rawInput: unknown): Promise<ActionResult<TOutput>> {
    // 1. Validate (FormData is normalised to a plain object first).
    const input = rawInput instanceof FormData ? Object.fromEntries(rawInput.entries()) : rawInput;
    const parsed = options.schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return {
        ok: false,
        error: { code: "VALIDATION", message: messages.errors.VALIDATION, fieldErrors },
      };
    }

    try {
      // 2. Authenticate.
      const session = await auth.requireSession();

      // 3. Authorise.
      if (!can(session.role, options.permission)) {
        return {
          ok: false,
          error: { code: "FORBIDDEN", message: messages.errors.FORBIDDEN },
        };
      }

      // 4. Execute (procs enforce row-level access and write audit rows).
      const data = await options.handler(parsed.data, { session });

      // 5. Revalidate. Tags expire immediately (read-your-writes after a
      // mutation): Next 16's two-argument revalidateTag(tag, profile) is the
      // stale-while-revalidate variant, not what a mutation wants.
      for (const target of options.revalidate ?? []) {
        if (target.startsWith("/")) revalidatePath(target);
        else expireTag(target);
      }

      return { ok: true, data };
    } catch (err) {
      if (isRedirectLike(err)) throw err;
      if (err instanceof AppError) {
        return {
          ok: false,
          error: { code: err.code, message: messages.errors[err.code] ?? err.message },
        };
      }
      console.error(`[action:${options.name}]`, err);
      return {
        ok: false,
        error: { code: "INTERNAL", message: messages.errors.INTERNAL },
      };
    }
  };
}
