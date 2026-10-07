import { NextResponse, type NextRequest } from "next/server";

// Next.js 16: this file is `proxy.ts` and exports `proxy`. (On Next 15 or older, name it `middleware.ts` and export `middleware`.)
const PUBLIC = ["/login", "/register", "/forgot-password", "/verify-email"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasToken = !!req.cookies.get("access_token")?.value;
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  if (!hasToken && !isPublic && pathname !== "/") return NextResponse.redirect(new URL("/login", req.url));
  if (hasToken && isPublic) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };