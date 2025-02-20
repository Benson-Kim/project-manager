// components/ProjectActions.jsx
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import ProjectEditModal from "./ProjectEditModal";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import { usePermissionGuardedCrud } from "@/hooks/usePermissionGuardedCrud";
import { Permissions, ResourceTypes } from "@/lib/permissions";
import { toast } from "react-hot-toast";

export default function ProjectActions({ project, onProjectUpdated }) {
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const params = useParams();
	const router = useRouter();

	const { updateItem, deleteItem, permissions } = usePermissionGuardedCrud(
		ResourceTypes.PROJECT,
		`/api/projects/${params.id}`
	);

	const handleEdit = () => setIsEditModalOpen(true);
	const handleDelete = () => setIsDeleteModalOpen(true);

	const handleEditSubmit = async (updatedProjectData) => {
		if (!permissions.canUpdate) {
			toast.error("You don't have permission to edit this project");
			return;
		}
		try {
			await updateItem(project.id, updatedProjectData);
			await onProjectUpdated(); // Refresh parent data
			setIsEditModalOpen(false);
			toast.success("Project updated successfully");
		} catch (error) {
			toast.error("Failed to update project");
		}
	};

	const handleDeleteConfirm = async () => {
		if (!permissions.canDelete) {
			toast.error("You don't have permission to delete this project");
			return;
		}
		setIsDeleting(true);
		try {
			await deleteItem(project.id);
			setIsDeleteModalOpen(false);
			toast.success("Project deleted successfully");
			router.push("/dashboard/projects");
		} catch (error) {
			toast.error("Failed to delete project");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<>
			<div className="flex items-center space-x-4">
				{permissions.canUpdate && (
					<button
						onClick={handleEdit}
						data-tip="Edit"
						className="tooltip flex items-center p-3 rounded bg-slate-200 hover:bg-slate-400 text-slate-700 hover:text-slate-50"
					>
						<Pencil size={16} />
					</button>
				)}
				{permissions.canDelete && (
					<button
						onClick={handleDelete}
						data-tip="Delete"
						className="tooltip flex items-center p-3 rounded bg-slate-200 hover:bg-red-400 text-slate-700 hover:text-slate-50"
					>
						<Trash2 size={16} />
					</button>
				)}
			</div>

			{isEditModalOpen && (
				<ProjectEditModal
					project={project}
					isOpen={isEditModalOpen}
					onClose={() => setIsEditModalOpen(false)}
					onSubmit={handleEditSubmit}
				/>
			)}

			{isDeleteModalOpen && (
				<DeleteConfirmationModal
					title="Delete Project"
					message={`Are you sure you want to delete "${project.name}"? This action cannot be undone and will remove all associated data including tasks, milestones, and meetings.`}
					isOpen={isDeleteModalOpen}
					isProcessing={isDeleting}
					onClose={() => setIsDeleteModalOpen(false)}
					onConfirm={handleDeleteConfirm}
				/>
			)}
		</>
	);
}
