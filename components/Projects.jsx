// components/Projects.jsx
import { format } from "date-fns";
import { toast } from "react-hot-toast";
import { useSession } from "next-auth/react";
import React, { useState, useEffect, useRef } from "react";
import ProjectModal from "./ProjectModal";
import { usePermissionGuardedCrud } from "@/hooks/usePermissionGuardedCrud";
import { usePermissions } from "@/hooks/usePermissions";
import {
	LayoutGrid,
	AlignJustify,
	Trash2,
	Edit,
	Plus,
	EllipsisVertical,
	Folder,
	Pencil,
	UserPlus,
	Copy,
	Share2,
} from "lucide-react";
import {
	Permissions,
	ResourceTypes,
	SpecialPermissions,
} from "@/lib/permissions";
import Link from "next/link";
import { getStatusColor } from "@/lib/formatting";
import MemberAvatars from "./MemberAvatars";
import ProjectEditModal from "./ProjectEditModal";

const SubMenuItem = ({ icon, label, onClick }) => (
	<li
		onClick={onClick}
		className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 cursor-pointer transition-all"
	>
		{icon}
		<span>{label}</span>
	</li>
);

const ProjectsList = ({ project, onEdit, onDelete }) => {
	const { id, name, endDate, status, members } = project;
	const [isSubmenuOpen, setSubMenuOpen] = useState(false);
	const menuRef = useRef();

	// Close submenu on outside click
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (menuRef.current && !menuRef.current.contains(event.target)) {
				setSubMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div className="grid grid-cols-[3.5fr_1fr_1fr_1.5fr_50px] items-center py-3 border-b hover:bg-gray-100 transition">
			{" "}
			{/* Project Info */}
			<div className="flex flex-row flex-1 items-center gap-8">
				<Folder className="w-6 h-6 text-yellow-500" />
				<Link
					href={`/projects/${id}`}
					className="text-base font-semibold hover:underline"
				>
					{name}
				</Link>
			</div>
			{/* Due date */}
			<p className="text-sm font-medium text-slate-500">
				{format(endDate, "MMM d, yyyy")}
			</p>
			{/* Status  */}
			<span
				className={`${getStatusColor(
					status
				)} text-white text-xs py-1 px-3 rounded-full capitalize hidden sm:block`}
			>
				{status.replace("_", " ")}
			</span>
			{/* Members */}
			<div className="hidden sm:block">
				<MemberAvatars members={members} maxVisible={5} />
			</div>
			{/* Ellipsis Dropdown */}
			<div className="relative" ref={menuRef}>
				<button
					onClick={() => setSubMenuOpen(!isSubmenuOpen)}
					className="p-1 rounded-full hover:bg-gray-200 transition"
				>
					<EllipsisVertical className="w-6 h-6 text-gray-600" />
				</button>
				{isSubmenuOpen && (
					<div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 animate-fadeIn">
						<ul className="text-sm text-gray-700">
							<SubMenuItem
								icon={<Pencil className="w-4 h-4" />}
								label="Edit"
								onClick={() => onEdit(project)}
							/>
							<SubMenuItem
								icon={<Trash2 className="w-4 h-4 text-red-500" />}
								label="Delete"
								onClick={() => onDelete(project)}
							/>
							<SubMenuItem
								icon={<UserPlus className="w-4 h-4" />}
								label="Add Members"
								onClick={() => console.log("Add Members", id)}
							/>
							<SubMenuItem
								icon={<Copy className="w-4 h-4" />}
								label="Duplicate"
								onClick={() => console.log("Duplicate", id)}
							/>
							<SubMenuItem
								icon={<Share2 className="w-4 h-4" />}
								label="Share with Client"
								onClick={() => console.log("Share", id)}
							/>
						</ul>
					</div>
				)}
			</div>
		</div>
	);
};

const ProjectsGrid = ({ project, onEdit, onDelete }) => {
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

			<MemberAvatars members={project.members} maxVisible={5} />

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
	const {
		data: response,
		isLoading,
		error,
		fetchAll,
	} = usePermissionGuardedCrud(ResourceTypes.PROJECT, "/api/projects", true);

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [selectedProject, setSelectedProject] = useState(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isGridView, setIsGridView] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const projects = response?.data || [];

	const selectedProjectCrud = usePermissionGuardedCrud(
		ResourceTypes.PROJECT,
		selectedProject ? `/api/projects/${selectedProject.id}` : null,
		false
	);

	const handleProjectUpdated = async () => {
		await fetchAll();
	};

	const handleEdit = (project) => {
		setSelectedProject(project);
		setIsEditModalOpen(true);
	};

	const handleEditSubmit = async (updatedProjectData) => {
		try {
			if (!selectedProject) {
				throw new Error("No project selected for editing");
			}

			await selectedProjectCrud.updateItem(
				selectedProject.id,
				updatedProjectData
			);

			await handleProjectUpdated();
			setIsEditModalOpen(false);
			toast.success("Project updated successfully");
		} catch (error) {
			console.error("Update Error:", error);
			toast.error(`Failed to update project: ${error.message}`);
		}
	};

	useEffect(() => {
		if (
			status === "authenticated" &&
			(can(Permissions.READ_PROJECT) ||
				can(SpecialPermissions.VIEW_ASSIGNED_PROJECTS))
		) {
			fetchAll();
		}
	}, [status, can]);

	const handleDelete = (project) => {
		setSelectedProject(project);
		setIsDeleteModalOpen(true);
	};

	const handleDeleteConfirm = async () => {
		setIsDeleting(true);
		try {
			await selectedProjectCrud.deleteItem(selectedProject.id);
			setIsDeleteModalOpen(false);
			await handleProjectUpdated();
			toast.success("Project deleted successfully");
		} catch (error) {
			console.log("Error deleting the project", error);
			toast.error(`Failed to delete project: ${error.message}`);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleCreateProject = async (formData) => {
		if (!can(Permissions.CREATE_PROJECT)) {
			toast.error("You don't have permission to create projects");
			return;
		}

		try {
			const response = await fetch("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to create project");
			}

			await fetchAll(); // Refresh project list
			setIsModalOpen(false);
			toast.success("Project created successfully");
		} catch (error) {
			console.error("Error creating project:", error);
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

	if (
		!can(Permissions.READ_PROJECT) &&
		!can(SpecialPermissions.VIEW_ASSIGNED_PROJECTS)
	) {
		return (
			<div className="flex justify-center items-center h-64">
				<p className="text-gray-600">
					You don't have permission to view projects
				</p>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			<div className="flex justify-between items-center">
				<div className="breadcrumbs text-sm">
					<ul className="flex gap-2">
						<li>
							<Link href="/dashboard" className="text-indigo-500">
								Home
							</Link>
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
					{can(Permissions.CREATE_PROJECT) && (
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
				{!isGridView && (
					<div className="grid grid-cols-[3.5fr_1fr_1fr_1.5fr_50px] items-center py-3 text-sm font-semibold border-b">
						<span>Project Name</span>
						<span>Due Date</span>
						<span>Status</span>
						<span>Members</span>
						<span></span>
					</div>
				)}
				{isGridView
					? projects.map((project) => (
							<ProjectsGrid
								key={project.id}
								project={project}
								onEdit={handleEdit}
								onDelete={handleDelete}
								canUpdate={can(Permissions.UPDATE_PROJECT)}
								canDelete={can(Permissions.DELETE_PROJECT)}
							/>
					  ))
					: projects.map((project) => (
							<ProjectsList
								key={project.id}
								project={project}
								onEdit={handleEdit}
								onDelete={handleDelete}
								canUpdate={can(Permissions.UPDATE_PROJECT)}
								canDelete={can(Permissions.DELETE_PROJECT)}
							/>
					  ))}
			</div>
			{isDeleteModalOpen && (
				<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
					<div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
						<h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
						<p>
							Are you sure you want to delete the project{" "}
							<strong>{selectedProject?.name}</strong>?
						</p>
						<div className="flex justify-end gap-4 mt-6">
							<button
								onClick={() => setIsDeleteModalOpen(false)}
								className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
							>
								Cancel
							</button>
							<button
								onClick={handleDeleteConfirm}
								disabled={isDeleting}
								className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
							>
								{isDeleting ? "Deleting..." : "Delete"}
							</button>
						</div>
					</div>
				</div>
			)}

			{isModalOpen && (
				<ProjectModal
					isOpen={isModalOpen}
					onClose={() => setIsModalOpen(false)}
					onSubmit={handleCreateProject}
				/>
			)}
			{isEditModalOpen && (
				<ProjectEditModal
					isOpen={isEditModalOpen}
					onClose={() => setIsEditModalOpen(false)}
					project={selectedProject}
					onSubmit={handleEditSubmit}
				/>
			)}
		</div>
	);
};

export default ProjectsPage;
