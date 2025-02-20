import { useState, useEffect } from "react";
import { usePermissionGuardedCrud } from "@/hooks/usePermissionGuardedCrud";
import { ResourceTypes } from "@/lib/permissions";
import { toast } from "react-hot-toast";
import { Plus, Edit, Trash } from "lucide-react";

const Stakeholders = ({ projectId }) => {
	const url = `/api/projects/${projectId}/stakeholders`;
	const {
		data: stakeholders,
		isLoading,
		fetchAll,
		createItem,
		updateItem,
		deleteItem,
		permissions,
	} = usePermissionGuardedCrud(ResourceTypes.PROJECT, url);

	const [newStakeholder, setNewStakeholder] = useState({ name: "", role: "" });

	useEffect(() => {
		fetchAll();
	}, [fetchAll]);

	const handleCreate = async () => {
		if (!permissions.canCreate) {
			toast.error("You don’t have permission to create stakeholders.");
			return;
		}
		if (!newStakeholder.name || !newStakeholder.role) {
			toast.error("Name and role are required.");
			return;
		}
		try {
			await createItem(newStakeholder);
			setNewStakeholder({ name: "", role: "" });
			toast.success("Stakeholder created.");
		} catch (error) {
			toast.error("Failed to create stakeholder.");
		}
	};

	const handleUpdate = async (id, currentData) => {
		if (!permissions.canUpdate) {
			toast.error("You don’t have permission to update stakeholders.");
			return;
		}
		const updatedData = {
			...currentData,
			name: `${currentData.name} (Updated)`,
		};
		try {
			await updateItem(id, updatedData);
			toast.success("Stakeholder updated.");
		} catch (error) {
			toast.error("Failed to update stakeholder.");
		}
	};

	const handleDelete = async (id) => {
		if (!permissions.canDelete) {
			toast.error("You don’t have permission to delete stakeholders.");
			return;
		}
		try {
			await deleteItem(id);
			toast.success("Stakeholder deleted.");
		} catch (error) {
			toast.error("Failed to delete stakeholder.");
		}
	};

	if (isLoading) return <div>Loading...</div>;

	return (
		<div className="p-4">
			<h2 className="text-xl font-bold mb-4">Stakeholders</h2>

			{/* List Stakeholders */}
			{permissions.canRead ? (
				<ul className="space-y-2">
					{stakeholders.map((stakeholder) => (
						<li key={stakeholder.id} className="flex items-center space-x-2">
							<span>
								{stakeholder.name} - {stakeholder.role}
							</span>
							{permissions.canUpdate && (
								<button
									onClick={() => handleUpdate(stakeholder.id, stakeholder)}
									className="text-blue-500"
								>
									<Edit size={16} />
								</button>
							)}
							{permissions.canDelete && (
								<button
									onClick={() => handleDelete(stakeholder.id)}
									className="text-red-500"
								>
									<Trash size={16} />
								</button>
							)}
						</li>
					))}
				</ul>
			) : (
				<p>You don’t have permission to view stakeholders.</p>
			)}

			{/* Create Stakeholder */}
			{permissions.canCreate && (
				<div className="mt-4">
					<input
						type="text"
						value={newStakeholder.name}
						onChange={(e) =>
							setNewStakeholder({ ...newStakeholder, name: e.target.value })
						}
						placeholder="Name"
						className="border p-2 mr-2"
					/>
					<input
						type="text"
						value={newStakeholder.role}
						onChange={(e) =>
							setNewStakeholder({ ...newStakeholder, role: e.target.value })
						}
						placeholder="Role"
						className="border p-2 mr-2"
					/>
					<button
						onClick={handleCreate}
						className="bg-green-500 text-white p-2 rounded"
					>
						<Plus size={16} /> Add
					</button>
				</div>
			)}
		</div>
	);
};

export default Stakeholders;
