import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Edge-safe Auth.js instance: reads the session JWT only, no password hashing or DB access.
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks", "/api/health"];
const ADMIN_PATHS = ["/dashboard", "/batches", "/orders", "/locations", "/users"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const user = req.auth?.user as { role?: string } | undefined;

  // No session → redirect to login
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based route guards
  const role = user.role || "picker";

  // Admin paths require admin role
  if (ADMIN_PATHS.some((p) => pathname.startsWith(p)) && role !== "admin") {
    return NextResponse.redirect(new URL("/pick", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api/trpc).*)"],
};
