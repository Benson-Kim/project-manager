// components/ProjectEditModal.jsx
import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function ProjectEditModal({
	project,
	isOpen,
	onClose,
	onSubmit,
}) {
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		startDate: "",
		endDate: "",
		status: "PLANNING",
		budget: "",
		members: [],
	});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (project) {
			// Format dates for input fields (YYYY-MM-DD)
			const formatDate = (dateString) => {
				if (!dateString) return "";
				const date = new Date(dateString);
				return date.toISOString().split("T")[0];
			};

			setFormData({
				name: project.name || "",
				description: project.description || "",
				startDate: formatDate(project.startDate),
				endDate: formatDate(project.endDate),
				status: project.status || "PLANNING",
				budget: project.budget?.toString() || "",
				members: project.members || [],
			});
		}
	}, [project]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			await onSubmit(formData);
		} catch (err) {
			setError(err.message || "An error occurred while updating the project");
		} finally {
			setIsLoading(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
			<div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between p-6 border-b">
					<h2 className="text-xl font-semibold">Edit Project</h2>
					<button
						onClick={onClose}
						className="p-1 rounded-full hover:bg-gray-100"
					>
						<X size={24} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="p-6 space-y-6">
					{error && (
						<div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
							{error}
						</div>
					)}

					<div className="space-y-4">
						<div>
							<label
								htmlFor="name"
								className="block mb-2 text-sm font-medium text-gray-700"
							>
								Project Name *
							</label>
							<input
								type="text"
								id="name"
								name="name"
								value={formData.name}
								onChange={handleChange}
								required
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
							/>
						</div>

						<div>
							<label
								htmlFor="description"
								className="block mb-2 text-sm font-medium text-gray-700"
							>
								Description
							</label>
							<textarea
								id="description"
								name="description"
								value={formData.description}
								onChange={handleChange}
								rows={4}
								className="w-full px-3 py-2 border border-gray-300 rounded-md"
							/>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="startDate"
									className="block mb-2 text-sm font-medium text-gray-700"
								>
									Start Date *
								</label>
								<input
									type="date"
									id="startDate"
									name="startDate"
									value={formData.startDate}
									onChange={handleChange}
									required
									className="w-full px-3 py-2 border border-gray-300 rounded-md"
								/>
							</div>

							<div>
								<label
									htmlFor="endDate"
									className="block mb-2 text-sm font-medium text-gray-700"
								>
									End Date *
								</label>
								<input
									type="date"
									id="endDate"
									name="endDate"
									value={formData.endDate}
									onChange={handleChange}
									required
									className="w-full px-3 py-2 border border-gray-300 rounded-md"
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="status"
									className="block mb-2 text-sm font-medium text-gray-700"
								>
									Status *
								</label>
								<select
									id="status"
									name="status"
									value={formData.status}
									onChange={handleChange}
									required
									className="w-full px-3 py-2 border border-gray-300 rounded-md"
								>
									<option value="PLANNING">Planning</option>
									<option value="IN_PROGRESS">In Progress</option>
									<option value="ON_HOLD">On Hold</option>
									<option value="COMPLETED">Completed</option>
									<option value="CANCELLED">Cancelled</option>
								</select>
							</div>

							<div>
								<label
									htmlFor="budget"
									className="block mb-2 text-sm font-medium text-gray-700"
								>
									Budget
								</label>
								<input
									type="number"
									id="budget"
									name="budget"
									value={formData.budget}
									onChange={handleChange}
									step="0.01"
									min="0"
									className="w-full px-3 py-2 border border-gray-300 rounded-md"
								/>
							</div>
						</div>

						{/* Member management would go here, but is left out for brevity */}
					</div>

					<div className="flex justify-end space-x-4 pt-4 border-t">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
							disabled={isLoading}
						>
							Cancel
						</button>
						<button
							type="submit"
							className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
							disabled={isLoading}
						>
							{isLoading ? "Saving..." : "Save Changes"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
