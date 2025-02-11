import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

/**
 * Authenticate user and return session
 */
export async function getSession() {
	const session = await getServerSession(authOptions);
	if (!session) {
		throw new Error("Not authenticated");
	}
	return session;
}

/**
 * Validate that a project exists
 */
export async function validateProject(projectId) {
	const project = await prisma.project.findUnique({ where: { id: projectId } });
	if (!project) {
		throw new Error("Project not found");
	}
	return project;
}

/**
 * Validate that a milestone exists
 */
export async function validateMilestone(milestoneId) {
	const milestone = await prisma.milestone.findUnique({
		where: { id: milestoneId },
	});
	if (!milestone) {
		throw new Error("Milestone not found");
	}
	return milestone;
}

/**
 * Check user permissions
 */
export function checkPermission(userRole, requiredPermission) {
	if (!hasPermission(userRole, requiredPermission)) {
		throw new Error("Not authorized");
	}
}

/**
 * Error handler for API routes
 */
export function errorHandler(fn) {
	return async (request, context) => {
		try {
			return await fn(request, context);
		} catch (error) {
			console.error("API Error:", error);
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
	};
}
