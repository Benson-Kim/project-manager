// app/api/auth/reset-password/route.js
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendEmail } from "@/lib/mail"; // You'll need to implement this

const prisma = new PrismaClient();

export async function POST(request) {
	try {
		const { email } = await request.json();
		const user = await prisma.user.findUnique({ where: { email } });

		if (!user) {
			return NextResponse.json({ message: "User not found" }, { status: 404 });
		}

		const resetToken = crypto.randomBytes(32).toString("hex");
		const hashedToken = await bcrypt.hash(resetToken, 10);

		await prisma.user.update({
			where: { email },
			data: {
				resetToken: hashedToken,
				resetTokenExpiry: new Date(Date.now() + 3600000), // 1 hour
			},
		});

		const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password/${resetToken}`;

		await sendEmail({
			to: email,
			subject: "Password Reset Request",
			text: `Click here to reset your password: ${resetUrl}`,
		});

		return NextResponse.json(
			{ message: "Reset link sent to email" },
			{ status: 200 }
		);
	} catch (error) {
		return NextResponse.json(
			{ message: "Internal server error" },
			{ status: 500 }
		);
	}
}
