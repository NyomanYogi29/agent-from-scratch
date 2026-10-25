import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("./data", { recursive: true });

export const db = new Database("./data/memory_hmt.sqlite", { create: true });

export function initDB() {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS raw_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        date_key TEXT NOT NULL,
        week_key TEXT NOT NULL,
        month_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_raw_user_date ON raw_logs(user_id, date_key);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hmt_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        period_key TEXT NOT NULL,
        parent_period TEXT,
        summary TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, level, period_key)
    );

    CREATE INDEX IF NOT EXISTS idx_hmt_lookup ON hmt_nodes(user_id, level, parent_period);
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS hmt_nodes_fts USING fts5 (
        user_id UNINDEXED,
        level UNINDEXED,
        period_key,
        summary,
        content='hmt_nodes',
        content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS hmt_nodes_ai AFTER INSERT ON hmt_nodes BEGIN
        INSERT INTO hmt_nodes_fts(rowid, user_id, level, period_key, summary)
        VALUES (new.id, new.user_id, new.level, new.period_key, new.summary);
    END;
  `);

  console.log(`[DB] HMT Database & FTS5 initialized.`);
}

export function closeDatabase() {
  console.log(`[DB] Shutting down...`);
  db.close();
}
