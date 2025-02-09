import { UserPlus } from "lucide-react";
import UserList from "./UserList";

const Users = () => {
	return (
		<div>
			<div className="flex items-center justify-between">
				<div className="breadcrumbs text-sm">
					<ul>
						<li>
							<a>Home</a>
						</li>
						<li>
							<a>users</a>
						</li>
					</ul>
				</div>
				<div className="tooltip tooltip-open tooltip-top" data-tip="Invite">
					<button className="btn">
						<UserPlus />
						Invite
					</button>
				</div>
			</div>
			<UserList />
		</div>
	);
};

export default Users;
