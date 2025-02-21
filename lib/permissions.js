// lib/permissions.js
export const Roles = {
	ADMIN: "ADMIN",
	PROJECT_MANAGER: "PROJECT_MANAGER",
	STAKEHOLDER: "STAKEHOLDER",
	TEAM_MEMBER: "TEAM_MEMBER",
};

export const ResourceTypes = {
	PROJECT: "PROJECT",
	TASK: "TASK",
	MEETING: "MEETING",
	DOCUMENT: "DOCUMENT",
	STAKEHOLDER: "STAKEHOLDER",
	ACRONYM: "ACRONYM",
	KEY_DELIVERABLE: "KEY_DELIVERABLE",
	OBJECTIVE: "OBJECTIVE",
	QUESTION_ANSWER: "QUESTION_ANSWER",
	SUPPLIER: "SUPPLIER",
	ASSUMPTION_CONSTRAINT: "ASSUMPTION_CONSTRAINT",
	PARKING_LOT_ITEM: "PARKING_LOT_ITEM",
	IT_RESOURCE: "IT_RESOURCE",
	FINANCIAL: "FINANCIAL",
	ISSUE_RISK: "ISSUE_RISK",
	DAILY_ACTIVITY: "DAILY_ACTIVITY",
	MILESTONE: "MILESTONE",
	COMMENT: "COMMENT",
	NOTE: "NOTE",
};

export const Actions = {
	CREATE: "CREATE",
	READ: "READ",
	UPDATE: "UPDATE",
	DELETE: "DELETE",
	MANAGE: "MANAGE", // Special permission that implies all others
};

// Special permissions that don't follow the resource-action pattern
export const SpecialPermissions = {
	VIEW_ALL_PROJECTS: "VIEW_ALL_PROJECTS",
	VIEW_ASSIGNED_PROJECTS: "VIEW_ASSIGNED_PROJECTS",
	MANAGE_TEAM_MEMBERS: "MANAGE_TEAM_MEMBERS",
	GENERATE_REPORTS: "GENERATE_REPORTS",
};

// Generate granular permissions for each resource type
export const Permissions = Object.entries(ResourceTypes).reduce(
	(acc, [resource, resourceValue]) => {
		Object.entries(Actions).forEach(([action, actionValue]) => {
			acc[`${action}_${resource}`] = `${action}_${resource}`;
		});
		return acc;
	},
	{}
);

// Combine all permissions
Object.assign(Permissions, SpecialPermissions);

// Define role hierarchies (roles inherit permissions from roles below them)
const roleHierarchy = {
	[Roles.ADMIN]: [Roles.PROJECT_MANAGER],
	[Roles.PROJECT_MANAGER]: [Roles.STAKEHOLDER],
	[Roles.STAKEHOLDER]: [Roles.TEAM_MEMBER],
	[Roles.TEAM_MEMBER]: [],
};

// Base permissions for each role
const baseRolePermissions = {
	[Roles.ADMIN]: [
		SpecialPermissions.MANAGE_TEAM_MEMBERS,
		SpecialPermissions.GENERATE_REPORTS,
	],
	[Roles.PROJECT_MANAGER]: [
		Permissions.CREATE_PROJECT,
		Permissions.UPDATE_PROJECT,
		Permissions.DELETE_PROJECT,
		Permissions.MANAGE_TASK,
		SpecialPermissions.VIEW_ALL_PROJECTS,
		SpecialPermissions.VIEW_ASSIGNED_PROJECTS,
	],
	[Roles.STAKEHOLDER]: [
		Permissions.READ_PROJECT,
		Permissions.READ_TASK,
		Permissions.READ_MEETING,
		SpecialPermissions.VIEW_ASSIGNED_PROJECTS,
	],
	[Roles.TEAM_MEMBER]: [
		Permissions.READ_PROJECT,
		Permissions.READ_TASK,
		Permissions.UPDATE_TASK,
		SpecialPermissions.VIEW_ASSIGNED_PROJECTS,
	],
};

// Function to get all permissions for a role including inherited ones
function getAllRolePermissions(role) {
	const inheritedRoles = getInheritedRoles(role);
	const permissions = new Set();

	inheritedRoles.forEach((inheritedRole) => {
		baseRolePermissions[inheritedRole]?.forEach((permission) =>
			permissions.add(permission)
		);
	});

	return Array.from(permissions);
}

// Helper to get all inherited roles including the role itself
function getInheritedRoles(role) {
	const roles = [role];
	const inheritedRoles = roleHierarchy[role] || [];

	inheritedRoles.forEach((inheritedRole) => {
		roles.push(...getInheritedRoles(inheritedRole));
	});

	return [...new Set(roles)];
}

// Cache role permissions for better performance
const rolePermissionsCache = Object.keys(Roles).reduce((acc, role) => {
	acc[role] = getAllRolePermissions(role);
	return acc;
}, {});

export function hasPermission(userRole, permission) {
	if (!userRole || !permission) return false;
	return rolePermissionsCache[userRole]?.includes(permission) ?? false;
}

// New function to check multiple permissions
export function hasPermissions(userRole, permissions) {
	return permissions.every((permission) => hasPermission(userRole, permission));
}

// New function to check if user has any of the given permissions
export function hasAnyPermission(userRole, permissions) {
	return permissions.some((permission) => hasPermission(userRole, permission));
}

// New function to check contextual permissions
export function checkContextualPermission(userRole, permission, context) {
	// First check if user has the permission
	if (!hasPermission(userRole, permission)) {
		return false;
	}

	// Handle special cases
	switch (permission) {
		case SpecialPermissions.VIEW_ASSIGNED_PROJECTS:
			return context.isProjectMember;
		case Permissions.UPDATE_TASK:
			return context.isProjectMember && context.isTaskAssignee;
		default:
			return true;
	}
}

// Helper function to get all permissions for a role
export function getRolePermissions(role) {
	return rolePermissionsCache[role] || [];
}
