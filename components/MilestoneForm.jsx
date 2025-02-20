import React, { useState } from "react";
import { Calendar, DollarSign } from "lucide-react";

export default function MilestoneForm({
	projectId,
	onSubmit,
	onCancel,
	initialData,
}) {
	const [formData, setFormData] = useState({
		name: initialData?.name || "",
		description: initialData?.description || "",
		leaderId: initialData?.leaderId || "",
		startDate: initialData?.startDate
			? new Date(initialData.startDate).toISOString().split("T")[0]
			: "",
		endDate: initialData?.endDate
			? new Date(initialData.endDate).toISOString().split("T")[0]
			: "",
		budget: initialData?.budget || "",
		status: initialData?.status || "PLANNED",
	});

	const handleSubmit = async (e) => {
		e.preventDefault();
		onSubmit(formData);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div>
				<label className="block text-sm font-medium text-gray-700">Name</label>
				<input
					type="text"
					required
					className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					value={formData.name}
					onChange={(e) => setFormData({ ...formData, name: e.target.value })}
				/>
			</div>

			<div>
				<label className="block text-sm font-medium text-gray-700">
					Description
				</label>
				<textarea
					className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					rows="3"
					value={formData.description}
					onChange={(e) =>
						setFormData({ ...formData, description: e.target.value })
					}
				/>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div>
					<label className="block text-sm font-medium text-gray-700">
						Start Date
					</label>
					<div className="mt-1 relative">
						<Calendar
							className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
							size={20}
						/>
						<input
							type="date"
							required
							className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							value={formData.startDate}
							onChange={(e) =>
								setFormData({ ...formData, startDate: e.target.value })
							}
						/>
					</div>
				</div>

				<div>
					<label className="block text-sm font-medium text-gray-700">
						End Date
					</label>
					<div className="mt-1 relative">
						<Calendar
							className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
							size={20}
						/>
						<input
							type="date"
							required
							className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							value={formData.endDate}
							onChange={(e) =>
								setFormData({ ...formData, endDate: e.target.value })
							}
						/>
					</div>
				</div>
			</div>

			<div>
				<label className="block text-sm font-medium text-gray-700">
					Budget
				</label>
				<div className="mt-1 relative">
					<DollarSign
						className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
						size={20}
					/>
					<input
						type="number"
						step="0.01"
						className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
						value={formData.budget}
						onChange={(e) =>
							setFormData({ ...formData, budget: parseFloat(e.target.value) })
						}
					/>
				</div>
			</div>

			<div>
				<label className="block text-sm font-medium text-gray-700">
					Status
				</label>
				<select
					className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					value={formData.status}
					onChange={(e) => setFormData({ ...formData, status: e.target.value })}
				>
					<option value="PLANNED">Planned</option>
					<option value="IN_PROGRESS">In Progress</option>
					<option value="COMPLETED">Completed</option>
					<option value="DELAYED">Delayed</option>
				</select>
			</div>

			<div className="flex justify-end space-x-4">
				<button
					type="button"
					onClick={onCancel}
					className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
				>
					Cancel
				</button>
				<button
					type="submit"
					className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
				>
					{initialData ? "Update" : "Create"} Milestone
				</button>
			</div>
		</form>
	);
}
