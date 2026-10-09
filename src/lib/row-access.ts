import { notFound } from "next/navigation";
import { AppError } from "./errors";

/**
 * Row-level access outcomes for pages (S1, docs/security/IDOR-getbyid-procs.md).
 * Procs throw NOT_FOUND (50001) for absent rows and FORBIDDEN_ROW (50003) for rows
 * of projects the actor is not assigned to. Pages must treat both the same way so
 * a URL never reveals whether a record exists.
 */
export function isRowUnavailable(err: unknown): boolean {
  return err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN_ROW");
}

/** Record lookups behind a sheet (`?id=`): an absent or inaccessible record is `null`. */
export async function orNull<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup;
  } catch (err) {
    if (isRowUnavailable(err)) return null;
    throw err;
  }
}

/** Section loads (lists, Gantt): an absent or inaccessible project renders the 404 page. */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (err) {
    if (isRowUnavailable(err)) notFound();
    throw err;
  }
}
