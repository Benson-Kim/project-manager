import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";

export const PROJECT_MATH_STATE_MAX_LENGTH = 65536;

export const projectMathStateSchema = z.object({
  currency: z.string().trim().max(8).optional(),
  added: z.array(z.string().trim().min(1).max(8)).max(50).default([]),
  cards: z.record(z.string().max(40), z.unknown()).default({}),
});

export type ProjectMathState = z.output<typeof projectMathStateSchema>;

export const saveProjectMathStateInput = z.object({
  projectId: z.coerce.number().int().positive(),
  state: projectMathStateSchema.refine(
    (state) => JSON.stringify(state).length <= PROJECT_MATH_STATE_MAX_LENGTH,
    "Too much to save",
  ),
  rowVer: rowVerSchema.nullable().default(null),
});

/** A stored state, or null when it is missing or no longer readable. */
export function readProjectMathState(json: string | null | undefined): ProjectMathState | null {
  if (!json) return null;
  try {
    const parsed = projectMathStateSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A card's saved values when they still fit its shape, otherwise its examples. */
export function savedOr<T>(schema: z.ZodType<T>, saved: unknown, seed: T): T {
  if (saved === undefined) return seed;
  const parsed = schema.safeParse(saved);
  return parsed.success ? parsed.data : seed;
}

/** The shape of a card's examples: saved values must match it to be used. */
export function schemaLike(seed: unknown): z.ZodType {
  if (typeof seed === "string") return z.string().max(200);
  if (typeof seed === "number") return z.number().finite();
  if (typeof seed === "boolean") return z.boolean();
  if (Array.isArray(seed))
    return z.array(seed.length ? schemaLike(seed[0]) : z.string().max(200)).max(200);
  if (seed && typeof seed === "object") {
    return z.object(
      Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, schemaLike(value)])),
    );
  }
  return z.null();
}
