// hooks/usePermissions.js
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";

export function usePermissions() {
	const { data: session } = useSession();

	return {
		can: (permission) => hasPermission(session?.user?.role, permission),
		role: session?.user?.role,
	};
}
