-- ============================================================
-- راية القانون — مخطط قاعدة بيانات D1
-- Rayat Al Qanoon admin schema (Cloudflare D1 / SQLite)
-- Run with:  wrangler d1 execute rayat-alqanoon --remote --file=./migrations/0001_init.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, last INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests (
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
);
CREATE TABLE IF NOT EXISTS request_notes (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
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
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests (created_at);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON requests (phone);
CREATE INDEX IF NOT EXISTS idx_notes_request ON request_notes (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_lookup ON audit_log (action, actor, ip_hash, created_at);
