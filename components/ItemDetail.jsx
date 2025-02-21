// components/ItemDetail.jsx
import { format } from "date-fns";
import { toast } from "react-hot-toast";
import { useState, useEffect } from "react";
import { Edit, Trash2 } from "lucide-react";
import { usePermissionGuardedCrud } from "@/hooks/usePermissionGuardedCrud";

const ItemDetail = ({ projectId, resourceType, resourceName, itemId }) => {
	if (!projectId || projectId === "undefined") {
		console.error(`Invalid projectId for ${resourceName}:`, projectId);
		return <div className="alert alert-error">Invalid project ID.</div>;
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
		return <div className="alert alert-error">Permission denied.</div>;
	if (isLoading)
		return <div className="loading loading-spinner loading-lg"></div>;
	if (!item)
		return <div className="alert alert-warning">{resourceName} not found.</div>;

	return (
		<div>
			<div className="card w-full bg-base-100 shadow-xl">
				<div className="card-body">
					<h2 className="card-title">
						{item.name || item.title || "Item Details"}
					</h2>
					{fields.map((field) => (
						<p key={field.name}>
							<strong>{field.label || field.name}:</strong>{" "}
							{renderField(item, field)}
						</p>
					))}
				</div>
			</div>

			<div className="mt-4">
				{permissions.canUpdate && (
					<button
						className="btn btn-warning mr-2"
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
					<div className="modal-box">
						<h3 className="font-bold text-lg">Update {resourceName}</h3>
						{errorMessage && (
							<div className="alert alert-error mb-4">{errorMessage}</div>
						)}
						<form onSubmit={handleUpdate}>
							{fields.map((field) => (
								<div key={field.name} className="form-control">
									<label className="label">{field.label || field.name}</label>
									{field.enumOptions ? (
										<select
											className="select select-bordered"
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
											className="textarea textarea-bordered"
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
											className="input input-bordered"
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
								<button type="submit" className="btn btn-warning">
									Update
								</button>
								<button
									type="button"
									className="btn"
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
					<div className="modal-box">
						<h3 className="font-bold text-lg">Delete {resourceName}</h3>
						<p>
							Are you sure you want to delete this {resourceName}? This action
							cannot be undone.
						</p>
						<div className="modal-action">
							<button className="btn btn-error" onClick={handleDelete}>
								Delete
							</button>
							<button
								className="btn"
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

// Reusing the same field config and render function from ItemList
const getFieldsForResource = (resourceName) => {
	const fieldConfigs = {
		stakeholders: [
			{ name: "name", label: "Name", required: true },
			{ name: "role", label: "Role" },
			{ name: "organization", label: "Organization" },
			{ name: "contactInfo", label: "Contact Info" },
			{
				name: "influence",
				label: "Influence",
				enumOptions: ["HIGH", "MEDIUM", "LOW"],
			},
			{
				name: "interest",
				label: "Interest",
				enumOptions: ["HIGH", "MEDIUM", "LOW"],
			},
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
			{ name: "askedBy", label: "Asked By" },
			{ name: "answeredBy", label: "Answered By" },
		],
		suppliers: [
			{ name: "name", label: "Name", required: true },
			{ name: "contactPerson", label: "Contact Person" },
			{ name: "contactInfo", label: "Contact Info" },
			{ name: "serviceProvided", label: "Service Provided" },
			{ name: "contractDetails", label: "Contract Details", type: "textarea" },
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
			{
				name: "status",
				label: "Status",
				enumOptions: ["VALID", "INVALID", "UNCERTAIN"],
			},
		],
		parkingLotItems: [
			{ name: "title", label: "Title", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{
				name: "priority",
				label: "Priority",
				enumOptions: ["HIGH", "MEDIUM", "LOW"],
			},
			{
				name: "status",
				label: "Status",
				enumOptions: ["PENDING", "IN_REVIEW", "RESOLVED"],
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
			{ name: "allocation", label: "Allocation" },
			{ name: "startDate", label: "Start Date", type: "date" },
			{ name: "endDate", label: "End Date", type: "date" },
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
			{ name: "date", label: "Date", type: "date" },
			{
				name: "paymentStatus",
				label: "Payment Status",
				enumOptions: ["PENDING", "PAID"],
			},
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
			{
				name: "impact",
				label: "Impact",
				enumOptions: ["HIGH", "MEDIUM", "LOW"],
			},
			{
				name: "probability",
				label: "Probability",
				enumOptions: ["HIGH", "MEDIUM", "LOW"],
			},
			{ name: "mitigation", label: "Mitigation", type: "textarea" },
		],
		dailyActivities: [
			{ name: "date", label: "Date", type: "date", required: true },
			{ name: "activity", label: "Activity" },
			{ name: "performedBy", label: "Performed By" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["PLANNED", "COMPLETED", "BLOCKED"],
			},
			{ name: "notes", label: "Notes", type: "textarea" },
		],
		notes: [
			{ name: "title", label: "Title", required: true },
			{ name: "content", label: "Content", type: "textarea" },
			{ name: "category", label: "Category" },
		],
		tasks: [
			{ name: "title", label: "Title", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{ name: "startDate", label: "Start Date", type: "date" },
			{ name: "endDate", label: "End Date", type: "date" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ON_HOLD"],
			},
			{
				name: "priority",
				label: "Priority",
				enumOptions: ["LOW", "MEDIUM", "HIGH"],
			},
			{ name: "parentId", label: "Parent Task" },
		],
		milestones: [
			{ name: "name", label: "Name", required: true },
			{ name: "description", label: "Description", type: "textarea" },
			{ name: "startDate", label: "Start Date", type: "date" },
			{ name: "endDate", label: "End Date", type: "date" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["PLANNED", "IN_PROGRESS", "COMPLETED", "DELAYED"],
			},
			{ name: "progress", label: "Progress", type: "number" },
		],
		resources: [
			{ name: "name", label: "Name", required: true },
			{
				name: "type",
				label: "Type",
				enumOptions: ["HUMAN", "MATERIAL", "EQUIPMENT"],
			},
			{ name: "capacity", label: "Capacity", type: "number" },
			{ name: "cost", label: "Cost", type: "number" },
		],
		meetings: [
			{ name: "title", label: "Title", required: true },
			{ name: "date", label: "Date", type: "date" },
			{ name: "startTime", label: "Start Time", type: "datetime-local" },
			{ name: "endTime", label: "End Time", type: "datetime-local" },
			{ name: "location", label: "Location" },
			{
				name: "status",
				label: "Status",
				enumOptions: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
			},
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
			{ name: "roleDescription", label: "Role Description", type: "textarea" },
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
		field.name.includes("Date") ||
		field.name === "startTime" ||
		field.name === "endTime"
	) {
		return value ? format(new Date(value), "MMM d, yyyy HH:mm") : "N/A";
	}
	return value || "N/A";
};

export default ItemDetail;
