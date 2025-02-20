// app/api/projects/[id]/tasks/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateTask } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { getHandler, updateHandler, deleteHandler } = createModuleApiHandlers({
	modelName: "Task",
	resourceType: ResourceTypes.TASK,
	validateData: validateTask,
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;
