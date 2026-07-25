const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/cron-manager.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('http', 'shell')),
    target TEXT NOT NULL,          -- URL for http, command for shell
    timeout_ms INTEGER DEFAULT 30000,
    retries INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    expected_status INTEGER DEFAULT 200,   -- http jobs only; ignored for shell jobs
    keyword_match TEXT,                    -- http jobs only; response body must contain this text if set
    public_status INTEGER DEFAULT 0,       -- 1 = show on the public /status page
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed')),
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    duration_ms INTEGER,
    output TEXT,
    error TEXT,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);
  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
`);

// Safe migration for databases created before expected_status / keyword_match existed
const existingCols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
if (!existingCols.includes('expected_status')) {
  db.exec('ALTER TABLE jobs ADD COLUMN expected_status INTEGER DEFAULT 200');
}
if (!existingCols.includes('keyword_match')) {
  db.exec('ALTER TABLE jobs ADD COLUMN keyword_match TEXT');
}
if (!existingCols.includes('public_status')) {
  db.exec('ALTER TABLE jobs ADD COLUMN public_status INTEGER DEFAULT 0');
}

module.exports = db;
