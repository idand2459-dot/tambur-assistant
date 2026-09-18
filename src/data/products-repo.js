// Product queries (SPEC §9). All product SQL lives in the data layer so the tools layer
// never runs SQL directly (AGENTS §1). Tools call these helpers and do their own
// matching/ranking/shaping on the returned rows.

const COLUMNS = 'id, name, category, price, in_stock';

/** @param {import('better-sqlite3').Database} db */
export function getAllProducts(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM products`).all();
}

/** @param {import('better-sqlite3').Database} db */
export function getProductsByCategory(db, category) {
  return db.prepare(`SELECT ${COLUMNS} FROM products WHERE category = ?`).all(category);
}

/** @param {import('better-sqlite3').Database} db  @returns {object | undefined} */
export function getProductById(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM products WHERE id = ?`).get(id);
}

/** Number of products in the catalog (used at startup to warn on an empty DB). */
export function countProducts(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
}
