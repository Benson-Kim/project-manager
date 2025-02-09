"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Users,
	Package,
	Settings,
	ShoppingCart,
	BarChart,
	User,
	PieChart,
	LifeBuoy,
	CreditCard,
	Bell,
} from "lucide-react";

// Define sidebar menu items with icons
const menuItems = [
	{ name: "users", label: "Users", icon: Users },
	{ name: "projects", label: "Projects", icon: Package },
	{ name: "settings", label: "Settings", icon: Settings },
	{ name: "orders", label: "Orders", icon: ShoppingCart },
	{ name: "reports", label: "Reports", icon: BarChart },
	{ name: "stakeholders", label: "Stakeholders", icon: User },
	{ name: "analytics", label: "Analytics", icon: PieChart },
	{ name: "support", label: "Support", icon: LifeBuoy },
	{ name: "billing", label: "Billing", icon: CreditCard },
	{ name: "notifications", label: "Notifications", icon: Bell },
];

const Sidebar = () => {
	const pathname = usePathname();
	return (
		<div className=" flex flex-col w-64 bg-base-200 h-full border-r">
			<div className="flex items-center justify-center h-14 p-4 border-b">
				<div>Project Management System</div>
			</div>
			<div className="overflow-y-auto overflow-x-hidden flex-grow p-4">
				<ul className="flex flex-col py-4 space-y-1">
					{menuItems.map(({ name, label, icon: Icon }) => (
						<li key={name}>
							<Link
								href={`/dashboard/${name}`}
								className={`relative flex flex-row items-center h-11 focus:outline-none hover:bg-slate-50 text-slate-600 hover:text-slate-800 border-l-4 border-transparent hover:border-indigo-500 pr-6 ${
									pathname.includes(name)
										? "border-indigo-500 bg-slate-50 text-slate-800"
										: ""
								}`}
							>
								<span className="inline-flex justify-center items-center ml-4">
									<Icon size={20} />
								</span>
								<span className="ml-2 text-sm tracking-wide truncate">
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
