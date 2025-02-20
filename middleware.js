// middleware.js
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSession } from "./lib/utils";
import { hasPermission, checkContextualPermission } from "@/lib/newpermissions";

export async function middleware(request) {
	const token = await getToken({ req: request });
	const isAuthPage = request.nextUrl.pathname.startsWith("/auth");

	if (isAuthPage) {
		if (token) {
			return NextResponse.redirect(new URL("/app/dashboard", request.url));
		}
		return NextResponse.next();
	}

	if (!token) {
		return NextResponse.redirect(new URL("/app/auth/login", request.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ["/app/dashboard/:path*", "/app/auth/:path*"],
};
