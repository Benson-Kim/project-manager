// lib/api-handler.js
import { getSession } from "next-auth/react";
import { hasPermission } from "./permissions";

export async function apiHandler(handler, permission) {
	return async (req, res) => {
		try {
			const session = await getSession({ req });
			if (!session) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (permission && !hasPermission(session.user.role, permission)) {
				return res.status(403).json({ error: "Forbidden" });
			}

			return await handler(req, res, session);
		} catch (error) {
			console.error(error);
			return res.status(500).json({ error: "Internal server error" });
		}
	};
}
