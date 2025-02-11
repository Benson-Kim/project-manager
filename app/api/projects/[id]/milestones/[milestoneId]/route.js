// api/projects/[projectId]/milestones/[milestoneId]/route.js;
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
	getSession,
	checkPermission,
	errorHandler,
	validateProject,
} from "@/lib/utils";

export const GET = errorHandler(async (req, { params }) => {
	const { milestoneId } = params;

	const milestone = await prisma.milestone.findUnique({
		where: { id: milestoneId },
		include: { project: true, leader: true, assignee: true, tasks: true },
	});

	if (!milestone) {
		throw new Error("Milestone not found");
	}

	return NextResponse.json(milestone, { status: 200 });
});

export const PUT = errorHandler(async (req, { params }) => {
	const session = await getSession();
	checkPermission(session.user.role, "UPDATE_MILESTONE");

	const { milestoneId } = params;
	const body = await req.json();

	const milestone = await prisma.milestone.update({
		where: { id: milestoneId },
		data: body,
	});

	return NextResponse.json(milestone, { status: 200 });
});

export const DELETE = errorHandler(async (req, { params }) => {
	const session = await getSession();
	checkPermission(session.user.role, "DELETE_MILESTONE");

	const { milestoneId } = params;

	await prisma.milestone.delete({ where: { id: milestoneId } });

	return NextResponse.json({ message: "Milestone deleted" }, { status: 200 });
});
