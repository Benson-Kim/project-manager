import { useState, useEffect } from "react";
import { usePermissionGuardedCrud } from "@/hooks/usePermissionGuardedCrud";
import { ResourceTypes } from "@/lib/newpermissions";
import { toast } from "react-hot-toast";
import { Plus, Edit, Trash } from "lucide-react";

const Acronyms = ({ projectId }) => {
	const url = `/api/projects/${projectId}/acronyms`;
	const {
		data: acronyms,
		isLoading,
		fetchAll,
		createItem,
		updateItem,
		deleteItem,
		permissions,
	} = usePermissionGuardedCrud(ResourceTypes.PROJECT, url);

	const [newAcronym, setNewAcronym] = useState({ acronym: "", definition: "" });

	useEffect(() => {
		fetchAll();
	}, [fetchAll]);

	const handleCreate = async () => {
		if (!permissions.canCreate) {
			toast.error("You don’t have permission to create acronyms.");
			return;
		}
		if (!newAcronym.acronym || !newAcronym.definition) {
			toast.error("Acronym and definition are required.");
			return;
		}
		try {
			await createItem(newAcronym);
			setNewAcronym({ acronym: "", definition: "" });
			toast.success("Acronym created.");
		} catch (error) {
			toast.error("Failed to create acronym.");
		}
	};

	// Similar handleUpdate and handleDelete functions as Stakeholders

	if (isLoading) return <div>Loading...</div>;

	return (
		<div className="p-4">
			<h2 className="text-xl font-bold mb-4">Acronyms</h2>
			{permissions.canRead ? (
				<ul className="space-y-2">
					{acronyms.map((item) => (
						<li key={item.id} className="flex items-center space-x-2">
							<span>
								{item.acronym} - {item.definition}
							</span>
							{/* Edit/Delete buttons */}
						</li>
					))}
				</ul>
			) : (
				<p>You don’t have permission to view acronyms.</p>
			)}
			{permissions.canCreate && (
				<div className="mt-4">
					<input
						type="text"
						value={newAcronym.acronym}
						onChange={(e) =>
							setNewAcronym({ ...newAcronym, acronym: e.target.value })
						}
						placeholder="Acronym"
						className="border p-2 mr-2"
					/>
					<input
						type="text"
						value={newAcronym.definition}
						onChange={(e) =>
							setNewAcronym({ ...newAcronym, definition: e.target.value })
						}
						placeholder="Definition"
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

export default Acronyms;
