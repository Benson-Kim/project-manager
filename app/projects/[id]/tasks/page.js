"use client";

import { ItemsGrid, ItemsList } from "@/components/ProjectsDisplay";
import { usePermissions } from "@/hooks/usePermissions";
import { Permissions } from "@/lib/permissions";
import { AlignJustify, LayoutGrid, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const Tasks = () => {
	const { data: session, status } = useSession();
	const { can } = usePermissions();
	const [milestones, setMilestones] = useState([]);
	const [isGridView, setIsGridView] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const params = useParams();
	const router = useRouter();

	useEffect(() => {
		fetchMilestones();
	}, [params.id]);

	/** 🔹 Fetch all milestones */
	const fetchMilestones = async () => {
		try {
			const response = await fetch(`/api/projects/${params.id}/tasks`);
			if (!response.ok) {
				throw new Error("Failed to fetch milestones");
			}
			const data = await response.json();
			setMilestones(data);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsLoading(false);
		}
	};

	/** 🔹 Create a new milestone */
	const createMilestone = async (milestoneData) => {
		try {
			const response = await fetch(`/api/projects/${params.id}/tasks`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(milestoneData),
			});
			if (!response.ok) {
				throw new Error("Failed to create milestone");
			}
			const newMilestone = await response.json();
			setMilestones([...milestones, newMilestone]);
			toast.success("Milestone created successfully!");
		} catch (error) {
			toast.error(error.message);
		}
	};

	/** 🔹 Delete a milestone */
	const handleDelete = async (id) => {
		try {
			const response = await fetch(`/api/projects/${params.id}/tasks`, {
				method: "DELETE",
			});
			if (!response.ok) {
				throw new Error("Failed to delete milestone");
			}
			setMilestones(milestones.filter((milestone) => milestone.id !== id));
			toast.success("Milestone deleted successfully!");
		} catch (error) {
			toast.error(error.message);
		}
	};

	/** 🔹 Update a milestone */
	const handleUpdate = async (id, updatedData) => {
		try {
			const response = await fetch(`/api/projects/${params.id}/tasks`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updatedData),
			});
			if (!response.ok) {
				throw new Error("Failed to update milestone");
			}
			const updatedMilestone = await response.json();
			setMilestones(
				milestones.map((milestone) =>
					milestone.id === id ? updatedMilestone : milestone
				)
			);
			toast.success("Milestone updated successfully!");
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<div className="p-6 space-y-6 font-sans">
			<div className="flex justify-between items-center">
				<h2 className="text-xl font-semibold">Tasks</h2>
				<div className="flex gap-4">
					<div className="flex items-center border rounded-lg overflow-hidden">
						<button
							onClick={() => setIsGridView(true)}
							className={`p-2 ${
								isGridView ? "bg-indigo-50 text-indigo-600" : "hover:bg-gray-50"
							}`}
						>
							<LayoutGrid className="w-5 h-5" />
						</button>
						<button
							onClick={() => setIsGridView(false)}
							className={`p-2 ${
								!isGridView
									? "bg-indigo-50 text-indigo-600"
									: "hover:bg-gray-50"
							}`}
						>
							<AlignJustify className="w-5 h-5" />
						</button>
					</div>
					{can(Permissions.CREATE_MILESTONE) && (
						<button
							onClick={() => setIsModalOpen(true)}
							className="btn-sm flex items-center gap-1 bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700"
						>
							<Plus className="w-5 h-5" />
							New Milestone
						</button>
					)}
				</div>
			</div>

			{isLoading ? (
				<p>Loading milestones...</p>
			) : (
				<div
					className={
						isGridView
							? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
							: "flex flex-col space-y-4"
					}
				>
					{milestones.map((milestone) =>
						isGridView ? (
							<ItemsGrid
								key={milestone.id}
								item={milestone}
								type="tasks"
								onEdit={handleUpdate}
								onDelete={handleDelete}
							/>
						) : (
							<ItemsList
								key={milestone.id}
								item={milestone}
								type="tasks"
								onEdit={handleUpdate}
								onDelete={handleDelete}
							/>
						)
					)}
				</div>
			)}
		</div>
	);
};

export default Tasks;
