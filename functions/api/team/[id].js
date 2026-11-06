// @ts-nocheck
import {
  json, fail, readSession, cleanText, isOwner, hashPassword, LIMITS, assertSameOrigin,
} from "../../lib/core.js";
import { ensureSchema, getAdminById, updateAdmin, deleteAdmin, audit, usernameTaken } from "../../lib/store.js";
import { validatePermissions } from "../team.js";

export async function handle({ request, env, params }) {
  if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
  await ensureSchema(env);
  const user = await readSession(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  if (!isOwner(user)) return fail(403, "forbidden", "هذه العملية متاحة لمالك المكتب فقط");
  const id = Number(params && params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, "bad_id", "رقم الحساب غير صحيح");
  const member = await getAdminById(env, id);
  if (!member) return fail(404, "not_found", "الحساب غير موجود");

  if (request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return fail(400, "bad_request", "تعذر قراءة البيانات"); }
    const fields = {};
    if (body && body.fullName !== undefined) {
      const fullName = cleanText(body.fullName, LIMITS.fullName);
      if (fullName.length < 3) return fail(422, "bad_name", "يرجى إدخال اسم الموظف الكامل");
      fields.fullName = fullName;
    }
    if (body && (body.branches !== undefined || body.services !== undefined)) {
      const perms = validatePermissions({ branches: body.branches ?? member.branches, services: body.services ?? member.services });
      fields.branches = perms.branches;
      fields.services = perms.services;
    }
    if (body && body.canDelete !== undefined) fields.canDelete = Boolean(body.canDelete);
    if (body && body.active !== undefined) fields.active = Boolean(body.active);
    let tempPassword = null;
    if (body && typeof body.password === "string" && body.password) {
      if (body.password.length < 10) return fail(422, "weak_password", "كلمة المرور يجب ألا تقل عن 10 أحرف");
      fields.passwordHash = await hashPassword(body.password);
      tempPassword = body.password;
    }
    if (body && typeof body.username === "string" && body.username && cleanText(body.username, LIMITS.username).toLowerCase() !== member.username) {
      const next = cleanText(body.username, LIMITS.username).toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(next)) return fail(422, "bad_username", "اسم المستخدم غير صالح");
      if (await usernameTaken(env, next)) return fail(409, "username_taken", "اسم المستخدم مستخدم بالفعل");
      await updateAdmin(env, id, fields);
      await env.DB.prepare("UPDATE admin_users SET username = ? WHERE id = ?").bind(next, id).run();
      await audit(env, user.username, "member_updated", "user", String(id), "username", "");
      return json({ ok: true, member: await getAdminById(env, id) });
    }
    if (!Object.keys(fields).length) return fail(422, "empty_update", "لم يتم إرسال أي تعديل");
    const updated = await updateAdmin(env, id, fields);
    await audit(env, user.username, "member_updated", "user", String(id), Object.keys(fields).join(","), "");
    return json({ ok: true, member: updated, tempPassword });
  }

  if (request.method === "DELETE") {
    await deleteAdmin(env, id);
    await audit(env, user.username, "member_deleted", "user", String(id), member.username, "");
    return json({ ok: true });
  }

  return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
}

export const onRequest = (context) => handle(context);
