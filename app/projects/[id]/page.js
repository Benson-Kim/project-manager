// app/projects/[id]/page.js
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import {
	Calendar,
	Users,
	Milestone,
	Target,
	FileText,
	MessageCircle,
	HelpCircle,
	Building,
	AlertTriangle,
	DollarSign,
	Settings,
	Pencil,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Permissions } from "@/lib/permissions";

export default function ProjectDetailsPage() {
	const params = useParams();
	const router = useRouter();
	const { data: session } = useSession();
	const { can } = usePermissions();
	const [project, setProject] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [activeSection, setActiveSection] = useState("overview");

	useEffect(() => {
		fetchProjectDetails();
	}, [params.id]);

	const fetchProjectDetails = async () => {
		try {
			const response = await fetch(`/api/projects/${params.id}`);
			if (!response.ok) throw new Error("Failed to fetch project details");
			const data = await response.json();
			setProject(data);
		} catch (error) {
			console.error("Error fetching project:", error);
		} finally {
			setIsLoading(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
			</div>
		);
	}

	const sections = [
		{
			id: "overview",
			label: "Overview",
			icon: FileText,
			content: (
				<div className="space-y-6">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="bg-white p-6 rounded-lg shadow-sm">
							<h3 className="text-lg font-semibold mb-4">Project Overview</h3>
							<div className="space-y-4">
								<div>
									<h4 className="text-sm font-medium text-gray-500">
										Description
									</h4>
									<p className="mt-1">{project?.description}</p>
								</div>
								<div>
									<h4 className="text-sm font-medium text-gray-500">
										Objectives
									</h4>
									<ul className="mt-1 space-y-2">
										{project?.objectives?.map((objective, index) => (
											<li key={index} className="flex items-start">
												<span className="mr-2">•</span>
												{objective}
											</li>
										))}
									</ul>
								</div>
							</div>
						</div>
						<div className="bg-white p-6 rounded-lg shadow-sm">
							<h3 className="text-lg font-semibold mb-4">Key Dates</h3>
							<div className="space-y-4">
								<div className="flex justify-between">
									<span className="text-gray-500">Start Date</span>
									<span>
										{format(new Date(project?.startDate), "MMM d, yyyy")}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-gray-500">End Date</span>
									<span>
										{format(new Date(project?.endDate), "MMM d, yyyy")}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			),
		},
		{
			id: "planning",
			label: "Planning",
			icon: Target,
			content: (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Milestones</h3>
						{/* Milestones content */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">
							Work Breakdown Structure
						</h3>
						{/* WBS content */}
					</div>
				</div>
			),
		},
		{
			id: "stakeholders",
			label: "Stakeholders & Team",
			icon: Users,
			content: (
				<div className="grid grid-cols-1 gap-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Project Team</h3>
						{/* Team members grid */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Stakeholders</h3>
						{/* Stakeholders list */}
					</div>
				</div>
			),
		},
		{
			id: "documentation",
			label: "Documentation",
			icon: FileText,
			content: (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Key Requirements</h3>
						{/* Requirements content */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Deliverables</h3>
						{/* Deliverables content */}
					</div>
				</div>
			),
		},
		{
			id: "meetings",
			label: "Meetings",
			icon: MessageCircle,
			content: (
				<div className="space-y-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Upcoming Meetings</h3>
						{/* Upcoming meetings list */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Meeting Minutes</h3>
						{/* Meeting minutes list */}
					</div>
				</div>
			),
		},
		{
			id: "resources",
			label: "Resources",
			icon: Settings,
			content: (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">IT Resources</h3>
						{/* IT resources content */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Suppliers</h3>
						{/* Suppliers content */}
					</div>
				</div>
			),
		},
		{
			id: "financials",
			label: "Financials",
			icon: DollarSign,
			content: (
				<div className="space-y-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Budget Tracking</h3>
						{/* Budget tracking content */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Financial Documents</h3>
						{/* Financial documents list */}
					</div>
				</div>
			),
		},
		{
			id: "risks",
			label: "Risks & Issues",
			icon: AlertTriangle,
			content: (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Active Issues</h3>
						{/* Issues list */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Risk Register</h3>
						{/* Risk register content */}
					</div>
				</div>
			),
		},
		{
			id: "reference",
			label: "Reference",
			icon: HelpCircle,
			content: (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Q&A</h3>
						{/* Q&A content */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Acronyms</h3>
						{/* Acronyms list */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">
							Assumptions & Constraints
						</h3>
						{/* Assumptions and constraints content */}
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-4">Parking Lot Items</h3>
						{/* Parking lot items list */}
					</div>
				</div>
			),
		},
	];

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div className="bg-white border-b">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
					<div className="flex justify-between items-center">
						<div>
							<h1 className="text-2xl font-bold text-gray-900">
								{project?.name}
							</h1>
							<div className="flex items-center mt-1 text-sm text-gray-500">
								<Calendar className="h-4 w-4 mr-1" />
								<span>
									Due {format(new Date(project?.endDate), "MMM d, yyyy")}
								</span>
							</div>
						</div>
						{can(Permissions.EDIT_PROJECT) && (
							<button
								onClick={() => router.push(`/projects/${project.id}/edit`)}
								className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
							>
								<Pencil className="h-4 w-4 mr-2" />
								Edit Project
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Navigation */}
			<div className="bg-white border-b">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<nav className="flex space-x-8 overflow-x-auto">
						{sections.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								onClick={() => setActiveSection(id)}
								className={`flex items-center px-1 py-4 border-b-2 text-sm font-medium ${
									activeSection === id
										? "border-indigo-500 text-indigo-600"
										: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
								}`}
							>
								<Icon className="h-4 w-4 mr-2" />
								{label}
							</button>
						))}
					</nav>
				</div>
			</div>

			{/* Content */}
			<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{sections.find((section) => section.id === activeSection)?.content}
			</main>
		</div>
	);
}
