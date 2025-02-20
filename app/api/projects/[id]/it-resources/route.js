// app/api/projects/[id]/it-resources/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateITResource } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "ITResource",
	resourceType: ResourceTypes.IT_RESOURCE,
	validateData: validateITResource,
});

export const GET = listHandler;
export const POST = createHandler;
