// app/projects/[id]/page.js
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { differenceInCalendarDays, differenceInDays, format } from "date-fns";
import {
	Pencil,
	Calendar,
	Users,
	ListTodo,
	MessageSquare,
	CircleDollarSign,
	Trash2,
	CalendarClock,
	Banknote,
	MessagesSquare,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Permissions } from "@/lib/permissions";
import Link from "next/link";

export default function ProjectDetailsPage() {
	const params = useParams();
	const router = useRouter();
	const { data: session } = useSession();
	const { can } = usePermissions();
	const [project, setProject] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [activeTab, setActiveTab] = useState("overview");

	useEffect(() => {
		fetchProjectDetails();
	}, [params.id]);

	const fetchProjectDetails = async () => {
		try {
			const response = await fetch(`/api/projects/${params.id}`);
			if (!response.ok) {
				throw new Error("Failed to fetch project details");
			}
			const data = await response.json();
			setProject(data);
		} catch (error) {
			console.error("Error fetching project:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const calculateProgress = () => {
		if (!project?.tasks?.length) return 0;
		const completedTasks = project.tasks.filter(
			(task) => task.status === "COMPLETED"
		).length;
		return Math.round((completedTasks / project.tasks.length) * 100);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen">
				<h1 className="text-2xl font-semibold text-slate-800">
					Project not found
				</h1>
				<button
					onClick={() => router.push("/projects")}
					className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
				>
					Return to Projects
				</button>
			</div>
		);
	}

	const getStatusColor = (status) => {
		switch (status) {
			case "IN_PROGRESS":
				return "bg-blue-100 text-blue-800";
			case "COMPLETED":
				return "bg-green-100 text-green-800";
			case "ON_HOLD":
				return "bg-yellow-100 text-yellow-800";
			default:
				return "bg-slate-100 text-slate-800";
		}
	};

	return (
		<div className="p-6 space-y-6">
			{/* Breadcrumbs */}
			<div className="flex justify-between items-center">
				<div className="breadcrumbs text-sm">
					<ul className="flex gap-2">
						<li>
							<a href="/dashboard" className="text-indigo-500">
								Home
							</a>
							<a href="/dashboard/projects" className="text-indigo-500">
								Projects
							</a>
						</li>
						<li className="text-slate-700 font-medium">{project.name}</li>
					</ul>
				</div>
				<div className="flex gap-4 items-center">
					<Link
						href={`/projects/${project.id}/expenses`}
						className="bg-indigo-500 rounded h-5 w-5 tooltip"
						data-tip="Expenses"
					>
						<CircleDollarSign className="" />
					</Link>
					<Link
						href={`/projects/${project.id}/expenses`}
						className="bg-indigo-500 rounded h-5 w-5 tooltip"
						data-tip="Expenses"
					>
						<CircleDollarSign className="" />
					</Link>
					<Link
						href={`/projects/${project.id}/expenses`}
						className="bg-indigo-500 rounded h-5 w-5 tooltip"
						data-tip="Expenses"
					>
						<CircleDollarSign className="" />
					</Link>
					{can(Permissions.EDIT_PROJECT) && (
						<Link
							href={`/projects/${project.id}/expenses`}
							className="bg-indigo-500 rounded p-1.5 tooltip"
							data-tip="Expenses"
						>
							<CircleDollarSign className="text-slate-50" />
						</Link>
					)}
				</div>
			</div>

			{/* Header Section */}
			<div className="bg-indigo-400 rounded-lg shadow-sm px-6 py-4 mb-6">
				<div className="flex justify-between items-center">
					<div className="flex flex-col space-y-4">
						<h1 className="text-3xl font-bold text-slate-50">{project.name}</h1>
						{/* Progress bar */}
						<div className="mt-6">
							<div className="flex justify-between items-center mb-2">
								<span className="text-sm font-medium text-slate-50">
									Progress
								</span>
								<span className="text-sm text-slate-800">
									{calculateProgress()}%
								</span>
							</div>
							<div className="w-full bg-slate-50 rounded-full h-2.5">
								<div
									className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
									style={{ width: `${calculateProgress()}%` }}
								></div>
							</div>
						</div>
					</div>
					<div className="space-y-4">
						<div className="flex items-center space-x-6 text-slate-600">
							<span className="flex items-center">
								<Calendar className="h-4 w-4 mr-2" />
								Due {format(new Date(project.endDate), "MMM d, yyyy")}
							</span>
							<span
								className={`px-3 py-1 rounded-full text-sm ${getStatusColor(
									project.status
								)}`}
							>
								{project.status.replace(/_/g, " ")}
							</span>
						</div>
					</div>

					<div className="flex items-center space-x-2">
						{project.members.slice(0, 3).map((member) => (
							<div
								key={member.user.id}
								className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600"
								title={`${member.user.firstName} ${member.user.lastName}`}
							>
								{member.user.firstName[0]}
							</div>
						))}
						{project.members.length > 3 && (
							<div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm text-slate-600">
								+{project.members.length - 3}
							</div>
						)}
					</div>
					{can(Permissions.EDIT_PROJECT) && (
						<div className="flex items-center justify-between space-x-4">
							<button
								onClick={() => router.push(`/projects/${project.id}/edit`)}
								data-tip="Edit"
								className="tooltip flex items-center p-3 rounded bg-slate-200 hover:bg-slate-400 text-slate-700 hover:text-slate-50"
							>
								<Pencil size={16} className="" />
							</button>
							<button
								onClick={() => router.push(`/projects/${project.id}/edit`)}
								data-tip="Delete"
								className="tooltip flex items-center p-3  rounded bg-slate-200 hover:bg-slate-400 text-slate-700 hover:text-slate-50"
							>
								<Trash2 size={16} className="" />
							</button>
						</div>
					)}
				</div>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
				<div className="flex justify-between items-center px-6 py-4 rounded-lg shadow-md">
					<div className="flex items-center justify-center p-2.5 bg-lime-500 rounded-md">
						<CalendarClock size={24} className="text-slate-50" />
					</div>
					<div className="flex flex-col space-y-1 items-end">
						<p className="text-slate-500 font-semibold tracking-tighter">
							Days left
						</p>
						<span className="text-slate-800 font-semibold">
							{differenceInDays(project.endDate, project.startDate)}
						</span>
					</div>
				</div>
				<div className="flex justify-between items-center px-6 py-4 rounded-lg shadow-md">
					<div className="flex items-center justify-center p-2.5 bg-cyan-500 rounded-md">
						<Banknote size={28} className="text-slate-50" />
					</div>
					<div className="flex flex-col space-y-1 items-end">
						<p className="text-slate-500 font-semibold tracking-tighter">
							Budget
						</p>
						<span className="text-slate-800 font-semibold">
							{project.budget}
						</span>
					</div>
				</div>
				<div className="flex justify-between items-center px-6 py-4 rounded-lg shadow-md">
					<div className="flex items-center justify-center p-2.5 bg-pink-600 rounded-md">
						<ListTodo size={24} className="text-slate-50" />
					</div>
					<div className="flex flex-col space-y-1 items-end">
						<p className="text-slate-500 font-semibold tracking-tighter">
							Total task
						</p>
						<span className="text-slate-800 font-semibold">239</span>
					</div>
				</div>
				<div className="flex justify-between items-center px-6 py-4 rounded-lg shadow-md">
					<div className="flex items-center justify-center p-2.5 bg-indigo-600 rounded-md">
						<MessagesSquare size={24} className="text-slate-50" />
					</div>
					<div className="flex flex-col space-y-1 items-end">
						<p className="text-slate-500 font-semibold tracking-tighter">
							Comments
						</p>
						<span className="text-slate-800 font-semibold">239</span>
					</div>
				</div>
			</div>

			{/* Tabs Navigation */}
			<div className="border-b border-slate-200 mb-6">
				<nav className="flex space-x-8">
					{["overview", "tasks", "meetings", "files"].map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`py-4 px-1 border-b-2 font-medium text-sm ${
								activeTab === tab
									? "border-indigo-500 text-indigo-600"
									: "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
							}`}
						>
							{tab.charAt(0).toUpperCase() + tab.slice(1)}
						</button>
					))}
				</nav>
			</div>

			{/* Tab Content */}
			<div className="bg-white rounded-lg shadow-sm p-6">
				{activeTab === "overview" && (
					<div className="space-y-6">
						<div>
							<h3 className="text-lg font-semibold mb-2">Description</h3>
							<p className="text-slate-600">
								{project.description || "No description provided."}
							</p>
						</div>

						<div>
							<h3 className="text-lg font-semibold mb-2">Key Details</h3>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-sm text-slate-500">Start Date</p>
									<p className="text-slate-900">
										{format(new Date(project.startDate), "MMM d, yyyy")}
									</p>
								</div>
								<div>
									<p className="text-sm text-slate-500">End Date</p>
									<p className="text-slate-900">
										{format(new Date(project.endDate), "MMM d, yyyy")}
									</p>
								</div>
							</div>
						</div>

						<div>
							<h3 className="text-lg font-semibold mb-2">Team Members</h3>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								{project.members.map((member) => (
									<div
										key={member.user.id}
										className="flex items-center p-3 bg-slate-50 rounded-lg"
									>
										<div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium">
											{member.user.firstName[0]}
										</div>
										<div className="ml-3">
											<p className="text-sm font-medium text-slate-900">
												{member.user.firstName} {member.user.lastName}
											</p>
											<p className="text-sm text-slate-500">{member.role}</p>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				)}

				{activeTab === "tasks" && (
					<div>
						<div className="flex justify-between items-center mb-4">
							<h3 className="text-lg font-semibold">Tasks</h3>
							{can(Permissions.CREATE_TASK) && (
								<button
									onClick={() =>
										router.push(`/projects/${project.id}/tasks/new`)
									}
									className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
								>
									Add Task
								</button>
							)}
						</div>
						{project.tasks.length > 0 ? (
							<div className="space-y-4">
								{project.tasks.map((task) => (
									<div key={task.id} className="border rounded-lg p-4">
										<div className="flex justify-between items-start">
											<div>
												<h4 className="text-lg font-medium">{task.title}</h4>
												<p className="text-slate-600 mt-1">
													{task.description}
												</p>
											</div>
											<span
												className={`px-3 py-1 rounded-full text-sm ${getStatusColor(
													task.status
												)}`}
											>
												{task.status.replace(/_/g, " ")}
											</span>
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-slate-500 text-center py-8">
								No tasks have been created yet.
							</p>
						)}
					</div>
				)}

				{activeTab === "meetings" && (
					<div>
						<div className="flex justify-between items-center mb-4">
							<h3 className="text-lg font-semibold">Meetings</h3>
							<button className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors">
								Schedule Meeting
							</button>
						</div>
						{project.Meeting && project.Meeting.length > 0 ? (
							<div className="space-y-4">
								{project.Meeting.map((meeting) => (
									<div key={meeting.id} className="border rounded-lg p-4">
										<h4 className="text-lg font-medium">{meeting.title}</h4>
										<p className="text-slate-600 mt-1">
											{format(
												new Date(meeting.scheduledFor),
												"MMM d, yyyy 'at' h:mm a"
											)}
										</p>
									</div>
								))}
							</div>
						) : (
							<p className="text-slate-500 text-center py-8">
								No meetings scheduled.
							</p>
						)}
					</div>
				)}

				{activeTab === "files" && (
					<div>
						<h3 className="text-lg font-semibold mb-4">Files & Documents</h3>
						<p className="text-slate-500 text-center py-8">
							No files uploaded yet.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
