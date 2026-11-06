// @ts-nocheck
import {
  json, fail, readSession, cleanText, STATUS_KEYS, LIMITS, isOwner, assertSameOrigin,
} from "../../lib/core.js";
import { ensureSchema, getRequest, setRequestStatus, addRequestNote, archiveRequest, audit, requestExists } from "../../lib/store.js";

export async function handle({ request, env, params }) {
  if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
  await ensureSchema(env);
  const user = await readSession(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  const id = Number(params && params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, "bad_id", "رقم الطلب غير صحيح");

  const existing = await getRequest(env, user, id);
  if (!existing) return fail(404, "not_found", "الطلب غير موجود أو لا تملك صلاحية الوصول إليه");

  if (request.method === "GET") return json({ ok: true, request: existing });

  if (request.method === "PATCH") {
    let body;
    try {
      body = await request.json();
    } catch {
      return fail(400, "bad_request", "تعذر قراءة البيانات المرسلة");
    }
    const status = cleanText(body && body.status, 30);
    const note = cleanText(body && body.note, LIMITS.note);
    if (!status && !note) return fail(422, "empty_update", "لم يتم إرسال أي تعديل");
    if (status && !STATUS_KEYS.includes(status)) return fail(422, "bad_status", "حالة الطلب غير صحيحة");
    if (status) {
      await setRequestStatus(env, id, status);
      await audit(env, user.username, "status_changed", "request", String(id), status, "");
    }
    let createdNote = null;
    if (note) {
      createdNote = await addRequestNote(env, id, user.name || user.username, note);
      await audit(env, user.username, "note_added", "request", String(id), "", "");
    }
    return json({ ok: true, request: await getRequest(env, user, id), note: createdNote });
  }

  if (request.method === "DELETE") {
    if (!(isOwner(user) || user.canDelete)) return fail(403, "forbidden", "لا تملك صلاحية حذف الطلبات");
    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "1" && isOwner(user);
    const exists = await requestExists(env, id);
    if (!exists) return fail(404, "not_found", "الطلب غير موجود");
    await archiveRequest(env, id, hard);
    await audit(env, user.username, hard ? "request_deleted" : "request_archived", "request", String(id), "", "");
    return json({ ok: true, hard });
  }

  return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
}

export const onRequest = (context) => handle(context);
