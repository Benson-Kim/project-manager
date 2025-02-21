import { apiHandler, APIError, createResponse, getSession } from "@/lib/utils";
import prisma from "@/lib/prisma";
import {
	validateProjectData,
	isProjectMember,
	authorizeProjectAccess,
	syncProjectMembers,
	deleteProjectWithRelations,
} from "@/lib/projectUtils";
import { Permissions, SpecialPermissions } from "@/lib/permissions";

// GET: Fetch a single project
export const GET = apiHandler(
	async (req, { params }) => {
		const { id } = await params;
		const { permissions, session } = req;

		// Check if user has permission to read projects
		if (!permissions.can(Permissions.READ_PROJECT)) {
			throw new APIError("No permission to view projects", 403);
		}

		// Check if user can view all projects or is a project member
		const canViewAll = permissions.can(SpecialPermissions.VIEW_ALL_PROJECTS);
		if (!canViewAll) {
			const isMember = await isProjectMember(session.user.id, id);
			if (!isMember) {
				throw new APIError("Not authorized to view this project", 403);
			}
		}

		// Fetch the project with related data
		const project = await prisma.project.findUnique({
			where: { id },
			include: {
				members: {
					include: {
						user: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								email: true,
								role: true,
							},
						},
					},
				},
				tasks: {
					select: {
						id: true,
						status: true,
					},
				},
				meetings: true,
				_count: {
					select: {
						tasks: true,
						milestones: true,
						meetings: true,
					},
				},
			},
		});

		if (!project) {
			throw new APIError("Project not found", 404);
		}

		// Optionally filter sensitive data based on user role
		const sanitizedProject = {
			...project,
			meetings: permissions.can(Permissions.READ_MEETING)
				? project.meetings
				: [],
			tasks: permissions.can(Permissions.READ_TASK) ? project.tasks : [],
		};

		return createResponse(sanitizedProject);
	},
	// Contextual permission requirements
	{
		permission: Permissions.READ_PROJECT,
		getContext: async (req, session, { params }, permissions) => {
			const { id } = await params;
			const isMember = await isProjectMember(session.user.id, id);
			return {
				isProjectMember: isMember,
			};
		},
	}
);

// PUT: Update a project
export const PUT = apiHandler(async (req, { params }) => {
	const { id } = await params;
	const session = await getSession();

	// Authorize with detailed context
	const { existingProject, isAdmin, isPM } = await authorizeProjectAccess(
		id,
		session,
		Permissions.UPDATE_PROJECT,
		"update"
	);

	// Parse and validate request body
	let projectData;
	try {
		projectData = await req.json();
	} catch (error) {
		throw new APIError("Invalid JSON in request body", 400);
	}

	// Validate project data
	validateProjectData(projectData);

	const {
		name,
		description,
		startDate,
		endDate,
		status,
		budget,
		members = [],
	} = projectData;

	// Update project with members in a transaction
	try {
		const project = await prisma.$transaction(async (tx) => {
			// Update the project
			const updatedProject = await tx.project.update({
				where: { id },
				data: {
					name,
					description,
					startDate: new Date(startDate),
					endDate: new Date(endDate),
					status,
					budget: budget ? parseFloat(budget) : null,
				},
			});

			// Handle member updates if user has sufficient permissions
			if ((isAdmin || isPM) && members.length > 0) {
				const currentMemberIds = existingProject.members.map((m) => m.userId);
				const protectedIds = [existingProject.createdBy.id, session.user.id];

				// Sync project members
				await syncProjectMembers(
					tx,
					id,
					members,
					existingProject.members,
					protectedIds
				);
			}

			// Return updated project with members
			return tx.project.findUnique({
				where: { id },
				include: {
					members: {
						include: {
							user: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									email: true,
									role: true,
								},
							},
						},
					},
				},
			});
		});

		return createResponse(project);
	} catch (error) {
		if (error.code === "P2002") {
			throw new APIError("A project with this name already exists", 400);
		}
		if (error.code === "P2003") {
			throw new APIError("One or more user IDs are invalid", 400);
		}
		throw error;
	}
}, Permissions.UPDATE_PROJECT);

// DELETE: Delete a project
export const DELETE = apiHandler(async (req, { params }) => {
	const { id } = await params;
	const session = await getSession();

	// Authorize with detailed context
	await authorizeProjectAccess(
		id,
		session,
		Permissions.DELETE_PROJECT,
		"delete"
	);

	try {
		await prisma.$transaction(async (tx) => {
			// Delete project and all related entities
			await deleteProjectWithRelations(tx, id);
		});

		return createResponse({
			success: true,
			message: "Project deleted successfully",
		});
	} catch (error) {
		console.error("Error deleting project:", error);
		throw new APIError(`Failed to delete project: ${error.message}`, 500);
	}
}, Permissions.DELETE_PROJECT);
