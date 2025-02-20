// app/api/projects/[id]/route.js
import { apiHandler, APIError, createResponse, getSession } from "@/lib/utils";
import prisma from "@/lib/prisma";
import {
	validateProjectData,
	isProjectMember,
	authorizeProjectAccess,
} from "@/lib/projectUtils";
import { Permissions, SpecialPermissions } from "@/lib/permissions";

export const GET = apiHandler(
	async (req, { params }) => {
		const { id } = await params;
		const { permissions, session } = req;

		// First check if user has general project read permission
		if (!Permissions.can(Permissions.READ_PROJECT)) {
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
			// Remove sensitive fields if user doesn't have sufficient permissions
			meetings: permissions.can(Permissions.READ_MEETING)
				? project.meetings
				: [],
			tasks: permissions.can(Permissions.READ_TASK) ? project.tasks : [],
		};

		return createResponse(sanitizedProject);
	},
	// Define contextual permission requirements
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

				// Add new members
				const membersToAdd = members.filter(
					(m) => !currentMemberIds.includes(m.userId)
				);

				if (membersToAdd.length > 0) {
					await tx.projectMember.createMany({
						data: membersToAdd.map((member) => ({
							projectId: id,
							userId: member.userId,
							role: member.role || "TEAM_MEMBER",
							roleDescription: member.roleDescription,
						})),
						skipDuplicates: true,
					});
				}

				// Update existing members
				for (const member of members) {
					if (currentMemberIds.includes(member.userId)) {
						await tx.projectMember.updateMany({
							where: {
								projectId: id,
								userId: member.userId,
							},
							data: {
								role: member.role,
								roleDescription: member.roleDescription,
							},
						});
					}
				}

				// Remove members not in the updated list (except protected users)
				const memberIdsToKeep = members.map((m) => m.userId);
				await tx.projectMember.deleteMany({
					where: {
						projectId: id,
						userId: {
							notIn: [...memberIdsToKeep, ...protectedIds],
						},
					},
				});
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

export const DELETE = apiHandler(async (req, { params }) => {
	const { id } = await params;
	const session = await getSession();

	await authorizeProjectAccess(
		id,
		session,
		Permissions.DELETE_PROJECT,
		"delete"
	);

	try {
		await prisma.$transaction(async (tx) => {
			await tx.projectMember.deleteMany({
				where: { projectId: id },
			});

			await tx.comment.deleteMany({
				where: {
					projectMember: {
						projectId: id,
					},
				},
			});

			const projectMeetings = await tx.meeting.findMany({
				where: { projectId: id },
				select: { id: true },
			});

			const meetingIds = projectMeetings.map((m) => m.id);

			if (meetingIds.length > 0) {
				await tx.meetingAttendee.deleteMany({
					where: { meetingId: { in: meetingIds } },
				});

				await tx.meetingActionItem.deleteMany({
					where: { meetingId: { in: meetingIds } },
				});

				await tx.meetingDecision.deleteMany({
					where: { meetingId: { in: meetingIds } },
				});

				// Delete meetings
				await tx.meeting.deleteMany({
					where: { projectId: id },
				});
			}

			await tx.milestone.deleteMany({
				where: { projectId: id },
			});

			await tx.task.updateMany({
				where: {
					projectId: id,
					parentId: { not: null },
				},
				data: { parentId: null },
			});

			await tx.task.deleteMany({
				where: { projectId: id },
			});

			await tx.resource.deleteMany({
				where: { projectId: id },
			});

			await tx.project.delete({
				where: { id },
			});
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
