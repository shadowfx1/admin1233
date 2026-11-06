// @ts-nocheck
/**
 * طبقة البيانات — SQL متوافق مع Cloudflare D1 (SQLite) و PostgreSQL معًا.
 * Data layer: portable SQL shared by D1 (production) and the preview database.
 * Only bound parameters are used; every list query is scoped server-side.
 */
import { makeRef, nowIso, yearOf, scopeFilters, isOwner, SERVICES, BRANCHES } from "./core.js";

let schemaReady = false;
let schemaPromise = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, last INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT NOT NULL,
    branch TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL,
    source_page TEXT NOT NULL DEFAULT '',
    lang TEXT NOT NULL DEFAULT 'ar',
    ip_hash TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS request_notes (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'lawyer',
    branches TEXT NOT NULL DEFAULT '',
    services TEXT NOT NULL DEFAULT '',
    can_delete INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_requests_created ON requests (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_phone ON requests (phone)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_request ON request_notes (request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_lookup ON audit_log (action, actor, ip_hash, created_at)`,
];

export async function ensureSchema(env) {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const statement of SCHEMA) await env.DB.prepare(statement).run();
      schemaReady = true;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function nextCounter(env, name) {
  await env.DB.prepare("INSERT INTO counters (name, last) VALUES (?, 0) ON CONFLICT (name) DO NOTHING").bind(name).run();
  const row = await env.DB.prepare("UPDATE counters SET last = last + 1 WHERE name = ? RETURNING last").bind(name).first();
  return Number(row && row.last ? row.last : 1);
}

/* ------------------------------------------------------------------ requests */
export async function createRequest(env, data, ipHash) {
  const year = yearOf();
  const refSequence = await nextCounter(env, `ref_${year}`);
  const id = await nextCounter(env, "request_id");
  const ref = makeRef(year, refSequence);
  const at = nowIso();
  await env.DB.prepare(
    `INSERT INTO requests (id, ref, first_name, last_name, phone, service, branch, details, status, source_page, lang, ip_hash, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(id, ref, data.firstName, data.lastName, data.phone, data.service, data.branch, data.details, "new", data.sourcePage, data.lang, ipHash, at, at)
    .run();
  return { id, ref, createdAt: at };
}

export async function countRecentByIp(env, ipHash, minutes = 10) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM requests WHERE ip_hash = ? AND created_at >= ?").bind(ipHash, since).first();
  return Number(row && row.c ? row.c : 0);
}

const SELECT_FIELDS = `r.id, r.ref, r.first_name, r.last_name, r.phone, r.service, r.branch, r.details,
  r.status, r.source_page, r.lang, r.created_at, r.updated_at,
  (SELECT COUNT(*) FROM request_notes n WHERE n.request_id = r.id) AS notes_count`;

export async function listRequests(env, user, query) {
  const { clause, args } = scopeFilters(user, query);
  const page = Math.max(1, Math.min(10000, Number(query.get("page") || 1) || 1));
  const pageSize = Math.min(50, Math.max(5, Number(query.get("pageSize") || 10) || 10));
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM requests r ${clause}`).bind(...args).first();
  const total = Number(totalRow && totalRow.c ? totalRow.c : 0);
  const rows = await env.DB.prepare(
    `SELECT ${SELECT_FIELDS} FROM requests r ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...args, pageSize, (page - 1) * pageSize)
    .all();
  return {
    items: (rows.results || []).map((row) => ({
      ...row,
      notes_count: Number(row.notes_count || 0),
      full_name: `${row.first_name} ${row.last_name}`,
    })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function exportRequests(env, user, query) {
  const { clause, args } = scopeFilters(user, query);
  const rows = await env.DB.prepare(
    `SELECT ${SELECT_FIELDS} FROM requests r ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT 5000`,
  )
    .bind(...args)
    .all();
  const notes = await env.DB.prepare(
    `SELECT request_id, author, body, created_at FROM request_notes ORDER BY id ASC LIMIT 20000`,
  ).all();
  const notesByRequest = new Map();
  for (const note of notes.results || []) {
    const list = notesByRequest.get(note.request_id) || [];
    list.push(`${note.created_at} ${note.author}: ${note.body}`);
    notesByRequest.set(note.request_id, list);
  }
  return (rows.results || []).map((row) => ({ ...row, notes: (notesByRequest.get(row.id) || []).join(" | ") }));
}

export async function getRequest(env, user, id) {
  const { clause, args } = scopeFilters(user, new URLSearchParams());
  const row = await env.DB.prepare(`SELECT ${SELECT_FIELDS}, r.archived FROM requests r ${clause} AND r.id = ?`)
    .bind(...args, id)
    .first();
  if (!row) return null;
  const notes = await env.DB.prepare(
    "SELECT id, author, body, created_at FROM request_notes WHERE request_id = ? ORDER BY id ASC LIMIT 200",
  )
    .bind(id)
    .all();
  return {
    ...row,
    notes_count: Number(row.notes_count || 0),
    full_name: `${row.first_name} ${row.last_name}`,
    notes: notes.results || [],
  };
}

export async function setRequestStatus(env, id, status) {
  const at = nowIso();
  await env.DB.prepare("UPDATE requests SET status = ?, updated_at = ? WHERE id = ? AND archived = 0").bind(status, at, id).run();
  return at;
}

export async function addRequestNote(env, id, author, body) {
  const noteId = await nextCounter(env, "note_id");
  const at = nowIso();
  await env.DB.prepare("INSERT INTO request_notes (id, request_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(noteId, id, author, body, at)
    .run();
  await env.DB.prepare("UPDATE requests SET updated_at = ? WHERE id = ?").bind(at, id).run();
  return { id: noteId, author, body, created_at: at };
}

export async function archiveRequest(env, id, hard = false) {
  if (hard) {
    await env.DB.prepare("DELETE FROM request_notes WHERE request_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM requests WHERE id = ?").bind(id).run();
    return;
  }
  await env.DB.prepare("UPDATE requests SET archived = 1, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
}

export async function requestExists(env, id) {
  const row = await env.DB.prepare("SELECT id FROM requests WHERE id = ?").bind(id).first();
  return Boolean(row);
}

/* --------------------------------------------------------------------- stats */
export async function getStats(env, user) {
  const { clause, args } = scopeFilters(user, new URLSearchParams());
  const byStatus = await env.DB.prepare(`SELECT r.status AS k, COUNT(*) AS c FROM requests r ${clause} GROUP BY r.status`).bind(...args).all();
  const byBranch = await env.DB.prepare(`SELECT r.branch AS k, COUNT(*) AS c FROM requests r ${clause} GROUP BY r.branch`).bind(...args).all();
  const byService = await env.DB.prepare(`SELECT r.service AS k, COUNT(*) AS c FROM requests r ${clause} GROUP BY r.service ORDER BY c DESC LIMIT 9`).bind(...args).all();
  const statuses = Object.fromEntries((byStatus.results || []).map((r) => [r.k, Number(r.c)]));
  const total = Object.values(statuses).reduce((a, b) => a + b, 0);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekly = await env.DB.prepare(`SELECT r.created_at AS d FROM requests r ${clause} AND r.created_at >= ?`).bind(...args, since).all();
  const days = {};
  for (let i = 6; i >= 0; i -= 1) days[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0;
  for (const row of weekly.results || []) {
    const key = String(row.d).slice(0, 10);
    if (key in days) days[key] += 1;
  }
  const recent = await env.DB.prepare(
    `SELECT ${SELECT_FIELDS} FROM requests r ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT 6`,
  )
    .bind(...args)
    .all();
  return {
    total,
    byStatus: statuses,
    byBranch: Object.fromEntries((byBranch.results || []).map((r) => [r.k, Number(r.c)])),
    byService: (byService.results || []).map((r) => ({ service: r.k, count: Number(r.c) })),
    week: Object.entries(days).map(([date, count]) => ({ date, count })),
    recent: (recent.results || []).map((row) => ({ ...row, full_name: `${row.first_name} ${row.last_name}` })),
    scope: isOwner(user) ? { branches: BRANCHES, services: SERVICES } : { branches: user.branches || [], services: user.services || [] },
  };
}

/* ----------------------------------------------------------------------- team */
function mapAdmin(row) {
  if (!row) return null;
  const parse = (v) => {
    try {
      const parsed = JSON.parse(v || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  return {
    id: Number(row.id),
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    branches: parse(row.branches),
    services: parse(row.services),
    canDelete: Boolean(Number(row.can_delete)),
    active: Boolean(Number(row.active)),
    createdAt: row.created_at,
    lastLogin: row.last_login || null,
  };
}

export async function listAdmins(env) {
  const rows = await env.DB.prepare(
    "SELECT id, username, full_name, role, branches, services, can_delete, active, created_at, last_login FROM admin_users ORDER BY id ASC",
  ).all();
  return (rows.results || []).map(mapAdmin);
}

export async function getAdminById(env, id) {
  const row = await env.DB.prepare("SELECT * FROM admin_users WHERE id = ?").bind(id).first();
  return mapAdmin(row);
}

export async function getAdminByUsername(env, username) {
  const row = await env.DB.prepare("SELECT * FROM admin_users WHERE LOWER(username) = ?").bind(String(username).toLowerCase()).first();
  return row || null;
}

export async function createAdmin(env, data) {
  const id = await nextCounter(env, "admin_id");
  await env.DB.prepare(
    `INSERT INTO admin_users (id, username, full_name, password_hash, role, branches, services, can_delete, active, created_at)
     VALUES (?, ?, ?, ?, 'lawyer', ?, ?, ?, 1, ?)`,
  )
    .bind(id, data.username, data.fullName, data.passwordHash, JSON.stringify(data.branches), JSON.stringify(data.services), data.canDelete ? 1 : 0, nowIso())
    .run();
  return getAdminById(env, id);
}

export async function updateAdmin(env, id, fields) {
  const sets = [];
  const args = [];
  if (fields.fullName !== undefined) { sets.push("full_name = ?"); args.push(fields.fullName); }
  if (fields.branches !== undefined) { sets.push("branches = ?"); args.push(JSON.stringify(fields.branches)); }
  if (fields.services !== undefined) { sets.push("services = ?"); args.push(JSON.stringify(fields.services)); }
  if (fields.canDelete !== undefined) { sets.push("can_delete = ?"); args.push(fields.canDelete ? 1 : 0); }
  if (fields.active !== undefined) { sets.push("active = ?"); args.push(fields.active ? 1 : 0); }
  if (fields.passwordHash !== undefined) { sets.push("password_hash = ?"); args.push(fields.passwordHash); }
  if (!sets.length) return getAdminById(env, id);
  await env.DB.prepare(`UPDATE admin_users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run();
  return getAdminById(env, id);
}

export async function deleteAdmin(env, id) {
  await env.DB.prepare("DELETE FROM admin_users WHERE id = ?").bind(id).run();
}

export async function touchLogin(env, id) {
  await env.DB.prepare("UPDATE admin_users SET last_login = ? WHERE id = ?").bind(nowIso(), id).run();
}

export async function usernameTaken(env, username) {
  const row = await env.DB.prepare("SELECT id FROM admin_users WHERE LOWER(username) = ?").bind(String(username).toLowerCase()).first();
  return Boolean(row);
}

/* ------------------------------------------------------------------- settings */
export async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

/* ---------------------------------------------------------------------- audit */
export async function audit(env, actor, action, entity, entityId, meta, ipHash) {
  try {
    const id = await nextCounter(env, "audit_id");
    await env.DB.prepare(
      "INSERT INTO audit_log (id, actor, action, entity, entity_id, meta, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, String(actor || "").slice(0, 80), String(action).slice(0, 60), String(entity || "").slice(0, 40), String(entityId || "").slice(0, 40), String(meta || "").slice(0, 500), String(ipHash || ""), nowIso())
      .run();
  } catch {
    /* auditing must never break the operation */
  }
}

export async function countRecentFailures(env, actor, ipHash, minutes = 15) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM audit_log WHERE action = 'login_failed' AND actor = ? AND ip_hash = ? AND created_at >= ?",
  )
    .bind(String(actor || "").slice(0, 80), String(ipHash || ""), since)
    .first();
  return Number(row && row.c ? row.c : 0);
}
