// Seeding logic (SPEC §9.3). Pure of I/O: takes a db handle and CSV text, validates each
// row, and replaces the products table's contents. The CLI wrapper is scripts/seed.js.

import { parseCsv } from './csv.js';

const REQUIRED_FIELDS = ['name', 'category', 'price', 'in_stock'];

/**
 * Validate one parsed CSV row. Returns null if valid, or a short reason string if not.
 * @param {Record<string, string>} row
 * @returns {string | null}
 */
export function validateRow(row) {
  for (const field of REQUIRED_FIELDS) {
    if (row[field] === undefined) return `missing column "${field}"`;
  }
  if (String(row.name).trim() === '') return 'empty name';
  if (String(row.category).trim() === '') return 'empty category';

  const price = Number(String(row.price).trim());
  if (!Number.isFinite(price) || price < 0) return `invalid price "${row.price}"`;

  const stock = String(row.in_stock).trim();
  if (stock !== '0' && stock !== '1') return `invalid in_stock "${row.in_stock}" (must be 0 or 1)`;

  return null;
}

/**
 * Replace all products with the valid rows from `csvText`. Idempotent: it clears the table
 * inside a transaction and re-inserts, so running it twice yields the same rows and ids.
 * Malformed rows are skipped (and reported via the optional `log` callback).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} csvText
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {{ inserted: number, skipped: number, total: number }}
 */
export function seedProducts(db, csvText, { log = () => {} } = {}) {
  const rows = parseCsv(csvText);
  const valid = [];
  let skipped = 0;

  rows.forEach((row, idx) => {
    const reason = validateRow(row);
    if (reason) {
      skipped++;
      log(`skip line ${idx + 2}: ${reason}`); // +2: header is line 1, data begins on line 2
      return;
    }
    valid.push({
      name: String(row.name).trim(),
      category: String(row.category).trim(),
      price: Number(String(row.price).trim()),
      in_stock: Number(String(row.in_stock).trim()),
    });
  });

  const replaceAll = db.transaction((items) => {
    db.prepare('DELETE FROM products').run();
    const insert = db.prepare(
      'INSERT INTO products (name, category, price, in_stock) VALUES (@name, @category, @price, @in_stock)',
    );
    for (const item of items) insert.run(item);
  });
  replaceAll(valid);

  return { inserted: valid.length, skipped, total: rows.length };
}
