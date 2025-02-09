//components/Projects.jsx

import ProjectsPage from "@/components/Projects";
import { Plus } from "lucide-react";

const Projects = () => {
	return (
		<div>
			<div className="flex items-center justify-between">
				<p>Projects</p>
				<button
					className="btn btn-sm btn-primary flex items-center gap-2 tooltip rounded-md "
					data-tip="Invite"
					onClick={() => document.getElementById("my_modal_2").showModal()}
				>
					<Plus size={16} />
				</button>
			</div>
			<ProjectsPage />
		</div>
	);
};

export default Projects;
