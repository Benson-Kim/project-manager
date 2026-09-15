import { z } from "zod";
import { execProc } from "../db";
import { VIEW_MODES, type ViewMode } from "../list-params";

const rowSchema = z.object({ ViewMode: z.enum(VIEW_MODES) });

/** Server-side view preference (ADR-0006); cookie fallback lives in the DataView page helper. */
export async function getViewPreference(
  userId: number,
  moduleKey: string,
): Promise<ViewMode | null> {
  const rows = await execProc("usp_ViewPreference_Get", {
    UserId: userId,
    ModuleKey: moduleKey,
  });
  if (rows.length === 0) return null;
  return rowSchema.parse(rows[0]).ViewMode;
}

export async function setViewPreference(
  userId: number,
  moduleKey: string,
  viewMode: ViewMode,
): Promise<void> {
  await execProc("usp_ViewPreference_Set", {
    UserId: userId,
    ModuleKey: moduleKey,
    ViewMode: viewMode,
  });
}
