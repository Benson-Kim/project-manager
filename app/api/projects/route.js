// app/api/projects/route.js
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { hasPermission, Permissions } from "@/lib/permissions";

import { authOptions } from "@/lib/auth";
const prisma = new PrismaClient();

export async function GET() {
	try {
		const projects = await prisma.project.findMany({
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
				_count: {
					select: {
						tasks: true,
						milestones: true,
						meetings: true,
					},
				},
			},
			orderBy: {
				updatedAt: "desc",
			},
		});

		return NextResponse.json(projects);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to fetch projects" },
			{ status: 500 }
		);
	}
}

export async function POST(request) {
	try {
		const session = await getServerSession(authOptions);

		if (!session) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		if (!hasPermission(session.user.role, Permissions.CREATE_PROJECT)) {
			return NextResponse.json(
				{
					error: `Not authorized to create projects. `,
				},
				{ status: 403 }
			);
		}

		const body = await request.json();
		const project = await prisma.project.create({
			data: {
				name: body.name,
				description: body.description,
				startDate: new Date(body.startDate),
				endDate: new Date(body.endDate),
				status: body.status,
				budget: body.budget,
				createdById: session.user.id,
				members: {
					create: {
						userId: session.user.id,
						role: "PROJECT_MANAGER",
					},
				},
			},
			include: {
				members: {
					include: {
						user: true,
					},
				},
			},
		});
		return NextResponse.json(project, { status: 201 });
	} catch (error) {
		console.error("Project creation error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
