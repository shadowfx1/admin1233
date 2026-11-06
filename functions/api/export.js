// @ts-nocheck
import { fail, readSession, toCsv, statusLabel, phoneIntl } from "../lib/core.js";
import { ensureSchema, exportRequests, audit } from "../lib/store.js";

export async function handle({ request, env }) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "الطريقة غير مسموحة");
  await ensureSchema(env);
  const user = await readSession(request, env);
  if (!user) return fail(401, "unauthorized", "الجلسة منتهية، يرجى تسجيل الدخول");
  const url = new URL(request.url);
  const rows = await exportRequests(env, user, url.searchParams);
  const csv = toCsv(
    ["رقم المرجع", "الاسم", "رقم الجوال", "الجوال الدولي", "الخدمة", "الفرع", "الحالة", "تاريخ الإنشاء", "آخر تحديث", "تفاصيل الاستشارة", "الملاحظات الداخلية"],
    rows.map((r) => [
      r.ref, `${r.first_name} ${r.last_name}`, r.phone, phoneIntl(r.phone), r.service, r.branch,
      statusLabel(r.status), r.created_at, r.updated_at, r.details, r.notes || "",
    ]),
  );
  await audit(env, user.username, "export_csv", "requests", String(rows.length), "", "");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rayat-requests-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export const onRequest = (context) => handle(context);
