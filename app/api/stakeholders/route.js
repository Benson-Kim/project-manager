// app/api/stakeholders/route.js
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { hasPermission, Permissions } from "@/lib/permissions";

const prisma = new PrismaClient();

async function checkAuthorization(request) {
	const session = await getServerSession(authOptions);

	if (!session) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	// Only admins and project managers can manage stakeholders
	if (!hasPermission(session.user.role, Permissions.MANAGE_USERS)) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	return session;
}

export async function GET(request) {
	const authResult = await checkAuthorization(request);
	if (authResult.status === 401 || authResult.status === 403) {
		return authResult;
	}

	try {
		const { searchParams } = new URL(request.url);

		const page = parseInt(searchParams.get("page")) || 1;
		const limit = parseInt(searchParams.get("limit")) || 10;
		const search = searchParams.get("search") || "";
		const sortBy = searchParams.get("sortBy") || "lastName";
		const sortOrder = searchParams.get("sortOrder") || "asc";

		const skip = (page - 1) * limit;

		const whereClause = {
			role: "STAKEHOLDER",
			OR: search
				? [
						{ firstName: { contains: search, mode: "insensitive" } },
						{ lastName: { contains: search, mode: "insensitive" } },
						{ email: { contains: search, mode: "insensitive" } },
						{
							departmentOrOrganization: {
								contains: search,
								mode: "insensitive",
							},
						},
				  ]
				: undefined,
		};

		const stakeholders = await prisma.user.findMany({
			where: whereClause,
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				departmentOrOrganization: true,
				phoneNumber: true,
				phoneExt: true,
				mobile: true,
				physicalLocation: true,
				orgTitle: true,
				communicationPreference: true,
				engagementLevel: true,
				createdAt: true,
				_count: {
					select: {
						memberships: true,
						assignments: true,
					},
				},
			},
			orderBy: {
				[sortBy]: sortOrder,
			},
			skip,
			take: limit,
		});

		const totalCount = await prisma.user.count({
			where: whereClause,
		});

		return NextResponse.json({
			stakeholders,
			totalPages: Math.ceil(totalCount / limit),
			currentPage: page,
			totalCount,
		});
	} catch (error) {
		console.error("Error fetching stakeholders:", error);
		return NextResponse.json(
			{ message: "Error fetching stakeholders", error: error.message },
			{ status: 500 }
		);
	}
}

export async function POST(request) {
	const authResult = await checkAuthorization(request);
	if (authResult.status === 401 || authResult.status === 403) {
		return authResult;
	}
	try {
		const body = await request.json();

		const existingUser = await prisma.user.findUnique({
			where: { email: body.email },
		});

		if (existingUser) {
			return NextResponse.json(
				{ message: "User already exists", userExists: true },
				{ status: 400 }
			);
		}

		const newUser = await prisma.user.create({
			data: {
				...body,
				role: "STAKEHOLDER",
			},
		});

		return NextResponse.json(
			{ message: "Stakeholder invited successfully", user: newUser },
			{ status: 201 }
		);
	} catch (error) {
		console.error("Error inviting stakeholder:", error);
		return NextResponse.json(
			{ message: "Error inviting stakeholder", error: error.message },
			{ status: 500 }
		);
	}
}

export async function PUT(request) {
	const authResult = await checkAuthorization(request);
	if (authResult.status === 401 || authResult.status === 403) {
		return authResult;
	}
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");
		const body = await request.json();

		if (!id) {
			return NextResponse.json(
				{ message: "Missing stakeholder ID" },
				{ status: 400 }
			);
		}

		const updatedUser = await prisma.user.update({
			where: { id },
			data: body,
		});

		return NextResponse.json({
			message: "Stakeholder updated successfully",
			user: updatedUser,
		});
	} catch (error) {
		console.error("Error updating stakeholder:", error);
		return NextResponse.json(
			{ message: "Error updating stakeholder", error: error.message },
			{ status: 500 }
		);
	}
}

export async function DELETE(request) {
	const authResult = await checkAuthorization(request);
	if (authResult.status === 401 || authResult.status === 403) {
		return authResult;
	}
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");

		if (!id) {
			return NextResponse.json(
				{ message: "Missing stakeholder ID" },
				{ status: 400 }
			);
		}

		await prisma.user.delete({
			where: { id },
		});

		return NextResponse.json({
			message: "Stakeholder deleted successfully",
		});
	} catch (error) {
		console.error("Error deleting stakeholder:", error);
		return NextResponse.json(
			{ message: "Error deleting stakeholder", error: error.message },
			{ status: 500 }
		);
	}
}
