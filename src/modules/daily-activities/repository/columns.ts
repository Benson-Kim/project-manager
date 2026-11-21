import { customColumnRepository } from "@/lib/custom-columns/repository";
import { DAILY_ACTIVITY_BUILT_IN_COLUMNS } from "../schemas/columns";

/** The activity list's column names and added columns, per project; the procs check access and audit. */
export const activityColumns = customColumnRepository(
  "DailyActivity",
  DAILY_ACTIVITY_BUILT_IN_COLUMNS,
);
