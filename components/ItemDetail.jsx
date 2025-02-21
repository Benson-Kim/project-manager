// components/ItemDetail.jsx
import { useState, useEffect } from "react";
import { usePermissionGuardedCrud } from "../hooks/usePermissionGuardedCrud";
import { toast } from "react-hot-toast";
import { Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

const ItemDetail = ({ projectId, resourceType, resourceName, itemId }) => {
	if (!projectId || projectId === "undefined") {
		console.error(`Invalid projectId for ${resourceName}:`, projectId);
		return (
			<div className="card p-6 text-center text-body">Invalid project ID.</div>
		);
	}

	const url = `/api/projects/${projectId}/${resourceName}/${itemId}`;
	const {
		data: item,
		isLoading,
		fetchAll,
		updateItem,
		deleteItem,
		permissions,
	} = usePermissionGuardedCrud(resourceType, url);

	const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [updatedItem, setUpdatedItem] = useState({});
	const [errorMessage, setErrorMessage] = useState(null);

	const fields = getFieldsForResource(resourceName);

	useEffect(() => {
		if (permissions.canRead) fetchAll();
		else
			toast.error(`You do not have permission to view this ${resourceName}.`);
	}, [permissions.canRead, resourceName]);

	useEffect(() => {
		if (item) setUpdatedItem({ ...item });
	}, [item]);

	const handleUpdate = async (e) => {
		e.preventDefault();
		if (!permissions.canUpdate)
			return toast.error(`No permission to update ${resourceName}`);
		setErrorMessage(null);

		const preparedItem = { ...updatedItem };
		fields.forEach((field) => {
			if (field.type === "number" && preparedItem[field.name]) {
				preparedItem[field.name] = parseFloat(preparedItem[field.name]);
			}
		});

		try {
			await updateItem(itemId, preparedItem);
			toast.success(`${resourceName} updated successfully!`);
			setIsUpdateModalOpen(false);
		} catch (error) {
			const message = error.message.includes("Invalid value")
				? `Please check your input for ${resourceName}: ${error.message
						.split(" ")
						.slice(-2)
						.join(" ")}`
				: error.message ||
				  `Failed to update ${resourceName}. Please try again.`;
			setErrorMessage(message);
			toast.error(message);
		}
	};

	const handleDelete = async () => {
		if (!permissions.canDelete)
			return toast.error(`No permission to delete ${resourceName}`);
		try {
			await deleteItem(itemId);
			toast.success(`${resourceName} deleted successfully!`);
			setIsDeleteModalOpen(false);
		} catch (error) {
			toast.error(error.message || `Failed to delete ${resourceName}.`);
		}
	};

	if (!permissions.canRead)
		return (
			<div className="card p-6 text-center text-body">Permission denied.</div>
		);
	if (isLoading)
		return (
			<div className="flex justify-center items-center h-64">
				<span className="loading loading-spinner loading-lg text-primary"></span>
			</div>
		);
	if (!item)
		return (
			<div className="card p-6 text-center text-body">
				{resourceName} not found.
			</div>
		);

	return (
		<div className="container">
			<div className="breadcrumbs text-sm">
				<ul className="flex gap-2">
					<li>
						<Link href="/dashboard" className="text-indigo-500">
							Home
						</Link>
					</li>
					<li>
						<Link href="/dashboard/projects" className="text-indigo-500">
							Projects
						</Link>
					</li>
					<li>
						<Link
							href={`/dashboard/projects/${resourceName}`}
							className="text-indigo-500"
						>
							{resourceName}
						</Link>
					</li>

					<li className="text-slate-700 font-medium">Projects</li>
				</ul>
			</div>
			<div className="card p-6">
				<h2>{item.name || item.title || "Item Details"}</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
					{fields.map((field) => (
						<div key={field.name}>
							<span className="font-semibold text-heading">
								{field.label || field.name}:
							</span>{" "}
							<span className="text-body">{renderField(item, field)}</span>
						</div>
					))}
				</div>
			</div>

			<div className="mt-6 flex gap-4">
				{permissions.canUpdate && (
					<button
						className="btn btn-warning"
						onClick={() => setIsUpdateModalOpen(true)}
					>
						<Edit size={16} /> Update
					</button>
				)}
				{permissions.canDelete && (
					<button
						className="btn btn-error"
						onClick={() => setIsDeleteModalOpen(true)}
					>
						<Trash2 size={16} /> Delete
					</button>
				)}
			</div>

			{isUpdateModalOpen && (
				<div className="modal modal-open">
					<div className="modal-box card p-6">
						<h3>Update {resourceName}</h3>
						{errorMessage && (
							<div className="alert alert-error mb-4 text-body">
								{errorMessage}
							</div>
						)}
						<form onSubmit={handleUpdate} className="space-y-4">
							{fields.map((field) => (
								<div key={field.name} className="form-control">
									<label className="label">{field.label || field.name}</label>
									{field.enumOptions ? (
										<select
											className="select select-bordered w-full"
											value={updatedItem[field.name] || ""}
											onChange={(e) =>
												setUpdatedItem({
													...updatedItem,
													[field.name]: e.target.value,
												})
											}
											required={field.required}
										>
											<option value="">
												Select {field.label || field.name}
											</option>
											{field.enumOptions.map((option) => (
												<option key={option} value={option}>
													{option}
												</option>
											))}
										</select>
									) : field.type === "textarea" ? (
										<textarea
											className="textarea textarea-bordered w-full"
											value={updatedItem[field.name] || ""}
											onChange={(e) =>
												setUpdatedItem({
													...updatedItem,
													[field.name]: e.target.value,
												})
											}
										/>
									) : (
										<input
											type={field.type || "text"}
											className="input input-bordered w-full"
											value={updatedItem[field.name] || ""}
											onChange={(e) =>
												setUpdatedItem({
													...updatedItem,
													[field.name]: e.target.value,
												})
											}
											required={field.required}
										/>
									)}
								</div>
							))}
							<div className="modal-action">
								<button type="submit" className="btn btn-primary">
									Update
								</button>
								<button
									type="button"
									className="btn btn-secondary"
									onClick={() => setIsUpdateModalOpen(false)}
								>
									Cancel
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{isDeleteModalOpen && (
				<div className="modal modal-open">
					<div className="modal-box card p-6">
						<h3>Delete {resourceName}</h3>
						<p className="text-body">
							Are you sure you want to delete this {resourceName}? This action
							cannot be undone.
						</p>
						<div className="modal-action">
							<button className="btn btn-error" onClick={handleDelete}>
								Delete
							</button>
							<button
								className="btn btn-secondary"
								onClick={() => setIsDeleteModalOpen(false)}
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

// Same getFieldsForResource and renderField as ItemList (omitted for brevity)
const getFieldsForResource = (resourceName) => {
	const fieldConfigs = {
		stakeholders: [
			{ name: "name", label: "Name", required: true },
			{ name: "role", label: "Role" },
			{ name: "organization", label: "Organization" },
			{ name: "contactInfo", label: "Contact Info" },
		],
		acronyms: [
			{ name: "acronym", label: "Acronym", required: true },
			{ name: "definition", label: "Definition" },
		],
		keyDeliverables: [
			{ name: "name", label: "Name", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{ name: "dueDate", label: "Due Date", type: "date" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["PLANNED", "IN_PROGRESS", "COMPLETED"],
			},
		],
		objectives: [
			{ name: "title", label: "Title", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{ name: "measurable", label: "Measurable" },
		],
		questionAnswers: [
			{ name: "question", label: "Question", required: true },
			{ name: "answer", label: "Answer", type: "textarea" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["OPEN", "ANSWERED", "CLOSED"],
			},
		],
		suppliers: [
			{ name: "name", label: "Name", required: true },
			{ name: "contactPerson", label: "Contact Person" },
			{ name: "contactInfo", label: "Contact Info" },
			{ name: "serviceProvided", label: "Service Provided" },
		],
		assumptionConstraints: [
			{
				name: "type",
				label: "Type",
				required: true,
				enumOptions: ["ASSUMPTION", "CONSTRAINT"],
			},
			{ name: "description", label: "Description", type: "textarea" },
			{ name: "impact", label: "Impact" },
		],
		parkingLotItems: [
			{ name: "title", label: "Title", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{
				name: "priority",
				label: "Priority",
				enumOptions: ["HIGH", "MEDIUM", "LOW"],
			},
		],
		itResources: [
			{ name: "name", label: "Name", required: true },
			{
				name: "type",
				label: "Type",
				enumOptions: ["HARDWARE", "SOFTWARE", "PERSONNEL"],
			},
			{ name: "quantity", label: "Quantity", type: "number" },
		],
		financials: [
			{
				name: "category",
				label: "Category",
				required: true,
				enumOptions: ["BUDGET", "EXPENSE", "REVENUE"],
			},
			{ name: "amount", label: "Amount", type: "number" },
			{ name: "description", label: "Description", type: "textarea" },
		],
		issueRisks: [
			{
				name: "type",
				label: "Type",
				required: true,
				enumOptions: ["ISSUE", "RISK"],
			},
			{ name: "title", label: "Title" },
			{ name: "description", label: "Description", type: "textarea" },
		],
		dailyActivities: [
			{ name: "date", label: "Date", type: "date", required: true },
			{ name: "activity", label: "Activity" },
			{ name: "performedBy", label: "Performed By" },
		],
		notes: [
			{ name: "title", label: "Title", required: true },
			{ name: "content", label: "Content", type: "textarea" },
		],
		tasks: [
			{ name: "title", label: "Title", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ON_HOLD"],
			},
			{ name: "parentId", label: "Parent Task" },
		],
		milestones: [
			{ name: "name", label: "Name", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{ name: "startDate", label: "Start Date", type: "date" },
			{ name: "endDate", label: "End Date", type: "date" },
		],
		resources: [
			{ name: "name", label: "Name", required: true },
			{
				name: "type",
				label: "Type",
				enumOptions: ["HUMAN", "MATERIAL", "EQUIPMENT"],
			},
			{ name: "capacity", label: "Capacity", type: "number" },
		],
		meetings: [
			{ name: "title", label: "Title", required: true },
			{ name: "startTime", label: "Start Time", type: "datetime-local" },
			{ name: "endTime", label: "End Time", type: "datetime-local" },
		],
		projectMembers: [
			{
				name: "role",
				label: "Role",
				required: true,
				enumOptions: [
					"CLIENT",
					"PROJECT_MANAGER",
					"TEAM_MEMBER",
					"STAKEHOLDER",
				],
			},
			{ name: "userId", label: "User ID" },
		],
	};
	return (
		fieldConfigs[resourceName] || [
			{ name: "name", label: "Name", required: true },
		]
	);
};

const renderField = (item, field) => {
	const value = item[field.name];
	if (
		field.name === "dueDate" ||
		field.name === "startDate" ||
		field.name === "endDate" ||
		field.name === "date" ||
		field.name === "startTime" ||
		field.name === "endTime"
	) {
		return value ? format(new Date(value), "MMM d, yyyy HH:mm") : "N/A";
	}
	return value || "N/A";
};

export default ItemDetail;
