import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import * as sqliteVec from "sqlite-vec";

mkdirSync("./data", { recursive: true });

export const db = new Database("./data/memory.sqlite", { create: true });

export function initDB() {
  sqliteVec.load(db);

  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");

  db.run(`
    CREATE TABLE IF NOT EXISTS episodic_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      outcome TEXT NOT NULL,
      metadata TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_episodic_user ON episodic_memories(user_id);
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS episodic_vec USING vec0(
      memory_id INTEGER PRIMARY KEY,
      user_id TEXT PARTITION KEY,
      embedding float[1024] distance_metric=cosine
    );
  `);

  console.log(`[DB] SQLite & sqlite-vec initialized.`);
}

export function closeDatabase() {
  console.log(`[DB] Shutting down...`);
  db.close();
}
