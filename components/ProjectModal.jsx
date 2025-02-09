import React, { useState } from "react";
import { add, format } from "date-fns";
import { useSession } from "next-auth/react";

const ProjectModal = ({ isOpen, onClose, onSubmit }) => {
	const { data: session } = useSession();
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		startDate: format(new Date(), "yyyy-MM-dd"),
		endDate: format(add(new Date(), { months: 1 }), "yyyy-MM-dd"),
		status: "PLANNING",
		budget: "",
	});

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!session?.user?.id) {
			alert("You must be logged in to create a project");
			return;
		}

		const submissionData = {
			...formData,
			budget: formData.budget ? parseFloat(formData.budget) : null,
			userId: session.user.id,
		};

		await onSubmit(submissionData);
		setFormData({
			name: "",
			description: "",
			startDate: format(new Date(), "yyyy-MM-dd"),
			endDate: format(add(new Date(), { months: 1 }), "yyyy-MM-dd"),
			status: "PLANNING",
			budget: "",
		});
		onClose();
	};

	return (
		<dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
			<div className="modal-box w-11/12 max-w-3xl">
				<form onSubmit={handleSubmit}>
					<h3 className="font-bold text-lg mb-6">Create New Project</h3>

					<div className="form-control w-full mb-4">
						<label className="label">
							<span className="label-text">Project Name</span>
						</label>
						<input
							type="text"
							name="name"
							value={formData.name}
							onChange={handleChange}
							placeholder="Enter project name"
							className="input input-bordered w-full"
							required
						/>
					</div>

					<div className="form-control w-full mb-4">
						<label className="label">
							<span className="label-text">Description</span>
						</label>
						<textarea
							name="description"
							value={formData.description}
							onChange={handleChange}
							placeholder="Enter project description"
							className="textarea textarea-bordered h-24"
						/>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
						<div className="form-control w-full">
							<label className="label">
								<span className="label-text">Start Date</span>
							</label>
							<input
								type="date"
								name="startDate"
								value={formData.startDate}
								onChange={handleChange}
								className="input input-bordered"
								required
							/>
						</div>

						<div className="form-control w-full">
							<label className="label">
								<span className="label-text">End Date</span>
							</label>
							<input
								type="date"
								name="endDate"
								value={formData.endDate}
								onChange={handleChange}
								className="input input-bordered"
								required
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
						<div className="form-control w-full">
							<label className="label">
								<span className="label-text">Status</span>
							</label>
							<select
								name="status"
								value={formData.status}
								onChange={handleChange}
								className="select select-bordered w-full"
							>
								<option value="PLANNING">Planning</option>
								<option value="IN_PROGRESS">In Progress</option>
								<option value="ON_HOLD">On Hold</option>
								<option value="COMPLETED">Completed</option>
							</select>
						</div>

						<div className="form-control w-full">
							<label className="label">
								<span className="label-text">Budget</span>
							</label>
							<input
								type="number"
								name="budget"
								value={formData.budget}
								onChange={handleChange}
								placeholder="Enter budget amount"
								className="input input-bordered"
								step="0.01"
							/>
						</div>
					</div>

					<div className="modal-action">
						<button type="button" className="btn" onClick={onClose}>
							Cancel
						</button>
						<button type="submit" className="btn btn-primary">
							Create Project
						</button>
					</div>
				</form>
			</div>
			<form method="dialog" className="modal-backdrop">
				<button onClick={onClose}>close</button>
			</form>
		</dialog>
	);
};

export default ProjectModal;
