// @ts-nocheck
import {
  json, fail, cleanText, clientIp, sha256Hex, verifyPassword, signSession, sessionSecret,
  sessionCookie, SESSION_TTL_SECONDS, assertSameOrigin, LIMITS, publicUser, constantTimeEqual,
} from "../../lib/core.js";
import { ensureSchema, getSetting, getAdminByUsername, touchLogin, audit, countRecentFailures } from "../../lib/store.js";

const MAX_FAILURES = 6;

export async function handle({ request, env }) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
  if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
  const secret = sessionSecret(env);
  if (!secret) return fail(503, "not_configured", "لم يتم إعداد النظام بعد. يرجى ضبط متغيرات البيئة.");
  await ensureSchema(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "بيانات الدخول غير صحيحة");
  }
  const username = cleanText(body && body.username, LIMITS.username).toLowerCase();
  const password = typeof (body && body.password) === "string" ? body.password.slice(0, LIMITS.password) : "";
  if (!username || !password) return fail(422, "missing_fields", "يرجى إدخال اسم المستخدم وكلمة المرور");

  const ipHash = await sha256Hex(clientIp(request) + "|" + secret);
  if ((await countRecentFailures(env, username, ipHash)) >= MAX_FAILURES) {
    return fail(429, "too_many_attempts", "تم إيقاف المحاولات مؤقتًا بسبب كثرة الأخطاء. حاول بعد 15 دقيقة.");
  }

  const ownerUsername = cleanText(env.ADMIN_USERNAME || "admin", LIMITS.username).toLowerCase();
  let user = null;

  if (username === ownerUsername) {
    const override = await getSetting(env, "owner_password_hash");
    const storedHash = override || env.ADMIN_PASSWORD_HASH || "";
    let valid = false;
    if (storedHash) valid = await verifyPassword(password, storedHash);
    else if (env.ADMIN_PASSWORD) valid = constantTimeEqual(password, env.ADMIN_PASSWORD);
    if (valid) {
      user = {
        sub: 0,
        username: ownerUsername,
        name: cleanText(env.OWNER_NAME || "مالك المكتب", LIMITS.fullName),
        role: "owner",
        branches: [],
        services: [],
        canDelete: true,
      };
    }
  } else {
    const row = await getAdminByUsername(env, username);
    if (row && Number(row.active) === 1 && (await verifyPassword(password, row.password_hash))) {
      const parse = (v) => { try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } };
      user = {
        sub: Number(row.id),
        username: row.username,
        name: row.full_name,
        role: "lawyer",
        branches: parse(row.branches),
        services: parse(row.services),
        canDelete: Boolean(Number(row.can_delete)),
      };
      await touchLogin(env, row.id);
    }
  }

  if (!user) {
    await audit(env, username, "login_failed", "auth", "", "", ipHash);
    return fail(401, "invalid_credentials", "اسم المستخدم أو كلمة المرور غير صحيحة");
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = { ...user, iat: Math.floor(Date.now() / 1000), exp, v: 1 };
  const token = await signSession(payload, secret);
  await audit(env, user.username, "login_success", "auth", String(user.sub), user.role, ipHash);
  return json({ ok: true, user: publicUser(payload) }, 200, { "set-cookie": sessionCookie(token) });
}

export const onRequest = (context) => handle(context);
