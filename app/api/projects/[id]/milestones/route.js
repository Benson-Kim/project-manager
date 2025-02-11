// app/api/milestones/route.js;

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession, checkPermission, errorHandler } from "@/lib/utils";

export const GET = errorHandler(async () => {
	const milestones = await prisma.milestone.findMany({
		include: {
			project: true,
			leader: true,
			assignee: true,
			tasks: true,
		},
	});
	return NextResponse.json(milestones, { status: 200 });
});

export const POST = errorHandler(async (req, { params }) => {
	const session = await getSession();
	checkPermission(session.user.role, "CREATE_MILESTONE");

	if (!req.body) {
		throw new Error("Request body is missing");
	}

	const bodyText = await req.text();
	if (!bodyText.trim()) {
		throw new Error("Empty request body");
	}

	const body = JSON.parse(bodyText);

	const {
		name,
		description,
		startDate,
		endDate,
		leaderId,
		assigneeId,
		budget,
		status,
	} = body;

	if (!name) throw new Error("Milestone name is required");

	const milestone = await prisma.milestone.create({
		data: {
			name,
			description,
			startDate: startDate ? new Date(startDate) : null,
			endDate: endDate ? new Date(endDate) : null,
			project: { connect: { id: params.id } },
			leader: leaderId ? { connect: { id: leaderId } } : undefined,
			assignee: assigneeId ? { connect: { id: assigneeId } } : undefined,
			budget,
			status,
		},
	});

	return NextResponse.json(milestone, { status: 201 });
});
