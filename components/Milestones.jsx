import React, { useState, useEffect } from "react";
import { Calendar, Clock, DollarSign, User, BarChart2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatting";

export default function Milestones({ projectId }) {
	const [milestones, setMilestones] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchMilestones = async () => {
			try {
				const response = await fetch(`/api/projects/${projectId}/milestones`);
				if (!response.ok) throw new Error("Failed to fetch milestones");
				const data = await response.json();
				setMilestones(data);
			} catch (err) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		};

		fetchMilestones();
	}, [projectId]);

	if (loading)
		return <div className="flex justify-center p-8">Loading milestones...</div>;
	if (error) return <div className="text-red-500 p-4">Error: {error}</div>;

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-center">
				<h2 className="text-2xl font-bold">Project Milestones</h2>
				<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
					Add Milestone
				</button>
			</div>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{milestones.map((milestone) => (
					<div
						key={milestone.id}
						className="bg-white rounded-lg shadow-md overflow-hidden"
					>
						<div className="p-6">
							<div className="flex justify-between items-start mb-4">
								<h3 className="text-xl font-semibold">{milestone.name}</h3>
								<span
									className={`px-3 py-1 rounded-full text-sm ${
										statusColors[milestone.status]
									}`}
								>
									{milestone.status}
								</span>
							</div>

							<p className="text-gray-600 mb-4">{milestone.description}</p>

							<div className="space-y-3">
								<div className="flex items-center text-gray-600">
									<User className="w-5 h-5 mr-2" />
									<span>
										{milestone.leader.firstName} {milestone.leader.lastName}
									</span>
								</div>

								<div className="flex items-center text-gray-600">
									<Calendar className="w-5 h-5 mr-2" />
									<span>
										{formatDate(milestone.startDate)} -{" "}
										{formatDate(milestone.endDate)}
									</span>
								</div>

								<div className="flex items-center text-gray-600">
									<DollarSign className="w-5 h-5 mr-2" />
									<span>{formatCurrency(milestone.budget)}</span>
								</div>

								<div className="flex items-center text-gray-600">
									<Clock className="w-5 h-5 mr-2" />
									<span>{milestone.tasks?.length || 0} tasks</span>
								</div>

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="text-sm text-gray-600">Progress</span>
										<span className="text-sm font-medium">
											{milestone.progress}%
										</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className="bg-blue-600 h-2 rounded-full"
											style={{ width: `${milestone.progress}%` }}
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
