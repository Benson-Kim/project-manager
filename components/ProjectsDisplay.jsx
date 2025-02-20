import { statusColors } from "@/lib/formatting";
import { format } from "date-fns";
import { Edit, EllipsisVertical, Folder, Trash2 } from "lucide-react";
import Link from "next/link";

export const ItemsList = ({ item, type, onEdit, onDelete }) => {
	const { id, name, endDate, status, members = [], tasks = [] } = item;

	return (
		<div className="flex flex-row items-center justify-between p-2 sm:px-4 sm:py-3 sm:border-b border-gray-300 first:sm:border-t sm:hover:bg-gray-200 transition-all cursor-pointer">
			<div className="flex flex-row flex-1 items-center gap-6">
				<button>
					<Folder />
				</button>
				<div className="flex-1 flex flex-col gap-2 sm:flex-row sm:gap-4">
					<Link
						href={`/${type}/${id}`}
						className="text-lg font-semibold cursor-pointer"
					>
						{name}
					</Link>
					{endDate && (
						<p className="text-sm text-gray-500">
							Due <span>{format(new Date(endDate), "MMM d, yyyy")}</span>
						</p>
					)}
				</div>
				{status && (
					<span
						className={`${statusColors[status]} text-white text-xs py-2 px-3 rounded-full`}
					>
						{status.replace("_", " ")}
					</span>
				)}
				<div className="hidden sm:flex">
					<div className="flex items-center -space-x-3">
						{members.slice(0, 5).map((member, index) => (
							<div
								key={member.id}
								className="w-8 h-8 rounded-full border-2 border-white shadow bg-gray-200 text-xs flex items-center justify-center"
								style={{ zIndex: members.length - index }}
							>
								{member.name?.charAt(0).toUpperCase() || "?"}
							</div>
						))}
						{members.length > 5 && (
							<span className="w-8 h-8 bg-gray-200 text-xs font-semibold flex items-center justify-center rounded-full border-2 border-white">
								+{members.length - 5}
							</span>
						)}
					</div>
				</div>
			</div>
			<button onClick={() => onDelete(id)}>
				<EllipsisVertical />
			</button>
		</div>
	);
};

export const ItemsGrid = ({ item, type, onEdit, onDelete }) => {
	const { id, name, endDate, status, members = [], tasks = [] } = item;
	const displayMembers = members.slice(0, 5);
	const additionalMembers = members.length - 5;

	return (
		<div className="bg-white rounded-lg shadow p-6 space-y-4 relative group cursor-pointer">
			<div className="absolute right-2 top-2 hidden group-hover:flex gap-2">
				<button
					onClick={(e) => {
						e.stopPropagation();
						onEdit(item);
					}}
					className="p-1 hover:bg-gray-100 rounded"
				>
					<Edit className="w-4 h-4 text-gray-500" />
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onDelete(id);
					}}
					className="p-1 hover:bg-gray-100 rounded"
				>
					<Trash2 className="w-4 h-4 text-red-500" />
				</button>
			</div>

			<div className="flex justify-between items-start">
				<Link
					href={`/${type}/${id}`}
					className="text-lg font-semibold cursor-pointer"
				>
					{name}
				</Link>
				{status && (
					<span
						className={`${statusColors[status]} text-white text-sm px-3 py-1 rounded-full`}
					>
						{status.replace("_", " ")}
					</span>
				)}
			</div>

			{endDate && (
				<p className="text-sm text-gray-500">
					Due: {format(new Date(endDate), "MMM d, yyyy")}
				</p>
			)}

			<div className="flex items-center">
				<div className="flex -space-x-2">
					{displayMembers.map((member, index) => (
						<div
							key={member.id}
							className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 text-xs font-medium border-2 border-white"
						>
							{member.name?.charAt(0).toUpperCase() || "?"}
						</div>
					))}
					{additionalMembers > 0 && (
						<div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 text-xs border-2 border-white">
							+{additionalMembers}
						</div>
					)}
				</div>
			</div>

			<div className="flex justify-between text-sm text-gray-500">
				{tasks.length > 0 && (
					<>
						<span>{tasks.length} tasks</span>
						<span>
							{tasks.filter((t) => t.status === "COMPLETED").length} completed
						</span>
					</>
				)}
			</div>
		</div>
	);
};
