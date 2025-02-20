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
	DEFAULT: "bg-slate-100 text-slate-800",
};

export const getStatusColor = (status) => {
	return statusColors[status] || statusColors.DEFAULT;
};

export const getInitialBackgroundColor = (initial) => {
	const colors = [
		"bg-pink-500",
		"bg-purple-500",
		"bg-indigo-500",
		"bg-blue-500",
		"bg-green-500",
		"bg-yellow-500",
		"bg-red-500",
		"bg-teal-500",
	];
	return colors[initial.charCodeAt(0) % colors.length];
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
