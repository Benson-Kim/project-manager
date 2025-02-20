// app/api/projects/[id]/acronyms/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateAcronym } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "Acronym",
	resourceType: ResourceTypes.ACRONYM,
	validateData: validateAcronym,
});

export const GET = listHandler;
export const POST = createHandler;
