// app/api/projects/[id]/it-resources/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateITResource } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { getHandler, updateHandler, deleteHandler } = createModuleApiHandlers({
	modelName: "ITResource",
	resourceType: ResourceTypes.IT_RESOURCE,
	validateData: validateITResource,
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;
