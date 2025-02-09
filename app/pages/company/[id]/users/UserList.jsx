import { GripVertical } from "lucide-react";
import React from "react";

const UserList = () => {
	return (
		<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
			<div className="card bg-base-100 w-96 shadow-xl">
				<div className="card-body">
					<div className="card-actions justify-end">
						<button className="btn btn-square btn-sm">
							<GripVertical />
						</button>
					</div>
					<p>We are using cookies for no reason.</p>
				</div>
			</div>
		</div>
	);
};

export default UserList;
