// app/dashboard/[section]/page.js
"use client";
import Stakeholders from "@/app/projects/[id]/Stakeholders";
import ProjectsPage from "@/components/Projects";
import UsersPage from "@/components/Users";
import { useParams } from "next/navigation";

const contentData = {
	users: <UsersPage />,
	projects: <ProjectsPage />,
	settings: "Adjust application settings.",
	reports: "View business reports.",
	stakeholders: <Stakeholders />,
	analytics: "Analyze your sales and traffic.",
	support: "Handle customer support tickets.",
};

export default function SectionPage() {
	const { section } = useParams();
	const content = contentData[section] || "Page not found.";

	return (
		<div className="px-8 pt-8 h-screen overflow-auto ">
			<h2 className="text-xl font-bold">
				{section.charAt(0).toUpperCase() + section.slice(1)}
			</h2>

			<div>{content}</div>
		</div>
	);
}
