// @ts-nocheck
import { json, fail, clearSessionCookie, readSession, assertSameOrigin } from "../../lib/core.js";
import { ensureSchema, audit } from "../../lib/store.js";

export async function handle({ request, env }) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
  if (!(await assertSameOrigin(request))) return fail(403, "bad_origin", "طلب غير موثوق");
  await ensureSchema(env);
  const session = await readSession(request, env);
  if (session) await audit(env, session.username, "logout", "auth", String(session.sub || ""), "", "");
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

export const onRequest = (context) => handle(context);
