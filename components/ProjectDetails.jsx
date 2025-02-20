// components/ProjectDetails.js
"use client";
import { useParams } from "next/navigation";
import Milestones from "./Milestones";
import ProjectTasks from "./Tasks";

const contentData = {
	tasks: <ProjectTasks />,
	Milestones: <Milestones />,
};

export default function ProjectDetails({ projectId }) {
	const { section } = useParams();
	const content = contentData[section] || "Page not found.";

	return (
		<div>
			<h2 className="text-xl font-bold">
				{section.charAt(0).toUpperCase() + section.slice(1)}
			</h2>
			<div>{content}</div>
		</div>
	);
}
