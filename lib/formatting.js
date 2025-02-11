export const formatCurrency = (amount) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(amount);
};

export const formatDate = (date) => {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

export const statusColors = {
	PLANNED: "bg-pink-100 text-pink-800",
	IN_PROGRESS: "bg-blue-100 text-blue-800",
	COMPLETED: "bg-green-100 text-green-800",
	CANCELLED: "bg-red-100 text-red-800",
	ON_HOLD: "bg-yellow-100 text-yellow-800",
};

export const getInitials = (name) => {
	return name
		? name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
		: "?";
};
