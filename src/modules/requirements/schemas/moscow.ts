import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * MoSCoW priority of a requirement (ADR-0052): Must, Should, Could, Won't. NULL is "not
 * prioritised yet". CK_Requirement_MoSCoW lists the same codes
 * (src/tests/requirement-sql-guardrails.test.ts).
 */
export const MOSCOW = ["M", "S", "C", "W"] as const;

export type MoSCoW = (typeof MOSCOW)[number];

export const moscowSchema = z.enum(MOSCOW);

export function isMoSCoW(value: unknown): value is MoSCoW {
  return typeof value === "string" && (MOSCOW as readonly string[]).includes(value);
}

export function moscowLabel(code: MoSCoW): string {
  return messages.requirements.moscow[code];
}
