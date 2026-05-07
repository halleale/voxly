import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/_next", "/favicon"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

// Plain middleware — no Clerk import so placeholder keys don't cause errors.
// When SKIP_AUTH=true (local dev) all routes pass through.
// When SKIP_AUTH=false (production) swap this file for the Clerk version below.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (process.env.SKIP_AUTH === "true") {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard/feedback", request.url))
    }
    return NextResponse.next()
  }

  // Production: basic session check; clerkMiddleware handles the real guard.
  // Replace this entire file with the Clerk version once real keys are set:
  //
  //   import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
  //   const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])
  //   export default clerkMiddleware(async (auth, req) => {
  //     if (!isPublicRoute(req)) await auth.protect()
  //   })
  //
  if (!isPublic(pathname) && !request.cookies.get("__session")) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
