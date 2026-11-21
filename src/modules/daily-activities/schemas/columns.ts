import { columnSchemaFor } from "@/lib/custom-columns/register";
import { messages } from "@/lib/messages";

const M = messages.dailyActivities;

/** The project activity list's built-in columns: stable key and default name. One list for the view and the procs. */
export const DAILY_ACTIVITY_BUILT_IN_COLUMNS = [
  { key: "Requester", name: M.requester },
  { key: "RequestDate", name: M.requestDate },
  { key: "ContactMethod", name: M.contactMethod },
  { key: "Task", name: M.columns.task },
  { key: "MyActivity", name: M.columns.myActivity },
  { key: "ActivityDate", name: M.columns.activityDate },
  { key: "ActivityStatus", name: M.activityStatus },
  { key: "Comments", name: M.comments },
  { key: "CompleteDate", name: M.columns.completeDate },
] as const;

export const dailyActivityColumnSchema = columnSchemaFor("DailyActivity");
