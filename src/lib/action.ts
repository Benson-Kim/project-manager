import { randomBytes } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { auth } from "./auth/provider";
import { can } from "./auth/rbac";
import { takeUserSlot } from "./rate-limit";
import type { Permission, Session } from "./auth/types";
import { AppError, type AppErrorCode } from "./errors";
import { messages } from "./messages";
// Installs the rich-text sanitiser for richTextSchema (ADR-0025): every action
// input is parsed here, and a server-side parse without it throws.
import "./rich-text/sanitize";

/**
 * Typed Server Action wrapper : validate → authenticate → authorise
 * → throttle → execute → map errors → revalidate. Handlers pass ctx.session.userId to the
 * repository; mutation procs write the audit row in-transaction ).
 * Never throws to the client (redirect() excepted — Next rethrows it).
 * A failure logs one line with a random reference; an application failure puts
 * that reference in the message, so the user can quote what the log holds.
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
  /**
   * RBAC permission, e.g. "suppliers:create". A function of the parsed input
   * when the record type is part of the input, e.g. an attachment's owner
   * (ADR-0026): `(input) => permissionsOf(input.owner).update`.
   */
  permission: Permission | ((input: z.output<TSchema>) => Permission);
  /**
   * Paths (starting with "/") and tags to revalidate on success. A path with a
   * dynamic segment ("/projects/[id]/meetings") is a route pattern: Next needs
   * the "page" type to match every rendered instance; without it the literal
   * string matches nothing.
   */
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

/** A short random reference: the user quotes it, an operator greps the logs for it. */
function newReference(): string {
  return randomBytes(4).toString("hex");
}

/** What a log line may say about the cause. Never input, form data or a secret. */
interface FailureDetail {
  /** An AppError's own text — a proc's reason — or an unexpected error's message. */
  reason?: string;
  /** Unexpected errors only: a bug's stack, which the old console.error printed. */
  stack?: string;
}

function detailOf(err: unknown): FailureDetail {
  if (err instanceof AppError) return { reason: err.message };
  if (err instanceof Error) return { reason: err.message, stack: err.stack };
  return {};
}

/**
 * A mapped code keeps its own copy, so a proc's VALIDATION text never reaches
 * the client (LESSONS §30). An application failure carries the reference
 * instead: it is the only failure the user has to report.
 */
function failureMessage(code: ActionErrorCode, reference: string): string {
  const copy: string | undefined = code === "INTERNAL" ? undefined : messages.errors[code];
  return copy ?? messages.errors.internalWithReference(reference);
}

export function action<TSchema extends z.ZodType, TOutput>(
  options: ActionOptions<TSchema, TOutput>,
): (rawInput: unknown) => Promise<ActionResult<TOutput>> {
  return async function run(rawInput: unknown): Promise<ActionResult<TOutput>> {
    // 1. Normalise FormData to a plain object.
    // Object.fromEntries collapses repeated keys — use getAll() to retain arrays.
    const input =
      rawInput instanceof FormData
        ? (() => {
            const obj: Record<string, unknown> = {};
            for (const key of new Set(rawInput.keys())) {
              const vals = rawInput.getAll(key);
              obj[key] = vals.length === 1 ? vals[0] : vals;
            }
            return obj;
          })()
        : rawInput;

    // Failures are logged, except a schema failure: the form already shows it
    // per field.
    let userId: number | undefined;
    const fail = (code: ActionErrorCode, detail: FailureDetail = {}): ActionResult<TOutput> => {
      const reference = newReference();
      console.error("[action] failed:", {
        action: options.name,
        code,
        reference,
        userId,
        ...detail,
      });
      return { ok: false, error: { code, message: failureMessage(code, reference) } };
    };

    try {
      // 2. Authenticate, then throttle (ADR-0031: a fixed window of actions per
      // user and minute), before anything parses the input: validating runs
      // the rich-text sanitiser, the costliest step, so only a signed-in user
      // within their quota reaches it.
      const session = await auth.requireSession();
      userId = session.userId;
      if (!takeUserSlot("actions", session.userId).allowed) return fail("RATE_LIMITED");

      // 3. Validate.
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

      // 3b. Authorise the global role (ADR-0021). What the actor may do inside a
      // project is the procs' call: they throw FORBIDDEN_ROW, mapped below.
      const permission =
        typeof options.permission === "function"
          ? options.permission(parsed.data)
          : options.permission;
      // The permission is the reason, and it is a name from a closed set.
      if (!can(session.role, permission)) return fail("FORBIDDEN", { reason: permission });

      // 4. Execute (procs enforce row-level access and write audit rows).
      const data = await options.handler(parsed.data, { session });

      // 5. Revalidate. Tags update immediately (read-your-writes after a
      // mutation, Next 16 updateTag): revalidateTag(tag, profile) is the
      // stale-while-revalidate variant, not what a mutation wants.
      for (const target of options.revalidate ?? []) {
        if (!target.startsWith("/")) updateTag(target);
        else if (target.includes("[")) revalidatePath(target, "page");
        else revalidatePath(target);
      }

      return { ok: true, data };
    } catch (err) {
      if (isRedirectLike(err)) throw err;
      return fail(err instanceof AppError ? err.code : "INTERNAL", detailOf(err));
    }
  };
}
