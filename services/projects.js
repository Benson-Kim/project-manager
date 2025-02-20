// services/project.js
import prisma from "@/lib/prisma";

export const ProjectService = {
	async getProject(id) {
		return await prisma.project.findUnique({
			where: { id },
			include: {
				tasks: true,
				members: {
					include: { user: true },
				},
				resources: true,
				Meeting: true,
			},
		});
	},

	async getTasks(projectId) {
		return await prisma.task.findMany({
			where: { projectId },
			include: {
				assignee: true,
				resources: true,
				children: true,
			},
		});
	},

	async getMeetings(projectId) {
		return await prisma.meeting.findMany({
			where: { projectId },
			include: {
				attendees: {
					include: { user: true },
				},
				decisions: true,
				actionItems: true,
			},
		});
	},

	async getResources(projectId) {
		return await prisma.resource.findMany({
			where: { projectId },
		});
	},

	async getMembers(projectId) {
		return await prisma.projectMember.findMany({
			where: { projectId },
			include: { user: true },
		});
	},
};
