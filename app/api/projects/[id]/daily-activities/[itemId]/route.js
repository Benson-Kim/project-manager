// app/api/projects/[id]/daily-activities/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateDailyActivity } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { getHandler, updateHandler, deleteHandler } = createModuleApiHandlers({
	modelName: "DailyActivity",
	resourceType: ResourceTypes.DAILY_ACTIVITY,
	validateData: validateDailyActivity,
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;
