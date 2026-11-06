// @ts-nocheck
import {
  json, fail, readSession, cleanText, isOwner, hashPassword, generatePassword,
  BRANCHES, SERVICES, LIMITS, assertSameOrigin,
} from "../lib/core.js";
import { ensureSchema, listAdmins, createAdmin, usernameTaken, audit } from "../lib/store.js";

export function validatePermissions(body) {
  const branches = Array.isArray(body && body.branches) ? body.branches.filter((b) => BRANCHES.includes(b)) : [];
  const services = Array.isArray(body && body.services) ? body.services.filter((s) => SERVICES.includes(s)) : [];
  return { branches, services };
}

export async function handle({ request, env }) {
  if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
  await ensureSchema(env);
  const user = await readSession(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  if (!isOwner(user)) return fail(403, "forbidden", "هذه الصفحة متاحة لمالك المكتب فقط");

  if (request.method === "GET") {
    const members = await listAdmins(env);
    return json({
      ok: true,
      owner: { username: user.username, name: user.name },
      members,
      meta: { branches: BRANCHES, services: SERVICES },
    });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return fail(400, "bad_request", "تعذر قراءة البيانات");
    }
    const fullName = cleanText(body && body.fullName, LIMITS.fullName);
    if (fullName.length < 3) return fail(422, "bad_name", "يرجى إدخال اسم الموظف الكامل");
    let username = cleanText(body && body.username, LIMITS.username).toLowerCase();
    if (!username) {
      const base = "lawyer-" + Math.floor(1000 + Math.random() * 9000);
      username = base;
      let i = 1;
      while (await usernameTaken(env, username)) { username = `${base}${i}`; i += 1; }
    } else if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return fail(422, "bad_username", "اسم المستخدم يجب أن يكون بالإنجليزية (3 إلى 32 حرفًا) بدون مسافات");
    }
    const ownerUsername = cleanText(env.ADMIN_USERNAME || "admin", LIMITS.username).toLowerCase();
    if (username === ownerUsername) return fail(409, "username_taken", "اسم المستخدم محجوز للمالك");
    if (await usernameTaken(env, username)) return fail(409, "username_taken", "اسم المستخدم مستخدم بالفعل");

    let password = typeof (body && body.password) === "string" ? body.password : "";
    if (password) {
      if (password.length < 10) return fail(422, "weak_password", "كلمة المرور يجب ألا تقل عن 10 أحرف");
    } else {
      password = generatePassword();
    }
    const perms = validatePermissions(body);
    const member = await createAdmin(env, {
      username, fullName,
      passwordHash: await hashPassword(password),
      branches: perms.branches,
      services: perms.services,
      canDelete: Boolean(body && body.canDelete),
    });
    await audit(env, user.username, "member_created", "user", String(member.id), username, "");
    return json({ ok: true, member, tempPassword: password }, 201);
  }

  return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
}

export const onRequest = (context) => handle(context);
