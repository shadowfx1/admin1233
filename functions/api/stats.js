// @ts-nocheck
import { json, fail, readSession, publicUser } from "../lib/core.js";
import { ensureSchema, getStats } from "../lib/store.js";

export async function handle({ request, env }) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
  await ensureSchema(env);
  const user = await readSession(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  const stats = await getStats(env, user);
  return json({ ok: true, ...stats, user: publicUser(user) });
}

export const onRequest = (context) => handle(context);
