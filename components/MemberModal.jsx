// app/projects/[id]/components/AddMembers.js
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import toast from "react-hot-toast";

export default function AddMembers() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [users, setUsers] = useState([]);
	const [selectedUsers, setSelectedUsers] = useState([]);
	const [loading, setLoading] = useState(false);
	const [showNewMemberForm, setShowNewMemberForm] = useState(false);
	const router = useRouter();
	const params = useParams();

	useEffect(() => {
		const fetchUsers = async () => {
			try {
				const response = await fetch("/api/users");
				if (!response.ok) throw new Error("Failed to fetch users");
				const data = await response.json();
				setUsers(data);
			} catch (error) {
				console.error("Error fetching users:", error);
			}
		};
		fetchUsers();
	}, []);

	const handleAddMember = async (userId) => {
		setLoading(true);
		try {
			const response = await fetch(`/api/projects/${params.id}/members`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userId,
					role: "TEAM_MEMBER",
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to add member");
			}

			const selectedUser = users.find((user) => user.id === userId);
			setSelectedUsers([...selectedUsers, selectedUser]);
			setUsers(users.filter((user) => user.id !== userId));

			router.refresh();
		} catch (error) {
			console.error("Error adding member:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleNewMember = async (e) => {
		e.preventDefault();
		setLoading(true);

		const formData = new FormData(e.target);
		const userData = {
			email: formData.get("email"),
			firstName: formData.get("firstName"),
			lastName: formData.get("lastName"),
			departmentOrOrganization: formData.get("department"),
			role: "STAKEHOLDER",
		};

		try {
			const response = await fetch(`/api/projects/${params.id}/members`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(userData),
			});

			if (!response.ok) throw new Error("Failed to add new member");

			const newMember = await response.json();
			setSelectedUsers([...selectedUsers, newMember]);
			toast("Added new member", { position: "top-center" });
			e.target.reset();
			setShowNewMemberForm(false);
			router.refresh();
		} catch (error) {
			console.error("Error adding new member:", error);
		} finally {
			setLoading(false);
		}
	};

	const closeModal = () => {
		setIsModalOpen(false);
		setShowNewMemberForm(false);
		setSelectedUsers([]);
	};

	return (
		<>
			{/* Add Member Button */}
			<button
				onClick={() => setIsModalOpen(true)}
				className="bg-indigo-500 p-1.5 rounded-md hover:bg-indigo-600 transition-colors"
			>
				<UserRoundPlus size={16} className="text-slate-50" />
			</button>

			{/* Modal */}
			{isModalOpen && (
				<div className="fixed inset-0 z-50 overflow-y-auto">
					<div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
						{/* Background overlay */}
						<div
							className="fixed inset-0 transition-opacity"
							onClick={closeModal}
						>
							<div className="absolute inset-0 bg-gray-500 opacity-75"></div>
						</div>

						{/* Modal panel */}
						<div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
							<div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
								<div className="sm:flex sm:items-start">
									<div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
										<h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
											Add Project Members
										</h3>

										{/* Existing Users Dropdown */}
										<div className="mb-6">
											<select
												className="select select-bordered w-full"
												onChange={(e) => handleAddMember(e.target.value)}
												disabled={loading}
												value=""
											>
												<option value="" disabled>
													Select existing user
												</option>
												{users.map((user) => (
													<option key={user.id} value={user.id}>
														{user.firstName} {user.lastName} - {user.email}
													</option>
												))}
											</select>
										</div>

										{/* Toggle for New Member Form */}
										<div className="mb-4">
											<button
												type="button"
												onClick={() => setShowNewMemberForm(!showNewMemberForm)}
												className="btn btn-outline btn-sm"
											>
												{showNewMemberForm
													? "Cancel New Member"
													: "Add New Member"}
											</button>
										</div>

										{/* New Member Form */}
										{showNewMemberForm && (
											<form onSubmit={handleNewMember} className="space-y-4">
												<div>
													<input
														type="email"
														name="email"
														placeholder="Email"
														required
														className="input input-bordered w-full"
													/>
												</div>
												<div className="grid grid-cols-2 gap-4">
													<input
														type="text"
														name="firstName"
														placeholder="First Name"
														required
														className="input input-bordered"
													/>
													<input
														type="text"
														name="lastName"
														placeholder="Last Name"
														required
														className="input input-bordered"
													/>
												</div>
												<div>
													<input
														type="text"
														name="department"
														placeholder="Department/Organization"
														className="input input-bordered w-full"
													/>
												</div>
												<button
													type="submit"
													className={`btn btn-primary w-full ${
														loading ? "loading" : ""
													}`}
													disabled={loading}
												>
													Add New Member
												</button>
											</form>
										)}

										{/* Recently Added Members */}
										{selectedUsers.length > 0 && (
											<div className="mt-6">
												<h4 className="text-sm font-medium text-gray-900 mb-2">
													Recently Added
												</h4>
												<div className="space-y-2">
													{selectedUsers.map((user) => (
														<div
															key={user.id}
															className="flex items-center justify-between p-2 bg-gray-50 rounded"
														>
															<span>
																{user.firstName} {user.lastName}
															</span>
															<span className="text-sm text-gray-500">
																{user.email}
															</span>
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Modal Footer */}
							<div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
								<button
									type="button"
									onClick={closeModal}
									className="btn btn-primary w-full sm:w-auto sm:ml-3"
								>
									Done
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
