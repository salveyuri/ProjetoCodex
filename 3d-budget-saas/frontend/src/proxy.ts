import { NextResponse, type NextRequest } from "next/server";

// httpOnly cookie set by the backend (POST /api/auth/login|register|refresh).
// Next.js middleware runs server-side, so it can read httpOnly cookies fine
// — only browser-side `document.cookie` can't see them (that's the point).
const AUTH_COOKIE = "refresh_token";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const isHomeRoute = request.nextUrl.pathname === "/";
  const isLoginRoute = request.nextUrl.pathname === "/login";
  const isRegisterRoute = request.nextUrl.pathname === "/register";
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  if ((isDashboardRoute || isAdminRoute) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // "/" is the public marketing landing page — skip straight past it to the
  // dashboard for anyone already signed in, same as the old unconditional
  // redirect("/dashboard") that used to live at app/page.tsx.
  if ((isHomeRoute || isLoginRoute || isRegisterRoute) && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
