import { type NextRequest, NextResponse } from "next/server";

import { LOGIN_PATH, NEXT_PARAM, SESSION_COOKIE } from "./lib/constants";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL(LOGIN_PATH, request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") url.searchParams.set(NEXT_PARAM, pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|login).*)"],
};
