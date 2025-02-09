// app/api/stakeholders/check-email/route.js
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function POST(request) {
	try {
		const { email } = await request.json();

		if (!email) {
			return NextResponse.json(
				{ message: "Email is required" },
				{ status: 400 }
			);
		}

		const existingUser = await prisma.user.findUnique({
			where: { email },
		});

		return NextResponse.json({
			exists: !!existingUser,
			message: existingUser ? "Email already exists" : "Email is available",
		});
	} catch (error) {
		console.error("Error checking email:", error);
		return NextResponse.json(
			{ message: "Error checking email", error: error.message },
			{ status: 500 }
		);
	}
}
