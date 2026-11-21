/**
 * Kept apart from log.ts: the web server imports the SQL service code, and the
 * logger's file access there would make `next build` trace the whole project.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}
