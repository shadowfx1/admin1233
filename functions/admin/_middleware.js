// @ts-nocheck
/**
 * حماية صفحات لوحة التحكم: لا يمكن فتح أي صفحة إدارية دون جلسة موقّعة صالحة.
 * Protects every /admin/* page. The login page and its static assets stay public;
 * everything else is redirected to the login page before the file is ever served.
 */
import { readSession } from "../lib/core.js";

// The login page and its stylesheet/script must load for signed-out visitors.
// (Cloudflare may request the login page as /admin, /admin/, /admin/index or /admin/index.html.)
const LOGIN_PATHS = new Set(["/admin", "/admin/", "/admin/index", "/admin/index.html"]);
const PUBLIC_ASSETS = "/admin/assets/";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/admin")) return next();
  if (url.pathname.startsWith(PUBLIC_ASSETS)) return next();
  if (LOGIN_PATHS.has(url.pathname)) {
    // Authenticated visitors are sent straight to the dashboard from the login page.
    const session = await readSession(request, env);
    if (session) return Response.redirect(new URL("/admin/dashboard.html", url).toString(), 302);
    return next();
  }
  const session = await readSession(request, env);
  if (!session) {
    const target = `/admin/index.html?next=${encodeURIComponent(url.pathname)}`;
    return Response.redirect(new URL(target, url).toString(), 302);
  }
  return next();
}
