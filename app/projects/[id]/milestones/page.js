"use client";
import { useCrud } from "@/hooks/useCrud";
import { useEffect, useState } from "react";
import {
	AlignJustify,
	LayoutGrid,
	Pencil,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { statusColors } from "@/lib/formatting";
import Modal from "@/components/Modal";
import { Permissions } from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";

const Milestones = () => {
	const params = useParams();
	const {
		data: milestones,
		isLoading,
		fetchAll,
		createItem,
		updateItem,
		deleteItem,
	} = useCrud(`/api/projects/${params.id}/milestones`);

	const [isGridView, setIsGridView] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingMilestone, setEditingMilestone] = useState(null);
	const { can } = usePermissions();

	useEffect(() => {
		fetchAll();
	}, [params.id]);

	const handleCreate = (milestoneData) => {
		createItem(milestoneData);
		setIsModalOpen(false);
	};

	const handleUpdate = (id, updatedData) => {
		updateItem(id, updatedData);
		setIsModalOpen(false);
		setEditingMilestone(null);
	};

	const handleDelete = (id) => {
		if (confirm("Are you sure you want to delete this milestone?")) {
			deleteItem(id);
		}
	};

	return (
		<div>
			{/* View Toggle */}
			<div className="flex justify-between p-4">
				<button onClick={() => setIsGridView(!isGridView)}>
					{isGridView ? <AlignJustify /> : <LayoutGrid />}
				</button>

				{can(
					Permissions.CREATE_MILESTONE && (
						<button onClick={() => setIsModalOpen(true)}>
							<Plus /> Add Milestone
						</button>
					)
				)}
			</div>

			{/* Display Milestones */}
			{isLoading ? (
				<p>Loading...</p>
			) : (
				<div>
					{milestones.map((milestone) => (
						<MilestoneItem
							can={can}
							key={milestone.id}
							item={milestone}
							onEdit={() => {
								setEditingMilestone(milestone);
								setIsModalOpen(true);
							}}
							onDelete={handleDelete}
						/>
					))}
				</div>
			)}

			{/* Modal for Creating & Editing */}
			{isModalOpen && (
				<Modal
					isOpen={isModalOpen}
					onClose={() => setIsModalOpen(false)}
					title="Add Milestone"
				>
					<MilestoneForm
						milestone={editingMilestone}
						onSave={editingMilestone ? handleUpdate : handleCreate}
					/>
				</Modal>
			)}
		</div>
	);
};

export default Milestones;

const MilestoneItem = ({ can, item, onEdit, onDelete }) => {
	const { id, name, startDate, endDate, status } = item;

	return (
		<div className="flex justify-between p-2 border-b">
			<div>
				<h3 className="font-semibold">{name}</h3>
				{startDate && (
					<p>Start: {format(new Date(startDate), "MMM d, yyyy")}</p>
				)}
				{endDate && <p>Due: {format(new Date(endDate), "MMM d, yyyy")}</p>}
				{status && (
					<span className={`${statusColors[status]} p-1 rounded`}>
						{status}
					</span>
				)}
			</div>
			<div>
				{can(
					Permissions.EDIT_MILESTONE && (
						<button onClick={onEdit}>
							<Pencil /> Edit
						</button>
					)
				)}
				{can(
					Permissions.DELETE_MILESTONE && (
						<button onClick={() => onDelete(id)}>
							<Trash2 /> Delete
						</button>
					)
				)}
			</div>
		</div>
	);
};

const MilestoneForm = ({ milestone, onSave }) => {
	const [name, setName] = useState(milestone?.name || "");

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(milestone?.id, { name });
	};

	return (
		<form onSubmit={handleSubmit} className="p-4">
			<input
				type="text"
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="Milestone Name"
				className="border p-2 w-full"
			/>
			<button type="submit">Save</button>
		</form>
	);
};
