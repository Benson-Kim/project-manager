// components/ProjectDeleteModal.jsx
import { AlertTriangle } from "lucide-react";

export default function ProjectDeleteModal({
	title,
	message,
	isOpen,
	isProcessing,
	onClose,
	onConfirm,
}) {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
			<div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
				<div className="flex items-center mb-4 text-red-600">
					<AlertTriangle className="mr-2" size={24} />
					<h2 className="text-xl font-bold">{title}</h2>
				</div>

				<p className="mb-6 text-gray-700">{message}</p>

				<div className="flex justify-end space-x-4">
					<button
						onClick={onClose}
						disabled={isProcessing}
						className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						disabled={isProcessing}
						className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
					>
						{isProcessing ? "Deleting..." : "Delete"}
					</button>
				</div>
			</div>
		</div>
	);
}
