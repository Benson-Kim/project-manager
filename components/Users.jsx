import { useState, useEffect } from "react";
import { Plus, UserPlus, GripVertical, X } from "lucide-react";
import StakeholderModal from "./StakeholderModal";

export default function UsersPage() {
	const [stakeholders, setStakeholders] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [totalPages, setTotalPages] = useState(0);
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState("lastName");
	const [sortOrder, setSortOrder] = useState("asc");

	const fetchStakeholders = async () => {
		try {
			setLoading(true);
			const queryParams = new URLSearchParams({
				page: currentPage.toString(),
				limit: "10",
				search: search || "",
				sortBy: sortBy || "lastName",
				sortOrder: sortOrder || "asc",
			});

			const response = await fetch(`/api/stakeholders?${queryParams}`);

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || "Failed to fetch stakeholders");
			}

			const data = await response.json();

			setStakeholders(data.stakeholders);
			setTotalPages(data.totalPages);
		} catch (error) {
			setError(error.message);
			console.error("Error fetching stakeholders:", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchStakeholders();
	}, [currentPage, search, sortBy, sortOrder]);

	const handleSort = (field) => {
		if (sortBy === field) {
			setSortOrder(sortOrder === "asc" ? "desc" : "asc");
		} else {
			setSortBy(field);
			setSortOrder("asc");
		}
	};

	const SortIcon = ({ field }) => {
		if (sortBy !== field) return null;
		return <span>{sortOrder === "asc" ? "↑" : "↓"}</span>;
	};

	if (loading) {
		return (
			<div className="flex justify-center p-8">Loading stakeholders...</div>
		);
	}

	if (error) {
		return <div className="text-red-500 p-4">{error}</div>;
	}

	return (
		<div className="p-6 space-y-6">
			{/* Breadcrumbs & Invite Button */}
			<div className="flex justify-between items-center">
				<div className="breadcrumbs text-sm">
					<ul className="flex gap-2">
						<li>
							<a href="/dashboard" className="text-indigo-500">
								Home
							</a>
						</li>
						<li className="text-slate-700 font-medium">Users</li>
					</ul>
				</div>

				<div className="flex justify-between items-center">
					<input
						type="text"
						placeholder="Search stakeholders..."
						className="input input-bordered w-full max-w-xs"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>

				<div>
					<button
						onClick={() => document.getElementById("my_modal_2").showModal()}
						data-tip="Invite"
						className="btn btn-sm btn-primary flex items-center gap-2 tooltip rounded-md "
					>
						<Plus size={16} />
					</button>
					<StakeholderModal />
				</div>
			</div>

			{/* User Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-3 2xl:grid-cols-4 4xl:grid-cols-5 max-w-6xl gap-6">
				{stakeholders.map((stakeholder) => (
					<div
						key={stakeholder.id}
						className="card bg-base-100 shadow-md rounded-lg"
					>
						<div className="flex justify-between border-b p-4">
							<span
								className={`text-xs font-light px-2.5 py-0.5 rounded text-center text-slate-50 ${
									stakeholder.userType === "Admin"
										? "bg-indigo-500"
										: "bg-emerald-500"
								}`}
							>
								{stakeholder.userType}
							</span>
							<GripVertical className="cursor-pointer" size={20} />
						</div>
						<div className="flex flex-col items-center mt-4">
							<div className="avatar w-14 h-14 rounded-lg bg-slate-300 border border-indigo-500 flex items-center justify-center text-xl font-bold m-4 uppercase">
								{/* {stakeholder.avatar ? (
									<img
										src={stakeholder.avatar}
										alt="avatar"
										className="rounded-full"
									/>
								) : ( */}
								{stakeholder.firstName.slice(0, 1)}
								{stakeholder.lastName.slice(0, 1)}
								{/* )} */}
							</div>
							<p className="mt-2 font-semibold">
								{stakeholder.firstName} {stakeholder.lastName}
							</p>
							<p className="mt-2 text-slate-500 text-sm ">
								{stakeholder.email}
							</p>
						</div>
						<div className="flex justify-between text-sm  mt-4 p-4">
							<p className="flex flex-col gap-1 items-center text-slate-500">
								<span className="font-semibold text-slate-900">
									{stakeholder._count.memberships}
								</span>
								Projects
							</p>
							<p className="flex flex-col gap- items-center text-slate-500">
								<span className="font-semibold text-slate-900">
									{stakeholder._count.assignments}
								</span>
								Tasks
							</p>
						</div>
					</div>
				))}

				{/* Invite User Card */}
				<div>
					<div
						className="card bg-base-100 rounded-lg shadow-md p-4 cursor-pointer hover:bg-slate-50 flex flex-col items-center justify-center border border-indigo-300 hover:border-indigo-500"
						onClick={() => document.getElementById("my_modal_2").showModal()}
					>
						<UserPlus size={32} className="text-slate-500" />
						<p className="mt-2 font-semibold">Invite User</p>
						<span className="text-sm text-slate-500">
							(Click to invite user)
						</span>
						<StakeholderModal />
					</div>
				</div>
			</div>
			<div className="flex justify-between items-center">
				<div>
					Page {currentPage} of {totalPages}
				</div>
				<div className="join">
					<button
						className="join-item btn"
						onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
						disabled={currentPage === 1}
					>
						Previous
					</button>
					<button
						className="join-item btn"
						onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
						disabled={currentPage === totalPages}
					>
						Next
					</button>
				</div>
			</div>
		</div>
	);
}
