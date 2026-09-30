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
  "UNAUTHENTICATED",
  "FORBIDDEN",
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
