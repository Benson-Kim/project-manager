import { z } from "zod";

const projectIdSchema = z.coerce.number().int().positive();

/** Validates the [id] route param (ADR-0018 layout); null means notFound(). */
export function parseProjectId(raw: string): number | null {
  const parsed = projectIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
