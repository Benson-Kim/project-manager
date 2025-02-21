// components/ItemList.jsx
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePermissionGuardedCrud } from "../hooks/usePermissionGuardedCrud";
import { toast } from "react-hot-toast";
import { Plus } from "lucide-react";
import { format } from "date-fns";

const ItemList = ({ projectId, resourceType, resourceName }) => {
	if (!projectId || projectId === "undefined") {
		console.error(`Invalid projectId for ${resourceName}:`, projectId);
		return (
			<div className="card p-6 text-center text-body">Invalid project ID.</div>
		);
	}

	const url = `/api/projects/${projectId}/${resourceName}`;
	const {
		data: items,
		isLoading,
		fetchAll,
		createItem,
		permissions,
	} = usePermissionGuardedCrud(resourceType, url);

	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [newItem, setNewItem] = useState({});
	const [errorMessage, setErrorMessage] = useState(null);

	const fields = getFieldsForResource(resourceName);

	useEffect(() => {
		if (permissions.canRead && !items && !isLoading) {
			fetchAll();
		} else if (!permissions.canRead) {
			toast.error(`You do not have permission to view ${resourceName}.`);
		}
	}, [permissions.canRead, fetchAll, items, isLoading, resourceName]);

	const handleCreate = async (e) => {
		e.preventDefault();
		if (!permissions.canCreate)
			return toast.error(`No permission to create ${resourceName}`);
		setErrorMessage(null);

		const preparedItem = { ...newItem };
		fields.forEach((field) => {
			if (field.type === "number" && preparedItem[field.name]) {
				preparedItem[field.name] = parseFloat(preparedItem[field.name]);
			}
		});

		try {
			await createItem(preparedItem);
			toast.success(`${resourceName} created successfully!`);
			setIsCreateModalOpen(false);
			setNewItem({});
			await fetchAll();
		} catch (error) {
			const message = error.message.includes("Invalid value")
				? `Please check your input for ${resourceName}: ${error.message
						.split(" ")
						.slice(-2)
						.join(" ")}`
				: error.message ||
				  `Failed to create ${resourceName}. Please try again.`;
			setErrorMessage(message);
			toast.error(message);
		}
	};

	if (!permissions.canRead)
		return (
			<div className="card p-6 text-center text-body">Permission denied.</div>
		);
	if (isLoading)
		return (
			<div className="flex justify-center items-center h-screen">
				<span className="loading loading-spinner loading-lg text-primary"></span>
			</div>
		);

	return (
		<div className="container">
			<div className="flex justify-between items-center mb-6">
				<h2>{resourceName.charAt(0).toUpperCase() + resourceName.slice(1)}</h2>
				{permissions.canCreate && (
					<button
						className="btn  btn-primary "
						onClick={() => setIsCreateModalOpen(true)}
					>
						<Plus size={20} /> Create {resourceName.slice(0, -1)}
					</button>
				)}
			</div>

			<div className="p-6">
				<div className="overflow-x-auto">
					<table className="table">
						<thead>
							<tr>
								{fields.map((field) => (
									<th key={field.name}>{field.label || field.name}</th>
								))}
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{items && items.length > 0 ? (
								items.map((item) => (
									<tr key={item.id}>
										{fields.map((field) => (
											<td key={field.name}>{renderField(item, field)}</td>
										))}
										<td>
											<Link
												href={`/projects/${projectId}/${resourceName}/${item.id}`}
												className="btn btn-primary btn-sm"
											>
												View
											</Link>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={fields.length + 2} className="text-center">
										No {resourceName} found.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{isCreateModalOpen && (
				<div className="modal modal-open">
					<div className="modal-box card p-6">
						<h3>Create New {resourceName}</h3>
						{errorMessage && (
							<div className="alert alert-error mb-4 text-body">
								{errorMessage}
							</div>
						)}
						<form onSubmit={handleCreate} className="space-y-4">
							{fields.map((field) => (
								<div key={field.name} className="form-control">
									<label className="label">{field.label || field.name}</label>
									{field.enumOptions ? (
										<select
											className="select select-bordered w-full"
											value={newItem[field.name] || ""}
											onChange={(e) =>
												setNewItem({ ...newItem, [field.name]: e.target.value })
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
											value={newItem[field.name] || ""}
											onChange={(e) =>
												setNewItem({ ...newItem, [field.name]: e.target.value })
											}
										/>
									) : (
										<input
											type={field.type || "text"}
											className="input input-bordered w-full"
											value={newItem[field.name] || ""}
											onChange={(e) =>
												setNewItem({ ...newItem, [field.name]: e.target.value })
											}
											required={field.required}
										/>
									)}
								</div>
							))}
							<div className="modal-action">
								<button type="submit" className="btn btn-primary">
									Create
								</button>
								<button
									type="button"
									className="btn btn-secondary"
									onClick={() => setIsCreateModalOpen(false)}
								>
									Cancel
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
};

// Helper to define fields per resource (unchanged content, styled differently)
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
		return value ? format(new Date(value), "MMM d, yyyy") : "N/A";
	}
	return value || "N/A";
};

export default ItemList;
