// components/ProjectMembers.js
"use client";

import { PrismaClient } from "@prisma/client";
import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPlus, UserRoundPen, Trash2 } from "lucide-react";
import StakeholderModal from "./StakeholderModal";
import DeleteConfirmationModal from "./DeleteConfirmationModal";

const prisma = new PrismaClient();

export default function ProjectMembers({ project }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isStakeholderModalOpen, setIsStakeholderModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [selectedMember, setSelectedMember] = useState(null);
	const [memberToDelete, setMemberToDelete] = useState(null);

	async function getProject(projectId) {
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			include: {
				members: {
					include: {
						user: true,
					},
				},
			},
		});
		return project;
	}

	const handleAddStakeholder = async (formData) => {
		try {
			const response = await fetch(`/api/projects/${project.id}/members`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});

			if (!response.ok) throw new Error("Failed to add stakeholder");

			startTransition(() => {
				router.refresh();
			});
		} catch (error) {
			console.error("Error adding stakeholder:", error);
		}
	};

	const handleUpdateStakeholder = async (formData) => {
		try {
			const response = await fetch(`/api/projects/${project.id}/members`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					memberId: selectedMember.id,
					...formData,
				}),
			});

			if (!response.ok) throw new Error("Failed to update stakeholder");

			startTransition(() => {
				router.refresh();
			});
		} catch (error) {
			console.error("Error updating stakeholder:", error);
		}
	};

	const handleDeleteConfirm = async (action) => {
		try {
			const response = await fetch(`/api/projects/${project.id}/members`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					memberId: memberToDelete.id,
					action,
				}),
			});

			if (!response.ok) throw new Error("Failed to remove stakeholder");

			setIsDeleteModalOpen(false);
			setMemberToDelete(null);
			startTransition(() => {
				router.refresh();
			});
		} catch (error) {
			console.error("Error removing stakeholder:", error);
		}
	};

	return (
		<div>
			<div className="border-b border-b-slate-300 p-2.5 border-l-4 border-l-indigo-500">
				<div className="flex items-center justify-between flex-1">
					<div>
						<h3 className="font-semibold text-slate-800">
							Team Members{" "}
							{isPending ? "..." : <span>({project.members.length})</span>}
						</h3>
					</div>
					<button
						onClick={() => {
							setSelectedMember(null);
							setIsStakeholderModalOpen(true);
						}}
						className="bg-indigo-500 p-1.5 rounded-md"
						title="Invite Stakeholder"
					>
						<UserRoundPlus size={16} className="text-slate-50" />
					</button>
				</div>
			</div>

			{project.members.map((member) => (
				<div
					key={member.user.id}
					className="flex items-center justify-between p-3"
				>
					<div className="flex items-center space-x-6">
						<div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium">
							{member.user.firstName[0]}
						</div>
						<div className="ml-3">
							<p className="text-sm font-medium text-slate-900 capitalize">
								{member.user.firstName} {member.user.lastName}
							</p>
							<p className="text-sm text-slate-500">{member.role}</p>
						</div>
					</div>
					<div className="flex items-center gap-1">
						<button
							onClick={() => {
								setSelectedMember(member);
								setIsStakeholderModalOpen(true);
							}}
							className="bg-lime-500 p-2 rounded"
							title="Edit"
							disabled={isPending}
						>
							<UserRoundPen size={16} className="text-slate-50" />
						</button>
						<button
							onClick={() => {
								setMemberToDelete(member);
								setIsDeleteModalOpen(true);
							}}
							className="bg-orange-500 p-2 rounded"
							title="Remove"
							disabled={isPending}
						>
							<Trash2 size={16} className="text-slate-50" />
						</button>
					</div>
				</div>
			))}

			<StakeholderModal
				isOpen={isStakeholderModalOpen}
				onClose={() => {
					setIsStakeholderModalOpen(false);
					setSelectedMember(null);
				}}
				project={project}
				existingMember={selectedMember}
				onSubmit={
					selectedMember ? handleUpdateStakeholder : handleAddStakeholder
				}
				isPending={isPending}
			/>

			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				onClose={() => {
					setIsDeleteModalOpen(false);
					setMemberToDelete(null);
				}}
				onConfirm={handleDeleteConfirm}
				isPending={isPending}
			/>
		</div>
	);
}
