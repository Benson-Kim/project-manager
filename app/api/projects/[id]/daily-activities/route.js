// app/api/projects/[id]/daily-activities/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateDailyActivity } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "DailyActivity",
	resourceType: ResourceTypes.DAILY_ACTIVITY,
	validateData: validateDailyActivity,
});

export const GET = listHandler;
export const POST = createHandler;
