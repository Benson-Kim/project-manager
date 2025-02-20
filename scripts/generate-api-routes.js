// scripts/generate-api-routes.js
const fs = require("fs").promises;
const path = require("path");

const modules = [
	{
		name: "projects",
		modelName: "Project",
		resourceType: "PROJECT",
		validator: "validateProject",
	},
	{
		name: "tasks",
		modelName: "Task",
		resourceType: "TASK",
		validator: "validateTask",
	},
	{
		name: "stakeholders",
		modelName: "Stakeholder",
		resourceType: "STAKEHOLDER",
		validator: "validateStakeholder",
	},
	{
		name: "acronyms",
		modelName: "Acronym",
		resourceType: "ACRONYM",
		validator: "validateAcronym",
	},
	{
		name: "key-deliverables",
		modelName: "KeyDeliverable",
		resourceType: "KEY_DELIVERABLE",
		validator: "validateKeyDeliverable",
	},
	{
		name: "objectives",
		modelName: "Objective",
		resourceType: "OBJECTIVE",
		validator: "validateObjective",
	},
	{
		name: "questions-answers",
		modelName: "QuestionAnswer",
		resourceType: "QUESTION_ANSWER",
		validator: "validateQuestionAnswer",
	},
	{
		name: "suppliers",
		modelName: "Supplier",
		resourceType: "SUPPLIER",
		validator: "validateSupplier",
	},
	{
		name: "assumption-constraints",
		modelName: "AssumptionConstraint",
		resourceType: "ASSUMPTION_CONSTRAINT",
		validator: "validateAssumptionConstraint",
	},
	{
		name: "parking-lot-items",
		modelName: "ParkingLotItem",
		resourceType: "PARKING_LOT_ITEM",
		validator: "validateParkingLotItem",
	},
	{
		name: "it-resources",
		modelName: "ITResource",
		resourceType: "IT_RESOURCE",
		validator: "validateITResource",
	},
	{
		name: "financials",
		modelName: "Financial",
		resourceType: "FINANCIAL",
		validator: "validateFinancial",
	},
	{
		name: "issue-risks",
		modelName: "IssueRisk",
		resourceType: "ISSUE_RISK",
		validator: "validateIssueRisk",
	},
	{
		name: "daily-activities",
		modelName: "DailyActivity",
		resourceType: "DAILY_ACTIVITY",
		validator: "validateDailyActivity",
	},
	{
		name: "notes",
		modelName: "Note",
		resourceType: "NOTE",
		validator: "validateNote",
	},
	{
		name: "comments",
		modelName: "Comment",
		resourceType: "COMMENT",
		validator: "validateComment",
		whereClause: `(projectId) => ({ projectMember: { projectId } })`,
		includeRelations: { projectMember: true },
		belongsToProject: `(item, projectId) => item.projectMember?.projectId === projectId`,
	},
];

async function generateMainRouteFile(module) {
	const whereClausePart = module.whereClause
		? `whereClause: ${module.whereClause},`
		: "";
	const includeRelationsPart = module.includeRelations
		? `includeRelations: ${JSON.stringify(module.includeRelations)},`
		: "";
	const belongsToProjectPart = module.belongsToProject
		? `belongsToProject: ${module.belongsToProject},`
		: "";

	const content = `// app/api/projects/[id]/${module.name}/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { ${module.validator} } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "${module.modelName}",
  resourceType: ResourceTypes.${module.resourceType},
  validateData: ${module.validator},
  ${whereClausePart}
  ${includeRelationsPart}
  ${belongsToProjectPart}
});

export const GET = listHandler;
export const POST = createHandler;
`;
	const dir = path.join(__dirname, "../app/api/projects/[id]", module.name);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, "route.js"), content.trim());
}

async function generateIdRouteFile(module) {
	const whereClausePart = module.whereClause
		? `whereClause: ${module.whereClause},`
		: "";
	const includeRelationsPart = module.includeRelations
		? `includeRelations: ${JSON.stringify(module.includeRelations)},`
		: "";
	const belongsToProjectPart = module.belongsToProject
		? `belongsToProject: ${module.belongsToProject},`
		: "";

	const content = `// app/api/projects/[id]/${module.name}/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { ${module.validator} } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "${module.modelName}",
  resourceType: ResourceTypes.${module.resourceType},
  validateData: ${module.validator},
  ${whereClausePart}
  ${includeRelationsPart}
  ${belongsToProjectPart}
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;
`;
	const dir = path.join(
		__dirname,
		"../app/api/projects/[id]",
		module.name,
		"[itemId]"
	);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, "route.js"), content.trim());
}

async function generateRoutes() {
	for (const module of modules) {
		await generateMainRouteFile(module);
		await generateIdRouteFile(module);
		console.log(`Generated routes for ${module.name}`);
	}
}

generateRoutes().catch(console.error);
