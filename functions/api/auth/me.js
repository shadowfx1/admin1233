// @ts-nocheck
import { json, fail, readSession, publicUser } from "../../lib/core.js";
import { ensureSchema } from "../../lib/store.js";

export async function handle({ request, env }) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
  await ensureSchema(env);
  const session = await readSession(request, env);
  if (!session) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  if (session.role !== "owner") return json({ ok: true, user: publicUser(session) });
  return json({ ok: true, user: publicUser(session) });
}

export const onRequest = (context) => handle(context);
