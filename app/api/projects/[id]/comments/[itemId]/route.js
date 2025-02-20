// app/api/projects/[id]/comments/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateComment } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { getHandler, updateHandler, deleteHandler } = createModuleApiHandlers({
	modelName: "Comment",
	resourceType: ResourceTypes.COMMENT,
	validateData: validateComment,
	whereClause: (projectId) => ({ projectMember: { projectId } }),
	includeRelations: { projectMember: true },
	belongsToProject: (item, projectId) =>
		item.projectMember?.projectId === projectId,
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;
