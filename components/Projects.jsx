//components/Projects.jsx

import { format } from "date-fns";
import { toast } from "react-hot-toast";
import { useSession } from "next-auth/react";
import React, { useState, useEffect } from "react";

import ProjectModal from "./ProjectModal";
import { usePermissions } from "@/hooks/usePermissions";
import {
	LayoutGrid,
	AlignJustify,
	Trash2,
	Edit,
	Plus,
	EllipsisVertical,
	Folder,
} from "lucide-react";
import { Permissions } from "@/lib/permissions";
import Link from "next/link";

const getStatusColor = (status) => {
	const colors = {
		PLANNING: "bg-blue-500",
		IN_PROGRESS: "bg-yellow-500",
		ON_HOLD: "bg-orange-500",
		COMPLETED: "bg-green-500",
	};
	return colors[status] || "bg-gray-500";
};

const getInitialBackgroundColor = (initial) => {
	const colors = [
		"bg-pink-500",
		"bg-purple-500",
		"bg-indigo-500",
		"bg-blue-500",
		"bg-green-500",
		"bg-yellow-500",
		"bg-red-500",
		"bg-teal-500",
	];
	return colors[initial.charCodeAt(0) % colors.length];
};

const getInitials = (name) => {
	return name
		? name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
		: "?";
};

const ProjectsList = ({ project }) => {
	const { id, name, endDate, status, members, tasks, Meeting } = project;

	return (
		<div className="flex flex-row items-center justify-between sm:text-sm sm:my-0 p-2 sm:px-4 sm:py-3 sm:border-b border-y-slate-400 first:sm:border-t sm:hover:bg-slate-200 sm:hover:bg-opacity-75 transition-all ease-in-out duration-200 cursor-pointer">
			<div className="flex flex-row flex-1 items-center gap-12">
				<button className="">
					<Folder />
				</button>
				<div className="flex-1 flex flex-col gap-2 sm:items-center sm:flex-row sm:gap-4  md:gap-6">
					<Link
						href={`/projects/${id}`}
						className="text-lg font-semibold cursor-pointer"
					>
						{name}
					</Link>
					<p className="text-sm ">
						Due{" "}
						<span className="text-slate-500">
							{format(endDate, "MMM d, yyyy")}
						</span>
					</p>
				</div>
				<div className="hidden sm:flex">
					<span
						className={`${getStatusColor(
							status
						)} text-white text-xs py-2 px-3 rounded-full`}
					>
						{status.replace("_", " ")}
					</span>
					<div className="flex items-center -space-x-3">
						{members.slice(0, 5).map((member, index) => (
							<div
								key={member.user.id}
								className={`relative w-8 h-8 flex items-center justify-center rounded-full border-2 border-white shadow ${
									member.user.avatar
										? "bg-cover bg-center"
										: getInitialBackgroundColor(member.user.firstName[0])
								}`}
								style={{
									backgroundImage: member.user.avatar
										? `url(${member.user.avatar})`
										: "none",
									zIndex: members.length - index,
								}}
							>
								{!member.user.avatar && (
									<span className="text-white font-bold text-xs">
										{getInitials(member.user.firstName)}
									</span>
								)}
							</div>
						))}
						{members.length > 5 && (
							<span className="w-8 h-8 flex items-center justify-center bg-gray-200 text-gray-600 text-xs font-semibold rounded-full border-2 border-white">
								+{members.length - 5}
							</span>
						)}
					</div>
				</div>
			</div>
			<div className="">
				<EllipsisVertical />
			</div>
		</div>
	);
};

const ProjectsGrid = ({ project, onEdit, onDelete }) => {
	const displayMembers = project.members.slice(0, 5);
	const additionalMembers = project.members.length - 5;

	return (
		<div className="bg-white rounded-lg shadow p-6 space-y-4 relative group cursor-pointer">
			<div className="absolute right-2 top-2 hidden group-hover:flex gap-2">
				<button
					onClick={(e) => {
						e.stopPropagation();
						onEdit(project);
					}}
					className="p-1 hover:bg-gray-100 rounded"
				>
					<Edit className="w-4 h-4 text-gray-500" />
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onDelete(project.id);
					}}
					className="p-1 hover:bg-gray-100 rounded"
				>
					<Trash2 className="w-4 h-4 text-red-500" />
				</button>
			</div>

			<div className="flex justify-between items-start">
				<Link
					href={`/projects/${project.id}`}
					className="text-lg font-semibold cursor-pointer"
				>
					{project.name}
				</Link>
				<span
					className={`${getStatusColor(
						project.status
					)} text-white text-sm px-3 py-1 rounded-full`}
				>
					{project.status.replace("_", " ")}
				</span>
			</div>

			<div className="text-sm text-gray-600">
				Due: {format(new Date(project.endDate), "MMM d, yyyy")}
			</div>

			<div className="flex items-center">
				<div className="flex -space-x-2">
					{displayMembers.map((member, index) => (
						<div
							key={member.user.id}
							className={`${getInitialBackgroundColor(
								member.user.firstName[0]
							)} 
                                w-8 h-8 rounded-full flex items-center justify-center 
                                text-white text-sm font-medium border-2 border-white
                                transition-transform hover:scale-110`}
							style={{ zIndex: displayMembers.length - index }}
							title={`${member.user.firstName} ${
								member.user.lastName
							} (${member.role.replace("_", " ").toLowerCase()})`}
						>
							{member.user.firstName[0]}
						</div>
					))}
					{additionalMembers > 0 && (
						<div
							className="w-8 h-8 rounded-full flex items-center justify-center 
                            bg-gray-200 text-gray-600 text-sm border-2 border-white"
							title={`${additionalMembers} more members`}
						>
							+{additionalMembers}
						</div>
					)}
				</div>
			</div>

			<div className="flex justify-between text-sm text-gray-600">
				<span>{project._count.tasks} tasks</span>
				<span>
					{project.tasks.filter((t) => t.status === "COMPLETED").length}{" "}
					completed
				</span>
			</div>
		</div>
	);
};

const ProjectsPage = () => {
	const { data: session, status } = useSession();
	const { can } = usePermissions();
	const [projects, setProjects] = useState([]);

	const [isGridView, setIsGridView] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (session) {
			fetchProjects();
		}
	}, [session]);

	const fetchProjects = async () => {
		try {
			const response = await fetch("/api/projects");
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			setProjects(data);
			setIsLoading(false);
		} catch (error) {
			console.error("Failed to fetch projects:", error);
			setIsLoading(false);
		}
	};

	const handleDelete = async (projectId) => {
		if (!can(Permissions.DELETE_PROJECT)) {
			toast.error("You don't have permission to delete projects");
			return;
		}
		if (window.confirm("Are you sure you want to delete this project?")) {
			try {
				const response = await fetch(`/api/projects/${projectId}`, {
					method: "DELETE",
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				toast.success("Project deleted successfully");
				fetchProjects();
			} catch (error) {
				console.error("Failed to delete project:", error);
				toast.error("Failed to delete project");
			}
		}
	};

	const handleCreateProject = async (formData) => {
		if (!can(Permissions.CREATE_PROJECT)) {
			toast.error("You don't have permission to create projects");
			return;
		}

		try {
			setError(null);
			const response = await fetch("/api/projects", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(formData),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to create project");
			}

			const newProject = await response.json();
			setProjects((prev) => [newProject, ...prev]);
			setIsModalOpen(false);
			toast.success("Project created successfully");
		} catch (error) {
			console.error("Error creating project:", error);
			setError(error.message);
			toast.error(error.message);
		}
	};

	if (status === "loading" || isLoading) {
		return (
			<div className="flex justify-center items-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex justify-center items-center h-64">
				<p className="text-gray-600">Please sign in to view projects</p>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			<div className="flex justify-between items-center">
				<div className="breadcrumbs text-sm">
					<ul className="flex gap-2">
						<li>
							<a href="/dashboard" className="text-indigo-500">
								Home
							</a>
						</li>
						<li className="text-slate-700 font-medium">Projects</li>
					</ul>
				</div>
				<div className="flex gap-4">
					<div className="flex items-center border rounded-lg overflow-hidden">
						<button
							onClick={() => setIsGridView(true)}
							data-tip="Grid View"
							className={`p-2 tooltip ${
								isGridView ? "bg-indigo-50 text-indigo-600" : "hover:bg-gray-50"
							}`}
						>
							<LayoutGrid className="w-5 h-5" />
						</button>
						<button
							onClick={() => setIsGridView(false)}
							data-tip="List View"
							className={`p-2 tooltip ${
								!isGridView
									? "bg-indigo-50 text-indigo-600"
									: "hover:bg-gray-50"
							}`}
						>
							<AlignJustify className="w-5 h-5" />
						</button>
					</div>
					{can("CREATE_PROJECT") && (
						<button
							onClick={() => setIsModalOpen(true)}
							data-tip="Create Project"
							className="tooltip flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
						>
							<Plus className="w-5 h-5" />
							New Project
						</button>
					)}
				</div>
			</div>

			<div
				className={`${
					isGridView
						? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
						: "flex flex-col space-y-4 sm:space-y-0"
				}`}
			>
				{isGridView
					? projects.map((project) => (
							<ProjectsGrid
								key={project.id}
								project={project}
								onEdit={(project) => console.log("Edit project:", project)}
								onDelete={handleDelete}
							/>
					  ))
					: projects.map((project) => (
							<ProjectsList
								key={project.id}
								project={project}
								onEdit={(project) => console.log("Edit project:", project)}
								onDelete={handleDelete}
							/>
					  ))}
			</div>
			<ProjectModal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				onSubmit={handleCreateProject}
			/>
		</div>
	);
};

export default ProjectsPage;
