import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../src/data/db.js';
import { searchProducts, getProductDetails } from '../src/tools/products.js';
import { getStoreInfo } from '../src/tools/store.js';
import { toolDeclarations } from '../src/tools/declarations.js';
import { createToolRegistry } from '../src/tools/index.js';

// Deterministic fixture DB (does not depend on the shipped CSV).
function fixtureDb() {
  const db = openDatabase(':memory:');
  const insert = db.prepare(
    'INSERT INTO products (name, category, price, in_stock) VALUES (?, ?, ?, ?)',
  );
  const rows = [
    ['מברשת צביעה 5 ס״מ', 'מברשות', 12, 1], // id 1
    ['מברשת צביעה 10 ס״מ', 'מברשות', 22, 0], // id 2
    ['רולר צביעה 24 ס״מ', 'רולרים', 24, 1], // id 3
    ['סרט בידוד שחור', 'טייפ', 6, 1], // id 4
  ];
  const tx = db.transaction(() => rows.forEach((r) => insert.run(...r)));
  tx();
  return db;
}

const names = (res) => res.results.map((r) => r.name);

// --- search_products: all-tokens pass -------------------------------------

test('search_products all-tokens: "מברשת 5 ס״מ" finds "מברשת צביעה 5 ס״מ" only', () => {
  const db = fixtureDb();
  const res = searchProducts(db, { query: 'מברשת 5 ס״מ' });
  assert.deepEqual(names(res), ['מברשת צביעה 5 ס״מ']);
  assert.equal(res.count, 1);
  // The 10cm brush is excluded because it lacks the token "5".
  assert.ok(!names(res).includes('מברשת צביעה 10 ס״מ'));
  db.close();
});

test('search_products all-tokens requires every token (AND semantics)', () => {
  const db = fixtureDb();
  // Both brushes share "מברשת" + "ס״מ"; only one also has "5".
  const res = searchProducts(db, { query: 'מברשת ס״מ' });
  assert.deepEqual(names(res).sort(), ['מברשת צביעה 10 ס״מ', 'מברשת צביעה 5 ס״מ']);
  db.close();
});

// --- search_products: partial fallback ------------------------------------

test('search_products partial fallback ranks by number of tokens matched', () => {
  const db = fixtureDb();
  // No product contains ALL of {מברשת, רולר, 5}, so pass 1 is empty and the fallback runs.
  //   "מברשת צביעה 5 ס״מ" matches מברשת + 5  -> score 2
  //   "מברשת צביעה 10 ס״מ" matches מברשת     -> score 1
  //   "רולר צביעה 24 ס״מ"  matches רולר       -> score 1
  //   "סרט בידוד שחור"     matches nothing    -> excluded
  const res = searchProducts(db, { query: 'מברשת רולר 5' });
  assert.equal(res.count, 3);
  assert.equal(res.results[0].name, 'מברשת צביעה 5 ס״מ'); // highest score first
  assert.ok(!names(res).includes('סרט בידוד שחור'));
  db.close();
});

test('search_products on an empty catalog returns count 0 (empty-DB resilience, SPEC §8)', () => {
  const db = openDatabase(':memory:'); // no products seeded
  assert.deepEqual(searchProducts(db, { query: 'צבע' }), { results: [], count: 0 });
  db.close();
});

test('search_products returns empty (not error) when nothing matches', () => {
  const db = fixtureDb();
  const res = searchProducts(db, { query: 'טלוויזיה פלזמה' });
  assert.deepEqual(res, { results: [], count: 0 });
  db.close();
});

test('search_products returns empty for a blank query', () => {
  const db = fixtureDb();
  assert.deepEqual(searchProducts(db, { query: '   ' }), { results: [], count: 0 });
  db.close();
});

// --- search_products: category + limit ------------------------------------

test('search_products honors the category filter', () => {
  const db = fixtureDb();
  const res = searchProducts(db, { query: 'צביעה', category: 'מברשות' });
  assert.deepEqual(names(res).sort(), ['מברשת צביעה 10 ס״מ', 'מברשת צביעה 5 ס״מ']);
  db.close();
});

test('search_products respects limit and caps it at 10', () => {
  const db = openDatabase(':memory:');
  const insert = db.prepare(
    'INSERT INTO products (name, category, price, in_stock) VALUES (?, ?, ?, ?)',
  );
  const tx = db.transaction(() => {
    for (let i = 0; i < 12; i++) insert.run(`פריט בדיקה ${i}`, 'בדיקה', 10, 1);
  });
  tx();

  assert.equal(searchProducts(db, { query: 'בדיקה', limit: 1 }).count, 1);
  assert.equal(searchProducts(db, { query: 'בדיקה', limit: 50 }).count, 10); // capped
  assert.equal(searchProducts(db, { query: 'בדיקה' }).count, 5); // default
  db.close();
});

test('search_products returns in_stock as a boolean', () => {
  const db = fixtureDb();
  const res = searchProducts(db, { query: 'מברשת ס״מ' });
  for (const r of res.results) assert.equal(typeof r.in_stock, 'boolean');
  db.close();
});

// --- get_product_details --------------------------------------------------

test('get_product_details returns the product for a valid id', () => {
  const db = fixtureDb();
  const res = getProductDetails(db, { product_id: 1 });
  assert.equal(res.found, true);
  assert.equal(res.product.name, 'מברשת צביעה 5 ס״מ');
  assert.equal(res.product.in_stock, true);
  db.close();
});

test('get_product_details returns found:false for an unknown id', () => {
  const db = fixtureDb();
  assert.deepEqual(getProductDetails(db, { product_id: 9999 }), { found: false });
  db.close();
});

test('get_product_details returns found:false for a non-integer id', () => {
  const db = fixtureDb();
  assert.deepEqual(getProductDetails(db, { product_id: 'abc' }), { found: false });
  db.close();
});

// --- get_store_info -------------------------------------------------------

test('get_store_info returns all facts when no topic is given', () => {
  const info = getStoreInfo();
  assert.deepEqual(Object.keys(info).sort(), ['address', 'general', 'hours', 'phone']);
});

test('get_store_info returns a single field for a known topic', () => {
  const info = getStoreInfo({ topic: 'phone' });
  assert.deepEqual(Object.keys(info), ['phone']);
});

test('get_store_info falls back to all facts for an unknown topic', () => {
  const info = getStoreInfo({ topic: 'weather' });
  assert.deepEqual(Object.keys(info).sort(), ['address', 'general', 'hours', 'phone']);
});

// --- declarations + registry ----------------------------------------------

test('toolDeclarations describes exactly the three tools', () => {
  const declNames = toolDeclarations.map((d) => d.name).sort();
  assert.deepEqual(declNames, ['get_product_details', 'get_store_info', 'search_products']);
  const search = toolDeclarations.find((d) => d.name === 'search_products');
  assert.deepEqual(search.parameters.required, ['query']);
});

test('createToolRegistry dispatches by tool name', () => {
  const db = fixtureDb();
  const tools = createToolRegistry(db);
  assert.deepEqual(Object.keys(tools).sort(), [
    'get_product_details',
    'get_store_info',
    'search_products',
  ]);
  const res = tools.search_products({ query: 'רולר' });
  assert.equal(res.results[0].name, 'רולר צביעה 24 ס״מ');
  db.close();
});
