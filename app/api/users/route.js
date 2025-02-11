// app/api/users/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET() {
	try {
		const session = await getServerSession(authOptions);

		if (!session) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}

		// Fetch users who aren't already project members
		const users = await prisma.user.findMany({
			where: {
				NOT: {
					role: "ADMIN", // Exclude admin users from the list
				},
			},
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				departmentOrOrganization: true,
				role: true,
			},
		});

		return NextResponse.json(users);
	} catch (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
