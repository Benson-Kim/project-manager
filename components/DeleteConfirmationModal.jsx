const DeleteConfirmationModal = ({ item, onConfirm, onCancel }) => {
	const handleDelete = () => {
		onConfirm(item.id);
	};

	return (
		<div className="modal modal-open">
			<div className="modal-box">
				<h3 className="font-bold text-lg">Confirm Delete</h3>
				<p className="py-4">
					Are you sure you want to delete this item? This action cannot be
					undone.
				</p>
				<div className="modal-action">
					<button className="btn btn-error" onClick={handleDelete}>
						Delete
					</button>
					<button className="btn" onClick={onCancel}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default DeleteConfirmationModal;
