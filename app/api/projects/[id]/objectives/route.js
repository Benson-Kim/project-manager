// app/api/projects/[id]/objectives/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateObjective } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "Objective",
	resourceType: ResourceTypes.OBJECTIVE,
	validateData: validateObjective,
});

export const GET = listHandler;
export const POST = createHandler;
