// @ts-nocheck
import {
  json, fail, readSession, validateRequestInput, clientIp, sha256Hex, sessionSecret,
  assertSameOrigin, cleanText, SERVICES, BRANCHES, STATUSES, isOwner, publicUser,
} from "../lib/core.js";
import { ensureSchema, createRequest, countRecentByIp, listRequests, getStats, audit } from "../lib/store.js";

async function requireUser(request, env) {
  const session = await readSession(request, env);
  return session || null;
}

export async function handle({ request, env }) {
  await ensureSchema(env);

  if (request.method === "POST") {
    if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > 12000) return fail(413, "payload_too_large", "حجم الطلب كبير جدًا");
    let body;
    try {
      body = await request.json();
    } catch {
      return fail(400, "bad_request", "تعذر قراءة البيانات المرسلة");
    }
    const check = validateRequestInput(body || {});
    if (!check.ok) return json({ ok: false, errors: check.errors, message: "يرجى تصحيح الحقول المطلوبة" }, 422);
    const secret = sessionSecret(env) || "rayat";
    const ipHash = await sha256Hex(clientIp(request) + "|" + secret);
    if ((await countRecentByIp(env, ipHash, 10)) >= 5) {
      return fail(429, "rate_limited", "تم استلام عدد كبير من الطلبات من هذا الجهاز. حاول بعد قليل أو تواصل معنا هاتفيًا.");
    }
    const created = await createRequest(env, check.data, ipHash);
    await audit(env, "public_form", "request_created", "request", String(created.id), created.ref, ipHash);
    return json(
      {
        ok: true,
        id: created.id,
        reference: created.ref,
        message: "تم استلام طلبك بنجاح",
      },
      201,
    );
  }

  const user = await requireUser(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  if (request.method !== "GET") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");

  const url = new URL(request.url);
  const list = await listRequests(env, user, url.searchParams);
  const stats = await getStats(env, user);
  return json({
    ok: true,
    ...list,
    stats: { total: stats.total, byStatus: stats.byStatus },
    meta: { statuses: STATUSES, services: SERVICES, branches: BRANCHES, user: publicUser(user), isOwner: isOwner(user) },
  });
}

export const onRequest = (context) => handle(context);
