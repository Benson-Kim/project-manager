// app/api/projects/route.js
import { apiHandler, APIError, createResponse, getSession } from "@/lib/utils";
import prisma from "@/lib/prisma";
import { Permissions, SpecialPermissions } from "@/lib/permissions";
import { validateProjectData } from "@/lib/projectUtils";

// Helper to process query parameters
const parseQueryParams = (searchParams) => {
	const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
	const limit = Math.max(
		1,
		Math.min(100, parseInt(searchParams.get("limit") || "10"))
	);
	const search = searchParams.get("search")?.trim();
	const status = searchParams.get("status");
	const sortField = ["createdAt", "updatedAt", "name", "status"].includes(
		searchParams.get("sortField")
	)
		? searchParams.get("sortField")
		: "updatedAt";
	const sortOrder = ["asc", "desc"].includes(
		searchParams.get("sortOrder")?.toLowerCase()
	)
		? searchParams.get("sortOrder").toLowerCase()
		: "desc";

	return {
		skip: (page - 1) * limit,
		limit,
		page,
		search,
		status,
		sortField,
		sortOrder,
	};
};

export const GET = apiHandler(
	async (req) => {
		const { searchParams } = new URL(req.url);
		const { skip, limit, page, search, status, sortField, sortOrder } =
			parseQueryParams(searchParams);
		const { permissions, session } = req;

		// First check if user has general project read permission
		if (!permissions.can(Permissions.READ_PROJECT)) {
			throw new APIError("No permission to view projects", 403);
		}

		// Determine query conditions based on permissions
		const canViewAll = permissions.can(SpecialPermissions.VIEW_ALL_PROJECTS);
		let where = canViewAll
			? {}
			: {
					members: {
						some: {
							userId: session.user.id,
						},
					},
			  };

		// Add search conditions if search parameter exists
		if (search) {
			where = {
				...where,
				OR: [
					{ name: { contains: search, mode: "insensitive" } },
					{ description: { contains: search, mode: "insensitive" } },
				],
			};
		}

		// Add status filter if status parameter exists
		if (status) {
			where.status = status;
		}

		// Fetch projects and total count
		const [projects, total] = await Promise.all([
			prisma.project.findMany({
				where,
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
					tasks: permissions.can(Permissions.READ_TASK)
						? {
								select: {
									id: true,
									status: true,
								},
						  }
						: false,
					meetings: permissions.can(Permissions.READ_MEETING) ? true : false,
					_count: {
						select: {
							tasks: true,
							milestones: true,
							meetings: true,
						},
					},
				},
				skip,
				take: limit,
				orderBy: { [sortField]: sortOrder },
			}),
			prisma.project.count({ where }),
		]);

		// Sanitize the response based on permissions
		const sanitizedProjects = projects.map((project) => ({
			...project,
			meetings: project.meetings || [],
			tasks: project.tasks || [],
		}));

		return createResponse({
			data: sanitizedProjects,
			pagination: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			},
		});
	},
	// Define permission requirements
	Permissions.READ_PROJECT
);

export const POST = apiHandler(async (req, context) => {
	const { permissions } = req;
	const session = await getSession();

	// Check if user has permission to create projects
	if (!permissions.can(Permissions.CREATE_PROJECT)) {
		throw new APIError("No permission to create projects", 403);
	}

	// Parse and validate request body
	let projectData;
	try {
		projectData = await req.json();
	} catch (error) {
		throw new APIError("Invalid JSON in request body", 400);
	}

	// Validate project data
	validateProjectData(projectData);

	const {
		name,
		description,
		startDate,
		endDate,
		status,
		budget,
		members = [], // Optional array of member user IDs and their roles
	} = projectData;

	// Create project with members in a transaction
	try {
		const project = await prisma.$transaction(async (tx) => {
			// Create the project
			const newProject = await tx.project.create({
				data: {
					name,
					description,
					startDate: new Date(startDate),
					endDate: new Date(endDate),
					status,
					budget: budget ? parseFloat(budget) : null,
					createdById: session.user.id,
					// Add creator as a project member
					members: {
						create: {
							userId: session.user.id,
							role: session.user.role,
						},
					},
				},
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
				},
			});

			// Add additional members if provided
			if (members.length > 0) {
				await tx.projectMember.createMany({
					data: members.map((member) => ({
						projectId: newProject.id,
						userId: member.userId,
						role: member.role || "TEAM_MEMBER",
					})),
					skipDuplicates: true,
				});
			}

			// Fetch the complete project with all members
			return tx.project.findUnique({
				where: { id: newProject.id },
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
				},
			});
		});

		return createResponse(project, 201);
	} catch (error) {
		if (error.code === "P2002") {
			throw new APIError("A project with this name already exists", 400);
		}
		if (error.code === "P2003") {
			throw new APIError("One or more user IDs are invalid", 400);
		}
		throw error;
	}
}, Permissions.CREATE_PROJECT);
