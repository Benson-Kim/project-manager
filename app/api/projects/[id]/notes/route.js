// app/api/projects/[id]/notes/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateNote } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "Note",
	resourceType: ResourceTypes.NOTE,
	validateData: validateNote,
});

export const GET = listHandler;
export const POST = createHandler;
