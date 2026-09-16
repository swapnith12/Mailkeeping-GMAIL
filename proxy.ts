// Next.js 16 renamed the middleware.ts convention to proxy.ts (same
// NextRequest/NextResponse APIs, same `config.matcher`, just a renamed
// export). Auth.js v5's `auth` function can be used directly as that
// request interceptor: it checks the session and redirects unauthenticated
// requests away from matched routes.
export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*"],
};
