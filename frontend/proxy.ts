import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/login"];
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

async function fetchAllowedPages(accessToken: string) {
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
		data: { allowedPages: string[] };
	};

	return Array.isArray(payload.data.allowedPages)
		? payload.data.allowedPages
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

	const allowedPages = await fetchAllowedPages(accessToken);
	if (!allowedPages) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	if (!isPathAllowed(pathname, allowedPages)) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
	],
};
