CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  color TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  statuses TEXT NOT NULL,
  position REAL NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE task_groups (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position REAL NOT NULL,
  collapsed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX task_groups_board ON task_groups(board_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES task_groups(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT '',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  due_time TEXT,
  tz TEXT NOT NULL DEFAULT 'UTC',
  notes TEXT NOT NULL DEFAULT '',
  recurrence TEXT,
  reminder_minutes INTEGER,
  reminder_at INTEGER,
  reminded_at INTEGER,
  completed_at INTEGER,
  position REAL NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tasks_board ON tasks(board_id);
CREATE INDEX tasks_parent ON tasks(parent_id);
CREATE INDEX tasks_owner ON tasks(owner_id);
CREATE INDEX tasks_reminder ON tasks(reminder_at) WHERE reminded_at IS NULL;

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL
);
CREATE INDEX checklist_task ON checklist_items(task_id);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_user ON push_subscriptions(user_id);

-- Holds the generated push-notification keys
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
