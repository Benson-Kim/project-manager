// lib/utils.js

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
	hasPermission,
	checkContextualPermission,
	hasPermissions,
	hasAnyPermission,
} from "@/lib/permissions";

export class APIError extends Error {
	constructor(message, statusCode = 400, details = null) {
		super(message);
		this.statusCode = statusCode;
		this.details = details;
		this.name = "APIError";
	}
}

/**
 * Create a standardized API response
 */
export const createResponse = (data, status = 200) => {
	return NextResponse.json(data, { status });
};

/**
 * Create a standardized error response
 */
export const createErrorResponse = (error) => {
	const statusCode = error.statusCode || 500;
	const message = error.message || "Internal Server Error";
	const details = error.details || null;

	const response = {
		error: {
			message,
			...(details && { details }),
			...(process.env.NODE_ENV === "development" && { stack: error.stack }),
		},
	};

	return NextResponse.json(response, { status: statusCode });
};

/**
 * Get and validate user session
 */
export async function getSession() {
	const session = await getServerSession(authOptions);
	if (!session) {
		throw new APIError("Not authenticated", 401);
	}
	return session;
}

/**
 * Enhanced API handler with permissions support
 */
export const apiHandler = (handler, permissionConfig = null) => {
	return async (req, context) => {
		try {
			// Get session and user role
			const session = await getSession();
			req.session = session;
			const userRole = session.user.role;

			// Create permissions helper object
			const permissionsHelper = {
				userRole,
				can: (permission) => hasPermission(userRole, permission),
				canAll: (permissions) => hasPermissions(userRole, permissions),
				canAny: (permissions) => hasAnyPermission(userRole, permissions),
				canWithContext: (permission, contextData) =>
					checkContextualPermission(userRole, permission, contextData),
			};

			// Handle permission requirements if specified
			if (permissionConfig) {
				// Handle single permission
				if (typeof permissionConfig === "string") {
					if (!permissionsHelper.can(permissionConfig)) {
						throw new APIError("Forbidden", 403);
					}
				}
				// Handle multiple permissions (array)
				else if (Array.isArray(permissionConfig)) {
					if (!permissionsHelper.canAll(permissionConfig)) {
						throw new APIError("Forbidden", 403);
					}
				}
				// Handle contextual permissions
				else if (typeof permissionConfig === "object") {
					const { permission, getContext } = permissionConfig;
					const contextData = await getContext(
						req,
						session,
						context,
						permissionsHelper
					);

					if (!permissionsHelper.canWithContext(permission, contextData)) {
						throw new APIError("Forbidden", 403);
					}
				}
			}

			// Handle async params if they exist
			if (context.params && context.params instanceof Promise) {
				context.params = await context.params;
			}

			// Validate required params
			if (context.params && !Object.values(context.params).every(Boolean)) {
				throw new APIError("Missing required parameters", 400);
			}

			// Add permissions helper to the request object
			req.permissions = permissionsHelper;

			const response = await handler(req, context);

			// If the handler returns null or undefined, throw a 404
			if (response === null || response === undefined) {
				throw new APIError("Resource not found", 404);
			}

			return response;
		} catch (error) {
			console.error("API Error:", {
				path: req.url,
				method: req.method,
				error: error.message,
				stack: error.stack,
			});

			// Handle different types of errors
			if (error instanceof APIError) {
				return createErrorResponse(error);
			}

			// Handle Prisma errors
			if (error.code && error.code.startsWith("P")) {
				return createErrorResponse(
					new APIError(
						"Database operation failed",
						500,
						process.env.NODE_ENV === "development" ? error.message : undefined
					)
				);
			}

			// Handle all other errors
			return createErrorResponse(
				new APIError(
					"Internal Server Error",
					500,
					process.env.NODE_ENV === "development" ? error.message : undefined
				)
			);
		}
	};
};

// Enhanced validateRequest helper with permissions
export const validateRequest = async ({
	session = true,
	projectId = null,
	milestoneId = null,
	permission = null,
	permissions = null,
	contextualPermission = null,
}) => {
	const results = {};

	if (session) {
		results.session = await getSession();
	}

	if (projectId) {
		results.project = await validateProject(projectId);
	}

	if (milestoneId) {
		results.milestone = await validateMilestone(milestoneId);
	}

	if (results.session) {
		const userRole = results.session.user.role;

		// Check single permission
		if (permission) {
			if (!hasPermission(userRole, permission)) {
				throw new APIError("Forbidden", 403);
			}
		}

		// Check multiple permissions
		if (permissions) {
			if (!hasPermissions(userRole, permissions)) {
				throw new APIError("Forbidden", 403);
			}
		}

		// Check contextual permission
		if (contextualPermission) {
			const { permission: perm, context: ctx } = contextualPermission;
			if (!checkContextualPermission(userRole, perm, ctx)) {
				throw new APIError("Forbidden", 403);
			}
		}
	}

	return results;
};
