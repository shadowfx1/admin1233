// @ts-nocheck
import {
  json, fail, readSession, verifyPassword, hashPassword, cleanText, isOwner, assertSameOrigin,
} from "../../lib/core.js";
import { ensureSchema, getSetting, setSetting, getAdminByUsername, updateAdmin, audit } from "../../lib/store.js";

export async function handle({ request, env }) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
  if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
  await ensureSchema(env);
  const user = await readSession(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "تعذر قراءة البيانات");
  }
  const current = typeof (body && body.currentPassword) === "string" ? body.currentPassword.slice(0, 128) : "";
  const next = typeof (body && body.newPassword) === "string" ? body.newPassword : "";
  if (!current || !next) return fail(422, "missing_fields", "يرجى إدخال كلمة المرور الحالية والجديدة");
  if (next.length < 10) return fail(422, "weak_password", "كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف");

  if (isOwner(user)) {
    const stored = (await getSetting(env, "owner_password_hash")) || env.ADMIN_PASSWORD_HASH || "";
    if (!stored || !(await verifyPassword(current, stored))) return fail(403, "bad_password", "كلمة المرور الحالية غير صحيحة");
    await setSetting(env, "owner_password_hash", await hashPassword(next));
    await audit(env, user.username, "password_changed", "auth", "owner", "", "");
    return json({ ok: true, message: "تم تحديث كلمة مرور المالك" });
  }

  const row = await getAdminByUsername(env, user.username);
  if (!row) return fail(404, "not_found", "الحساب غير موجود");
  if (!(await verifyPassword(current, row.password_hash))) return fail(403, "bad_password", "كلمة المرور الحالية غير صحيحة");
  await updateAdmin(env, Number(row.id), { passwordHash: await hashPassword(next) });
  await audit(env, user.username, "password_changed", "user", String(row.id), "", "");
  return json({ ok: true, message: "تم تحديث كلمة المرور" });
}

export const onRequest = (context) => handle(context);
