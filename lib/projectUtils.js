// lib/projectUtils.js

import {
	hasPermission,
	Permissions,
	Roles,
	SpecialPermissions,
} from "./newpermissions";
import { APIError } from "./utils";

// Validation helper functions
export const validateProjectDates = (startDate, endDate) => {
	const start = new Date(startDate);
	const end = new Date(endDate);

	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		throw new APIError("Invalid date format", 400);
	}

	if (start > end) {
		throw new APIError("Start date must be before end date", 400);
	}

	return { start, end };
};

export const validateProjectStatus = (status) => {
	const validStatuses = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];
	if (!validStatuses.includes(status)) {
		throw new APIError(
			`Invalid status. Must be one of: ${validStatuses.join(", ")}`,
			400
		);
	}
};

export const validateProjectData = (data) => {
	const { name, description, startDate, endDate, status, budget, members } =
		data;

	if (!name?.trim()) {
		throw new APIError("Project name is required", 400);
	}

	if (name.length > 100) {
		throw new APIError("Project name must be less than 100 characters", 400);
	}

	if (description && description.length > 1000) {
		throw new APIError("Description must be less than 1000 characters", 400);
	}

	if (!startDate || !endDate) {
		throw new APIError("Start date and end date are required", 400);
	}

	validateProjectDates(startDate, endDate);

	if (!status) {
		throw new APIError("Project status is required", 400);
	}

	validateProjectStatus(status);

	if (budget && (isNaN(budget) || budget < 0)) {
		throw new APIError("Budget must be a positive number", 400);
	}

	if (members && !Array.isArray(members)) {
		throw new APIError("Members must be an array", 400);
	}

	return true;
};

// Reusable project authorization helper
export const authorizeProjectAccess = async (
	id,
	session,
	requiredPermission,
	action = "access"
) => {
	// Verify project exists
	const existingProject = await prisma.project.findUnique({
		where: { id },

		include: {
			createdBy: {
				select: { id: true },
			},
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

	if (!existingProject) {
		throw new APIError("Project not found", 404);
	}

	const isAdmin = session.user.role === Roles.ADMIN;
	const isPM = session.user.role === Roles.PROJECT_MANAGER;
	const isCreator = existingProject.createdBy.id === session.user.id;

	// Get membership if exists
	const membership = existingProject.members.find(
		(member) => member.userId === session.user.id
	);

	// Check for special view all permission
	const hasViewAllPermission =
		session.user.role === Roles.ADMIN ||
		[Permissions.VIEW_ALL_PROJECTS, SpecialPermissions.VIEW_ALL_PROJECTS].some(
			(perm) => hasPermission(session.user.role, perm)
		);

	// Authorization logic based on action type
	if (!isAdmin) {
		if (action === "update" && !(isPM && (isCreator || membership))) {
			throw new APIError(
				"Insufficient permissions to update this project",
				403
			);
		}

		if (action === "delete" && !(isPM && isCreator)) {
			throw new APIError(
				"Only administrators or project creators can delete projects",
				403
			);
		}

		if (!hasViewAllPermission && !membership && !isCreator) {
			throw new APIError(
				`Insufficient permissions to ${action} this project`,
				403
			);
		}
	}

	// General permission check
	if (
		requiredPermission &&
		!hasPermission(session.user.role, requiredPermission)
	) {
		throw new APIError(`No permission to ${action} projects`, 403);
	}

	return { existingProject, isAdmin, isPM, isCreator, membership };
};

// Helper to check if user is a project member
export async function isProjectMember(userId, projectId) {
	const membership = await prisma.projectMember.findFirst({
		where: {
			userId,
			projectId,
		},
	});
	return !!membership;
}

/**
 * Handles common project member operations in a transaction
 * @param {Object} tx - Prisma transaction object
 * @param {String} projectId - Project ID
 * @param {Array} updatedMembers - New member list
 * @param {Array} currentMembers - Existing member list
 * @param {Array} protectedUserIds - User IDs that shouldn't be removed
 */
export const syncProjectMembers = async (
	tx,
	projectId,
	updatedMembers = [],
	currentMembers = [],
	protectedUserIds = []
) => {
	// Extract current member IDs
	const currentMemberIds = currentMembers.map((m) =>
		typeof m === "object" && m.userId ? m.userId : m
	);

	// Add new members
	const membersToAdd = updatedMembers.filter(
		(m) => !currentMemberIds.includes(m.userId)
	);

	if (membersToAdd.length > 0) {
		await tx.projectMember.createMany({
			data: membersToAdd.map((member) => ({
				projectId,
				userId: member.userId,
				role: member.role || "TEAM_MEMBER",
				roleDescription: member.roleDescription || null,
			})),
			skipDuplicates: true,
		});
	}

	// Update existing members
	for (const member of updatedMembers) {
		if (currentMemberIds.includes(member.userId)) {
			await tx.projectMember.updateMany({
				where: {
					projectId,
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
	const memberIdsToKeep = updatedMembers.map((m) => m.userId);
	await tx.projectMember.deleteMany({
		where: {
			projectId,
			userId: {
				notIn: [...memberIdsToKeep, ...protectedUserIds],
			},
		},
	});
};

/**
 * Helper to delete all project-related entities in the correct order
 * @param {Object} tx - Prisma transaction object
 * @param {String} projectId - Project ID to delete
 */
export const deleteProjectWithRelations = async (tx, projectId) => {
	// 1. Delete project members and their comments
	await tx.comment.deleteMany({
		where: {
			projectMember: {
				projectId,
			},
		},
	});

	await tx.projectMember.deleteMany({
		where: { projectId },
	});

	// 2. Handle meetings and related entities
	const projectMeetings = await tx.meeting.findMany({
		where: { projectId },
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

		await tx.meeting.deleteMany({
			where: { projectId },
		});
	}

	// 3. Delete milestones
	await tx.milestone.deleteMany({
		where: { projectId },
	});

	// 4. Handle tasks with parent-child relationships
	await tx.task.updateMany({
		where: {
			projectId,
			parentId: { not: null },
		},
		data: { parentId: null },
	});

	await tx.task.deleteMany({
		where: { projectId },
	});

	// 5. Delete resources
	await tx.resource.deleteMany({
		where: { projectId },
	});

	// 6. Finally delete the project
	await tx.project.delete({
		where: { id: projectId },
	});
};
