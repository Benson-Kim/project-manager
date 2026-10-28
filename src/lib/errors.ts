/**
 * Typed error surface . Stored procedures signal business failures
 * with `THROW 5000x, 'CODE:message', 1`; src/lib/db.ts maps them to AppError.
 * The action wrapper (src/lib/action.ts) converts AppError into ActionResult —
 * raw errors never reach a client.
 */
export const APP_ERROR_CODES = [
  "NOT_FOUND", // 50001
  "CONFLICT", // 50002 — rowversion mismatch
  "FORBIDDEN_ROW", // 50003 — row-level access denied in the proc
  "VALIDATION", // 50004 — business-rule violation
  "DUPLICATE", // 50005
  "QUOTA_EXCEEDED", // 50006 — a project's attachment quota is full (ADR-0026)
  "LIMIT_REACHED", // 50007 — a bounded slot is full: a column's WIP limit, or a board's one active sprint (ADR-0038)
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED", // too many requests in a minute (429; ADR-0031), never from a proc
  "INTERNAL",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

const CODE_BY_NUMBER: Record<number, AppErrorCode> = {
  50001: "NOT_FOUND",
  50002: "CONFLICT",
  50003: "FORBIDDEN_ROW",
  50004: "VALIDATION",
  50005: "DUPLICATE",
  50006: "QUOTA_EXCEEDED",
  50007: "LIMIT_REACHED",
};

/** Map a THROW from a stored procedure to a typed AppError . */
export function appErrorFromProc(throwNumber: number, rawMessage: string): AppError {
  const code = CODE_BY_NUMBER[throwNumber];
  if (!code) return new AppError("INTERNAL", "Unexpected database error");
  // Message convention: 'CODE:Human message' — strip the code prefix if present.
  const sep = rawMessage.indexOf(":");
  const message = sep > 0 ? rawMessage.slice(sep + 1).trim() : rawMessage;
  return new AppError(code, message);
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * The database server could not be reached or stopped answering (a stopped
 * SQL Server service, not a proc's own error). Still INTERNAL to every action;
 * the sign-in page names it, because "check your password" sent a client
 * looking for a forgotten password while the database was down.
 */
export class DatabaseUnavailableError extends AppError {
  constructor() {
    super("INTERNAL", "Database unavailable");
    this.name = "DatabaseUnavailableError";
  }
}

export function isDatabaseUnavailable(err: unknown): err is DatabaseUnavailableError {
  return err instanceof DatabaseUnavailableError;
}
