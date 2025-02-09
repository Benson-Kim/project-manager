// components/AuthenticationGuard.js
"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthenticationGuard({ children }) {
	const { data: session, status } = useSession();
	const router = useRouter();
	const pathname = usePathname();

	const publicPages = ["/auth/signin", "/auth/error", "/unauthorized"];

	const isPublicPage = publicPages.includes(pathname);

	useEffect(() => {
		if (status === "loading") return;

		if (!session && !isPublicPage) {
			router.push("/auth/signin");
		}
	}, [session, status, router, isPublicPage, pathname]);

	if (status === "loading") {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
			</div>
		);
	}

	if (!session && !isPublicPage) {
		return null;
	}

	return <>{children}</>;
}
