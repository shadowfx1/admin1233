// @ts-nocheck
/**
 * راية القانون — النواة المشتركة للوحة التحكم
 * Shared core: constants, validation, password hashing, signed sessions, CSV.
 * Runs unchanged on Cloudflare Pages Functions (Workers runtime) and in the
 * preview runtime (Node), using only WebCrypto so there is no platform lock-in.
 */

export const SESSION_COOKIE = "rq_admin_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
export const PBKDF2_ITERATIONS = 100000;

export const BRANCHES = ["الرياض", "المدينة المنورة"];

export const SERVICES = [
  "الاعتداء الزوجي",
  "الشرب والقيادة",
  "جرائم المخدرات",
  "الجرائم الجنسية",
  "السرقة",
  "احتيال",
  "غسيل أموال",
  "إساءة الأطفال",
  "استشارة عامة",
];

export const STATUSES = [
  { key: "new", label: "جديد" },
  { key: "under_review", label: "قيد المراجعة" },
  { key: "contacting", label: "جارٍ التواصل مع العميل" },
  { key: "needs_documents", label: "بانتظار مستندات" },
  { key: "completed", label: "مكتمل" },
  { key: "closed", label: "مغلق" },
  { key: "cancelled", label: "ملغي" },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);
export const OPEN_STATUSES = ["new", "under_review", "contacting", "needs_documents"];

export const LIMITS = {
  name: 60,
  phone: 20,
  details: 2000,
  note: 1000,
  username: 32,
  fullName: 80,
  password: 128,
};

/* ---------------------------------------------------------------- responses */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      ...headers,
    },
  });
}

export function fail(status, code, message) {
  return json({ ok: false, error: { code, message } }, status);
}

/* -------------------------------------------------------------------- utils */
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

export function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  let n = digits.replace(/^\+/, "");
  if (n.startsWith("00966")) n = n.slice(2);
  if (n.startsWith("966")) n = "0" + n.slice(3);
  if (/^5\d{8}$/.test(n)) n = "0" + n;
  if (!/^05\d{8}$/.test(n)) return "";
  return n;
}

export function phoneIntl(local) {
  return String(local || "").startsWith("0") ? "966" + String(local).slice(1) : String(local || "");
}

export function escapeCsv(value) {
  const s = String(value == null ? "" : value).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsv).join(","));
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}

export function clientIp(request) {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function statusLabel(key) {
  const found = STATUSES.find((s) => s.key === key);
  return found ? found.label : key;
}

export function nowIso() {
  return new Date().toISOString();
}

export function yearOf(date = new Date()) {
  return String(date.getUTCFullYear());
}

export function makeRef(year, sequence) {
  return `RAY-${year}-${String(sequence).padStart(4, "0")}`;
}

/* ------------------------------------------------------------ public form */
export function validateRequestInput(input) {
  const errors = {};
  const firstName = cleanText(input.firstName || input.first, LIMITS.name);
  const lastName = cleanText(input.lastName || input.last, LIMITS.name);
  const rawPhone = cleanText(input.phone, LIMITS.phone);
  const phone = normalizePhone(rawPhone);
  const service = cleanText(input.service, 80);
  const branch = cleanText(input.branch, 40);
  const details = cleanText(input.details, LIMITS.details);
  const honeypot = cleanText(input.website || input.company || "", 40);

  if (!firstName) errors.firstName = "الاسم الأول مطلوب";
  if (!lastName) errors.lastName = "اسم العائلة مطلوب";
  if (!rawPhone) errors.phone = "رقم الجوال مطلوب";
  else if (!phone) errors.phone = "أدخل رقم جوال سعودي صحيح يبدأ بـ 05";
  if (!service) errors.service = "الخدمة القانونية مطلوبة";
  else if (!SERVICES.includes(service)) errors.service = "الخدمة المختارة غير صحيحة";
  if (!branch) errors.branch = "اختيار الفرع مطلوب";
  else if (!BRANCHES.includes(branch)) errors.branch = "الفرع المختار غير صحيح";
  if (!details) errors.details = "تفاصيل الاستشارة مطلوبة";
  else if (details.length < 10) errors.details = "يرجى كتابة 10 أحرف على الأقل";
  if (honeypot) errors.website = "تم رفض الطلب";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      firstName,
      lastName,
      phone,
      service,
      branch,
      details,
      sourcePage: cleanText(input.page || input.sourcePage || "", 200),
      lang: input.lang === "en" ? "en" : "ar",
    },
  };
}

/* --------------------------------------------------------------- passwords */
function b64(bytes) {
  let s = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function fromB64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(String(password), salt, PBKDF2_ITERATIONS);
  // Colon separators keep the hash safe inside .env files (dotenv expands "$").
  return `pbkdf2:${PBKDF2_ITERATIONS}:${b64(salt)}:${b64(derived)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const raw = String(stored || "").trim();
    const parts = raw.includes("$") ? raw.split("$") : raw.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations < 10000) return false;
    const salt = fromB64(parts[2]);
    const expected = fromB64(parts[3]);
    const derived = await pbkdf2(String(password), salt, iterations);
    if (derived.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i += 1) diff |= derived[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** Constant-time comparison for the optional plaintext env fallback. */
export function constantTimeEqual(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && x.length > 0;
}

/** Generates a readable temporary password such as "Raya-7f3k-92". */
export function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const body = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `Raya-${body}-${crypto.getRandomValues(new Uint8Array(1))[0] % 90 + 10}`;
}

/* ---------------------------------------------------------------- sessions */
function b64url(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text) {
  const pad = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromB64(pad + "=".repeat((4 - (pad.length % 4)) % 4));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function sessionSecret(env) {
  const secret = env && env.SESSION_SECRET;
  if (secret && String(secret).length >= 24) return String(secret);
  // A missing secret must never silently produce forgeable sessions.
  return "";
}

export async function signSession(payload, secret) {
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(sig),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!payload || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function readSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  const payload = await verifySessionToken(token, sessionSecret(env));
  return payload;
}

export function publicUser(payload) {
  if (!payload) return null;
  return {
    username: payload.username,
    name: payload.name,
    role: payload.role,
    branches: payload.branches || [],
    services: payload.services || [],
    canDelete: Boolean(payload.canDelete),
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
  };
}

export function isOwner(user) {
  return Boolean(user && user.role === "owner");
}

/** Server-side scoping: lawyers only ever see their permitted branches/services. */
export function scopeFilters(user, query) {
  const where = ["r.archived = 0"];
  const args = [];
  if (!isOwner(user)) {
    const branches = Array.isArray(user.branches) ? user.branches.filter((b) => BRANCHES.includes(b)) : [];
    const services = Array.isArray(user.services) ? user.services.filter((s) => SERVICES.includes(s)) : [];
    if (branches.length) {
      where.push(`r.branch IN (${branches.map(() => "?").join(",")})`);
      args.push(...branches);
    }
    if (services.length) {
      where.push(`r.service IN (${services.map(() => "?").join(",")})`);
      args.push(...services);
    }
  }
  const q = cleanText(query.get("q") || "", 80);
  if (q) {
    where.push("(LOWER(r.ref) LIKE ? OR LOWER(r.first_name || ' ' || r.last_name) LIKE ? OR r.phone LIKE ? OR LOWER(r.first_name) LIKE ? OR LOWER(r.last_name) LIKE ?)");
    const like = `%${q.toLowerCase()}%`;
    args.push(like, like, `%${q}%`, like, like);
  }
  const status = cleanText(query.get("status") || "", 30);
  if (status && STATUS_KEYS.includes(status)) {
    where.push("r.status = ?");
    args.push(status);
  }
  const branch = cleanText(query.get("branch") || "", 40);
  if (branch && BRANCHES.includes(branch)) {
    where.push("r.branch = ?");
    args.push(branch);
  }
  const service = cleanText(query.get("service") || "", 80);
  if (service && SERVICES.includes(service)) {
    where.push("r.service = ?");
    args.push(service);
  }
  const from = cleanText(query.get("from") || "", 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    where.push("r.created_at >= ?");
    args.push(`${from}T00:00:00.000Z`);
  }
  const to = cleanText(query.get("to") || "", 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    where.push("r.created_at <= ?");
    args.push(`${to}T23:59:59.999Z`);
  }
  return { clause: `WHERE ${where.join(" AND ")}`, args };
}

export async function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl/tests) do not send Origin
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const candidates = [
      (() => { try { return new URL(request.url).host; } catch { return ""; } })(),
      request.headers.get("host") || "",
      (request.headers.get("x-forwarded-host") || "").split(",")[0].trim(),
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    return candidates.includes(originHost);
  } catch {
    return false;
  }
}
