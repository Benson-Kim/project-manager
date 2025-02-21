// hooks/usePermissionGuardedCrud.js
import { useCrud } from "./useCrud";
import { usePermissions } from "./usePermissions";
import { Actions } from "@/lib/permissions";

export const usePermissionGuardedCrud = (
	resourceType,
	url,
	isCollection = false
) => {
	const crud = useCrud(url, isCollection);
	const { can } = usePermissions();

	const permissions = {
		read: `${Actions.READ}_${resourceType}`,
		create: `${Actions.CREATE}_${resourceType}`,
		update: `${Actions.UPDATE}_${resourceType}`,
		delete: `${Actions.DELETE}_${resourceType}`,
	};

	return {
		...crud,
		data: can(permissions.read) ? crud.data : isCollection ? [] : null,
		isLoading: crud.isLoading,
		error: crud.error,

		fetchAll: async () => {
			if (!can(permissions.read)) {
				console.error("Permission denied: Cannot read this resource");
				return;
			}
			return crud.fetchAll();
		},

		createItem: async (itemData) => {
			if (!can(permissions.create)) {
				console.error("Permission denied: Cannot create this resource");
				return;
			}
			return crud.createItem(itemData);
		},

		updateItem: async (id, itemData) => {
			if (!can(permissions.update)) {
				console.error("Permission denied: Cannot update this resource");
				return;
			}
			return crud.updateItem(id, itemData);
		},

		deleteItem: async (id) => {
			if (!can(permissions.delete)) {
				console.error("Permission denied: Cannot delete this resource");
				return;
			}
			return crud.deleteItem(id);
		},

		permissions: {
			canRead: can(permissions.read),
			canCreate: can(permissions.create),
			canUpdate: can(permissions.update),
			canDelete: can(permissions.delete),
		},
	};
};
