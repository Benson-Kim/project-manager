import { getInitialBackgroundColor } from "@/lib/formatting";

const MemberAvatars = ({ members, maxVisible }) => {
	const displayMembers = members.slice(0, maxVisible);
	const additionalMembers = members.length - maxVisible;

	return (
		<div className="flex items-center">
			<div className="flex -space-x-2">
				{displayMembers.map((member, index) => (
					<div
						key={member.user.id}
						className={`${getInitialBackgroundColor(member.user.firstName[0])} 
                            w-8 h-8 rounded-full flex items-center justify-center 
                            text-white text-sm font-medium border-2 border-white
                            transition-transform hover:scale-110`}
						style={{ zIndex: displayMembers.length - index }}
						title={`${member.user.firstName} ${
							member.user.lastName
						} (${member.role.replace("_", " ").toLowerCase()})`}
					>
						{member.user.firstName[0]}
					</div>
				))}
				{additionalMembers > 0 && (
					<div
						className="w-8 h-8 rounded-full flex items-center justify-center 
                        bg-gray-200 text-gray-600 text-sm border-2 border-white"
						title={`${additionalMembers} more`}
					>
						+{additionalMembers}
					</div>
				)}
			</div>
		</div>
	);
};

export default MemberAvatars;
