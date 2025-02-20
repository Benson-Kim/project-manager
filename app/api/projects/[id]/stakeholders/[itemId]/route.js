// app/api/projects/[id]/stakeholders/[itemId]/route.js
import { apiHandler, createResponse, getSession } from "@/lib/utils";
import prisma from "@/lib/prisma";
import { Permissions } from "@/lib/permissions";
import { authorizeProjectAccess, isProjectMember } from "@/lib/projectUtils";

// Get a specific stakeholder
export const GET = apiHandler(
	async (req, { params }) => {
		const { projectId, stakeholderId } = await params;
		const session = await getSession();

		const isMember = await isProjectMember(session.user.id, projectId);
		if (!isMember && session.user.role !== "ADMIN") {
			throw new APIError("Not authorized to view this project", 403);
		}

		const stakeholder = await prisma.stakeholder.findUnique({
			where: { id: stakeholderId, projectId },
		});

		if (!stakeholder) {
			throw new APIError("Stakeholder not found", 404);
		}

		return createResponse(stakeholder);
	},
	{
		permission: Permissions.READ_PROJECT,
		getContext: async (req, session, { params }) => {
			const { projectId } = await params;
			const isMember = await isProjectMember(session.user.id, projectId);
			return { isProjectMember: isMember };
		},
	}
);

// Update a stakeholder
export const PUT = apiHandler(async (req, { params }) => {
	const { projectId, stakeholderId } = await params;
	const session = await getSession();

	await authorizeProjectAccess(
		projectId,
		session,
		Permissions.UPDATE_PROJECT,
		"update"
	);

	const data = await req.json();
	if (!data.name) {
		throw new APIError("Stakeholder name is required", 400);
	}

	const stakeholder = await prisma.stakeholder.update({
		where: { id: stakeholderId, projectId },
		data: {
			name: data.name,
			role: data.role,
			contact: data.contact,
		},
	});

	return createResponse(stakeholder);
}, Permissions.UPDATE_PROJECT);

// Delete a stakeholder
export const DELETE = apiHandler(async (req, { params }) => {
	const { projectId, stakeholderId } = await params;
	const session = await getSession();

	await authorizeProjectAccess(
		projectId,
		session,
		Permissions.UPDATE_PROJECT,
		"update"
	);

	await prisma.stakeholder.delete({
		where: { id: stakeholderId, projectId },
	});

	return createResponse({ message: "Stakeholder deleted successfully" });
}, Permissions.UPDATE_PROJECT);
