const Modal = ({ isOpen, onClose, children, title }) => {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
			<div className="bg-white rounded-lg shadow-lg p-6 w-96">
				{/* Modal Header */}
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-lg font-semibold">{title}</h2>
					<button
						className="text-gray-500 hover:text-gray-700"
						onClick={onClose}
					>
						✕
					</button>
				</div>

				{/* Modal Content */}
				<div>{children}</div>

				{/* Modal Footer */}
				<div className="flex justify-end mt-4">
					<button className="btn btn-secondary mr-2" onClick={onClose}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default Modal;
