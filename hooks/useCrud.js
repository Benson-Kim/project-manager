import { useState } from "react";

export const useCrud = (url) => {
	const [data, setData] = useState([]);
	const [isLoading, setIsLoading] = useState(false);

	const fetchAll = async () => {
		setIsLoading(true);
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error("Failed to fetch data");
			const result = await response.json();
			setData(result);
		} catch (error) {
			console.error("Fetch error:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const createItem = async (itemData) => {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemData),
			});
			if (!response.ok) throw new Error("Failed to create item");
			const newItem = await response.json();
			setData((prev) => [...prev, newItem]);
		} catch (error) {
			console.error("Create error:", error);
		}
	};

	const updateItem = async (id, itemData) => {
		try {
			const response = await fetch(`${url}/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(itemData),
			});
			if (!response.ok) throw new Error("Failed to update item");
			const updatedItem = await response.json();
			setData((prev) =>
				prev.map((item) => (item.id === id ? updatedItem : item))
			);
		} catch (error) {
			console.error("Update error:", error);
		}
	};

	const deleteItem = async (id) => {
		try {
			const response = await fetch(`${url}/${id}`, { method: "DELETE" });
			if (!response.ok) throw new Error("Failed to delete item");
			setData((prev) => prev.filter((item) => item.id !== id));
		} catch (error) {
			console.error("Delete error:", error);
		}
	};

	return { data, isLoading, fetchAll, createItem, updateItem, deleteItem };
};
