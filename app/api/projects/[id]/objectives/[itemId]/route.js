// app/api/projects/[id]/objectives/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateObjective } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { getHandler, updateHandler, deleteHandler } = createModuleApiHandlers({
	modelName: "Objective",
	resourceType: ResourceTypes.OBJECTIVE,
	validateData: validateObjective,
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;
