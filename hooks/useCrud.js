import { useState } from "react";

export const useCrud = (url, isCollection = false) => {
	// Initialize data as null for single items or [] for collections
	const [data, setData] = useState(isCollection ? [] : null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const fetchAll = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const result = await response.json();
			setData(result);
		} catch (error) {
			console.error("Fetch error:", error);
			setError(error.message);
		} finally {
			setIsLoading(false);
		}
	};
	const createItem = async (itemData) => {
		setError(null);
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemData),
			});
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const newItem = await response.json();
			if (isCollection) {
				setData((prev) => [...prev, newItem]);
			} else {
				setData(newItem);
			}
			return newItem;
		} catch (error) {
			console.error("Create error:", error);
			setError(error.message);
			throw error;
		}
	};
	const updateItem = async (id, itemData) => {
		setError(null);
		try {
			const response = await fetch(`${url}${isCollection ? `/${id}` : ""}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemData),
			});
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const updatedItem = await response.json();
			if (isCollection) {
				setData((prev) =>
					prev.map((item) => (item.id === id ? updatedItem : item))
				);
			} else {
				setData(updatedItem);
			}
			return updatedItem;
		} catch (error) {
			console.error("Update error:", error);
			setError(error.message);
			throw error;
		}
	};
	const deleteItem = async (id) => {
		setError(null);
		try {
			const response = await fetch(`${url}${isCollection ? `/${id}` : ""}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			if (isCollection) {
				setData((prev) => prev.filter((item) => item.id !== id));
			} else {
				setData(null);
			}
		} catch (error) {
			console.error("Delete error:", error);
			setError(error.message);
			throw error;
		}
	};
	return {
		data,
		isLoading,
		error,
		fetchAll,
		createItem,
		updateItem,
		deleteItem,
	};
};
