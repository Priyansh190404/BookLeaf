import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Edge middleware = first line of defence. Every /api route except login/health requires a valid
 * session, and each portal's pages are role-gated. Route handlers re-check roles (defence in depth).
 */
const PUBLIC_API = new Set(["/api/auth/login", "/api/health"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  const session = token ? await verifySession(token) : null;

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.has(pathname) || session) return NextResponse.next();
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, { status: 401 });
  }

  const home = session ? (session.role === "admin" ? "/admin" : "/author/books") : "/login";
  if (pathname === "/login") return session ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (pathname.startsWith("/admin") && session.role !== "admin") return NextResponse.redirect(new URL(home, req.url));
  if (pathname.startsWith("/author") && session.role !== "author") return NextResponse.redirect(new URL(home, req.url));
  if (pathname === "/") return NextResponse.redirect(new URL(home, req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/author/:path*", "/admin/:path*", "/api/:path*"] };
