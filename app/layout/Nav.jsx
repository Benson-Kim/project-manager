"use client";
import { Bell, BellDot, MessageCircleMore, Waypoints } from "lucide-react";
import { useState } from "react";

const Navbar = () => {
	const [notifications, setNotifications] = useState([]);
	return (
		<nav className="flex items-center justify-between px-8 py-2 bg-base-200 h-14 border-b">
			<ul></ul>
			<ul className="menu lg:menu-horizontal">
				<li className="">
					<a>
						<MessageCircleMore className="text-indigo-700" /> Inbox
						<span className="badge badge-sm">99+</span>
					</a>
				</li>
				<li>
					<a>
						{notifications.length > 0 ? (
							<BellDot className="text-indigo-700" />
						) : (
							<Bell className="text-indigo-700" />
						)}
						Updates
						<span className="badge badge-sm badge-warning">NEW</span>
					</a>
				</li>
				<li>
					<a>
						<Waypoints className="text-indigo-700" />
						<span className="badge badge-xs badge-info"></span>
					</a>
				</li>
			</ul>
		</nav>
	);
};

export default Navbar;
