import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { openDatabase } from '../src/data/db.js';
import { seedProducts, validateRow } from '../src/data/seed.js';
import { parseCsv } from '../src/data/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const memDb = () => openDatabase(':memory:');

// --- schema ---------------------------------------------------------------

test('openDatabase creates the products and conversations tables', () => {
  const db = memDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  assert.ok(tables.includes('products'));
  assert.ok(tables.includes('conversations'));
  db.close();
});

test('products table has exactly the columns from the spec', () => {
  const db = memDb();
  const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  assert.deepEqual(cols.sort(), ['category', 'id', 'in_stock', 'name', 'price']);
  db.close();
});

test('conversations table has the (chat_id, created_at) index', () => {
  const db = memDb();
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='conversations'")
    .all()
    .map((r) => r.name);
  assert.ok(indexes.includes('idx_conversations_chat_created'));
  db.close();
});

test('openDatabase is idempotent (safe to call on an existing db)', () => {
  const db = memDb();
  // Running the schema again must not throw.
  assert.doesNotThrow(() => openDatabase(':memory:'));
  db.close();
});

// --- seeding --------------------------------------------------------------

const SAMPLE = `name,category,price,in_stock
צבע קיר לבן מט 5 ליטר,צבעים,89,1
מברשת צביעה 5 ס״מ,מברשות,12,1
רולר צביעה 24 ס״מ,רולרים,24,0
`;

test('seedProducts inserts all valid rows', () => {
  const db = memDb();
  const res = seedProducts(db, SAMPLE);
  assert.equal(res.inserted, 3);
  assert.equal(res.skipped, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, 3);
  db.close();
});

test('re-seeding is idempotent (same rows and ids)', () => {
  const db = memDb();
  seedProducts(db, SAMPLE);
  const first = db.prepare('SELECT id, name, price, in_stock FROM products ORDER BY id').all();
  seedProducts(db, SAMPLE);
  const second = db.prepare('SELECT id, name, price, in_stock FROM products ORDER BY id').all();
  assert.deepEqual(second, first);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, 3);
  db.close();
});

test('seedProducts skips malformed rows but keeps valid ones', () => {
  const db = memDb();
  const csv = `name,category,price,in_stock
פריט תקין,צבעים,10,1
,צבעים,10,1
מחיר שגוי,צבעים,abc,1
מלאי שגוי,צבעים,10,5
פריט תקין שני,מברשות,5,0
`;
  const res = seedProducts(db, csv);
  assert.equal(res.inserted, 2);
  assert.equal(res.skipped, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, 2);
  db.close();
});

test('validateRow accepts a good row and flags each error kind', () => {
  assert.equal(validateRow({ name: 'x', category: 'y', price: '1', in_stock: '1' }), null);
  assert.match(validateRow({ name: ' ', category: 'y', price: '1', in_stock: '1' }), /name/);
  assert.match(validateRow({ name: 'x', category: '', price: '1', in_stock: '1' }), /category/);
  assert.match(validateRow({ name: 'x', category: 'y', price: '-5', in_stock: '1' }), /price/);
  assert.match(validateRow({ name: 'x', category: 'y', price: '1', in_stock: '2' }), /in_stock/);
});

// --- CSV parser -----------------------------------------------------------

test('parseCsv handles quoted fields with commas and doubled quotes', () => {
  const recs = parseCsv('name,category,price,in_stock\n"a, b","c""d",3,1\n');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].name, 'a, b');
  assert.equal(recs[0].category, 'c"d');
});

// --- shipped sample data --------------------------------------------------

test('the shipped data/products.csv is well-formed and fully valid', () => {
  const db = memDb();
  const csv = readFileSync(join(here, '..', 'data', 'products.csv'), 'utf8');
  const res = seedProducts(db, csv);
  assert.equal(res.skipped, 0, 'no rows should be skipped');
  assert.ok(res.inserted >= 15, 'expected a realistic number of sample products');
  const outOfStock = db.prepare('SELECT COUNT(*) AS n FROM products WHERE in_stock = 0').get().n;
  assert.ok(outOfStock >= 3, 'expected several out-of-stock items');
  db.close();
});
