// app/api/projects/[id]/tasks/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateTask } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "Task",
	resourceType: ResourceTypes.TASK,
	validateData: validateTask,
});

export const GET = listHandler;
export const POST = createHandler;
