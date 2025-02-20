// components/ProjectActions.jsx
import { useState } from "react";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import ProjectEditModal from "./ProjectEditModal";
import { useCrud } from "../hooks/useCrud";
import { toast } from "react-hot-toast";
import DeleteConfirmationModal from "./DeleteConfirmationModal";

export default function ProjectActions({
	project,
	onProjectUpdated,
	permissions,
}) {
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const params = useParams();
	const router = useRouter();

	// Initialize CRUD operations for this specific project
	const { updateItem, deleteItem } = useCrud(
		`/api/projects/${params.id}`,
		false
	);

	const handleEdit = () => {
		setIsEditModalOpen(true);
	};

	const handleDelete = () => {
		setIsDeleteModalOpen(true);
	};

	const handleEditSubmit = async (updatedProjectData) => {
		try {
			await updateItem(project.id, updatedProjectData);
			if (onProjectUpdated) {
				await onProjectUpdated(); // Refresh parent data
			}
			setIsEditModalOpen(false);
			toast.success("Project updated successfully");
		} catch (error) {
			console.error("Update Error:", error);
			toast.error(`Failed to update project: ${error.message}`);
		}
	};

	const handleDeleteConfirm = async () => {
		setIsDeleting(true);
		try {
			await deleteItem(project.id);
			setIsDeleteModalOpen(false);
			toast.success("Project deleted successfully");

			// Navigate back to projects list
			router.push("/dashboard/projects");
		} catch (error) {
			toast.error(`Failed to delete project: ${error.message}`);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<>
			<div className="flex items-center justify-between space-x-4">
				{permissions.can("EDIT_PROJECT") && (
					<button
						onClick={handleEdit}
						data-tip="Edit"
						className="tooltip flex items-center p-3 rounded bg-slate-200 hover:bg-slate-400 text-slate-700 hover:text-slate-50"
					>
						<Pencil size={16} />
					</button>
				)}

				{permissions.can("DELETE_PROJECT") && (
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
