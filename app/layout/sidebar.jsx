"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
	Users,
	Package,
	Settings,
	BarChart,
	User,
	PieChart,
	LifeBuoy,
} from "lucide-react";

// Define sidebar menu items with icons
const menuItems = [
	{ name: "users", label: "Users", icon: Users },
	{ name: "projects", label: "Projects", icon: Package },
	{ name: "settings", label: "Settings", icon: Settings },
	{ name: "reports", label: "Reports", icon: BarChart },
	{ name: "stakeholders", label: "Stakeholders", icon: User },
	{ name: "analytics", label: "Analytics", icon: PieChart },
	{ name: "support", label: "Support", icon: LifeBuoy },
];

const projectMenu = [
	{ name: "stakeholders", label: "Stakeholders" },
	{ name: "acronyms", label: "Acronyms" },
	{ name: "keyreqdeliverables", label: "Key Deliverables" },
	{ name: "objectives", label: "objectives" },
	{ name: "questions&answers", label: "Questions & Answers" },
	{ name: "suppliers", label: "Auppliers" },
	{ name: "assumptions&constraints", label: "Assumptions & Constraints" },
	{ name: "Parking&lot&items", label: "Parking Lot Items" },
	{ name: "IT&resources&planning", label: "IT Resources Planning" },
	{ name: "financials", label: "Financials" },
	{ name: "issues&risks", label: "Issues Risks" },
	{ name: "tasks", label: "tasks" },
	{ name: "dailyactivitylist", label: "Daily Activity List" },
	{ name: "milestones", label: "Milestones" },
	{ name: "comments", label: "Comments" },
	{ name: "notes", label: "Notes" },
];

const Sidebar = () => {
	const pathname = usePathname();
	const params = useParams();
	const isProjectRoute = pathname?.startsWith("/projects/");

	return (
		<div className=" flex flex-col w-64 bg-base-200 h-full border-r">
			<div className="flex items-center justify-center h-14 p-4 border-b">
				<div>Project Management System</div>
			</div>
			<div className="overflow-y-auto overflow-x-hidden flex-grow p-4">
				<ul className="flex flex-col py-4 space-y-1">
					{isProjectRoute
						? projectMenu.map(({ name, label }) => (
								<li key={name}>
									<Link
										href={`/projects/${params.id}/${name}`}
										className={`relative flex flex-row items-center h-11 focus:outline-none hover:bg-slate-50 text-slate-600 hover:text-slate-800 border-l-4 border-opacity-0 hover:border-indigo-500 pr-6 ${
											pathname.includes(name)
												? "border-indigo-500 bg-slate-50 text-slate-800 border-opacity-100"
												: ""
										}`}
									>
										<span className="ml-2 text-sm tracking-wide truncate capitalize">
											{label}
										</span>
									</Link>
								</li>
						  ))
						: menuItems.map(({ name, label, icon: Icon }) => (
								<li key={name}>
									<Link
										href={`/dashboard/${name}`}
										className={`relative flex flex-row items-center h-11 focus:outline-none hover:bg-slate-50 text-slate-600 hover:text-slate-800 border-l-4 border-opacity-0 hover:border-indigo-500 pr-6 ${
											pathname.includes(name)
												? "border-indigo-500 bg-slate-50 text-slate-800 border-opacity-100"
												: ""
										}`}
									>
										<span className="inline-flex justify-center items-center ml-4">
											<Icon size={20} />
										</span>
										<span className="ml-2 text-sm tracking-wide truncate capitalize">
											{label}
										</span>
									</Link>
								</li>
						  ))}
				</ul>
			</div>
		</div>
	);
};

export default Sidebar;
