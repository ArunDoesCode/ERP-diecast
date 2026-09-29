import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/login"];
// Screens with no permission key: open to every signed-in user (BR-AUTH-15).
const ALWAYS_ALLOWED_PATHS = ["/landing", "/approvals"];
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

function normalizePath(path: string) {
	if (path === "/") {
		return "/";
	}

	const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
	return withLeadingSlash.endsWith("/")
		? withLeadingSlash.slice(0, -1)
		: withLeadingSlash;
}

function isPathAllowed(pathname: string, allowedPages: string[]) {
	const normalizedPathname = normalizePath(pathname);

	return allowedPages.some((allowedPage) => {
		const normalizedAllowed = normalizePath(allowedPage);
		if (normalizedAllowed === "/") {
			return normalizedPathname === "/";
		}

		return (
			normalizedPathname === normalizedAllowed ||
			normalizedPathname.startsWith(`${normalizedAllowed}/`)
		);
	});
}

async function fetchScreenPaths(accessToken: string) {
	if (!apiBaseUrl) {
		return null;
	}

	const response = await fetch(`${apiBaseUrl}/auth/me`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
		cache: "no-store",
	});

	if (!response.ok) {
		return null;
	}

	const payload = (await response.json()) as {
		success: true;
		data: { screens: { path: string }[] };
	};

	return Array.isArray(payload.data.screens)
		? payload.data.screens.map((screen) => screen.path)
		: null;
}

export async function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	if (PUBLIC_PATHS.includes(normalizePath(pathname))) {
		return NextResponse.next();
	}

	const accessToken = request.cookies.get("access_token")?.value;
	if (!accessToken) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	const screenPaths = await fetchScreenPaths(accessToken);
	if (!screenPaths) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	if (!isPathAllowed(pathname, [...ALWAYS_ALLOWED_PATHS, ...screenPaths])) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
	],
};
