// components/AuthProvider.js
"use client";

import { SessionProvider } from "next-auth/react";
import { AuthenticationGuard } from "./AuthenticationGuard";

export function AuthProvider({ children }) {
	return (
		<SessionProvider>
			<AuthenticationGuard>{children}</AuthenticationGuard>
		</SessionProvider>
	);
}
