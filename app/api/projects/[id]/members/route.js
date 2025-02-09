// app/api/projects/[id]/members/route.js
export async function POST(request, { params }) {
	try {
		const body = await request.json();
		const member = await prisma.projectMember.create({
			data: {
				projectId: params.id,
				userId: body.userId,
				role: body.role,
				roleDescription: body.roleDescription,
			},
			include: {
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
					},
				},
			},
		});
		return NextResponse.json(member);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to add member" },
			{ status: 500 }
		);
	}
}
