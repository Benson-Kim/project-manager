// middleware.js
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request) {
	const token = await getToken({ req: request });
	const isAuthPage = request.nextUrl.pathname.startsWith("/auth");

	if (isAuthPage) {
		if (token) {
			return NextResponse.redirect(new URL("/dashboard", request.url));
		}
		return NextResponse.next();
	}

	if (!token) {
		return NextResponse.redirect(new URL("/auth/login", request.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ["/dashboard/:path*", "/auth/:path*"],
};
