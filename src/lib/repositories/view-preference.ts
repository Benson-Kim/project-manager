import { z } from "zod";
import { execProc } from "../db";
import { parseListLayout, type ListLayout } from "../list-layout";
import { VIEW_MODES, type ViewMode } from "../list-params";

const rowSchema = z.object({
  ViewMode: z.enum(VIEW_MODES),
  Layout: z.string().nullable().optional(),
});

/** A user's list preference for one module: grid/list view and datasheet layout. */
export interface ListPreference {
  viewMode: ViewMode;
  /** Column order, widths and row height; null = the module's default (migration 019). */
  layout: ListLayout | null;
}

/** Server-side list preference ; cookie fallback lives in the DataView page helper. */
export async function getListPreference(
  userId: number,
  moduleKey: string,
): Promise<ListPreference | null> {
  const rows = await execProc("usp_ViewPreference_Get", {
    UserId: userId,
    ModuleKey: moduleKey,
  });
  if (rows.length === 0) return null;
  const row = rowSchema.parse(rows[0]);
  return { viewMode: row.ViewMode, layout: parseListLayout(row.Layout) };
}

export async function getViewPreference(
  userId: number,
  moduleKey: string,
): Promise<ViewMode | null> {
  return (await getListPreference(userId, moduleKey))?.viewMode ?? null;
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

/** Stores the datasheet layout; null resets to the module's default. */
export async function setListLayout(
  userId: number,
  moduleKey: string,
  layout: ListLayout | null,
): Promise<void> {
  await execProc("usp_ViewPreference_SetLayout", {
    UserId: userId,
    ModuleKey: moduleKey,
    Layout: layout ? JSON.stringify(layout) : null,
  });
}
