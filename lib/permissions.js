// lib/permissions.js
export const Roles = {
	ADMIN: "ADMIN",
	PROJECT_MANAGER: "PROJECT_MANAGER",
	STAKEHOLDER: "STAKEHOLDER",
	TEAM_MEMBER: "TEAM_MEMBER",
};

export const Permissions = {
	// Project permissions
	CREATE_PROJECT: "CREATE_PROJECT",
	EDIT_PROJECT: "EDIT_PROJECT",
	DELETE_PROJECT: "DELETE_PROJECT",
	VIEW_ALL_PROJECTS: "VIEW_ALL_PROJECTS",
	VIEW_ASSIGNED_PROJECTS: "VIEW_ASSIGNED_PROJECTS",

	// Milestones permissions
	CREATE_MILESTONE: "CREATE_MILESTONE",
	EDIT_MILESTONE: "EDIT_MILESTONE",
	DELETE_MILESTONE: "DELETE_MILESTONE",
	VIEW_ALL_MILESTONES: "VIEW_ALL_MILESTONES",
	VIEW_ASSIGNED_MILESTONES: "VIEW_ASSIGNED_MILESTONES",

	// Task permissions
	CREATE_TASK: "CREATE_TASK",
	EDIT_TASK: "EDIT_TASK",
	DELETE_TASK: "DELETE_TASK",
	VIEW_ALL_TASKS: "VIEW_ALL_TASKS",
	VIEW_ASSIGNED_TASKS: "VIEW_ASSIGNED_TASKS",

	// Comment permissions
	CREATE_COMMENT: "CREATE_COMMENT",
	EDIT_OWN_COMMENT: "EDIT_OWN_COMMENT",
	DELETE_ANY_COMMENT: "DELETE_ANY_COMMENT",

	// User management
	MANAGE_USERS: "MANAGE_USERS",
	MANAGE_ROLES: "MANAGE_ROLES",

	// System settings
	MANAGE_SETTINGS: "MANAGE_SETTINGS",
};

const rolePermissions = {
	[Roles.ADMIN]: Object.values(Permissions),
	[Roles.PROJECT_MANAGER]: [
		Permissions.MANAGE_ROLES,
		Permissions.MANAGE_USERS,
		Permissions.CREATE_PROJECT,
		Permissions.EDIT_PROJECT,
		Permissions.DELETE_PROJECT,
		Permissions.VIEW_ALL_PROJECTS,
		Permissions.VIEW_ASSIGNED_PROJECTS,
		Permissions.CREATE_TASK,
		Permissions.EDIT_TASK,
		Permissions.DELETE_TASK,
		Permissions.VIEW_ALL_TASKS,
		Permissions.CREATE_MILESTONE,
		Permissions.EDIT_MILESTONE,
		Permissions.DELETE_MILESTONE,
		Permissions.VIEW_ALL_MILESTONES,
		Permissions.CREATE_COMMENT,
		Permissions.EDIT_OWN_COMMENT,
		Permissions.DELETE_ANY_COMMENT,
	],
	[Roles.STAKEHOLDER]: [
		Permissions.VIEW_ASSIGNED_PROJECTS,
		Permissions.VIEW_ASSIGNED_TASKS,
		Permissions.VIEW_ASSIGNED_MILESTONES,
		Permissions.CREATE_COMMENT,
		Permissions.EDIT_OWN_COMMENT,
	],
	[Roles.TEAM_MEMBER]: [
		Permissions.VIEW_ASSIGNED_PROJECTS,
		Permissions.VIEW_ASSIGNED_TASKS,
		Permissions.VIEW_ALL_MILESTONES,
		Permissions.CREATE_COMMENT,
		Permissions.EDIT_OWN_COMMENT,
	],
};

export function hasPermission(userRole, permission) {
	if (!userRole || !permission) return false;
	return rolePermissions[userRole]?.includes(permission) ?? false;
}
