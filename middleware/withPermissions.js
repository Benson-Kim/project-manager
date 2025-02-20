// middleware/withPermissions.js
import { NextResponse } from "next/server";
import { hasPermission, checkContextualPermission } from "@/lib/permissions";
import { getSession } from "@/lib/utils";

export function withPermissions(handler, config) {
	return async (request, context) => {
		const session = await getSession({ req: request });

		if (!session?.user) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		const userRole = session.user.role;

		// Create permissions helper object
		const permissionsHelper = {
			userRole,
			hasPermission: (permission) => hasPermission(userRole, permission),
			checkContextual: (permission, context) =>
				checkContextualPermission(userRole, permission, context),
		};

		// Handle single permission requirement
		if (typeof config === "string") {
			if (!permissionsHelper.hasPermission(config)) {
				return new NextResponse("Forbidden", { status: 403 });
			}
		}

		// Handle multiple permission requirements
		else if (Array.isArray(config)) {
			const hasAllPermissions = config.every((permission) =>
				permissionsHelper.hasPermission(permission)
			);

			if (!hasAllPermissions) {
				return new NextResponse("Forbidden", { status: 403 });
			}
		}

		// Handle contextual permission checks
		else if (typeof config === "object") {
			const { permission, getContext } = config;
			// Pass permissionsHelper to getContext instead of relying on request.permissions
			const contextData = await getContext(
				request,
				session,
				context,
				permissionsHelper
			);

			if (!checkContextualPermission(userRole, permission, contextData)) {
				return new NextResponse("Forbidden", { status: 403 });
			}
		}

		// Add permissions to the request for use in the handler
		request.permissions = permissionsHelper;

		return handler(request, context);
	};
}
