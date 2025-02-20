// app/api/projects/[id]/issue-risks/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateIssueRisk } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/permissions";

const { listHandler, createHandler } = createModuleApiHandlers({
	modelName: "IssueRisk",
	resourceType: ResourceTypes.ISSUE_RISK,
	validateData: validateIssueRisk,
});

export const GET = listHandler;
export const POST = createHandler;
