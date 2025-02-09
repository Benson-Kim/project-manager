// app/api/projects/[id]/route.js

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { hasPermission, Permissions } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET(request, context) {
	try {
		const session = await getServerSession(authOptions);

		if (!session) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		const projectId = context.params.id;
		const userRole = session.user.role;

		// Check if user has permission to view all projects or just assigned ones
		const canViewAll = hasPermission(userRole, Permissions.VIEW_ALL_PROJECTS);
		const canViewAssigned = hasPermission(
			userRole,
			Permissions.VIEW_ASSIGNED_PROJECTS
		);

		if (!canViewAll && !canViewAssigned) {
			return NextResponse.json(
				{ error: "Not authorized to view projects" },
				{ status: 403 }
			);
		}

		const project = await prisma.project.findUnique({
			where: { id: projectId },
			include: {
				members: {
					include: {
						user: true,
					},
				},
				tasks: true,
				Meeting: true,
			},
		});

		if (!project) {
			return NextResponse.json({ error: "Project not found" }, { status: 404 });
		}

		// For users with VIEW_ASSIGNED_PROJECTS, verify they are a member
		if (!canViewAll && canViewAssigned) {
			const isMember = project.members.some(
				(member) => member.user.id === session.user.id
			);
			if (!isMember) {
				return NextResponse.json(
					{ error: "Not authorized to view this project" },
					{ status: 403 }
				);
			}
		}

		return NextResponse.json(project);
	} catch (error) {
		console.error("Error fetching project:", error);
		return NextResponse.json(
			{ error: "Failed to fetch project details" },
			{ status: 500 }
		);
	}
}

export async function PUT(request, context) {
	try {
		const session = await getServerSession(authOptions);

		if (!session) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		if (!hasPermission(session.user.role, Permissions.EDIT_PROJECT)) {
			return NextResponse.json(
				{ error: "Not authorized to edit projects" },
				{ status: 403 }
			);
		}

		const projectId = context.params.id;
		const data = await request.json();

		// Validate project exists and user has access
		const existingProject = await prisma.project.findUnique({
			where: { id: projectId },
			include: {
				members: {
					select: {
						userId: true,
					},
				},
			},
		});

		if (!existingProject) {
			return NextResponse.json({ error: "Project not found" }, { status: 404 });
		}

		const updatedProject = await prisma.project.update({
			where: { id: projectId },
			data: {
				name: data.name,
				description: data.description,
				status: data.status,
				startDate: data.startDate,
				endDate: data.endDate,
				// If updating members, handle it here
				...(data.members && {
					members: {
						deleteMany: {},
						create: data.members.map((memberId) => ({
							userId: memberId,
						})),
					},
				}),
			},
			include: {
				members: {
					include: {
						user: true,
					},
				},
				tasks: true,
				Meeting: true,
			},
		});

		return NextResponse.json(updatedProject);
	} catch (error) {
		console.error("Error updating project:", error);
		return NextResponse.json(
			{ error: "Failed to update project" },
			{ status: 500 }
		);
	}
}

export async function DELETE(request, context) {
	try {
		const session = await getServerSession(authOptions);

		if (!session) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		if (!hasPermission(session.user.role, Permissions.DELETE_PROJECT)) {
			return NextResponse.json(
				{ error: "Not authorized to delete projects" },
				{ status: 403 }
			);
		}

		const projectId = context.params.id;

		// Verify project exists before deletion
		const existingProject = await prisma.project.findUnique({
			where: { id: projectId },
		});

		if (!existingProject) {
			return NextResponse.json({ error: "Project not found" }, { status: 404 });
		}

		// Delete associated records first (if not handled by cascade)
		await prisma.$transaction([
			prisma.projectMember.deleteMany({
				where: { projectId },
			}),
			prisma.project.delete({
				where: { id: projectId },
			}),
		]);

		return NextResponse.json({ message: "Project deleted successfully" });
	} catch (error) {
		console.error("Project deletion error:", error);
		return NextResponse.json(
			{ error: "Failed to delete project" },
			{ status: 500 }
		);
	}
}
