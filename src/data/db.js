// Database layer (SPEC §9). This is the ONLY module that opens the SQLite connection and
// defines the schema. Other layers receive a `db` handle and go through query helpers.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Idempotent schema: safe to run on every startup. `IF NOT EXISTS` means an existing
// database is left untouched, a fresh one gets the tables and index.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL,
  category TEXT    NOT NULL,
  price    REAL    NOT NULL,
  in_stock INTEGER NOT NULL CHECK (in_stock IN (0, 1))
);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL,
  role       TEXT    NOT NULL CHECK (role IN ('user', 'model')),
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_chat_created
  ON conversations (chat_id, created_at);
`;

/**
 * Open (or create) the SQLite database at `dbPath` and ensure the schema exists.
 * Use ':memory:' for tests. Creates the parent directory for file paths if needed.
 *
 * @param {string} dbPath
 * @returns {import('better-sqlite3').Database}
 */
export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // better read/write concurrency for a long-running bot
  db.exec(SCHEMA);
  return db;
}
