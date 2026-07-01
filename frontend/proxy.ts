import { type NextRequest, NextResponse } from "next/server";

type AccessTokenPayload = {
  userId: string;
  role: string;
  allowedPages: string[];
  exp: number;
};

function decodePayload(token: string): AccessTokenPayload | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) {
      return null;
    }

    const padded = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    const decoded = atob(padded);

    return JSON.parse(decoded) as AccessTokenPayload;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = ["/", "/login"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = decodePayload(accessToken);
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isExpired = payload.exp * 1000 <= Date.now();
  if (isExpired) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isAllowed = payload.allowedPages.some((allowedPage) =>
    pathname.startsWith(allowedPage),
  );

  if (!isAllowed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
