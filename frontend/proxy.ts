import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/login"];
// Set by the API as an httpOnly cookie (BR-AUTH-30); scripts cannot read it, the server can.
const REFRESH_COOKIE = "refresh_token";

function normalizePath(path: string) {
	if (path === "/") {
		return "/";
	}

	const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
	return withLeadingSlash.endsWith("/")
		? withLeadingSlash.slice(0, -1)
		: withLeadingSlash;
}

/**
 * Page guard (BR-AUTH-30, #25): only checks that the refresh cookie is present, with no API call
 * per navigation. Screen access is checked in the app once the session is restored (AppShell),
 * and the API decides every request (BR-AUTH-14).
 */
export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	if (PUBLIC_PATHS.includes(normalizePath(pathname))) {
		return NextResponse.next();
	}

	if (!request.cookies.get(REFRESH_COOKIE)?.value) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
	],
};
