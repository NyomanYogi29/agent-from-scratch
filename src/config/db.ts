import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("./data", { recursive: true });

export const db = new Database("./data/memory.sqlite", { create: true });

export function initDB() {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");

  console.log(`[DB] SQLite database initialized.`);
}

export function closeDatabase() {
  console.log(`[DB] Shutting down...`);
  db.close();
}
