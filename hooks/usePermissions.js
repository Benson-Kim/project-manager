// hooks/usePermissions.js
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import {
	checkContextualPermission,
	hasAnyPermission,
	hasPermission,
	hasPermissions,
} from "@/lib/permissions";

export const usePermissions = () => {
	const { data: session } = useSession();
	const userRole = session?.user?.role;

	return useMemo(
		() => ({
			can: (permission) => hasPermission(userRole, permission),

			canAll: (permissions) => hasPermissions(userRole, permissions),

			canAny: (permissions) => hasAnyPermission(userRole, permissions),

			canWithContext: (permission, context) =>
				checkContextualPermission(userRole, permission, context),

			role: userRole,
		}),
		[userRole]
	);
};
