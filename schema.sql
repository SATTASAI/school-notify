-- ใช้กับ D1: npx wrangler d1 execute school-notify-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT ',',   -- ",teacher,parent,"
  refs TEXT NOT NULL DEFAULT ',',    -- ",รหัสนักเรียน,รหัสครู,"
  label TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  roles TEXT NOT NULL DEFAULT 'all',
  refs TEXT,
  source TEXT,
  send_at INTEGER NOT NULL,
  status TEXT NOT NULL,              -- scheduled | queued | sending | done | cancelled
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, send_at);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  subscription_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  http_status INTEGER,
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_pending ON deliveries(notification_id, status);
