"use server";

import { action } from "@/lib/action";
import {
  createDailyActivity,
  deleteDailyActivity,
  updateDailyActivity,
} from "../repository/daily-activities";
import {
  dailyActivityFormSchema,
  updateDailyActivityFormSchema,
} from "../schemas/daily-activity-form";
import { deleteDailyActivityInput } from "../schemas/daily-activity";

/**
 * Create a daily activity (RBAC daily-activities:create — Admin + PM; audited in-proc).
 * The page is dynamic (session cookie) and the sheet calls router.refresh() on success —
 * no static path to revalidate (ADR-0018 project-scoped route).
 */
export const createDailyActivityAction = action({
  name: "daily-activities.create",
  schema: dailyActivityFormSchema,
  permission: "daily-activities:create",
  handler: (input, ctx) => createDailyActivity(input, ctx.session.userId),
});

/** Update a daily activity (RBAC daily-activities:update — Admin + PM; CONFLICT on stale RowVer). */
export const updateDailyActivityAction = action({
  name: "daily-activities.update",
  schema: updateDailyActivityFormSchema,
  permission: "daily-activities:update",
  handler: (input, ctx) => updateDailyActivity(input, ctx.session.userId),
});

/** Soft-delete a daily activity (RBAC daily-activities:delete — Admin + PM; audited in-proc). */
export const deleteDailyActivityAction = action({
  name: "daily-activities.delete",
  schema: deleteDailyActivityInput,
  permission: "daily-activities:delete",
  handler: async (input, ctx) => {
    await deleteDailyActivity(input.dailyActivityId, input.rowVer, ctx.session.userId);
    return { dailyActivityId: input.dailyActivityId };
  },
});
