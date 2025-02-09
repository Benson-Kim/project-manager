// components/StakeholderModal.js
import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/hooks/usePermissions";
import { Permissions } from "@/lib/permissions";

export default function StakeholderModal() {
	const { data: session } = useSession();
	const { can } = usePermissions();

	const [formData, setFormData] = useState({
		email: "",
		firstName: "",
		lastName: "",
		departmentOrOrganization: "",
		phoneNumber: "",
		phoneExt: "",
		mobile: "",
		physicalLocation: "",
		orgTitle: "",
		communicationPreference: "EMAIL",
		engagementLevel: "MEDIUM",
		additionalNotes: "",
	});

	const [userExists, setUserExists] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [status, setStatus] = useState({
		loading: false,
		error: "",
		success: "",
	});

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleEmailCheck = async (email) => {
		if (!email) return;

		try {
			const response = await fetch("/api/stakeholders/check-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || "Failed to check email");
			}

			const data = await response.json();
			setUserExists(data.exists);
		} catch (error) {
			console.error("Error checking email:", error);
			setStatus({
				loading: false,
				error: error.message,
				success: "",
			});
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setStatus({ loading: true, error: "", success: "" });

		try {
			const response = await fetch("/api/stakeholders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to create stakeholder");
			}

			setStatus({
				loading: false,
				error: "",
				success: "Stakeholder invited successfully",
			});

			onSuccess?.(data.user);
			setTimeout(() => onClose?.(), 1500);

			// Close modal and reset form
			document.getElementById("my_modal_2").close();
			setFormData({
				email: "",
				firstName: "",
				lastName: "",
				departmentOrOrganization: "",
				phoneNumber: "",
				phoneExt: "",
				mobile: "",
				physicalLocation: "",
				orgTitle: "",
				communicationPreference: "EMAIL",
				engagementLevel: "MEDIUM",
				additionalNotes: "",
			});
		} catch (error) {
			setStatus({
				loading: false,
				error: error.message,
				success: "",
			});
		}
	};

	if (!can(Permissions.MANAGE_USERS)) {
		return (
			<div className="flex flex-col">
				You dont have permission to manage stakeholders
			</div>
		);
	}

	return (
		<dialog id="my_modal_2" className="modal">
			<div className="modal-box w-11/12">
				<h3 className="font-bold text-lg mb-4">Invite Stakeholder</h3>

				<form onSubmit={handleSubmit}>
					<div className="space-y-4">
						<div>
							<label className="block mb-2">Email *</label>
							<input
								type="email"
								name="email"
								value={formData.email}
								onChange={(e) => {
									handleChange(e);
									handleEmailCheck(e.target.value);
								}}
								className="input input-bordered w-full"
								required
							/>
						</div>

						{!userExists && (
							<>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block mb-2">First Name *</label>
										<input
											type="text"
											name="firstName"
											value={formData.firstName}
											onChange={handleChange}
											className="input input-bordered w-full"
											required
										/>
									</div>
									<div>
										<label className="block mb-2">Last Name *</label>
										<input
											type="text"
											name="lastName"
											value={formData.lastName}
											onChange={handleChange}
											className="input input-bordered w-full"
											required
										/>
									</div>
								</div>

								<div>
									<label className="block mb-2">Department/Organization</label>
									<input
										type="text"
										name="departmentOrOrganization"
										value={formData.departmentOrOrganization}
										onChange={handleChange}
										className="input input-bordered w-full"
									/>
								</div>

								<div className="grid grid-cols-3 gap-4">
									<div>
										<label className="block mb-2">Phone Number</label>
										<input
											type="tel"
											name="phoneNumber"
											value={formData.phoneNumber}
											onChange={handleChange}
											className="input input-bordered w-full"
										/>
									</div>
									<div>
										<label className="block mb-2">Ext#</label>
										<input
											type="text"
											name="phoneExt"
											value={formData.phoneExt}
											onChange={handleChange}
											className="input input-bordered w-full"
										/>
									</div>
									<div>
										<label className="block mb-2">Mobile</label>
										<input
											type="tel"
											name="mobile"
											value={formData.mobile}
											onChange={handleChange}
											className="input input-bordered w-full"
										/>
									</div>
								</div>

								<div>
									<label className="block mb-2">Physical Location</label>
									<input
										type="text"
										name="physicalLocation"
										value={formData.physicalLocation}
										onChange={handleChange}
										className="input input-bordered w-full"
									/>
								</div>

								<div>
									<label className="block mb-2">Organization Title</label>
									<input
										type="text"
										name="orgTitle"
										value={formData.orgTitle}
										onChange={handleChange}
										className="input input-bordered w-full"
									/>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block mb-2">
											Communication Preference
										</label>
										<select
											name="communicationPreference"
											value={formData.communicationPreference}
											onChange={handleChange}
											className="select select-bordered w-full"
										>
											<option value="EMAIL">Email</option>
											<option value="PHONE">Phone</option>
											<option value="MOBILE">Mobile</option>
										</select>
									</div>
									<div>
										<label className="block mb-2">Engagement Level</label>
										<select
											name="engagementLevel"
											value={formData.engagementLevel}
											onChange={handleChange}
											className="select select-bordered w-full"
										>
											<option value="HIGH">High</option>
											<option value="MEDIUM">Medium</option>
											<option value="LOW">Low</option>
										</select>
									</div>
								</div>

								<div>
									<label className="block mb-2">Additional Notes</label>
									<textarea
										name="additionalNotes"
										value={formData.additionalNotes}
										onChange={handleChange}
										className="textarea textarea-bordered w-full"
										rows="3"
									/>
								</div>
							</>
						)}

						{error && <div className="text-red-500 text-sm mt-2">{error}</div>}

						<div className="modal-action">
							<button
								type="button"
								className="btn"
								onClick={() => document.getElementById("my_modal_2").close()}
							>
								Cancel
							</button>
							<button
								type="submit"
								className="btn btn-primary"
								disabled={loading || userExists}
							>
								{loading ? "Sending..." : "Invite Stakeholder"}
							</button>
						</div>
					</div>
				</form>
			</div>
		</dialog>
	);
}
