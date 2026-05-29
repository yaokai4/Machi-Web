import { NextResponse, type NextRequest } from "next/server";

// Surface the URL pathname (and a derived locale) to server components.
// Without this, layout.tsx has no way to know whether the request is
// for `/`, `/en` or `/ja` — only pages get that information through
// route segments. Setting a header lets resolveMarketingLocale prefer
// the URL prefix over the cookie, which is the right precedence.
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  const path = req.nextUrl.pathname;
  requestHeaders.set("x-machi-pathname", path);
  if (path === "/en" || path.startsWith("/en/")) {
    requestHeaders.set("x-machi-locale", "en");
  } else if (path === "/ja" || path.startsWith("/ja/")) {
    requestHeaders.set("x-machi-locale", "ja");
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip Next.js internals and obvious static assets — marketing
  // routes, /api proxies, and everything that hits a real handler
  // still flow through. Add patterns sparingly.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|og-image.png|manifest.webmanifest|sw.js|offline.html|reset.html|robots.txt|sitemap.xml).*)",
  ],
};
