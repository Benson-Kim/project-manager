// lib/moduleApiHandler.js
import { apiHandler, APIError, createResponse } from "@/lib/utils";
import prisma from "@/lib/prisma";
import { Permissions } from "@/lib/permissions";
import { authorizeProjectAccess } from "@/lib/projectUtils";

export function createModuleApiHandlers({
	modelName,
	resourceType,
	validateData = () => true,
	includeRelations = {},
	transformResponse = (data) => data,
	whereClause = (projectId) => ({ projectId }),
	belongsToProject = (item, projectId) => item.projectId === projectId,
}) {
	const modelNameCamel = modelName.charAt(0).toLowerCase() + modelName.slice(1);
	const readPermission = Permissions[`READ_${resourceType}`];
	const createPermission = Permissions[`CREATE_${resourceType}`];
	const updatePermission = Permissions[`UPDATE_${resourceType}`];
	const deletePermission = Permissions[`DELETE_${resourceType}`];

	const listHandler = async (req, { params }) => {
		const resolvedParams = await params;
		console.log("List resolved params:", resolvedParams);
		const { id: projectId } = resolvedParams;
		if (!projectId) throw new APIError("Project ID is required", 400);
		const { session } = req;
		await authorizeProjectAccess(projectId, session, readPermission, "access");
		const items = await prisma[modelNameCamel].findMany({
			where: whereClause(projectId),
			include: includeRelations,
			orderBy: { createdAt: "desc" },
		});
		return createResponse(items.map(transformResponse));
	};

	const getHandler = async (req, { params }) => {
		const resolvedParams = await params;
		const { id: projectId, itemId } = resolvedParams;
		if (!projectId) throw new APIError("Project ID is required", 400);
		if (!itemId) throw new APIError("Item ID is required", 400);
		const { session } = req;
		await authorizeProjectAccess(projectId, session, readPermission, "access");
		const item = await prisma[modelNameCamel].findUnique({
			where: { id: itemId },
			include: includeRelations,
		});
		if (!item || !belongsToProject(item, projectId)) {
			throw new APIError(`${modelName} not found`, 404);
		}
		return createResponse(transformResponse(item));
	};

	const createHandler = async (req, { params }) => {
		const resolvedParams = await params;
		const { id: projectId } = resolvedParams;
		if (!projectId) throw new APIError("Project ID is required", 400);
		const { session } = req;
		await authorizeProjectAccess(
			projectId,
			session,
			createPermission,
			"create"
		);
		let data;
		try {
			data = await req.json();
		} catch (error) {
			throw new APIError("Invalid JSON in request body", 400);
		}
		validateData(data);
		try {
			const newItem = await prisma[modelNameCamel].create({
				data: { ...data, projectId },
				include: includeRelations,
			});
			return createResponse(transformResponse(newItem), 201);
		} catch (error) {
			if (error.code === "P2002") {
				throw new APIError(
					`A ${modelName} with this identifier already exists`,
					400
				);
			}
			throw error;
		}
	};

	const updateHandler = async (req, { params }) => {
		const resolvedParams = await params;
		const { id: projectId, itemId } = resolvedParams;
		if (!projectId) throw new APIError("Project ID is required", 400);
		if (!itemId) throw new APIError("Item ID is required", 400);
		const { session } = req;
		await authorizeProjectAccess(
			projectId,
			session,
			updatePermission,
			"update"
		);
		const existingItem = await prisma[modelNameCamel].findUnique({
			where: { id: itemId },
		});
		if (!existingItem || !belongsToProject(existingItem, projectId)) {
			throw new APIError(`${modelName} not found`, 404);
		}
		let data;
		try {
			data = await req.json();
		} catch (error) {
			throw new APIError("Invalid JSON in request body", 400);
		}
		validateData(data);
		try {
			const updatedItem = await prisma[modelNameCamel].update({
				where: { id: itemId },
				data,
				include: includeRelations,
			});
			return createResponse(transformResponse(updatedItem));
		} catch (error) {
			if (error.code === "P2002") {
				throw new APIError(
					`A ${modelName} with this identifier already exists`,
					400
				);
			}
			throw error;
		}
	};

	const deleteHandler = async (req, { params }) => {
		const resolvedParams = await params;
		const { id: projectId, itemId } = resolvedParams;
		if (!projectId) throw new APIError("Project ID is required", 400);
		if (!itemId) throw new APIError("Item ID is required", 400);
		const { session } = req;
		await authorizeProjectAccess(
			projectId,
			session,
			deletePermission,
			"delete"
		);
		const existingItem = await prisma[modelNameCamel].findUnique({
			where: { id: itemId },
		});
		if (!existingItem || !belongsToProject(existingItem, projectId)) {
			throw new APIError(`${modelName} not found`, 404);
		}
		await prisma[modelNameCamel].delete({ where: { id: itemId } });
		return createResponse({
			success: true,
			message: `${modelName} deleted successfully`,
		});
	};

	return {
		listHandler: apiHandler(listHandler, readPermission),
		getHandler: apiHandler(getHandler, readPermission),
		createHandler: apiHandler(createHandler, createPermission),
		updateHandler: apiHandler(updateHandler, updatePermission),
		deleteHandler: apiHandler(deleteHandler, deletePermission),
	};
}
