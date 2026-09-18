// Product tools (SPEC §4.1, §4.2). Pure functions over a db handle — no Telegram, no LLM.
// These are the ONLY source of product facts the model is allowed to use.

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/** Split a free-text query into lowercased search tokens. */
function tokenize(query) {
  return String(query ?? '')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.toLowerCase());
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

/** Convert a raw DB row into the shape the model sees (in_stock as a boolean). */
function toResult(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    in_stock: row.in_stock === 1,
  };
}

/**
 * search_products (SPEC §4.1). Two-pass matching:
 *   1. All-tokens: products whose name+category contains EVERY token.
 *   2. Fallback (only if pass 1 is empty): products containing AT LEAST ONE token,
 *      ranked by how many distinct tokens matched (desc), then by name.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ query?: string, category?: string, limit?: number }} args
 * @returns {{ results: Array<object>, count: number }}
 */
export function searchProducts(db, { query = '', category, limit = DEFAULT_LIMIT } = {}) {
  const tokens = tokenize(query);
  const cap = clampLimit(limit);
  if (tokens.length === 0) return { results: [], count: 0 };

  const hasCategory = category !== undefined && String(category).trim() !== '';
  const rows = hasCategory
    ? db
        .prepare('SELECT id, name, category, price, in_stock FROM products WHERE category = ?')
        .all(String(category).trim())
    : db.prepare('SELECT id, name, category, price, in_stock FROM products').all();

  const haystackOf = (row) => `${row.name} ${row.category}`.toLowerCase();

  // Pass 1: every token present.
  let matched = rows.filter((row) => {
    const hay = haystackOf(row);
    return tokens.every((t) => hay.includes(t));
  });

  // Pass 2: partial fallback, ranked by number of tokens matched.
  if (matched.length === 0) {
    matched = rows
      .map((row) => {
        const hay = haystackOf(row);
        const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
        return { row, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name, 'he'))
      .map((x) => x.row);
  }

  const results = matched.slice(0, cap).map(toResult);
  return { results, count: results.length };
}

/**
 * get_product_details (SPEC §4.2). Fetch one product by numeric id.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ product_id?: number }} args
 * @returns {{ found: true, product: object } | { found: false }}
 */
export function getProductDetails(db, { product_id } = {}) {
  const id = Number(product_id);
  if (!Number.isInteger(id)) return { found: false };

  const row = db
    .prepare('SELECT id, name, category, price, in_stock FROM products WHERE id = ?')
    .get(id);

  return row ? { found: true, product: toResult(row) } : { found: false };
}
