// app/api/projects/[projectId]/comments/route.js
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
	try {
		const { content, userId } = await request.json();

		// First, verify the user is a project member
		const projectMember = await prisma.projectMember.findFirst({
			where: {
				projectId: params.projectId,
				userId: userId,
			},
		});

		if (!projectMember) {
			return NextResponse.json(
				{ error: "User is not a member of this project" },
				{ status: 403 }
			);
		}

		// Create the comment
		const comment = await prisma.comment.create({
			data: {
				content,
				projectMemberId: projectMember.id,
			},
			include: {
				projectMember: {
					include: {
						user: {
							select: {
								firstName: true,
								lastName: true,
							},
						},
					},
				},
			},
		});

		return NextResponse.json(comment);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to create comment" },
			{ status: 500 }
		);
	}
}
